import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  closeGameMenu,
  debugHistory,
  expectNoHorizontalOverflow,
  chooseGuildmaster,
  expectTargets,
  guildmasterSetup,
  guildPart,
  guildPartNames,
  navItem,
  openGameMenu,
  openView,
  part,
  playTurns,
  rosterList,
  startGame,
  statusBar,
  thisGame,
  traitBox,
  viewNames,
  type ViewName,
} from './support';

// The shell at the three widths (DL-103): at a
// phone's 360px, a tablet's 820px and a desktop's 1280px, every view and the game menu, with no
// sideways scroll of the page and every control a target of at least 44px. Then everything that
// opens, opened in turn: a Party being chosen, a Hero's page, a pool Hero's page, a Rival's Guild
// page and one of its Heroes' pages, the Rankings by Wealth, an older page of the History, names
// found in the History and a page opened from them (DL-74), a name in the History opened, the
// new-game form over a game, and a save with a long name. The History opens on the player's Guild;
// its search is in its head, and the World History a choice away (DL-105); the whole History
// is the game menu's debug view (DL-117). The Guild's and
// the Guildmaster's names are long, and one word runs 61 letters unbroken. The Board's cards, one
// unfolded, and the Party builder are checked at each width, the phone's at 390px as well, with
// Send in view at the foot of the form (DL-104). So are the Roster's cards and a Hero's page
// with its Transfer asked for, the pool's rows, the Hall's facilities, Guildmaster, Market and
// holdings, and the Rankings' table, a Rival's page unfolded and the Patrons' table: a wide table
// scrolls in its own box, never the page (DL-106). Since DL-115 the seven views and
// each of the Guild's parts, the navigation's one order at each width, and the Guildmaster's long
// name cut in it. Since DL-116 the Stores and the Treasury, each with its table.

const longGuild = 'The Most Honourable and Ancient Company of the Lantern-Bearers of Aldmoor';
const longMaster = 'Ælfwine Grimbeorhtssonofthewestmarchesandthefellsbeyondthebarrowdowns';
// The seven views, in the navigation's order.
const views: readonly ViewName[] = viewNames;

test('every view and the game menu, with no sideways scroll and every control a 44px target', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expectNoHorizontalOverflow(page, 'the new-game form');
  await expectTargets(page, 'the new-game form');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });

  // A fast forward first, so the home view has a stop, the log has lines and the pool has Heroes.
  await statusBar(page).getByRole('button', { name: 'More ways to Fast forward' }).click();
  await playTurns(page, page.getByRole('button', { name: 'Fast forward until new Heroes join the pool' }));

  // One order at every width (DL-112 item 5): under 600px the bar holds Guild, Roster, Board
  // and Rankings, and More the other three; from 600px all seven show, the Guildmaster first.
  const nav = page.getByRole('navigation', { name: 'Views' });
  const shownLabels = nav.locator('.nav__list > .nav__item:visible .nav__label');
  const phone = (page.viewportSize()?.width ?? 0) < 600;
  await expect(shownLabels).toHaveText(
    phone ? ['Guild', 'Roster', 'Board', 'Rankings', 'More'] : [longMaster, 'Guild', 'Roster', 'Board', 'Rankings', 'Market', 'History'],
  );
  // The Guildmaster's name, whatever its length, is cut with an ellipsis rather than widen the navigation.
  if (phone) await nav.getByRole('button', { name: /^More( ?,|$)/ }).click();
  await expect(navItem(page, 'Guildmaster')).toHaveAccessibleName(longMaster);
  await expect(navItem(page, 'Guildmaster')).toHaveAccessibleDescription('Guildmaster');
  if (phone) {
    await expect(page.locator('#nav-more .nav__label')).toHaveText([longMaster, 'Market', 'History']);
    await expectNoHorizontalOverflow(page, 'More, open');
    await nav.getByRole('button', { name: /^More( ?,|$)/ }).click();
  }

  for (const view of views) {
    const shown = await openView(page, view);
    // The status bar stays in view, whichever view is open.
    await expect(statusBar(page).getByRole('button', { name: 'Advance a Turn' })).toBeInViewport();
    await expectNoHorizontalOverflow(page, `the ${view} view`);
    await expectTargets(page, `the ${view} view`);
    // Its help, on request.
    await shown.getByText('About this view').click();
    await expect(page.locator(`#${view.toLowerCase()}-help`)).toBeVisible();
    await expectNoHorizontalOverflow(page, `the ${view} view, its help open`);
  }

  // Each of the Guild's parts, opened from its tab.
  for (const name of guildPartNames) {
    await guildPart(page, name);
    await expectNoHorizontalOverflow(page, `the Guild's ${name}`);
    await expectTargets(page, `the Guild's ${name}`);
  }

  await openGameMenu(page);
  await expectNoHorizontalOverflow(page, 'the game menu');
  await expectTargets(page, 'the game menu');
  await closeGameMenu(page);
});

test('the Board and the Party builder: no sideways scroll, 44px targets, Send in view at the foot of the form, and a Hero’s page from it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });
  const { width: projectWidth, height } = page.viewportSize() ?? { width: 0, height: 0 };
  // The phone's 360px and a larger phone's 390px, the tablet's 820px, the desktop's 1280px.
  const widths = projectWidth < 600 ? [360, 390] : [projectWidth];

  for (const width of widths) {
    await page.setViewportSize({ width, height });
    const at = `at ${width}px`;
    const board = await openView(page, 'Board');
    await expectNoHorizontalOverflow(page, `the Board's cards ${at}`);
    await expectTargets(page, `the Board's cards ${at}`);

    // A card unfolded: its Encounters and what each Check reads, Skills, and its difficulty on its meter.
    const quest = board.getByRole('article').first();
    await quest.getByRole('heading', { level: 3 }).getByRole('button').click();
    await expect(quest.getByRole('img', { name: /^Difficulty \d+: .+ Quests? on the Board/ })).toBeVisible();
    await expectNoHorizontalOverflow(page, `a card unfolded ${at}`);
    await expectTargets(page, `a card unfolded ${at}`);

    // Its builder, a Hero chosen.
    await quest.getByRole('button', { name: 'Choose a Party' }).click();
    const form = quest.getByRole('form');
    await form.getByRole('checkbox').first().check();
    await expectNoHorizontalOverflow(page, `the Party builder ${at}`);
    await expectTargets(page, `the Party builder ${at}`);

    // Send stays in view at the foot of the form while it scrolls, the phone's bar not over it.
    await form.getByRole('group', { name: 'Heroes' }).evaluate((element) => element.scrollIntoView({ block: 'start' }));
    const send = form.getByRole('button', { name: 'Send the Party' });
    await expect(send).toBeInViewport({ ratio: 1 });
    await expect(form.getByRole('status')).toBeInViewport();
    const uncovered = await send.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit !== null && button.contains(hit);
    });
    expect(uncovered, `Send the Party is covered ${at}`).toBe(true);

    // A Hero's page from the builder, and back.
    await form.getByTestId('party-row').first().getByRole('button', { name: /^Open .+'s page$/ }).click();
    await expect(board.getByRole('button', { name: 'Back to the Party' })).toBeVisible();
    await expectNoHorizontalOverflow(page, `a Hero's page from the Party builder ${at}`);
    await expectTargets(page, `a Hero's page from the Party builder ${at}`);
    await board.getByRole('button', { name: 'Back to the Party' }).click();
    await expect(form.getByRole('checkbox').first()).toBeChecked();
    await quest.getByRole('button', { name: 'Close' }).click();
    await quest.getByRole('heading', { level: 3 }).getByRole('button').click();
  }
});

