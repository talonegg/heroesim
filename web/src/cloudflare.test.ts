// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { main, pagesRefusal, tokenRefusal, tokenWarningDays, type Fetch } from '../scripts/cloudflare.mjs';
import { pagesProject } from '../scripts/deploy.mjs';

// What CI asks Cloudflare before a deploy and every day (DL-124 items 5 and 10): that Pages
// publishes `main` as production, so that a deploy is never a preview, and that the token is
// active and not about to expire. Cloudflare is a fake fetch. The credentials are short made-up
// words, too short for the repository's credential scan to mistake them (deploy.test.ts).

const token = 't0ken';
const account = 'acct1';
const env = { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account };

type Answer = { status?: number; body: unknown } | Error;

/** Cloudflare answering each endpoint as `answers` says, and a 404 to any other; the URLs asked. */
function cloudflare(answers: Record<string, Answer>): { fetch: Fetch; asked: string[]; headers: Record<string, string>[] } {
  const asked: string[] = [];
  const headers: Record<string, string>[] = [];
  const fetch: Fetch = (url, init) => {
    const endpoint = url.replace('https://api.cloudflare.com/client/v4', '');
    asked.push(endpoint);
    headers.push(init.headers);
    const answer = answers[endpoint] ?? { status: 404, body: { success: false, errors: [{ message: 'Not found' }] } };
    if (answer instanceof Error) return Promise.reject(answer);
    const status = answer.status ?? 200;
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(answer.body) });
  };
  return { fetch, asked, headers };
}

const project = `/accounts/${account}/pages/projects/${pagesProject}`;
const pagesSays = (branch: unknown): Answer => ({ body: { success: true, result: { name: pagesProject, production_branch: branch } } });

describe('before a deploy, Pages', () => {
  test('is read with the token, and passes when it publishes main as production', async () => {
    const { fetch, asked, headers } = cloudflare({ [project]: pagesSays('main') });

    await expect(pagesRefusal({ env, fetch })).resolves.toBeNull();
    expect(asked).toEqual([project]);
    expect(headers[0]).toEqual({ Authorization: `Bearer ${token}` });
  });

  test('refuses, saying where to change it, when it publishes another branch', async () => {
    const refusal = await pagesRefusal({ env, fetch: cloudflare({ [project]: pagesSays('v1.1-release') }).fetch });

    expect(refusal).toContain("production branch is v1.1-release, not main: a deploy would be a preview");
    expect(refusal).toContain('Branch control');
  });

  test('refuses when Cloudflare names no branch, answers an error, or cannot be reached, never printing the account id', async () => {
    const refusals = await Promise.all([
      pagesRefusal({ env, fetch: cloudflare({ [project]: pagesSays(undefined) }).fetch }),
      pagesRefusal({
        env,
        fetch: cloudflare({ [project]: { status: 403, body: { success: false, errors: [{ message: `Authentication error for ${account}` }] } } }).fetch,
      }),
      pagesRefusal({ env, fetch: cloudflare({ [project]: new Error(`connect ECONNREFUSED ${account}`) }).fetch }),
      pagesRefusal({ env, fetch: cloudflare({ [project]: { status: 502, body: 'not json' } }).fetch }),
    ]);

    expect(refusals[0]).toContain('named no production branch');
    expect(refusals[1]).toContain('Cloudflare answered 403: Authentication error for <account>');
    expect(refusals[2]).toContain('could not be reached');
    expect(refusals[3]).toContain('Cloudflare answered 502');
    for (const refusal of refusals) expect(refusal).not.toContain(account);
  });

  test('refuses without both secrets, asking nothing', async () => {
    const { fetch, asked } = cloudflare({});

    await expect(pagesRefusal({ env: { CLOUDFLARE_API_TOKEN: token }, fetch })).resolves.toContain('must both be set');
    await expect(pagesRefusal({ env: { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: ' ' }, fetch })).resolves.toContain('must both be set');
    expect(asked).toEqual([]);
  });
});

describe('every day, the token', () => {
  const now = () => new Date('2026-10-01T00:00:00Z');
  const verified = (result: object): Answer => ({ body: { success: true, result } });
  const inDays = (days: number) => new Date(now().getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  test("passes when it is a user's, active, and expires in 30 days or more, or never", async () => {
    for (const result of [{ status: 'active' }, { status: 'active', expires_on: inDays(tokenWarningDays) }]) {
      const { fetch, asked } = cloudflare({ '/user/tokens/verify': verified(result) });
      await expect(tokenRefusal({ env, fetch, now })).resolves.toBeNull();
      expect(asked).toEqual(['/user/tokens/verify']);
    }
  });

  test("is verified as the account's when it is not a user's", async () => {
    const { fetch, asked } = cloudflare({ [`/accounts/${account}/tokens/verify`]: verified({ status: 'active' }) });

    await expect(tokenRefusal({ env, fetch, now })).resolves.toBeNull();
    expect(asked).toEqual(['/user/tokens/verify', `/accounts/${account}/tokens/verify`]);
  });

  test('is reported when it expires within 30 days, or is not active, or cannot be verified', async () => {
    const soon = await tokenRefusal({ env, fetch: cloudflare({ '/user/tokens/verify': verified({ status: 'active', expires_on: inDays(12) }) }).fetch, now });
    const gone = await tokenRefusal({ env, fetch: cloudflare({ '/user/tokens/verify': verified({ status: 'active', expires_on: inDays(-3) }) }).fetch, now });
    const disabled = await tokenRefusal({ env, fetch: cloudflare({ '/user/tokens/verify': verified({ status: 'disabled' }) }).fetch, now });
    const unknown = await tokenRefusal({ env, fetch: cloudflare({}).fetch, now });

    expect(soon).toContain('in 12 day(s)');
    expect(gone).toContain('in 0 day(s)');
    expect(disabled).toContain('the token is disabled, not active');
    expect(unknown).toContain("could not be verified: as a user's, Cloudflare answered 404: Not found; as the account's");
    expect(unknown).not.toContain(account);
  });
});

describe('the command line', () => {
  const run = async (argv: string[], answers: Record<string, Answer>) => {
    const output: string[] = [];
    const status = await main({ argv, env, fetch: cloudflare(answers).fetch, log: (line) => output.push(line), warn: (line) => output.push(line) });
    return { status, output: output.join('\n') };
  };

  test('passes or fails each check, with its reason', async () => {
    await expect(run(['pages'], { [project]: pagesSays('main') })).resolves.toEqual({ status: 0, output: 'cloudflare: Pages publishes main as production.' });
    await expect(run(['pages'], { [project]: pagesSays('v1.1-release') })).resolves.toMatchObject({ status: 1 });
    await expect(run(['token'], { '/user/tokens/verify': { body: { success: true, result: { status: 'active' } } } })).resolves.toEqual({
      status: 0,
      output: 'cloudflare: the token is active.',
    });
  });

  test('takes exactly one check', async () => {
    for (const argv of [[], ['deploy'], ['pages', 'token']]) await expect(run(argv, {})).resolves.toMatchObject({ status: 2 });
  });
});
