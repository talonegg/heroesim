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
 * E4 in a real browser, on all three device projects: the Applicants sheet with a fresh
 * Applicant, somebody coming back, somebody the Guild cannot pay for and a Roster with no
 * room left — the four states at once, because that is where every string the sheet has is
 * on screen together and where the cards are at their longest.
 *
 * **Reaching those states without a back door.** A batch arrives on Day 10 and a returner
 * needs a Departure and a sixty-Day cooldown behind it, which is minutes of play and the
 * dice's business. So the Career is marked the way a player could mark it themselves, as
 * `hall.spec.ts` and `refusals.spec.ts` do: the app saves to slot 1, the save document —
 * which is exactly what `serialiseCareer` writes — is edited in `localStorage`, and the
 * app loads it back through its own slot picker. Nothing test-only exists in the client.
 */

const SEED = 'heroesim-e2e-applicants';
const SLOT_KEY = 'heroesim.career.1';

interface Waiting {
  /** Somebody nobody has met, whom the Guild can afford. */
  freshName: string;
  /** Somebody who was on the Roster before and walked out. */
  returnerName: string;
  /** Somebody the Guild cannot pay for. */
  dearName: string;
  dearFee: number;
  coin: number;
  rosterCap: number;
  rosterSize: number;
}

interface Wanted {
  coin: number;
  /** Set to the Roster's own size to put the Career at the cap. */
  cap?: number;
}

/** The shape of the save document this spec edits. Only the fields it touches. */
interface SaveDocument {
  day: number;
  config: { rosterCap: number; applicantLingerDays: number };
  guild: {
    coin: number;
    roster: {
      id: string;
      name: string;
      pronouns: string;
      stats: Record<string, number>;
      background: string;
      traits: { name: string; since: number }[];
      regardForGuildmaster: { value: number; reason: string; nature: string };
      regardFor: Record<string, unknown>;
      joinedOn: number;
      lastCommittedOn: number;
      regardDecayedOn: number;
      age: number;
    }[];
    formerHeroes: unknown[];
  };
  applicants: unknown[];
  nextApplicantNumber: number;
}

/**
 * Start a Career, save it, put three people at the door inside the saved document — one
 * fresh, one coming back, one dearer than the Guild can pay for — and load it back.
 */
async function loadACareerWithApplicants(page: Page, want: Wanted): Promise<Waiting> {
  await startCareer(page, SEED);

  await page.getByTestId('open-saves').click();
  await page.getByTestId('save-1').click();
  await expect(page.getByTestId('slot-1')).toContainText('Day');
  await page.getByRole('button', { name: 'Close' }).click();

  const saved = await page.evaluate((key) => localStorage.getItem(key), SLOT_KEY);
  expect(saved, 'the app should have written slot 1').not.toBeNull();
  const career = JSON.parse(saved ?? '{}') as SaveDocument;

  const model = career.guild.roster[0];
  expect(model, 'the seed should deal a Roster').toBeDefined();
  if (model === undefined) throw new Error('no Roster in the save');

  /** One Applicant, shaped exactly as `deserialiseCareer` requires. */
  const person = (
    id: string,
    name: string,
    calibre: number,
    askingFee: number,
    formerHeroId?: string,
  ): Record<string, unknown> => ({
    id,
    name,
    pronouns: 'they',
    stats: { Might: 3, Craft: 3, Nerve: 2, Guile: 2 },
    background: model.background,
    traits: model.traits.map((trait) => ({ name: trait.name, since: career.day })),
    age: 29,
    calibre,
    askingFee,
    arrivedOn: career.day,
    expiresOn: career.day + career.config.applicantLingerDays,
    ...(formerHeroId === undefined ? {} : { formerHeroId }),
  });

  const dearFee = 160;
  career.applicants = [
    person('a1', 'Nerys of Wend Water', 1, 80),
    person('h9', 'Corran the Quiet', 2, 120, 'h9'),
    person('a2', 'Orla Ratcatcher', 3, dearFee),
  ];
  career.nextApplicantNumber = 3;
  // The returner has to be somebody the Guild remembers, and somebody who chose to go.
  career.guild.formerHeroes.push({
    ...model,
    id: 'h9',
    name: 'Corran the Quiet',
    regardFor: {},
    exit: { kind: 'departure', onDay: 1, reason: 'you sent them anyway' },
  });
  career.guild.coin = want.coin;
  if (want.cap !== undefined) career.config.rosterCap = want.cap;

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
    freshName: 'Nerys of Wend Water',
    returnerName: 'Corran the Quiet',
    dearName: 'Orla Ratcatcher',
    dearFee,
    coin: want.coin,
    rosterCap: want.cap ?? career.config.rosterCap,
    rosterSize: career.guild.roster.length,
  };
}

