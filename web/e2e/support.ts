import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

// What the browser specs share (DL-67): the overflow check DL-66 left to it, and the
// page's own controls for starting a game and playing Turns.
//
// The page is views in a shell (DL-103): a region is on the page only while its view is
// open, so a spec opens the view first, through the navigation, as a player would. A region of the
// game menu is found by opening it.
//
// Seven views (DL-112 item 5, DL-115), in one order at every width: the Guildmaster,
// Guild, Roster, Board, Rankings, Market and History. Under 600px the Guildmaster, the Market and
// the History are under "More". The Guildmaster's button is named by the Guildmaster's name, and
// described as "Guildmaster". The Guild's parts, Home and Hall, are tabs under its heading, each
// part the panel its tab names. `dispatchAParty` sends a Party through the Party builder, for the
// journey and for the fast forward that stops at its return (DL-118).

type Scope = Page | FrameLocator;

/**
 * The page is no wider than the viewport: no horizontal scroll at 360px, 820px or 1280px (M7 §0,
 * the box DL-66 proved here; DL-103's three widths). A wide table scrolls inside its own box, which
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
 * (DL-105); so is a name in a Quest report's lines, which are the History's words (DL-118), and
 * one in the Treasury's ledger or the Stores' "Carried by", which are sentences too (DL-112).
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
      // A box or a radio button is pressed by the label that holds it (the Guildmaster's Traits, DL-107).
      const target = element.matches('input[type="checkbox"], input[type="radio"]') ? (element.closest('label') ?? element) : element;
      const { width, height } = target.getBoundingClientRect();
      if (element.matches('.entry button.name, .report button.name, .ledger-table button.name, .stores button.name')) {
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

/** Every view in the navigation's order (DL-115). */
export const viewNames: readonly ViewName[] = ['Guildmaster', 'Guild', 'Roster', 'Board', 'Rankings', 'Market', 'History'];

/** The Guild's parts, each a tab under its heading (DL-115; Stores and Treasury, DL-116). */
export type GuildPartName = 'Home' | 'Hall' | 'Stores' | 'Treasury';

/** The Guild's parts in the order of their tabs. */
export const guildPartNames: readonly GuildPartName[] = ['Home', 'Hall', 'Stores', 'Treasury'];

/**
 * The navigation's button for `view`, where it is shown: in the bar or the rail, or in "More" once
 * it is open. Its name is the view's, then any count: Chromium puts a space before the count's
 * comma, as the label is a block of its own. The Guildmaster's is named by the Guildmaster's name,
 * so it is found as the one button with a description, which is "Guildmaster" (DL-115).
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

/** Opens the Guild's `part` from its tab, the Guild opened first, and gives the part's panel (DL-115). */
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
 * unless another is given (DL-105).
 */
export async function history(scope: Scope, whose?: string): Promise<Locator> {
  const shown = await openView(scope, 'History');
  if (whose !== undefined) await shown.getByRole('group', { name: 'Whose History' }).getByRole('button', { name: whose, exact: true }).click();
  return shown;
}

/**
 * The whole History, opened from the game menu's "Debug: Whole History" (DL-117): the
 * History view on every entry, unfolded, each with its event type.
 */
