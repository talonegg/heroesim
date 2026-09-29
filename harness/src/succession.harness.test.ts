import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { validatingEveryTurn } from './play.js';
import { machine, reportPath, writeReport } from './report.js';
import { seedCount, seedNames, yearCount } from './seeds.js';
import { defaultProbeSeedCount, defaultProbeYears, probeInParallel, probeName, successionProbeAge, successionReport } from './succession.js';
import { defaultWorkers } from './sweep.js';

// M9-F1's Succession probe (DL-113 item 7), collected only by the harness-run project and run only
// when HEROESIM_PROBE names it (`HEROESIM_PROBE=succession npm run harness`), in place of the
// milestone's creation and play runs: set the first Rival's Guildmaster, in id order, to 50 at
// founding, play HEROESIM_SEEDS games (50 by default) from `seed-0001` for HEROESIM_YEARS years (12
// by default) under the automatic policy, the core content and `defaultConfig`, shared among child
// processes; with HEROESIM_VALIDATE=1, validate after every advance; and write the Successions, the
// Rival across its Succession, the Regard held for it and the folds after to
// harness/reports/m9-succession-<date>.md. M9-F6 runs it and records it in its DL.

const probing = probeName() === 'succession';
const seeds = seedNames(seedCount(process.env.HEROESIM_SEEDS, defaultProbeSeedCount));
const years = yearCount(process.env.HEROESIM_YEARS, defaultProbeYears);
const validate = validatingEveryTurn();

test.runIf(probing)(
  `${seeds.length} games of ${years} years with the first Rival's Guildmaster at ${successionProbeAge}`,
  { timeout: 24 * 60 * 60_000 },
  async () => {
    const startedAt = new Date();
    const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };
    const workers = Math.min(defaultWorkers(), seeds.length);

    const games = await probeInParallel(seeds, deps, { years, validate, workers, age: successionProbeAge });
    const report = successionReport(games, { deps, years, age: successionProbeAge, machine: machine(), startedAt, workers, validated: validate });
    const path = writeReport(reportPath('m9-succession', startedAt), report);

    // The report is written before anything is asserted, so a failing run leaves it to read.
    const succeeded = games.filter((game) => game.after !== null).length;
    console.log(`${seeds.length} games: the first Rival succeeded in ${succeeded}\nReport: ${path}`);
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
