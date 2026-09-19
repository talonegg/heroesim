import { expect, test } from '@playwright/test';
import { FIXED_SEED, showPane, startCareer } from './helpers';

/**
 * The journey E8-S5 asks for, run on all three device projects against the built
 * bundle: a new Career from a fixed seed, a Party sent, advanced until it came back,
 * the report read, saved, reloaded and loaded again.
 *
 * The network listener runs for the whole of it: the browser never calls anything
 * (CLAUDE.md invariant 9).
 */

const ORIGIN = 'http://127.0.0.1:4173';
const LOCAL_SCHEMES = ['data:', 'blob:', 'about:'];

test('plays a Career, saves it, reloads and loads it again', async ({ page }) => {
  const offOrigin: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(ORIGIN)) return;
    if (LOCAL_SCHEMES.some((scheme) => url.startsWith(scheme))) return;
    offOrigin.push(url);
  });

  // 1. A new Career from a fixed seed.
  await startCareer(page, FIXED_SEED);

  // 2. Read the Board, open a Commission, toggle two Heroes, commit.
  await showPane(page, 'board');
  const commissions = page.getByTestId('commission');
  await expect(commissions.first()).toBeVisible();
  await commissions.first().getByRole('button').click();

  const toggles = page.getByTestId('party-toggle');
  await expect(toggles.first()).toBeVisible();
  expect(await toggles.count()).toBeGreaterThanOrEqual(2);
  const sent = [
    ((await toggles.nth(0).textContent()) ?? '').split(' · ')[0]?.trim() ?? '',
    ((await toggles.nth(1).textContent()) ?? '').split(' · ')[0]?.trim() ?? '',
  ];
  expect(sent[0]).not.toEqual('');
  await toggles.nth(0).click();
  await toggles.nth(1).click();
  await page.getByTestId('commit-party').click();
  await expect(page.getByTestId('commit-party')).toHaveCount(0);

  // 3. Advance until the Party comes back.
  const returned = page.getByTestId('para-return');
  for (let attempt = 0; attempt < 30 && (await returned.count()) === 0; attempt += 1) {
    await page.getByTestId('advance').click();
  }
  await expect(returned.first()).toBeAttached();

  // 4. A Hero who went is named in the report.
  await showPane(page, 'report');
  const report = (await page.getByTestId('report-log').textContent()) ?? '';
  expect(
    sent.some((name) => name !== '' && report.includes(name)),
    `expected one of ${sent.join(' or ')} in the report`,
  ).toBe(true);

  // 5. Save to slot 1.
  await page.getByTestId('open-saves').click();
  await page.getByTestId('save-1').click();
  await expect(page.getByTestId('slot-1')).toContainText('Day');
  await page.getByRole('button', { name: 'Close' }).click();

  const savedDay = await page.getByTestId('day').textContent();
  const savedCoin = await page.getByTestId('coin').textContent();
  const savedRoster = await page.getByTestId('hero').count();
  expect(savedRoster).toBeGreaterThan(0);

  // 6. Reload the page. Nothing is resumed automatically.
  await page.reload();
  await expect(page.getByTestId('begin')).toBeVisible();

  // 7. Load slot 1: the Day, the coin and the Roster are what was saved.
  await page.getByTestId('open-saves').click();
  await page.getByTestId('load-1').click();
  await expect(page.getByTestId('guild-name')).toBeVisible();
  await expect(page.getByTestId('day')).toHaveText(savedDay ?? '');
  await expect(page.getByTestId('coin')).toHaveText(savedCoin ?? '');
  await expect(page.getByTestId('hero')).toHaveCount(savedRoster);

  expect(offOrigin, `the page requested ${offOrigin.join(', ')}`).toEqual([]);
});
