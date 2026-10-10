import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { commandLine, defaultBaseline, halfTheProcessors, probeNames, profileNames, runSettings, settingsSet, type Env, type RunSettings } from './settings.js';
import { readGateSpec } from './gate.js';

// DL-186 item 13: every `HEROESIM_*` variable a harness run reads, through one parser.

const half = Math.max(1, Math.floor(availableParallelism() / 2));

/** The settings of `env`, which must be of `run`. */
function settingsOf<Run extends RunSettings['run']>(run: Run, env: Env): Extract<RunSettings, { run: Run }> {
  const settings = runSettings(env);
  expect(settings.run).toBe(run);
  return settings as Extract<RunSettings, { run: Run }>;
}

describe('the milestone run', () => {
  test("plays the milestone's run when nothing is set, on half the processors, the replay played and nothing validated", () => {
    const settings = settingsOf('milestone', {});
    expect(settings).toEqual({
      run: 'milestone',
      profile: null,
      milestone: 'play',
      expect: null,
      worlds: expect.any(Number),
      games: expect.any(Number),
      years: expect.any(Number),
      workers: half,
      validate: false,
      replay: true,
      drafts: null,
      config: {},
      policy: {},
      baseline: defaultBaseline,
    });
    for (const count of [settings.worlds, settings.games, settings.years]) {
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(1);
    }
    expect(halfTheProcessors()).toBe(half);
  });

  test('reads each variable, blanks as unset and spaces trimmed', () => {
    const settings = settingsOf('milestone', {
      HEROESIM_MILESTONE: ' v1.1.6-s2 ',
      HEROESIM_SEEDS: '7',
      HEROESIM_YEARS: '2',
      HEROESIM_WORKERS: ' 8 ',
      HEROESIM_VALIDATE: 'TRUE',
      HEROESIM_REPLAY: '0',
      HEROESIM_DRAFTS: 'docs/quests/drafts',
      HEROESIM_CONFIG: '{"checkVariance":0.4,"marketSize":14}',
      HEROESIM_POLICY: '{"rosterLimit":10,"buildWealthMultiple":2.5}',
      HEROESIM_EXPECT: 'E7AE171001C2C885586893B760678089A7400672568C0F53FA83713E6369F369',
      HEROESIM_HARNESS: '1',
      HEROESIM_BASELINE: ' v1.2.0-s2-gate-2026-10-10 ',
    });
    expect(settings).toMatchObject({
      baseline: 'v1.2.0-s2-gate-2026-10-10',
      milestone: 'v1.1.6-s2',
      worlds: 7,
      games: 7,
      years: 2,
      workers: 8,
      validate: true,
      replay: false,
      drafts: 'docs/quests/drafts',
      config: { checkVariance: 0.4, marketSize: 14 },
      policy: { rosterLimit: 10, buildWealthMultiple: 2.5 },
      expect: 'e7ae171001c2c885586893b760678089a7400672568c0f53fa83713e6369f369',
    });
    expect(runSettings({ HEROESIM_SEEDS: ' ', HEROESIM_VALIDATE: '', HEROESIM_REPLAY: ' ', HEROESIM_CONFIG: '  ' })).toEqual(runSettings({}));
    expect(settingsOf('milestone', { HEROESIM_VALIDATE: 'false', HEROESIM_REPLAY: 'true' })).toMatchObject({ validate: false, replay: true });
    // The Targets' baseline (DL-259): the open release's baseline gate, with every counter, unless named (DL-270); none when `none`.
    expect(defaultBaseline).toBe('v1.2.0-s2-gate-2026-10-10');
    expect(settingsOf('milestone', { HEROESIM_BASELINE: 'NONE' })).toMatchObject({ baseline: null });
  });
});

