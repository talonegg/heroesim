/**
 * Everything the panes need to read off a Career, in one place (E8-S2: "nothing in
 * `web/` computes a rule"). The engine owns the rules; every function here is either a
 * direct read off the Career or a thin pass-through to an engine selector — `upkeepDue`,
 * the two countdowns and `unavailableAmong` all live in `@heroesim/engine` (DL-18), and
 * nothing here restates them. Every number comes from a named config field — never a
 * literal (CLAUDE.md invariant 8).
 */

import {
  applicantOffers,
  availableHeroes,
  commissionById,
  daysUntilBoardRefresh,
  daysUntilUpkeep as engineDaysUntilUpkeep,
  hallCost,
  HALL_IMPROVEMENTS,
  hasRoomForAnother,
  injuredHeroes,
  injuredUntil,
  isInjured,
  isInjuryTrait as engineIsInjuryTrait,
  league,
  postingPatrons,
  projectedReturn,
  proposeParty,
  retaliationRisks,
  rivalOffers,
  standing,
  STATS,
  unavailableAmong,
  upkeepDue as engineUpkeepDue,
  wordOffers,
  type Applicant,
  type Career,
  type Commission,
  type Content,
  type HallImprovement,
  type Hero,
  type HeroTrait,
  type LeagueRow,
  type MoveRefusal,
  type Party,
  type Patron,
  type Refusal,
  type Rival,
  type RivalHero,
  type Stat,
  type TurnBackOutcome,
  type Unavailable,
  type UnavailableReason,
  type WordOption,
} from '@heroesim/engine';
import { content } from '../content';
import {
  atRiskSentence,
  coin,
  difficultyWord,
  errorSentence,
  exitReason,
  exitWords,
  formatDay,
  groupDigits,
  noneCanBeTakenReason,
  wordProse,
  STANDING_EXPLAINED as narratedStandingExplained,
  turnBackSentence as narratedTurnBackSentence,
} from '../words';

export {
  availableHeroes,
  commissionById,
  hallCost,
  HALL_IMPROVEMENTS,
  injuredHeroes,
  injuredUntil,
  isInjured,
  projectedReturn,
  standing,
  STATS,
  unavailableAmong,
};
export type {
  Applicant,
  HallImprovement,
  LeagueRow,
  Refusal,
  Rival,
  RivalHero,
  Stat,
  Unavailable,
  UnavailableReason,
};

/** Days until Upkeep next falls due — the engine's own answer (DL-18). */
export function daysUntilUpkeep(career: Career): number {
  return engineDaysUntilUpkeep(career);
}

/** Days until the Board next refreshes — the engine's own answer (DL-18). */
export function daysUntilRefresh(career: Career): number {
  return daysUntilBoardRefresh(career);
}

/** What the next Upkeep will cost, at the current Roster size — the engine's own answer (DL-18). */
export function upkeepDue(career: Career): number {
  return engineUpkeepDue(career);
}

/** The Patron who posted a Commission. */
export function patronOf(career: Career, commission: Commission): Patron | undefined {
  return career.patrons.find((patron) => patron.id === commission.patronId);
}

/** The display name of a Sphere, by its id. */
export function sphereName(content: Content, sphereId: string | undefined): string {
  if (sphereId === undefined) return '';
  // A Sphere whose name content does not carry is said in words, exactly as the terminal
  // says it and as `patronsBySphere` below says it: no label names an identifier (E7-S5).
  return content.spheres.find((sphere) => sphere.id === sphereId)?.name ?? 'Another Sphere';
}

/**
 * The bands a Commission's difficulty is reported in, easiest first. The words are
 * `narrate`'s, because the two front ends used to band one engine number in two different
 * vocabularies and neither of them should own it (DL-18's "not in scope, and known";
 * settled in DL-25 §5).
 */
export { DIFFICULTY_BANDS } from '../words';

/** Which band a Commission's difficulty falls in, scaled to this Career's own range. */
export function difficultyBand(career: Career, commission: Commission): string {
  return difficultyWord(commission.difficulty, career.config);
}

/** The Party a Hero is away with, if they are away. */
export function partyOf(career: Career, hero: Hero): Party | undefined {
  return career.parties.find((party) => party.heroIds.includes(hero.id));
}

/** The title of the Commission a Party is working. */
export function commissionTitle(career: Career, commissionId: string): string {
  // Word for word with `narrate`'s own `workNamed`, which is what every sentence about a
  // Commission whose card has left the Board already says (E7-S5).
  return commissionById(career, commissionId)?.title ?? 'the work';
}

