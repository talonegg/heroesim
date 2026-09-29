// The page's regions as a test reaches them (M9-S3, DL-103). The page is views in a shell, one at a
// time, so a region is found by opening the view that holds it first, through the navigation, as a
// player would; a region of the game menu by opening the menu. Since M9-F2 (DL-115) the Guild's
// parts are tabs under its heading, and a part is found by opening its tab: its panel, named by the
// tab. Never imported by the page.

import { fireEvent, screen, within } from '@testing-library/react';

/** Each view's heading. The Guildmaster's button in the navigation is named by the Guildmaster's name (M9-F2). */
export type ViewName = 'Guildmaster' | 'Guild' | 'Roster' | 'Board' | 'Rankings' | 'Market' | 'History';

/** The Guild's parts, each a tab under its heading (M9-F2; Stores and Treasury from M9-F3). */
export type GuildPartName = 'Home' | 'Hall' | 'Stores' | 'Treasury';

/** The view each region is in, by its heading; `menu` for the game menu's; a tab of the Guild's for its parts. */
const home: Readonly<Record<string, ViewName | 'menu' | { tab: GuildPartName }>> = {
  Guildmaster: 'Guildmaster',
  Guild: 'Guild',
  Home: { tab: 'Home' },
  Hall: { tab: 'Hall' },
  Stores: { tab: 'Stores' },
  Treasury: { tab: 'Treasury' },
  Roster: 'Roster',
  'Transfer Offers': 'Roster',
  'Unattached pool': 'Roster',
  Board: 'Board',
  Rankings: 'Rankings',
  Guilds: 'Rankings',
  Patrons: 'Rankings',
  Market: 'Market',
  Buy: 'Market',
  Sell: 'Market',
  History: 'History',
  'This game': 'menu',
  'New rules available': 'menu',
};

/** The navigation. */
export function nav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Views' });
}

/**
 * The navigation's button for `view`: its name starts with the view's, and goes on with its count.
 * The Guildmaster's is named by the Guildmaster's name, and described as "Guildmaster" (M9-F2).
 */
export function navButton(view: ViewName): HTMLElement {
  const [button] =
    view === 'Guildmaster'
      ? within(nav()).getAllByRole('button', { description: 'Guildmaster' })
      : within(nav()).getAllByRole('button', { name: new RegExp(`^${view}(,|$)`) });
  if (button === undefined) throw new Error(`no ${view} in the navigation`);
  return button;
}

/** Opens `view` from the navigation, and gives its region. */
export function openView(view: ViewName): HTMLElement {
  fireEvent.click(navButton(view));
  return screen.getByRole('region', { name: view });
}

/** Opens the Guild's `part` from its tab, the Guild opened first, and gives the part's panel (M9-F2). */
export function openGuildPart(part: GuildPartName): HTMLElement {
  const guild = screen.queryByRole('region', { name: 'Guild' }) ?? openView('Guild');
  fireEvent.click(within(guild).getByRole('tab', { name: part }));
  return within(guild).getByRole('tabpanel', { name: part });
}

/** The game menu, opened. */
export function openMenu(): HTMLElement {
  const open = screen.queryByRole('dialog', { name: 'Game' });
  if (open !== null) return open;
  fireEvent.click(screen.getByRole('button', { name: 'Game' }));
  return screen.getByRole('dialog', { name: 'Game' });
}

/** The whole History, opened from the game menu's debug view (M9-F4): the History view's region. */
export function openDebugHistory(): HTMLElement {
  fireEvent.click(within(openMenu()).getByRole('button', { name: 'Debug: Whole History' }));
  return screen.getByRole('region', { name: 'History' });
}

/** Closes the game menu, if it is open. */
export function closeMenu(): void {
  const open = screen.queryByRole('dialog', { name: 'Game' });
  if (open !== null) fireEvent.click(within(open).getByRole('button', { name: 'Close' }));
}

/**
 * A region of the page by its heading, its view opened first when it is not open: a view, a part of
 * one, or the game menu's; for a part of the Guild, its tab's panel.
 */
export function section(name: string): HTMLElement {
  const where = home[name];
  if (where !== undefined && typeof where === 'object') {
    const panel = screen.queryByRole('tabpanel', { name });
    if (panel !== null) return panel;
    closeMenu();
    return openGuildPart(where.tab);
  }
  const shown = screen.queryByRole('region', { name });
  if (shown !== null) return shown;
  if (where === undefined) throw new Error(`no region called ${name} on the page`);
  if (where === 'menu') return within(openMenu()).getByRole('region', { name });
  closeMenu();
  openView(where);
  return screen.getByRole('region', { name });
}

/**
 * The History's lines in `scope`, folded ones among them (M9-S5): each a list item, its sentence in
 * `.entry__text`, where a name is a button of its own, so the sentence is read whole from there.
 */
export function historyLines(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('li.entry'));
}

/** A History line's sentence, its names' words and all. */
export function sentenceOf(line: HTMLElement): string {
  return line.querySelector('.entry__text')?.textContent ?? '';
}

/**
 * The History's line whose sentence matches `pattern`, in the History view, opened as it is (on the
 * player's Guild unless another was chosen): what a play added is read there (M9-S5, DL-105).
 */
export function inHistory(pattern: RegExp | string): HTMLElement {
  const lines = historyLines(section('History'));
  const matches = (line: HTMLElement): boolean =>
    typeof pattern === 'string' ? sentenceOf(line) === pattern : pattern.test(sentenceOf(line));
  const found = lines.filter(matches);
  if (found.length !== 1) {
    throw new Error(`${found.length} lines of the History match ${String(pattern)}; its lines:\n${lines.map(sentenceOf).join('\n')}`);
  }
  return found[0] as HTMLElement;
}

/** The time controls in the status bar. */
export function time(): HTMLElement {
  return screen.getByRole('group', { name: 'Time' });
}

/** Fast forward until new Heroes join the pool, from the status bar's other ways to fast forward. */
export function fastForwardUntilPool(): void {
  fireEvent.click(within(time()).getByRole('button', { name: 'More ways to fast forward' }));
  fireEvent.click(within(time()).getByRole('button', { name: 'Fast forward until new Heroes join the pool' }));
}

/** The seed of the game in hand, as the game menu says it; the menu is left as it was found. */
export function seedShown(): string {
  const wasOpen = screen.queryByRole('dialog', { name: 'Game' }) !== null;
  const seed = within(openMenu()).getByTestId('seed').textContent ?? '';
  if (!wasOpen) closeMenu();
  return seed;
}

/** The Heroes on the player's Roster, as the Roster view lists them. */
export function rosterList(): HTMLElement {
  return within(section('Roster')).getByRole('list', { name: 'Heroes on the Roster' });
}
