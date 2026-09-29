import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

// What the browser specs share (M7-S4, DL-67): the overflow check M7-S3 left to M7-S4, and the
// page's own controls for starting a game and playing Turns.
//
// The page is views in a shell (M9-S3, DL-103): a region is on the page only while its view is
// open, so a spec opens the view first, through the navigation, as a player would. A region of the
// game menu is found by opening it.
//
// Seven views since M9-F2 (DL-112 item 5, DL-115), in one order at every width: the Guildmaster,
// Guild, Roster, Board, Rankings, Market and History. Under 600px the Guildmaster, the Market and
// the History are under "More". The Guildmaster's button is named by the Guildmaster's name, and
// described as "Guildmaster". The Guild's parts, Home and Hall, are tabs under its heading, each
// part the panel its tab names.

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
 * holds it. What the page hides, and the file input behind its button, are not counted. A name in
 * a line of the History is a target in a sentence, whose size the sentence's line sets (WCAG 2.5.5
 * and 2.5.8 except such a target): it is held to 24px high, WCAG 2.5.8's least, and not to 44px
 * (M9-S5, DL-105).
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
      if (element.matches('.entry button.name')) {
        if (height < 23.5) found.push(`a name in a line, "${named(target)}": ${Math.round(width)}×${Math.round(height)}`);
        continue;
      }
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

/** Each view, by its heading, which is the name the navigation gives it but the Guildmaster's. */
export type ViewName = 'Guildmaster' | 'Guild' | 'Roster' | 'Board' | 'Rankings' | 'Market' | 'History';

/** Every view in the navigation's order (M9-F2). */
export const viewNames: readonly ViewName[] = ['Guildmaster', 'Guild', 'Roster', 'Board', 'Rankings', 'Market', 'History'];

/** The Guild's parts, each a tab under its heading (M9-F2). */
export type GuildPartName = 'Home' | 'Hall';

/** The Guild's parts in the order of their tabs. */
export const guildPartNames: readonly GuildPartName[] = ['Home', 'Hall'];

/**
 * The navigation's button for `view`, where it is shown: in the bar or the rail, or in "More" once
 * it is open. Its name is the view's, then any count: Chromium puts a space before the count's
 * comma, as the label is a block of its own. The Guildmaster's is named by the Guildmaster's name,
 * so it is found as the one button with a description, which is "Guildmaster" (M9-F2).
 */
export function navItem(scope: Scope, view: ViewName): Locator {
  const nav = scope.getByRole('navigation', { name: 'Views' });
  if (view === 'Guildmaster') return nav.locator('button.nav__button[aria-describedby]:visible');
  return nav.getByRole('button', { name: new RegExp(`^${view}\\s*(,|$)`) });
}

/** Opens `view` from the navigation, through "More" where the bar keeps it there, and gives its region. */
export async function openView(scope: Scope, view: ViewName): Promise<Locator> {
  const nav = scope.getByRole('navigation', { name: 'Views' });
  const item = navItem(scope, view);
  if ((await item.count()) === 0) await nav.getByRole('button', { name: /^More( ?,|$)/ }).click();
  await item.first().click();
  const shown = region(scope, view);
  await expect(shown).toBeVisible();
  return shown;
}

/** Opens the Guild's `part` from its tab, the Guild opened first, and gives the part's panel (M9-F2). */
export async function guildPart(scope: Scope, part: GuildPartName): Promise<Locator> {
  const guild = await openView(scope, 'Guild');
  await guild.getByRole('tab', { name: part, exact: true }).click();
  const shown = guild.getByRole('tabpanel', { name: part, exact: true });
  await expect(shown).toBeVisible();
  return shown;
}

/** The view each part of a view is in, by its heading. */
const viewOf: Readonly<Record<string, ViewName>> = {
  'Transfer Offers': 'Roster',
  'Unattached pool': 'Roster',
  Guilds: 'Rankings',
  Patrons: 'Rankings',
  Buy: 'Market',
  Sell: 'Market',
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

/**
 * The History view, opened, on the History `whose` names: the player's Guild's, where it opens,
 * unless another is given (M9-S5, DL-105).
 */
export async function history(scope: Scope, whose?: string): Promise<Locator> {
  const shown = await openView(scope, 'History');
  if (whose !== undefined) await shown.getByRole('group', { name: 'Whose History' }).getByRole('button', { name: whose, exact: true }).click();
  return shown;
}

/**
 * The sentences of the History's lines in `scope` that match `pattern`, each read whole, its names'
 * words and all; a line's own, never one folded under it.
 */
export function historyText(scope: Locator, pattern: RegExp): Locator {
  return scope.locator('.entry__text').filter({ hasText: pattern });
}

/** The line a sentence is, for its marks: `is-new`, `entry--mine`. */
export function lineOf(text: Locator): Locator {
  return text.locator('xpath=ancestor::li[1]');
}

/** The Day and time of day a line is grouped under. */
export function groupOf(text: Locator): Locator {
  return text.locator('xpath=ancestor::div[contains(concat(" ", @class, " "), " history-group ")][1]/*[1]');
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
