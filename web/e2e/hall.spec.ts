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
 * E3 in a real browser, on all three device projects: the Hall where the three
 * improvements are bought, and a Roster showing a Hero who is hurt and cannot be sent —
 * both checked for horizontal overflow and tap-target size at every width.
 *
 * The Hall's hardest state is the mixed one — something already built, something the
 * Guild cannot pay for, something it can — because that is where the longest strings are
 * ("Already built.", "N coin short.") and where three cards carry three different
 * answers. It is swept at every width and kept as evidence, not only at 10,000 coin where
 * everything is affordable and nothing has to be explained.
 *
 * **Reaching these states without a back door.** An Injury comes of a badly failed Check,
 * and a part-built Hall of several hundred coin earned; both take minutes of play and
 * depend on the dice. So the Career is marked the way a player could mark it themselves,
 * exactly as `refusals.spec.ts` sours one: the app saves to slot 1, the save document —
 * which is precisely what `serialiseCareer` writes — is edited in `localStorage`, and the
 * app loads it back through its own slot picker. Nothing test-only exists in the client
 * for this spec to use.
 */

const SEED = 'heroesim-e2e-hall';
const SLOT_KEY = 'heroesim.career.1';

/** The three things coin buys besides Upkeep, as the save document names them. */
type Improvement = 'infirmary' | 'trainingYard' | 'quarters';

/** What this Career charges for each of them. Read from the save, never assumed. */
type HallCosts = Record<Improvement, number>;

interface HurtCareer {
  /** The Hero carrying the Injury. */
  hurtName: string;
  /** Somebody who is still fit to be sent. */
  fitName: string;
  /** The name of the Injury Trait, as the Roster prints it. */
  injury: string;
  /** The Day it lifts. */
  liftsOn: number;
  coin: number;
  costs: HallCosts;
}

/** What the loaded Career should hold. */
interface Wanted {
  /** The Guild's coin, or a function of the three costs when it depends on them. */
  coin: number | ((costs: HallCosts) => number);
  /** Improvements the Hall already has when the Career loads. */
  hall?: readonly Improvement[];
}

/**
 * Start a Career, save it, give the first Hero an Injury and the Guild the coin and the
 * Hall the test asks for inside the saved document, and load that save back through the
 * app.
 */
async function loadAnInjuredCareer(page: Page, want: Wanted): Promise<HurtCareer> {
  await startCareer(page, SEED);

  await page.getByTestId('open-saves').click();
  await page.getByTestId('save-1').click();
  await expect(page.getByTestId('slot-1')).toContainText('Day');
  await page.getByRole('button', { name: 'Close' }).click();

  const saved = await page.evaluate((key) => localStorage.getItem(key), SLOT_KEY);
  expect(saved, 'the app should have written slot 1').not.toBeNull();

  const career = JSON.parse(saved ?? '{}') as {
    day: number;
    config: {
      hallInfirmaryCost: number;
      hallTrainingYardCost: number;
      hallQuartersCost: number;
    };
    guild: {
      coin: number;
      hall: string[];
      roster: { name: string; traits: { name: string; since: number; liftsOn?: number }[] }[];
    };
  };
  const hurt = career.guild.roster[0];
  const fit = career.guild.roster[1];
  expect(hurt, 'the seed should deal a Roster').toBeDefined();
  expect(fit, 'the seed should deal more than one Hero').toBeDefined();
  if (hurt === undefined || fit === undefined) throw new Error('no Roster in the save');

  const costs: HallCosts = {
    infirmary: career.config.hallInfirmaryCost,
    trainingYard: career.config.hallTrainingYardCost,
    quarters: career.config.hallQuartersCost,
  };
  const coin = typeof want.coin === 'number' ? want.coin : want.coin(costs);
  const liftsOn = career.day + 40;
  hurt.traits.push({ name: 'Cracked rib', since: career.day, liftsOn });
  career.guild.coin = coin;
  career.guild.hall = [...(want.hall ?? [])];

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

  return { hurtName: hurt.name, fitName: fit.name, injury: 'Cracked rib', liftsOn, coin, costs };
}

