import { expect, test, type Page } from '@playwright/test';
import { escaped, expectNoHorizontalOverflow, expectTargets, openView, startGame } from './support';

// DL-289, in the built page at a phone's width, a tablet's and a desktop's: the Captain
// named from a Hero's page and marked on the tile, in the Table and beside the name on a phone; Fatigue
// on the tile, in the Table's State group and its filters; "Sort by" built from the Stat areas alone;
// and the Party builder's Fatigue bands, Captain and relief. What each holds is Vitest's; this is
// what a real browser shows at each width: nothing pushed sideways, every control a 44px target.

/** Waits until the page has settled the play it took. */
async function idle(page: Page): Promise<void> {
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
}

/** A name read with the post after it: Chromium puts a space before the comma, as the post is a block of its own in the name. */
function asCaptain(name: string): RegExp {
  return new RegExp(`^${escaped(name)}\\s*, Captain$`);
}

test('a Captain is named from a Hero’s page, then marked on the tile, in the Table and on a phone’s State tab, with Fatigue beside Morale', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-captain' });
  const phone = (page.viewportSize()?.width ?? 0) < 600;

  const roster = await openView(page, 'Roster');
  const tiles = roster.getByRole('list', { name: 'Heroes on the Roster' }).getByRole('listitem');
  // Fatigue beside Morale on every tile; no Captain yet.
  const count = await tiles.count();
  await expect(roster.locator('.hero-card .chip', { hasText: /^Fatigue \d+, (fresh|weary|tired|exhausted)$/ })).toHaveCount(count);
  await expect(roster.locator('.captain-mark')).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'the Roster’s tiles with Fatigue');
  await expectTargets(page, 'the Roster’s tiles with Fatigue');

  // The first tile's Hero, named Captain from their page.
  const name = (await tiles.first().getByRole('button').textContent()) ?? '';
  await tiles.first().getByRole('button').click();
  const article = roster.getByRole('article');
  await expect(article.getByRole('heading', { level: 4, name: 'Captain', exact: true })).toBeVisible();
  await expect(article.getByText(`Naming ${name} Captain is free: the post is empty.`)).toBeVisible();
  await expect(article.getByRole('list', { name: `${name}'s State` })).toContainText(/Fatigue \d+, (fresh|weary|tired|exhausted)/);
  await expectNoHorizontalOverflow(page, 'a Hero’s page with the Captain’s part');
  await expectTargets(page, 'a Hero’s page with the Captain’s part');
  await article.getByRole('button', { name: `Name ${name} Captain` }).click();
  await idle(page);
  await expect(article.getByText(new RegExp(`^${escaped(name)} is .+'s Captain\\.$`))).toBeVisible();
  await expect(article.getByRole('list', { name: `${name}'s State` }).getByText('Captain', { exact: true })).toBeVisible();
  await expect(article.getByRole('button', { name: `Name ${name} Captain` })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'a Hero’s page, a Captain');
  await article.getByRole('button', { name: 'Back to the Roster' }).click();

  // The mark on their tile and no one else's, read with their name.
  await expect(roster.locator('.hero-card .captain-mark')).toHaveCount(1);
  await expect(roster.getByRole('button', { name: asCaptain(name) })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'the Roster’s tiles with a Captain');

  // The Table: the mark in their Name, and the State group with Fatigue.
  await roster.getByRole('radiogroup', { name: 'Show the Roster as' }).getByRole('radio', { name: 'Table' }).click();
  const table = roster.getByRole('table', { name: 'Heroes on the Roster' });
  await expect(table).toBeVisible();
  if (phone) {
    const tabs = roster.getByRole('tablist', { name: 'Columns of the Table' });
    await expect(tabs.getByRole('tab')).toHaveText(['Hero', 'State', 'Physical', 'Mental', 'Magical', 'Social']);
    await tabs.getByRole('tab', { name: 'State' }).click();
    await expect(table.getByRole('columnheader')).toHaveText(['Name', 'Morale', 'Fatigue']);
    // The mark beside the name stays on every tab.
    await expect(table.locator('th .captain-mark')).toHaveCount(1);
    await tabs.getByRole('tab', { name: 'Physical' }).click();
    await expect(table.locator('th .captain-mark')).toHaveCount(1);
    await expectNoHorizontalOverflow(page, 'the Roster’s Table on a phone, a Captain');
    await expectTargets(page, 'the Roster’s Table on a phone, a Captain');
    await tabs.getByRole('tab', { name: 'State' }).click();
  } else {
    await expect(table.getByRole('columnheader', { name: 'Fatigue' })).toBeVisible();
    await expect(table.locator('th .captain-mark')).toHaveCount(1);
    await expect(table.locator('td[data-column="fatigue"]').first()).toContainText(/^\d+, (fresh|weary|tired|exhausted)$/);
    await roster.getByRole('button', { name: 'Columns', exact: true }).click();
    const panel = roster.getByRole('group', { name: 'Columns' });
    await expect(panel.getByRole('group', { name: 'State' })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'the Columns panel with State');
    await expectTargets(page, 'the Columns panel with State');
    await roster.getByRole('button', { name: 'Columns', exact: true }).click();
  }

  // "Sort by" offers the Stat areas alone as groups; Morale and Fatigue stand with the rest above them.
  const sortBy = roster.getByRole('combobox', { name: 'Sort by' });
  await expect(sortBy.locator('optgroup')).toHaveCount(4);
  expect(await sortBy.locator('optgroup').evaluateAll((groups) => groups.map((group) => (group as HTMLOptGroupElement).label))).toEqual([
    'Physical',
    'Mental',
    'Magical',
    'Social',
  ]);
  expect(await sortBy.locator(':scope > option').allTextContents()).toEqual(['Default', 'Name', 'Class', 'Level', 'Age', 'Morale', 'Fatigue', 'When free']);
  await sortBy.selectOption('fatigue');
  await expect(roster.getByTestId('roster-direction')).toHaveText('Highest first');
  await expectNoHorizontalOverflow(page, 'the Roster sorted by Fatigue');
  await expectTargets(page, 'the Roster sorted by Fatigue');
});

