import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  dispatchAParty,
  escaped,
  expectNoHorizontalOverflow,
  expectTargets,
  groupOf,
  chooseGuildmaster,
  guildmasterSetup,
  guildPart,
  history,
  historyText,
  lineOf,
  openView,
  part,
  playTurns,
  rosterList,
  startGame,
  thisGame,
  traitBox,
} from './support';

// The journey (M7-S4, DL-67), at a phone's width, a tablet's and a desktop's: a new game, a Day
// advanced, a Party dispatched, a Hero recruited from the Unattached pool (the milestone's Gate,
// DL-74), fast forward until the Party returns, the game saved in IndexedDB, the page reloaded, the
// save loaded, the same Turn and the same Roster read; then the save exported, and the CLI's own
// loader, run on Node, loads the exported file as the same Turn and writes it back byte for byte.
// The page is never wider than the viewport on the way.
//
// Through the shell (M9-S3, DL-103): each view is opened from the navigation before its regions are
// read, the home view shows the Party out and then how it fared, and the game's file is the game
// menu's. The Party is chosen in the Party builder (M9-S4, DL-104), with a Hero's page opened from it.
// What each play did is read in the History, opened on the player's Guild, new; the Party's return
// is read there too, how it went marked in a word and its Encounters folded under it (M9-S5,
// DL-105). Since M9-F2 (DL-115), the Guildmaster, the Guild's Hall part and the Market are
// passed through on the way, and since M9-F3 (DL-116) the Stores and the Treasury, with the signing
// fee in its ledger.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Signs, from the Unattached pool, the Hero with the lowest signing fee among those who would sign
 * for the Guild at a fee it can pay; their name. The fee is the one the pool's row shows (M9-S6's
 * rows), and the Hero joins the Roster.
 */