/** The card one Applicant is offered on. */
function cardFor(page: Page, name: string) {
  return page.getByTestId('applicant').filter({ has: page.getByRole('heading', { name }) });
}

test('cues the main screen, then offers everybody at the door', async ({ page }) => {
  const world = await loadACareerWithApplicants(page, { coin: 100 });

  // The cue is on the main screen, in words and numbers, before anything is opened.
  await expect(page.getByTestId('applicants-waiting')).toContainText('waiting at the door');
  await expect(page.getByTestId('applicants-waiting')).toContainText('the first goes in');
  await expect(page.getByTestId('open-applicants')).toContainText('(3)');

  await page.getByTestId('open-applicants').click();
  await expect(page.getByTestId('applicant')).toHaveCount(3);
  await expect(page.getByTestId('applicants-coin')).toContainText('100 coin');
  await expect(page.getByTestId('applicants-coin')).toContainText(
    `${String(world.rosterSize)} of ${String(world.rosterCap)}`,
  );

  // Background and Traits first, Stats second, then the age and the fee.
  const fresh = cardFor(page, world.freshName);
  await expect(fresh.getByTestId('applicant-background')).toBeVisible();
  await expect(fresh.locator('.chips')).toBeVisible();
  await expect(fresh.locator('.stats')).toBeVisible();
  await expect(fresh.getByTestId('applicant-terms')).toContainText('asks 80 coin');
  await expect(fresh.getByTestId('applicant-terms')).toContainText('Age');

  // Calibre is never on screen, as a word, a star or a grade.
  const said = (await page.getByTestId('applicant').allTextContents()).join('\n');
  expect(said.toLowerCase()).not.toContain('calibre');
  expect(said).not.toContain('★');
  expect(said).not.toContain('*');
});

test('marks somebody coming back, in text', async ({ page }) => {
  const world = await loadACareerWithApplicants(page, { coin: 1000 });
  await page.getByTestId('open-applicants').click();

  const returner = cardFor(page, world.returnerName);
  await expect(returner.getByTestId('applicant-returning')).toContainText('Coming back');
  await expect(returner.getByTestId('applicant-returning')).toContainText('walked out');
  // And nobody else is marked.
  await expect(page.getByTestId('applicant-returning')).toHaveCount(1);
});

test('disables Accept with the reason in text, for coin and for the cap', async ({ page }) => {
  const world = await loadACareerWithApplicants(page, { coin: 100 });
  await page.getByTestId('open-applicants').click();

  // Affordable: enabled, and nothing to explain.
  await expect(page.getByTestId('accept-a1')).toBeEnabled();
  await expect(page.getByTestId('accept-a1')).toHaveAttribute('data-state', 'ready');
  await expect(cardFor(page, world.freshName).getByTestId('applicant-why')).toHaveCount(0);

  // Too dear: disabled, and the shortfall written out.
  await expect(page.getByTestId('accept-a2')).toBeDisabled();
  await expect(page.getByTestId('accept-a2')).toHaveAttribute('data-state', 'refused');
  const why = cardFor(page, world.dearName).getByTestId('applicant-why');
  await expect(why).toContainText('cannot pay');
  await expect(why).toContainText(`${String(world.dearFee)} coin`);
  await expect(why).toContainText(`${String(world.dearFee - world.coin)} short`);
  // Sending somebody away is still open: it costs nothing.
  await expect(page.getByTestId('decline-a2')).toBeEnabled();

  // A Roster with no room: every Accept refused, and the reason names the cap.
  const full = await loadACareerWithApplicants(page, { coin: 10_000, cap: 4 });
  await page.getByTestId('open-applicants').click();
  for (const id of ['a1', 'h9', 'a2']) {
    await expect(page.getByTestId(`accept-${id}`)).toBeDisabled();
  }
  const capWhy = cardFor(page, full.freshName).getByTestId('applicant-why');
  await expect(capWhy).toContainText('Roster is full');
  await expect(capWhy).toContainText(String(full.rosterCap));
  await expect(capWhy).toContainText('somebody leaves');
});

