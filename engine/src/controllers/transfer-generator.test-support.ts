// What the Transfer Generator's two tests share (DL-59): the test world's pins, and the `transfers`
// phase watched. `transfer-generator.test.ts` runs the phase alone on a hundred seeds' worlds, in
// `npm test`; `transfer-generator.harness.test.ts` plays a hundred seeds for twenty years, in
// `npm run harness` (DL-230). Every run of the watched phase is bracketed by a snapshot of the
// player's Guild, its Guildmaster and its Heroes, and the Transfers it makes are the Generator's, told
// from the afternoon's by the phase that made them. One pin besides the Generator's own numbers:
// every Encounter's Check asks 0.15 of the Quest's difficulty, under which the test content's Rivals
// live off their Quests as the core's do (DL-58).

import type { EngineDeps } from '../config.js';
import type { DispositionKey } from '../content-types.js';
import type { Guild, GuildId, Guildmaster, World } from '../document.js';
import type { Phase } from '../phases/phase.js';
import { phases } from '../pipeline.js';
import { dispositionOf, playerGuild } from '../selectors.js';
import { testDeps, withEncounters } from '../world.test-support.js';

export const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
export const pins = {
  rivalCount: 4,
  rivalRosterMin: 4,
  rivalRosterMax: 8,
  transferGeneratorEveryDays: 7,
  transferGeneratorChance: 0.5,
};
export const deps: EngineDeps = testDeps(pins, withEncounters({ difficultyFactor: 0.15 }));

export const transfersPhase = phases.find((phase) => phase.name === 'transfers') as Phase;
const generatorRun = transfersPhase.run;

/** The Rivals in play. */
export const rivalsInPlay = (world: World): Guild[] =>
  Object.values(world.guilds).filter((guild) => guild.foldedOnTurn === null && dispositionOf(guild) !== null);

/** What a run of the phase may not change: the player's Guild, its Guildmaster and its Heroes, as JSON. */
function playerRows(world: World): string {
  const player = playerGuild(world) as Guild;
  return JSON.stringify([
    player,
    world.guildmasters[player.guildmasterId],
    player.rosterIds.map((heroId) => world.heroes[heroId]),
  ]);
}

/** A Transfer the Generator made, with both Rosters' sizes just after it and both Dispositions. */
interface GeneratorTransfer {
  turn: number;
  from: { id: GuildId; size: number; disposition: DispositionKey | null };
  to: { id: GuildId; size: number; disposition: DispositionKey | null };
}

/** What the phase did in a seed. */
export interface Watch {
  seed: string;
  playerId: GuildId;
  /** Runs of the phase, one each night whether or not it is the Generator's. */
  runs: number;
  /** Runs after which the player's rows differed from before. */
  playerChanged: number;
  /** The Generator's Transfers. */
  transfers: GeneratorTransfer[];
}

/**
 * The phase's rule wrapped to watch it: the player's rows before and after each run, and the Rosters'
 * sizes as each of its Transfers is made, replayed from the sizes before the run.
 */
function watching(watch: Watch): Phase['run'] {
  return (world, ctx) => {
    const before = playerRows(world);
    const sizes = new Map(Object.values(world.guilds).map((guild) => [guild.id, guild.rosterIds.length]));
    const events = generatorRun(world, ctx);
    watch.runs += 1;
    if (playerRows(world) !== before) watch.playerChanged += 1;
    for (const event of events) {
      if (event.type !== 'hero.transferred') continue;
      const { fromGuildId, toGuildId } = event.payload;
      sizes.set(fromGuildId, (sizes.get(fromGuildId) ?? 0) - 1);
      sizes.set(toGuildId, (sizes.get(toGuildId) ?? 0) + 1);
      const side = (id: GuildId) => ({ id, size: sizes.get(id) ?? 0, disposition: dispositionOf(world.guilds[id] as Guild) });
      watch.transfers.push({ turn: event.turn, from: side(fromGuildId), to: side(toGuildId) });
    }
    return events;
  };
}

/** A new, empty watch for `world`'s seed. */
export const newWatch = (seed: string, world: World): Watch => ({
  seed,
  playerId: (playerGuild(world) as Guild).id,
  runs: 0,
  playerChanged: 0,
  transfers: [],
});

/**
 * Puts the phase's rule, wrapped to fill `watch`, in the pipeline's place for it until `unwatchPhase`,
 * and returns `watch`. A plain wrapper rather than a spy: a spy keeps every call's arguments, and with
 * them every seed's History, which a hundred twenty-year seeds do not fit.
 */
export function watchPhase<W extends Watch>(watch: W): W {
  transfersPhase.run = watching(watch);
  return watch;
}

/** Puts the phase's own rule back. */
export function unwatchPhase(): void {
  transfersPhase.run = generatorRun;
}

/** The player idle and rich, its Guildmaster young enough not to retire in the years played. */
export function stillPlayer(world: World, with_: EngineDeps): void {
  const player = playerGuild(world) as Guild;
  player.wealth = 1_000_000_000;
  (world.guildmasters[player.guildmasterId] as Guildmaster).ageAtEntry = with_.config.guildmasterStartingAgeMin;
}

/** A Rival's appetite by its Disposition, in `with_`'s content. */
const appetiteOf = (with_: EngineDeps, disposition: DispositionKey | null): number =>
  disposition === null ? Number.NaN : (with_.content.dispositions[disposition]?.transferAppetite ?? Number.NaN);

/**
 * What every Transfer the Generator makes must be, in any world: between two Rivals, the one taking
 * the Hero with the greater appetite or, of two alike, the tie-break's; the Roster it takes from left
 * at `rivalRosterMin` or above and the one it gives to at `rivalRosterMax` or below, so that its own
 * moves never take a Roster out of the generation range. The bound at the top is the Generator's
 * alone, no cap on a Roster, kept for now only to constrain testing load, to be removed (backlog,
 * DL-185). Each Transfer that breaks it is a problem named by its seed and Turn; a test expects none.
 */
export function ruleProblems(watch: Watch, with_: EngineDeps): string[] {
  const { rivalRosterMin: min, rivalRosterMax: max } = with_.config;
  return watch.transfers.flatMap((transfer) => {
    const where = `${watch.seed} Turn ${transfer.turn}`;
    const problems: string[] = [];
    if (transfer.from.id === watch.playerId || transfer.to.id === watch.playerId) problems.push(`${where}: the player's Guild`);
    if (!(appetiteOf(with_, transfer.to.disposition) >= appetiteOf(with_, transfer.from.disposition))) problems.push(`${where}: to the lesser appetite`);
    if (transfer.from.size < min) problems.push(`${where}: a Roster left at ${transfer.from.size}, under ${min}`);
    if (transfer.to.size > max) problems.push(`${where}: a Roster taken to ${transfer.to.size}, over ${max}`);
    return problems;
  });
}
