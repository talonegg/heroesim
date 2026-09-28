// @vitest-environment node
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import {
  addresses,
  deploy,
  pagesProject,
  releaseBranch,
  workerConfig,
  wranglerCommands,
  type DeployOptions,
  type Spawn,
  type SpawnResult,
} from '../scripts/deploy.mjs';

// The deploy (M7-S5, DL-68; v1.0.1-S3, DL-94; INPUTS 7.8 and 7.9). `npm run deploy` is
// web/scripts/deploy.mjs: from a clean checkout of a release tag, it builds and gates the page
// once, then uploads web/dist to the Worker `heroesim` (Cloudflare Workers static assets,
// web/wrangler.jsonc) and then to the Pages project `heroesims`, from this machine, after a
// one-time `npx wrangler login`. The login's token lives in wrangler's own directory under the
// user profile, and wrangler keeps its working state in `.wrangler/` wherever it runs. These tests
// keep the deploy what INPUTS 7.8 says; run its guard, its order and its dry run with a fake
// spawn, so that no test runs npm, wrangler or a git command that writes; and keep every
// credential and `.wrangler/` out of the repository. Like the bundle gate (bundle.test.ts) they
// run on every `npm test`, in CI included.

const webDir = fileURLToPath(new URL('..', import.meta.url));
const repoDir = path.join(webDir, '..');

interface Manifest {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[];
}

function readText(file: string): string {
  return readFileSync(path.join(repoDir, file), 'utf8');
}

function readManifest(file: string): Manifest {
  return JSON.parse(readText(file)) as Manifest;
}

function git(args: string[]): { status: number | null; stdout: string } {
  const child = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' });
  if (child.error) throw child.error;
  return { status: child.status, stdout: child.stdout };
}

/** Every file in the repository and every file one `git add .` from it: tracked, or untracked and not ignored. */
function repositoryFiles(): string[] {
  const listed = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  expect(listed.status).toBe(0);
  return [...new Set(listed.stdout.split('\0').filter((file) => file !== ''))];
}

const temporaries: string[] = [];
function temporaryDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-deploy-test-'));
  temporaries.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** An empty file, and the directories it needs. */
function touch(file: string): string {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '');
  return file;
}

describe('the deploy command', () => {
  test('is the deploy script, which builds and gates the page once and uploads it to both addresses', () => {
    expect(readManifest('web/package.json').scripts?.deploy).toBe('node scripts/deploy.mjs');
  });

  test('runs from the repository root, as build and e2e do', () => {
    expect(readManifest('package.json').scripts?.deploy).toBe('npm run deploy -w web');
  });

  test('fetches wrangler at deploy time: no manifest and no lockfile entry holds it', () => {
    const root = readManifest('package.json');
    const manifests = ['package.json', ...(root.workspaces ?? []).map((name) => `${name}/package.json`)];
    const declared = manifests.flatMap((file) => {
      const manifest = readManifest(file);
      return [
        manifest.dependencies,
        manifest.devDependencies,
        manifest.optionalDependencies,
        manifest.peerDependencies,
      ].flatMap((list) => Object.keys(list ?? {}).map((name) => `${file}: ${name}`));
    });
    const locked = Object.keys(
      (JSON.parse(readText('package-lock.json')) as { packages: Record<string, unknown> }).packages,
    );

    expect(manifests).toContain('web/package.json');
    expect(declared.filter((entry) => entry.endsWith(': wrangler'))).toEqual([]);
    expect(locked.filter((key) => key.endsWith('node_modules/wrangler'))).toEqual([]);
  });

  test("uploads to the Worker by its configuration, the tag as the version's tag, tag and commit as its message", () => {
    const sha = 'f'.repeat(40);

    expect(wranglerCommands('v1.0.1', sha)).toEqual({
      worker: ['-y', 'wrangler@4', 'deploy', '--config', 'wrangler.jsonc', '--tag', 'v1.0.1', '--message', `v1.0.1 at commit ${sha}`],
      // `--branch` is written out, never inferred from git: a deploy for any other branch would be
      // a preview that never reaches https://heroesims.pages.dev (v1's DL-30 item 3).
      pages: ['-y', 'wrangler@4', 'pages', 'deploy', 'dist', '--project-name', 'heroesims', '--branch', 'v1.0-release'],
    });
    expect([pagesProject, workerConfig, releaseBranch]).toEqual(['heroesims', 'wrangler.jsonc', 'v1.0-release']);
  });

  test('writes the release branch once, as one constant, for the day it moves to v1.1-release (#37)', () => {
    const source = readText('web/scripts/deploy.mjs');

    expect(source.split("'v1.0-release'")).toHaveLength(2);
    expect(source).toContain("export const releaseBranch = 'v1.0-release';");
  });
});

