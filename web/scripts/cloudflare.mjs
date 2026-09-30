/**
 * What CI asks Cloudflare before a deploy and every day after (DL-124 items 5 and 10), with the
 * `production` environment's two secrets, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`:
 *
 *   node web/scripts/cloudflare.mjs pages   fails unless the Pages project's production branch
 *                                           is `productionBranch` (deploy.mjs), so that a deploy
 *                                           never makes a preview of a release
 *   node web/scripts/cloudflare.mjs token   fails unless the token is active and expires in no
 *                                           fewer than 30 days, or never
 *
 * Cloudflare's own endpoints, as wrangler 4 calls them: `GET /accounts/{account}/pages/projects/
 * {project}`, whose `production_branch` wrangler compares with `--branch`, and `GET /user/tokens/
 * verify`, or `GET /accounts/{account}/tokens/verify` for a token the account owns. Nothing
 * printed holds the token or the account id: Cloudflare's own messages have the account id taken
 * out before they are shown. Its tests are src/cloudflare.test.ts, with a fake fetch.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pagesProject, productionBranch } from './deploy.mjs';

const api = 'https://api.cloudflare.com/client/v4';
/** A token that expires sooner than this many days is reported, so that it is replaced in time. */
export const tokenWarningDays = 30;
const dayMs = 24 * 60 * 60 * 1000;

/** The two secrets from `env`, or why they cannot be read. */
function credentials(env) {
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !account) return { refusal: 'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must both be set.' };
  return { token, account };
}

/** GET an endpoint of Cloudflare's API: `{ result }`, or `{ problem }` in words with the account id taken out. */
async function get(fetch, token, account, endpoint) {
  const hidden = (text) => text.replaceAll(account, '<account>');
  let response;
  try {
    response = await fetch(`${api}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    return { problem: hidden(`Cloudflare could not be reached: ${error instanceof Error ? error.message : String(error)}`) };
  }
  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok || body?.success !== true) {
    const said = Array.isArray(body?.errors) ? body.errors.map((error) => error?.message).filter(Boolean).join('; ') : '';
    return { problem: hidden(`Cloudflare answered ${response.status}${said ? `: ${said}` : ''}`) };
  }
  return { result: body.result };
}

/** Why a deploy would make a preview, or `null` when Pages's production branch is `productionBranch`. */
export async function pagesRefusal({ env = process.env, fetch = globalThis.fetch } = {}) {
  const secrets = credentials(env);
  if (secrets.refusal) return secrets.refusal;
  const { token, account } = secrets;
  const answer = await get(fetch, token, account, `/accounts/${account}/pages/projects/${pagesProject}`);
  if (answer.problem) return `the Pages project ${pagesProject} could not be read: ${answer.problem}.`;
  const branch = answer.result?.production_branch;
  if (typeof branch !== 'string' || branch === '') return `Cloudflare named no production branch for ${pagesProject}.`;
  if (branch !== productionBranch) {
    return (
      `the Pages project ${pagesProject}'s production branch is ${branch}, not ${productionBranch}: a deploy would be a ` +
      `preview. Set it to ${productionBranch} in the dashboard (Workers & Pages, ${pagesProject}, Settings, Branch control).`
    );
  }
  return null;
}

/**
 * Why the token needs attention, or `null`: it must be active, and expire no sooner than
 * `tokenWarningDays` from `now`, or never. A user's token is verified as one, then an account's.
 */
export async function tokenRefusal({ env = process.env, fetch = globalThis.fetch, now = () => new Date() } = {}) {
  const secrets = credentials(env);
  if (secrets.refusal) return secrets.refusal;
  const { token, account } = secrets;
  let answer = await get(fetch, token, account, '/user/tokens/verify');
  if (answer.problem) {
    const owned = await get(fetch, token, account, `/accounts/${account}/tokens/verify`);
    if (owned.problem) return `the token could not be verified: as a user's, ${answer.problem}; as the account's, ${owned.problem}.`;
    answer = owned;
  }
  const { status, expires_on: expiresOn } = answer.result ?? {};
  if (status !== 'active') return `the token is ${status ?? 'of no known status'}, not active: replace it.`;
  if (expiresOn) {
    const daysLeft = Math.floor((Date.parse(expiresOn) - now().getTime()) / dayMs);
    if (!Number.isFinite(daysLeft)) return `the token's expiry, ${expiresOn}, is no date.`;
    if (daysLeft < tokenWarningDays) {
      return `the token expires on ${expiresOn}, in ${Math.max(daysLeft, 0)} day(s): replace it, and the production environment's secret.`;
    }
  }
  return null;
}

/** The command line: `pages` or `token`. Returns the exit status. */
export async function main({ argv = process.argv.slice(2), env = process.env, fetch = globalThis.fetch, now, log = console.log, warn = console.error } = {}) {
  const [command, ...rest] = argv;
  if (!['pages', 'token'].includes(command) || rest.length > 0) {
    warn('cloudflare: usage: cloudflare.mjs pages | cloudflare.mjs token');
    return 2;
  }
  const refusal = command === 'pages' ? await pagesRefusal({ env, fetch }) : await tokenRefusal({ env, fetch, now });
  if (refusal !== null) {
    warn(`cloudflare: ${refusal}`);
    return 1;
  }
  log(command === 'pages' ? `cloudflare: Pages publishes ${productionBranch} as production.` : 'cloudflare: the token is active.');
  return 0;
}

const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url);
if (isMain) process.exitCode = await main();
