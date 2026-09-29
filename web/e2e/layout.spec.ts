import { expect, test, type Locator } from '@playwright/test';
import {
  closeGameMenu,
  debugHistory,
  expectNoHorizontalOverflow,
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

// The shell at the three widths (M9-S3, DL-103; M7-S3's fourth box, proved here as M7-S4): at a
// phone's 360px, a tablet's 820px and a desktop's 1280px, every view and the game menu, with no
// sideways scroll of the page and every control a target of at least 44px. Then everything that
// opens, opened in turn: a Party being chosen, a Hero's page, a pool Hero's page, a Rival's Guild
// page and one of its Heroes' pages, the Rankings by Wealth, an older page of the History, names
// found in the History and a page opened from them (DL-74), a name in the History opened, the
// new-game form over a game, and a save with a long name. The History opens on the player's Guild;
// its search is in its head, and the World History a choice away (M9-S5, DL-105); the whole History
// is the game menu's debug view (M9-F4, DL-117). The Guild's and
// the Guildmaster's names are long, and one word runs 61 letters unbroken. The Board's cards, one
// unfolded, and the Party builder are checked at each width, the phone's at 390px as well, with
// Send in view at the foot of the form (M9-S4, DL-104). So are the Roster's cards and a Hero's page
// with its Transfer asked for, the pool's rows, the Hall's facilities, Guildmaster, Market and
// holdings, and the Rankings' table, a Rival's page unfolded and the Patrons' table: a wide table
// scrolls in its own box, never the page (M9-S6, DL-106). Since M9-F2 (DL-115) the seven views and
// each of the Guild's parts, the navigation's one order at each width, and the Guildmaster's long
// name cut in it. Since M9-F3 (DL-116) the Stores and the Treasury, each with its table.

const longGuild = 'The Most Honourable and Ancient Company of the Lantern-Bearers of Aldmoor';
const longMaster = 'Ælfwine Grimbeorhtssonofthewestmarchesandthefellsbeyondthebarrowdowns';
// The seven views, in the navigation's order (M9-F2).
const views: readonly ViewName[] = viewNames;

test('every view and the game menu, with no sideways scroll and every control a 44px target', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expectNoHorizontalOverflow(page, 'the new-game form');
  await expectTargets(page, 'the new-game form');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });

  // A fast forward first, so the home view has a stop, the log has lines and the pool has Heroes.
  await statusBar(page).getByRole('button', { name: 'More ways to fast forward' }).click();
  await playTurns(page, page.getByRole('button', { name: 'Fast forward until new Heroes join the pool' }));

  // One order at every width (M9-F2, DL-112 item 5): under 600px the bar holds Guild, Roster, Board
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

  // Each of the Guild's parts, opened from its tab (M9-F2).
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
  // The phone's 360px and a larger phone's 390px (M9-S4), the tablet's 820px, the desktop's 1280px.
  const widths = projectWidth < 600 ? [360, 390] : [projectWidth];

  for (const width of widths) {
    await page.setViewportSize({ width, height });
    const at = `at ${width}px`;
    const board = await openView(page, 'Board');
    await expectNoHorizontalOverflow(page, `the Board's cards ${at}`);
    await expectTargets(page, `the Board's cards ${at}`);

    // A card unfolded: its Demands, Skills, Encounters and its difficulty on its meter.
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
  await statusBar(page).getByRole('button', { name: 'More ways to fast forward' }).click();
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
  // The World History, then the whole History's oldest page, each line with its event type (M9-F4).
  await history.getByRole('group', { name: 'Whose History' }).getByRole('button', { name: 'The world', exact: true }).click();
  await expect(history.getByRole('heading', { level: 3 })).toHaveText('The World History');
  await expectNoHorizontalOverflow(page, 'the World History');
  // A choice that is on stays legible under the pointer: its words and its face at 4.5:1 or more
  // (M9-F6, from the close's screenshots, where the hover's face took the pressed one's place).
  const world = history.getByRole('group', { name: 'Whose History' }).getByRole('button', { name: 'The world', exact: true });
  await world.hover();
  expect(await world.evaluate(pressedContrast)).toBeGreaterThanOrEqual(4.5);
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

test('the Roster, the Hall, the Guildmaster, the Market, the Stores, the Treasury and the Rankings: no sideways scroll, a wide table in its own box, and 44px targets (M9-S6, M9-F2, M9-F3)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });
  // New Heroes in the pool, and a Day or so of the world's own doings.
  await statusBar(page).getByRole('button', { name: 'More ways to fast forward' }).click();
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
    await pool.getByRole('button', { name: 'Order by Fee' }).click();
    await check('the pool by fee');
    await pool.getByRole('button', { name: 'Order by Fee' }).click();

    // The Guild's Hall part, its facilities; the Guildmaster view; the Market's Buy filtered, and
    // its Sell (M9-F2).
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

    // The Guild's Stores, holding what was just bought, and its Treasury, the purchase in the
    // ledger: each table in its own box (M9-F3).
    const stores = await guildPart(page, 'Stores');
    await expect(stores.getByRole('table')).toBeVisible();
    await check("the Guild's Stores");
    // Its five columns fit a tablet's width and more, where the Market's wider table scrolls (M9-F6,
    // from the close's screenshots, where "Sells for" was cut at 820px).
    if (width >= 820) expect(await stores.locator('.table-wrap').evaluate((box) => box.scrollWidth - box.clientWidth)).toBeLessThanOrEqual(0);
    const treasury = await guildPart(page, 'Treasury');
    await expect(treasury.getByRole('table', { name: /^The ledger of / })).toBeVisible();
    await check("the Guild's Treasury");
    // A name in the ledger's sentence reads as a name in the History's lines do: a link's look, in the
    // sentence, not a bordered button (M9-F6, from the close's screenshots).
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
    if ((await fold.count()) > 0) await fold.click();
  }
});

/** The rows of the Guilds' table that are not the player's Guild (M9-S6). */
function rivalRows(guilds: Locator): Locator {
  return guilds.locator('[data-testid="guild-row"]:not(.mine)');
}

test("the new-game form with the Guildmaster's setup open, a Trait chosen and others marked: no sideways scroll, and 44px targets (M9-S7)", async ({
  page,
}) => {
  await page.goto('/');
  const form = page.getByRole('region', { name: 'A new game', exact: true });
  await form.getByRole('textbox', { name: 'Guild name', exact: true }).fill(longGuild);
  await form.getByRole('textbox', { name: /Guildmaster/ }).fill(longMaster);
  const setup = await guildmasterSetup(page);
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

test("a view's first part, straight under its head, draws no rule above it, as the game menu's first part draws none (M9-S8)", async ({
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
 * The contrast of a button's words on its own face, as the browser draws it (M9-F6): WCAG 2.2's ratio
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
