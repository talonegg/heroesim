import { writeFileSync } from 'node:fs';
import { coinWords } from '@heroesim/words';
import { applyAction, createWorld, defaultConfig, serialise, turnsPerDay, type Guild, type Hero, type HeroId, type WorldDocument } from '@heroesim/engine';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  amountPattern,
  escaped,
  expectNoHorizontalOverflow,
  expectTargets,
  expectWealth,
  history,
  historyText,
  openView,
  part,
  region,
  rosterList,
  savedContent,
  silverOf,
  spokenText,
  startGame,
  statusBar,
  wealthOf,
} from './support';

// The Contract in the built page (DL-323), at a phone's width, a tablet's and a desktop's: the Unattached
// pool's three wage columns and a signing at each length; a Hero renewed at a length chosen and another
// released, from their pages; the Roster's Contract column; a free Offer answered by a renewal; and the
// stop at a Contract's end. What each holds is Vitest's; this is what a real browser shows at each width:
// nothing pushed sideways, every control a 44px target.
//
// The free Offer and the Contract's end are made in the engine and opened with "Load a save file", as the
// Board's spec does: a world standing on the night a Contract ends, which no new game does for a Day.

const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-10-17T09:00:00.000Z' };
const deps = { config: defaultConfig, content: savedContent() };

/** A new game standing on `turn`, `change` made to it: the page opens it as a save. */
function standingOn(turn: number, change: (document: WorldDocument, player: Guild) => void): WorldDocument {
  const { document } = createWorld('e2e-contract', setup, deps);
  document.world.turn = turn;
  const player = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'player') as Guild;
  change(document, player);
  return document;
}

/** Ends the Contract of `heroId` on the night of `endDay`; no other Contract of the player's Roster ends before the Day after. */
function endingOn(document: WorldDocument, player: Guild, heroId: HeroId, endDay: number): void {
  for (const id of player.rosterIds) {
    const hero = document.world.heroes[id] as Hero;
    if (hero.contract !== null) hero.contract = { ...hero.contract, endDay: id === heroId ? endDay : Math.max(hero.contract.endDay, endDay + 10) };
  }
}

/** Opens `document` in the page from the new-game form's "Load a save file". */
async function opened(page: Page, document: WorldDocument, testInfo: TestInfo): Promise<void> {
  const file = testInfo.outputPath('contract.json');
  writeFileSync(file, serialise(document));
  await page.goto('/');
  await region(page, 'A new game').getByLabel('Load a save file').setInputFiles(file);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(setup.guildName);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
}

/** Waits until the page has settled the play it took. */
async function idle(page: Page): Promise<void> {
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
}