async function recruitAHero(page: Page): Promise<string> {
  const wealth = Number(await page.getByTestId('wealth').textContent());
  const pool = await part(page, 'Unattached pool');
  const rows = pool.getByTestId('pool-row');
  let chosen: { name: string; fee: number } | null = null;
  for (let index = 0; index < (await rows.count()); index += 1) {
    const fee = Number(await rows.nth(index).getByTestId('fee').textContent());
    const signs = (await rows.nth(index).getByTestId('signs').textContent()) ?? '';
    if (!(fee <= wealth) || signs !== 'Yes') continue;
    const name = (await rows.nth(index).locator('button.link').textContent()) ?? '';
    if (chosen === null || fee < chosen.fee) chosen = { name, fee };
  }
  if (chosen === null) throw new Error('No Hero in the pool would sign for the Guild at a fee it can pay');

  await pool.getByRole('button', { name: `Recruit ${chosen.name}`, exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  // Signed: the Roster has them, and the pool does not.
  await expect(page.getByTestId('wealth')).toHaveText(String(wealth - chosen.fee));
  await expect(pool.getByRole('button', { name: `Recruit ${chosen.name}`, exact: true })).toHaveCount(0);
  await expect((await rosterList(page)).getByRole('button', { name: chosen.name, exact: true })).toBeVisible();
  const signed = historyText(await history(page), new RegExp(`^The Lantern signed ${escaped(chosen.name)} for ${chosen.fee} Wealth\\.$`));
  await expect(signed).toHaveCount(1);
  await expect(lineOf(signed)).toHaveClass(/\bis-new\b/);
  return chosen.name;
}

/** The names on the player's Roster, in its order. */
async function rosterNames(page: Page): Promise<string[]> {
  return (await rosterList(page)).locator('button.link').allTextContents();
}

test('a game played, a Hero recruited, saved in the browser, reloaded, loaded at the same Turn, and exported for the CLI', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expectNoHorizontalOverflow(page, 'the new-game form');
  // The Guildmaster set up under "Your Guildmaster" (M9-S7, #30), with "Choose myself" (v1.1.4-S11): a
  // sex, an age and a picture, the Stats as they start, and two Traits within the budget of 1, a buff
  // and a penalty.
  const setup = await guildmasterSetup(page);
  await chooseGuildmaster(setup, { sex: 'male', age: '38', picture: 'Male Portrait 2' });
  // The Age field says when a Guildmaster retires, from the rules (M9-F2, DL-113 item 5).
  await expect(setup.getByText(/^Years, \d+ to \d+\. Retires at \d+\.$/)).toBeVisible();
  await setup.getByRole('radio', { name: 'Choose them' }).check();
  const budget = setup.getByTestId('trait-budget');
  await expect(budget).toContainText('Budget left: 1');
  await traitBox(setup, 'Old soldier').check();
  await expect(budget).toContainText('Budget left: 0');
  // A buff beside it would pass the budget, and says so; one excluded by none is still open.
  await expect(setup.getByText('Over the budget: with it, the Traits cost 3 and the budget is 1.')).toHaveCount(2);
  await traitBox(setup, 'Mistrusts magic').check();
  await expect(budget).toContainText('Budget left: 1');
  // Two chosen, the most a Guildmaster holds: the rest wait until one is taken off.
  await expect(traitBox(setup, 'Miser')).toBeDisabled();
  // The Traits keep the rules: all the engine still asks for is the names, which come next.
  await expect(page.getByTestId('setup-refusal')).toHaveText('The Guild needs a name.');
  await expectNoHorizontalOverflow(page, "the Guildmaster's setup, two Traits chosen");
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-journey' });
  await expectNoHorizontalOverflow(page, 'a new game');
  // The Guildmaster the game began with, in the Guildmaster view at the top of the navigation
  // (M9-F2): the Sex capitalised, the Age and the Traits chosen.
  const guildmaster = await openView(page, 'Guildmaster');
  await expect(guildmaster.getByRole('heading', { level: 3 })).toHaveText('Ada Vell, Guildmaster of The Lantern');
  await expect(guildmaster).toContainText(/Sex\s*Male/);
  await expect(guildmaster).toContainText(/Age\s*38/);
  await expect(guildmaster).toContainText('Old soldier');
  await expect(guildmaster).toContainText('Mistrusts magic');

  // The Guild's Hall part, its facilities with Build, and the Market's Buy and Sell (M9-F2).
  const hall = await guildPart(page, 'Hall');
  await expect(hall.getByTestId('facility')).toHaveCount(3);
  await expect(hall.getByRole('button', { name: /^Build .+ for \d+ Wealth$/ }).first()).toBeVisible();
  const market = await openView(page, 'Market');
  await expect(market.getByRole('heading', { level: 3 })).toHaveText(['Buy', 'Sell']);
  await expectNoHorizontalOverflow(page, 'the Market');

  // A Day: three Turns, morning, afternoon and night.
  const advance = page.getByRole('button', { name: 'Advance a Turn' });
  for (let turn = 0; turn < 3; turn += 1) await playTurns(page, advance);
  await expect(page.getByTestId('time')).toHaveText('Year 1 Day 2, morning');

  const quest = await dispatchAParty(page);
  const sent = historyText(await history(page), new RegExp(`^The Lantern sent .+ on ${escaped(quest)}, back on the night of Year \\d+ Day \\d+\\.$`));
  await expect(sent).toHaveCount(1);
  await expect(lineOf(sent)).toHaveClass(/\bis-new\b/);
  await expect(groupOf(sent)).toHaveText('Year 1 Day 2, morning');
  // The home view names the Party out, and the night it returns: the Guild opens at the part last
  // open, the Hall, and its Home is a tab away (M9-F2).
  const home = await guildPart(page, 'Home');
  await expect(home.getByRole('listitem').filter({ hasText: new RegExp(`^${escaped(quest)} · .+ · back on the night of Year \\d+ Day \\d+$`) })).toHaveCount(1);

  // Recruit a Hero from the Unattached pool (the Gate's "recruited", DL-74).
  const recruited = await recruitAHero(page);
  await expectNoHorizontalOverflow(page, 'a Hero recruited');

  // The Guild's Stores and Treasury (M9-F3, DL-116): what the Guild owns, and its accounts, the
  // signing fee just paid in the ledger, which shows expense alone from its chips.
  const stores = await guildPart(page, 'Stores');
  await expect(stores.getByText(/^The Lantern owns /)).toBeVisible();
  await expectNoHorizontalOverflow(page, "the Guild's Stores");
  const treasury = await guildPart(page, 'Treasury');
  await expect(treasury.getByText(/^Upkeep of The Lantern: \d+ Wealth every 10 Days$/)).toBeVisible();
  await expect(treasury.getByTestId('upkeep-next')).toHaveText(/^Next paid on the night of Year \d+ Day \d+: \d+ Wealth\.$/);
  const ledger = treasury.getByRole('table', { name: 'The ledger of The Lantern' });
  await expect(ledger.getByRole('row').filter({ hasText: new RegExp(`^Year \\d+ Day \\d+, \\w+The Lantern signed ${escaped(recruited)} for \\d+ Wealth\\.Heroes-\\d+$`) })).toHaveCount(1);
  // It opens with the Wealth the Guild was founded with, last on its only page (M9-F7, DL-120 item 4).
  await expect(ledger.getByRole('row').last()).toHaveText(/^Year 1 Day 1, morningFounded with \d+ WealthOpening balance\d+$/);
  await treasury.getByRole('group', { name: 'Show income or expense' }).getByRole('button', { name: /^Expense \d+$/ }).click();
  await expect(treasury.getByTestId('totals')).toHaveText(/^Income 0 · Expense -\d+ · Net -\d+$/);
  await expectNoHorizontalOverflow(page, "the Guild's Treasury");

  // Fast forward until the Party returns; another stop (a Transfer Offer, say) is played past.
  const fastForward = page.getByRole('button', { name: 'Fast forward', exact: true });
  const stop = page.getByTestId('stop');
  const stopped = async (): Promise<string> => ((await stop.count()) === 0 ? '' : ((await stop.textContent()) ?? ''));
  for (let tries = 0; tries < 10 && !/came home/.test(await stopped()); tries += 1) await playTurns(page, fastForward);
  await expect(stop).toContainText("Stopped: The Lantern's Party came home.");
  // The play opened Guild › Home at the Party's Quest report, with the keyboard on its heading (M9-F5,
  // DL-112 item 8): its sections in order, how it went, what it brought, each Hero, and the Patron.
  const guild = page.getByRole('region', { name: 'Guild', exact: true });
  const report = guild.getByRole('region', { name: `Quest report: ${quest}`, exact: true });
  await expect(report.getByRole('heading', { level: 3 })).toBeFocused();
  await expect(report.getByRole('heading', { level: 4 })).toHaveText(['Encounters', 'Rewards', 'Heroes', 'The Patron']);
  await expect(report).toContainText(/(Success|Strong success|Failure)/);
  await expect(report).toContainText(/Wealth [+-]?\d+/);
  await expect(report).toContainText(/'s Regard for The Lantern /);
  // The Party's stop offers nothing more: the report is here, under it.
  await expect(stop.getByRole('button', { name: 'Read what happened' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "a Party's Quest report");
  await expectTargets(page, "a Party's Quest report");

  // The return in the History: one entry, new, how it went in bold, its Heroes a line each behind a
  // disclosure, and no Encounter of its own (M9-F5, DL-111 item 2).
  const read = await history(page);
  await expect(read.getByRole('heading', { level: 3 })).toHaveText('The History of The Lantern');
  const cameHome = historyText(read, new RegExp(`^The Lantern's Party came home from ${escaped(quest)} and (failed|succeeded|succeeded strongly): Wealth [+-]?\\d+, Fame [+-]?\\d+\\.`));
  await expect(cameHome).toHaveCount(1);
  const returned = lineOf(cameHome);
  await expect(returned).toHaveClass(/\bis-new\b/);
  await expect(cameHome.locator('strong')).toHaveText(/^(failed|succeeded|succeeded strongly)$/);
  const heroes = returned.getByRole('button', { name: /^\d+ Heroes?: how each fared on / });
  await expect(heroes).toHaveAttribute('aria-expanded', 'false');
  await heroes.click();
  await expect(heroes).toHaveAttribute('aria-expanded', 'true');
  const heroLines = returned.locator('.return__heroes li');
  await expect(heroLines.first()).toBeVisible();
  for (const line of await heroLines.all()) await expect(line).toContainText(/^.+: (died on the Quest|gained \d+ XP)/);
  await expect(historyText(read, /\(Encounter \d+\)/)).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "the Party's return in the History, its Heroes open");
  await expectTargets(page, "the Party's return in the History, its Heroes open");

  // "Open the report" opens it again on Guild › Home, until it is closed.
  await returned.getByRole('button', { name: /^Open the report: / }).click();
  await expect(report.getByRole('heading', { level: 3 })).toBeFocused();
  await report.getByRole('button', { name: 'Close the report' }).click();
  // Home again, its digest back: the stop, and this report still, since its Party came home in the last play.
  await expect(guild.getByRole('heading', { level: 2 })).toBeFocused();
  await expect(guild.getByTestId('stop')).toBeVisible();
  await expect(report.getByRole('button', { name: 'Close the report' })).toHaveCount(0);

  // From 1100px the rail beside the view holds the same entry, its Heroes behind the same disclosure.
  if ((page.viewportSize()?.width ?? 0) >= 1100) {
    const rail = page.getByRole('complementary', { name: 'Latest for The Lantern' });
    const entry = rail.locator('.rail__return').first();
    await expect(entry.locator('strong')).toHaveText(/^(failed|succeeded|succeeded strongly)$/);
    const railHeroes = entry.getByRole('button', { name: /^\d+ Heroes?: how each fared on / });
    await railHeroes.click();
    await expect(entry.locator('.return__heroes li').first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "the Party's return in the rail, its Heroes open");
    await expectTargets(page, "the Party's return in the rail, its Heroes open");
  }

  // Save in the browser, under a name.
  const turn = (await page.getByTestId('time').textContent()) ?? '';
  const wealth = (await page.getByTestId('wealth').textContent()) ?? '';
  const roster = await rosterNames(page);
  expect(roster).toContain(recruited);
  const game = await thisGame(page);
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
  const newGame = page.getByRole('region', { name: 'A new game', exact: true });
  await expect(newGame.getByRole('article', { name: 'journey' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'the saves listed before a game');
  await newGame.getByRole('button', { name: 'Load journey' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Lantern');
  await expect(page.getByTestId('time')).toHaveText(turn);
  await expect(page.getByTestId('wealth')).toHaveText(wealth);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  // A load opens the home view.
  await expect(page.getByRole('region', { name: 'Guild', exact: true })).toBeVisible();
  expect(await rosterNames(page)).toEqual(roster);
  await expectNoHorizontalOverflow(page, 'a save loaded');

  // Export the save kept in IndexedDB: the uncompressed save, the bytes serialise gave.
  const [exported] = await Promise.all([page.waitForEvent('download'), (await thisGame(page)).getByRole('button', { name: 'Export journey' }).click()]);
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