test('the page is never wider than the viewport, whatever is open', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });
  await expectNoHorizontalOverflow(page, 'a new game, its names long');

  // A Party being chosen, its preview open.
  const board = await openView(page, 'Board');
  const quest = board.getByRole('article').first();
  await quest.getByRole('button', { name: 'Choose a Party' }).click();
  const box = quest.getByRole('form').getByRole('checkbox').first();
  if (await box.isEnabled()) await box.check();
  await expectNoHorizontalOverflow(page, 'a Party being chosen');
  await expectTargets(page, 'a Party being chosen');
  await quest.getByRole('button', { name: 'Close' }).click();

  // Some Turns in: a log, a History with pages, new Heroes in the pool.
  await statusBar(page).getByRole('button', { name: 'More ways to Fast forward' }).click();
  await playTurns(page, page.getByRole('button', { name: 'Fast forward until new Heroes join the pool' }));
  await expectNoHorizontalOverflow(page, 'a fast forward stopped, its stop in the home view');

  // A Hero's page from the Roster.
  await (await rosterList(page)).getByRole('button').first().click();
  const roster = page.getByRole('region', { name: 'Roster', exact: true });
  await expect(roster.getByRole('button', { name: 'Back to the Roster' })).toBeVisible();
  await expectNoHorizontalOverflow(page, "a Hero's page");
  await expectTargets(page, "a Hero's page");
  await roster.getByRole('button', { name: 'Back to the Roster' }).click();

  // A pool Hero's page.
  const pool = await part(page, 'Unattached pool');
  await pool.getByTestId('pool-row').first().locator('button.link').click();
  await expect(pool.getByRole('button', { name: 'Back to the pool' })).toBeVisible();
  await expectNoHorizontalOverflow(page, "a pool Hero's page");
  await pool.getByRole('button', { name: 'Back to the pool' }).click();

  // A Rival's Guild page, and one of its Heroes' pages. The player's Guild is a row of the table too.
  const guilds = await part(page, 'Guilds');
  await rivalRows(guilds).first().locator('button.link').click();
  await expect(guilds.getByRole('button', { name: 'Back to the Guilds' })).toBeVisible();
  await expectNoHorizontalOverflow(page, "a Rival's Guild page");
  const rival = guilds.getByRole('article');
  await rival.getByTestId('guild-hero').first().locator('button.link').click();
  await expect(guilds.getByRole('button', { name: /^Back to (?!the Guilds)/ })).toBeVisible();
  await expectNoHorizontalOverflow(page, "a Rival's Hero's page");
  await guilds.getByRole('button', { name: /^Back to (?!the Guilds)/ }).click();
  await guilds.getByRole('button', { name: 'Back to the Guilds' }).click();

  // The Rankings by Wealth, and an older page of the History.
  const rankings = await openView(page, 'Rankings');
  await rankings.getByRole('button', { name: 'Order by Wealth' }).click();
  await expectNoHorizontalOverflow(page, 'the Rankings by Wealth');
  const history = await openView(page, 'History');
  await expect(history.getByRole('heading', { level: 3 })).toHaveText(`The History of ${longGuild}`);
  // The World History, then the whole History's oldest page, each line with its event type.
  await history.getByRole('group', { name: 'Whose History' }).getByRole('button', { name: 'The World History', exact: true }).click();
  await expect(history.getByRole('heading', { level: 3 })).toHaveText('The World History');
  await expectNoHorizontalOverflow(page, 'the World History');
  // A choice that is on stays legible under the pointer: its words and its face at 4.5:1 or more
  // (from the close's screenshots, where the hover's face took the pressed one's place).
  const world = history.getByRole('group', { name: 'Whose History' }).getByRole('button', { name: 'The World History', exact: true });
  await world.hover();
  // Read once the hover's colour transition has run: read during it, the face is between the two.
  await expect.poll(() => world.evaluate(pressedContrast)).toBeGreaterThanOrEqual(4.5);
  await debugHistory(page);
  await history.getByRole('button', { name: 'Oldest' }).click();
  await expectNoHorizontalOverflow(page, 'the oldest page of the whole History');
  await expectTargets(page, 'the oldest page of the whole History');

  // Someone found in the History by name, the Guildmaster's long one among them, and a Hero's page
  // opened from it (DL-74).
  await history.getByRole('searchbox', { name: 'Find someone in the History by name' }).fill('e');
  await expect(history.getByRole('list', { name: 'Found in the History' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'names found in the History');
  await history.getByRole('searchbox', { name: 'Find someone in the History by name' }).fill('Grimbeorht');
  await history.getByRole('button', { name: /^Read Ælfwine/ }).click();
  await expect(history.getByRole('heading', { level: 3, name: /^The History of Ælfwine/ })).toBeVisible();
  await expectNoHorizontalOverflow(page, "the Guildmaster's History, found by name");
  await expectTargets(page, "the Guildmaster's History, found by name");
  const heroName = (await (await rosterList(page)).locator('button.link').first().textContent()) ?? '';
  const again = await openView(page, 'History');
  await again.getByRole('searchbox', { name: 'Find someone in the History by name' }).fill(heroName);
  await again.getByRole('button', { name: `Read ${heroName}`, exact: true }).click();
  // Back goes to the History it came from, the Guildmaster's, which the choice held.
  const back = again.getByRole('button', { name: /^Back to the History of Ælfwine/ });
  await expect(back).toBeVisible();
  await expectNoHorizontalOverflow(page, "a Hero's page opened from the History");
  await back.click();
  // A name in a line opens whom it names: the long Guild's name, its page in the Rankings.
  await again.getByRole('group', { name: 'Whose History' }).getByRole('button', { name: new RegExp(`^${longGuild}`) }).click();
  await again.locator('.entry button.name', { hasText: longGuild }).first().click();
  const guildPage = page.getByRole('region', { name: 'Guilds', exact: true });
  await expect(guildPage.getByRole('heading', { level: 4, name: longGuild })).toBeVisible();
  await expectNoHorizontalOverflow(page, "the player's Guild's page, opened from its name in the History");

  // A save with a long name, and its delete asked for.
  const game = await thisGame(page);
  const longSave = `${'a-save-kept-for-later-'.repeat(4)}${'x'.repeat(40)}`;
  await game.getByLabel('Save as').fill(longSave);
  await game.getByRole('button', { name: 'Save in this browser' }).click();
  await expect(game.getByRole('article', { name: longSave })).toBeVisible();
  await game.getByRole('button', { name: `Delete ${longSave}` }).click();
  await expect(game.getByRole('button', { name: `Delete “${longSave}” for good` })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'a save with a long name, its delete asked for');

  // The new-game form over the game in hand.
  await game.getByRole('button', { name: 'Start a new game' }).click();
  await expect(page.getByText('The game in hand is lost unless you export it first.')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'the new-game form over a game');
  await page.getByRole('button', { name: 'Back to the game in hand' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(longGuild);
});

test('the Roster, the Hall, the Guildmaster, the Market, the Stores, the Treasury and the Rankings: no sideways scroll, a wide table in its own box, and 44px targets', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });
  // New Heroes in the pool, and a Day or so of the world's own doings.
  await statusBar(page).getByRole('button', { name: 'More ways to Fast forward' }).click();
  await playTurns(page, page.getByRole('button', { name: 'Fast forward until new Heroes join the pool' }));
  const { width: projectWidth, height } = page.viewportSize() ?? { width: 0, height: 0 };
  // The phone's 360px and a larger phone's 390px, the tablet's 820px, the desktop's 1280px.
  const widths = projectWidth < 600 ? [360, 390] : [projectWidth];

  for (const width of widths) {
    await page.setViewportSize({ width, height });
    const check = async (what: string): Promise<void> => {
      await expectNoHorizontalOverflow(page, `${what} at ${width}px`);
      await expectTargets(page, `${what} at ${width}px`);
    };

    // The Roster's cards; a Hero's page, its Transfer asked for and kept.
    const roster = await openView(page, 'Roster');
    await check("the Roster's cards");
    await (await rosterList(page)).locator('button.link').first().click();
    await expect(roster.getByRole('button', { name: 'Back to the Roster' })).toBeVisible();
    await check("a Hero's page");
    await roster.getByRole('button', { name: /^Transfer .+…$/ }).click();
    await expect(roster.getByRole('group', { name: /^Transfer .+\?$/ })).toBeVisible();
    await check("a Hero's Transfer asked for");
    await roster.getByRole('button', { name: 'Keep them' }).click();
    await roster.getByRole('button', { name: 'Back to the Roster' }).click();

    // The pool's rows, by fee and as listed.
    const pool = await part(page, 'Unattached pool');
    await check("the pool's rows");
    await inViewClear(pool.getByRole('table'), `the pool's headings and buttons at ${width}px`);
    await noNeedlessScroll(pool.getByRole('table'), `the pool at ${width}px`);
    await pool.getByRole('button', { name: 'Order by Fee' }).click();
    await check('the pool by fee');
    await pool.getByRole('button', { name: 'Order by Fee' }).click();

    // The Guild's Hall part, its facilities; the Guildmaster view; the Market's Buy filtered, and
    // its Sell.
    await guildPart(page, 'Hall');
    await check("the Guild's Hall part");
    await openView(page, 'Guildmaster');
    await check('the Guildmaster view');
    const market = await part(page, 'Buy');
    const kinds = market.getByRole('group', { name: 'Show for sale' });
    await kinds.getByRole('button').nth(1).click();
    await check("the Market's Buy, one kind shown");
    await kinds.getByRole('button', { name: 'All', exact: true }).click();
    await market.getByTestId('listing').first().getByRole('button', { name: /^Buy / }).click();
    await expect(page.getByRole('region', { name: 'Sell', exact: true }).getByRole('table')).toBeVisible();
    await check("the Market's Sell");
    const sell = page.getByRole('region', { name: 'Sell', exact: true }).getByRole('table');
    await inViewClear(sell, `the Market's Sell's headings and buttons at ${width}px`);
    await noNeedlessScroll(sell, `the Market's Sell at ${width}px`);
    await longFirstName(sell, `the Market's Sell at ${width}px`);

    // The Guild's Stores, holding what was just bought, and its Treasury, the purchase in the
    // ledger: each table in its own box.
    const stores = await guildPart(page, 'Stores');
    await expect(stores.getByRole('table')).toBeVisible();
    await check("the Guild's Stores");
    await inViewClear(stores.getByRole('table'), `the Guild's Stores' headings and buttons at ${width}px`);
    await noNeedlessScroll(stores.getByRole('table'), `the Guild's Stores at ${width}px`);
    await longFirstName(stores.getByRole('table'), `the Guild's Stores at ${width}px`);
    // Its five columns fit a tablet's width and more, where the Market's wider table scrolls
    // (from the close's screenshots, where "Sells for" was cut at 820px).
    if (width >= 820) expect(await stores.locator('.table-wrap').evaluate((box) => box.scrollWidth - box.clientWidth)).toBeLessThanOrEqual(0);
    const treasury = await guildPart(page, 'Treasury');
    await expect(treasury.getByRole('table', { name: /^The ledger of / })).toBeVisible();
    await check("the Guild's Treasury");
    // A name in the ledger's sentence reads as a name in the History's lines do: a link's look, in the
    // sentence, not a bordered button (from the close's screenshots).
    const named = treasury.getByRole('table', { name: /^The ledger of / }).locator('button.name').first();
    await expect(named).toHaveCSS('border-top-style', 'none');
    await expect(named).toHaveCSS('text-decoration-line', 'underline');

    // The Rankings' table, ordered by Upkeep; a Rival's page, its Hall and Guildmaster unfolded.
    await openView(page, 'Rankings');
    await check("the Rankings' table");
    const guilds = await part(page, 'Guilds');
    await guilds.getByRole('button', { name: 'Order by Upkeep' }).click();
    await check('the Rankings by Upkeep');
    await guilds.getByRole('button', { name: 'Order by Fame' }).click();
    await rivalRows(guilds).first().locator('button.link').click();
    const rival = guilds.getByRole('article');
    for (const summary of await rival.locator('details > summary').all()) await summary.click();
    await check("a Rival's page, its Hall and Guildmaster unfolded");
    await guilds.getByRole('button', { name: 'Back to the Guilds' }).click();

    // The Patrons' table, the neutral ones unfolded.
    const patrons = await part(page, 'Patrons');
    const fold = patrons.getByRole('button', { name: /^\d+ neutral$/ });
    if ((await fold.count()) > 0) await fold.click();
    await check("the Patrons' table, the neutral unfolded");
    await inViewClear(patrons.getByRole('table'), `the Patrons' headings and buttons at ${width}px`);
    await noNeedlessScroll(patrons.getByRole('table'), `the Patrons at ${width}px`);
    await longFirstName(patrons.getByRole('table'), `the Patrons at ${width}px`);
    if ((await fold.count()) > 0) await fold.click();
  }
});

