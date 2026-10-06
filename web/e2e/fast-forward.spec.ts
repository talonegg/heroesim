import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { closeGameMenu, dispatchAParty, expectNoHorizontalOverflow, openGameMenu, openView, part, playTurns, startGame, statusBar, thisGame } from './support';

// Fast forward in steps (v1.0.1-S5, DL-96), in the built page at a phone's width and a desktop's.
// The spec makes a save that runs a year: a new game exported, the player's Roster released to
// the Unattached pool, as a fold releases a Rival's, and Wealth to spare, so nothing of the
// player's stops it before `max-turns`. Opened with "Load a save file", its fast forward shows its
// progress between steps, the Day moving; a second one, stopped midway, ends within a step, with
// the page's own sentence and "Fast forward again".
//
// Through the shell (M9-S3, DL-103): the game's file is the game menu's, the time controls are the
// status bar's, and the end of a fast forward opens the home view, where its stop is; a Party home
// opens it at the Party's Quest report (M9-F5).

/** The Turns in a step of fast forward: `fastForwardStepTurns` (`web/src/state/reducer.ts`). */
const stepTurns = 30;
/** A year of Turns: the default config's `turnsPerYear`, the cap a fast forward plays under. */
const yearTurns = 1080;

interface SaveFile {
  world: {
    turn: number;
    guilds: Record<string, { controller: { kind: string }; rosterIds: string[]; wealth: number }>;
    heroes: Record<string, { guildId: string | null; unattachedSince: number | null }>;
  };
}

/** Exports the game in hand and writes it back with the player's Roster released and Wealth to spare: a year of Turns with no stop. */
async function aYearWithNoStop(page: Page, testInfo: TestInfo): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (await thisGame(page)).getByRole('button', { name: 'Export this game' }).click(),
  ]);
  const exported = testInfo.outputPath('new-game.json');
  await download.saveAs(exported);
  const save = JSON.parse(readFileSync(exported, 'utf8')) as SaveFile;
  const player = Object.values(save.world.guilds).find((guild) => guild.controller.kind === 'player');
  if (player === undefined) throw new Error("the save has no player's Guild");
  for (const heroId of player.rosterIds) {
    const hero = save.world.heroes[heroId];
    if (hero === undefined) throw new Error(`the save has no Hero ${heroId}`);
    Object.assign(hero, { guildId: null, unattachedSince: save.world.turn });
  }
  player.rosterIds = [];
  player.wealth = 1_000_000;
  const made = testInfo.outputPath('a-year.json');
  writeFileSync(made, JSON.stringify(save));
  return made;
}

/** Records, in the page, each text the progress shows, from now on, in order. */
async function watchProgress(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { progressSeen: seen });
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="progress"] p')?.textContent ?? '';
      if (text !== '' && seen.at(-1) !== text) seen.push(text);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

async function progressSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { progressSeen: string[] }).progressSeen);
}

/**
 * The Turns played and the Day reached, as the progress says them: the Day counted from 0 across
 * Years of 360 Days, as the engine counts it, from the date a player reads (DL-210).
 */
function readProgress(text: string): { turns: number; day: number } {
  const match = /^Played (\d+) Turns? so far\. Now Year (\d+) Day (\d+), \w+\.$/.exec(text);
  if (match === null) throw new Error(`not a progress: ${text}`);
  return { turns: Number(match[1]), day: (Number(match[2]) - 1) * 360 + Number(match[3]) - 1 };
}