test('offers the Hall, names the cost and the effect, and buys one', async ({ page }) => {
  const world = await loadAnInjuredCareer(page, { coin: 10_000 });

  await page.getByTestId('open-hall').click();
  const offers = page.getByTestId('hall-offer');
  await expect(offers).toHaveCount(3);
  // Grouped, in the one number format `narrate` writes and both front ends print (DL-27 §1).
  await expect(page.getByTestId('hall-coin')).toContainText('10,000 coin');

  // Each improvement carries its cost and what it does, on the card itself.
  await expect(offers.nth(0)).toContainText(`${String(world.costs.infirmary)} coin`);
  await expect(offers.nth(0)).toContainText('Injury');
  await expect(offers.nth(1)).toContainText(`${String(world.costs.trainingYard)} coin`);
  await expect(offers.nth(1)).toContainText('Backing');
  await expect(offers.nth(2)).toContainText(`${String(world.costs.quarters)} coin`);
  await expect(offers.nth(2)).toContainText('idle');

  const buy = page.getByTestId('hall-buy-infirmary');
  await expect(buy).toBeEnabled();
  await expect(buy).toHaveAttribute('data-state', 'ready');
  await buy.click();

  // It is bought, it says so, and it cannot be bought again.
  await expect(page.getByTestId('hall-buy-infirmary')).toHaveAttribute('data-state', 'bought');
  await expect(page.getByTestId('hall-buy-infirmary')).toBeDisabled();
  await expect(page.getByTestId('hall-coin')).toContainText(
    (10_000 - world.costs.infirmary).toLocaleString('en-GB'),
  );
  await page.getByRole('button', { name: 'Close' }).click();

  await showPane(page, 'report');
  const report = (await page.getByTestId('report-log').textContent()) ?? '';
  expect(report).toContain('infirmary');
  expect(report).toContain(String(world.costs.infirmary));
});

test('disables what the Guild cannot pay for, and says how far short it is', async ({ page }) => {
  const world = await loadAnInjuredCareer(page, { coin: 5 });

  await page.getByTestId('open-hall').click();
  const buy = page.getByTestId('hall-buy-infirmary');
  await expect(buy).toBeDisabled();
  await expect(buy).toHaveAttribute('data-state', 'unaffordable');
  await expect(page.getByTestId('hall-why').first()).toContainText(
    `${String(world.costs.infirmary - 5)} coin short`,
  );
});

test('shows an injured Hero as unavailable, and will not offer them a Party', async ({ page }) => {
  const world = await loadAnInjuredCareer(page, { coin: 500 });

  await showPane(page, 'roster');
  const card = page
    .getByTestId('hero')
    .filter({ has: page.getByRole('heading', { name: world.hurtName, exact: true }) });
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('hero-injuries')).toBeVisible();
  await expect(card.getByTestId('chip-injury')).toContainText(world.injury);
  await expect(card.getByTestId('chip-injury')).toContainText('lifts');
  // In words, not colour alone.
  await expect(card.getByTestId('hero-where')).toContainText('cannot be sent');
  // And an age, on every Hero.
  await expect(page.getByTestId('hero-age').first()).toContainText('Age');

  // The picker will not offer them, and says why.
  await showPane(page, 'board');
  await page.getByTestId('commission').first().getByRole('button').click();
  await page.getByTestId('commit-party').waitFor();
  await expect(
    page.getByTestId('party-toggle').filter({ hasText: `${world.hurtName} · ` }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId('party-toggle').filter({ hasText: `${world.fitName} · ` }),
  ).toHaveCount(1);
  const listed = page.getByTestId('unavailable-hero');
  await expect(listed).toHaveCount(1);
  await expect(listed).toHaveAttribute('data-reason', 'injured');
  await expect(listed).toContainText(world.hurtName);
  await expect(listed).toContainText(world.injury);
});

