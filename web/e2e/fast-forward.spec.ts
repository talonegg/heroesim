import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, region, startGame } from './support';

// Fast forward in steps (v1.0.1-S5, DL-96), in the built page at a phone's width and a desktop's.
// The spec makes a save that runs a year: a new game exported, the player's Roster released to
// the Unattached pool, as a fold releases a Rival's, and Wealth to spare, so nothing of the
// player's stops it before `max-turns`. Opened with "Load a save file", its fast forward shows its
// progress between steps, the Day moving; a second one, stopped midway, ends within a step, with
// the page's own sentence and "Fast forward again".

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
    region(page, 'This game').getByRole('button', { name: 'Export this game' }).click(),
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

/** The Turns played and the Day reached, as the progress says them. */
function readProgress(text: string): { turns: number; day: number } {
  const match = /^Played (\d+) Turns? so far\. Now Day (\d+), \w+, Year \d+\.$/.exec(text);
  if (match === null) throw new Error(`not a progress: ${text}`);
  return { turns: Number(match[1]), day: Number(match[2]) };
}

test('a year of fast forward shows its progress Day by Day, and a Stop ends it within a step', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-fast-forward' });
  const save = await aYearWithNoStop(page, testInfo);
  await region(page, 'This game').getByLabel('Load a save file').setInputFiles(save);
  await expect(page.getByTestId('time')).toHaveText('Day 0, morning, Year 0');
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await expect(region(page, 'Roster').locator('li.card')).toHaveCount(0);

  // A year, uninterrupted: its progress shows at least two Days before the end.
  const time = region(page, 'Time');
  const stop = page.getByTestId('stop');
  await watchProgress(page);
  const started = Date.now();
  await time.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await expect(page.getByTestId('progress')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'a fast forward between its steps');
  await expect(stop.locator('p')).toHaveText(`Stopped: played the most Turns allowed, ${yearTurns}.`, { timeout: 60_000 });
  testInfo.annotations.push({ type: 'a year of fast forward', description: `${Date.now() - started} ms` });
  await expect(page.getByTestId('progress')).toHaveCount(0);
  await expect(page.getByTestId('time')).toHaveText('Day 360, morning, Year 1');
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
  // Read the progress and take Stop in one task of the page's, so no step runs between them.
  const shown = await page.evaluate(() => {
    const text = document.querySelector('[data-testid="progress"] p')?.textContent ?? '';
    const button = [...document.querySelectorAll('button')].find((each) => each.textContent === 'Stop the fast forward');
    button?.click();
    return text;
  });
  const before = readProgress(shown);
  await expect(stop.locator('p')).toHaveText(/^Stopped: you asked to stop, after \d+ Turns\.$/);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  const sentence = (await stop.locator('p').textContent()) ?? '';
  const stoppedAfter = Number(/after (\d+) Turns/.exec(sentence)?.[1]);
  expect(stoppedAfter - before.turns, `Stop taken at ${before.turns} Turns, ended at ${stoppedAfter}`).toBeGreaterThanOrEqual(0);
  expect(stoppedAfter - before.turns).toBeLessThanOrEqual(stepTurns);
  expect(stoppedAfter).toBeLessThan(yearTurns);
  // The game as that step left it: a year and the Turns played since.
  const turn = yearTurns + stoppedAfter;
  await expect(page.getByTestId('time')).toHaveText(`Day ${turn / 3}, morning, Year 1`);
  await expect(page.getByTestId('progress')).toHaveCount(0);
  await expect(stop.getByRole('button', { name: 'Fast forward again' })).toBeEnabled();
  await expect(time.getByRole('button', { name: 'Advance a Turn' })).toBeEnabled();
  await expectNoHorizontalOverflow(page, 'a fast forward stopped');
});