describe('the profiles', () => {
  test("the gate plays the Gate's games and years, and neutral a process a game (DL-186 items 13 and 30, DL-231 Q13), the play sweep alone", () => {
    const { games, years } = readGateSpec().run;
    expect(profileNames).toEqual(['gate', 'neutral']);
    expect(settingsOf('milestone', { HEROESIM_PROFILE: 'gate', HEROESIM_MILESTONE: 'v1.1.6-s3' })).toMatchObject({ profile: 'gate', games, years, replay: true, validate: false });
    const neutral = settingsOf('milestone', { HEROESIM_PROFILE: ' Neutral ' });
    expect(neutral.profile).toBe('neutral');
    expect(neutral.workers).toBe(neutral.games);
  });

  test('neutral plays one process a seed up to 10, more seeds sharing the 10, unless HEROESIM_WORKERS says otherwise (DL-231 Q13, DL-251)', () => {
    expect(settingsOf('milestone', { HEROESIM_PROFILE: 'neutral', HEROESIM_SEEDS: '4', HEROESIM_YEARS: '2' })).toMatchObject({ games: 4, workers: 4 });
    expect(settingsOf('milestone', { HEROESIM_PROFILE: 'neutral', HEROESIM_SEEDS: '10' })).toMatchObject({ games: 10, workers: 10 });
    expect(settingsOf('milestone', { HEROESIM_PROFILE: 'neutral', HEROESIM_SEEDS: '12' })).toMatchObject({ games: 12, workers: 10 });
    expect(settingsOf('milestone', { HEROESIM_PROFILE: 'neutral', HEROESIM_SEEDS: '50' })).toMatchObject({ games: 50, workers: 10 });
    expect(settingsOf('milestone', { HEROESIM_PROFILE: 'neutral', HEROESIM_WORKERS: '8' })).toMatchObject({ games: 10, workers: 8 });
    expect(settingsOf('milestone', { HEROESIM_PROFILE: 'neutral', HEROESIM_SEEDS: '50', HEROESIM_WORKERS: '3' })).toMatchObject({ games: 50, workers: 3 });
    expect(settingsOf('milestone', { HEROESIM_PROFILE: 'gate', HEROESIM_SEEDS: '12' })).toMatchObject({ games: 12, workers: 8 });
  });

  test('a variable set overrides its profile', () => {
    expect(settingsOf('milestone', { HEROESIM_PROFILE: 'gate', HEROESIM_SEEDS: '4', HEROESIM_YEARS: '2', HEROESIM_WORKERS: '2', HEROESIM_REPLAY: '0' })).toMatchObject({
      profile: 'gate',
      games: 4,
      years: 2,
      workers: 2,
      replay: false,
    });
  });

  test('the probes and the module run keep their own kinds and settings', () => {
    const count = expect.any(Number);
    expect(runSettings({ HEROESIM_PROBE: 'succession' })).toEqual({ run: 'succession', games: count, years: count, workers: half, validate: false });
    expect(runSettings({ HEROESIM_PROBE: 'estimate' })).toEqual({ run: 'estimate', milestone: 'estimate', samples: count, resolutions: count });
    expect(runSettings({ HEROESIM_PROBE: 'calibrate' })).toEqual({ run: 'calibrate', drafts: null, config: {}, parties: count, spotSeeds: count, tune: null, flat: 0, out: null });
    expect(runSettings({ HEROESIM_MODULES: 'probe' })).toEqual({ run: 'modules', modules: ['probe'], games: count, workers: half, validate: false });
  });
});

describe("HEROESIM_SEEDS' four meanings, named apart", () => {
  test('the worlds created and the games played; the seeds each estimate sample is resolved for; the seeds of a spot-check sample', () => {
    expect(settingsOf('milestone', { HEROESIM_SEEDS: '9' })).toMatchObject({ worlds: 9, games: 9 });
    expect(settingsOf('modules', { HEROESIM_MODULES: 'probe', HEROESIM_SEEDS: '9' })).toMatchObject({ games: 9 });
    expect(settingsOf('succession', { HEROESIM_PROBE: 'succession', HEROESIM_SEEDS: '9', HEROESIM_YEARS: '35' })).toMatchObject({ games: 9, years: 35 });
    expect(settingsOf('estimate', { HEROESIM_PROBE: 'estimate', HEROESIM_SEEDS: '9', HEROESIM_SAMPLES: '3', HEROESIM_MILESTONE: 'v1.1.6-estimate' })).toMatchObject({
      resolutions: 9,
      samples: 3,
      milestone: 'v1.1.6-estimate',
    });
    expect(settingsOf('calibrate', { HEROESIM_PROBE: 'calibrate', HEROESIM_SEEDS: '9', HEROESIM_PARTIES: '5' })).toMatchObject({ spotSeeds: 9, parties: 5 });
  });
});

