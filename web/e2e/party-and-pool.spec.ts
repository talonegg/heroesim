import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, openView, part, region, startGame, thisGame } from './support';

// The owner's answers to M9 (DL-109 item 2), in the built page at a phone's width, a tablet's and a
// desktop's: an empty new-game form asks for the names before it refuses anything (Q22); a Party
// chosen on the Board and not sent is kept while the player looks elsewhere (Q16); and Recruit is
// disabled for a Hero in the pool who will not sign, the row saying why (Q17).

interface SaveFile {
  world: {
    guilds: Record<string, { controller: { kind: string }; fame: number }>;
    heroes: Record<string, { name: string; level: number; guildId: string | null; unattachedSince: number | null }>;
  };
}

/**
 * Exports the game in hand and loads it back with the first Hero in the Unattached pool at Level 4
 * and the player's Guild at Fame 0: that Hero asks for more Fame than the Guild has. Their name.
 */
async function aHeroWhoWillNotSign(page: Page, testInfo: TestInfo): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (await thisGame(page)).getByRole('button', { name: 'Export this game' }).click(),
  ]);
  const exported = testInfo.outputPath('a-new-game.json');
  await download.saveAs(exported);
  const save = JSON.parse(readFileSync(exported, 'utf8')) as SaveFile;
  const player = Object.values(save.world.guilds).find((guild) => guild.controller.kind === 'player');
  const pooled = Object.values(save.world.heroes).find((hero) => hero.guildId === null && hero.unattachedSince !== null);
  if (player === undefined || pooled === undefined) throw new Error("the save has no player's Guild, or an empty pool");
  player.fame = 0;
  pooled.level = 4;
  const made = testInfo.outputPath('a-hero-who-will-not-sign.json');
  writeFileSync(made, JSON.stringify(save));
  await (await thisGame(page)).getByLabel('Load a save file').setInputFiles(made);
  // A load closes the game menu and opens the home view.
  await expect(page.getByRole('dialog', { name: 'Game' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Guild', exact: true })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  return pooled.name;
}

test('an empty new-game form gives a hint, not a refusal, until a field is touched (Q22)', async ({ page }) => {
  await page.goto('/');
  const form = region(page, 'A new game');
  const start = form.getByRole('button', { name: 'Start the game' });

  await expect(page.getByTestId('setup-hint')).toHaveText('Name your Guild and its Guildmaster to start.');
  await expect(page.getByTestId('setup-refusal')).toHaveCount(0);
  await expect(start).toBeDisabled();

  await form.getByRole('textbox', { name: 'Guild name', exact: true }).fill('The Lantern');
  await expect(page.getByTestId('setup-hint')).toHaveCount(0);
  await expect(page.getByTestId('setup-refusal')).toHaveText('The Guildmaster needs a name.');
  await expect(start).toBeDisabled();
  await expectNoHorizontalOverflow(page, 'the new-game form, a field touched');
});

test('a Party chosen and not sent is kept, with its consumables, while the player looks elsewhere (Q16)', async ({ page }) => {
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-party-kept' });
  // A consumable to carry, bought at the Market.
  const market = await part(page, 'Buy');
  await market.getByTestId('listing').filter({ hasText: /consumable/i }).first().getByRole('button', { name: /^Buy / }).click();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');

  const board = await openView(page, 'Board');
  const quest = board.getByRole('article').first();
  const name = (await quest.getByRole('heading', { level: 3 }).textContent()) ?? '';
  await quest.getByRole('button', { name: 'Choose a Party' }).click();
  const form = quest.getByRole('form');
  const rows = form.getByTestId('party-row');
  await rows.first().getByRole('checkbox').check();
  const carried = form.getByRole('spinbutton').first();
  await form.getByRole('button', { name: /: one more$/ }).first().click();
  await expect(carried).toHaveValue('1');

  // Away to the Roster and the Market, and back.
  await openView(page, 'Roster');
  await openView(page, 'Market');
  const again = await openView(page, 'Board');
  const kept = again.getByRole('article').filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) }).getByRole('form');
  await expect(kept.getByTestId('party-row').first().getByRole('checkbox')).toBeChecked();
  await expect(kept.getByRole('checkbox', { checked: true })).toHaveCount(1);
  await expect(kept.getByRole('spinbutton').first()).toHaveValue('1');
  await expectNoHorizontalOverflow(page, 'a Party kept while the player looked elsewhere');
});

test('Recruit is disabled for a Hero in the pool who will not sign, the row saying why (Q17)', async ({ page }, testInfo) => {
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-will-not-sign' });
  const name = await aHeroWhoWillNotSign(page, testInfo);

  const pool = await part(page, 'Unattached pool');
  const row = pool.getByTestId('pool-row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
  await expect(row.getByTestId('signs')).toHaveText('Needs Fame 30');
  const recruit = row.getByRole('button', { name: `Recruit ${name}`, exact: true });
  await expect(recruit).toBeDisabled();
  await expect(recruit).toHaveAccessibleDescription('Needs Fame 30');
  // The others sign, and their Recruit is there to press.
  const others = pool.getByTestId('pool-row').filter({ hasNot: page.getByRole('rowheader', { name, exact: true }) });
  await expect(others.first().getByTestId('signs')).toHaveText('Yes');
  await expect(others.first().getByRole('button', { name: /^Recruit / })).toBeEnabled();

  // The Hero's page, opened from the pool, says the same and disables Recruit too.
  await row.getByRole('button', { name, exact: true }).click();
  const page_ = pool.getByRole('article');
  await expect(page_).toContainText('Signs for your Guild: needs Fame 30.');
  await expect(page_.getByRole('button', { name: `Recruit ${name}`, exact: true })).toBeDisabled();
  await expectNoHorizontalOverflow(page, "a Hero's page from the pool, Recruit disabled");
});
