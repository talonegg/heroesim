/**
 * The lines `narrate` writes itself, as opposed to the ones it fills in from a Vignette.
 * Tone: plain, specific, under-adorned, British English. No emoji and no exclamation
 * marks — the prose earns its effect from what happened, not from punctuation.
 */

import {
  dayOfYear,
  STATS,
  yearOf,
  type ApplicantOffer,
  type Career,
  type EngineErrorCode,
  type GameConfig,
  type HallImprovement,
  type HeroExitKind,
  type Reckoning,
  type TurnBackOutcome,
} from '@heroesim/engine';

/**
 * A whole number as the player reads it: grouped in threes, "1,140". Written out by hand
 * rather than with `toLocaleString`, because a locale would put a space or a point in it
 * depending on where the machine thinks it is, and the two front ends must print one
 * number one way (E7-S1).
 *
 * This is the **one** number formatter (DL-27 §1). It was `cli/src/screen.ts`'s until the
 * E8-S6 build found three conventions on one screen — the terminal's grouped header, this
 * package's ungrouped sentences ("4912 coin remains") and the browser's ungrouped label
 * ("Coin 575") — and shared prose is `narrate`'s, so it moved here and the terminal
 * re-exports it.
 */
export function groupDigits(amount: number): string {
  const whole = Math.trunc(Math.abs(amount));
  const digits = String(whole);
  let out = '';
  for (let at = 0; at < digits.length; at += 1) {
    if (at > 0 && (digits.length - at) % 3 === 0) out += ',';
    out += digits[at];
  }
  return amount < 0 ? `-${out}` : out;
}

/**
 * "1,140 coin". Coin is grouped and **never** abbreviated (E7-S1, CLAUDE.md conventions),
 * in every sentence this package writes and in both front ends' own figures.
 */
export function coin(amount: number): string {
  return `${groupDigits(amount)} coin`;
}

/** What the Hall's three improvements are called in prose. */
export function hallName(improvement: HallImprovement): string {
  switch (improvement) {
    case 'infirmary':
      return 'an infirmary';
    case 'trainingYard':
      return 'a training yard';
    case 'quarters':
      return 'proper quarters';
    default: {
      const unreachable: never = improvement;
      return unreachable;
    }
  }
}

/** "Brenna", "Brenna and Corin", "Brenna, Corin and Ilsa". No Oxford comma. */
export function joinNames(names: readonly string[]): string {
  const last = names[names.length - 1];
  if (last === undefined) return 'nobody';
  if (names.length === 1) return last;
  return `${names.slice(0, -1).join(', ')} and ${last}`;
}

/** "1 Commission" / "3 Commissions". Coin is never counted this way; it is never plural. */
export function count(amount: number, singular: string, plural: string): string {
  return `${amount} ${amount === 1 ? singular : plural}`;
}

/**
 * The four words a Commission's difficulty is reported in, easiest first (E7, DL-25 §5).
 * The two front ends used to band the same engine number in two different vocabularies —
 * 'easy/fair/hard/grim' in the terminal and 'Gentle/Testing/Grim' in the browser — which
 * is presentation wording rather than a restated rule, and DL-18 left it for E7 to settle.
 * These are the words, and they live here because `narrate` is where shared words live.
 */
export const DIFFICULTY_BANDS = ['easy', 'fair', 'hard', 'grim'] as const;

/**
 * Which band a Commission's difficulty falls in, scaled across the range this Career's
 * own config allows, so a Career played at a different `difficultyMin`/`difficultyMax`
 * still reads across the whole vocabulary.
 *
 * @param difficulty the Commission's own difficulty
 * @param config the Career's config, for the range it is scaled against
 */
export function difficultyWord(difficulty: number, config: GameConfig): string {
  const span = config.difficultyMax - config.difficultyMin;
  // A range of a single point has no bands in it; saying "fair" invents nothing.
  if (span <= 0) return 'fair';
  const share = (difficulty - config.difficultyMin) / span;
  const at = Math.min(DIFFICULTY_BANDS.length - 1, Math.max(0, Math.floor(share * 4)));
  return DIFFICULTY_BANDS[at] ?? 'fair';
}

