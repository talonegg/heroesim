import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectTapTarget,
  expectTapTargets,
  showPane,
  startCareer,
  VERIFICATION_DIR,
  WIDTHS,
} from './helpers';

/**
 * E5 in a real browser, on all three device projects: the other Guilds with a Hero who can
 * be brought over, one who can be taken without asking, one who is neither with the reason
 * written out, one the Guild cannot pay for and a Roster with no room left — the five
 * states at once, because that is where every string the sheet has is on screen together.
 * And the League, which is the one view in the client that would be a table if it were not
 * built to reflow.
 *
 * **Reaching those states without a back door.** Regard between Guilds moves over years of
 * play. So the Career is marked the way a player could mark it themselves, as
 * `applicants.spec.ts` and `hall.spec.ts` do: the app saves to slot 1, the save document —
 * which is exactly what `serialiseCareer` writes — is edited in `localStorage`, and the app
 * loads it back through its own slot picker. Nothing test-only exists in the client.
 */

const SEED = 'heroesim-e2e-rivals';
const SLOT_KEY = 'heroesim.career.1';

interface Wanted {
  coin: number;
  /** Set to the Roster's own size to put the Career at the cap. */
  cap?: number;
  /**
   * Put every Hero of yours exactly on `poachRegardThreshold` and wrong two of the other
   * Guilds past `retaliationRegardThreshold`, so the Roster is in the state finding C9 is
   * about: every row marked, with the Guilds minded to try named on it (DL-22 §2).
   */
  atRisk?: boolean;
}

interface Waiting {
  /** Somebody the first Guild will sell, whom the player can afford. */
  transferableId: string;
  transferableName: string;
  /** Somebody who has had enough of the first Guild. */
  poachableId: string;
  poachableName: string;
  /** Somebody a soured Guild will not sell and who is content where they are. */
  neitherId: string;
  neitherName: string;
  firstGuild: string;
  souredGuild: string;
  coin: number;
  rosterCap: number;
  rosterSize: number;
}

/** The shape of the save document this spec edits. Only the fields it touches. */
interface SaveDocument {
  config: {
    rosterCap: number;
    poachRegardThreshold: number;
    transferConsentRegard: number;
    souredRivalThreshold: number;
    retaliationRegardThreshold: number;
  };
  guild: {
    coin: number;
    roster: { id: string; regardForGuildmaster: { value: number; reason: string } }[];
  };
  rivals: {
    id: string;
    name: string;
    standing: number;
    regardForGuild: { value: number; reason: string; nature: string };
    roster: { id: string; name: string; regardForRival: { value: number } }[];
  }[];
}