/** web/wrangler.jsonc as data: its comments are whole lines. */
function workerConfiguration(): unknown {
  const text = readText('web/wrangler.jsonc')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  return JSON.parse(text);
}

describe("the Worker's configuration", () => {
  test('serves web/dist as static assets only, on workers.dev, with no preview URL and a 404 for any other path', () => {
    // Exactly these keys: no `main` (assets only), no `account_id` (the login supplies it), no
    // `pages_build_output_dir` (Pages would take the file for its own, and `wrangler deploy` refuse
    // it) and no "$schema" path, since wrangler is never installed (DL-68). Preview URLs would be
    // further origins, each with its own saves (DL-92 item 6).
    expect(workerConfiguration()).toEqual({
      name: 'heroesim',
      compatibility_date: '2026-09-28',
      assets: { directory: './dist', not_found_handling: 'none' },
      workers_dev: true,
      preview_urls: false,
    });
  });
});

describe("the page's addresses", () => {
  test("are the Worker's full address, on the owner's subdomain, and the Pages project's", () => {
    expect(addresses.worker).toMatch(/^https:\/\/heroesim\.[a-z0-9]([a-z0-9-]*[a-z0-9])?\.workers\.dev$/);
    expect(addresses.worker).toBe('https://heroesim.magical-potato.workers.dev');
    expect(addresses.pages).toBe('https://heroesims.pages.dev');
  });

  test("are both in the README, and the Worker's in INPUTS 7.8", () => {
    const readme = readText('README.md');
    const inputs78 = readText('docs/planning/epics/INPUTS-REQUIRED.md')
      .split(/\r?\n/)
      .find((line) => line.startsWith('| 7.8 |'));

    expect(readme).toContain(addresses.worker);
    expect(readme).toContain(addresses.pages);
    expect(inputs78).toContain(addresses.worker);
  });
});

describe('the live check', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function projects(): Promise<[string, string | undefined, number | undefined][]> {
    const { default: config } = await import('../playwright.live.config');
    return (config.projects ?? []).map((project) => [
      project.name ?? '',
      project.use?.baseURL,
      project.use?.viewport?.width,
    ]);
  }

  test("plays each address at a phone's width and a desktop's: four projects", async () => {
    vi.stubEnv('HEROESIM_LIVE_URL', '');

    expect(await projects()).toEqual([
      ['worker-phone', addresses.worker, 360],
      ['worker-desktop', addresses.worker, 1280],
      ['pages-phone', addresses.pages, 360],
      ['pages-desktop', addresses.pages, 1280],
    ]);
  });

  test('plays the one address HEROESIM_LIVE_URL names instead, at both widths', async () => {
    vi.stubEnv('HEROESIM_LIVE_URL', 'https://heroesim.elsewhere.workers.dev');

    expect(await projects()).toEqual([
      ['override-phone', 'https://heroesim.elsewhere.workers.dev', 360],
      ['override-desktop', 'https://heroesim.elsewhere.workers.dev', 1280],
    ]);
  });
});

describe('the README', () => {
  test('names both addresses, the deploy from a clean checkout of a release tag, the one-time login and the live check', () => {
    const readme = readText('README.md');

    expect(readme).toContain('https://heroesims.pages.dev');
    expect(readme).toContain(addresses.worker);
    expect(readme).toContain('npm run deploy');
    expect(readme).toContain('npx wrangler login');
    expect(readme).toContain('clean checkout of its release tag');
    expect(readme).toContain('npm run e2e:live -w web');
    expect(readme).toContain('HEROESIM_LIVE_URL');
  });
});

// The deploy's guard, order and record, run with a fake spawn. What each wrangler run writes to
// WRANGLER_OUTPUT_FILE_PATH is wrangler 4.142.0's own shape (`writeOutput` in its cli.js): one
// JSON object a line, each with a timestamp: a `wrangler-session` entry first, then `deploy` for
// the Worker, or `pages-deploy` and `pages-deploy-detailed` for Pages.

const commit = '0123456789abcdef0123456789abcdef01234567';