/**
 * What Standing is and is not, for the footer under the League. **Word for word in the
 * terminal and in the browser** (DL-22), which is why it lives here rather than in a copy
 * in each front end (DL-25 §15). Naming the mechanism in a footer about Standing is within
 * E4's rule, which forbids showing calibre as a star, a grade or a number *for a person*.
 */
export const STANDING_EXPLAINED =
  'Standing is the mean of what your Patrons think of the Guild, scaled. It is not a score ' +
  'and nothing is spent on it: the only way to climb is to earn their Regard. It buys one ' +
  'thing — the calibre of the people who come to your door.';

/**
 * What calling a Commission off would pay, in words, said **before** the option is chosen
 * (DL-24 §A2b). Every number in it is the engine's own `turnBackOutcome`; nothing here
 * decides what a partial share of a fee is worth, and coin is never abbreviated.
 */
export function turnBackSentence(outcome: TurnBackOutcome): string {
  return (
    `Calling them home pays ${coin(outcome.feePaid)} of the ${groupDigits(outcome.fullFee)} the ` +
    `work is worth, for ${outcome.beatsResolved} of ${outcome.beatCount} Beats done.`
  );
}

/**
 * The line that marks a Hero another Guild could take, **in words** — the line at which
 * Regard stops defending a Roster (DL-22 §2). Never colour alone, and never a number
 * worked out in a front end: `retaliationRisks` decides who is on the list and which
 * Guilds are minded to try, and this only puts that answer into a sentence.
 *
 * @param guildNames the Guilds minded to try. Empty means takeable with nobody trying.
 */
export function atRiskSentence(guildNames: readonly string[]): string {
  if (guildNames.length === 0) {
    return 'Another Guild could take them, though none is minded to just now.';
  }
  return (
    `Another Guild could take them. ${joinNames(guildNames)} ` +
    `${guildNames.length === 1 ? 'is' : 'are'} minded to.`
  );
}

/**
 * How a Hero's going is said, in the Guild's own words rather than the engine's token
 * (E7-S5). Both front ends held this switch, word for word, which is the class of copy
 * DL-25 §15 and DL-27 §2 moved here: two copies of one sentence drift the first time one
 * of them is edited. A kind the engine grows and this has not been taught yet is said in
 * words too, and never printed as `hero.exit.kind`.
 */
export function exitWords(kind: HeroExitKind): string {
  switch (kind) {
    case 'departure':
      return 'walked out';
    case 'death':
      return 'did not come back';
    case 'retirement':
      return 'reached the end of a working life';
    default: {
      const unreachable: never = kind;
      void unreachable;
      return 'left the Guild';
    }
  }
}

/**
 * What was last said about a Hero's going, where it says more than the going already did.
 *
 * A Retirement's reason on the Career **is** the words above — the engine writes
 * `reached the end of a working life` into `hero.exit.reason` — so both front ends read
 * "reached the end of a working life, Year 1, Day 20: reached the end of a working life".
 * A Departure's reason is the Hero's own, and says something the exit words do not.
 *
 * @returns the reason, or `undefined` where it merely repeats the exit words
 */
export function exitReason(kind: HeroExitKind, reason: string | undefined): string | undefined {
  if (reason === undefined) return undefined;
  return reason.trim() === exitWords(kind) ? undefined : reason;
}

/**
 * Why nobody at the door can be taken on, where one reason is true of all of them
 * (E4-S2, finding C2). Both front ends held this, word for word.
 *
 * `undefined` where the offers disagree — one place short, another purse short — because
 * the cue that carries it already says "none can be taken on", and the generic reason it
 * used to fall back to made both front ends read "none can be taken on: none can be taken
 * on just now". Nothing here is a rule: `applicantOffers` decides each refusal.
 *
 * @param offers every offer waiting at the door
 * @param rosterCap `config.rosterCap`, for the one reason that carries a number
 */
export function noneCanBeTakenReason(
  offers: readonly ApplicantOffer[],
  rosterCap: number,
): string | undefined {
  const codes = new Set(offers.map((offer) => offer.refusal?.code));
  if (codes.size !== 1) return undefined;
  const [code] = codes;
  if (code === 'RosterFull') return `the Roster is full at ${String(rosterCap)}`;
  if (code === 'InsufficientCoin') return 'the Guild cannot pay any of them yet';
  return undefined;
}