/** Start a Career, save it, put the other Guilds where they need to be, and load it back. */
async function loadACareerWithRivals(page: Page, want: Wanted): Promise<Waiting> {
  await startCareer(page, SEED);

  await page.getByTestId('open-saves').click();
  await page.getByTestId('save-1').click();
  await expect(page.getByTestId('slot-1')).toContainText('Day');
  await page.getByRole('button', { name: 'Close' }).click();

  const saved = await page.evaluate((key) => localStorage.getItem(key), SLOT_KEY);
  expect(saved, 'the app should have written slot 1').not.toBeNull();
  const career = JSON.parse(saved ?? '{}') as SaveDocument;

  const first = career.rivals[0];
  const soured = career.rivals[1];
  expect(first, 'the seed should deal a Rival with people').toBeDefined();
  expect(soured).toBeDefined();
  if (first === undefined || soured === undefined) throw new Error('no Rivals in the save');
  expect(first.roster.length, 'the first Guild should employ at least two people').toBeGreaterThan(1);
  expect(soured.roster.length).toBeGreaterThan(0);

  // The first Guild will deal with you: one of theirs is content (Transfer only), one has
  // had enough of them (both). The second will not deal with you at all, and theirs is
  // content too — so neither move is open, for two different reasons.
  const transferable = first.roster[0];
  const poachable = first.roster[1];
  const neither = soured.roster[0];
  if (transferable === undefined || poachable === undefined || neither === undefined) {
    throw new Error('the seed did not deal enough people');
  }
  transferable.regardForRival.value = 2;
  poachable.regardForRival.value = career.config.poachRegardThreshold - 1;
  neither.regardForRival.value = 2;
  first.regardForGuild.value = career.config.transferConsentRegard;
  // Wronged enough to refuse a Transfer *and* to be taking more off your Board: one value
  // below both thresholds, so the sheet has to say both things about them.
  soured.regardForGuild.value = career.config.souredRivalThreshold;
  soured.regardForGuild.reason = 'you took somebody off their Roster';
  career.guild.coin = want.coin;
  if (want.cap !== undefined) career.config.rosterCap = want.cap;
  if (want.atRisk === true) {
    // Exactly on the line, which is the whole point of showing it: one point above the
    // band the Departure Check would talk somebody round in (finding C9, DL-22 §2).
    for (const hero of career.guild.roster) {
      hero.regardForGuildmaster.value = career.config.poachRegardThreshold;
      hero.regardForGuildmaster.reason = 'you sent them out again with no rest';
    }
    // Two Guilds wronged enough to try, so the mark has to name more than one of them and
    // the sentence is at its longest.
    soured.regardForGuild.value = career.config.retaliationRegardThreshold;
    const third = career.rivals[2];
    if (third !== undefined) {
      third.regardForGuild.value = career.config.retaliationRegardThreshold;
      third.regardForGuild.reason = 'you took somebody off their Roster';
    }
  }

  await page.evaluate(
    (written: { key: string; document: string }) => {
      localStorage.setItem(written.key, written.document);
    },
    { key: SLOT_KEY, document: JSON.stringify(career, null, 2) },
  );

  await page.reload();
  await expect(page.getByTestId('begin')).toBeVisible();
  await page.getByTestId('open-saves').click();
  await page.getByTestId('load-1').click();
  await expect(page.getByTestId('guild-name')).toBeVisible();

  return {
    transferableId: transferable.id,
    transferableName: transferable.name,
    poachableId: poachable.id,
    poachableName: poachable.name,
    neitherId: neither.id,
    neitherName: neither.name,
    firstGuild: first.name,
    souredGuild: soured.name,
    coin: want.coin,
    rosterCap: want.cap ?? career.config.rosterCap,
    rosterSize: career.guild.roster.length,
  };
}

/** The card one of a Rival's Heroes is offered on. */
function cardFor(page: Page, heroId: string) {
  return page.getByTestId('rival-hero').filter({ has: page.getByTestId(`transfer-${heroId}`) });
}

test('shows every other Guild, what it makes of yours, and everybody it employs', async ({
  page,
}) => {
  const world = await loadACareerWithRivals(page, { coin: 5000 });
  await page.getByTestId('open-rivals').click();

  await expect(page.getByTestId('rival')).toHaveCount(4);
  // Grouped, in the one number format `narrate` writes and both front ends print (DL-27 §1).
  await expect(page.getByTestId('rivals-coin')).toContainText('5,000 coin');
  await expect(page.getByTestId('rivals-coin')).toContainText(
    `${String(world.rosterSize)} of ${String(world.rosterCap)}`,
  );

  // Standing, Roster size and the Regard, with the reason it stands there.
  const first = page.getByTestId('rival').filter({ hasText: world.firstGuild }).first();
  await expect(first.getByTestId('rival-standing')).toContainText('Standing');
  await expect(first.getByTestId('rival-standing')).toContainText('Regard for your Guild');
  await expect(first.getByTestId('rival-reason')).not.toBeEmpty();

  // Background and Traits first, Stats second, then the age and what they make of them.
  const card = cardFor(page, world.transferableId);
  await expect(card.getByTestId('rival-hero-background')).toBeVisible();
  await expect(card.locator('.chips')).toBeVisible();
  await expect(card.locator('.stats')).toBeVisible();
  await expect(card.getByTestId('rival-hero-terms')).toContainText('what they make of');

  // No person's calibre is ever on screen, as a word, a star or a grade.
  const said = (await page.getByTestId('rival-hero').allTextContents()).join('\n');
  expect(said.toLowerCase()).not.toContain('calibre');
  expect(said).not.toContain('★');
});

test('warns what a Poaching costs before the tap, not after it', async ({ page }) => {
  await loadACareerWithRivals(page, { coin: 5000 });
  await page.getByTestId('open-rivals').click();
  const warning = page.getByTestId('poach-warning');
  await expect(warning).toContainText('costs');
  await expect(warning).toContainText('Regard');
  await expect(warning).toContainText('Board');
  await expect(warning).toContainText('back off your Roster');
  // And a Guild that has been wronged says so, in words.
  const soured = page.getByTestId('rival').filter({ hasText: 'you took somebody off their Roster' });
  await expect(soured.getByTestId('rival-soured')).toContainText('wronged them');
});

