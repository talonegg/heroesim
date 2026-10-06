import { loadContent } from '@heroesim/content/node';
import { copyWorld, defaultConfig, serialise, writeOnce, type EngineDeps, type World } from '@heroesim/engine';
import { createProbe } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { playGame } from './play.js';

// v1.1.6-S17 (ADR-0011, DL-203): nothing writes a write-once row once the per-Turn copy has frozen
// and shared it. Games played under the automatic policy, every action through `applyAction`, with
// the probe module applying an effect of each kind on its nights: a write to a frozen row throws in
// the engine's strict-mode modules, so a game that plays to its end wrote none. A short year, so
// Heroes age, retire and die, the pool's Heroes leave it, and Guildmasters retire, within a test; and
// a Rival in debt, so a Guild folds.

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig, turnsPerYear: 21 }, content, modules: [createProbe({ probeFireBelow: 0.5 })] };
const tables = ['heroes', 'guildmasters', 'guilds'] as const;

/** The write-once rows of `world`, each with its table and id. */
const writeOnceRows = (world: World): { table: (typeof tables)[number]; id: string; row: object }[] =>
  tables.flatMap((table) =>
    Object.entries(world[table] as Record<string, never>)
      .filter(([, row]) => writeOnce[table](row))
      .map(([id, row]) => ({ table, id, row: row as object })),
  );

describe('the write-once rows (ADR-0011)', () => {
  test('nothing writes one: games under the automatic policy and the probe module share each, frozen, from Turn to Turn', { timeout: 120_000 }, () => {
    const shared: Record<(typeof tables)[number], number> = { heroes: 0, guildmasters: 0, guilds: 0 };
    let copiesChecked = 0;
    for (const seed of ['write-once-a', 'write-once-b', 'write-once-c']) {
      const game = playGame(seed, deps, {
        years: 40,
        // Validated after every `advance`: no Hero out of play on a Roster or in a Party (`departed-hero-in-play`).
        validate: true,
        // A Rival deep in debt, so that its Guild folds and its row is written once too.
        prepare: (document) => {
          const rival = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'rival');
          if (rival !== undefined) rival.wealth = -1_000_000;
        },
        afterAdvance: (before, after) => {
          // Every row written once in the world `advance` was given is frozen, and the same row in the world it gave.
          for (const { table, id, row } of writeOnceRows(before.world)) {
            expect(Object.isFrozen(row)).toBe(true);
            const now = (after.world[table] as Record<string, object>)[id];
            if (now !== undefined) expect(now).toBe(row);
            shared[table] += 1;
          }
          // And the copy is the one structuredClone makes, to the save's text, every 50th Turn.
          if (after.world.turn % 50 === 0) {
            const { meta, history } = after;
            expect(serialise({ meta, world: copyWorld(after.world), history })).toBe(serialise({ meta, world: structuredClone(after.world), history }));
            copiesChecked += 1;
          }
        },
      });
      expect(game.refusals).toEqual([]);
      expect(game.invalid).toBeNull();
      expect(game.document.history.byType['probe.fired']?.length ?? 0).toBeGreaterThan(0);
    }
    expect(shared.heroes).toBeGreaterThan(0);
    expect(shared.guildmasters).toBeGreaterThan(0);
    expect(shared.guilds).toBeGreaterThan(0);
    expect(copiesChecked).toBeGreaterThan(0);
  });
});