test('naming another Captain says what it costs and locks, and the post then stays locked in the engine’s words', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-captain-lock' });
  const roster = await openView(page, 'Roster');
  const tiles = roster.getByRole('list', { name: 'Heroes on the Roster' }).getByRole('listitem');
  const first = (await tiles.nth(0).getByRole('button').textContent()) ?? '';
  const second = (await tiles.nth(1).getByRole('button').textContent()) ?? '';

  await tiles.nth(0).getByRole('button').click();
  const article = roster.getByRole('article');
  await article.getByRole('button', { name: `Name ${first} Captain` }).click();
  await idle(page);
  await article.getByRole('button', { name: 'Back to the Roster' }).click();

  // In another's place: the cost and the lock said before it is done, and after, the lock held.
  await tiles.nth(1).getByRole('button').click();
  await expect(article.getByText(`Naming ${second} Captain in place of ${first} costs ${first} 10 Morale and locks the post for 30 Days.`)).toBeVisible();
  await article.getByRole('button', { name: `Name ${second} Captain` }).click();
  await idle(page);
  await expect(article.getByText(new RegExp(`^${escaped(second)} is .+'s Captain\\.$`))).toBeVisible();
  await article.getByRole('button', { name: 'Back to the Roster' }).click();

  await tiles.nth(0).getByRole('button').click();
  await expect(article.getByRole('button', { name: `Name ${first} Captain` })).toBeDisabled();
  await expect(article.getByText(new RegExp(`^${escaped(second)} was named Captain on Year 1 Day \\d+, and the post cannot change again before Year 1 Day \\d+\\.$`))).toBeVisible();
  await expectNoHorizontalOverflow(page, 'a Hero’s page, the post locked');
  await expectTargets(page, 'a Hero’s page, the post locked');
});

test('the Party builder says each Hero’s Fatigue band, marks the Captain, and names what relieves the hurt', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-captain-builder' });
  const roster = await openView(page, 'Roster');
  const tiles = roster.getByRole('list', { name: 'Heroes on the Roster' }).getByRole('listitem');
  const captain = (await tiles.first().getByRole('button').textContent()) ?? '';
  await tiles.first().getByRole('button').click();
  await roster.getByRole('article').getByRole('button', { name: `Name ${captain} Captain` }).click();
  await idle(page);

  const board = await openView(page, 'Board');
  const quest = board.getByRole('article').first();
  await quest.getByRole('button', { name: 'Choose a Party' }).click();
  const form = quest.getByRole('form');
  const rows = form.getByTestId('party-row');
  await expect(rows.first()).toBeVisible();
  // A Fatigue band on every row, and no figure; the Captain's row marked.
  await expect(form.locator('.party-row .chip', { hasText: /^Fatigue (fresh|weary|tired|exhausted)$/ })).toHaveCount(await rows.count());
  await expect(form.locator('.party-row .captain-mark')).toHaveCount(1);
  await expect(rows.filter({ has: page.locator('.captain-mark') }).locator('.party-row__name')).toHaveText(asCaptain(captain));
  await expectNoHorizontalOverflow(page, 'the Party builder with Fatigue and the Captain');
  await expectTargets(page, 'the Party builder with Fatigue and the Captain');

  // No one chosen: no relief to say. A Hero chosen: the Healer and the heal Items, or none.
  await expect(form.getByTestId('relief')).toHaveCount(0);
  const box = rows.first().getByRole('checkbox');
  if (await box.isEnabled()) await box.check();
  else await rows.nth(1).getByRole('checkbox').check();
  const relief = form.getByTestId('relief');
  await expect(form.getByRole('heading', { level: 4, name: 'Relief from the hurt' })).toBeVisible();
  await expect(relief.getByRole('listitem')).toHaveText([/^Healer in the Party: .+/, /^Heal Items carried: .+/]);
  await expectNoHorizontalOverflow(page, 'the Party builder with its relief');
  await expectTargets(page, 'the Party builder with its relief');
});