test('offers both moves with the fee on the control, and refuses each in text', async ({ page }) => {
  const world = await loadACareerWithRivals(page, { coin: 5000 });
  await page.getByTestId('open-rivals').click();

  // Transferable and content: the Transfer is open, the Poaching is refused with a reason.
  await expect(page.getByTestId(`transfer-${world.transferableId}`)).toBeEnabled();
  await expect(page.getByTestId(`transfer-${world.transferableId}`)).toContainText('coin');
  await expect(page.getByTestId(`poach-${world.transferableId}`)).toBeDisabled();
  await expect(cardFor(page, world.transferableId).getByTestId('why-not-poach')).toContainText(
    'content enough',
  );

  // Had enough of them: both are open, and the Poaching is the cheaper of the two.
  await expect(page.getByTestId(`transfer-${world.poachableId}`)).toBeEnabled();
  await expect(page.getByTestId(`poach-${world.poachableId}`)).toBeEnabled();
  const transferFee = Number(
    /(\d+) coin/.exec((await page.getByTestId(`transfer-${world.poachableId}`).textContent()) ?? '')?.[1] ?? 0,
  );
  const poachFee = Number(
    /(\d+) coin/.exec((await page.getByTestId(`poach-${world.poachableId}`).textContent()) ?? '')?.[1] ?? 0,
  );
  expect(poachFee).toBeLessThan(transferFee);

  // Neither, for two different reasons, both written out.
  await expect(page.getByTestId(`transfer-${world.neitherId}`)).toBeDisabled();
  await expect(page.getByTestId(`poach-${world.neitherId}`)).toBeDisabled();
  await expect(cardFor(page, world.neitherId).getByTestId('why-not-transfer')).toContainText(
    'will not deal with you',
  );
  await expect(cardFor(page, world.neitherId).getByTestId('why-not-poach')).toContainText(
    'content enough',
  );
});

test('says plainly when the Guild cannot pay, and when there is no room', async ({ page }) => {
  const poor = await loadACareerWithRivals(page, { coin: 10 });
  await page.getByTestId('open-rivals').click();
  await expect(page.getByTestId(`transfer-${poor.transferableId}`)).toBeDisabled();
  await expect(cardFor(page, poor.transferableId).getByTestId('why-not-transfer')).toContainText(
    'coin short',
  );

  const full = await loadACareerWithRivals(page, { coin: 5000, cap: 4 });
  await page.getByTestId('open-rivals').click();
  await expect(page.getByTestId(`transfer-${full.transferableId}`)).toBeDisabled();
  await expect(cardFor(page, full.transferableId).getByTestId('why-not-transfer')).toContainText(
    'no room on your Roster',
  );
});