/**
 * The mark against an Applicant who was on the Roster before and walked out (E4-S4).
 * Word for word in the terminal and in the browser, which is why it lives here rather
 * than in a copy in each of them (DL-25 §15, extended by DL-27 §2).
 */
export const returnerSentence =
  'Coming back: they were on your Roster before, and walked out.';

/**
 * What a Patron at the posting floor is doing, said explicitly because silence is
 * information (E7-S3). Whether a Patron posts is the engine's own `postingPatrons`;
 * nothing about where the floor is is decided here or in either front end.
 */
export const postingNothingSentence =
  'They are posting nothing at all, and will until their Regard for the Guild comes back up.';

/**
 * A Guild you have wronged, and whether they can actually do anything about it: one whose
 * own Roster is full has nowhere to put anybody and is harmless until somebody leaves it
 * (finding C7, DL-22 §2). The caller passes the engine's own `hasRoomForAnother`; nothing
 * here restates the predicate.
 *
 * The two front ends had drifted — the terminal joined the two clauses with a comma and
 * the browser with a full stop — so DL-27 §2 picks the terminal's, it being the reference
 * front end (DL-01).
 *
 * @param hasRoom whether their own Roster has room for anybody else
 */
export function wrongedRivalSentence(hasRoom: boolean): string {
  return (
    'You have wronged them, and they are taking more of the work you leave on the Board. ' +
    (hasRoom
      ? 'They have room to take somebody off your Roster.'
      : 'Their own Roster is full, so they can take nobody off yours just now.')
  );
}

/**
 * The Day as the player reads it: "Year 3, Day 47", counting from Year 1, Day 1. The Year
 * and the Day within it are the engine's own `yearOf` and `dayOfYear` (DL-18), so there is
 * one definition of a Year rather than a second copy of the arithmetic here.
 *
 * @param day the Day number on the Career, starting at 1
 * @param career the Career, for `config.daysPerYear`
 */
export function formatDay(day: number, career: Career): string {
  const perYear = career.config.daysPerYear;
  if (!Number.isFinite(perYear) || perYear <= 0) return `Day ${day}`;
  return `Year ${yearOf(day, career.config)}, Day ${dayOfYear(day, career.config)}`;
}

/**
 * One sentence for a rejected engine call. The switch is exhaustive, so a new
 * `EngineErrorCode` fails the type check here until somebody writes its sentence.
 *
 * @param ctx optional specifics — `commission`, `hero` or `detail` — used where they help
 */