/** What a save holds that the Unique Items below are added to. */
interface SaveFile {
  world: {
    counters: { items: number };
    guilds: Record<string, { controller: { kind: string }; rosterIds: string[] }>;
    items: Record<string, { id: string; definitionKey: string; holder: Record<string, string> }>;
  };
}

/**
 * The game in hand exported and loaded back with two Unique Items: the
 * Barrow King's blade in the Guild's Stores, and the Lantern of Stannary carried by its first Hero, as
 * the screenshots of the Unique Items held them.
 */
async function holdingUniques(page: Page, testInfo: TestInfo): Promise<void> {
  const [download] = await Promise.all([page.waitForEvent('download'), (await thisGame(page)).getByRole('button', { name: 'Export this game' }).click()]);
  const file = testInfo.outputPath('uniques.json');
  await download.saveAs(file);
  const save = JSON.parse(readFileSync(file, 'utf8')) as SaveFile;
  const player = Object.entries(save.world.guilds).find(([, guild]) => guild.controller.kind === 'player');
  if (player === undefined) throw new Error("the save has no player's Guild");
  const [guildId, guild] = player;
  const add = (definitionKey: string, holder: Record<string, string>): void => {
    const id = `item-${String(save.world.counters.items).padStart(6, '0')}`;
    save.world.items[id] = { id, definitionKey, holder };
    save.world.counters.items += 1;
  };
  add('barrow-kings-blade', { kind: 'guild', id: guildId });
  add('lantern-of-stannary', { kind: 'hero', id: guild.rosterIds[0] ?? '', slot: 'trinket' });
  writeFileSync(file, JSON.stringify(save));
  await (await thisGame(page)).getByLabel('Load a save file').setInputFiles(file);
  // A save loaded closes the game menu, the game in hand now the one loaded.
  await expect(page.getByRole('dialog', { name: 'Game' })).toHaveCount(0);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
}

// The Stores and the Market's Sell with a Unique Item's picture beside
// its name, at every width, and at 360px in the dark scheme too.
test("the Stores and the Market's Sell with a Unique Item's picture: no sideways scroll and 44px targets, and at 360px in the dark scheme", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-uniques' });
  await holdingUniques(page, testInfo);
  const phone = (page.viewportSize()?.width ?? 0) < 600;

  for (const scheme of phone ? (['light', 'dark'] as const) : (['light'] as const)) {
    await page.emulateMedia({ colorScheme: scheme });
    const at = `in the ${scheme} scheme at ${page.viewportSize()?.width ?? 0}px`;

    const stores = await guildPart(page, 'Stores');
    const blade = stores.getByRole('row').filter({ hasText: "Barrow King's blade" });
    await expect(blade.getByTestId('item-picture')).toBeVisible();
    const lantern = stores.getByRole('row').filter({ hasText: 'Lantern of Stannary' });
    await expect(lantern.getByTestId('item-picture')).toBeVisible();
    await expectNoHorizontalOverflow(page, `the Stores ${at}`);
    await expectTargets(page, `the Stores ${at}`);

    const sell = await part(page, 'Sell');
    await expect(sell.getByRole('row').filter({ hasText: "Barrow King's blade" }).getByTestId('item-picture')).toBeVisible();
    await expectNoHorizontalOverflow(page, `the Market's Sell ${at}`);
    await expectTargets(page, `the Market's Sell ${at}`);
  }
  if (phone) {
    // The dark scheme is the page's, not the test's: the body's background is the dark token's.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(background);
  }
});

test("the Guildmaster's header and a Hero's page's: the Portrait, 3 × 4, beside the name, and the Guild's Banner beside its titles, with no sideways scroll", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });
  // About 7.5rem wide on a wide screen and 5rem on a phone (DL-125 item 2).
  const wide = (page.viewportSize()?.width ?? 0) >= 600 ? 120 : 80;

  /** The Portrait in `scope`: its size, and beside `heading`, the name, its top level with the name's. */
  const portraitBeside = async (scope: Locator, heading: Locator, what: string): Promise<void> => {
    const portrait = scope.getByTestId('portrait');
    await expect(portrait).toBeVisible();
    const box = await portrait.boundingBox();
    const name = await heading.boundingBox();
    if (box === null || name === null) throw new Error(`${what}: no Portrait or name drawn`);
    expect(box.width, `${what}: the Portrait's width`).toBeCloseTo(wide, 0);
    expect(box.height, `${what}: the Portrait's height`).toBeCloseTo((wide * 4) / 3, 0);
    expect(box.x + box.width, `${what}: the Portrait before the name`).toBeLessThanOrEqual(name.x);
    expect(Math.abs(name.y - box.y), `${what}: the name level with the Portrait's top`).toBeLessThanOrEqual(12);
    // The Silhouette, which the script holds, is drawn, or the picture over it once it has loaded,
    // when the Silhouette goes: one picture, read once the two have settled (DL-134 item 9).
    await expect(portrait.locator('img')).toHaveCount(1);
    expect(await portrait.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page, what);
    await expectTargets(page, what);
  };

  /** The Banner in `heading`: two wide by three high, before the name. */
  const bannerIn = async (heading: Locator, what: string): Promise<void> => {
    const banner = heading.getByTestId('guild-banner');
    const box = await banner.boundingBox();
    const words = await heading.locator('span').last().boundingBox();
    if (box === null || words === null) throw new Error(`${what}: no Banner drawn`);
    expect(box.height / box.width, `${what}: the Banner 2 × 3`).toBeCloseTo(1.5, 1);
    expect(box.x + box.width, `${what}: the Banner before the name`).toBeLessThanOrEqual(words.x);
  };

  await bannerIn(statusBar(page).getByRole('heading', { level: 1 }), 'the status bar');
  const guildmaster = await openView(page, 'Guildmaster');
  const title = guildmaster.getByRole('heading', { level: 3 });
  await portraitBeside(guildmaster, title, "the Guildmaster's header");
  await bannerIn(title, "the Guildmaster's title");

  await (await rosterList(page)).locator('button.link').first().click();
  const hero = page.getByRole('region', { name: 'Roster', exact: true }).getByRole('article');
  await portraitBeside(hero, hero.getByRole('heading', { level: 3 }), "a Hero's page's header");

  // A Guild's page, its Banner the largest, and its Guildmaster's header unfolded under it.
  const guilds = await part(page, 'Guilds');
  await rivalRows(guilds).first().locator('button.link').click();
  const rival = guilds.getByRole('article');
  await bannerIn(rival.getByRole('heading', { level: 4 }), "a Guild's page");
  for (const summary of await rival.locator('details > summary').all()) await summary.click();
  await portraitBeside(rival, rival.getByRole('heading', { level: 5, name: /, Guildmaster of / }), "a Rival's Guildmaster on its page");
});