test('brings somebody over, and narrates it', async ({ page }) => {
  const world = await loadACareerWithRivals(page, { coin: 5000 });
  await page.getByTestId('open-rivals').click();
  await page.getByTestId(`transfer-${world.transferableId}`).click();
  // They are gone from the other Guild's Roster.
  await expect(page.getByTestId(`transfer-${world.transferableId}`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();

  await showPane(page, 'roster');
  await expect(page.getByTestId('pane-roster')).toContainText(world.transferableName);

  await showPane(page, 'report');
  const report = (await page.getByTestId('report-log').textContent()) ?? '';
  expect(report).toContain(world.transferableName);
  expect(report).toContain('comes over from');
  expect(report).toContain('nobody has been wronged by it');
});

test('narrates a Poaching, and says in the Report what it cost in goodwill', async ({ page }) => {
  /**
   * Finding F9, closed (DL-22). This was called "narrates a refusal rather than swallowing
   * it" and performed a **successful** Poaching; no `TransferRefused` is produced anywhere
   * in the browser suite, and none can be. The Rivals sheet disables each control exactly
   * when the engine's own `rivalOffers` says the move would be refused, and React renders
   * from the same Career the tap then acts on, so there is no window in which the two
   * disagree — the state is unreachable through the UI rather than untested. That promise
   * is kept at the reducer instead, by `web/tests/rivals.test.tsx`'s "narrates a refusal
   * rather than swallowing it, and moves nobody" and "narrates the other three refusals
   * too, which the browser cannot reach". This test is renamed to say what it does.
   */
  const world = await loadACareerWithRivals(page, { coin: 5000 });
  await page.getByTestId('open-rivals').click();
  // Spend the coin first, on somebody the Guild can still afford, then ask for the other.
  await page.getByTestId(`poach-${world.poachableId}`).click();
  await expect(page.getByTestId(`poach-${world.poachableId}`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await showPane(page, 'report');
  const report = (await page.getByTestId('report-log').textContent()) ?? '';
  expect(report).toContain(world.poachableName);
  expect(report).toContain('without anybody asking them');
  expect(report).toContain('will not forget it');
});

test('the League lists every Guild and marks yours, in text', async ({ page }) => {
  const world = await loadACareerWithRivals(page, { coin: 5000 });
  await page.getByTestId('open-league').click();
  await expect(page.getByTestId('league-row')).toHaveCount(5);
  const mine = page.getByTestId('league-row').filter({ hasText: 'your Guild' });
  await expect(mine).toHaveCount(1);
  await expect(page.getByTestId('league-footer')).toContainText('not a score');
  await expect(page.getByTestId('league-footer')).toContainText('earn their Regard');
  // Ordered by Standing, highest first.
  const standings = (await page.getByTestId('league-row').allTextContents()).map(
    (text) => Number(/Standing (-?\d+)/.exec(text)?.[1] ?? 0),
  );
  expect(standings).toEqual([...standings].sort((one, other) => other - one));
  expect(world.firstGuild.length).toBeGreaterThan(0);
});

test('the other Guilds fit and can be tapped at every width', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  // The hardest state: one who can be bought, one who can be taken, one who is neither,
  // and a Guild that has been wronged — every string the sheet has, on screen at once.
  const world = await loadACareerWithRivals(page, { coin: 5000 });
  await page.getByTestId('open-rivals').click();
  await expect(page.getByTestId('rival')).toHaveCount(4);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expect(page.getByTestId('rival')).toHaveCount(4);
    await expectNoHorizontalOverflow(page, `the other Guilds at ${String(width)}px`);
    await expectTapTargets(page, `the other Guilds at ${String(width)}px`);
    // A disabled control is still aimed at, so it is held to the same 40×40 floor.
    await expectTapTarget(
      page.getByTestId(`poach-${world.transferableId}`),
      `a refused Poaching at ${String(width)}px`,
    );
    await expect(cardFor(page, world.neitherId).getByTestId('why-not-transfer')).toContainText(
      'will not deal with you',
    );
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await expectNoHorizontalOverflow(page, `the other Guilds at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `the other Guilds at the ${testInfo.project.name} viewport`);
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'rivals.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});

test('the Roster says who another Guild could take, at every width', async ({ page }, testInfo) => {
  /**
   * Finding C9 in the browser (DL-22 §2). Every Hero sits exactly on
   * `poachRegardThreshold` and two of the other Guilds are wronged enough to try, so every
   * row carries the mark and the mark names two Guilds — the longest the sentence gets,
   * and the hardest thing on the pane to fit at 320px.
   */
  const projectViewport = page.viewportSize();
  const world = await loadACareerWithRivals(page, { coin: 5000, atRisk: true });
  await showPane(page, 'roster');

  const marks = page.getByTestId('hero-at-risk');
  await expect(marks).toHaveCount(world.rosterSize);
  // In words, and the Guilds minded to try named in them.
  await expect(marks.first()).toContainText('Another Guild could take them.');
  await expect(marks.first()).toContainText(world.souredGuild);
  await expect(marks.first()).toContainText('minded to.');

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await showPane(page, 'roster');
    await expect(marks).toHaveCount(world.rosterSize);
    await expectNoHorizontalOverflow(page, `the marked Roster at ${String(width)}px`);
    await expectTapTargets(page, `the marked Roster at ${String(width)}px`);
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await showPane(page, 'roster');
  await expectNoHorizontalOverflow(page, `the marked Roster at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `the marked Roster at the ${testInfo.project.name} viewport`);
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'roster-at-risk.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});

test('the League fits at every width without ever scrolling sideways', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  await loadACareerWithRivals(page, { coin: 5000 });
  await page.getByTestId('open-league').click();
  await expect(page.getByTestId('league-row')).toHaveCount(5);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expect(page.getByTestId('league-row')).toHaveCount(5);
    // A League that has to be dragged is a League nobody reads on a phone. There is no
    // table here at all: every row carries its own labels and stacks.
    await expectNoHorizontalOverflow(page, `the League at ${String(width)}px`);
    await expectTapTargets(page, `the League at ${String(width)}px`);
    await expect(page.getByTestId('league-footer')).toContainText('not a score');
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await expectNoHorizontalOverflow(page, `the League at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `the League at the ${testInfo.project.name} viewport`);
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'league.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});
