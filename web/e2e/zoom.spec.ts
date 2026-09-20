import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectTapTargets,
  startCareer,
  VERIFICATION_DIR,
} from './helpers';

/**
 * E8-S3's last acceptance box: **at 200% browser zoom on the desktop viewport the layout
 * falls back to the tablet arrangement rather than overflowing.**
 *
 * **How zoom is emulated, and why this is the faithful way.** Browser zoom (Ctrl-+) is not
 * a transform over a rendered page: Chromium implements it by changing how many **CSS
 * pixels** the window is worth and raising the device pixel ratio to match. At 200% a
 * 1280×800 window is a 640×400 CSS-pixel viewport drawn into 1280×800 device pixels, so
 * `window.innerWidth` reads 640 and **every media query is re-evaluated at 640px**. A
 * Playwright context with `viewport: 640×400` and `deviceScaleFactor: 2` reproduces
 * exactly that — the same two numbers the page can observe, and the same media-query
 * result.
 *
 * The alternatives were rejected for a reason each. CDP `Emulation.setPageScaleFactor` is
 * **pinch** zoom: it scales the visual viewport and leaves the layout viewport alone, so
 * no media query re-runs and this check would pass without testing anything. A CSS
 * `zoom`/`transform: scale()` on the root is a rendering trick with the same flaw and is
 * not what the browser's own control does. `Emulation.setDeviceMetricsOverride` with the
 * same two numbers is equivalent to the context above and would do — it is simply the same
 * emulation through a lower-level door, and the context is the one Playwright supports
 * directly.
 *
 * The context is built here rather than taken from the project, so the check is of a
 * **desktop window at 200%** whichever project is running it, which is what the box names.
 */

/** A 1280×800 desktop window at 200% zoom, in the two numbers the page can observe. */
const ZOOMED = { width: 640, height: 400 } as const;

test('a desktop window at 200% zoom falls back to the tablet arrangement', async (
  { browser },
  testInfo,
) => {
  const context = await browser.newContext({
    viewport: { ...ZOOMED },
    deviceScaleFactor: 2,
    baseURL: 'http://127.0.0.1:4173',
  });
  const page = await context.newPage();
  try {
    await startCareer(page);

    // The emulation itself, asserted rather than assumed: this is what a page sees at
    // 200% on a 1280×800 window.
    const seen = await page.evaluate(() => ({
      width: window.innerWidth,
      ratio: window.devicePixelRatio,
      // The media queries the three layouts are chosen by (`styles.css`).
      tablet: window.matchMedia('(min-width: 600px)').matches,
      desktop: window.matchMedia('(min-width: 1024px)').matches,
    }));
    expect(seen.width).toBe(ZOOMED.width);
    expect(seen.ratio).toBe(2);
    expect(seen.tablet, 'the tablet breakpoint is met at 640 CSS px').toBe(true);
    expect(seen.desktop, 'the desktop breakpoint is not').toBe(false);

    // Two columns, not three and not one: the tablet arrangement, read off the grid the
    // CSS actually computed rather than off the breakpoint that was meant to apply.
    const columns = await page
      .locator('.panes')
      .evaluate((panes) => getComputedStyle(panes).gridTemplateColumns.split(/\s+/).length);
    expect(columns, 'the panes grid is two columns wide').toBe(2);

    // The bottom bar belongs to the single-column layout and is gone above 600px, so its
    // absence is the other half of "not the mobile arrangement".
    await expect(page.getByTestId('pane-bar')).toBeHidden();

    // All three panes are on the page at once — Board and Roster side by side, the Report
    // under them — which is what the tablet arrangement is.
    for (const pane of ['board', 'roster', 'report'] as const) {
      await expect(page.getByTestId(`pane-${pane}`)).toBeVisible();
    }
    const tops: number[] = [];
    for (const pane of ['board', 'roster', 'report'] as const) {
      const box = await page.getByTestId(`pane-${pane}`).boundingBox();
      expect(box, `pane-${pane} has no box`).not.toBeNull();
      tops.push(box?.y ?? 0);
    }
    const [board = 0, roster = 0, report = 0] = tops;
    expect(Math.abs(board - roster), 'Board and Roster share a row').toBeLessThan(4);
    expect(report, 'the Report sits under both of them').toBeGreaterThan(board);

    // And the thing the box is actually about: nothing overflows, and nothing has shrunk
    // below a finger.
    await expectNoHorizontalOverflow(page, 'a desktop window at 200% zoom');
    await expectTapTargets(page, 'a desktop window at 200% zoom');

    // Evidence, written once and from the desktop project, because it is a desktop window
    // that is being zoomed whichever project runs the check.
    if (testInfo.project.name === 'desktop') {
      await page.screenshot({
        path: path.join(VERIFICATION_DIR, 'desktop', 'zoom-200.png'),
        fullPage: true,
      });
    }
  } finally {
    await context.close();
  }
});
