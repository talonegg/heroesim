import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

// What the browser specs share (M7-S4, DL-67): the overflow check M7-S3 left to M7-S4, and the
// page's own controls for starting a game and playing Turns.

/**
 * The page is no wider than the viewport: no horizontal scroll at 360px or at 1280px (M7 §0, the
 * M7-S3 box proved here). A wide table scrolls inside its own box, which this does not count.
 */
export async function expectNoHorizontalOverflow(page: Page, when: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${when}: the page is ${scrollWidth}px wide in a viewport ${clientWidth}px wide`).toBeLessThanOrEqual(clientWidth);
}

/** A section of the page by its heading, in the page, a part of it, or a frame holding it. */
export function region(scope: Page | Locator | FrameLocator, name: string): Locator {
  return scope.getByRole('region', { name, exact: true });
}

/** Starts a game through the new-game form, and waits for its header. */
export async function startGame(page: Page, { guild, master, seed }: { guild: string; master: string; seed: string }): Promise<void> {
  const form = region(page, 'A new game');
  await form.getByRole('textbox', { name: 'Guild name', exact: true }).fill(guild);
  await form.getByRole('textbox', { name: /Guildmaster/ }).fill(master);
  await form.getByRole('textbox', { name: 'Seed', exact: true }).fill(seed);
  await form.getByRole('button', { name: 'Start the game' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(guild);
  await expect(page.getByTestId('time')).toHaveText('Day 0, morning, Year 0');
}

/** Plays Turns with `button`, and waits until they are played: the time has moved and the page is idle. */
export async function playTurns(page: Page, button: Locator): Promise<string> {
  const time = page.getByTestId('time');
  const before = await time.textContent();
  await button.click();
  await expect(time).not.toHaveText(before ?? '');
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  return (await time.textContent()) ?? '';
}

export function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