/** Whether the Career has finished, one way or the other. */
export function hasEnded(career: Career): boolean {
  return career.ended !== undefined;
}

/** What the picker knows about a Party as it is being put together (E2, E3-S2). */
export interface PartyPreview {
  /** One entry per chosen Hero who would refuse. Empty until such a Hero is chosen. */
  refusals: Refusal[];
  /** Everybody on the Roster who cannot be sent at all, whoever has been chosen (DL-16 §8). */
  unavailable: Unavailable[];
}

/**
 * Who among these Heroes would refuse this Commission, and who on the Roster cannot be
 * sent at all today (E8-S2). `unavailable` is the engine's own `unavailableAmong`, asked
 * directly and needing no Commission at all (DL-18); only `refusals` needs one, which is
 * why a missing or stale Commission can only ever cost that half of the answer.
 *
 * The `try` is the picker's, not the engine's: a Hero can become unavailable between a
 * render and a tap, and that is the commit's problem to report, not the preview's.
 */
export function partyPreview(
  career: Career,
  commissionId: string,
  heroIds: readonly string[],
): PartyPreview {
  const unavailable = unavailableAmong(career);
  const chosen = [...heroIds];
  if (chosen.length === 0) return { refusals: [], unavailable };
  try {
    return { refusals: proposeParty(career, commissionId, chosen, content).refusals, unavailable };
  } catch {
    // The world moved under the picker, or this Commission has left the Board.
    return { refusals: [], unavailable };
  }
}

/** The summary a Trait carries, which is what a refusal over that Trait is explained with. */
export function traitSummary(name: string): string | undefined {
  return content.traits.find((trait) => trait.name === name)?.summary;
}

