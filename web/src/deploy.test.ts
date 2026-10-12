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
  leavesThePage,
  wranglerCommands,
  type DeployOptions,
  type Spawn,
  type SpawnResult,
} from '../scripts/deploy.mjs';

// The deploy (DL-68; DL-94; INPUTS 7.8 and 7.9). `npm run deploy` is
// web/scripts/deploy.mjs: from a clean checkout of a release tag, it builds and gates the page
// once, then uploads web/dist to the Worker `heroesim` (Cloudflare Workers static assets,
// web/wrangler.jsonc) and then to the Pages project `heroesims`, from this machine, after a
// one-time `npx wrangler login`. The login's token lives in wrangler's own directory under the
// user profile, and wrangler keeps its working state in `.wrangler/` wherever it runs. These tests
// keep the deploy what INPUTS 7.8 says; run its guard, its order and its dry run with a fake
// spawn, so that no test runs npm, wrangler or a git command that writes; and keep every
// credential and `.wrangler/` out of the repository. Like the bundle gate (bundle.test.ts) they
// run on every `npm test`, in CI included. Two need a module mocked, so have files of their own:
// deploy-import.test.ts, that an import runs nothing, and deploy-root.test.ts, that the guard
// looks at the filesystem's root (DL-97).

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

/** The list `repositoryFiles` gives, read once for the file: the tests below only read the repository. */
let listedFiles: string[] | undefined;

/** Every file in the repository and every file one `git add .` from it: tracked, or untracked and not ignored. */
function repositoryFiles(): string[] {
  if (listedFiles === undefined) {
    const listed = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
    expect(listed.status).toBe(0);
    listedFiles = [...new Set(listed.stdout.split('\0').filter((file) => file !== ''))];
  }
  return listedFiles;
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
      pages: ['-y', 'wrangler@4', 'pages', 'deploy', 'dist', '--project-name', 'heroesims', '--branch', 'main'],
    });
  });

  test('writes the production branch once, as one constant: main, whatever the release line (DL-124)', () => {
    const source = readText('web/scripts/deploy.mjs');

    expect(source.split("'main'")).toHaveLength(2);
    expect(source).toContain("export const productionBranch = 'main';");
    expect(source).not.toMatch(/'v\d+\.\d+-release'/);
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
    expect(addresses.worker).toBe('https://heroesim.magical-potato.workers.dev');
    expect(addresses.pages).toBe('https://heroesims.pages.dev');
  });

  // The deploy guide's are the test "the deploy guide names both addresses" (docs/deploy.md, DL-217).
  test('are both in the README', () => {
    const readme = readText('README.md');

    expect(readme).toContain(addresses.worker);
    expect(readme).toContain(addresses.pages);
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

  test('takes a blank HEROESIM_LIVE_URL for none (DL-97)', async () => {
    vi.stubEnv('HEROESIM_LIVE_URL', '   ');

    expect((await projects()).map(([name]) => name)).toEqual(['worker-phone', 'worker-desktop', 'pages-phone', 'pages-desktop']);
  });

  test('runs e2e/*.live.ts alone, never the local specs, one of which sets ?modules= (DL-82 item 20; DL-97)', async () => {
    vi.stubEnv('HEROESIM_LIVE_URL', '');
    const { default: config } = await import('../playwright.live.config');

    expect([config.testDir, config.testMatch]).toEqual(['./e2e', '**/*.live.ts']);
  });

  // Pages adds Cloudflare's Web Analytics beacon at the edge; the owner's answer (b) lets the
  // live check allow it on Pages alone, the Worker kept strict (DL-279).
  const beacon = 'https://static.cloudflareinsights.com/beacon.min.js';
  const report = 'https://cloudflareinsights.com/cdn-cgi/rum';

  test("counts every request to another origin as leaving the page, and none to the page's own", () => {
    expect(leavesThePage(addresses.worker, `${addresses.worker}/assets/index.js`)).toBe(false);
    expect(leavesThePage(addresses.pages, `${addresses.pages}/`)).toBe(false);
    expect(leavesThePage(addresses.worker, `${addresses.pages}/`)).toBe(true);
    expect(leavesThePage(addresses.worker, 'https://example.com/x.js')).toBe(true);
    expect(leavesThePage(addresses.pages, 'https://example.com/x.js')).toBe(true);
    expect(leavesThePage(addresses.pages, 'http://heroesims.pages.dev/')).toBe(true);
    expect(leavesThePage(addresses.worker, `${addresses.worker}:8443/`)).toBe(true);
  });

  test("allows Cloudflare's Web Analytics beacon and its report on Pages and its deployments, never on the Worker (DL-279)", () => {
    for (const url of [beacon, report]) {
      expect(leavesThePage(addresses.pages, url)).toBe(false);
      expect(leavesThePage('https://ac36e981.heroesims.pages.dev', url)).toBe(false);
      expect(leavesThePage(addresses.worker, url)).toBe(true);
      expect(leavesThePage('https://heroesim.elsewhere.workers.dev', url)).toBe(true);
    }
  });

  test("allows only the beacon's two origins, over https to a page on https, and no look-alike", () => {
    for (const url of [
      'http://static.cloudflareinsights.com/beacon.min.js',
      'https://static.cloudflareinsights.com:8443/beacon.min.js',
      'https://cloudflareinsights.com.example.com/cdn-cgi/rum',
      'https://evil-cloudflareinsights.com/cdn-cgi/rum',
      'https://other.cloudflareinsights.com/x.js',
      'https://heroesims.pages.dev.example.com/',
    ]) {
      expect(leavesThePage(addresses.pages, url)).toBe(true);
    }
    expect(leavesThePage('https://heroesims.pages.dev.example.com', beacon)).toBe(true);
    expect(leavesThePage('https://notheroesims.pages.dev', beacon)).toBe(true);
    expect(leavesThePage('http://heroesims.pages.dev', beacon)).toBe(true);
  });
});