// DL-135 item 9: a thumbnail beside each name in the Roster, the pool and the Guilds' table,
// 48px high and before the name, at every width and in both schemes, with no sideways scroll.
test("the Roster's cards, the pool's rows and the Guilds' table: each name with its thumbnail or small Silhouette, and no sideways scroll", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });

  /** Each thumbnail in `rows`: drawn, 48px high and three wide by four, before the name beside it. */
  const thumbsBeside = async (rows: Locator, what: string): Promise<number> => {
    const count = await rows.count();
    expect(count, `${what}: rows`).toBeGreaterThan(0);
    let pictured = 0;
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      await row.scrollIntoViewIfNeeded();
      const thumb = row.getByTestId('portrait-thumb');
      const name = row.locator('button.link').first();
      const box = await thumb.boundingBox();
      const named = await name.boundingBox();
      if (box === null || named === null) throw new Error(`${what} ${index}: no thumbnail or name drawn`);
      expect(box.height, `${what} ${index}: 48px high`).toBeCloseTo(48, 0);
      expect(box.width / box.height, `${what} ${index}: 3 × 4`).toBeCloseTo(0.75, 1);
      expect(box.x + box.width, `${what} ${index}: before the name`).toBeLessThanOrEqual(named.x);
      const image = thumb.locator('img').last();
      await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
      if ((await image.getAttribute('data-picture')) === 'picture') pictured += 1;
    }
    return pictured;
  };

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const roster = await rosterList(page);
    // No Hero has a picture yet: each shows the small Silhouette.
    expect(await thumbsBeside(roster.getByRole('listitem'), `the Roster, ${scheme}`)).toBe(0);
    await expectNoHorizontalOverflow(page, `the Roster's thumbnails, ${scheme}`);
    await expectTargets(page, `the Roster's thumbnails, ${scheme}`);

    const pool = await part(page, 'Unattached pool');
    expect(await thumbsBeside(pool.getByTestId('pool-row'), `the pool, ${scheme}`)).toBe(0);
    await expectNoHorizontalOverflow(page, `the pool's thumbnails, ${scheme}`);
    await expectTargets(page, `the pool's thumbnails, ${scheme}`);

    // The Guilds' table: each Guildmaster's, the picture chosen for them where one fits.
    const guilds = await part(page, 'Guilds');
    expect(await thumbsBeside(guilds.getByTestId('guild-row'), `the Guilds' table, ${scheme}`)).toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page, `the Guilds' thumbnails, ${scheme}`);
    await expectTargets(page, `the Guilds' thumbnails, ${scheme}`);
    await page.screenshot({ path: test.info().outputPath(`lists-${scheme}.png`), fullPage: true });

    // A Rival's Roster on its Guild's page (DL-147): each Hero's small Silhouette, and the fixed name
    // cell, wider with it, never over the Transfer fee's heading with the table scrolled to its end.
    await rivalRows(guilds).first().locator('button.link').click();
    const rival = guilds.getByRole('article');
    expect(await thumbsBeside(rival.getByTestId('guild-hero'), `a Rival's Roster, ${scheme}`)).toBe(0);
    await expectNoHorizontalOverflow(page, `a Rival's Roster's thumbnails, ${scheme}`);
    await expectTargets(page, `a Rival's Roster's thumbnails, ${scheme}`);
    await rival.locator('.table-wrap', { has: page.getByRole('table', { name: /^The Roster of / }) }).evaluate((box) => {
      box.scrollLeft = box.scrollWidth;
    });
    const nameHeading = await rival.getByRole('columnheader', { name: 'Name' }).boundingBox();
    const feeHeading = await rival.getByRole('columnheader', { name: 'Transfer fee' }).boundingBox();
    if (nameHeading === null || feeHeading === null) throw new Error(`a Rival's Roster, ${scheme}: no headings drawn`);
    expect(feeHeading.x, `a Rival's Roster, ${scheme}: the Transfer fee's heading clear of the name cell`).toBeGreaterThanOrEqual(nameHeading.x + nameHeading.width - 1);
    await page.screenshot({ path: test.info().outputPath(`rival-roster-${scheme}.png`), fullPage: true });
    await guilds.getByRole('button', { name: 'Back to the Guilds' }).click();
  }
});

// A Hero's name with their Class's mark before it (DL-206 items 23 and 24, DL-212), in the five places
// a Hero is listed with their Class, at every width: the mark the text's size, before the name and
// clear of it, on the line of the name's first word and never alone on a line (the owner's (b),
// DL-212), and no word of the name broken inside it.
test("a Hero's name with their Class's mark: the mark before the name, the text's size, on the first word's line, and no word of the name broken", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });

  /** Each name in `scope`: its mark drawn before its first word, on its line, and as high as a line, and each word on one line. */
  const namesWhole = async (scope: Locator, what: string): Promise<void> => {
    const names = scope.locator('.hero-name');
    await expect(names.first()).toBeVisible();
    for (const name of await names.all()) {
      const read = await name.evaluate((element) => {
        const mark = element.querySelector('.class-mark')?.getBoundingClientRect();
        const words: { word: string; lines: number; x: number; top: number; bottom: number }[] = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          for (const found of (node.textContent ?? '').matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(node, found.index);
            range.setEnd(node, found.index + found[0].length);
            const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
            words.push({
              word: found[0],
              lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
              x: rects[0]?.x ?? 0,
              top: rects[0]?.top ?? 0,
              bottom: rects[0]?.bottom ?? 0,
            });
          }
        }
        return { mark: mark === undefined ? null : { x: mark.x, right: mark.right, top: mark.top, bottom: mark.bottom, height: mark.height }, words };
      });
      const label = `${what}: ${read.words.map((it) => it.word).join(' ')}`;
      if (read.mark === null) throw new Error(`${label}: no mark`);
      expect(read.mark.height, `${label}: the mark the text's size`).toBeGreaterThanOrEqual(16);
      expect(read.mark.height, `${label}: the mark the text's size`).toBeLessThanOrEqual(28);
      const [first] = read.words;
      if (first === undefined) throw new Error(`${label}: no name`);
      // Before the first word, to its left, and on its line: the mark and the first word never part,
      // so the mark is never alone on a line (the owner's (b), DL-212).
      expect(read.mark.right, `${label}: the mark before the name`).toBeLessThanOrEqual(first.x + 1);
      const markMiddle = (read.mark.top + read.mark.bottom) / 2;
      expect(markMiddle > first.top && markMiddle < first.bottom, `${label}: the mark on the first word's line, not alone above it`).toBe(true);
      for (const word of read.words) expect(word.lines, `${label}: "${word.word}" whole on one line`).toBe(1);
    }
  };

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const list = await rosterList(page);
    await namesWhole(list, `the Roster's tiles, ${scheme}`);
    const roster = page.getByRole('region', { name: 'Roster', exact: true });
    const show = roster.getByRole('radiogroup', { name: 'Show the Roster as' });
    await show.getByRole('radio', { name: 'Table' }).click();
    await namesWhole(roster.getByRole('table', { name: 'Heroes on the Roster' }), `the Roster's Table, ${scheme}`);
    await inViewClear(roster.getByRole('table', { name: 'Heroes on the Roster' }), `the Roster's Table's headings and buttons, ${scheme}`);
    await noNeedlessScroll(roster.getByRole('table', { name: 'Heroes on the Roster' }), `the Roster's Table, ${scheme}`);
    await show.getByRole('radio', { name: 'Tiles' }).click();
    const pool = await part(page, 'Unattached pool');
    await namesWhole(pool, `the pool, ${scheme}`);
    // A first name longer than the share the name column may take, which no name the content gives is:
    // the column holds to its share, the word breaks there with the mark on its first line, and nothing
    // spills from the name's button (DL-212). The name is put back as it was.
    const capped = await pool.getByRole('table').evaluate((element) => {
      const first = element.querySelector<HTMLElement>('tbody .hero-name__first');
      const box = element.closest('.table-wrap');
      const heading = element.querySelector('thead th');
      const mark = first?.parentElement?.querySelector('.class-mark');
      const button = first?.closest('button');
      if (first == null || box == null || heading == null || mark == null || button == null) return null;
      const was = first.textContent;
      first.textContent = 'W'.repeat(60);
      const line = first.getClientRects()[0];
      const drawn = mark.getBoundingClientRect();
      const middle = (drawn.top + drawn.bottom) / 2;
      const read = {
        share: heading.getBoundingClientRect().width / box.clientWidth,
        markOnFirstLine: line !== undefined && middle > line.top && middle < line.bottom,
        spills: button.scrollWidth - button.clientWidth,
      };
      first.textContent = was;
      return read;
    });
    if (capped === null) throw new Error(`the pool, ${scheme}: no name to lengthen`);
    expect(capped.share, `the pool, ${scheme}: a long first name, the name column's share of its box`).toBeLessThanOrEqual(0.6);
    expect(capped.markOnFirstLine, `the pool, ${scheme}: a long first name, the mark on its first line`).toBe(true);
    expect(capped.spills, `the pool, ${scheme}: a long first name, nothing spilling from its button`).toBeLessThanOrEqual(0);

    await (await rosterList(page)).locator('button.link').first().click();
    await namesWhole(roster.getByRole('article').getByRole('heading', { level: 3 }), `a Hero's page, ${scheme}`);
    await roster.getByRole('button', { name: 'Back to the Roster' }).click();

    const board = await openView(page, 'Board');
    const quest = board.getByRole('article').first();
    const choose = quest.getByRole('button', { name: 'Choose a Party' });
    if ((await choose.count()) > 0) await choose.click();
    await namesWhole(quest.getByRole('form'), `the Party builder, ${scheme}`);

    const guilds = await part(page, 'Guilds');
    await rivalRows(guilds).first().locator('button.link').click();
    await namesWhole(guilds.getByRole('article').getByRole('table', { name: /^The Roster of / }), `a Rival's Roster, ${scheme}`);
    await inViewClear(guilds.getByRole('article').getByRole('table', { name: /^The Roster of / }), `a Rival's Roster's headings and buttons, ${scheme}`);
    await guilds.getByRole('button', { name: 'Back to the Guilds' }).click();
  }
});