/** A Regard value with its sign always shown, so that a fall is legible at a glance. */
export function signedRegard(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

// ── Injuries, Scars and the Hall (E3) ───────────────────────────────────────

/**
 * Whether a Trait is an Injury — the engine's own test, not a second copy of it. Until E6
 * a Trait carrying the Day it lifts simply *was* an Injury; a Decision's option can now
 * give a timed Trait that is not one, and it must not be shown here as an Injury or count
 * against who can be sent (DL-16 §5, DL-23 §10).
 */
export function isInjuryTrait(trait: HeroTrait): trait is HeroTrait & { liftsOn: number } {
  return engineIsInjuryTrait(trait);
}

/** The Injuries a Hero is carrying: the Traits with a Day they lift on. */
export function injuriesOf(hero: Hero): HeroTrait[] {
  return hero.traits.filter((trait) => isInjuryTrait(trait));
}

/** The Traits a Hero keeps for good — a Background, a disposition or a Scar. */
export function lastingTraitsOf(hero: Hero): HeroTrait[] {
  return hero.traits.filter((trait) => !isInjuryTrait(trait));
}

/** Whether a Trait is one of the permanent marks the work leaves (ADR-0005). */
export function isScar(name: string): boolean {
  return content.traits.find((trait) => trait.name === name)?.kind === 'scar';
}

/** What the Hall's three improvements are called, and what each one does. */
export interface HallOffer {
  improvement: HallImprovement;
  name: string;
  effect: string;
  cost: number;
  /** Already in the Hall. Each is bought once. */
  bought: boolean;
  /** Bought or not, whether there is coin for it today. */
  affordable: boolean;
  /** Why it cannot be bought, in words, or `undefined` when it can. */
  why?: string;
}

/**
 * The Hall as a front end shows it: the cost and the effect of each improvement, and why
 * it cannot be bought when it cannot. Every number comes from `career.config`.
 */
export function hallOffers(career: Career): HallOffer[] {
  const names: Record<HallImprovement, { name: string; effect: string }> = {
    infirmary: {
      name: 'Infirmary',
      effect: `Every Injury given from now on runs ${Math.round(
        career.config.infirmaryInjuryFactor * 100,
      )}% as long. It does not shorten one already borne.`,
    },
    trainingYard: {
      name: 'Training yard',
      effect: `Adds ${career.config.trainingYardBacking} to the Backing of every Party you send.`,
    },
    quarters: {
      name: 'Quarters',
      effect:
        `Neglect takes ${career.config.regardDecayQuartersFactor} times as long to tell: ` +
        `${career.config.regardDecayEveryDays * career.config.regardDecayQuartersFactor} idle ` +
        'Days before a Hero thinks less of you.',
    },
  };
  return HALL_IMPROVEMENTS.map((improvement) => {
    const cost = hallCost(improvement, career.config);
    const bought = career.guild.hall.includes(improvement);
    const affordable = career.guild.coin >= cost;
    const offer: HallOffer = {
      improvement,
      name: names[improvement].name,
      effect: names[improvement].effect,
      cost,
      bought,
      affordable,
    };
    if (bought) offer.why = 'Already built.';
    else if (!affordable) offer.why = `${coin(cost - career.guild.coin)} short.`;
    return offer;
  });
}

// ── Applicants (E4) ─────────────────────────────────────────────────────────

/** One Applicant as the sheet shows them. Every rule in it is the engine's own answer. */
export interface ApplicantCard {
  applicant: Applicant;
  /** Days until they give up waiting — the engine's own clock, not one worked out here. */
  daysLeft: number;
  /** Somebody who was on the Roster before and walked out (E4-S4). */
  returning: boolean;
  /** The Background's own summary, which is what the player reads first. */
  summary: string;
  /**
   * What taking them on costs, **both halves of it**: the fee once and the Upkeep their
   * place adds to every Upkeep from now on. Word for word with the sentence the terminal
   * asks its confirming keypress under (DL-25 §3), because that is the information the
   * second keypress carries and the browser's tap has to carry it too (DL-27 §5).
   */
  price: string;
  /** Whether the offer can be taken today. */
  canAccept: boolean;
  /** Why it cannot, in words, or `undefined` when it can. */
  why?: string;
}

/**
 * The people waiting at the door (E4-S3). `applicantOffers` decides whether each one can
 * be taken on and why not; the sentence is `narrate`'s `errorSentence`, so the browser
 * says exactly what the terminal says about the same refusal. Nothing here is a rule.
 */
export function applicantCards(career: Career): ApplicantCard[] {
  return applicantOffers(career).map((offer) => {
    const { applicant } = offer;
    const card: ApplicantCard = {
      applicant,
      daysLeft: offer.daysLeft,
      returning: applicant.formerHeroId !== undefined,
      summary:
        content.backgrounds.find((entry) => entry.name === applicant.background)?.summary ?? '',
      price:
        `${applicant.name} asks ${coin(applicant.askingFee)}, and their place adds ` +
        `${coin(career.config.upkeepPerHero)} to every Upkeep from now on.`,
      canAccept: offer.refusal === undefined,
    };
    if (offer.refusal !== undefined) {
      card.why =
        offer.refusal.code === 'RosterFull'
          ? errorSentence('RosterFull', { detail: career.config.rosterCap })
          : offer.refusal.code === 'InsufficientCoin'
            ? errorSentence('InsufficientCoin', {
                detail:
                  `${coin(applicant.askingFee)}, and you are ` +
                  `${groupDigits(offer.refusal.shortfall ?? 0)} short`,
              })
            : errorSentence(offer.refusal.code);
    }
    return card;
  });
}

/** How many are waiting, how long the first of them will stay, and whether any can be
 * taken on at all. The main screen's cue (E4-S2; extended for finding C2). */
export interface ApplicantCue {
  waiting: number;
  daysLeft: number;
  /** True when every offer waiting carries a refusal: nobody at the door can be taken on. */
  noneCanBeTaken: boolean;
  /**
   * Why, in a few words. Set only when `noneCanBeTaken` is true **and** one reason is
   * true of all of them; absent where they disagree, because the cue that carries it
   * already says none can be taken and would otherwise say it twice.
   */
  why?: string;
}

export function applicantCue(career: Career): ApplicantCue {
  const offers = applicantOffers(career);
  const waiting = offers.length;
  const noneCanBeTaken = waiting > 0 && offers.every((offer) => offer.refusal !== undefined);
  const cue: ApplicantCue = {
    waiting,
    daysLeft: waiting === 0 ? 0 : Math.min(...offers.map((offer) => offer.daysLeft)),
    noneCanBeTaken,
  };
  if (noneCanBeTaken) {
    const why = noneCanBeTakenReason(offers, career.config.rosterCap);
    if (why !== undefined) cue.why = why;
  }
  return cue;
}

// ── Rivals and the League (E5) ──────────────────────────────────────────────

/** One of a Rival's Heroes as the sheet shows them. Every rule in it is the engine's. */
export interface RivalHeroCard {
  hero: RivalHero;
  /** The Background's own summary, which is what the player reads first. */
  summary: string;
  transferFee: number;
  poachFee: number;
  canTransfer: boolean;
  canPoach: boolean;
  /** Why a Transfer cannot be made today, in words, or `undefined` when it can. */
  whyNotTransfer?: string;
  /** Why a Poaching cannot, in words, or `undefined` when it can. */
  whyNotPoach?: string;
}

/** One other Guild as the sheet shows them: who they are, and who works for them. */
export interface RivalCard {
  rival: Rival;
  /** What they think of your Guild, and the last thing that moved it. */
  regard: number;
  reason: string;
  /** True once they are wronged enough to take more work off your Board (E5-S5). */
  soured: boolean;
  /**
   * Whether their own Roster has room for anybody else — the engine's own predicate, the
   * very one `retaliate` uses. A wronged Guild with a full Roster can take nobody off
   * yours until somebody leaves theirs (finding C7, DL-22 §2).
   */
  hasRoom: boolean;
  people: RivalHeroCard[];
}

/**
 * Why a move cannot be made today, in words. The four reasons read differently because
 * each is a different thing standing in the way — the other Guild, the Hero, your own
 * Roster, or your purse — and none of them is decided here: `rivalOffers` answers, and
 * this only puts the answer into a sentence (E8-S2).
 */
function whyNot(what: 'Transfer' | 'Poaching', refusal: MoveRefusal | undefined): string | undefined {
  if (refusal === undefined) return undefined;
  switch (refusal.reason) {
    case 'regard':
      return `A ${what.toLowerCase()} needs their consent, and they will not deal with you.`;
    case 'heroRegard':
      return 'They are content enough where they are to hear nothing said against it.';
    case 'rosterFull':
      return 'There is no room on your Roster until somebody leaves.';
    case 'coin':
      return `The Guild is ${coin(refusal.shortfall ?? 0)} short of what it would cost.`;
    default: {
      const unreachable: never = refusal.reason;
      return unreachable;
    }
  }
}

/** Every other Guild, with their people and both fees for each of them (E5-S2). */
export function rivalCards(career: Career): RivalCard[] {
  return career.rivals.map((rival) => ({
    rival,
    regard: rival.regardForGuild.value,
    reason: rival.regardForGuild.reason,
    soured: rival.regardForGuild.value <= career.config.souredRivalThreshold,
    hasRoom: hasRoomForAnother(rival, career.config),
    people: rivalOffers(career, rival.id).map((offer) => {
      const card: RivalHeroCard = {
        hero: offer.hero,
        summary:
          content.backgrounds.find((entry) => entry.name === offer.hero.background)?.summary ?? '',
        transferFee: offer.transferFee,
        poachFee: offer.poachFee,
        canTransfer: offer.transferRefusal === undefined,
        canPoach: offer.poachRefusal === undefined,
      };
      const noTransfer = whyNot('Transfer', offer.transferRefusal);
      const noPoach = whyNot('Poaching', offer.poachRefusal);
      if (noTransfer !== undefined) card.whyNotTransfer = noTransfer;
      if (noPoach !== undefined) card.whyNotPoach = noPoach;
      return card;
    }),
  }));
}

/**
 * What a Poaching will cost besides coin, said before the tap rather than after it
 * (E5-S3). Every number in it is a config field.
 */
export function poachWarning(career: Career): string {
  return (
    `Taking somebody without asking costs ${Math.abs(career.config.poachRivalRegardCost)} of ` +
    `that Guild's Regard for yours. At ${career.config.souredRivalThreshold} they take more ` +
    'of the work you leave on the Board, and they start taking people back off your Roster.'
  );
}


/**
 * Which of your Heroes another Guild could take as things stand, and what the Roster pane
 * says about each of them (finding C9, DL-22 §2). The line at which Regard stops defending
 * a Roster was shown nowhere at all until now, and it sits one point above the band the
 * Departure Check talks somebody round in.
 *
 * Nothing here is a rule: `retaliationRisks` decides who is on the list and which Guilds
 * are minded to try, and this only turns the ids into the names the player reads. The
 * sentence itself is `narrate`'s, word for word with the terminal's (DL-25 §15).
 */
export function rosterRisks(career: Career): Map<string, string> {
  const guildNames = new Map(career.rivals.map((rival) => [rival.id, rival.name]));
  return new Map(
    retaliationRisks(career).map((risk) => [
      risk.heroId,
      // A Guild whose name cannot be found is "another Guild" and never its identifier,
      // word for word with the terminal's `views/shared.ts` (E7-S5, DL-26 §3).
      atRiskSentence(risk.rivalIds.map((id) => guildNames.get(id) ?? 'another Guild')),
    ]),
  );
}

/** Every Guild ordered by Standing — the engine's own view, passed straight through (E5-S6). */
export function leagueRows(career: Career): LeagueRow[] {
  return league(career);
}

/**
 * What Standing is and is not, for the footer under the League. **Word for word what the
 * terminal says under its own League** (DL-22), which is why it is now one sentence in
 * `narrate` rather than a copy in each front end (DL-25 §15).
 */
export const STANDING_EXPLAINED = narratedStandingExplained;

// ── Patrons by Sphere (E7-S3, E8-S6) ────────────────────────────────────────

/** One Patron as the sheet shows them: never a bare number, always the reason with it. */
export interface PatronCard {
  patron: Patron;
  /** What they think of the Guild, and the last thing that moved it. */
  regard: number;
  reason: string;
  /**
   * False when their Regard has reached the floor and they post nothing at all — the
   * engine's own `postingPatrons`, the very set `refreshBoard` asks. Nothing here decides
   * where the floor is (DL-25 §2).
   */
  posting: boolean;
  /** What they have on the Board just now, in the order the Board holds it. */
  onTheBoard: Commission[];
}

/** One Sphere and the Patrons whose work comes from it. */
export interface SphereGroup {
  /** The Sphere's own name. A Sphere content does not name is said in words, never as an id. */
  name: string;
  patrons: PatronCard[];
}

/**
 * Every Patron, grouped by Sphere in the order the content lists them, with their Regard,
 * the reason it last moved, and what they have on the Board (E7-S3). Nothing here is a
 * rule: `postingPatrons` says who is posting, and so who is posting nothing.
 */
export function patronsBySphere(career: Career): SphereGroup[] {
  const order = content.spheres.map((sphere) => sphere.id);
  const names = new Map(content.spheres.map((sphere) => [sphere.id, sphere.name]));
  const posting = new Set(postingPatrons(career).map((patron) => patron.id));

  const groups = new Map<string, Patron[]>();
  for (const patron of career.patrons) {
    const group = groups.get(patron.sphere) ?? [];
    group.push(patron);
    groups.set(patron.sphere, group);
  }

  return [...groups.keys()]
    .sort((left, right) => {
      const at = order.indexOf(left) - order.indexOf(right);
      return at !== 0 ? at : left.localeCompare(right);
    })
    .map((id) => ({
      // A Sphere whose name content does not carry is said in words, exactly as the
      // terminal says it: a heading is a thing the player reads (E7-S5).
      name: names.get(id) ?? 'Another Sphere',
      patrons: (groups.get(id) ?? []).map((patron) => ({
        patron,
        regard: patron.regardForGuild.value,
        reason: patron.regardForGuild.reason,
        posting: posting.has(patron.id),
        onTheBoard: career.board.filter((commission) => commission.patronId === patron.id),
      })),
    }));
}

// ── The Heroes who are no longer on the Roster (E7-S3, E8-S6) ───────────────

/** One person who has left, as the sheet shows them. */
export interface FormerCard {
  hero: Hero;
  /** How they went, in words: "walked out", "did not come back", "reached the end…". */
  how: string;
  /** The Day it happened, as the player reads it, or `undefined` where nothing recorded one. */
  when?: string;
  /** What was last said about it. */
  reason?: string;
}

/**
 * Everybody who has left, newest first (E7-S3). A dead or departed Hero leaves the Roster
 * but not the Guild's history, so this is a page of its own and the Roster shows nobody on
 * it (CONTEXT.md). Somebody another Guild took appears here too, because the engine
 * records their going the same way.
 */
export function formerCards(career: Career): FormerCard[] {
  return [...career.guild.formerHeroes]
    .sort((left, right) => (right.exit?.onDay ?? 0) - (left.exit?.onDay ?? 0))
    .map((hero) => {
      const exit = hero.exit;
      const card: FormerCard = {
        hero,
        how: exit === undefined ? 'left the Guild' : exitWords(exit.kind),
      };
      if (exit !== undefined) {
        card.when = formatDay(exit.onDay, career);
        // Only where it says more than the going already did: a Retirement's reason on
        // the Career *is* the exit words, and this read "reached the end of a working
        // life, Year 1, Day 20: reached the end of a working life".
        const why = exitReason(exit.kind, exit.reason);
        if (why !== undefined) card.reason = why;
      }
      return card;
    });
}

// ── A Party waiting on your word (E6) ───────────────────────────────────────

/** One option of a pending Decision, with its words and its numbers together (E6-S4). */
export interface WordOptionCard {
  id: string;
  kind: WordOption['kind'];
  /** The authored label, filled by `narrate`. */
  label: string;
  cost?: number;
  /** Whether the Guild can take it as things stand now. */
  affordable: boolean;
  /** Why it cannot be taken, written out, or absent when it can. */
  why?: string;
  isDefault: boolean;
  /**
   * What calling the Party home would pay, written out. Set on the `turnBack` option and
   * absent on the other two. The numbers are the engine's own `turnBackOutcome`, carried
   * on the offer, so no view assembles `turnBackFee`'s arguments for itself (F11, DL-18).
   */
  outcome?: string;
}

/**
 * What calling a Commission off would pay, in words. **Word for word what the terminal
 * says of the same offer**, so the two front ends cannot come to describe one rule
 * differently — which is why the sentence itself now lives in `narrate` (DL-25 §15). Coin
 * is never abbreviated.
 */
export function turnBackSentence(outcome: TurnBackOutcome): string {
  return narratedTurnBackSentence(outcome);
}

/** One Party waiting on word, with everything the pane renders (E6-S4). */
export interface WordCard {
  partyId: string;
  /** The Commission they are out on. */
  title: string;
  /** Who is out there, by name. */
  names: string[];
  /** The authored prompt, filled by `narrate`. */
  prompt: string;
  daysWaited: number;
  daysLeft: number;
  /** The Day they stop waiting and take the default — the engine's own `timesOutOn`. */
  decidesOn: number;
  defaultOptionId: string;
  options: WordOptionCard[];
}

/**
 * Every Party waiting on word, ready to render (E6-S4). The engine's `wordOffers` decides
 * what each option costs, which the Guild can take now and how many Days are left before
 * the Party acts on its own judgement; `narrate`'s `wordProse` says the words. Nothing
 * here works either out, and no component outside `state/` touches the engine.
 */
export function wordCards(career: Career): WordCard[] {
  return wordOffers(career, content).map((offer) => {
    const words = wordProse(offer, career, content);
    const party = career.parties.find((entry) => entry.id === offer.partyId);
    return {
      partyId: offer.partyId,
      title: commissionTitle(career, offer.commissionId),
      // A Hero who left the Roster while the Party was still out is looked up among the
      // former Heroes, and a name that cannot be found at all is said in words: no
      // sentence names an identifier. The terminal's `partyNames` does exactly this.
      names: (party?.heroIds ?? []).map((id) => {
        const here = career.guild.roster.find((hero) => hero.id === id);
        if (here !== undefined) return here.name;
        return career.guild.formerHeroes.find((hero) => hero.id === id)?.name ?? 'somebody';
      }),
      prompt: words.prompt,
      daysWaited: offer.daysWaited,
      daysLeft: offer.daysLeft,
      decidesOn: offer.timesOutOn,
      defaultOptionId: offer.defaultOptionId,
      options: offer.options.map((option) => {
        const card: WordOptionCard = {
          id: option.id,
          kind: option.kind,
          // The authored label, and never the option's identifier where there is none
          // (E7-S5): "send-coin" is not a thing anybody can weigh. Word for word with the
          // terminal's `word.ts`, which E7's own verifier fixed for the same reason.
          label: words.labels[option.id] ?? 'Answer them',
          affordable: option.affordable,
          isDefault: option.isDefault,
        };
        if (option.cost !== undefined) card.cost = option.cost;
        if (option.outcome !== undefined) card.outcome = turnBackSentence(option.outcome);
        if (option.refusal !== undefined) {
          card.why = errorSentence(option.refusal.code, {
            detail:
              `${coin(option.cost ?? 0)}, and the Guild is ` +
              `${groupDigits(option.refusal.shortfall)} short`,
          });
        }
        return card;
      }),
    };
  });
}

/**
 * The cue the header and the bottom bar carry while a Party is waiting: how many are
 * waiting and how long the first of them has left before it decides for itself. In words
 * and numbers, never in colour alone — and it is why Advance is refused (E6-S4).
 */
export function wordCue(career: Career): { waiting: number; daysLeft: number } {
  const offers = wordOffers(career, content);
  return {
    waiting: offers.length,
    daysLeft: offers.length === 0 ? 0 : Math.min(...offers.map((offer) => offer.daysLeft)),
  };
}
