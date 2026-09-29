import { expect, test, type Locator } from '@playwright/test';
import {
  closeGameMenu,
  expectNoHorizontalOverflow,
  expectTargets,
  guildmasterSetup,
  openGameMenu,
  openView,
  part,
  playTurns,
  rosterList,
  startGame,
  statusBar,
  thisGame,
  traitBox,
  type ViewName,
} from './support';

// The shell at the three widths (M9-S3, DL-103; M7-S3's fourth box, proved here as M7-S4): at a
// phone's 360px, a tablet's 820px and a desktop's 1280px, every view and the game menu, with no
// sideways scroll of the page and every control a target of at least 44px. Then everything that
// opens, opened in turn: a Party being chosen, a Hero's page, a pool Hero's page, a Rival's Guild
// page and one of its Heroes' pages, the Rankings by Wealth, an older page of the History, names
// found in the History and a page opened from them (DL-74), a name in the History opened, the
// new-game form over a game, and a save with a long name. The History opens on the player's Guild;
// its search is in its head, and its whole History a choice away (M9-S5, DL-105). The Guild's and
// the Guildmaster's names are long, and one word runs 61 letters unbroken. The Board's cards, one
// unfolded, and the Party builder are checked at each width, the phone's at 390px as well, with
// Send in view at the foot of the form (M9-S4, DL-104). So are the Roster's cards and a Hero's page
// with its Transfer asked for, the pool's rows, the Hall's facilities, Guildmaster, Market and
// holdings, and the Rankings' table, a Rival's page unfolded and the Patrons' table: a wide table
// scrolls in its own box, never the page (M9-S6, DL-106).

const longGuild = 'The Most Honourable and Ancient Company of the Lantern-Bearers of Aldmoor';
const longMaster = 'Ælfwine Grimbeorhtssonofthewestmarchesandthefellsbeyondthebarrowdowns';
const views: readonly ViewName[] = ['Guild', 'Board', 'Roster', 'Hall', 'Rankings', 'History'];

test('every view and the game menu, with no sideways scroll and every control a 44px target', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expectNoHorizontalOverflow(page, 'the new-game form');
  await expectTargets(page, 'the new-game form');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });

  // A fast forward first, so the home view has a stop, the log has lines and the pool has Heroes.
  await statusBar(page).getByRole('button', { name: 'More ways to fast forward' }).click();
  await playTurns(page, page.getByRole('button', { name: 'Fast forward until new Heroes join the pool' }));

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
  await history.getByRole('group', { name: 'Whose History' }).getByRole('button', { name: 'The whole History', exact: true }).click();
  await history.getByRole('button', { name: 'Oldest' }).click();
  await expectNoHorizontalOverflow(page, 'the oldest page of the History');
  await expectTargets(page, 'the oldest page of the History');

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

test('the Roster, the Hall and the Rankings: no sideways scroll, a wide table in its own box, and 44px targets (M9-S6)', async ({ page }) => {
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

    // The Hall: its facilities, the Guildmaster, the Market filtered, and what the Guild holds.
    await openView(page, 'Hall');
    await check("the Hall's facilities, Guildmaster and Market");
    const market = await part(page, 'Market');
    const kinds = market.getByRole('group', { name: 'Show for sale' });
    await kinds.getByRole('button').nth(1).click();
    await check('the Market, one kind shown');
    await kinds.getByRole('button', { name: 'All', exact: true }).click();
    await market.getByTestId('listing').first().getByRole('button', { name: /^Buy / }).click();
    await expect(page.getByRole('region', { name: 'What the Guild holds', exact: true })).toBeVisible();
    await check('what the Guild holds');

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