interface Checkout {
  porcelain?: string;
  tags?: string;
  gitFails?: boolean;
  build?: number;
  worker?: number;
  pages?: number;
  targets?: string[];
  environment?: string;
  pagesCommit?: string;
  records?: boolean;
}

interface Call {
  command: string;
  args: string[];
  options: SpawnSyncOptions;
}

function recordEntries(pages: boolean, checkout: Checkout): object[] {
  const session = { type: 'wrangler-session', version: 1, wrangler_version: '4.142.0', command_line_args: [] };
  const url = 'https://0a1b2c3d.heroesims.pages.dev';
  if (pages) {
    return [
      session,
      { type: 'pages-deploy', version: 1, pages_project: 'heroesims', deployment_id: 'd-1', url },
      {
        type: 'pages-deploy-detailed',
        version: 1,
        pages_project: 'heroesims',
        deployment_id: 'd-1',
        url,
        alias: 'https://v1-0-release.heroesims.pages.dev',
        environment: checkout.environment ?? 'production',
        production_branch: 'v1.0-release',
        deployment_trigger: { metadata: { commit_hash: checkout.pagesCommit ?? commit } },
      },
    ];
  }
  return [
    session,
    {
      type: 'deploy',
      version: 1,
      worker_name: 'heroesim',
      worker_tag: 'wt-1',
      version_id: '11111111-2222-3333-4444-555555555555',
      targets: checkout.targets ?? [addresses.worker],
      worker_name_overridden: false,
    },
  ];
}

/** git answering as the checkout would, npm building, and wrangler writing its record: all pretended. */
function fakeSpawn(checkout: Checkout): { spawn: Spawn; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: Spawn = (command, args, options): SpawnResult => {
    calls.push({ command, args: [...args], options });
    if (command === 'git') {
      if (checkout.gitFails) return { status: 128, stdout: '' };
      if (args[0] === 'status') return { status: 0, stdout: checkout.porcelain ?? '' };
      if (args[0] === 'tag') return { status: 0, stdout: checkout.tags ?? 'v1.0.1\n' };
      if (args[0] === 'rev-parse') return { status: 0, stdout: `${commit}\n` };
      throw new Error(`an unexpected git ${args.join(' ')}`);
    }
    if (args[0]?.endsWith('npm-cli.js')) return { status: checkout.build ?? 0 };

    const pages = args.includes('pages');
    const record = options.env?.WRANGLER_OUTPUT_FILE_PATH;
    if (record !== undefined && checkout.records !== false) {
      for (const entry of recordEntries(pages, checkout)) {
        appendFileSync(record, `${JSON.stringify({ ...entry, timestamp: '2026-09-28T08:00:00.000Z' })}\n`);
      }
    }
    return { status: (pages ? checkout.pages : checkout.worker) ?? 0 };
  };
  return { spawn, calls };
}

/** A machine: Node with npm beside it, a checkout's web/ holding wrangler.jsonc, and a temporary directory. */
function machine(): { execPath: string; npmCli: string; npxCli: string; webDir: string; tmp: string } {
  const root = temporaryDir();
  const bin = path.join(root, 'node', 'node_modules', 'npm', 'bin');
  const web = path.join(root, 'checkout', 'web');
  const tmp = path.join(root, 'tmp');
  touch(path.join(web, 'wrangler.jsonc'));
  mkdirSync(tmp);
  return {
    execPath: path.join(root, 'node', 'node.exe'),
    npmCli: touch(path.join(bin, 'npm-cli.js')),
    npxCli: touch(path.join(bin, 'npx-cli.js')),
    webDir: web,
    tmp,
  };
}

function run(checkout: Checkout = {}, options: DeployOptions = {}) {
  const place = machine();
  const { spawn, calls } = fakeSpawn(checkout);
  const output: string[] = [];
  const status = deploy({
    argv: [],
    env: {},
    webDir: place.webDir,
    execPath: place.execPath,
    tmpdir: place.tmp,
    spawn,
    log: (line) => output.push(line),
    warn: (line) => output.push(line),
    now: () => new Date('2026-09-28T08:01:02.345Z'),
    ...options,
  });
  const builds = calls.filter((call) => call.args[0]?.endsWith('npm-cli.js'));
  const wrangler = calls.filter((call) => call.args[0]?.endsWith('npx-cli.js'));
  return { status, calls, output: output.join('\n'), builds, wrangler, place };
}