export function errorSentence(
  code: EngineErrorCode,
  ctx?: Record<string, string | number>,
): string {
  const commission = ctx?.['commission'];
  const hero = ctx?.['hero'];
  const detail = ctx?.['detail'];
  switch (code) {
    case 'CommissionNotOnBoard':
      return commission === undefined
        ? 'That Commission is not on the Board any more.'
        : `"${String(commission)}" is not on the Board any more.`;
    case 'HeroNotAvailable':
      return hero === undefined
        ? 'That Hero cannot go: they are away on a Commission, or not on the Roster.'
        : `${String(hero)} cannot go: they are away on a Commission, or not on the Roster.`;
    case 'EmptyParty':
      return 'A Party needs at least one Hero in it.';
    case 'HeroRefused':
      return hero === undefined
        ? 'Somebody you named will not take this work. Insist, and it will cost you their Regard.'
        : `${String(hero)} will not take this work. Insist, and it will cost you their Regard.`;
    case 'CareerEnded':
      return 'The Career has ended, so there is nothing further to decide.';
    case 'InsufficientCoin':
      return detail === undefined
        ? 'The Guild cannot pay for that yet. Finish more work first.'
        : `The Guild cannot pay for that yet: it costs ${String(detail)}. Finish more work first.`;
    case 'AlreadyImproved':
      return 'The Hall already has that, and each improvement is bought once.';
    case 'NoSuchApplicant':
      return hero === undefined
        ? 'Nobody by that name is waiting any more.'
        : `${String(hero)} is not waiting any more.`;
    case 'RosterFull':
      return detail === undefined
        ? 'The Roster is full. Nobody else can be taken on until somebody leaves.'
        : `The Roster is full at ${String(detail)}. Nobody else can be taken on until ` +
          'somebody leaves.';
    case 'NoSuchRival':
      return 'There is no such Guild to deal with.';
    case 'NoSuchHero':
      return hero === undefined
        ? 'Nobody of that name is on that Roster any more.'
        : `${String(hero)} is not on that Roster any more.`;
    case 'NoSuchParty':
      return 'No Party of yours is out on that work.';
    case 'NotAwaitingWord':
      return 'That Party has sent no word, so there is nothing to answer.';
    case 'NoSuchOption':
      return detail === undefined
        ? 'That is not one of the things they are asking about.'
        : `"${String(detail)}" is not one of the things they are asking about.`;
    case 'InternalError':
      return detail === undefined
        ? 'The engine reached a state it did not expect. Nothing was changed.'
        : `The engine reached a state it did not expect (${String(detail)}). Nothing was changed.`;
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

/**
 * What the Guild became, a line at a time. The caller decides how to lay them out; the
 * CLI prints one per line and the web front end puts them in a list.
 */
export function reckoningLines(reckoning: Reckoning, career: Career): string[] {
  const { guildmaster } = career.guild;
  const lines: string[] = [
    `${career.guild.name}, under ${guildmaster.name}, after ${count(reckoning.years, 'year', 'years')}.`,
    `Commissions: ${reckoning.commissionsCompleted} finished, ${reckoning.commissionsFailed} not.`,
    // Retirement is reported apart from the losses, because it is not one (E3-S3).
    `Heroes: ${reckoning.heroesOnRoster} on the Roster at the end, ` +
      `${reckoning.heroesLost} lost along the way, ${reckoning.heroesRetired} retired.`,
    // Recruitment gets a line of its own rather than a fourth clause on the one above:
    // it is what the Guild built rather than what it lost, and it reads that way (E4).
    `Taken on: ${count(reckoning.heroesRecruited, 'Applicant', 'Applicants')}.`,
    // Somebody another Guild took is not dead and has not walked out: they are working
    // down the road. So they are reported apart from the losses, exactly as Retirement
    // is — which is what E5-S4's acceptance box means by "the reckoning reports it", and
    // what `Reckoning.heroesPoachedFromUs` was carrying with nowhere to be read (E5-S4).
    `Taken by another Guild: ${count(reckoning.heroesPoachedFromUs, 'Hero', 'Heroes')}.`,
    // `ledger.heroesInjured` counts **Injuries** and not Heroes — some 470 of them over a
    // twenty-year Career at a Roster of eight — so it is named as what it counts and never
    // as a number of people, which is the question DL-17 §6 and DL-24 §13 left for E7
    // (DL-25 §4). The ledger is read off the Career this function already has in hand, so
    // `Reckoning` gains no field for it.
    `Harm: ${count(career.ledger.heroesInjured, 'Injury', 'Injuries')} and ` +
      `${count(career.ledger.heroesScarred, 'Scar', 'Scars')} between them.`,
  ];

  const favourite = reckoning.favouritePatron;
  if (favourite !== undefined) {
    lines.push(
      `Most work bought by ${favourite.name}: ` +
        `${count(favourite.count, 'Commission', 'Commissions')} finished for them.`,
    );
  } else {
    lines.push('No Patron bought more finished work than any other.');
  }

  lines.push(
    `Coin: ${groupDigits(reckoning.peakCoin)} at its highest, ` +
      `${groupDigits(reckoning.finalCoin)} at the end.`,
  );
  lines.push(`Standing: ${reckoning.standing}.`);

  const { start, end } = reckoning.guildmasterStats;
  lines.push(
    `The Guildmaster's Stats: ${STATS.map((stat) =>
      start[stat] === end[stat]
        ? `${stat} ${end[stat]}`
        : `${stat} ${start[stat]} to ${end[stat]}`,
    ).join(', ')}.`,
  );

  return lines;
}
