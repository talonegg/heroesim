import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectTapTargets,
  showPane,
  startCareer,
  VERIFICATION_DIR,
  WIDTHS,
} from './helpers';

/**
 * Overflow and tap-target checks on every pane and every sheet, at the project's own
 * viewport and at each width E8-S3 names — plus a screenshot of each layout under
 * `docs/verification/<project>/`.
 *
 * The screenshots are evidence, not assertions: nothing here fails on a pixel diff.
 */

type View = 'board' | 'roster' | 'report' | 'party' | 'slots';

/**
 * Put a Party in the field and some story in the Report, so the evidence shows the panes
 * carrying real content rather than an empty Day 1.
 */
async function seedTheStory(page: Page): Promise<void> {
  await showPane(page, 'board');
  await page.getByTestId('commission').first().getByRole('button').click();
  const toggles = page.getByTestId('party-toggle');
  await toggles.first().waitFor();
  await toggles.nth(0).click();
  await toggles.nth(1).click();
  await page.getByTestId('commit-party').click();
  const returned = page.getByTestId('para-return');
  for (let attempt = 0; attempt < 30 && (await returned.count()) === 0; attempt += 1) {
    await page.getByTestId('advance').click();
  }
}

async function openView(page: Page, view: View): Promise<void> {
  // Sheets are opened from the Board, so close whatever is open before switching.
  const close = page.getByRole('button', { name: 'Close' });
  if (await close.isVisible()) await close.click();

  if (view === 'party') {
    await showPane(page, 'board');
    await page.getByTestId('commission').first().getByRole('button').click();
    await page.getByTestId('commit-party').waitFor();
    return;
  }
  if (view === 'slots') {
    await page.getByTestId('open-saves').click();
    await page.getByTestId('slot-1').waitFor();
    return;
  }
  await showPane(page, view);
}

for (const view of ['board', 'roster', 'report', 'party', 'slots'] as const) {
  test(`${view} fits and can be tapped at every width`, async ({ page }, testInfo) => {
    const projectViewport = page.viewportSize();
    await startCareer(page);
    await seedTheStory(page);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
      await openView(page, view);
      await expectNoHorizontalOverflow(page, `${view} at ${String(width)}px`);
      await expectTapTargets(page, `${view} at ${String(width)}px`);
    }

    // Back to the project's own device size for the checks that matter most, and for
    // the evidence.
    if (projectViewport !== null) await page.setViewportSize(projectViewport);
    await openView(page, view);
    await expectNoHorizontalOverflow(page, `${view} at the ${testInfo.project.name} viewport`);
    await expectTapTargets(page, `${view} at the ${testInfo.project.name} viewport`);

    // On the tablet the Report sits under the two columns, so bring it into the frame
    // before the viewport shot — the evidence is meant to show the pane, not the space
    // above it. The log is pinned to its newest Paragraph again too: the app does that
    // whenever a Paragraph arrives, but the width sweep above takes the pane in and out
    // of being scrollable, which resets it.
    if (view === 'report') {
      await page.getByTestId('pane-report').scrollIntoViewIfNeeded();
      await page
        .getByTestId('report-log')
        .evaluate((log) => {
          log.scrollTop = log.scrollHeight;
        });
    }

    await page.screenshot({
      path: path.join(VERIFICATION_DIR, testInfo.project.name, `${view}.png`),
      fullPage: testInfo.project.name === 'desktop',
    });

    // Both themes follow `prefers-color-scheme` and both are kept as evidence.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectNoHorizontalOverflow(page, `${view} in the dark theme`);
    await page.screenshot({
      path: path.join(VERIFICATION_DIR, testInfo.project.name, `${view}-dark.png`),
      fullPage: testInfo.project.name === 'desktop',
    });
    await page.emulateMedia({ colorScheme: 'light' });
  });
}

test('the start screen and the reckoning fit and can be tapped', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  await page.goto('/');

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expectNoHorizontalOverflow(page, `start at ${String(width)}px`);
    await expectTapTargets(page, `start at ${String(width)}px`);
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'start.png'),
    fullPage: testInfo.project.name === 'desktop',
  });

  // A one-year Career reaches its reckoning in a handful of Advances, so the ending —
  // which offers nothing but a new Career — is evidence too.
  await page.getByTestId('years').fill('1');
  await page.getByTestId('begin').click();
  const reckoning = page.getByTestId('reckoning');
  for (let attempt = 0; attempt < 120 && (await reckoning.count()) === 0; attempt += 1) {
    await page.getByTestId('advance').click();
  }
  await reckoning.waitFor();
  // A finished Career offers nothing but a new one.
  await expect(page.getByTestId('advance')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Send a Party/ })).toHaveCount(0);
  await expect(page.getByTestId('new-career')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'the reckoning');
  await expectTapTargets(page, 'the reckoning');
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'reckoning.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});