// The deploy guide moved from the README to docs/deploy.md, which the README links (DL-217).
describe('the deploy guide', () => {
  test('names both addresses, the deploy from a clean checkout of a release tag, the one-time login and the live check', () => {
    const guide = readText('docs/deploy.md');

    expect(guide).toContain('https://heroesims.pages.dev');
    expect(guide).toContain(addresses.worker);
    expect(guide).toContain('npm run deploy');
    expect(guide).toContain('npx wrangler login');
    expect(guide).toContain('clean checkout of its release tag');
    expect(guide).toContain('npm run e2e:live -w web');
    expect(guide).toContain('HEROESIM_LIVE_URL');
  });

  test('is linked from the README', () => {
    expect(readText('README.md')).toContain('(docs/deploy.md)');
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
  /** `git status` alone fails, as on a damaged index, which `tag` and `rev-parse` never read. */
  statusFails?: boolean;
  /** Each child's exit status; `null` for one ended by a signal, as `spawnSync` reports it. */
  build?: number | null;
  worker?: number | null;
  pages?: number | null;
  targets?: string[];
  environment?: string;
  pagesCommit?: string;
  records?: boolean;
  /** Wrangler's record starts with a line it left unfinished, as an interrupted append leaves one. */
  brokenRecordLine?: boolean;
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
        alias: 'https://main.heroesims.pages.dev',
        environment: checkout.environment ?? 'production',
        production_branch: 'main',
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

/**
 * git answering as the checkout would, npm building, and wrangler writing its record: all
 * pretended. git answers only the three reads the guard makes, each asked whole, so that a test
 * proves what the guard asks as well as what it does with the answer (DL-97).
 */
function fakeSpawn(checkout: Checkout): { spawn: Spawn; calls: Call[] } {
  const calls: Call[] = [];
  const exited = (status: number | null | undefined): SpawnResult => ({ status: status === undefined ? 0 : status });
  const spawn: Spawn = (command, args, options): SpawnResult => {
    calls.push({ command, args: [...args], options });
    if (command === 'git') {
      if (checkout.gitFails) return { status: 128, stdout: '' };
      const asked = args.join(' ');
      if (asked === 'status --porcelain') {
        return checkout.statusFails ? { status: 128, stdout: '' } : { status: 0, stdout: checkout.porcelain ?? '' };
      }
      if (asked === 'tag --points-at HEAD') return { status: 0, stdout: checkout.tags ?? 'v1.0.1\n' };
      if (asked === 'rev-parse HEAD') return { status: 0, stdout: `${commit}\n` };
      throw new Error(`an unexpected git ${asked}`);
    }
    if (args[0]?.endsWith('npm-cli.js')) return exited(checkout.build);

    const pages = args.includes('pages');
    const record = options.env?.WRANGLER_OUTPUT_FILE_PATH;
    if (record !== undefined && checkout.records !== false) {
      if (checkout.brokenRecordLine) appendFileSync(record, '{"type":"wrangler-sess\n');
      for (const entry of recordEntries(pages, checkout)) {
        appendFileSync(record, `${JSON.stringify({ ...entry, timestamp: '2026-09-28T08:00:00.000Z' })}\n`);
      }
    }
    return exited(pages ? checkout.pages : checkout.worker);
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
    // Its empty output is no clean tree (DL-97).
    ['git status alone fails', { statusFails: true }, 'git could not read the checkout'],
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

  // The redirect `pages deploy` follows is found by the same walk, and `.wrangler/` is ignored by
  // git, so the clean check never sees it (DL-97).
  const redirect = path.join('.wrangler', 'deploy', 'config.json');

  test.each(['wrangler.json', 'wrangler.jsonc', 'wrangler.toml', redirect])(
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

  test.each(['wrangler.json', redirect])('when a %s sits in web/ beside wrangler.jsonc', (name) => {
    const place = machine();
    const stray = touch(path.join(place.webDir, name));

    const { status, output, builds } = run({}, { webDir: place.webDir });

    expect(status).not.toBe(0);
    expect(output).toContain(`a wrangler configuration sits at ${stray}`);
    expect(builds).toEqual([]);
  });

  test.each(['.env', '.env.local'])(
    'when a %s sits in web/, which wrangler loads into its environment on every run (DL-97)',
    (name) => {
      const place = machine();
      const file = touch(path.join(place.webDir, name));

      const { status, output, builds, wrangler } = run({}, { webDir: place.webDir });

      expect(status).not.toBe(0);
      expect(output).toContain(`${file} would be loaded into wrangler's environment`);
      expect(builds).toEqual([]);
      expect(wrangler).toEqual([]);
    },
  );

  test('when given any argument but --dry-run, so that a mistyped one never deploys', () => {
    const { status, output, builds } = run({}, { argv: ['--dryrun'] });

    expect(status).not.toBe(0);
    expect(output).toContain('it takes only --dry-run, and was given --dryrun');
    expect(builds).toEqual([]);
  });

  // npm keeps a flag given before its own `--` and hands the script only `npm_config_<name>`: from
  // the root, whose deploy is `npm run deploy -w web`, even `npm run deploy -- --dryrun` arrives so
  // (npm 11.19.1; DL-97).
  test.each([
    ['npm_config_dryrun', '--dryrun, or --dryRun'],
    ['npm_config_dry_rn', '--dry-rn'],
    ['npm_config_dyr_run', '--dyr-run'],
  ])('when npm hands it %s, a mistyped --dry-run (%s) given to npm', (key) => {
    const { status, output, builds, wrangler } = run({}, { env: { [key]: 'true' } });

    expect(status).not.toBe(0);
    expect(output).toContain(`npm handed it ${key}=true: a flag npm was given, not --dry-run`);
    expect(builds).toEqual([]);
    expect(wrangler).toEqual([]);
  });

  test('but not for the names npm sets for any script it runs', () => {
    const env = {
      npm_command: 'run-script',
      npm_lifecycle_event: 'deploy',
      npm_lifecycle_script: 'node scripts/deploy.mjs',
      npm_config_cache: '/home/someone/.npm',
      npm_config_local_prefix: '/home/someone/heroesim',
      npm_config_user_agent: 'npm/11.19.1 node/v26.9.0',
    };

    expect(run({}, { env }).wrangler).toHaveLength(2);
  });

  test('when npm is not where npm_execpath says', () => {
    const elsewhere = path.join(temporaryDir(), 'npm-cli.js');
    const { status, output, builds } = run({}, { env: { npm_execpath: elsewhere } });

    expect(status).not.toBe(0);
    expect(output).toContain(`npm's npm-cli.js is not at ${elsewhere}`);
    expect(builds).toEqual([]);
  });

  test("when npx-cli.js is not beside npm_execpath's npm-cli.js", () => {
    const dir = temporaryDir();
    const npmCli = touch(path.join(dir, 'npm-cli.js'));
    const { status, output, builds } = run({}, { env: { npm_execpath: npmCli } });

    expect(status).not.toBe(0);
    expect(output).toContain(`npm's npx-cli.js is not at ${path.join(dir, 'npx-cli.js')}`);
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

  test('asks git exactly what it reads: status --porcelain, tag --points-at HEAD and rev-parse HEAD (DL-97)', () => {
    // Every tag in the repository, untracked files left out, or HEAD's parent would each let
    // through a checkout the guard exists to refuse, or record the wrong commit.
    const { calls } = run();

    expect(calls.filter((call) => call.command === 'git').map((call) => call.args)).toEqual([
      ['status', '--porcelain'],
      ['tag', '--points-at', 'HEAD'],
      ['rev-parse', 'HEAD'],
    ]);
  });

  test("hands wrangler the deploy's own environment, the login's profile, PATH and an account id, and the build the same less any Cloudflare credential (DL-97; DL-124)", () => {
    // Assembled, so that the credential scan below stays quiet.
    const account = ['CLOUDFLARE', 'ACCOUNT', 'ID'].join('_');
    const token = ['CLOUDFLARE', 'API', 'TOKEN'].join('_');
    const plain = { PATH: '/usr/bin', HOME: '/home/someone', USERPROFILE: 'C:\\Users\\someone' };
    const env = { ...plain, [account]: 'the-account', [token]: 'the-token' };
    const { builds, wrangler } = run({}, { env });

    expect(wrangler).toHaveLength(2);
    for (const call of wrangler) expect(call.options.env).toMatchObject(env);
    // The build runs third-party code, and is handed no Cloudflare credential (DL-124).
    expect(builds).toHaveLength(1);
    expect(builds[0]?.options.env).toEqual(plain);
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
    // spawnSync gives a child ended by a signal no status and no error (DL-97).
    ['the build is ended by a signal', { build: null }, 1, 0],
    ["the Worker's upload is ended by a signal", { worker: null }, 1, 1],
  ])('stops at the first failure: when %s', (_case, checkout, status, uploads) => {
    const result = run(checkout);

    expect(result.status).toBe(status);
    expect(result.builds).toHaveLength(1);
    expect(result.wrangler).toHaveLength(uploads);
  });

  test("when Pages fails after the Worker took the build, prints the Worker's record for the entry that records the attempt (DL-97)", () => {
    const { status, output } = run({ pages: 7 });

    expect(status).toBe(7);
    expect(output).toContain('the Pages upload failed after the Worker took this build');
    expect(output).toContain(
      `Worker          wrangler 4.142.0; version 11111111-2222-3333-4444-555555555555; at ${addresses.worker}; ` +
        '2026-09-28T08:00:00.000Z',
    );
    expect(output).toContain(`commit          ${commit}`);
    expect(output).not.toContain('Pages           wrangler');
    expect(output).not.toContain('WARNING');
    // And the address failure, when the Worker went live somewhere else: Pages's status still stands.
    const elsewhere = run({ pages: 7, targets: ['https://heroesim.someone-else.workers.dev'] });
    expect(elsewhere.status).toBe(7);
    expect(elsewhere.output).toContain(
      `FAILED: the Worker is served at https://heroesim.someone-else.workers.dev, not at ${addresses.worker}`,
    );
  });

  test('reads its record past a line wrangler left unfinished (DL-97)', () => {
    const { status, output } = run({ brokenRecordLine: true });

    expect(status).toBe(0);
    expect(output).toContain(`version 11111111-2222-3333-4444-555555555555; at ${addresses.worker}`);
    expect(output).toContain('https://0a1b2c3d.heroesims.pages.dev; environment production');
    expect(output).not.toContain('WARNING');
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

  test("fails loudly, naming the override, when the Worker is not at the live check's address (DL-124)", () => {
    const { status, output } = run({ targets: ['https://heroesim.someone-else.workers.dev'] });

    expect(status).toBe(1);
    expect(output).toContain(
      `FAILED: the Worker is served at https://heroesim.someone-else.workers.dev, not at ${addresses.worker}`,
    );
    expect(output).toContain('HEROESIM_LIVE_URL');
  });

  test('fails when Pages took the deploy as a preview or recorded another commit (DL-124 item 5)', () => {
    const preview = run({ environment: 'preview' });
    expect(preview.status).toBe(1);
    expect(preview.output).toContain(
      `FAILED: Pages took this deploy as preview, not production: ${addresses.pages} still serves what it did. ` +
        "Set the Pages project's production branch to main.",
    );

    const another = run({ pagesCommit: 'f'.repeat(40) });
    expect(another.status).toBe(1);
    expect(another.output).toContain(`FAILED: Pages recorded commit ${'f'.repeat(40)}, not ${commit}.`);

    const abbreviated = run({ pagesCommit: commit.slice(0, 7) });
    expect(abbreviated.status).toBe(0);
    expect(abbreviated.output).not.toContain('FAILED');
  });

  test('only warns when wrangler wrote no record: the uploads succeeded', () => {
    const unrecorded = run({ records: false });
    expect(unrecorded.status).toBe(0);
    expect(unrecorded.output).toContain("WARNING: wrangler wrote no record of the Worker's deploy");
    expect(unrecorded.output).toContain('WARNING: wrangler wrote no record of the Pages deploy');
    expect(unrecorded.output).not.toContain('FAILED');
  });

  test('writes the record to the file HEROESIM_DEPLOY_RECORD names, with what failed, for the run and the GitHub Release (DL-124 item 8)', () => {
    const file = path.join(temporaryDir(), 'record.txt');

    expect(run({}, { env: { HEROESIM_DEPLOY_RECORD: file } }).status).toBe(0);
    const record = readFileSync(file, 'utf8');
    expect(record).toContain('  tag             v1.0.1\n');
    expect(record).toContain(`  commit          ${commit}\n`);
    expect(record).toContain(`Worker          wrangler 4.142.0; version 11111111-2222-3333-4444-555555555555; at ${addresses.worker}`);
    expect(record).toContain('Pages           wrangler 4.142.0; https://0a1b2c3d.heroesims.pages.dev; environment production');
    expect(record).not.toContain('FAILED');

    run({ environment: 'preview' }, { env: { HEROESIM_DEPLOY_RECORD: file } });
    expect(readFileSync(file, 'utf8')).toContain('  FAILED: Pages took this deploy as preview, not production');

    run({ pages: 7 }, { env: { HEROESIM_DEPLOY_RECORD: file } });
    expect(readFileSync(file, 'utf8')).toContain('  Pages           failed after the Worker took the build');
  });

  test('writes no record file without HEROESIM_DEPLOY_RECORD, nor when refused', () => {
    const file = path.join(temporaryDir(), 'record.txt');

    run({ tags: '' }, { env: { HEROESIM_DEPLOY_RECORD: file } });
    expect(existsSync(file)).toBe(false);
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
    expect(output).toContain('npx -y wrangler@4 pages deploy dist --project-name heroesims --branch main');
  });

  test.each(['', 'false'])('npm_config_dry_run=%j is no dry run', (value) => {
    expect(run({}, { env: { npm_config_dry_run: value } }).wrangler).toHaveLength(2);
  });
});

// What a Cloudflare credential looks like written down: an account id (32 hex digits) or a token
// given a value, in JSON, TOML, YAML or an environment line. The names alone, a placeholder and a
// `${{ secrets.… }}` reference are not credentials, and the documents name them. The space a pattern
// allows is a line's (`[^\S\n]`), so that one is matched against a whole file and never spans lines.
const credentialPatterns: readonly [kind: string, pattern: RegExp][] = [
  ['an account id', /account[_-]?id["']?[^\S\n]*[:=][^\S\n]*["']?[0-9a-f]{32}(?![0-9a-f])/i],
  [
    'a Cloudflare token or account id given a value',
    /\b(?:CLOUDFLARE|CF)_(?:API_TOKEN|API_KEY|ACCOUNT_ID)["']?[^\S\n]*[:=][^\S\n]*["']?(?![$<{])[\w-]{8,}/,
  ],
  ['an OAuth token given a value', /\b(?:oauth_token|refresh_token)["']?[^\S\n]*[:=][^\S\n]*["'][^"'\s]{16,}/],
  ['a bearer token', /\bBearer[^\S\n]+[\w.~+/-]{20,}/],
];

function credentialsIn(text: string): string[] {
  return credentialPatterns.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
}

/**
 * Each credential `text` holds, as `file:line: kind`: each pattern tried once against the whole
 * text, and the line counted only on a hit, since splitting every file into lines was the scan's
 * cost (DL-214).
 */
function credentialLines(file: string, text: string): string[] {
  const found: string[] = [];
  for (const [kind, pattern] of credentialPatterns) {
    if (!pattern.test(text)) continue;
    for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
      found.push(`${file}:${text.slice(0, match.index).split('\n').length}: ${kind}`);
    }
  }
  return found;
}

describe('the repository holds no deploy credential', () => {
  test('.gitignore keeps .wrangler/ out wherever wrangler runs: the root or web/', () => {
    const ignored = readText('.gitignore').split(/\r?\n/);
    const probes = ['.wrangler/cache/pages.json', 'web/.wrangler/cache/pages.json', 'web/.wrangler/tmp/bundle.js'];

    expect(ignored).toContain('.wrangler/');
    // One spawn for the three: git prints each path it ignores.
    const checked = git(['check-ignore', '--no-index', ...probes]);
    expect(checked.status).toBe(0);
    expect(checked.stdout.split(/\r?\n/).filter((line) => line !== '')).toEqual(probes);
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
    ['the Pages command', 'npx -y wrangler@4 pages deploy dist --project-name heroesims --branch main'],
    ['a commit hash', `commit ${accountId}12345678`],
    ['a Guild name', 'The Company of the Lantern-Bearers of Aldmoor'],
  ])('the scan passes %s', (_kind, text) => {
    expect(credentialsIn(text)).toEqual([]);
  });

  test("a file's scan names each credential planted in it by its line, and none written across two lines (DL-214)", () => {
    const planted = [
      '# The deploy',
      'CLOUDFLARE_ACCOUNT_ID=${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
      `export CLOUDFLARE_API_TOKEN=${token}`,
      '',
      `{"account_id":"${accountId}"}`,
      'CLOUDFLARE_API_TOKEN:',
      `  ${token}`,
      `Authorization: Bearer ${token}`,
    ].join('\r\n');

    expect(credentialLines('planted.env', planted).sort()).toEqual([
      'planted.env:3: a Cloudflare token or account id given a value',
      'planted.env:5: an account id',
      'planted.env:8: a bearer token',
    ]);
    expect(credentialLines('clean.md', 'CLOUDFLARE_API_TOKEN\n')).toEqual([]);
  });

  test("no pattern's name and value on two lines are a credential, and a kind found on two lines is named on each (DL-214)", () => {
    const planted = [
      'account_id =',
      `"${accountId}"`,
      'oauth_token:',
      `"${token}"`,
      'Authorization: Bearer',
      `  ${token}`,
      `{"refresh_token":"${token}"}`,
      `Bearer ${token}`,
      `Bearer ${token}`,
    ].join('\n');

    expect(credentialLines('planted.yml', planted).sort()).toEqual([
      'planted.yml:7: an OAuth token given a value',
      'planted.yml:8: a bearer token',
      'planted.yml:9: a bearer token',
    ]);
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
      found.push(...credentialLines(file, bytes.toString('utf8')));
    }

    expect(found).toEqual([]);
  });
});

// A release deploys from CI (DL-122, DL-124). `main` is production: CI raises a release branch's
// pull request to it (release-pr.yml); merging it tags the line's next patch and calls the deploy
// (release.yml); the deploy refuses a tag not on `main` or older than the newest release, checks,
// runs the browser specs, reads Pages's production branch, deploys and reads both addresses live,
// then publishes the record (deploy.yml); and every Monday the watch reads production (watch.yml, DL-299).
// The Cloudflare credentials are the `production` environment's secrets, read only by the steps
// that talk to Cloudflare.
function workflowText(name: string): string {
  return readText(`.github/workflows/${name}`).replace(/\r\n/g, '\n');
}

/** A job of a workflow, from its name to the next job's. */
function jobOf(workflow: string, job: string): string {
  const start = workflow.indexOf(`\n  ${job}:\n`);
  expect(start, job).toBeGreaterThan(-1);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

/** A job's steps, each as its text from `- ` to the next. */
function stepsOf(job: string): string[] {
  return job.split(/\n {6}- /).slice(1);
}

const secretReference = /\$\{\{ secrets\.[A-Z_]+ \}\}/g;
const secretsIn = (text: string): string[] => text.match(secretReference) ?? [];

describe('the deploy workflow (DL-122, DL-124)', () => {
  const workflow = workflowText('deploy.yml');
  const deployJob = jobOf(workflow, 'deploy');
  const steps = stepsOf(deployJob);
  const stepWith = (text: string): number => {
    const at = steps.findIndex((step) => step.includes(text));
    expect(at, text).toBeGreaterThan(-1);
    return at;
  };

  test('runs on a pushed v* tag, by hand for a tag already pushed, or called by release.yml, never on a branch', () => {
    expect(workflow).toMatch(/\non:\n {2}push:\n {4}tags:\n {6}- 'v\*'\n {2}workflow_dispatch:/);
    expect(workflow).toMatch(/\n {2}workflow_call:\n {4}inputs:\n {6}tag:/);
    expect(workflow).toMatch(/\n {6}allow_older:\n(?: {8}.*\n)* {8}type: boolean\n {8}default: false/);
    expect(workflow).not.toMatch(/\n {4}branches:/);
    expect(workflow).toContain("format('refs/tags/{0}', inputs.tag)");
    expect(workflow).toContain('fetch-depth: 0');
  });

  test('refuses a tag not on main, and one older than the newest release unless allow_older is ticked', () => {
    const guard = steps[stepWith('The tag is the newest release, on main')] ?? '';

    expect(guard).toContain("import { productionBranch } from './web/scripts/deploy.mjs'");
    expect(guard).toContain('git merge-base --is-ancestor HEAD "origin/$branch"');
    expect(guard).toContain('ALLOW_OLDER: ${{ inputs.allow_older == true }}');
    expect(guard).toMatch(/if \[ "\$ALLOW_OLDER" = "true" \]; then\n[^\n]*rollback[^\n]*\n {10}else\n {12}node web\/scripts\/release\.mjs newest "\$tag"/);
  });

  test('checks, runs the browser specs, reads Pages, deploys, then reads both addresses live, one run at a time', () => {
    const guard = stepWith('The tag is the newest release, on main');
    const checks = [stepWith('npm run lint'), stepWith('npm run typecheck'), stepWith('npm test')];
    const specs = stepWith('npm run e2e -w web');
    const pages = stepWith('node web/scripts/cloudflare.mjs pages');
    const deployed = stepWith('run: npm run deploy');
    const live = stepWith('npm run e2e:live -w web');

    expect(checks.every((at) => at > guard && at < specs)).toBe(true);
    expect(specs).toBeLessThan(pages);
    expect(pages).toBeLessThan(deployed);
    expect(live).toBeGreaterThan(deployed);
    expect(deployJob).toContain('group: deploy-production');
    expect(deployJob).toContain('cancel-in-progress: false');
  });

  // DL-235: the suite and the specs are skipped only on tested.mjs's `run=false`, and the lint, the
  // typecheck, the build (inside `npm run deploy`) and the live check always run.
  test('runs the suite and the specs again unless tested.mjs finds the tree passed check already', () => {
    const decided = stepWith('node web/scripts/tested.mjs "$EVENT"');
    const skippable = "if: steps.tested.outputs.run != 'false'";

    expect(steps[decided]).toMatch(/^name: [^\n]+\n {8}id: tested\n/);
    expect(steps[decided]).toContain('GH_TOKEN: ${{ github.token }}');
    expect(steps[decided]).toContain('EVENT: ${{ github.event_name }}');
    expect(decided).toBeGreaterThan(stepWith('The tag is the newest release, on main'));
    for (const text of ['npm test', 'npm run e2e -w web']) {
      expect(decided).toBeLessThan(stepWith(text));
      expect(steps[stepWith(text)]).toContain(skippable);
    }
    expect(steps.filter((step) => step.includes(skippable))).toHaveLength(2);
    // No other step is conditional but the record, written always: the lint, the typecheck, the
    // build and the live check run whatever tested.mjs said.
    const conditional = steps.filter((step) => /\n {8}if: /.test(`\n${step}`)).map((step) => step.split('\n')[0]);
    expect(conditional).toEqual(['run: npm test', 'name: The browser specs', 'name: The record']);
    expect(steps[stepWith('name: The record')]).toContain('if: always()');
    expect(deployJob).not.toMatch(/\n {4}if: /);
    expect(deployJob).toMatch(/\n {4}permissions:\n {6}contents: read\n {6}actions: read\n/);
  });

  test('hands the credentials only to the two steps that talk to Cloudflare, from the production environment', () => {
    expect(deployJob).toMatch(/environment:\n {6}name: production/);
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\n/);
    const holding = steps.filter((step) => secretsIn(step).length > 0);
    expect(holding.map((step) => step.split('\n')[0])).toEqual(['name: Pages publishes main as production', 'name: Deploy to the Worker and Pages']);
    for (const step of holding) {
      expect(secretsIn(step)).toEqual(['${{ secrets.CLOUDFLARE_API_TOKEN }}', '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}']);
    }
    expect(credentialsIn(workflow)).toEqual([]);
  });

  test('writes the record to the run and the GitHub Release, from a job that holds no Cloudflare secret', () => {
    const publish = jobOf(workflow, 'publish');

    expect(steps[stepWith('run: npm run deploy')]).toContain('HEROESIM_DEPLOY_RECORD: ${{ runner.temp }}/deploy-record.txt');
    expect(steps[stepWith('name: The record')]).toContain('GITHUB_STEP_SUMMARY');
    expect(publish).toContain('needs: deploy');
    expect(publish).toMatch(/permissions:\n {6}contents: write/);
    expect(publish).toContain('gh release create "$TAG"');
    expect(secretsIn(publish)).toEqual([]);
    expect(deployJob).not.toContain('contents: write');
  });
});

describe('the release workflows (DL-124)', () => {
  test("release.yml: a push to main tags the merged release branch's next patch and calls the deploy", () => {
    const workflow = workflowText('release.yml');

    expect(workflow).toMatch(/\non:\n {2}push:\n {4}branches:\n {6}- main\n/);
    expect(workflow).toContain('repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/pulls');
    expect(workflow).toContain('git diff --quiet "$head" HEAD');
    expect(workflow).toContain('node web/scripts/release.mjs next "$BRANCH"');
    expect(workflow).toContain('git push origin "refs/tags/$tag"');
    expect(jobOf(workflow, 'tag')).toMatch(/permissions:\n {6}contents: write/);
    expect(jobOf(workflow, 'deploy')).toMatch(
      /uses: \.\/\.github\/workflows\/deploy\.yml\n {4}with:\n {6}tag: \$\{\{ needs\.tag\.outputs\.tag \}\}\n {4}secrets: inherit/,
    );
    // A called workflow's token has no more than its caller grants: the deploy reads check's runs (DL-235).
    expect(jobOf(workflow, 'deploy')).toMatch(/permissions:\n {6}contents: write\n {6}actions: read\n/);
    expect(secretsIn(workflow)).toEqual([]);
  });

  test('release-pr.yml: a push to a release branch opens or updates its pull request to main', () => {
    const workflow = workflowText('release-pr.yml');

    expect(workflow).toMatch(/\non:\n {2}push:\n {4}branches:\n {6}- 'v\*-release'\n/);
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\n {2}pull-requests: write\n/);
    expect(workflow).toContain('node web/scripts/release.mjs next "$BRANCH"');
    expect(workflow).toContain('gh pr create --repo "$GITHUB_REPOSITORY" --base main --head "$BRANCH"');
    expect(workflow).toContain('gh pr edit "$number"');
    expect(secretsIn(workflow)).toEqual([]);
  });

  test('watch.yml: every week, the live check and the Cloudflare checks, and an issue on a failure', () => {
    const workflow = workflowText('watch.yml');
    const cloudflare = jobOf(workflow, 'cloudflare');
    const report = jobOf(workflow, 'report');

    expect(workflow).toMatch(/\non:\n {2}schedule:\n {4}- cron: '[^']+'\n {2}workflow_dispatch:/);
    expect(jobOf(workflow, 'live')).toContain('npm run e2e:live -w web');
    expect(cloudflare).toMatch(/environment:\n {6}name: production\n {6}deployment: false/);
    expect(cloudflare).toContain('node web/scripts/cloudflare.mjs token');
    expect(cloudflare).toContain('node web/scripts/cloudflare.mjs pages');
    expect(report).toContain("contains(needs.*.result, 'failure')");
    expect(report).toContain('gh issue create');
    expect(secretsIn(jobOf(workflow, 'live'))).toEqual([]);
    expect(secretsIn(report)).toEqual([]);
    expect(credentialsIn(workflow)).toEqual([]);
  });

  test('check.yml: every line by pattern, and the browser specs, with no deploy and no secret', () => {
    const check = workflowText('check.yml');

    expect(check).toMatch(/\n {2}push:\n {4}branches:\n {6}- 'v\*-dev'\n {6}- 'v\*-release'\n/);
    expect(check).toMatch(/\n {2}pull_request:\n {4}branches:\n {6}- 'v\*-dev'\n {6}- 'v\*-release'\n/);
    expect(jobOf(check, 'e2e')).toContain('npm run e2e -w web');
    expect(check).not.toContain('npm run deploy');
    expect(check).not.toContain('secrets.');
  });

  // DL-299: a superseded run is cancelled, but never on a release branch, and a hung run is capped.
  test('check.yml: a newer run cancels an older one except on a release branch, and a run is capped', () => {
    const check = workflowText('check.yml');

    expect(check).toContain("cancel-in-progress: ${{ !endsWith(github.ref_name, '-release') }}");
    expect(jobOf(check, 'check')).toMatch(/timeout-minutes: \d+/);
    expect(jobOf(check, 'e2e')).toMatch(/timeout-minutes: \d+/);
  });

  // DL-235: the floor is the Node of `.node-version`, so one `check` on it tests the floor.
  test('check.yml: one check on .node-version, the floor that engines declares', () => {
    const check = workflowText('check.yml');
    const major = readText('.node-version').trim().split('.')[0];
    const lock = JSON.parse(readText('package-lock.json')) as { packages: Record<string, { engines?: { node?: string } }> };

    expect(jobOf(check, 'check')).toContain("node-version-file: '.node-version'");
    expect(check).not.toContain('matrix');
    expect(check).not.toMatch(/node-version: /);
    expect(jobOf(check, 'check')).toContain('run: npm test');
    expect((readManifest('package.json') as Manifest & { engines?: { node?: string } }).engines?.node).toBe(`>=${major}`);
    expect(lock.packages['']?.engines?.node).toBe(`>=${major}`);
  });

  test('no workflow names a secret but the two Cloudflare credentials', () => {
    const names = ['check.yml', 'deploy.yml', 'release.yml', 'release-pr.yml', 'watch.yml'].flatMap((name) => secretsIn(workflowText(name)));

    expect(new Set(names)).toEqual(new Set(['${{ secrets.CLOUDFLARE_API_TOKEN }}', '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}']));
  });

  // DL-147: the newest dev branch, a patch's `v#.#.#-dev` or a line's `v#.#-dev`, the same for both.
  test("Dependabot updates into one dev branch, a line's or a patch's, never main or a release branch", () => {
    const dependabot = readText('.github/dependabot.yml').replace(/\r\n/g, '\n');
    const targets = [...dependabot.matchAll(/target-branch: (\S+)/g)].map((match) => match[1]);

    expect(targets).toHaveLength(2);
    expect(new Set(targets).size).toBe(1);
    for (const target of targets) expect(target).toMatch(/^v\d+\.\d+(\.\d+)?-dev$/);
  });
});
