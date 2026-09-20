import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectTapTarget,
  expectTapTargets,
  startCareer,
  VERIFICATION_DIR,
  WIDTHS,
} from './helpers';

/**
 * E6 in a real browser, on all three device projects: two Parties waiting on word at once,
 * one with a paid option the Guild can afford and one with a paid option it cannot — so
 * every string the pane has is on screen together. The default is marked in words, the
 * countdown is in words, the option the Guild cannot pay for is disabled **with the reason
 * written out**, and Advance is refused while any of it stands.
 *
 * **Reaching that state without a back door.** A Party stops one time in five, and only
 * after its first Beat; waiting for one in a browser would take a minute of clicking. So
 * the Career is marked the way a player could mark it themselves, as `rivals.spec.ts`,
 * `applicants.spec.ts` and `hall.spec.ts` all do: the app saves to slot 1, the save
 * document — exactly what `serialiseCareer` writes — is edited in `localStorage`, and the
 * app loads it back through its own slot picker. Nothing test-only exists in the client.
 */

const SEED = 'heroesim-e2e-word';
const SLOT_KEY = 'heroesim.career.1';

/**
 * Bring the Word pane to the front. It stands where the Report does, so the bottom bar's
 * Report button is what reaches it under 600px — which is the point of the badge on it.
 */
async function showWord(page: Page): Promise<void> {
  const button = page.getByTestId('bar-report');
  if (await button.isVisible()) await button.click();
  await expect(page.getByTestId('pane-word')).toBeVisible();
}

/** The shape of the save document this spec writes. Only the fields it touches. */
interface SaveDocument {
  day: number;
  config: { wordTimeoutDays: number };
  guild: { coin: number; roster: { id: string; name: string }[] };
  patrons: { id: string; sphere: string }[];
  board: {
    id: string;
    patronId: string;
    title: string;
    fee: number;
    difficulty: number;
    spanDays: number;
    beatCount: number;
    tags: string[];
    postedOn: number;
    expiresOn: number;
  }[];
  parties: unknown[];
}

interface Waiting {
  /** The Party whose paid option the Guild can afford. */
  cheapPartyId: string;
  cheapName: string;
  cheapTitle: string;
  /** The Party whose paid option it cannot. */
  dearPartyId: string;
  dearName: string;
  dearTitle: string;
  coin: number;
  daysLeft: number;
}

/**
 * Start a Career, save it, put two Parties out on work with word already sent, and load it
 * back. The two Decisions are the shipped ones whose `sendCoin` costs differ — forty and
 * sixty — so one coin balance makes one affordable and the other not.
 */
async function loadACareerWaitingOnWord(page: Page, coin: number): Promise<Waiting> {
  await startCareer(page, SEED);

  await page.getByTestId('open-saves').click();
  await page.getByTestId('save-1').click();
  await expect(page.getByTestId('slot-1')).toContainText('Day');
  await page.getByRole('button', { name: 'Close' }).click();

  const saved = await page.evaluate((key) => localStorage.getItem(key), SLOT_KEY);
  expect(saved, 'the app should have written slot 1').not.toBeNull();
  const career = JSON.parse(saved ?? '{}') as SaveDocument;

  // Each Decision is put on a Commission it could really have fired on. The tags are the
  // ones its own `[conditions]` waits for, kept here rather than imported so this stays a
  // browser test — and asserted against the Board, so the spec fails loudly rather than
  // quietly staging a pairing the rules would never produce. Before DL-24 §A3 this took
  // the first two Commissions whatever they were, and the evidence screenshots showed a
  // guide stopping at a ford on a mine-terms negotiation.
  const WAITING_ON: { decisionId: string; tags: readonly string[] }[] = [
    { decisionId: 'the-guide-wants-more', tags: ['escort'] },
    { decisionId: 'somebody-is-flagging', tags: ['escort', 'wilds', 'hunt', 'recover'] },
  ];
  const taken = new Set<string>();
  const chosen = WAITING_ON.map((entry) => {
    const fits = career.board.find(
      (commission) =>
        !taken.has(commission.id) && commission.tags.some((tag) => entry.tags.includes(tag)),
    );
    expect(fits, `the seed should deal work "${entry.decisionId}" could stop`).toBeDefined();
    if (fits === undefined) throw new Error(`no work on the Board fits ${entry.decisionId}`);
    taken.add(fits.id);
    return fits;
  });
  const [first, second] = chosen;
  const [one, two] = career.guild.roster;
  expect(one, 'the seed should deal two Heroes').toBeDefined();
  expect(two).toBeDefined();
  if (first === undefined || second === undefined || one === undefined || two === undefined) {
    throw new Error('the seed did not deal enough to work with');
  }

  const sphereOf = (patronId: string): string =>
    career.patrons.find((patron) => patron.id === patronId)?.sphere ?? '';

  /** A Party one Beat into its work, having just sent word. */
  const sent = (
    id: string,
    commission: SaveDocument['board'][number],
    heroId: string,
    decisionId: string,
    optionIds: string[],
  ): unknown => ({
    id,
    commissionId: commission.id,
    commission,
    heroIds: [heroId],
    backing: 1,
    departedOn: career.day,
    returnsOn: career.day + 8,
    beatDays: [career.day + 1, career.day + 4, career.day + 7],
    beatsResolved: ['success'],
    vignettesUsed: [],
    score: 1,
    decisionUsed: true,
    dcDelta: 0,
    pendingWord: {
      decisionId,
      beatIndex: 2,
      askedOn: career.day,
      timesOutOn: career.day + career.config.wordTimeoutDays,
      slots: { heroId, patronId: commission.patronId, sphereId: sphereOf(commission.patronId) },
      optionIds,
    },
  });

  const [guide, flagging] = WAITING_ON.map((entry) => entry.decisionId);
  career.parties = [
    sent('p1.1', first, one.id, guide ?? '', ['press-on', 'send-coin', 'turn-back']),
    sent('p1.2', second, two.id, flagging ?? '', ['press-on', 'send-coin', 'turn-back']),
  ];
  // The two Commissions have left the Board with their Parties.
  career.board = career.board.filter(
    (commission) => commission.id !== first.id && commission.id !== second.id,
  );
  // Forty is within reach and sixty is not, so both states are on screen at once.
  career.guild.coin = coin;

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
    cheapPartyId: 'p1.1',
    cheapName: one.name,
    cheapTitle: first.title,
    dearPartyId: 'p1.2',
    dearName: two.name,
    dearTitle: second.title,
    coin,
    daysLeft: career.config.wordTimeoutDays,
  };
}

