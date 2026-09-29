import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

// What the browser specs share (M7-S4, DL-67): the overflow check M7-S3 left to M7-S4, and the
// page's own controls for starting a game and playing Turns.
//
// The page is views in a shell (M9-S3, DL-103): a region is on the page only while its view is
// open, so a spec opens the view first, through the navigation, as a player would. Under 600px
// the Hall and the Rankings are under "More". A region of the game menu is found by opening it.

type Scope = Page | FrameLocator;

/**
 * The page is no wider than the viewport: no horizontal scroll at 360px, 820px or 1280px (M7 §0,
 * the M7-S3 box proved here; M9-S3's three widths). A wide table scrolls inside its own box, which
 * this does not count.
 */
export async function expectNoHorizontalOverflow(page: Page, when: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${when}: the page is ${scrollWidth}px wide in a viewport ${clientWidth}px wide`).toBeLessThanOrEqual(clientWidth);
}

/**
 * Every control on the screen is a target at least 44px each way (M7 §0, M9's rules): a button, a
 * disclosure's summary, a field, a select, the file picker's button; a checkbox by the label that
 * holds it. What the page hides, and the file input behind its button, are not counted.
 */
export async function expectTargets(page: Page, when: string): Promise<void> {
  const small = await page.evaluate(() => {
    const found: string[] = [];
    const named = (element: Element): string =>
      (element.getAttribute('aria-label') ?? element.textContent ?? element.getAttribute('name') ?? element.tagName).trim().slice(0, 48);
    for (const element of document.querySelectorAll('button, summary, select, input, a[href], label.file-button')) {
      if (element.closest('.visually-hidden') !== null || element.classList.contains('visually-hidden')) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      // A box or a radio button is pressed by the label that holds it (the Guildmaster's Traits, M9-S7).
      const target = element.matches('input[type="checkbox"], input[type="radio"]') ? (element.closest('label') ?? element) : element;
      const { width, height } = target.getBoundingClientRect();
      if (width < 43.5 || height < 43.5) found.push(`${target.tagName.toLowerCase()} "${named(target)}": ${Math.round(width)}×${Math.round(height)}`);
    }
    return found;
  });
  expect(small, `${when}: controls under 44px`).toEqual([]);
}

/** A region of the page by its heading, in the page, a part of it, or a frame holding it. */
export function region(scope: Scope | Locator, name: string): Locator {
  return scope.getByRole('region', { name, exact: true });
}

/** The status bar, which stays in view on every view. */
export function statusBar(scope: Scope): Locator {
  return scope.getByRole('banner');
}

/** Each view, by the name the navigation and its heading give it. */
export type ViewName = 'Guild' | 'Board' | 'Roster' | 'Hall' | 'Rankings' | 'History';

/** Opens `view` from the navigation, through "More" where the bar keeps it there, and gives its region. */
export async function openView(scope: Scope, view: ViewName): Promise<Locator> {
  const nav = scope.getByRole('navigation', { name: 'Views' });
  // Its name is the view's, then any count: Chromium puts a space before the count's comma, as the
  // label is a block of its own.
  const item = nav.getByRole('button', { name: new RegExp(`^${view}\\s*(,|$)`) });
  if ((await item.count()) === 0) await nav.getByRole('button', { name: 'More', exact: true }).click();
  await item.first().click();
  const shown = region(scope, view);
  await expect(shown).toBeVisible();
  return shown;
}

/** The view each part of a view is in, by its heading. */
const viewOf: Readonly<Record<string, ViewName>> = {
  'Transfer Offers': 'Roster',
  'Unattached pool': 'Roster',
  Guildmaster: 'Hall',
  'What the Guild holds': 'Hall',
  Market: 'Hall',
  Guilds: 'Rankings',
  Patrons: 'Rankings',
  'Since your last action': 'History',
};

/** Opens the view a part is in, and gives the part's region. */
export async function part(scope: Scope, name: string): Promise<Locator> {
  const view = viewOf[name];
  if (view === undefined) throw new Error(`no part called ${name}`);
  await openView(scope, view);
  const shown = region(scope, name);
  await expect(shown).toBeVisible();
  return shown;
}

/** Opens the game menu, and gives the dialog. */
export async function openGameMenu(scope: Scope): Promise<Locator> {
  const menu = scope.getByRole('dialog', { name: 'Game' });
  if ((await menu.count()) === 0) await statusBar(scope).getByRole('button', { name: 'Game', exact: true }).click();
  await expect(menu).toBeVisible();
  return menu;
}

/** The game menu's "This game": export, the saves kept in this browser, loading a file, a new game. */
export async function thisGame(scope: Scope): Promise<Locator> {
  return region(await openGameMenu(scope), 'This game');
}

/** Closes the game menu, if it is open. */
export async function closeGameMenu(scope: Scope): Promise<void> {
  const menu = scope.getByRole('dialog', { name: 'Game' });
  if ((await menu.count()) > 0) await menu.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(menu).toHaveCount(0);
}

/** The Heroes on the player's Roster, the Roster view opened. */
export async function rosterList(scope: Scope): Promise<Locator> {
  const roster = await openView(scope, 'Roster');
  return roster.getByRole('list', { name: 'Heroes on the Roster' });
}

/** "Your Guildmaster" in the new-game form, opened. */
export async function guildmasterSetup(page: Page): Promise<Locator> {
  const form = region(page, 'A new game');
  const setup = form.locator('details', { has: page.getByText('Your Guildmaster', { exact: true }) });
  if ((await setup.getAttribute('open')) === null) await setup.getByText('Your Guildmaster', { exact: true }).click();
  await expect(setup.getByLabel('Sex', { exact: true })).toBeVisible();
  return setup;
}

/** A Guildmaster Trait's box in the new-game form, by the Trait's name. */
export function traitBox(scope: Locator, name: string): Locator {
  return scope.getByRole('checkbox', { name: new RegExp(`^${escaped(name)} (Costs|Refunds)`) });
}

/**
 * Starts a game through the new-game form, and waits for its status bar. What was set under "Your
 * Guildmaster" before it is kept (M9-S7).
 */
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