describe('the probes and modules', () => {
  test('a probe is named whatever its case, and the probes are one list, which the command line reads', () => {
    expect(probeNames).toEqual(['succession', 'estimate', 'calibrate']);
    expect(runSettings({ HEROESIM_PROBE: ' Succession ' }).run).toBe('succession');
    for (const probe of probeNames) expect(commandLine([probe])).toEqual({ kind: 'vitest', env: { HEROESIM_PROBE: probe }, args: [`${probe}.harness`] });
  });

  test('the modules are named by id, comma-separated, spaces around each ignored', () => {
    expect(settingsOf('modules', { HEROESIM_MODULES: ' probe ' }).modules).toEqual(['probe']);
    expect(runSettings({ HEROESIM_MODULES: ' ' }).run).toBe('milestone');
  });

  test('the calibration reads its drafts, unless none, its tuning, its flat share and where it writes', () => {
    expect(settingsOf('calibrate', { HEROESIM_PROBE: 'calibrate', HEROESIM_DRAFTS: 'none' }).drafts).toBeNull();
    expect(settingsOf('calibrate', { HEROESIM_PROBE: 'calibrate', HEROESIM_DRAFTS: ' ' }).drafts).toBeNull();
    expect(
      settingsOf('calibrate', { HEROESIM_PROBE: 'calibrate', HEROESIM_DRAFTS: ' docs/quests/drafts ', HEROESIM_TUNE: '0.44', HEROESIM_FLAT: '0.4', HEROESIM_CALIBRATION_OUT: 'out', HEROESIM_CONFIG: '{"marketSize":14}' }),
    ).toMatchObject({ drafts: 'docs/quests/drafts', tune: 0.44, flat: 0.4, out: 'out', config: { marketSize: 14 } });
  });
});