test('a year of fast forward shows its progress Day by Day, and a Stop ends it within a step', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-fast-forward' });
  const save = await aYearWithNoStop(page, testInfo);
  await (await thisGame(page)).getByLabel('Load a save file').setInputFiles(save);
  await expect(page.getByTestId('time')).toHaveText('Year 1 Day 1, morning');
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  // No Hero on the Roster: the list of them is not shown at all.
  const roster = await openView(page, 'Roster');
  await expect(roster.getByRole('list', { name: 'Heroes on the Roster' })).toHaveCount(0);

  // A year, uninterrupted: its progress shows at least two Days before the end.
  const time = statusBar(page).getByRole('group', { name: 'Time' });
  const stop = page.getByTestId('stop');
  await watchProgress(page);
  const started = Date.now();
  await time.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await expect(page.getByTestId('progress')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'a fast forward between its steps');
  await expect(stop.locator('p')).toHaveText(`Stopped: played the most Turns allowed, ${yearTurns}.`, { timeout: 60_000 });
  testInfo.annotations.push({ type: 'a year of fast forward', description: `${Date.now() - started} ms` });
  await expect(page.getByTestId('progress')).toHaveCount(0);
  await expect(page.getByTestId('time')).toHaveText('Year 2 Day 1, morning');
  const seen = (await progressSeen(page)).map(readProgress);
  const days = new Set(seen.map((progress) => progress.day));
  expect(days.size, `the progress seen: ${JSON.stringify(seen)}`).toBeGreaterThanOrEqual(2);
  // Each is a whole number of steps, a step's Days on from the Day the year began.
  for (const progress of seen) {
    expect(progress.turns % stepTurns).toBe(0);
    expect(progress.turns).toBeLessThan(yearTurns);
    expect(progress.day).toBe(progress.turns / 3);
  }

  // Again, stopped midway: the Turns it played are those the progress showed as Stop was taken, or one step more.
  await stop.getByRole('button', { name: 'Fast forward again' }).click();
  await expect(page.getByTestId('progress')).toBeVisible();
  // The game menu open, so its "Export this game" is on the page to be read.
  await openGameMenu(page);
  // Read the page between steps and take Stop in one task of the page's, so no step runs between
  // them. Between steps the year's stop has gone, and "Export this game" waits: the game in hand's
  // History holds the steps' Turns, which its World has not played (v1.0.1-S6, DL-97).
  const shown = await page.evaluate(() => {
    const text = document.querySelector('[data-testid="progress"] p')?.textContent ?? '';
    const stopShown = document.querySelector('[data-testid="stop"]') !== null;
    const buttons = [...document.querySelectorAll('button')];
    const exportDisabled = buttons.find((each) => each.textContent === 'Export this game')?.disabled ?? null;
    buttons.find((each) => each.textContent === 'Stop the Fast forward')?.click();
    return { text, stopShown, exportDisabled };
  });
  expect(shown).toMatchObject({ stopShown: false, exportDisabled: true });
  const before = readProgress(shown.text);
  await expect(stop.locator('p')).toHaveText(/^Stopped: you asked to stop, after \d+ Turns\.$/);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  const sentence = (await stop.locator('p').textContent()) ?? '';
  const stoppedAfter = Number(/after (\d+) Turns/.exec(sentence)?.[1]);
  expect(stoppedAfter - before.turns, `Stop taken at ${before.turns} Turns, ended at ${stoppedAfter}`).toBeGreaterThanOrEqual(0);
  expect(stoppedAfter - before.turns).toBeLessThanOrEqual(stepTurns);
  expect(stoppedAfter).toBeLessThan(yearTurns);
  // The game as that step left it: a year and the Turns played since.
  const turn = yearTurns + stoppedAfter;
  await expect(page.getByTestId('time')).toHaveText(`Year 2 Day ${turn / 3 - 360 + 1}, morning`);
  await expect(page.getByTestId('progress')).toHaveCount(0);
  await expect(stop.getByRole('button', { name: 'Fast forward again' })).toBeEnabled();
  await expect(time.getByRole('button', { name: 'Advance a Turn' })).toBeEnabled();
  await expectNoHorizontalOverflow(page, 'a fast forward stopped');
  await expect((await thisGame(page)).getByRole('button', { name: 'Export this game' })).toBeEnabled();
  await closeGameMenu(page);
});

/**
 * Exports the game in hand and writes it back with the player's Guild's Wealth at `wealth`: below the
 * Bankruptcy floor, the next night's check finds it there (M9-S7).
 */