describe('the deploy refuses before building', () => {
  test.each([
    ['the checkout is dirty', { porcelain: ' M web/src/app.tsx\n?? notes.txt\n' }, 'not clean: 2 uncommitted'],
    ['HEAD carries no tag', { tags: '' }, 'no release tag (v*)'],
    ['HEAD carries a milestone tag alone', { tags: 'm8-modules\n' }, 'no release tag (v*)'],
    ['HEAD carries two release tags', { tags: 'v1.0.1\nv1.0.2\n' }, '2 release tags, v1.0.1 and v1.0.2'],
    ['git cannot read the checkout', { gitFails: true }, 'git could not read the checkout'],
  ])('when %s: non-zero, and neither npm nor wrangler runs', (_case, checkout, reason) => {
    const { status, output, builds, wrangler } = run(checkout);

    expect(status).not.toBe(0);
    expect(output).toContain('refused; nothing was built or uploaded');
    expect(output).toContain(reason);
    expect(builds).toEqual([]);
    expect(wrangler).toEqual([]);
  });

  test('when --dry-run is given on an untagged checkout, as on v1.0-dev', () => {
    const { status, output, builds } = run({ tags: '' }, { argv: ['--dry-run'] });

    expect(status).not.toBe(0);
    expect(output).toContain('no release tag (v*)');
    expect(builds).toEqual([]);
  });

  test.each(['wrangler.json', 'wrangler.jsonc', 'wrangler.toml'])(
    'when a %s sits above web/, where wrangler would find it',
    (name) => {
      const root = temporaryDir();
      const stray = touch(path.join(root, name));
      const web = path.join(root, 'checkout', 'web');
      touch(path.join(web, 'wrangler.jsonc'));

      const { status, output, builds } = run({}, { webDir: web });

      expect(status).not.toBe(0);
      expect(output).toContain(`a wrangler configuration sits at ${stray}`);
      expect(builds).toEqual([]);
    },
  );

  test('when another wrangler configuration sits in web/ beside wrangler.jsonc', () => {
    const place = machine();
    const stray = touch(path.join(place.webDir, 'wrangler.json'));

    const { status, output, builds } = run({}, { webDir: place.webDir });

    expect(status).not.toBe(0);
    expect(output).toContain(`a wrangler configuration sits at ${stray}`);
    expect(builds).toEqual([]);
  });

  test('when given any argument but --dry-run, so that a mistyped one never deploys', () => {
    const { status, output, builds } = run({}, { argv: ['--dryrun'] });

    expect(status).not.toBe(0);
    expect(output).toContain('it takes only --dry-run, and was given --dryrun');
    expect(builds).toEqual([]);
  });

  test('when npm is not where npm_execpath says', () => {
    const elsewhere = path.join(temporaryDir(), 'npm-cli.js');
    const { status, output, builds } = run({}, { env: { npm_execpath: elsewhere } });

    expect(status).not.toBe(0);
    expect(output).toContain(`npm's npm-cli.js is not at ${elsewhere}`);
    expect(builds).toEqual([]);
  });
});

