import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Where the screenshot evidence is written, one folder per project (E8-S5). */
export const VERIFICATION_DIR = path.resolve(webDir, '..', 'docs', 'verification');

/**
 * The seed every browser test starts from. Fixed, so the Heroes and Commissions the
 * assertions name are real ones rather than placeholders (E8-S5 acceptance).
 */
export const FIXED_SEED = 'heroesim-e2e-01';

/** The widths E8-S3 requires no horizontal overflow at. */
export const WIDTHS = [320, 360, 414, 768, 1024, 1280] as const;

/** Start a Career from the fixed seed and wait for the Board to be on screen. */
export async function startCareer(page: Page, seed = FIXED_SEED): Promise<void> {
  await page.goto('/');
  await page.getByTestId('seed').fill(seed);
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('guild-name')).toBeVisible();
}

/**
 * Bring a pane to the front. Above 600px every pane is already on screen and the bottom
 * bar is not rendered, so this does nothing — which is the point of doing the layout in
 * CSS rather than in JavaScript.
 */
export async function showPane(page: Page, pane: 'board' | 'roster' | 'report'): Promise<void> {
  const button = page.getByTestId(`bar-${pane}`);
  if (await button.isVisible()) await button.click();
  await expect(page.getByTestId(`pane-${pane}`)).toBeVisible();
}

/** Every visible button and link is at least 40×40 CSS pixels (E8-S3 acceptance). */
export async function expectTapTargets(page: Page, where: string): Promise<void> {
  const targets = page.locator('button:visible, a:visible');
  const total = await targets.count();
  expect(total, `${where}: expected something to tap`).toBeGreaterThan(0);
  for (let index = 0; index < total; index += 1) {
    const target = targets.nth(index);
    const box = await target.boundingBox();
    const label = (await target.textContent())?.trim().slice(0, 40) ?? '(no text)';
    expect(box, `${where}: "${label}" has no box`).not.toBeNull();
    expect(box?.width ?? 0, `${where}: "${label}" is too narrow`).toBeGreaterThanOrEqual(40);
    expect(box?.height ?? 0, `${where}: "${label}" is too short`).toBeGreaterThanOrEqual(40);
  }
}

/** The page never scrolls sideways (E8-S3 acceptance). */
export async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${where}: the page scrolls sideways (${overflow.scrollWidth} > ${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}