async function withWealth(page: Page, testInfo: TestInfo, wealth: number): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (await thisGame(page)).getByRole('button', { name: 'Export this game' }).click(),
  ]);
  const exported = testInfo.outputPath('a-new-game.json');
  await download.saveAs(exported);
  const save = JSON.parse(readFileSync(exported, 'utf8')) as SaveFile;
  const player = Object.values(save.world.guilds).find((guild) => guild.controller.kind === 'player');
  if (player === undefined) throw new Error("the save has no player's Guild");
  player.wealth = wealth;
  const made = testInfo.outputPath('below-the-floor.json');
  writeFileSync(made, JSON.stringify(save));
  return made;
}

test("falling below the Bankruptcy floor stops a fast forward unasked; the home view warns, with the ways to the Market's Sell and the Board (M9-S7, M9-F2)", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-bankruptcy' });
  // Something to sell, bought at the Market first; then the Guild's Wealth below the floor, in a save loaded back.
  const market = await part(page, 'Buy');
  await market.getByTestId('listing').first().getByRole('button', { name: /^Buy / }).click();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  const time = statusBar(page).getByRole('group', { name: 'Time' });
  const save = await withWealth(page, testInfo, -50);
  await (await thisGame(page)).getByLabel('Load a save file').setInputFiles(save);
  await expect(page.getByTestId('wealth')).toHaveText('-50');
  await closeGameMenu(page);

  // The first night's check finds it below the floor: the fast forward stops that night, unasked,
  // before the morning's Quests could ask for a decision.
  await playTurns(page, time.getByRole('button', { name: 'Fast forward', exact: true }));
  await expect(page.getByTestId('time')).toHaveText('Year 1 Day 1, night');
  const due = (await page.getByTestId('countdown').textContent()) ?? '';
  expect(due).toMatch(/^Bankruptcy on the night of Year \d+ Day \d+$/);
  const home = page.getByRole('region', { name: 'Guild', exact: true });
  await expect(home).toBeVisible();
  const stop = page.getByTestId('stop');
  await expect(stop).toHaveClass(/stop--warning/);
  await expect(stop.locator('p').first()).toHaveText(new RegExp(`^Stopped: The Lantern fell below the Bankruptcy floor: ${due} unless its Wealth recovers by then\\.$`));
  await expect(stop).toContainText('Sell what the Guild holds at the Market, or send a Party on a Quest');
  await expect(home.getByText(/has been below the Bankruptcy floor since/)).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'the Bankruptcy stop');

  // Its ways to Wealth: the Market's Sell, where what the Guild holds is sold (DL-109 item 2, Q20, as
  // M9-F2 moved it), and the Board.
  await stop.getByRole('button', { name: 'Sell what the Guild holds' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Sell', exact: true })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Sell', exact: true }).getByRole('button', { name: /^Sell / })).toHaveCount(1);
  await openView(page, 'Guild');
  await stop.getByRole('button', { name: 'Open the Board' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Board', exact: true })).toBeFocused();
});

test("a Party's return stops a fast forward at its Quest report on Guild › Home, from the Board (M9-F5)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-journey' });
  const quest = await dispatchAParty(page);
  // Sent from the Board, and the fast forward taken there: its end opens Guild › Home, whichever stop
  // comes first; another stop (a Transfer Offer, say) is played past until the Party is home.
  const time = statusBar(page).getByRole('group', { name: 'Time' });
  const stop = page.getByTestId('stop');
  const stopped = async (): Promise<string> => ((await stop.count()) === 0 ? '' : ((await stop.textContent()) ?? ''));
  for (let tries = 0; tries < 10 && !/came home/.test(await stopped()); tries += 1) {
    await playTurns(page, time.getByRole('button', { name: 'Fast forward', exact: true }));
  }
  await expect(stop).toContainText("Stopped: The Lantern's Party came home.");

  const home = page.getByRole('region', { name: 'Guild', exact: true });
  await expect(home.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute('aria-selected', 'true');
  const report = home.getByRole('region', { name: `Quest report: ${quest}`, exact: true });
  await expect(report.getByRole('heading', { level: 3 })).toBeFocused();
  await expect(report.getByRole('heading', { level: 4 }).last()).toHaveText('The Patron');
  await expect(stop.getByRole('button', { name: 'Read what happened' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'a fast forward stopped at the Quest report');
});
