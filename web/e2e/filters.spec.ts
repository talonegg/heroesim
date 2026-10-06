import { expect, test, type Locator } from '@playwright/test';
import { dispatchAParty, expectNoHorizontalOverflow, expectTargets, guildPart, openView, part, startGame } from './support';

// The page's one filter element (v1.1.7-S7, DL-206 items 25 to 29, DL-213), in the built page at a
// phone's width, a tablet's and a desktop's: the Roster filtered by availability and by Class, by the
// keyboard, the tiles and the Table showing the same Heroes and "Showing" saying how many, each chip's
// count what it would show with the other filter as it is; Tiles or Table a choice of one; and the
// Stores filtered by kind, several kinds at once.

/** A chip of `group` by its name, its count after it. */
function chip(group: Locator, name: string): Locator {
  return group.getByRole('button', { name: new RegExp(`^${name} \\d+$`) });
}

/** The count a chip shows. */
async function countOf(button: Locator): Promise<number> {
  return Number(/(\d+)$/.exec((await button.textContent()) ?? '')?.[1]);
}

test("the Roster's filters: by availability and by Class, by the keyboard, in tiles and the Table, with the Showing line", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-filters' });
  await dispatchAParty(page);

  const roster = await openView(page, 'Roster');
  const tiles = roster.getByRole('list', { name: 'Heroes on the Roster' }).getByRole('listitem');
  const total = await tiles.count();
  const availability = roster.getByRole('group', { name: 'Show by availability' });
  const classes = roster.getByRole('group', { name: 'Show of Class' });
  await expect(availability.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(classes.getByRole('button')).toHaveText([/^All$/, /^Warrior \d+$/, /^Rogue \d+$/, /^Mage \d+$/, /^Healer \d+$/]);

  // Away, pressed from the keyboard.
  const away = chip(availability, 'Away');
  const sent = await countOf(away);
  expect(sent).toBeGreaterThan(0);
  expect(sent).toBeLessThan(total);
  await away.focus();
  await page.keyboard.press('Space');
  await expect(away).toHaveAttribute('aria-pressed', 'true');
  await expect(away).toBeFocused();
  await expect(tiles).toHaveCount(sent);
  await expect(roster.getByTestId('roster-shown')).toHaveText(`Showing ${sent} of ${total} Heroes.`);
  for (const tile of await tiles.all()) await expect(tile).toContainText(/Away with a Party/);
  await expectNoHorizontalOverflow(page, "the Roster's tiles filtered");
  await expectTargets(page, "the Roster's tiles filtered");

  // The Table, chosen by the keyboard from the one-choice switch: the same Heroes.
  const show = roster.getByRole('radiogroup', { name: 'Show the Roster as' });
  await show.getByRole('radio', { name: 'Tiles' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(show.getByRole('radio', { name: 'Table' })).toHaveAttribute('aria-checked', 'true');
  await expect(show.getByRole('radio', { name: 'Table' })).toBeFocused();
  const table = roster.getByRole('table', { name: 'Heroes on the Roster' });
  await expect(table.getByRole('rowheader')).toHaveCount(sent);
  await expect(roster.getByTestId('roster-shown')).toHaveText(`Showing ${sent} of ${total} Heroes.`);
  await expectNoHorizontalOverflow(page, "the Roster's Table filtered");

  // A Class with none of those away: greyed; pressed, no Hero matches, and the sentence says so.
  // Fewer away than on the Roster, so some Class of the four has none of them.
  const empty = classes.locator('button.is-empty').first();
  await expect(empty).toHaveText(/^\w+ 0$/);
  await empty.click();
  await expect(empty).toHaveAttribute('aria-pressed', 'true');
  await expect(table).toHaveCount(0);
  await expect(roster.getByTestId('roster-shown')).toHaveText('No Hero on the Roster matches the filters.');
  await classes.getByRole('button', { name: 'All', exact: true }).click();

  // Every place pressed reads as All: everyone, and no Showing line.
  await chip(availability, 'At the Hall').click();
  await chip(availability, 'Injured').click();
  await expect(availability.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(table.getByRole('rowheader')).toHaveCount(total);
  await expect(roster.getByTestId('roster-shown')).toHaveCount(0);
});

test('the Stores filtered by kind, several at once, and every kind pressed reading as All', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-filters' });

  // Three kinds bought, each found through the Market's filter.
  const buy = await part(page, 'Buy');
  const forSale = buy.getByRole('group', { name: 'Show for sale' });
  for (const kind of ['Weapon', 'Armour', 'Consumable']) {
    await chip(forSale, kind).click();
    await buy.getByTestId('listing').first().getByRole('button', { name: /^Buy / }).click();
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
    await forSale.getByRole('button', { name: 'All', exact: true }).click();
  }

  const stores = await guildPart(page, 'Stores');
  const kinds = stores.getByRole('group', { name: 'Show of kind' });
  const kindCells = stores.getByRole('table').getByRole('row').locator('td:nth-of-type(1)');
  const weapons = await countOf(chip(kinds, 'Weapon'));
  const consumables = await countOf(chip(kinds, 'Consumable'));

  const weapon = chip(kinds, 'Weapon');
  await weapon.focus();
  await page.keyboard.press('Enter');
  await expect(weapon).toHaveAttribute('aria-pressed', 'true');
  await expect(kindCells).toHaveCount(weapons);
  for (const cell of await kindCells.all()) await expect(cell).toHaveText(/^Weapon Gear/);
  // One filter's own choice leaves its counts as they were.
  await expect(chip(kinds, 'Consumable')).toHaveText(`Consumable ${consumables}`);

  await chip(kinds, 'Consumable').click();
  await expect(kindCells).toHaveCount(weapons + consumables);
  await expect(kinds.getByRole('button', { pressed: true })).toHaveText([/^Weapon \d+$/, /^Consumable \d+$/]);
  await expectNoHorizontalOverflow(page, 'the Stores filtered');
  await expectTargets(page, 'the Stores filtered');

  // The third kind as well: every kind pressed reads as All.
  await chip(kinds, 'Armour').click();
  await expect(kinds.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(kinds.getByRole('button', { pressed: true })).toHaveCount(1);
  await expect(kindCells).toHaveCount(await stores.getByTestId('owned').count());

  await chip(kinds, 'Consumable').click();
  await expect(kindCells).toHaveCount(consumables);
  await kinds.getByRole('button', { name: 'All', exact: true }).click();
  await expect(kinds.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
