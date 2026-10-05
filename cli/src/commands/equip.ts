// `equip --hero <id> --item <id> | --stack <id>` and `unequip --hero <id> --slot <slot>` (M5-S2,
// DL-49): the player's Guild puts gear from its holding on one of its Heroes, or takes it back. What
// the commands do to an open save and what they print; `main.ts` opens the save, and writes it back
// only when the command succeeds.
//
// The CLI holds no rule: the engine's `equip` and `unequip` decide, a refusal is their typed
// rejection put into words here (ADR-0003), and the Stats printed are the engine's `effectiveStats`.

import {
  applyAction,
  effectiveStats,
  playerGuild,
  type ContentSet,
  type EngineDeps,
  type EngineEvent,
  type EquipRejection,
  type Hero,
  type HeroId,
  type UnequipRejection,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import type { Command } from '../args.js';
import { narrate } from '../narrate.js';
import { nameIn, rowIn } from '../render.js';
import type { CommandOutcome } from './outcome.js';

/** A Hero by name and id, or the id alone when the save has no such Hero. */
function heroCalled(world: World, heroId: HeroId): string {
  const hero = rowIn(world.heroes, heroId);
  return hero === undefined ? heroId : `${hero.name} (${heroId})`;
}

/** An Item or stack of `world` by content's name and its id, or the id alone. */
function itemCalled(world: World, id: string, content: ContentSet): string {
  const row = rowIn<{ definitionKey: string }>(world.items, id) ?? rowIn<{ definitionKey: string }>(world.stacks, id);
  return row === undefined ? id : `${nameIn(content.items, row.definitionKey)} (${id})`;
}

/** Why a Hero's gear cannot be changed, after their name. */
const unavailableWords = {
  dead: 'is dead',
  retired: 'has retired',
  'in-party': 'is away on a Quest, and their gear is with them',
} as const;

/** `equip`'s rejection in words. */
function explainEquip(rejection: EquipRejection, guildName: string, world: World, content: ContentSet): string {
  switch (rejection.reason) {
    case 'guild-folded':
      return `${guildName} has folded and equips no one.`;
    case 'hero-not-on-roster':
      return `${heroCalled(world, rejection.heroId)} is not on ${guildName}'s Roster (show roster).`;
    case 'hero-unavailable':
      return `${heroCalled(world, rejection.heroId)} ${unavailableWords[rejection.because]}.`;
    case 'not-held-by-guild': {
      const id = rejection.itemId ?? rejection.stackId ?? '';
      return `${guildName} does not hold ${id}: show roster lists what it holds.`;
    }
    case 'not-gear':
      return `${nameIn(content.items, rejection.definitionKey)} is not gear, and is carried in no slot.`;
    case 'wrong-slot': {
      const name = nameIn(content.items, rejection.definitionKey);
      return rejection.slot === rejection.gearSlot
        ? `${name} is ${rejection.gearSlot} gear, and Heroes have no ${rejection.gearSlot} slot in this game.`
        : `${name} goes in the ${rejection.gearSlot} slot, not the ${rejection.slot} slot.`;
    }
    case 'slot-occupied':
      return (
        `${heroCalled(world, rejection.heroId)}'s ${rejection.slot} slot holds ` +
        `${itemCalled(world, rejection.occupant, content)}: unequip it first.`
      );
  }
}

/** `unequip`'s rejection in words. */
function explainUnequip(rejection: UnequipRejection, guildName: string, world: World): string {
  switch (rejection.reason) {
    case 'guild-folded':
      return `${guildName} has folded and unequips no one.`;
    case 'hero-not-on-roster':
      return `${heroCalled(world, rejection.heroId)} is not on ${guildName}'s Roster (show roster).`;
    case 'hero-unavailable':
      return `${heroCalled(world, rejection.heroId)} ${unavailableWords[rejection.because]}.`;
    case 'slot-empty':
      return `${heroCalled(world, rejection.heroId)}'s ${rejection.slot} slot is empty.`;
  }
}

/**
 * The effective Stats of `heroId` that differ between `before` and `after`, in content order:
 * `Weaponry 8 to 10, Strength 9 to 10`, or a line saying none changed.
 */
function statChanges(heroId: HeroId, before: World, after: World, deps: EngineDeps): string {
  const was = effectiveStats(before.heroes[heroId] as Hero, before, deps.content);
  const now = effectiveStats(after.heroes[heroId] as Hero, after, deps.content);
  const changes = Object.values(deps.content.stats)
    .filter((stat) => stat.owner === 'hero' && was[stat.key] !== now[stat.key])
    .map((stat) => `${stat.name} ${was[stat.key]} to ${now[stat.key]}`);
  return changes.length === 0 ? 'No effective Stat changed.' : `Effective Stats: ${changes.join(', ')}.`;
}

/** The lines a successful command prints: each event in the CLI's words, then the Stats that changed. */
function said(events: readonly EngineEvent[], heroId: HeroId, before: World, after: World, deps: EngineDeps): string[] {
  return [...events.map((event) => narrate(event, deps.content)), statChanges(heroId, before, after, deps)];
}

/** Equips a Hero of the player's Guild under the save's own deps, and says what moved and what it changed. */
export function equipGear(
  command: Extract<Command, { name: 'equip' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: "The save has no player's Guild." };
  const result = applyAction(document, { kind: 'equip', guildId: guild.id, heroId: command.hero, ...command.gear }, deps);
  if (!result.ok) return { ok: false, problem: explainEquip(result.rejection, guild.name, document.world, deps.content) };
  return {
    ok: true,
    document: result.document,
    lines: said(result.events, command.hero, document.world, result.document.world, deps),
  };
}

/** Unequips a slot of a Hero of the player's Guild under the save's own deps, and says what moved and what it changed. */
export function unequipGear(
  command: Extract<Command, { name: 'unequip' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: "The save has no player's Guild." };
  const result = applyAction(document, { kind: 'unequip', guildId: guild.id, heroId: command.hero, slot: command.slot }, deps);
  if (!result.ok) return { ok: false, problem: explainUnequip(result.rejection, guild.name, document.world) };
  return {
    ok: true,
    document: result.document,
    lines: said(result.events, command.hero, document.world, result.document.world, deps),
  };
}
