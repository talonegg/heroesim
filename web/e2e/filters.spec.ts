import { expect, test, type Locator } from '@playwright/test';
import { dispatchAParty, expectNoHorizontalOverflow, expectTargets, guildPart, openView, part, startGame } from './support';

// The page's one filter element (DL-206 items 25 to 29, DL-213), in the built page at a phone's
// width, a tablet's and a desktop's: what a real browser shows of it. Each group's name stands on the
// line of its All, the chips and the Tiles or Table choice are pressed by the keyboard, and nothing
// is pushed sideways or made too small to press. The counts, the "Showing" line and what each chip
// shows are the filters' own tests in Vitest. What each test needs is read from the page (the
// kinds the Stores offer), not from the seed's stock, so that it holds as the content changes (DL-213).

/** A chip of `group` by its name, its count after it. */
function chip(group: Locator, name: string): Locator {
  return group.getByRole('button', { name: new RegExp(`^${name} \\d+$`) });
}

/** The options of `group`, All left out: each chip's name, without its count. */
async function optionsOf(group: Locator): Promise<string[]> {
  const words = await group.getByRole('button').allTextContents();
  return words.slice(1).map((each) => each.replace(/ \d+$/, ''));
}

test("the Roster's filters: each group's name on the line of its All, the chips and the Tiles or Table choice by the keyboard, nothing pushed sideways", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-filters' });
  await dispatchAParty(page);

  const roster = await openView(page, 'Roster');
  const tiles = roster.getByRole('list', { name: 'Heroes on the Roster' }).getByRole('listitem');
  const availability = roster.getByRole('group', { name: 'Where', exact: true });
  const classes = roster.getByRole('group', { name: 'Class', exact: true });
  // Each group's name shown and naming it, before its chips on the line of its first, All, at every
  // width, and nothing pushed sideways (the owner's answer, DL-213).
  for (const [group, name] of [
    [classes, 'Class'],
    [availability, 'Where'],
  ] as const) {
    const label = page.locator(`[id="${(await group.getAttribute('aria-labelledby')) ?? ''}"]`);
    await expect(label).toHaveText(name);
    await expect(label).toBeVisible();
    const [shown, all] = await Promise.all([label.boundingBox(), group.getByRole('button', { name: 'All', exact: true }).boundingBox()]);
    if (shown === null || all === null) throw new Error(`the ${name} group's label or All is not drawn`);
    const middle = shown.y + shown.height / 2;
    expect(middle, `${name}: the label on All's line`).toBeGreaterThan(all.y);
    expect(middle, `${name}: the label on All's line`).toBeLessThan(all.y + all.height);
    expect(shown.x + shown.width, `${name}: the label before All`).toBeLessThanOrEqual(all.x);
  }
  await expectNoHorizontalOverflow(page, "the Roster's filters with their names");
  // Away, pressed from the keyboard.
  const away = chip(availability, 'Away');
  await away.focus();
  await page.keyboard.press('Space');
  await expect(away).toHaveAttribute('aria-pressed', 'true');
  await expect(away).toBeFocused();
  await expect(tiles.first()).toBeVisible();
  await expectNoHorizontalOverflow(page, "the Roster's tiles filtered");
  await expectTargets(page, "the Roster's tiles filtered");

  // The Table, chosen by the keyboard from the one-choice switch.
  const show = roster.getByRole('radiogroup', { name: 'Show the Roster as' });
  await show.getByRole('radio', { name: 'Tiles' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(show.getByRole('radio', { name: 'Table' })).toHaveAttribute('aria-checked', 'true');
  await expect(show.getByRole('radio', { name: 'Table' })).toBeFocused();
  await expect(roster.getByRole('table', { name: 'Heroes on the Roster' })).toBeVisible();
  await expectNoHorizontalOverflow(page, "the Roster's Table filtered");
});

test('the Stores filtered by kind: a chip pressed by the keyboard, a second beside it, nothing pushed sideways', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-filters' });

  // One of each kind the Market sells bought, each found through the Market's filter, so that the
  // Stores hold several kinds.
  const buy = await part(page, 'Buy');
  const forSale = buy.getByRole('group', { name: 'Show for sale' });
  for (const kind of await optionsOf(forSale)) {
    await chip(forSale, kind).click();
    await buy.getByTestId('listing').first().getByRole('button', { name: /^Buy / }).click();
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
    await forSale.getByRole('button', { name: 'All', exact: true }).click();
  }

  const stores = await guildPart(page, 'Stores');
  const kinds = stores.getByRole('group', { name: 'Show of kind' });
  // The kinds the Stores offer, read from the page.
  const [first = '', second = ''] = await optionsOf(kinds);
  expect(second).not.toBe('');

  const firstChip = chip(kinds, first);
  await firstChip.focus();
  await page.keyboard.press('Enter');
  await expect(firstChip).toHaveAttribute('aria-pressed', 'true');
  await expect(firstChip).toBeFocused();

  // A second kind beside it.
  await chip(kinds, second).click();
  await expectNoHorizontalOverflow(page, 'the Stores filtered');
  await expectTargets(page, 'the Stores filtered');
});
