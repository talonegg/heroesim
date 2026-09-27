import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { escaped, expectNoHorizontalOverflow, playTurns, region, startGame } from './support';

// The journey (M7-S4, DL-67), at a phone's width and a desktop's: a new game, a Day advanced, a
// Party dispatched, fast forward until the Party returns, the game saved in IndexedDB, the page
// reloaded, the save loaded, the same Turn read; then the save exported, and the CLI's own loader,
// run on Node, loads the exported file as the same Turn and writes it back byte for byte. The page is
// never wider than the viewport on the way.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Sends a Party on the first Quest on the Board that dispatch would send one to; its name. */
async function dispatchAParty(page: Page): Promise<string> {
  const quests = region(page, 'Board').getByRole('article');
  const count = await quests.count();
  for (let index = 0; index < count; index += 1) {
    const quest = quests.nth(index);
    const name = (await quest.getByRole('heading', { level: 3 }).textContent()) ?? '';
    await quest.getByRole('button', { name: 'Choose a Party' }).click();
    const form = quest.getByRole('form');
    const verdict = form.getByRole('status');
    const heroes = form.getByRole('checkbox');
    // Choose Heroes one at a time until dispatch would send them, or none are left.
    for (let hero = 0; hero < (await heroes.count()); hero += 1) {
      if (await heroes.nth(hero).isDisabled()) continue;
      await heroes.nth(hero).check();
      if ((await verdict.textContent()) === 'Dispatch would send this Party.') break;
    }
    const send = form.getByRole('button', { name: 'Send the Party' });
    if (await send.isEnabled()) {
      await expectNoHorizontalOverflow(page, 'a Party chosen, with its preview');
      await send.click();
      return name;
    }
    await quest.getByRole('button', { name: 'Close' }).click();
  }
  throw new Error('No Quest on the Board would take a Party from the Roster');
}

test('a game played, saved in the browser, reloaded, loaded at the same Turn, and exported for the CLI', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expectNoHorizontalOverflow(page, 'the new-game form');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-journey' });
  await expectNoHorizontalOverflow(page, 'a new game');

  // A Day: three Turns, morning, afternoon and night.
  const advance = page.getByRole('button', { name: 'Advance a Turn' });
  for (let turn = 0; turn < 3; turn += 1) await playTurns(page, advance);
  await expect(page.getByTestId('time')).toHaveText('Day 1, morning, Year 0');

  const quest = await dispatchAParty(page);
  const log = region(page, 'Since your last action');
  const sent = new RegExp(`^Day 1, morning The Lantern sent .+ on ${escaped(quest)}, back on the night of Day \\d+\\.$`);
  await expect(log.getByRole('listitem').filter({ hasText: sent })).toHaveCount(1);

  // Fast forward until the Party returns; another stop (a Transfer Offer, say) is played past.
  const fastForward = page.getByRole('button', { name: 'Fast forward', exact: true });
  const stop = page.getByTestId('stop');
  const stopped = async (): Promise<string> => ((await stop.count()) === 0 ? '' : ((await stop.textContent()) ?? ''));
  for (let tries = 0; tries < 10 && !/came home/.test(await stopped()); tries += 1) await playTurns(page, fastForward);
  await expect(stop).toContainText("Stopped: The Lantern's Party came home.");
  await expectNoHorizontalOverflow(page, 'a fast forward stopped, its log narrated');

  // Save in the browser, under a name.
  const turn = (await page.getByTestId('time').textContent()) ?? '';
  const wealth = (await page.getByTestId('wealth').textContent()) ?? '';
  const game = region(page, 'This game');
  await game.getByLabel('Save as').fill('journey');
  await game.getByRole('button', { name: 'Save in this browser' }).click();
  await expect(game.getByTestId('saves-status')).toHaveText(/^Saved as “journey”, [\d.]+ kB\.$/);
  await expect(game.getByRole('article', { name: 'journey' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'a save listed');
  // The game as the engine serialises it, straight from the document, to compare the export with.
  const [direct] = await Promise.all([page.waitForEvent('download'), game.getByRole('button', { name: 'Export this game' }).click()]);
  const directPath = testInfo.outputPath('direct.json');
  await direct.saveAs(directPath);

  // Reload: no game in hand, the save still kept.
  await page.reload();
  const newGame = region(page, 'A new game');
  await expect(newGame.getByRole('article', { name: 'journey' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'the saves listed before a game');
  await newGame.getByRole('button', { name: 'Load journey' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Lantern');
  await expect(page.getByTestId('time')).toHaveText(turn);
  await expect(page.getByTestId('wealth')).toHaveText(wealth);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await expectNoHorizontalOverflow(page, 'a save loaded');

  // Export the save kept in IndexedDB: the uncompressed save, the bytes serialise gave.
  const [exported] = await Promise.all([
    page.waitForEvent('download'),
    region(page, 'This game').getByRole('button', { name: 'Export journey' }).click(),
  ]);
  expect(exported.suggestedFilename()).toBe('journey.json');
  const exportedPath = testInfo.outputPath('journey.json');
  await exported.saveAs(exportedPath);
  const bytes = readFileSync(exportedPath);
  expect(bytes.equals(readFileSync(directPath)), 'the export from IndexedDB is the game as serialised').toBe(true);

  // The CLI, on Node, loads the exported file with its own loader: the same Turn, and written back
  // as its save, byte for byte.
  const saveDir = mkdtempSync(path.join(tmpdir(), 'heroesim-e2e-'));
  try {
    const cli = spawnSync(process.execPath, ['--import', 'tsx', 'cli/src/main.ts', 'load', exportedPath], {
      cwd: repoRoot,
      env: { ...process.env, HEROESIM_SAVE_DIR: saveDir },
      encoding: 'utf8',
    });
    expect(cli.status, cli.stderr).toBe(0);
    expect(cli.stdout).toMatch(new RegExp(`^Loaded .+journey\\.json into .+current\\.json\\.$`, 'm'));
    expect(cli.stdout).toMatch(new RegExp(`, Turn \\d+ \\(${escaped(turn)}\\), `));
    expect(readFileSync(path.join(saveDir, 'current.json')).equals(bytes), 'the CLI writes back what it loaded').toBe(true);
  } finally {
    rmSync(saveDir, { recursive: true, force: true });
  }
});