test('a Party waiting on word takes over the Report and says everything it is asking', async ({
  page,
}) => {
  const world = await loadACareerWaitingOnWord(page, 50);
  await showWord(page);

  // It is where the Report was, and the bar says so in words and a number.
  await expect(page.getByTestId('pane-word')).toBeVisible();
  await expect(page.getByTestId('pane-report')).toHaveCount(0);
  await expect(page.getByTestId('bar-report')).toContainText('Word (2)');

  // Who is waiting, on what, and what they are asking.
  const cheap = page.getByTestId(`word-${world.cheapPartyId}`);
  await expect(cheap.getByTestId('word-title')).toContainText(world.cheapName);
  await expect(cheap.getByTestId('word-title')).toContainText(world.cheapTitle);
  await expect(cheap.getByTestId('word-prompt')).not.toBeEmpty();
  expect(await cheap.getByTestId('word-prompt').textContent()).not.toContain('{');

  // The countdown and the coin, in words and numbers.
  await expect(cheap.getByTestId('word-clock')).toContainText('act on their own judgement in');
  await expect(cheap.getByTestId('word-clock')).toContainText(`${String(world.daysLeft)}`);
  await expect(cheap.getByTestId('word-clock')).toContainText(`${String(world.coin)} coin`);

  // The paid option the Guild can afford: on its own control, with its cost.
  const affordable = page.getByTestId(`answer-${world.cheapPartyId}-send-coin`);
  await expect(affordable).toBeEnabled();
  await expect(affordable).toContainText('40 coin');

  // The paid option it cannot: still on screen, still carrying its cost, disabled, with
  // the reason written out beside it rather than implied by the greying.
  const dear = page.getByTestId(`answer-${world.dearPartyId}-send-coin`);
  await expect(dear).toBeVisible();
  await expect(dear).toBeDisabled();
  await expect(dear).toContainText('60 coin');
  await expect(page.getByTestId('cannot-send-coin').first()).toContainText('coin');

  // The default is marked in words, once per Party.
  await expect(page.getByText('With no word from you, this is what they will do.')).toHaveCount(2);

  // And Advance cannot pass any of it silently. The header said "the Days will not run
  // until you answer" until DL-24 §A1, which was true of this client and false of the
  // engine; Advance is still held, and the Word pane now carries the way to let them run.
  await expect(page.getByTestId('advance')).toBeDisabled();
  await expect(page.getByTestId('word-waiting')).toContainText(
    'Advance is held until you answer, or leave it to them',
  );
});

test('answering puts the Party back to work and says so in the Report', async ({ page }) => {
  const world = await loadACareerWaitingOnWord(page, 50);
  await showWord(page);

  await page.getByTestId(`answer-${world.cheapPartyId}-turn-back`).click();
  // One Party answered; the other is still waiting, and is answered independently.
  await expect(page.getByTestId(`word-${world.cheapPartyId}`)).toHaveCount(0);
  await expect(page.getByTestId(`word-${world.dearPartyId}`)).toBeVisible();
  await expect(page.getByTestId('bar-report')).toContainText('Word (1)');

  await page.getByTestId(`answer-${world.dearPartyId}-press-on`).click();
  // With nobody waiting, the Report comes back — carrying what was said to both of them.
  await expect(page.getByTestId('pane-word')).toHaveCount(0);
  await expect(page.getByTestId('pane-report')).toBeVisible();
  await expect(page.getByTestId('advance')).toBeEnabled();

  const answers = page.getByTestId('para-answer');
  await expect(answers).toHaveCount(2);
  const report = (await page.getByTestId('report-log').textContent()) ?? '';
  expect(report).toContain('Word goes back up the road.');
  expect(report).toContain('is called off.');
  expect(report).not.toContain('{');
});