/**
 * Each heading (its button where it has one) and each button in the cells of a Table whose first
 * column stays in view, scrolled into the Table's box at its start, its middle and its end, as the
 * keyboard's focus, a pointer's click and a search may bring it, is the element at its own middle: the
 * sticky first column never covers it, however wide the Hero's mark and first name make that column
 * (DL-212). The Table's box is put back as it was.
 */
async function inViewClear(table: Locator, what: string): Promise<void> {
  await expect(table).toBeVisible();
  await drawn(table);
  const { covered, tried } = await table.evaluate((element) => {
    const box = element.closest('.table-wrap');
    const was = box?.scrollLeft ?? 0;
    const headings = [...element.querySelectorAll<HTMLElement>('thead th:not(:first-child)')].map((th) => th.querySelector<HTMLElement>('button') ?? th);
    const targets = [...headings, ...element.querySelectorAll<HTMLElement>('tbody td button')];
    const under: string[] = [];
    for (const inline of ['start', 'center', 'end'] as const) {
      for (const target of targets) {
        target.scrollIntoView({ block: 'center', inline, behavior: 'instant' });
        const at = target.getBoundingClientRect();
        const found = document.elementFromPoint(at.x + at.width / 2, at.y + at.height / 2);
        if (found === null || !target.contains(found)) under.push(`"${target.textContent ?? ''}" at the ${inline}, under ${found?.closest('th, td, aside, header, nav')?.textContent?.slice(0, 40) ?? 'nothing'}`);
      }
    }
    if (box !== null) box.scrollLeft = was;
    return { covered: under, tried: targets.length };
  });
  expect(tried, `${what}: things to bring into view`).toBeGreaterThan(1);
  expect(covered, `${what}: nothing under the sticky column`).toEqual([]);
}

/**
 * Each heading (its button where it has one, else the heading made focusable for the check) and each
 * button in the cells of a Table whose first column stays in view, fully in its box and clear of that
 * column, takes the focus without the box scrolling: the box keeps clear at its start only the sticky
 * column's width, never more (DL-212). Tried with the box scrolled to its start, its middle and its
 * end; the box and the headings are put back as they were.
 */
async function noNeedlessScroll(table: Locator, what: string): Promise<void> {
  await expect(table).toBeVisible();
  await drawn(table);
  const { moved, tried } = await table.evaluate((element) => {
    const box = element.closest('.table-wrap');
    const column = element.querySelector('thead th:first-child');
    if (box === null || column === null) return { moved: ['no box or no first column'], tried: 0 };
    const was = box.scrollLeft;
    const headings = [...element.querySelectorAll<HTMLElement>('thead th:not(:first-child)')].map((th) => th.querySelector<HTMLElement>('button') ?? th);
    const made = headings.filter((target) => target.tagName === 'TH');
    for (const th of made) th.tabIndex = -1;
    const targets = [...headings, ...element.querySelectorAll<HTMLElement>('tbody td button')];
    const shifts: string[] = [];
    let count = 0;
    const end = box.scrollWidth - box.clientWidth;
    for (const at of [0, Math.round(end / 2), end]) {
      for (const target of targets) {
        box.scrollLeft = at;
        const from = box.scrollLeft;
        const shown = box.getBoundingClientRect();
        const clear = column.getBoundingClientRect().right;
        const rect = target.getBoundingClientRect();
        if (rect.left < clear || rect.right > shown.right || rect.width === 0) continue;
        count += 1;
        target.focus();
        if (box.scrollLeft !== from) shifts.push(`"${target.textContent ?? ''}" from ${from} to ${box.scrollLeft}`);
        target.blur();
      }
    }
    for (const th of made) th.removeAttribute('tabindex');
    box.scrollLeft = was;
    return { moved: shifts, tried: count };
  });
  expect(tried, `${what}: buttons in view and clear of the sticky column`).toBeGreaterThan(0);
  expect(moved, `${what}: no scroll for a button already in view`).toEqual([]);
}

/**
 * The first name of a Table whose first column stays in view, made longer than the share of its box
 * that column may take, which no name the content gives is (an Item's, a Patron's): the column holds
 * to its share, and nothing in the Table is brought into view under it (DL-212). Put back as it was.
 */
async function longFirstName(table: Locator, what: string): Promise<void> {
  await expect(table).toBeVisible();
  const share = await table.evaluate((element) => {
    const cell = element.querySelector('tbody th[scope="row"]');
    const box = element.closest('.table-wrap');
    const column = element.querySelector('thead th:first-child');
    if (cell === null || box === null || column === null) return null;
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => ((node.nodeValue ?? '').trim() === '' ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT),
    });
    const text = walker.nextNode();
    if (text === null) return null;
    Reflect.set(window, '__longFirstName', { text, was: text.nodeValue });
    text.nodeValue = `${'W'.repeat(60)} ${'Lantern '.repeat(12)}`;
    return column.getBoundingClientRect().width / box.clientWidth;
  });
  if (share === null) throw new Error(`${what}: no name to lengthen`);
  try {
    expect(share, `${what}: a long first name, the first column's share of its box`).toBeLessThanOrEqual(0.6);
    await inViewClear(table, `${what}, a long first name`);
  } finally {
    await table.evaluate(() => {
      const held = Reflect.get(window, '__longFirstName') as { text: Node; was: string } | undefined;
      if (held !== undefined) held.text.nodeValue = held.was;
    });
  }
}

/**
 * Waits for the page to be drawn twice: a Table's box measures its sticky column (`StickyTableBox`)
 * before a frame is drawn, and a test, unlike a player, may act within one frame of a change.
 */
