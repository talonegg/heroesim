import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';

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

/**
 * One named control is at least 40×40 CSS pixels. A control the player cannot press is
 * still a control they will aim at, so a disabled one is held to the same floor (E8-S3).
 */
export async function expectTapTarget(target: Locator, what: string): Promise<void> {
  const box = await target.boundingBox();
  expect(box, `${what} has no box`).not.toBeNull();
  expect(box?.width ?? 0, `${what} is too narrow`).toBeGreaterThanOrEqual(40);
  expect(box?.height ?? 0, `${what} is too short`).toBeGreaterThanOrEqual(40);
}

/**
 * Nothing scrolls sideways: not the page, and not any box inside it (E8-S3 acceptance).
 *
 * The document on its own is not enough. A secondary view renders inside `.sheet`, which
 * carries `overflow-y: auto` and therefore computes `overflow-x: auto` too — so a child
 * too wide for it scrolls *within the sheet* and the document never widens by a pixel.
 * The same is true of the Report log. Every scrollable box on the page is measured, which
 * is the only way the check can see what the player would have to drag.
 */
export async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const boxes = await page.evaluate(() => {
    /** Enough of an element to find it again in the source. */
    function describe(element: Element): string {
      const testid = element.getAttribute('data-testid');
      const classes = [...element.classList].map((name) => `.${name}`).join('');
      return `<${element.tagName.toLowerCase()}${classes}${
        testid === null ? '' : ` data-testid="${testid}"`
      }>`;
    }

    const measured = [
      {
        what: 'the page',
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
    ];
    for (const element of [...document.querySelectorAll('*')]) {
      const { overflowX } = getComputedStyle(element);
      if (overflowX !== 'auto' && overflowX !== 'scroll') continue;
      // A box with no width of its own — display:none, or not laid out — cannot be dragged.
      if (element.clientWidth === 0) continue;
      measured.push({
        what: describe(element),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      });
    }
    return measured;
  });

  for (const box of boxes) {
    expect(
      box.scrollWidth,
      `${where}: ${box.what} scrolls sideways (${box.scrollWidth} > ${box.clientWidth})`,
    ).toBeLessThanOrEqual(box.clientWidth);
  }
}