test('takes somebody on, and sends somebody away', async ({ page }) => {
  const world = await loadACareerWithApplicants(page, { coin: 1000 });
  await page.getByTestId('open-applicants').click();

  await page.getByTestId('accept-a1').click();
  await expect(page.getByTestId('applicant')).toHaveCount(2);
  await expect(page.getByTestId('applicants-coin')).toContainText('920 coin');

  await page.getByTestId('decline-a2').click();
  await expect(page.getByTestId('applicant')).toHaveCount(1);
  await expect(page.getByTestId('applicants-coin')).toContainText('920 coin');
  await page.getByRole('button', { name: 'Close' }).click();

  // The Roster gained them, and the report says both things once each.
  await showPane(page, 'roster');
  await expect(page.getByTestId('pane-roster')).toContainText(world.freshName);

  await showPane(page, 'report');
  const report = (await page.getByTestId('report-log').textContent()) ?? '';
  expect(report).toContain(`${world.freshName} joins the Roster`);
  expect(report).toContain('80 coin');
  expect(report).toContain(`You send ${world.dearName} away`);
});

test('the Applicants sheet fits and can be tapped at every width', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  // The hardest state: one affordable, one coming back, one the Guild cannot pay for —
  // every string the sheet has, on screen at once, on the longest cards it ever draws.
  const world = await loadACareerWithApplicants(page, { coin: 100 });
  await page.getByTestId('open-applicants').click();
  await expect(page.getByTestId('applicant')).toHaveCount(3);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expect(page.getByTestId('applicant')).toHaveCount(3);
    await expectNoHorizontalOverflow(page, `the Applicants at ${String(width)}px`);
    await expectTapTargets(page, `the Applicants at ${String(width)}px`);
    // A disabled Accept is still aimed at, so it is held to the same 40×40 floor.
    await expectTapTarget(page.getByTestId('accept-a2'), `a refused offer at ${String(width)}px`);
    // And the reason, and the mark on the returner, both survive the narrowest layout.
    await expect(cardFor(page, world.dearName).getByTestId('applicant-why')).toContainText('short');
    await expect(
      cardFor(page, world.returnerName).getByTestId('applicant-returning'),
    ).toContainText('Coming back');
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await expectNoHorizontalOverflow(page, `the Applicants at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `the Applicants at the ${testInfo.project.name} viewport`);
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'applicants.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});

test('a full Roster fits and explains itself at every width', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  const world = await loadACareerWithApplicants(page, { coin: 10_000, cap: 4 });

  // Finding C2: every offer here is refused for the same reason (the cap), so the cue on
  // the main screen must say plainly that none can be taken on, and name the cap — not
  // nag "the first goes in N Days" about people nobody can take on.
  const cue = page.getByTestId('applicants-waiting');
  await expect(cue).toContainText('none can be taken on');
  await expect(cue).toContainText(`Roster is full at ${String(world.rosterCap)}`);
  await expect(cue).not.toContainText('the first goes in');

  await page.getByTestId('open-applicants').click();
  await expect(page.getByTestId('applicant')).toHaveCount(3);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expect(page.getByTestId('applicant-why')).toHaveCount(3);
    await expectNoHorizontalOverflow(page, `a full Roster at ${String(width)}px`);
    await expectTapTargets(page, `a full Roster at ${String(width)}px`);
    await expect(cardFor(page, world.freshName).getByTestId('applicant-why')).toContainText(
      'Roster is full',
    );
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await expectNoHorizontalOverflow(page, `a full Roster at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `a full Roster at the ${testInfo.project.name} viewport`);
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'applicants-full.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});

test('says plainly that none can be taken on for want of coin, when the Guild cannot afford any of them', async ({
  page,
}) => {
  // Every offer refused for the same reason again, this time coin rather than the cap
  // (finding C2): the cue must name the reason that is actually true of all of them,
  // never a rule worked out in the front end.
  const world = await loadACareerWithApplicants(page, { coin: 1 });

  const cue = page.getByTestId('applicants-waiting');
  await expect(cue).toContainText('none can be taken on');
  await expect(cue).toContainText('cannot pay any of them yet');
  await expect(cue).not.toContainText('the first goes in');
  await expect(page.getByTestId('open-applicants')).toContainText('(3)');

  // The cue itself, on the main screen, wraps rather than overflows at the narrowest
  // width this suite checks — before the sheet is ever opened.
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(cue).toContainText('none can be taken on');
  await expectNoHorizontalOverflow(page, 'the unaffordable cue at 320px');
  await expectTapTargets(page, 'the unaffordable cue at 320px');

  // The view stays reachable: opening it still shows everybody, each with their own
  // reason, and the cards keep their own per-Applicant wording untouched by the cue.
  await page.getByTestId('open-applicants').click();
  await expect(page.getByTestId('applicant')).toHaveCount(3);
  await expect(cardFor(page, world.freshName).getByTestId('applicant-why')).toContainText(
    'cannot pay',
  );
});