describe('a bad value is refused by its name', () => {
  test.each([
    [{ HEROESIM_SEEDS: '0' }, 'HEROESIM_SEEDS must be a whole number from 1, not "0"'],
    [{ HEROESIM_SEEDS: '2.5' }, 'HEROESIM_SEEDS must be a whole number from 1, not "2.5"'],
    [{ HEROESIM_SEEDS: 'ten' }, 'HEROESIM_SEEDS must be a whole number from 1, not "ten"'],
    [{ HEROESIM_SEEDS: '1e400' }, 'HEROESIM_SEEDS must be a whole number from 1'],
    [{ HEROESIM_YEARS: '-5' }, 'HEROESIM_YEARS must be a whole number from 1, not "-5"'],
    [{ HEROESIM_WORKERS: 'eight' }, 'HEROESIM_WORKERS must be a whole number from 1, not "eight"'],
    [{ HEROESIM_VALIDATE: 'yes' }, 'HEROESIM_VALIDATE is 1 or 0, not "yes"'],
    [{ HEROESIM_REPLAY: 'no' }, 'HEROESIM_REPLAY is 1 or 0, not "no"'],
    [{ HEROESIM_MILESTONE: 'M9' }, 'HEROESIM_MILESTONE names a report: v<x>.<y>.<z>, or a word, each with -<name> words after it if wanted, never a milestone; not "M9"'],
    [{ HEROESIM_MILESTONE: 'm9-v118-s8' }, 'HEROESIM_MILESTONE names a report: v<x>.<y>.<z>, or a word, each with -<name> words after it if wanted, never a milestone; not "m9-v118-s8"'],
    [{ HEROESIM_PROFILE: 'gates' }, 'HEROESIM_PROFILE names one of gate, neutral, not "gates"'],
    [{ HEROESIM_PROBE: 'successions' }, 'HEROESIM_PROBE names one of succession, estimate, calibrate, not "successions"'],
    [{ HEROESIM_EXPECT: 'e7ae1710' }, 'HEROESIM_EXPECT is a fingerprint of 64 hexadecimal digits, not "e7ae1710"'],
    [{ HEROESIM_MODULES: 'random-events' }, 'HEROESIM_MODULES names "random-events", which is not a harness module (probe)'],
    [{ HEROESIM_MODULES: 'probe,probe' }, 'HEROESIM_MODULES names a module twice: "probe,probe"'],
    [{ HEROESIM_MODULES: 'probe,' }, 'HEROESIM_MODULES names "", which is not a harness module (probe)'],
    [{ HEROESIM_CONFIG: '[1]' }, 'HEROESIM_CONFIG is "[1]"; expected a JSON object of config keys'],
    [{ HEROESIM_CONFIG: '{' }, 'HEROESIM_CONFIG is "{"; expected a JSON object of config keys'],
    [{ HEROESIM_CONFIG: '{"noSuchKey":1}' }, 'HEROESIM_CONFIG: "noSuchKey" is not a config key'],
    [{ HEROESIM_POLICY: '7' }, 'HEROESIM_POLICY is "7"; expected a JSON object of the automatic policy\'s keys'],
    [{ HEROESIM_POLICY: '{"recruit":1}' }, 'HEROESIM_POLICY: "recruit" is not a policy key'],
    [{ HEROESIM_POLICY: '{"rosterLimit":-1}' }, 'HEROESIM_POLICY: rosterLimit is -1; it is a number from 0'],
    [{ HEROESIM_POLICY: '{"rosterLimit":8.5}' }, 'HEROESIM_POLICY: rosterLimit is 8.5; it is a whole number'],
    [{ HEROESIM_POLICY: '{"buyWealthMultiple":"3"}' }, 'HEROESIM_POLICY: buyWealthMultiple is "3"; it is a number from 0'],
    [{ HEROESIM_PROBE: 'estimate', HEROESIM_SAMPLES: 'ten' }, 'HEROESIM_SAMPLES must be a whole number from 1, not "ten"'],
    [{ HEROESIM_PROBE: 'calibrate', HEROESIM_PARTIES: '0' }, 'HEROESIM_PARTIES must be a whole number from 1, not "0"'],
    [{ HEROESIM_PROBE: 'calibrate', HEROESIM_DRAFTS: 'd', HEROESIM_TUNE: '1' }, 'HEROESIM_TUNE is a chance between 0 and 1, not "1"'],
    [{ HEROESIM_PROBE: 'calibrate', HEROESIM_FLAT: '1' }, 'HEROESIM_FLAT is a share from 0 to below 1, not "1"'],
    [{ HEROESIM_PROBE: 'calibrate', HEROESIM_TUNE: '0.44' }, 'HEROESIM_TUNE tunes the drafts: name them with HEROESIM_DRAFTS'],
    [{ HEROESIM_PROFILE: 'gate', HEROESIM_PROBE: 'estimate' }, "HEROESIM_PROFILE gate plays the milestone's play sweep; it cannot be set with HEROESIM_PROBE"],
    [{ HEROESIM_PROFILE: 'neutral', HEROESIM_MODULES: 'probe' }, "HEROESIM_PROFILE neutral plays the milestone's play sweep; it cannot be set with HEROESIM_MODULES"],
    [{ HEROESIM_SEED: '50' }, 'HEROESIM_SEED: not a harness setting; the harness reads HEROESIM_HARNESS, HEROESIM_PROFILE'],
  ] as [Env, string][])('%j', (env, message) => {
    expect(() => runSettings(env)).toThrow(RangeError);
    expect(() => runSettings(env)).toThrow(message);
  });

  // The CLI's, the live check's, the deploy's and the portrait tool's owner test's (docs/environment.md): one set
  // in the shell for another package must not refuse a harness run (DL-188).
  test("leaves alone the variables of the same prefix other packages read", () => {
    expect(runSettings({ HEROESIM_SAVE_DIR: 'x', HEROESIM_LIVE_URL: 'y', HEROESIM_DEPLOY_RECORD: 'z', HEROESIM_OWNER_PICTURES: 'w' })).toEqual(runSettings({}));
  });
});

