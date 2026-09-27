// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// The deploy (M7-S5, DL-68; INPUTS 7.8 and 7.9). `npm run deploy` builds and gates the page here,
// then uploads web/dist to the Cloudflare Pages project `heroesims`, from this machine, after a
// one-time `npx wrangler login`. The login's token lives in wrangler's own directory under the
// user profile, and wrangler keeps its working state in `.wrangler/` wherever it runs. These tests
// keep the command what INPUTS 7.8 says and keep every credential and `.wrangler/` out of the
// repository. Like the bundle gate (bundle.test.ts) they run on every `npm test`, in CI included.

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

describe('the deploy command', () => {
  test("builds and gates the page, then uploads web/dist to the heroesims project's production branch", () => {
    // `--branch` is written out, never inferred from git: a deploy from any other branch would be a
    // preview that never reaches https://heroesims.pages.dev (v1's DL-30 item 3; the epic's §3).
    expect(readManifest('web/package.json').scripts?.deploy).toBe(
      'npm run build && npx -y wrangler@4 pages deploy dist --project-name heroesims --branch v1.0-release',
    );
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
});

describe('the README', () => {
  test('names the URL, the deploy command and the one-time login', () => {
    const readme = readText('README.md');

    expect(readme).toContain('https://heroesims.pages.dev');
    expect(readme).toContain('npm run deploy');
    expect(readme).toContain('npx wrangler login');
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
    ['the deploy command', 'npx -y wrangler@4 pages deploy dist --project-name heroesims --branch v1.0-release'],
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
