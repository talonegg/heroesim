import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, playTurns, region, startGame, thisGame } from './support';

// The first box of the deployed page (DL-75): a fresh browser creates a game, plays a
// Day, saves it in IndexedDB, reloads the page and loads the save at the same Turn; and nothing
// the page asks for leaves its own origin. The saves are the game menu's (DL-103).

test('the deployed page creates a game, saves it, and loads it after a reload', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL ?? '').origin;
  const elsewhere: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) elsewhere.push(request.url());
  });

  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'deployed' });
  const advance = page.getByRole('button', { name: 'Advance a Turn' });
  for (let turn = 0; turn < 3; turn += 1) await playTurns(page, advance);
  await expect(page.getByTestId('time')).toHaveText('Year 1 Day 2, morning');
  const turn = (await page.getByTestId('time').textContent()) ?? '';

  const game = await thisGame(page);
  await game.getByLabel('Save as').fill('deployed');
  await game.getByRole('button', { name: 'Save in this browser' }).click();
  await expect(game.getByTestId('saves-status')).toHaveText(/^Saved as “deployed”, [\d.]+ kB\.$/);

  await page.reload();
  await region(page, 'A new game').getByRole('button', { name: 'Load deployed' }).click();
  await expect(page.getByTestId('time')).toHaveText(turn);
  await expectNoHorizontalOverflow(page, 'a save loaded on the deployed page');
  expect(elsewhere).toEqual([]);
});