test('settingsSet gives the variables a run reads and that are set, as NAME=value, for a report', () => {
  const env = { HEROESIM_SEEDS: '4', HEROESIM_YEARS: ' 2 ', HEROESIM_SAMPLES: '3', HEROESIM_HARNESS: '1', HEROESIM_REPLAY: '' };
  expect(settingsSet('milestone', env)).toEqual(['HEROESIM_SEEDS=4', 'HEROESIM_YEARS=2']);
  expect(settingsSet('estimate', env)).toEqual(['HEROESIM_SEEDS=4', 'HEROESIM_SAMPLES=3']);
});

describe('the command line', () => {
  test('gate and neutral name their report and play the play sweep alone, --expect giving the fingerprint', () => {
    expect(commandLine(['gate', 'v1.1.6-s3'])).toEqual({ kind: 'vitest', env: { HEROESIM_PROFILE: 'gate', HEROESIM_MILESTONE: 'v1.1.6-s3' }, args: ['play.harness'] });
    expect(commandLine(['neutral', 'v1.1.6-s5', '--expect', 'abc', '--reporter=verbose'])).toEqual({
      kind: 'vitest',
      env: { HEROESIM_PROFILE: 'neutral', HEROESIM_MILESTONE: 'v1.1.6-s5', HEROESIM_EXPECT: 'abc' },
      args: ['play.harness', '--reporter=verbose'],
    });
  });

  test('compare takes two reports; any other words pass through to Vitest', () => {
    expect(commandLine(['compare', 'a.json', 'b'])).toEqual({ kind: 'compare', a: 'a.json', b: 'b' });
    expect(commandLine(['play.harness', '--reporter=verbose'])).toEqual({ kind: 'vitest', env: {}, args: ['play.harness', '--reporter=verbose'] });
    expect(commandLine([])).toEqual({ kind: 'vitest', env: {}, args: [] });
  });

  test.each([
    [['gate'], 'gate names its report: npm run harness -- gate <name>'],
    [['neutral', '--expect', 'abc'], 'neutral names its report'],
    [['gate', 'v1.1.9-x', '--expect'], '--expect names a fingerprint'],
    [['compare', 'a'], 'compare takes two reports'],
    [['compare', 'a', 'b', 'c'], 'compare takes two reports'],
  ])('refuses %j', (words, message) => {
    expect(() => commandLine(words)).toThrow(message);
  });
});

// The parser is the one reader of the environment: no other harness source reads `process.env`.
const harnessDir = fileURLToPath(new URL('.', import.meta.url));

/** The harness's sources that read the environment, settings.ts and its test left out. */
const environmentReaders = (): string[] =>
  readdirSync(harnessDir)
    .filter((file) => file.endsWith('.ts') && file !== 'settings.ts' && file !== 'settings.test.ts')
    // engine/src/boundary.test.ts writes and deletes probe files here while other tests run (DL-236).
    .filter((file) => !file.startsWith('boundary-probe-'))
    .filter((file) => readFileSync(`${harnessDir}/${file}`, 'utf8').includes('process.env'));

test('no harness source but settings.ts reads the environment', () => {
  // main.ts passes the environment on to Vitest, reading none of it.
  expect(environmentReaders()).toEqual(['main.ts']);
});

test("the sources read leave out engine/src/boundary.test.ts's probe files, which come and go while other tests run (DL-236)", () => {
  const file = `boundary-probe-${randomUUID()}.ts`;
  writeFileSync(`${harnessDir}/${file}`, "export const env = process.env['HOME'];\n");
  try {
    expect(environmentReaders()).toEqual(['main.ts']);
  } finally {
    rmSync(`${harnessDir}/${file}`, { force: true });
  }
});