/** The Roster's Table, shown, and the Contract column's cell for `name`. */
async function contractCell(page: Page, name: string): Promise<Locator> {
  const roster = await openView(page, 'Roster');
  await roster.getByRole('radiogroup', { name: 'Show the Roster as' }).getByRole('radio', { name: 'Table' }).click();
  const table = roster.getByRole('table', { name: 'Heroes on the Roster' });
  await expect(table.getByRole('columnheader', { name: 'Contract' })).toBeVisible();
  return table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${escaped(name)}`) }) }).locator('td[data-column="contract"]');
}

test('the pool gives a wage for each length, and a Hero is signed at each: the Contract ends that many Years on', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-contract-pool' });
  const pool = await part(page, 'Unattached pool');
  const table = pool.getByRole('table', { name: 'Heroes in the Unattached pool' });
  await expect(table.getByRole('columnheader').filter({ hasText: /-Year Contract$/ })).toHaveText(['1-Year Contract', '2-Year Contract', '3-Year Contract']);
  const rows = pool.getByTestId('pool-row');
  await expectNoHorizontalOverflow(page, "the pool's three wage columns");
  await expectTargets(page, "the pool's three wage columns");

  // The three Heroes of the lowest fee who would sign; each row's three wages, the longer no dearer.
  const chosen: { name: string; fee: number; wages: number[] }[] = [];
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    if ((await row.getByTestId('signs').textContent()) !== 'Yes') continue;
    const wages = await Promise.all([0, 1, 2].map((each) => silverOf(row.getByTestId('wage').nth(each))));
    expect(wages[0]).toBeGreaterThanOrEqual(wages[1] ?? 0);
    expect(wages[1]).toBeGreaterThanOrEqual(wages[2] ?? 0);
    chosen.push({ name: (await row.locator('button.link').textContent()) ?? '', fee: await silverOf(row.getByTestId('fee')), wages });
  }
  const signing = chosen.sort((a, b) => a.fee - b.fee).slice(0, 3);
  expect(signing).toHaveLength(3);

  for (const [at, { name, fee, wages }] of signing.entries()) {
    const years = at + 1;
    const before = await wealthOf(page);
    const row = rows.filter({ has: page.getByRole('button', { name, exact: true }) });
    await row.getByLabel(`Contract length for ${name}`).selectOption(String(years));
    await row.getByRole('button', { name: `Recruit ${name}`, exact: true }).click();
    await idle(page);
    await expectWealth(page, before - fee);
    const wage = wages[at] ?? 0;
    const signed = historyText(await history(page), new RegExp(`^The Lantern signed ${escaped(name)} for ${amountPattern}, on a Contract at ${amountPattern} to Year ${1 + years} Day 1\\.$`));
    await expect(signed).toHaveCount(1);
    // The wage the pool showed for that length is the one the Contract carries.
    await expect(signed).toContainText(`on a Contract at ${coinWords(wage)} to`);
    await part(page, 'Unattached pool');
  }
});

test('a Hero is renewed for three years from their page, the Roster’s Table giving the Days left; another is released after asking, paying the payout', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-contract-hero' });
  const roster = await openView(page, 'Roster');
  const tiles = roster.getByRole('list', { name: 'Heroes on the Roster' }).getByRole('listitem');
  const renewed = (await tiles.nth(0).getByRole('button').textContent()) ?? '';
  const released = (await tiles.nth(1).getByRole('button').textContent()) ?? '';

  // Renewed: the Contract's words, the wage of each length, and the length chosen.
  await tiles.nth(0).getByRole('button').click();
  const article = roster.getByRole('article');
  await expect(article.getByRole('heading', { level: 4, name: 'Contract', exact: true })).toBeVisible();
  await expect(article.getByText(/^Wage .+ every 10 Days, to the night of Year \d+ Day \d+: \d+ Days left\.$/)).toBeVisible();
  const lengths = article.getByTestId('wages-by-length');
  await expect(lengths).toContainText(/^Contract wage by length: 1 Year .+, 2 Years .+, 3 Years .+\.$/);
  await expectNoHorizontalOverflow(page, "a Hero's page with the Contract");
  await expectTargets(page, "a Hero's page with the Contract");
  const wealth = await wealthOf(page);
  await article.getByLabel(`Contract length for ${renewed}`).selectOption('3');
  await article.getByRole('button', { name: `Renew ${renewed}`, exact: true }).click();
  await idle(page);
  await expect(article.getByText(/^Wage .+ every 10 Days, to the night of Year 4 Day 1: 1080 Days left\.$/)).toBeVisible();
  await expectWealth(page, wealth);
  await expect(historyText(await history(page), new RegExp(`^The Lantern signed ${escaped(renewed)} again, on a Contract at ${amountPattern} to Year 4 Day 1\\.$`))).toHaveCount(1);

  // The Roster's Table: a Contract column, the Days left.
  await expect(await contractCell(page, renewed)).toHaveText('1080 Days left');
  await expectNoHorizontalOverflow(page, "the Roster's Table with a Contract column");
  await expectTargets(page, "the Roster's Table with a Contract column");

  // Released: asked first, the payout said, the Hero gone from the Roster and the Guild's Wealth down by it.
  await roster.getByRole('radiogroup', { name: 'Show the Roster as' }).getByRole('radio', { name: 'Tiles' }).click();
  const list = await rosterList(page);
  await list.getByRole('button', { name: released, exact: true }).click();
  const page2 = roster.getByRole('article');
  await page2.getByRole('button', { name: `Release ${released}…`, exact: true }).click();
  const ask = page2.getByRole('group', { name: `Release ${released}?` });
  await expect(ask).toContainText(new RegExp(`^Releasing ${escaped(released)} pays ${amountPattern}\\. They join the Unattached pool\\.`));
  await expect(ask).not.toContainText("last Hero");
  await expectNoHorizontalOverflow(page, 'the release asking first');
  await expectTargets(page, 'the release asking first');
  const payout = /pays (.+?)\. They/.exec((await spokenText(ask.locator('p').first())) ?? '')?.[1] ?? '';
  const before = await wealthOf(page);
  await ask.getByRole('button', { name: `Release ${released}`, exact: true }).click();
  await idle(page);
  expect(payout).not.toBe('');
  expect(await wealthOf(page)).toBeLessThan(before);
  await page2.getByRole('button', { name: 'Back to the Roster' }).click();
  await expect((await rosterList(page)).getByRole('button', { name: released, exact: true })).toHaveCount(0);
  await expect(historyText(await history(page), new RegExp(`^The Lantern released ${escaped(released)}, paying ${amountPattern}\\.$`))).toHaveCount(1);
});

test('a free Offer for a Hero Out of Contract says so with its Days left, has no Decline, and is answered by Renew', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  // The night of Day 2 (Day 1 as the engine counts it): the first Hero's Contract has just ended.
  const document = standingOn(2 * turnsPerDay - 1, (made, player) => {
    const heroId = player.rosterIds[0] as HeroId;
    endingOn(made, player, heroId, 1);
    const rival = Object.values(made.world.guilds).find((guild) => guild.id !== player.id) as Guild;
    rival.wealth = 100_000;
    const offered = applyAction(made, { kind: 'offerTransfer', guildId: rival.id, heroId, years: 2 }, deps);
    if (!offered.ok) throw new Error(offered.rejection.reason);
    made.world = offered.document.world;
    made.history = offered.document.history;
  });
  const player = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'player') as Guild;
  const name = document.world.heroes[player.rosterIds[0] as HeroId]?.name ?? '';
  const bidder = Object.values(document.world.offers)[0]?.toGuildId ?? '';
  const bidderName = document.world.guilds[bidder as keyof typeof document.world.guilds]?.name ?? '';
  await opened(page, document, testInfo);

  const offers = await part(page, 'Transfer Offers');
  await expect(offers.getByText(new RegExp(`^${escaped(bidderName)} offers no fee for ${escaped(name)}, who is Out of Contract, until the night of Year 1 Day \\d+: 2 Days left to renew them\\.$`))).toBeVisible();
  await expect(offers.getByRole('button', { name: `Decline ${bidderName}'s Offer for ${name}` })).toHaveCount(0);
  await expect(offers.getByRole('button', { name: `Accept ${bidderName}'s Offer for ${name}…` })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'a free Offer');
  await expectTargets(page, 'a free Offer');

  await offers.getByLabel(`Contract length for ${name}`).selectOption('2');
  await offers.getByRole('button', { name: `Renew ${name}`, exact: true }).click();
  await idle(page);
  await expect(page.getByRole('region', { name: 'Transfer Offers' })).toHaveCount(0);
  await expect(historyText(await history(page), new RegExp(`^${escaped(bidderName)}'s Offer for ${escaped(name)} was withdrawn: the Hero's Contract was renewed\\.$`))).toHaveCount(1);
  // Signed again on Day 2 for two years: it ends on the night of Year 3 Day 2.
  await expect(await contractCell(page, name)).toHaveText('720 Days left');
  await expectNoHorizontalOverflow(page, 'a free Offer answered');
});