async function drawn(scope: Locator): Promise<void> {
  await scope.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

/** The rows of the Guilds' table that are not the player's Guild. */
function rivalRows(guilds: Locator): Locator {
  return guilds.locator('[data-testid="guild-row"]:not(.mine)');
}

test("the new-game form with the Guildmaster's setup open, a Trait chosen and others marked: no sideways scroll, and 44px targets", async ({
  page,
}) => {
  await page.goto('/');
  const form = page.getByRole('region', { name: 'A new game', exact: true });
  await form.getByRole('textbox', { name: 'Guild name', exact: true }).fill(longGuild);
  await form.getByRole('textbox', { name: /Guildmaster/ }).fill(longMaster);
  const setup = await guildmasterSetup(page);
  await chooseGuildmaster(setup);
  await setup.getByRole('radio', { name: 'Choose them' }).check();
  await traitBox(setup, 'Miser').check();
  // Miser excludes two; two pass the budget of 1 with it or alone.
  await expect(traitBox(setup, 'Well liked')).toBeDisabled();
  await expectNoHorizontalOverflow(page, "the Guildmaster's setup, a Trait chosen");
  await expectTargets(page, "the Guildmaster's setup, a Trait chosen");
  await setup.getByRole('textbox', { name: 'Birthplace', exact: true }).fill('x'.repeat(61));
  await expect(page.getByTestId('setup-refusal')).toHaveText('The Birthplace is 61 characters long; it holds at most 60.');
  await expect(page.getByRole('button', { name: 'Start the game' })).toBeDisabled();
  await expectNoHorizontalOverflow(page, "the Guildmaster's setup refused");
});

// DL-149: the setup screen's two ways at each width, in the light and the dark scheme: "Choose
// for me" with the Guildmaster chosen for the player beside their Portrait, and "Choose myself" before a
// sex is chosen, then with the grid, the Stats' steppers and a point left unspent, every control a 44px
// target and the page never wider than the viewport.
test('the setup screen, each way, in the light and the dark scheme: no sideways scroll, and 44px targets', async ({ page }) => {
  const backgrounds: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const form = page.getByRole('region', { name: 'A new game', exact: true });
    await form.getByRole('textbox', { name: 'Guild name', exact: true }).fill(longGuild);
    await form.getByRole('textbox', { name: /Guildmaster/ }).fill(longMaster);
    await form.getByRole('textbox', { name: 'Seed', exact: true }).fill('e2e-layout-setup');
    const forMe = await guildmasterSetup(page, 'Choose for me');
    const preview = forMe.getByTestId('guildmaster-preview');
    await expect(preview.locator('p').first()).toHaveText('Chosen for you');
    await expect(preview.locator('p')).toHaveCount(5);
    await expect(forMe.getByLabel('Sex', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start the game' })).toBeEnabled();
    await expectNoHorizontalOverflow(page, `"Choose for me", ${scheme}`);
    await expectTargets(page, `"Choose for me", ${scheme}`);
    await page.screenshot({ path: test.info().outputPath(`setup-for-me-${scheme}.png`), fullPage: true });

    const mine = await guildmasterSetup(page, 'Choose myself');
    await expect(mine.getByTestId('portrait-unsexed')).toHaveText('Choose a Sex to see the pictures.');
    await expect(page.getByTestId('setup-hint')).toHaveText("Choose your Guildmaster's Sex, Age and Portrait to start.");
    await expect(page.getByRole('button', { name: 'Start the game' })).toBeDisabled();
    await expectNoHorizontalOverflow(page, `"Choose myself", no sex chosen, ${scheme}`);
    await expectTargets(page, `"Choose myself", no sex chosen, ${scheme}`);
    await chooseGuildmaster(mine, { sex: 'male', age: '44', picture: 'Male Portrait 5' });
    const stats = mine.getByRole('group', { name: 'Stats', exact: true });
    await stats.getByRole('button', { name: 'Lower Judgement' }).click();
    await expect(stats.getByTestId('stat-points-unspent')).toHaveText('Stat points left unspent are lost.');
    await expect(page.getByRole('button', { name: 'Start the game' })).toBeEnabled();
    await expectNoHorizontalOverflow(page, `"Choose myself", chosen, ${scheme}`);
    await expectTargets(page, `"Choose myself", chosen, ${scheme}`);
    // Each Stat's stepper on one line with its name, at every width.
    for (const row of await stats.locator('.stat-pick__line').all()) {
      const name = await row.locator('.stat-pick__name').boundingBox();
      const lower = await row.getByRole('button', { name: /^Lower / }).boundingBox();
      const raise = await row.getByRole('button', { name: /^Raise / }).boundingBox();
      if (name === null || lower === null || raise === null) throw new Error(`a Stat, ${scheme}: not drawn`);
      expect(Math.abs(lower.y - raise.y), `a Stat's buttons side by side, ${scheme}`).toBeLessThan(2);
    }
    backgrounds.push(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    await page.screenshot({ path: test.info().outputPath(`setup-myself-${scheme}.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
  // The dark scheme is the page's, not the test's: the body's background is the dark token's.
  expect(new Set(backgrounds).size).toBe(2);
});

// DL-148 items 15 to 17: the Board's card with "Your best Party:" and a chance word, unfolded to
// each Encounter and what each Check reads, and the Party builder with a chance word for each Encounter and
// the Quest and the numbers in its detail, opened, at each width, in the light and the dark scheme: no
// sideways scroll and 44px targets.
test('the Board’s chances and what each Check reads, and the Party builder’s, in the light and the dark scheme', async ({ page }) => {
  test.setTimeout(120_000);
  const backgrounds: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });
    const at = `${scheme}, ${page.viewportSize()?.width ?? 0}px`;
    const board = await openView(page, 'Board');
    const quest = board.getByRole('article').first();
    await expect(quest.getByTestId('best-party')).toHaveText(
      /^(Your best Party: (Hopeless|Unlikely|Even|Likely|Near certain|not known until its Encounters are drawn), .+|No Party of your free Heroes meets its requirements\.)$/,
    );
    await expectNoHorizontalOverflow(page, `the Board's cards, ${at}`);

    // Unfolded: each Encounter, and what its Checks read.
    await quest.getByRole('heading', { level: 3 }).getByRole('button').click();
    const encounters = quest.getByTestId('encounters');
    await expect(encounters.locator(':scope > li').first()).toBeVisible();
    await expect(encounters.locator(':scope > li').first()).toContainText(/(Reads |: )(the |\d|Strength|Wits)/);
    await expectNoHorizontalOverflow(page, `a card unfolded, ${at}`);
    await expectTargets(page, `a card unfolded, ${at}`);

    // The builder, two Heroes chosen: a word for each Encounter and for the Quest, and the numbers opened.
    await quest.getByRole('button', { name: 'Choose a Party' }).click();
    const form = quest.getByRole('form');
    const boxes = form.getByRole('checkbox');
    for (const index of [0, 1]) if (await boxes.nth(index).isEnabled()) await boxes.nth(index).check();
    const chances = form.getByTestId('chances');
    await expect(chances.getByRole('listitem').last()).toHaveText(/^The Quest: (Hopeless|Unlikely|Even|Likely|Near certain)$/);
    await form.getByText('The numbers, if no one falls').click();
    const numbers = form.getByTestId('chance-numbers');
    await expect(numbers.getByRole('listitem').last()).toBeVisible();
    for (const line of await numbers.getByRole('listitem').allTextContents()) expect(line).toMatch(/: (\d+)%$/);
    for (const line of await numbers.getByRole('listitem').allTextContents()) expect(Number(/(\d+)%$/.exec(line)?.[1]) % 5).toBe(0);
    await expect(form.getByTestId('party-morale')).toBeVisible();
    await expectNoHorizontalOverflow(page, `the Party builder with its chances, ${at}`);
    await expectTargets(page, `the Party builder with its chances, ${at}`);
    await page.screenshot({ path: test.info().outputPath(`board-chances-${scheme}.png`), fullPage: true });
    backgrounds.push(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  }
  await page.emulateMedia({ colorScheme: 'light' });
  // The dark scheme is the page's, not the test's: the body's background is the dark token's.
  expect(new Set(backgrounds).size).toBe(2);
});

// DL-169 items 6 to 12: the Roster's Table, at 360px and 390px on a phone and at each wider
// width, in the light and the dark scheme. The Guildmaster's Old soldier raises the Warrior's Weaponry and
// Mistrusts magic lowers the Mage's Arcana, so a Stat stands raised and one lowered. No sideways scroll of
// the page and 44px targets; the Table scrolls in its own box, its Name pinned; on a wide screen the
// Columns panel, on a phone the six tabs; and the green and the red at 4.5:1 or more on what is under them.
test("the Roster's Table, its Columns panel and its tabs, in the light and the dark scheme: no sideways scroll, 44px targets, the Table in its own box, and the green and red legible", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const setup = await guildmasterSetup(page);
  await chooseGuildmaster(setup);
  await setup.getByRole('radio', { name: 'Choose them' }).check();
  await traitBox(setup, 'Old soldier').check();
  await traitBox(setup, 'Mistrusts magic').check();
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });
  const { width: projectWidth, height } = page.viewportSize() ?? { width: 0, height: 0 };
  const phone = projectWidth < 600;
  const widths = phone ? [360, 390] : [projectWidth];
  const backgrounds: string[] = [];

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of widths) {
      await page.setViewportSize({ width, height });
      const at = `${scheme}, ${width}px`;
      const roster = await openView(page, 'Roster');
      await roster.getByRole('radiogroup', { name: 'Show the Roster as' }).getByRole('radio', { name: 'Table' }).click();
      const table = roster.getByRole('table', { name: 'Heroes on the Roster' });
      await expect(table).toBeVisible();
      await expectNoHorizontalOverflow(page, `the Roster's Table, ${at}`);
      await expectTargets(page, `the Roster's Table, ${at}`);

      // The Table scrolls in its own box, its Name pinned at the box's left edge when scrolled to its end.
      const box = roster.locator('.roster-table-wrap');
      if (!phone) expect(await box.evaluate((element) => element.scrollWidth - element.clientWidth), `the Table wider than its box, ${at}`).toBeGreaterThan(0);
      await box.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      await expectNoHorizontalOverflow(page, `the Roster's Table scrolled to its end, ${at}`);
      const edge = await box.boundingBox();
      const name = await table.getByRole('columnheader', { name: 'Name' }).boundingBox();
      if (edge === null || name === null) throw new Error(`the Table not drawn, ${at}`);
      expect(Math.abs(name.x - edge.x), `the Name pinned at the box's edge, ${at}`).toBeLessThanOrEqual(1);
      await box.evaluate((element) => {
        element.scrollLeft = 0;
      });

      const raised = table.locator('td.change--up').first();
      const lowered = table.locator('td.change--down').first();
      if (phone) {
        // The six tabs, Hero first and State second (DL-289); no Columns panel.
        await expect(roster.getByRole('button', { name: 'Columns', exact: true })).toHaveCount(0);
        const tabs = roster.getByRole('tablist', { name: 'Columns of the Table' });
        await expect(tabs.getByRole('tab')).toHaveText(['Hero', 'State', 'Physical', 'Mental', 'Magical', 'Social']);
        for (const tab of ['Hero', 'State', 'Physical', 'Mental', 'Magical', 'Social']) {
          await tabs.getByRole('tab', { name: tab }).click();
          await expect(table.getByRole('columnheader').first()).toHaveText('Name');
          await expectNoHorizontalOverflow(page, `the Table's ${tab} tab, ${at}`);
          await expectTargets(page, `the Table's ${tab} tab, ${at}`);
          if (tab === 'Physical') {
            await expect(raised).toHaveText(/^\d+ ▲/);
            expect(await raised.evaluate(textContrast), `the green on its ground, ${at}`).toBeGreaterThanOrEqual(4.5);
            await page.screenshot({ path: test.info().outputPath(`roster-table-physical-${scheme}-${width}.png`), fullPage: true });
          }
          if (tab === 'Magical') {
            await expect(lowered).toHaveText(/^\d+ ▼/);
            expect(await lowered.evaluate(textContrast), `the red on its ground, ${at}`).toBeGreaterThanOrEqual(4.5);
          }
        }
        await tabs.getByRole('tab', { name: 'Hero' }).click();
      } else {
        await expect(raised).toHaveText(/^\d+ ▲/);
        await expect(lowered).toHaveText(/^\d+ ▼/);
        expect(await raised.evaluate(textContrast), `the green on its ground, ${at}`).toBeGreaterThanOrEqual(4.5);
        expect(await lowered.evaluate(textContrast), `the red on its ground, ${at}`).toBeGreaterThanOrEqual(4.5);
        // The Columns panel open, a group hidden and every column shown again.
        await roster.getByRole('button', { name: 'Columns', exact: true }).click();
        const panel = roster.getByRole('group', { name: 'Columns' });
        await expect(panel.getByRole('checkbox')).toHaveCount(28);
        await expectNoHorizontalOverflow(page, `the Columns panel, ${at}`);
        await expectTargets(page, `the Columns panel, ${at}`);
        await page.screenshot({ path: test.info().outputPath(`roster-table-${scheme}-${width}.png`), fullPage: true });
        await panel.getByRole('button', { name: 'None of the Mental columns' }).click();
        await expect(table.getByRole('columnheader', { name: 'Wits' })).toHaveCount(0);
        await panel.getByRole('button', { name: 'Reset the columns' }).click();
        await expect(table.getByRole('columnheader', { name: 'Wits' })).toHaveCount(1);
        await roster.getByRole('button', { name: 'Columns', exact: true }).click();
      }

      // "Sort by" a Stat, and its direction reversed.
      await roster.getByRole('combobox', { name: 'Sort by' }).selectOption('weaponry');
      await roster.getByTestId('roster-direction').click();
      await expect(roster.getByTestId('roster-direction')).toHaveText('Lowest first');
      await expectNoHorizontalOverflow(page, `the Roster sorted, ${at}`);
      await expectTargets(page, `the Roster sorted, ${at}`);
      await roster.getByRole('combobox', { name: 'Sort by' }).selectOption('default');

      // The tiles, each Hero's Traits and Items with them.
      await roster.getByRole('radiogroup', { name: 'Show the Roster as' }).getByRole('radio', { name: 'Tiles' }).click();
      await expect(roster.getByRole('list', { name: 'Heroes on the Roster' })).toBeVisible();
      await expectNoHorizontalOverflow(page, `the Roster's tiles, ${at}`);
      await expectTargets(page, `the Roster's tiles, ${at}`);
    }
    backgrounds.push(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  }
  await page.emulateMedia({ colorScheme: 'light' });
  // The dark scheme is the page's, not the test's: the body's background is the dark token's.
  expect(new Set(backgrounds).size).toBe(2);
});

// DL-182 item 4: the Roster's Unique Items, at 360px and 390px on a phone and at each wider
// width, in the light and the dark scheme. The first Hero carries the Lantern of Stannary: on the tiles,
// its picture before its name in its chip and their tile the gold glow; in the Table, their row the glow
// and no picture, on each of the phone's tabs too. The gold at 3:1 or more on what is either side of it
// (WCAG 1.4.11, a part that is not text), no sideways scroll of the page, 44px targets, and the Table in its
// own box, its Name pinned and still outlined when scrolled to its end.
test("the Roster's Unique Items: the picture on a tile and the gold glow on its tile and its Table row, in the light and the dark scheme: at 3:1, no sideways scroll, 44px targets, the Table in its own box", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-uniques' });
  await holdingUniques(page, testInfo);
  const { width: projectWidth, height } = page.viewportSize() ?? { width: 0, height: 0 };
  const phone = projectWidth < 600;
  const widths = phone ? [360, 390] : [projectWidth];
  const backgrounds: string[] = [];

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of widths) {
      await page.setViewportSize({ width, height });
      const at = `${scheme}, ${width}px`;
      const roster = await openView(page, 'Roster');
      await roster.getByRole('radiogroup', { name: 'Show the Roster as' }).getByRole('radio', { name: 'Tiles' }).click();

      // The tiles: one glows, the Lantern's picture before its name in its chip; the others neither.
      const lit = roster.locator('li.hero-card.carries-unique');
      await expect(lit).toHaveCount(1);
      await lit.scrollIntoViewIfNeeded();
      const lantern = lit.locator('.chip', { hasText: 'The Lantern of Stannary' });
      const picture = lantern.getByTestId('item-picture');
      await expect(picture).toBeVisible();
      const pictureBox = await picture.boundingBox();
      const nameBox = await lantern.getByText('The Lantern of Stannary', { exact: true }).boundingBox();
      if (pictureBox === null || nameBox === null) throw new Error(`the Lantern's chip not drawn, ${at}`);
      expect(pictureBox.x + pictureBox.width, `the picture before the name, ${at}`).toBeLessThanOrEqual(nameBox.x);
      expect(await roster.locator('li.hero-card:not(.carries-unique)').count(), `the tiles without the glow, ${at}`).toBeGreaterThan(0);
      await expect(roster.locator('li.hero-card:not(.carries-unique) [data-testid="item-picture"]')).toHaveCount(0);
      expect(await roster.locator('li.hero-card:not(.carries-unique)').first().evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
      expect(await lit.evaluate(glowContrast), `the tile's gold on either side of it, ${at}`).toBeGreaterThanOrEqual(3);
      await expectNoHorizontalOverflow(page, `the Roster's tiles with the glow, ${at}`);
      await expectTargets(page, `the Roster's tiles with the glow, ${at}`);
      await shotAround(page, lit, testInfo.outputPath(`roster-unique-tile-${scheme}-${width}.png`));

      // The Table: the row glows, with no picture, its Items cell naming the Lantern.
      await roster.getByRole('radiogroup', { name: 'Show the Roster as' }).getByRole('radio', { name: 'Table' }).click();
      const table = roster.getByRole('table', { name: 'Heroes on the Roster' });
      const row = table.locator('tr.carries-unique');
      await expect(row).toHaveCount(1);
      await expect(table.getByTestId('item-picture')).toHaveCount(0);
      await expect(row.locator('[data-column="items"]')).toContainText('The Lantern of Stannary');
      const box = roster.locator('.roster-table-wrap');
      for (const tab of phone ? ['Hero', 'State', 'Physical', 'Mental', 'Magical', 'Social'] : [null]) {
        if (tab !== null) await roster.getByRole('tablist', { name: 'Columns of the Table' }).getByRole('tab', { name: tab }).click();
        const where = tab === null ? at : `${tab} tab, ${at}`;
        await expect(row).toHaveCount(1);
        await row.scrollIntoViewIfNeeded();
        expect(await row.locator('th').evaluate(glowContrast), `the Name's gold, ${where}`).toBeGreaterThanOrEqual(3);
        expect(await row.locator('td').last().evaluate(glowContrast), `the last cell's gold, ${where}`).toBeGreaterThanOrEqual(3);
        expect(await table.locator('tr:not(.carries-unique) td').first().evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
        await expectNoHorizontalOverflow(page, `the Roster's Table with the glow, ${where}`);
        await expectTargets(page, `the Roster's Table with the glow, ${where}`);
        // Scrolled to its end in its own box: the Name pinned at the box's edge, its outline drawn whole.
        await box.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        await expectNoHorizontalOverflow(page, `the Roster's Table scrolled to its end with the glow, ${where}`);
        const edge = await box.boundingBox();
        const name = await row.locator('th').boundingBox();
        if (edge === null || name === null) throw new Error(`the Table not drawn, ${where}`);
        expect(Math.abs(name.x - edge.x), `the Name pinned at the box's edge, ${where}`).toBeLessThanOrEqual(1);
        expect(await row.locator('th').evaluate(glowContrast), `the Name's gold scrolled, ${where}`).toBeGreaterThanOrEqual(3);
        await shotAround(page, row, testInfo.outputPath(`roster-unique-row-${scheme}-${width}-${tab ?? 'all'}-end.png`));
        await box.evaluate((element) => {
          element.scrollLeft = 0;
        });
      }
      await page.screenshot({ path: testInfo.outputPath(`roster-unique-table-${scheme}-${width}.png`), fullPage: true });
      if (phone) await roster.getByRole('tablist', { name: 'Columns of the Table' }).getByRole('tab', { name: 'Hero' }).click();
      await roster.getByRole('radiogroup', { name: 'Show the Roster as' }).getByRole('radio', { name: 'Tiles' }).click();
    }
    backgrounds.push(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  }
  await page.emulateMedia({ colorScheme: 'light' });
  // The dark scheme is the page's, not the test's: the body's background is the dark token's.
  expect(new Set(backgrounds).size).toBe(2);
});

test("a view's first part, straight under its head, draws no rule above it, as the game menu's first part draws none", async ({
  page,
}) => {
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-layout' });
  // The Rankings open on their Guilds part, with nothing between it and the view's head.
  const rankings = await openView(page, 'Rankings');
  const first = rankings.locator('.view__head + .part');
  await expect(first).toHaveCount(1);
  const { rule, gap } = await first.evaluate((element) => {
    const head = element.previousElementSibling?.getBoundingClientRect();
    const heading = element.querySelector('h3')?.getBoundingClientRect();
    return {
      rule: getComputedStyle(element).borderTopWidth,
      gap: heading === undefined || head === undefined ? Infinity : heading.top - head.bottom,
    };
  });
  expect(rule).toBe('0px');
  // The head's own space, not a part's margin, a rule and its padding on top of it.
  expect(gap).toBeLessThanOrEqual(24);
  // A part after other content keeps its rule: the Patrons, after the Guilds.
  await expect(rankings.getByRole('region', { name: 'Patrons', exact: true })).toHaveCSS('border-top-width', '1px');
});

/**
 * The contrast of a button's words on its own face, as the browser draws it: WCAG 2.2's ratio
 * of the computed `color` and `background-color`, each opaque. Runs in the page.
 */
function pressedContrast(element: Element): number {
  const style = getComputedStyle(element);
  const channels = (colour: string): number[] => (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const luminance = (colour: string): number => {
    const [r = 0, g = 0, b = 0] = channels(colour).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [high, low] = [luminance(style.color), luminance(style.backgroundColor)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/**
 * The contrast of an element's words on what is drawn under them: WCAG 2.2's ratio of its
 * computed `color` and the first opaque `background-color` from it outwards, the page's when none is.
 * Runs in the page.
 */
function textContrast(element: Element): number {
  const channels = (colour: string): number[] => (colour.match(/[\d.]+/g) ?? []).map(Number);
  const luminance = (colour: string): number => {
    const [r = 0, g = 0, b = 0] = channels(colour)
      .slice(0, 3)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  let ground = getComputedStyle(document.body).backgroundColor;
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    const colour = getComputedStyle(at).backgroundColor;
    const alpha = channels(colour)[3];
    if (colour !== 'transparent' && (alpha === undefined || alpha > 0)) {
      ground = colour;
      break;
    }
  }
  const [high, low] = [luminance(getComputedStyle(element).color), luminance(ground)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** A screenshot of `element` and 12px about it, its glow with it, scrolled to the middle of the screen, clear of the bars. */
async function shotAround(page: Page, element: Locator, path: string): Promise<void> {
  await element.evaluate((each) => each.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const box = await element.boundingBox();
  if (box === null) throw new Error('nothing drawn to take');
  const { width } = page.viewportSize() ?? { width: 0 };
  const x = Math.max(0, box.x - 12);
  await page.screenshot({ path, clip: { x, y: Math.max(0, box.y - 12), width: Math.min(width - x, box.width + 24), height: box.height + 24 } });
}

/**
 * The contrast of a Roster tile's or row's gold outline, a part that is not text, on what is
 * drawn either side of it (WCAG 1.4.11): WCAG 2.2's ratio of the first colour of its computed `box-shadow`,
 * the outline's, and the first opaque `background-color` from the element outwards, and from its parent
 * outwards, the page's when none is; the lesser of the two. Nought when it draws no outline. Runs in the page.
 */
function glowContrast(element: Element): number {
  const channels = (colour: string): number[] => (colour.match(/[\d.]+/g) ?? []).map(Number);
  const luminance = (colour: string): number => {
    const [r = 0, g = 0, b = 0] = channels(colour)
      .slice(0, 3)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ground = (from: Element | null): string => {
    for (let at: Element | null = from; at !== null; at = at.parentElement) {
      const colour = getComputedStyle(at).backgroundColor;
      const alpha = channels(colour)[3];
      if (colour !== 'transparent' && (alpha === undefined || alpha > 0)) return colour;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const ratio = (a: string, b: string): number => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (high + 0.05) / (low + 0.05);
  };
  const outline = /rgba?\([^)]*\)/.exec(getComputedStyle(element).boxShadow)?.[0];
  if (outline === undefined) return 0;
  return Math.min(ratio(outline, ground(element)), ratio(outline, ground(element.parentElement)));
}

/**
 * The status bar's date as it stands at this width: its words, whether they keep to one line, and
 * whether the bar's facts or the page run wider than they are. Runs in the page.
 */
function dateShown(): { text: string; lines: number; inView: boolean; factsOverflow: number } {
  const time = document.querySelector('[data-testid="time"]');
  const facts = document.querySelector('.status__facts');
  if (time === null || facts === null) throw new Error('no status bar');
  const box = time.getBoundingClientRect();
  return {
    text: time.textContent ?? '',
    // An inline element drawn on one line has one box; one that wraps has a box for each line.
    lines: time.getClientRects().length,
    inView: box.left >= 0 && box.right <= document.documentElement.clientWidth,
    factsOverflow: facts.scrollWidth - facts.clientWidth,
  };
}

// DL-206 item 32, DL-210: the date in the status bar with its Year at every width, a
// phone's 360px among them, the time of day after it: the first date of a game and the longest a
// player reads in twenty Years, `Year 12 Day 360, afternoon`, each on one line, in view, with no
// sideways scroll.
test('the status bar gives the date with its Year and time of day at every width, on one line, nothing overflowing (DL-210)', async ({ page }, testInfo) => {
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-the-date' });
  const first = await page.evaluate(dateShown);
  expect(first).toEqual({ text: 'Year 1 Day 1, morning', lines: 1, inView: true, factsOverflow: 0 });
  await expectNoHorizontalOverflow(page, 'the first date of a game');

  // The game exported and loaded back at the afternoon of the last Day of its twelfth Year.
  const [download] = await Promise.all([page.waitForEvent('download'), (await thisGame(page)).getByRole('button', { name: 'Export this game' }).click()]);
  const file = testInfo.outputPath('a-long-date.json');
  await download.saveAs(file);
  const save = JSON.parse(readFileSync(file, 'utf8')) as { world: { turn: number } };
  save.world.turn = 11 * 1080 + 359 * 3 + 1;
  writeFileSync(file, JSON.stringify(save));
  await (await thisGame(page)).getByLabel('Load a save file').setInputFiles(file);
  await expect(page.getByRole('dialog', { name: 'Game' })).toHaveCount(0);
  await expect(page.getByTestId('time')).toHaveText('Year 12 Day 360, afternoon');
  const longest = await page.evaluate(dateShown);
  expect(longest).toEqual({ text: 'Year 12 Day 360, afternoon', lines: 1, inView: true, factsOverflow: 0 });
  await expectNoHorizontalOverflow(page, 'the longest date of twenty Years');
});
