// `equip --hero <id> --item <id> | --stack <id>` and `unequip --hero <id> --slot <slot>` (M5-S2,
// DL-49): the player's Guild puts gear from its holding on one of its Heroes, or takes it back. What
// the commands do to an open save and what they print; `main.ts` opens the save, and writes it back
// only when the command succeeds.
//
// The CLI holds no rule: the engine's `equip` and `unequip` decide, a refusal is their typed
// rejection in the refusals' words (ADR-0003, DL-240), and the Stats printed are the engine's
// `effectiveStats`.

import {
  applyAction,
  effectiveStats,
  playerGuild,
  type EngineDeps,
  type EngineEvent,
  type Hero,
  type HeroId,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import type { Command } from '../args.js';
import { narrateLine, refusalLine } from '../namer.js';
import type { CommandOutcome } from './outcome.js';

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
  return [...events.map((event) => narrateLine(event, deps.content, deps.config)), statChanges(heroId, before, after, deps)];
}

/** Equips a Hero of the player's Guild under the save's own deps, and says what moved and what it changed. */
export function equipGear(
  command: Extract<Command, { name: 'equip' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const setting = { world: document.world, content: deps.content, calendar: deps.config };
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: refusalLine({ action: 'equip', reason: 'no-player-guild' }, setting) };
  const result = applyAction(document, { kind: 'equip', guildId: guild.id, heroId: command.hero, ...command.gear }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };
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
  const setting = { world: document.world, content: deps.content, calendar: deps.config };
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: refusalLine({ action: 'unequip', reason: 'no-player-guild' }, setting) };
  const result = applyAction(document, { kind: 'unequip', guildId: guild.id, heroId: command.hero, slot: command.slot }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };
  return {
    ok: true,
    document: result.document,
    lines: said(result.events, command.hero, document.world, result.document.world, deps),
  };
}
