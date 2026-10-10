import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { machine, print, reportPath, writeReport } from './report.js';
import { seedNames } from './seeds.js';
import { runSettings } from './settings.js';
import { probeInParallel, successionProbeAge, successionReport } from './succession.js';

// The Succession probe (DL-113 item 7), collected only by the harness-run project and run only
// when HEROESIM_PROBE names it (`npm run harness -- succession`), in place of the milestone's creation
// and play runs: set the first Rival's Guildmaster, in id order, to 50 at founding, play HEROESIM_SEEDS
// games (50 by default) from `seed-0001` for HEROESIM_YEARS years (12 by default) under the automatic
// policy, the core content and `defaultConfig`, each in a child process of its own, HEROESIM_WORKERS
// at once (DL-186 item 20: the sweep's queue); with HEROESIM_VALIDATE=1, validate after every advance; and
// write the Successions, the Rival across its Succession, the Regard held for it and the folds after
// to harness/reports/succession-<date>.md.

const settings = runSettings();
const probe = settings.run === 'succession' ? settings : null;
const seeds = seedNames(probe?.games ?? 0);

test.runIf(probe !== null)(
  `${seeds.length} games of ${probe?.years ?? 0} years with the first Rival's Guildmaster at ${successionProbeAge}`,
  { timeout: 24 * 60 * 60_000 },
  async () => {
    if (probe === null) return;
    const { years, validate } = probe;
    const startedAt = new Date();
    const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };
    const workers = Math.min(probe.workers, seeds.length);

    const games = await probeInParallel(seeds, deps, { years, validate, workers, age: successionProbeAge });
    const report = successionReport(games, { deps, years, age: successionProbeAge, machine: machine(), startedAt, workers, validated: validate });
    const path = writeReport(reportPath('succession', startedAt), report);

    // The report is written before anything is asserted, so a failing run leaves it to read.
    const succeeded = games.filter((game) => game.after !== null).length;
    print(`${seeds.length} games: the first Rival succeeded in ${succeeded}\nReport: ${path}`);
    expect(games).toHaveLength(seeds.length);
    expect(games.filter((game) => game.invalid).map((game) => game.seed)).toEqual([]);
    expect(games.reduce((sum, game) => sum + game.refusals, 0)).toBe(0);
    for (const game of games) {
      const own = game.successions.filter((it) => it.guildId === game.rivalId);
      const inPlay = game.rivalFoldedOnTurn === null || game.rivalFoldedOnTurn >= game.retirementTurn;
      expect(own.length, game.seed).toBe(inPlay && game.turnsPlayed >= game.retirementTurn ? 1 : 0);
    }
  },
);