test('the word pane fits and can be tapped at every width', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  const world = await loadACareerWaitingOnWord(page, 50);
  await showWord(page);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expect(page.getByTestId('word-prompt')).toHaveCount(2);
    await expectNoHorizontalOverflow(page, `a Party waiting at ${String(width)}px`);
    await expectTapTargets(page, `a Party waiting at ${String(width)}px`);
    // A control the player cannot press is still one they will aim at.
    await expectTapTarget(
      page.getByTestId(`answer-${world.dearPartyId}-send-coin`),
      `a refused option at ${String(width)}px`,
    );
    // The reason and the countdown both survive the narrowest layout.
    await expect(page.getByTestId('cannot-send-coin').first()).toContainText('coin');
    await expect(page.getByTestId('word-clock').first()).toContainText('own judgement in');
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await expectNoHorizontalOverflow(page, `a Party waiting at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `a Party waiting at the ${testInfo.project.name} viewport`);
  // At 600-1023px the pane sits under the Board and the Roster, so bring it into view
  // before the evidence is taken: a screenshot of the header is not evidence of the pane.
  await page.getByTestId('pane-word').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'word.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});

test('the bar badge is on screen where the bar is', async ({ page }, testInfo) => {
  await loadACareerWaitingOnWord(page, 50);
  // Under 600px the bottom bar is the only way between panes, so the badge is the cue.
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.getByTestId('bar-report')).toContainText('Word (2)');
  await expectNoHorizontalOverflow(page, 'the bar badge at 360px');
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'word-badge.png'),
  });
});

/**
 * Letting the Days run from the browser (DL-24 §A1). The engine has always passed Days
 * with an awaiting Party frozen until its `timesOutOn` — that is what keeps a Career from
 * deadlocking (DL-23 §3) — and until now the client had no way to do it, so a player who
 * wanted the default still had to click it and the header said something that was not
 * true of the engine. Two taps, as E2's insistence has taken since it was built.
 */

/** Tap the quiet control twice, which is what lets the Days run. */
async function leaveItToThem(page: Page): Promise<void> {
  const leave = page.getByTestId('leave-it');
  await leave.click();
  await expect(page.getByTestId('leave-it-explained')).toBeVisible();
  await leave.click();
}

test('two taps let the Days run, and the Party then decides for itself', async ({ page }) => {
  const world = await loadACareerWaitingOnWord(page, 50);
  await showWord(page);

  // The main Advance is still refused, and the header says what is true of this client.
  await expect(page.getByTestId('advance')).toBeDisabled();
  await expect(page.getByTestId('word-waiting')).toContainText(
    'Advance is held until you answer, or leave it to them',
  );

  // The first tap only explains: who stands still, until when, and what they will do.
  await expect(page.getByTestId('leave-it-explained')).toHaveCount(0);
  await page.getByTestId('leave-it').click();
  const explained = page.getByTestId('leave-it-explained');
  await expect(explained).toBeVisible();
  await expect(explained).toContainText(/stands? still until/);
  await expect(explained).toContainText(world.cheapName);
  await expect(explained).toContainText('Tap again to let the Days run.');
  await expect(page.getByTestId('leave-it')).toContainText('Yes — let the Days run');
  // Nothing has happened yet: both Parties are still waiting.
  await expect(page.getByTestId('bar-report')).toContainText('Word (2)');

  // The second tap runs the Days. It may take more than one stretch to reach the timeout,
  // because a stretch stops at whatever else wants the player first.
  await page.getByTestId('leave-it').click();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if ((await page.getByTestId('pane-word').count()) === 0) break;
    if ((await page.getByTestId('para-answer').count()) > 0) break;
    await leaveItToThem(page);
  }

  // The word was taken by default, and the Report says so in as many words.
  const report = (await page.getByTestId('report-log').textContent()) ?? '';
  expect(report).toContain('No word went back in time, and they did what they thought best.');
  expect(report).not.toContain('{');
  // And with nobody left waiting, Advance is the player's again.
  await expect(page.getByTestId('pane-word')).toHaveCount(0);
  await expect(page.getByTestId('advance')).toBeEnabled();
});

test('the quiet control fits and can be tapped at every width', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  await loadACareerWaitingOnWord(page, 50);
  await showWord(page);
  await page.getByTestId('leave-it').click();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expect(page.getByTestId('leave-it')).toBeVisible();
    await expect(page.getByTestId('leave-it-explained')).toBeVisible();
    await expectNoHorizontalOverflow(page, `leaving it to them at ${String(width)}px`);
    await expectTapTargets(page, `leaving it to them at ${String(width)}px`);
    await expectTapTarget(
      page.getByTestId('leave-it'),
      `the quiet control at ${String(width)}px`,
    );
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await expectNoHorizontalOverflow(page, `leaving it to them at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `leaving it to them at the ${testInfo.project.name} viewport`);
  await page.getByTestId('leave-it').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'word-leave-it.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});
