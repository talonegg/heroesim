import { expect, test, type Locator } from '@playwright/test';
import { dispatchAParty, expectNoHorizontalOverflow, expectTargets, guildPart, openView, part, startGame } from './support';

// The page's one filter element (v1.1.7-S7, DL-206 items 25 to 29, DL-213), in the built page at a
// phone's width, a tablet's and a desktop's: the Roster filtered by availability and by Class, by the
// keyboard, the tiles and the Table showing the same Heroes and "Showing" saying how many, each chip's
// count what it would show with the other filter as it is; Tiles or Table a choice of one; and the
// Stores filtered by kind, several kinds at once. What each expects is read from the page (each chip's
// count, the kinds the Stores offer), not from the seed's Roster or stock, so that it holds as the
// content changes (DL-213).

/** A chip of `group` by its name, its count after it. */
function chip(group: Locator, name: string): Locator {
  return group.getByRole('button', { name: new RegExp(`^${name} \\d+$`) });
}

/** The count a chip shows. */
async function countOf(button: Locator): Promise<number> {
  return Number(/(\d+)$/.exec((await button.textContent()) ?? '')?.[1]);
}

/** The options of `group`, All left out: each chip's name, without its count. */
async function optionsOf(group: Locator): Promise<string[]> {
  const words = await group.getByRole('button').allTextContents();
  return words.slice(1).map((each) => each.replace(/ \d+$/, ''));
}

test("the Roster's filters: by availability and by Class, by the keyboard, in tiles and the Table, with the Showing line", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-filters' });
  await dispatchAParty(page);

  const roster = await openView(page, 'Roster');
  const tiles = roster.getByRole('list', { name: 'Heroes on the Roster' }).getByRole('listitem');
  const total = await tiles.count();
  const availability = roster.getByRole('group', { name: 'Where', exact: true });
  const classes = roster.getByRole('group', { name: 'Class', exact: true });
  await expect(availability.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(classes.getByRole('button').first()).toHaveText('All');
  const classNames = await optionsOf(classes);
  expect(classNames.length).toBeGreaterThan(1);
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
  /** The "Showing" line while `shown` of the Roster's Heroes are, none while all are. */
  const showingSays = async (shown: number): Promise<void> => {
    if (shown === total) await expect(roster.getByTestId('roster-shown')).toHaveCount(0);
    else await expect(roster.getByTestId('roster-shown')).toHaveText(`Showing ${shown} of ${total} Heroes.`);
  };

  // Away, pressed from the keyboard.
  const away = chip(availability, 'Away');
  const sent = await countOf(away);
  expect(sent).toBeGreaterThan(0);
  await away.focus();
  await page.keyboard.press('Space');
  await expect(away).toHaveAttribute('aria-pressed', 'true');
  await expect(away).toBeFocused();
  await expect(tiles).toHaveCount(sent);
  await showingSays(sent);
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
  await showingSays(sent);
  await expectNoHorizontalOverflow(page, "the Roster's Table filtered");

  // Each Class counts those of it away, so the counts make up everyone away; a Class with none of
  // them is greyed, the rest not.
  const counts = await Promise.all(classNames.map((name) => countOf(chip(classes, name))));
  expect(counts.reduce((sum, count) => sum + count, 0)).toBe(sent);
  for (const [at, name] of classNames.entries()) {
    if (counts[at] === 0) await expect(chip(classes, name)).toHaveClass(/\bis-empty\b/);
    else await expect(chip(classes, name)).not.toHaveClass(/\bis-empty\b/);
  }
  // A Class with none of them, where there is one: pressed, no Hero matches, and the sentence says so.
  const none = classNames.find((_, at) => counts[at] === 0);
  if (none !== undefined) {
    await chip(classes, none).click();
    await expect(chip(classes, none)).toHaveAttribute('aria-pressed', 'true');
    await expect(table).toHaveCount(0);
    await expect(roster.getByTestId('roster-shown')).toHaveText('No Hero on the Roster matches the filters.');
    await classes.getByRole('button', { name: 'All', exact: true }).click();
  }
  // A Class with some of them: those alone.
  const some = classNames.findIndex((_, at) => (counts[at] ?? 0) > 0);
  await chip(classes, classNames[some] ?? '').click();
  await expect(table.getByRole('rowheader')).toHaveCount(counts[some] ?? 0);
  await showingSays(counts[some] ?? 0);
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
  const kindCells = stores.getByRole('table').getByRole('row').locator('td:nth-of-type(1)');
  const owned = await stores.getByTestId('owned').count();
  // The kinds the Stores offer, read from the page, each with its count.
  const kindNames = await optionsOf(kinds);
  expect(kindNames.length).toBeGreaterThan(1);
  const counts = await Promise.all(kindNames.map((name) => countOf(chip(kinds, name))));
  expect(counts.reduce((sum, count) => sum + count, 0)).toBe(owned);
  const [first = '', second = ''] = kindNames;
  const [firstCount = 0, secondCount = 0] = counts;
  /** A kind's cells' words: `Weapon Gear`, `Consumable`. */
  const kindWords = (name: string): RegExp => new RegExp(`^${name}( Gear)?\\b`);

  const firstChip = chip(kinds, first);
  await firstChip.focus();
  await page.keyboard.press('Enter');
  await expect(firstChip).toHaveAttribute('aria-pressed', 'true');
  await expect(kindCells).toHaveCount(firstCount);
  for (const cell of await kindCells.all()) await expect(cell).toHaveText(kindWords(first));
  // One filter's own choice leaves its counts as they were.
  await expect(chip(kinds, second)).toHaveText(`${second} ${secondCount}`);

  // A second kind: either, unless it is the last, when every kind pressed reads as All.
  const all = kinds.getByRole('button', { name: 'All', exact: true });
  await chip(kinds, second).click();
  if (kindNames.length > 2) {
    await expect(kindCells).toHaveCount(firstCount + secondCount);
    await expect(kinds.getByRole('button', { pressed: true })).toHaveText([new RegExp(`^${first} \\d+$`), new RegExp(`^${second} \\d+$`)]);
  }
  await expectNoHorizontalOverflow(page, 'the Stores filtered');
  await expectTargets(page, 'the Stores filtered');

  // The rest as well: All stays let go until every kind is pressed, which reads as All.
  for (const name of kindNames.slice(2)) {
    await expect(all).toHaveAttribute('aria-pressed', 'false');
    await chip(kinds, name).click();
  }
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(kinds.getByRole('button', { pressed: true })).toHaveCount(1);
  await expect(kindCells).toHaveCount(owned);

  await chip(kinds, second).click();
  await expect(kindCells).toHaveCount(secondCount);
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
});