test('the Hall fits and can be tapped at every width', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  await loadAnInjuredCareer(page, { coin: 10_000 });
  await page.getByTestId('open-hall').click();
  await expect(page.getByTestId('hall-offer')).toHaveCount(3);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expect(page.getByTestId('hall-offer')).toHaveCount(3);
    await expectNoHorizontalOverflow(page, `the Hall at ${String(width)}px`);
    await expectTapTargets(page, `the Hall at ${String(width)}px`);
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await expectNoHorizontalOverflow(page, `the Hall at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `the Hall at the ${testInfo.project.name} viewport`);
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'hall.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});

test('an injured Roster fits and can be tapped at every width', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  await loadAnInjuredCareer(page, { coin: 500 });
  await showPane(page, 'roster');

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    // Under 600px the layout is one pane at a time behind a bottom bar, so the Roster has
    // to be brought to the front again after every resize (E8-S3).
    await showPane(page, 'roster');
    await expect(page.getByTestId('pane-roster')).toBeVisible();
    await expectNoHorizontalOverflow(page, `an injured Roster at ${String(width)}px`);
    await expectTapTargets(page, `an injured Roster at ${String(width)}px`);
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await showPane(page, 'roster');
  await expectNoHorizontalOverflow(page, `an injured Roster at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `an injured Roster at the ${testInfo.project.name} viewport`);
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'injured-roster.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});

test('a part-built Hall fits, explains itself and can be tapped at every width', async ({
  page,
}, testInfo) => {
  const projectViewport = page.viewportSize();
  // One improvement already built, one the Guild can pay for and one it cannot: the state
  // that puts every string the Hall has — "Already built.", "N coin short." — on screen at
  // once, and the longest the cards ever are.
  const built: Improvement = 'trainingYard';
  const world = await loadAnInjuredCareer(page, {
    hall: [built],
    coin: (costs) => Math.min(costs.infirmary, costs.quarters),
  });
  const affordable: Improvement =
    world.costs.infirmary <= world.costs.quarters ? 'infirmary' : 'quarters';
  const short: Improvement = affordable === 'infirmary' ? 'quarters' : 'infirmary';
  expect(
    world.costs[affordable],
    'the two unbought improvements have to differ in cost for this state to exist',
  ).toBeLessThan(world.costs[short]);

  /** The card one improvement is offered on. */
  function card(improvement: Improvement) {
    return page
      .getByTestId('hall-offer')
      .filter({ has: page.getByTestId(`hall-buy-${improvement}`) });
  }

  await page.getByTestId('open-hall').click();
  await expect(page.getByTestId('hall-offer')).toHaveCount(3);

  // Three improvements, three different answers.
  await expect(page.getByTestId(`hall-buy-${built}`)).toHaveAttribute('data-state', 'bought');
  await expect(page.getByTestId(`hall-buy-${built}`)).toBeDisabled();
  await expect(page.getByTestId(`hall-buy-${affordable}`)).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId(`hall-buy-${affordable}`)).toBeEnabled();
  await expect(page.getByTestId(`hall-buy-${short}`)).toHaveAttribute(
    'data-state',
    'unaffordable',
  );
  await expect(page.getByTestId(`hall-buy-${short}`)).toBeDisabled();

  // Each refusal is in words on its own card, not implied by a greyed-out button (E3-S4).
  await expect(card(built).getByTestId('hall-why')).toContainText('Already built.');
  await expect(card(short).getByTestId('hall-why')).toContainText(
    `${String(world.costs[short] - world.coin)} coin short.`,
  );
  await expect(card(affordable).getByTestId('hall-why')).toHaveCount(0);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expect(page.getByTestId('hall-offer')).toHaveCount(3);
    await expectNoHorizontalOverflow(page, `a part-built Hall at ${String(width)}px`);
    await expectTapTargets(page, `a part-built Hall at ${String(width)}px`);
    // A disabled purchase is still aimed at, so it is held to the same 40×40 floor.
    for (const improvement of [built, short]) {
      await expectTapTarget(
        page.getByTestId(`hall-buy-${improvement}`),
        `${improvement}, disabled, at ${String(width)}px`,
      );
    }
    // And the reason survives the narrowest layout rather than being dropped from it.
    await expect(card(short).getByTestId('hall-why')).toContainText('coin short.');
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await expectNoHorizontalOverflow(page, `a part-built Hall at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `a part-built Hall at the ${testInfo.project.name} viewport`);
  for (const improvement of [built, short]) {
    await expectTapTarget(
      page.getByTestId(`hall-buy-${improvement}`),
      `${improvement}, disabled, at the ${testInfo.project.name} viewport`,
    );
  }
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'hall-mixed.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});

test('a Hero who cannot go fits and can be tapped at every width', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  const world = await loadAnInjuredCareer(page, { coin: 500 });

  // The picker's own account of who cannot be sent, and why — the panel `refusals.spec.ts`
  // has no equivalent of, and which lives inside the sheet where the old overflow check
  // could not see it.
  await showPane(page, 'board');
  await page.getByTestId('commission').first().getByRole('button').click();
  await page.getByTestId('commit-party').waitFor();
  const listed = page.getByTestId('unavailable-hero');
  await expect(listed).toHaveCount(1);
  await expect(listed).toContainText(world.hurtName);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expect(page.getByTestId('unavailable')).toBeVisible();
    await expect(listed).toContainText(world.injury);
    await expectNoHorizontalOverflow(page, `an unavailable Hero at ${String(width)}px`);
    await expectTapTargets(page, `an unavailable Hero at ${String(width)}px`);
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await expectNoHorizontalOverflow(
    page,
    `an unavailable Hero at the ${testInfo.project.name} viewport`,
  );
  await expectTapTargets(page, `an unavailable Hero at the ${testInfo.project.name} viewport`);
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'party-unavailable.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});