export async function debugHistory(scope: Scope): Promise<Locator> {
  await (await openGameMenu(scope)).getByRole('button', { name: 'Debug: Whole History', exact: true }).click();
  const shown = region(scope, 'History');
  await expect(shown.getByRole('heading', { level: 3 })).toHaveText('Debug: Whole History');
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

/** The date and time of day a line is grouped under. */
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

/**
 * "Your Guildmaster" in the new-game form, opened, on one of its two ways (DL-149): "Choose
 * myself" unless `way` says "Choose for me", which the form opens on.
 */
export async function guildmasterSetup(page: Page, way: 'Choose for me' | 'Choose myself' = 'Choose myself'): Promise<Locator> {
  const form = region(page, 'A new game');
  const setup = form.locator('details', { has: page.getByText('Your Guildmaster', { exact: true }) });
  if ((await setup.getAttribute('open')) === null) await setup.getByText('Your Guildmaster', { exact: true }).click();
  await setup.getByRole('radiogroup', { name: 'Who chooses' }).getByRole('radio', { name: way, exact: true }).check();
  if (way === 'Choose myself') await expect(setup.getByLabel('Sex', { exact: true })).toBeVisible();
  else await expect(setup.getByTestId('guildmaster-preview-live')).toBeAttached();
  return setup;
}

/**
 * With "Choose myself", the sex, the age and a picture chosen (DL-149), which "Start the game" waits
 * for: `Female Portrait 1` unless another is named.
 */
export async function chooseGuildmaster(
  setup: Locator,
  { sex = 'female', age = '34', picture = `${sex === 'female' ? 'Female' : 'Male'} Portrait 1` }: { sex?: 'female' | 'male'; age?: string; picture?: string } = {},
): Promise<void> {
  await setup.getByLabel('Sex', { exact: true }).selectOption(sex);
  await setup.getByLabel('Age', { exact: true }).selectOption(age);
  await setup.getByRole('group', { name: 'Portrait', exact: true }).getByRole('radio', { name: picture, exact: true }).check();
}

/** A Guildmaster Trait's box in the new-game form, by the Trait's name. */
export function traitBox(scope: Locator, name: string): Locator {
  return scope.getByRole('checkbox', { name: new RegExp(`^${escaped(name)} (Costs|Refunds)`) });
}

/**
 * Starts a game through the new-game form, and waits for its status bar. What was set under "Your
 * Guildmaster" before it is kept (DL-107).
 */
export async function startGame(page: Page, { guild, master, seed }: { guild: string; master: string; seed: string }): Promise<void> {
  const form = region(page, 'A new game');
  await form.getByRole('textbox', { name: 'Guild name', exact: true }).fill(guild);
  await form.getByRole('textbox', { name: /Guildmaster/ }).fill(master);
  await form.getByRole('textbox', { name: 'Seed', exact: true }).fill(seed);
  await form.getByRole('button', { name: 'Start the game' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(guild);
  await expect(page.getByTestId('time')).toHaveText('Year 1 Day 1, morning');
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

/** An amount in the sentence form (`coinWords`) as a regular expression's source: `5 Gold 20 Silver`, `5 Gold`, `20 Silver` (DL-294 item 1). */
export const amountPattern = String.raw`(?:\d+ Gold(?: \d+ Silver)?|\d+ Silver)`;

/**
 * The Silver a coins element inside `scope` shows (DL-294 item 1), from its `data-silver`: the
 * amounts are never read from their numbers and discs, which the sentence beside them repeats.
 */
export async function silverOf(scope: Locator): Promise<number> {
  const coins = scope.locator('[data-silver]');
  await expect(coins).toHaveCount(1);
  return Number(await coins.getAttribute('data-silver'));
}

/** The player's Wealth in Silver, as the status bar shows it. */
export async function wealthOf(page: Page): Promise<number> {
  return silverOf(page.getByTestId('wealth'));
}

/** The status bar's Wealth is `silver` Silver. */
export async function expectWealth(page: Page, silver: number): Promise<void> {
  await expect(page.getByTestId('wealth').locator('[data-silver]')).toHaveAttribute('data-silver', String(silver));
}

/**
 * `locator`'s text as it is spoken: each coins element read as its sentence ("5 Gold 20 Silver"),
 * not as its numbers and discs and the hidden sentence together. Polls, as an assertion does.
 */
export async function spokenText(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const coins of copy.querySelectorAll('.coins')) coins.replaceWith(coins.querySelector('.visually-hidden')?.textContent ?? '');
    return copy.textContent ?? '';
  });
}

/**
 * Sends a Party on the first Quest on the Board that dispatch would send one to, through the Party
 * builder (DL-104); its name. Each Hero's row says what they bring; the first one chosen has
 * their page opened in place, and "Back to the Party" finds the choice as it was. Once sent, the
 * Quest's card is the Party out card, naming who went and the night they return.
 */
export async function dispatchAParty(page: Page): Promise<string> {
  const board = await openView(page, 'Board');
  const quests = board.getByRole('article');
  const count = await quests.count();
  for (let index = 0; index < count; index += 1) {
    const quest = quests.nth(index);
    const name = (await quest.getByRole('heading', { level: 3 }).textContent()) ?? '';
    await quest.getByRole('button', { name: 'Choose a Party' }).click();
    const form = quest.getByRole('form');
    const verdict = form.getByRole('status');
    const rows = form.getByTestId('party-row');
    // Each row: who, their Class and Level, and no Hero's Morale (DL-148 item 12).
    await expect(rows.first()).toContainText(/(Warrior|Rogue|Mage|Healer), Level \d+/);
    await expect(rows.first()).not.toContainText(/Morale/);
    // Choose Heroes one at a time until dispatch would send them, or none are left.
    const chosen: string[] = [];
    for (let hero = 0; hero < (await rows.count()); hero += 1) {
      const box = rows.nth(hero).getByRole('checkbox');
      if (await box.isDisabled()) continue;
      await box.check();
      chosen.push((await rows.nth(hero).locator('.party-row__name').textContent()) ?? '');
      if ((await verdict.textContent()) === 'Dispatch would send this Party.') break;
    }
    const send = form.getByRole('button', { name: 'Send the Party' });
    if (await send.isEnabled()) {
      await expectNoHorizontalOverflow(page, 'a Party chosen, with its preview');
      // The first Hero chosen, their page opened in place, and back to the Party as it was chosen.
      const [first = ''] = chosen;
      await form.getByRole('button', { name: `Open ${first}'s page`, exact: true }).click();
      await expect(board.getByRole('heading', { level: 3, name: first, exact: true })).toBeFocused();
      await expectNoHorizontalOverflow(page, "a Hero's page opened from the Party builder");
      await board.getByRole('button', { name: 'Back to the Party' }).click();
      await expect(form.getByRole('button', { name: `Open ${first}'s page`, exact: true })).toBeFocused();
      await expect(form.getByRole('checkbox', { checked: true })).toHaveCount(chosen.length);
      await expect(verdict).toHaveText('Dispatch would send this Party.');

      await send.click();
      await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
      const sent = board.getByTestId('sent');
      await expect(sent.getByRole('heading', { level: 3 })).toHaveText(name);
      await expect(sent.getByRole('heading', { level: 3 })).toBeFocused();
      await expect(sent).toContainText(new RegExp(`Sent: ${chosen.map(escaped).join('.*')}\\. Back on the night of Year \\d+ Day \\d+\\.`));
      return name;
    }
    await quest.getByRole('button', { name: 'Close' }).click();
  }
  throw new Error('No Quest on the Board would take a Party from the Roster');
}