test('a Contract that ends stops a fast forward with the Hero Out of Contract, and the Roster says so', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  // The morning of Day 11, with the first Hero's Contract ending that night.
  const document = standingOn(10 * turnsPerDay, (made, player) => endingOn(made, player, player.rosterIds[0] as HeroId, 10));
  const player = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'player') as Guild;
  const name = document.world.heroes[player.rosterIds[0] as HeroId]?.name ?? '';
  await opened(page, document, testInfo);

  // Fast forward again past any other stop, until the Contract's end.
  const stop = page.getByTestId('stop');
  const time = statusBar(page).getByRole('group', { name: 'Time' });
  for (let tries = 0; tries < 6; tries += 1) {
    await time.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await idle(page);
    if (/^Stopped: a Contract ended: /.test((await stop.locator('p').first().textContent()) ?? '')) break;
  }
  await expect(stop.locator('p').first()).toHaveText(new RegExp(`^Stopped: a Contract ended: ${escaped(name)} of The Lantern is Out of Contract`));
  await expectNoHorizontalOverflow(page, 'the stop at a Contract’s end');
  await expectTargets(page, 'the stop at a Contract’s end');

  await stop.getByRole('button', { name: 'Open the Roster' }).click();
  await expect(region(page, 'Roster')).toBeVisible();
  await expect(await contractCell(page, name)).toHaveText(/^Out of Contract/);
  await expectNoHorizontalOverflow(page, 'the Roster with a Hero Out of Contract');
});