describe('the deploy', () => {
  test('builds once, then uploads to the Worker, then to Pages, from web/ and with no shell', () => {
    const { status, calls, builds, wrangler, place } = run();

    expect(status).toBe(0);
    expect(calls.map((call) => call.command)).toEqual(['git', 'git', 'git', place.execPath, place.execPath, place.execPath]);
    expect(builds.map((call) => call.args)).toEqual([[place.npmCli, 'run', 'build']]);
    expect(wrangler.map((call) => call.args)).toEqual([
      [place.npxCli, ...wranglerCommands('v1.0.1', commit).worker],
      [place.npxCli, ...wranglerCommands('v1.0.1', commit).pages],
    ]);
    // The message is one element of wrangler's argv, whole: no shell splits it at its spaces.
    const workerArgs = wrangler[0]?.args ?? [];
    expect(workerArgs[workerArgs.indexOf('--message') + 1]).toBe(`v1.0.1 at commit ${commit}`);
    for (const call of calls) {
      expect(call.options.shell, call.args.join(' ')).toBeUndefined();
      expect(call.options.cwd).toBe(place.webDir);
    }
    // Wrangler's prompts reach whoever runs it.
    for (const call of [...builds, ...wrangler]) expect(call.options.stdio).toBe('inherit');
  });

  test('runs npm and npx from npm_execpath when npm runs it, and from beside Node when node does', () => {
    const elsewhere = path.join(temporaryDir(), 'npm', 'bin');
    const npmCli = touch(path.join(elsewhere, 'npm-cli.js'));
    const npxCli = touch(path.join(elsewhere, 'npx-cli.js'));

    const byNpm = run({}, { env: { npm_execpath: npmCli } });
    const byNode = run();

    expect(byNpm.builds.map((call) => call.args[0])).toEqual([npmCli]);
    expect(byNpm.wrangler.map((call) => call.args[0])).toEqual([npxCli, npxCli]);
    expect(byNode.builds.map((call) => call.args[0])).toEqual([byNode.place.npmCli]);
    expect(byNode.wrangler.map((call) => call.args[0])).toEqual([byNode.place.npxCli, byNode.place.npxCli]);
  });

  test.each([
    ['the build fails', { build: 2 }, 2, 0],
    ["the Worker's upload fails", { worker: 1 }, 1, 1],
    ['the Pages upload fails', { pages: 7 }, 7, 2],
  ])('stops at the first failure: when %s', (_case, checkout, status, uploads) => {
    const result = run(checkout);

    expect(result.status).toBe(status);
    expect(result.builds).toHaveLength(1);
    expect(result.wrangler).toHaveLength(uploads);
  });

  test('has each wrangler run write its record to its own file in the temporary directory, removed after', () => {
    const { wrangler, place } = run();
    const files = wrangler.map((call) => call.options.env?.WRANGLER_OUTPUT_FILE_PATH ?? '');

    expect(files).toHaveLength(2);
    expect(new Set(files).size).toBe(2);
    for (const file of files) {
      expect(path.relative(place.tmp, file).startsWith('..'), file).toBe(false);
      expect(existsSync(file), file).toBe(false);
    }
  });

  test('prints the record: tag, commit, UTC time, each wrangler version, the Worker version and address, the Pages deployment', () => {
    const { output } = run();

    expect(output).toContain('tag             v1.0.1');
    expect(output).toContain(`commit          ${commit}`);
    expect(output).toContain('finished (UTC)  2026-09-28T08:01:02.345Z');
    expect(output).toContain(
      `Worker          wrangler 4.142.0; version 11111111-2222-3333-4444-555555555555; at ${addresses.worker}; ` +
        '2026-09-28T08:00:00.000Z',
    );
    expect(output).toContain(
      `Pages           wrangler 4.142.0; https://0a1b2c3d.heroesims.pages.dev; environment production; commit ${commit}`,
    );
    expect(output).not.toContain('WARNING');
  });

  test("warns loudly, naming the override, when the Worker is not at the live check's address", () => {
    const { status, output } = run({ targets: ['https://heroesim.someone-else.workers.dev'] });

    expect(status).toBe(0);
    expect(output).toContain(
      `WARNING: the Worker is served at https://heroesim.someone-else.workers.dev, not at ${addresses.worker}`,
    );
    expect(output).toContain('HEROESIM_LIVE_URL');
  });

  test('warns when Pages took the deploy as a preview or recorded another commit, or when wrangler wrote no record', () => {
    expect(run({ environment: 'preview' }).output).toContain('WARNING: Pages took this deploy as preview, not production.');
    expect(run({ pagesCommit: 'f'.repeat(40) }).output).toContain(`WARNING: Pages recorded commit ${'f'.repeat(40)}, not ${commit}.`);
    expect(run({ pagesCommit: commit.slice(0, 7) }).output).not.toContain('WARNING');

    const unrecorded = run({ records: false });
    expect(unrecorded.status).toBe(0);
    expect(unrecorded.output).toContain("WARNING: wrangler wrote no record of the Worker's deploy");
    expect(unrecorded.output).toContain('WARNING: wrangler wrote no record of the Pages deploy');
  });
});

describe('the dry run', () => {
  test.each([
    ['--dry-run', { argv: ['--dry-run'] }],
    ['npm_config_dry_run alone, as `npm run deploy --dry-run` hands it', { env: { npm_config_dry_run: 'true' } }],
  ])('%s runs the checks and the build and prints both wrangler commands, running neither', (_case, options) => {
    const { status, output, builds, wrangler, calls } = run({}, options);

    expect(status).toBe(0);
    expect(calls.filter((call) => call.command === 'git')).toHaveLength(3);
    expect(builds).toHaveLength(1);
    expect(wrangler).toEqual([]);
    expect(output).toContain(
      `npx -y wrangler@4 deploy --config wrangler.jsonc --tag v1.0.1 --message "v1.0.1 at commit ${commit}"`,
    );
    expect(output).toContain('npx -y wrangler@4 pages deploy dist --project-name heroesims --branch v1.0-release');
  });

  test.each(['', 'false'])('npm_config_dry_run=%j is no dry run', (value) => {
    expect(run({}, { env: { npm_config_dry_run: value } }).wrangler).toHaveLength(2);
  });
});

