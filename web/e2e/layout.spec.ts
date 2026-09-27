import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, playTurns, region, startGame } from './support';

// No horizontal overflow at 360px (M7-S3's fourth box, proved here as M7-S4; M7 §0: one column
// that stacks, "works on a phone width without horizontal scroll"), and none at 1280px. Every
// section of a game some Turns in, with each thing that opens opened in turn: a Party being chosen,
// a Hero's page, a pool Hero's page, a Rival's Guild page and one of its Heroes' pages, the Rankings
// by Wealth, an older page of the History, the new-game form over a game, and a save with a long
// name. The Guild's and the Guildmaster's names are long, and one word runs 61 letters unbroken.

const longGuild = 'The Most Honourable and Ancient Company of the Lantern-Bearers of Aldmoor';
const longMaster = 'Ælfwine Grimbeorhtssonofthewestmarchesandthefellsbeyondthebarrowdowns';

test('the page is never wider than the viewport, whatever is open', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expectNoHorizontalOverflow(page, 'the new-game form');
  await startGame(page, { guild: longGuild, master: longMaster, seed: 'e2e-layout' });
  await expectNoHorizontalOverflow(page, 'a new game, its names long');

  // A Party being chosen, its preview open.
  const board = region(page, 'Board');
  const quest = board.getByRole('article').first();
  await quest.getByRole('button', { name: 'Choose a Party' }).click();
  const box = quest.getByRole('form').getByRole('checkbox').first();
  if (await box.isEnabled()) await box.check();
  await expectNoHorizontalOverflow(page, 'a Party being chosen');
  await quest.getByRole('button', { name: 'Close' }).click();

  // Some Turns in: a log, a History with pages, new Heroes in the pool.
  await playTurns(page, page.getByRole('button', { name: 'Fast forward until new Heroes join the pool' }));
  await expectNoHorizontalOverflow(page, 'a fast forward stopped, its log narrated');

  // A Hero's page from the Roster.
  const roster = region(page, 'Roster');
  await roster.getByRole('listitem').first().getByRole('button').first().click();
  await expect(roster.getByRole('button', { name: 'Back to the Roster' })).toBeVisible();
  await expectNoHorizontalOverflow(page, "a Hero's page");
  await roster.getByRole('button', { name: 'Back to the Roster' }).click();

  // A pool Hero's page.
  const pool = region(page, 'Unattached pool');
  await pool.getByRole('listitem').first().getByRole('button').first().click();
  await expect(pool.getByRole('button', { name: 'Back to the pool' })).toBeVisible();
  await expectNoHorizontalOverflow(page, "a pool Hero's page");
  await pool.getByRole('button', { name: 'Back to the pool' }).click();

  // A Rival's Guild page, and one of its Heroes' pages.
  const guilds = region(page, 'Guilds');
  await guilds.getByRole('button', { name: /^Open / }).first().click();
  await expect(guilds.getByRole('button', { name: 'Back to the Guilds' })).toBeVisible();
  await expectNoHorizontalOverflow(page, "a Rival's Guild page");
  const rival = guilds.getByRole('article');
  await rival.getByRole('listitem').first().getByRole('button').first().click();
  await expect(guilds.getByRole('button', { name: /^Back to (?!the Guilds)/ })).toBeVisible();
  await expectNoHorizontalOverflow(page, "a Rival's Hero's page");
  await guilds.getByRole('button', { name: /^Back to (?!the Guilds)/ }).click();
  await guilds.getByRole('button', { name: 'Back to the Guilds' }).click();

  // The Rankings by Wealth, and an older page of the History.
  await region(page, 'Rankings').getByRole('button', { name: 'By Wealth' }).click();
  await expectNoHorizontalOverflow(page, 'the Rankings by Wealth');
  await region(page, 'History').getByRole('button', { name: 'Oldest' }).click();
  await expectNoHorizontalOverflow(page, 'the oldest page of the History');

  // A save with a long name, and its delete asked for.
  const game = region(page, 'This game');
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