// What a Cloudflare credential looks like written down: an account id (32 hex digits) or a token
// given a value, in JSON, TOML, YAML or an environment line. The names alone, a placeholder and a
// `${{ secrets.… }}` reference are not credentials, and the documents name them.
const credentialPatterns: readonly [kind: string, pattern: RegExp][] = [
  ['an account id', /account[_-]?id["']?\s*[:=]\s*["']?[0-9a-f]{32}(?![0-9a-f])/i],
  [
    'a Cloudflare token or account id given a value',
    /\b(?:CLOUDFLARE|CF)_(?:API_TOKEN|API_KEY|ACCOUNT_ID)["']?\s*[:=]\s*["']?(?![$<{])[\w-]{8,}/,
  ],
  ['an OAuth token given a value', /\b(?:oauth_token|refresh_token)["']?\s*[:=]\s*["'][^"'\s]{16,}/],
  ['a bearer token', /\bBearer\s+[\w.~+/-]{20,}/],
];

function credentialsIn(text: string): string[] {
  return credentialPatterns.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
}

describe('the repository holds no deploy credential', () => {
  test('.gitignore keeps .wrangler/ out wherever wrangler runs: the root or web/', () => {
    const ignored = readText('.gitignore').split(/\r?\n/);
    const probes = ['.wrangler/cache/pages.json', 'web/.wrangler/cache/pages.json', 'web/.wrangler/tmp/bundle.js'];

    expect(ignored).toContain('.wrangler/');
    for (const probe of probes) {
      expect(git(['check-ignore', '--no-index', '--quiet', probe]).status, probe).toBe(0);
    }
  });

  test('no file sits under a .wrangler/ directory', () => {
    const inWrangler = repositoryFiles().filter((file) => file.split('/').includes('.wrangler'));

    expect(inWrangler).toEqual([]);
  });

  // Assembled at run time, so no credential-shaped string is written in this file.
  const accountId = 'c0ffee'.padEnd(32, '0');
  const token = 'tok'.padEnd(40, 'x');

  test.each([
    ['an account id in JSON', `{"account_id":"${accountId}","project_name":"heroesims"}`],
    ['an account id in TOML', `account_id = "${accountId}"`],
    ['an account id in an environment line', `CLOUDFLARE_ACCOUNT_ID=${accountId}`],
    ['an API token in an environment line', `export CLOUDFLARE_API_TOKEN=${token}`],
    ['an API token in YAML', `  CF_API_TOKEN: "${token}"`],
    ['an OAuth token in TOML', `oauth_token = "${token}"`],
    ['a refresh token in JSON', `"refresh_token": "${token}"`],
    ['a bearer header', `Authorization: Bearer ${token}`],
  ])('the scan finds %s', (_kind, text) => {
    expect(credentialsIn(text)).not.toEqual([]);
  });

  test.each([
    ['the names alone', '`CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets'],
    ['a secrets reference', 'CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}'],
    ['a placeholder', 'account_id = "<your account id>"'],
    ['the Worker command', `npx -y wrangler@4 deploy --config wrangler.jsonc --tag v1.0.1 --message "v1.0.1 at commit ${commit}"`],
    ['the Pages command', 'npx -y wrangler@4 pages deploy dist --project-name heroesims --branch v1.0-release'],
    ['a commit hash', `commit ${accountId}12345678`],
    ['a Guild name', 'The Company of the Lantern-Bearers of Aldmoor'],
  ])('the scan passes %s', (_kind, text) => {
    expect(credentialsIn(text)).toEqual([]);
  });

  test('no file holds a Cloudflare token or account id', () => {
    const found: string[] = [];
    for (const file of repositoryFiles()) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(path.join(repoDir, file));
      } catch {
        continue; // tracked but deleted in the working tree
      }
      if (bytes.includes(0)) continue; // binary: an image
      bytes
        .toString('utf8')
        .split(/\r?\n/)
        .forEach((line, index) => {
          for (const kind of credentialsIn(line)) found.push(`${file}:${index + 1}: ${kind}`);
        });
    }

    expect(found).toEqual([]);
  });
});
