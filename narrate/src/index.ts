/**
 * `@heroesim/narrate` — events in, English out (ADR-0002, DL-08). The engine reports
 * facts with ids and numbers; this package is where the writing craft lives, and both
 * front ends render the same Paragraphs so that they say the same thing.
 *
 * Pure: no clock, no global random, no output. ESLint enforces it.
 *
 * Two kinds of prose meet here. A Beat's sentences are authored in the Vignette and
 * filled from the Beat's slots; everything else — the report a Party comes back with,
 * the Board, Upkeep, the reckoning — is written in `lines.ts` and here.
 */

import {
  commissionById,
  REASON_DRIFTED,
  REASON_INSISTED,
  type AnyHero,
  type Applicant,
  type Career,
  type Content,
  type GameEvent,
  type Rival,
  type TraitDef,
  type Vignette,
} from '@heroesim/engine';
import {
  coin,
  count,
  errorSentence,
  formatDay,
  groupDigits,
  hallName,
  joinNames,
  reckoningLines,
} from './lines.js';
import { fillTokens, NarrationError, pronounForms } from './tokens.js';

export const PACKAGE_NAME = '@heroesim/narrate';

export { coin, count, errorSentence, formatDay, groupDigits, hallName, joinNames, reckoningLines };
// Words both front ends were keeping identical copies of, held here once (DL-25 §15).
export {
  atRiskSentence,
  difficultyWord,
  exitReason,
  exitWords,
  noneCanBeTakenReason,
  postingNothingSentence,
  returnerSentence,
  turnBackSentence,
  wrongedRivalSentence,
  DIFFICULTY_BANDS,
  STANDING_EXPLAINED,
} from './lines.js';
export { NarrationError } from './tokens.js';
// The rolling five, in the half both front ends share: which moments are worth
// remembering, and what an entry says (E7-S2, E8-S6; DL-27 §6).
export {
  entriesFrom,
  remember,
  splitStamp,
  HISTORY_KEPT,
  STAMP,
  WORTH_REMEMBERING,
} from './history.js';

/**
 * What a Paragraph is about, so a front end can lay it out without reading it.
 *
 * `word` and `answer` are E6's: a Party that has stopped to ask, and what was said back.
 * The seven kinds before them are unchanged.
 */
export type ParagraphKind =
  | 'beat'
  | 'return'
  | 'board'
  | 'coin'
  | 'commit'
  | 'end'
  | 'note'
  | 'word'
  | 'answer';

/**
 * One paragraph of the story, ready to print. Paragraphs come back in the order the
 * events happened, which is Day order; a Party's report is its Beats and its return,
 * which share a `partyId`.
 */
export interface Paragraph {
  kind: ParagraphKind;
  /** The Day the events behind it happened on. */
  day: number;
  /** The prose. Never empty, and never contains an unfilled `{token}`. */
  text: string;
  /** Set when the paragraph belongs to one Party's report. */
  partyId?: string;
}

function paragraph(
  kind: ParagraphKind,
  day: number,
  text: string,
  partyId?: string,
): Paragraph {
  return partyId === undefined ? { kind, day, text } : { kind, day, text, partyId };
}

/** Ends a clause with a full stop without doubling one the author already wrote. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** The lookups a paragraph needs, built once per call. */
interface World {
  heroes: ReadonlyMap<string, AnyHero>;
  applicants: ReadonlyMap<string, Applicant>;
  patrons: ReadonlyMap<string, string>;
  spheres: ReadonlyMap<string, string>;
  rivals: ReadonlyMap<string, Rival>;
  /** For anybody a Rival employs, the name of the Guild that employs them (E5). */
  employedBy: ReadonlyMap<string, string>;
  vignettes: ReadonlyMap<string, Vignette>;
  traits: ReadonlyMap<string, TraitDef>;
}

function indexWorld(career: Career, content: Content): World {
  // A Hero is a Hero wherever they work (ADR-0003), so somebody on a Rival's Roster is
  // looked up here exactly as one of yours is — otherwise a Transfer, a Poaching or a
  // Rival's own Retirement would have nobody to name (E5-S1).
  const heroes = new Map<string, AnyHero>();
  const employedBy = new Map<string, string>();
  for (const hero of career.guild.roster) heroes.set(hero.id, hero);
  for (const rival of career.rivals) {
    for (const hero of rival.roster) {
      if (!heroes.has(hero.id)) heroes.set(hero.id, hero);
      employedBy.set(hero.id, rival.name);
    }
  }
  for (const hero of career.guild.formerHeroes) if (!heroes.has(hero.id)) heroes.set(hero.id, hero);
  return {
    heroes,
    employedBy,
    applicants: new Map(career.applicants.map((applicant) => [applicant.id, applicant])),
    patrons: new Map(career.patrons.map((patron) => [patron.id, patron.name])),
    spheres: new Map(content.spheres.map((sphere) => [sphere.id, sphere.name])),
    rivals: new Map(career.rivals.map((rival) => [rival.id, rival])),
    vignettes: new Map(content.vignettes.map((vignette) => [vignette.id, vignette])),
    traits: new Map(content.traits.map((trait) => [trait.name, trait])),
  };
}

/** A Rival's name, or a plain stand-in where the Career no longer holds them. */
function rivalName(world: World, id: string): string {
  return world.rivals.get(id)?.name ?? 'another Guild';
}

/** A Hero's name, or a plain stand-in if they have left the Guild's memory entirely. */
function heroName(world: World, id: string): string {
  return world.heroes.get(id)?.name ?? 'one of the Party';
}

function patronName(world: World, id: string): string {
  return world.patrons.get(id) ?? 'the Patron';
}

/**
 * The name of somebody who came to the Hall asking for work, or `undefined` where the
 * batch they arrived in has already gone. Nothing here ever says a calibre: what the
 * player reads is the person, their Background, their Traits and what they ask for (E4 §5).
 */
function applicantName(world: World, id: string): string | undefined {
  return world.applicants.get(id)?.name ?? world.heroes.get(id)?.name;
}

/** What the Board and the reports call a Commission once it is no longer resolvable. */
function commissionTitle(career: Career, world: World, commissionId: string, patronId: string): string {
  return commissionById(career, commissionId)?.title ?? `work from ${patronName(world, patronId)}`;
}

/** A Regard value as the player reads it: always carrying its sign, so a fall is visible. */
function signed(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

/** The title of a Commission that may already have left the Board with the Party. */
function workNamed(career: Career, commissionId: string): string {
  return commissionById(career, commissionId)?.title ?? 'the work';
}

/**
 * Why somebody would not go. A refusal over Regard blames the relationship and says how
 * far it has fallen; a refusal over a Trait quotes the Trait's own summary, which is
 * written to read as a reason (E2).
 */
function refusalText(
  event: Extract<GameEvent, { type: 'CommissionRefused' }>,
  career: Career,
  world: World,
): string {
  const name = heroName(world, event.heroId);
  const work = workNamed(career, event.commissionId);
  if (event.reason === 'regard' || event.trait === undefined) {
    return (
      `${name} would not take ${work}: Regard for you stands at ` +
      `${signed(event.regardValue)}.`
    );
  }
  const summary = world.traits.get(event.trait)?.summary;
  return summary === undefined
    ? `${name} would not take ${work}: ${event.trait}.`
    : `${name} would not take ${work}: ${event.trait} — ${summary}`;
}

/**
 * Why a move did not happen (E5-S2). Each of the four reasons reads differently, because
 * each is a different thing standing in the way: the other Guild, the Hero, your own
 * Roster, or your purse. A refusal is a thing that happened in the world, so it is told as
 * one — never as an error message.
 */
function refusedMoveText(
  event: Extract<GameEvent, { type: 'TransferRefused' }>,
  world: World,
): string {
  const name = heroName(world, event.heroId);
  const guild = rivalName(world, event.rivalId);
  const rival = world.rivals.get(event.rivalId);
  const hero = world.heroes.get(event.heroId);
  switch (event.reason) {
    case 'regard':
      return rival === undefined
        ? `${guild} will not deal with you, and ${name} stays where they are.`
        : `${guild} will not deal with you: Regard for the Guild stands at ` +
          `${signed(rival.regardForGuild.value)}. ${name} stays where they are.`;
    case 'heroRegard':
      return hero?.regardForRival === undefined
        ? `${name} is content enough at ${guild} to hear nothing said against it.`
        : `${name} is content enough at ${guild} to hear nothing said against it: ` +
          `Regard for them stands at ${signed(hero.regardForRival.value)}.`;
    case 'rosterFull':
      return `There is no room on the Roster for ${name}.`;
    case 'coin':
      return `The Guild cannot pay what ${guild} would want for ${name}.`;
    default: {
      const unreachable: never = event.reason;
      throw new NarrationError(`no sentence for a refusal of ${String(unreachable)}`);
    }
  }
}

// ── The Beat ────────────────────────────────────────────────────────────────

/** The slots an authored narrative is filled from — a Beat's and a Decision's alike. */
interface NarrativeSlots {
  heroId: string;
  patronId: string;
  sphereId: string;
  trait?: string;
}

/**
 * What every `{token}` in an authored narrative resolves to. **One map, built once and
 * used by both callers**: a Vignette's outcome and a Decision's prompt and labels carry
 * exactly the same tokens, and two copies of this would drift the first time a token was
 * added to one of them — the risk E6 §5's own table names (F13).
 */
function narrativeValues(
  slots: NarrativeSlots,
  commissionId: string,
  career: Career,
  world: World,
): Record<string, string | undefined> {
  const hero = world.heroes.get(slots.heroId);
  const forms = hero === undefined ? undefined : pronounForms(hero.pronouns);
  return {
    hero: hero?.name,
    'hero.they': forms?.they,
    'hero.them': forms?.them,
    'hero.their': forms?.their,
    'hero.is': forms?.is,
    'hero.has': forms?.has,
    'hero.moves': forms?.moves,
    patron: world.patrons.get(slots.patronId),
    sphere: world.spheres.get(slots.sphereId),
    guildmaster: career.guild.guildmaster.name,
    commission: commissionById(career, commissionId)?.title,
    trait: slots.trait,
  };
}

function beatText(
  event: Extract<GameEvent, { type: 'BeatResolved' }>,
  career: Career,
  world: World,
): string {
  const vignette = world.vignettes.get(event.vignetteId);
  if (vignette === undefined) {
    throw new NarrationError(`vignettes: no Vignette with id "${event.vignetteId}" is loaded`);
  }
  return fillTokens(
    vignette.outcomes[event.result].narrative,
    narrativeValues(event.slots, event.commissionId, career, world),
    `vignettes/${vignette.id}.toml: outcomes.${event.result}.narrative`,
  );
}

// ── A Party that has stopped to ask (E6) ────────────────────────────────────

/** Enough of a pending Decision to fill its prose: three ids and the slots (E6-S4). */
export interface WordSubject {
  decisionId: string;
  commissionId: string;
  slots: { heroId: string; patronId: string; sphereId: string; trait?: string };
}

/** The words of a Decision: the prompt, and each option's label by its id. */
export interface WordProse {
  prompt: string;
  /** One entry per option the Decision carries, keyed by option id. */
  labels: Record<string, string>;
}

/**
 * The prose of a Decision put to the Guildmaster, filled through the same token filler a
 * Vignette's narrative goes through (E6-S1). The engine carries the ids and the numbers and
 * this carries the words, so a front end renders an option's cost from `wordOffers` and its
 * label from here, and neither package has to know the other's job.
 *
 * @throws NarrationError if the Decision is not loaded, or a token cannot be filled
 */
export function wordProse(subject: WordSubject, career: Career, content: Content): WordProse {
  const decision = content.decisions.find((entry) => entry.id === subject.decisionId);
  if (decision === undefined) {
    throw new NarrationError(`decisions: no Decision with id "${subject.decisionId}" is loaded`);
  }
  const world = indexWorld(career, content);
  // The very map a Beat's narrative is filled from: a Decision's prose is content in the
  // same shape and speaks the same tokens, so it goes through the same builder (E6 §5).
  const values = narrativeValues(subject.slots, subject.commissionId, career, world);
  const labels: Record<string, string> = {};
  for (const option of decision.options) {
    labels[option.id] = fillTokens(
      option.label,
      values,
      `decisions/${decision.id}.toml: options[${option.id}].label`,
    );
  }
  return {
    prompt: fillTokens(decision.prompt, values, `decisions/${decision.id}.toml: prompt`),
    labels,
  };
}

// ── The Board ───────────────────────────────────────────────────────────────

interface BoardBuffer {
  day: number;
  posted: { commissionId: string; patronId: string }[];
  expired: { commissionId: string; patronId: string }[];
  taken: { commissionId: string; patronId: string; rivalId: string }[];
}

function boardText(buffer: BoardBuffer, career: Career, world: World): string {
  const sentences: string[] = [];

  if (buffer.posted.length === 0) {
    sentences.push('Nothing new was posted to the Board.');
  } else {
    const titles = buffer.posted.map((entry) =>
      commissionTitle(career, world, entry.commissionId, entry.patronId),
    );
    sentences.push(`New on the Board: ${titles.join('; ')}.`);
  }

  for (const entry of buffer.taken) {
    const title = commissionTitle(career, world, entry.commissionId, entry.patronId);
    sentences.push(`${rivalName(world, entry.rivalId)} took ${title}.`);
  }

  if (buffer.expired.length > 0) {
    // A Commission that lapsed has left the Board, so its title is often gone with it.
    // Name the ones still resolvable and gather the rest under the Patrons they came from.
    const titles: string[] = [];
    const patrons = new Set<string>();
    for (const entry of buffer.expired) {
      const commission = commissionById(career, entry.commissionId);
      if (commission === undefined) patrons.add(patronName(world, entry.patronId));
      else titles.push(commission.title);
    }
    const parts: string[] = [];
    if (titles.length > 0) parts.push(titles.join('; '));
    if (patrons.size > 0) parts.push(`work from ${joinNames([...patrons])}`);
    sentences.push(
      `${count(buffer.expired.length, 'Commission', 'Commissions')} lapsed unclaimed: ` +
        `${parts.join('; ')}.`,
    );
  }

  return sentences.join(' ');
}

// ── The whole stream ────────────────────────────────────────────────────────

/**
 * Turn a step's events into paragraphs.
 *
 * Accounting events — a Consequence, a coin movement, a Regard movement, a Trait given
 * or lifted — never get a paragraph of their own. A coin movement is folded into the
 * Beat or the return that caused it; the rest are folded into one short `note` attached
 * after it. Commission score is deliberately silent: the Beat already says how it went.
 *
 * Refusals, insistence and Departure are notes too, because they are things that happened
 * around the work rather than in it. Regard drifting from neglect is folded further
 * still: a Board refresh that finds four Heroes drifting says so once, naming them,
 * rather than four times (E2).
 *
 * @param events what the engine reported, in the order it reported them
 * @param career the Career **after** the step, so that every name and title resolves
 * @param content the authored content the Beats came from
 * @throws NarrationError if a Vignette is missing or a token cannot be filled
 */
export function narrateEvents(
  events: readonly GameEvent[],
  career: Career,
  content: Content,
): Paragraph[] {
  const world = indexWorld(career, content);
  const out: Paragraph[] = [];

  /**
   * Harm arrives twice: `TraitGained` is the mechanical fact and `HeroInjured` or
   * `HeroScarred` is the narratable one, and both are true (E3 §4). The pair is found in
   * one pass up front so that the Trait is reported once — by the sentence that says what
   * happened — whichever order the two events came in. A Trait given by anything else
   * still gets its own note (DL-16).
   */
  const toldAsHarm = new Set<string>();
  for (const event of events) {
    if (event.type === 'HeroInjured' || event.type === 'HeroScarred') {
      toldAsHarm.add(`${event.day}|${event.heroId}|${event.trait}`);
    }
  }

  /**
   * Taking somebody on arrives three times — the offer taken, the coin paid and the
   * Roster gaining a person — and for the reader it is one moment (E4 §4). The fee is
   * found up front so that the `HeroJoined` which tells that moment can carry it, and the
   * other two stay silent rather than saying the same thing again.
   */
  const feePaidFor = new Map<string, number>();
  for (const event of events) {
    if (event.type === 'ApplicantAccepted') feePaidFor.set(`${event.day}|${event.heroId}`, event.fee);
  }

  /**
   * And a Hero can arrive by crossing from a Rival instead (E5). Found in the same pass
   * and for the same reason: the transaction, the coin and the Roster gaining a person
   * are one moment, so `HeroJoined` tells it and the two events before it stay silent.
   */
  const crossedOver = new Map<
    string,
    { rivalId: string; fee: number; poached: boolean; regardDelta?: number }
  >();
  for (const event of events) {
    if (event.type === 'HeroTransferred') {
      crossedOver.set(`${event.day}|${event.heroId}`, {
        rivalId: event.fromRivalId,
        fee: event.fee,
        poached: false,
      });
    }
    if (event.type === 'HeroPoached') {
      crossedOver.set(`${event.day}|${event.heroId}`, {
        rivalId: event.fromRivalId,
        fee: event.fee,
        poached: true,
        regardDelta: event.rivalRegardDelta,
      });
    }
  }

  /**
   * Accounting sentences waiting to be attached. Each carries the Day it happened on,
   * because a Trait lifts at the start of a Day before any Beat has anchored it.
   */
  let notes: { day: number; partyId: string | undefined; text: string }[] = [];
  let noteDay = career.day;
  let notePartyId: string | undefined;
  /** The Beat or return a coin movement folds into. */
  let attachTo: Paragraph | undefined;
  let board: BoardBuffer | undefined;

  /** A note belongs to the anchor it follows only when it happened on the same Day. */
  const addNote = (day: number, text: string): void => {
    const owner = board === undefined && noteDay === day ? notePartyId : undefined;
    notes.push({ day, partyId: owner, text });
  };

  /**
   * Heroes drifting on the same Day, gathered so that a refresh says it once. Drift is
   * not a different kind of fact from any other Regard movement, so it arrives as the
   * same event; it is only the reporting of it that is folded (E2).
   */
  let drifting: { day: number; names: string[] } | undefined;

  const flushDrift = (): void => {
    if (drifting === undefined) return;
    const { day, names } = drifting;
    drifting = undefined;
    addNote(
      day,
      `${joinNames(names)} ${names.length === 1 ? 'is' : 'are'} drifting: ${REASON_DRIFTED}.`,
    );
  };

  /**
   * Applicants who ran out of patience on the same Day, gathered so that a batch giving
   * up reads as one line rather than as three (E4-S2). A player's own decline is its own
   * sentence, because it is a decision and not a thing that merely happened.
   */
  let givingUp: { day: number; names: string[] } | undefined;

  /**
   * What the other Guilds did with their own Rosters on a Day, gathered so that four
   * Rivals churning at one Board refresh reads as one line of background rather than as
   * four (E5-S5). It is news about somebody else's Guild: worth knowing, never the point.
   */
  let rivalMoves: { day: number; said: string[] } | undefined;

  const flushRivalMoves = (): void => {
    if (rivalMoves === undefined) return;
    const { day, said } = rivalMoves;
    rivalMoves = undefined;
    if (said.length > 0) addNote(day, `${said.join('; ')}.`);
  };

  const flushGivingUp = (): void => {
    if (givingUp === undefined) return;
    const { day, names } = givingUp;
    givingUp = undefined;
    addNote(
      day,
      `${joinNames(names)} gave up waiting and went elsewhere.`,
    );
  };

  /** One paragraph per run of notes sharing a Day and a Party, in the order they arrived. */
  const flushNotes = (): void => {
    let index = 0;
    while (index < notes.length) {
      const head = notes[index];
      if (head === undefined) break;
      let end = index + 1;
      while (end < notes.length) {
        const next = notes[end];
        if (next === undefined || next.day !== head.day || next.partyId !== head.partyId) break;
        end += 1;
      }
      const text = notes
        .slice(index, end)
        .map((note) => note.text)
        .join(' ');
      out.push(paragraph('note', head.day, text, head.partyId));
      index = end;
    }
    notes = [];
  };

  const closeBoard = (): void => {
    if (board === undefined) return;
    const text = boardText(board, career, world);
    const day = board.day;
    board = undefined;
    out.push(paragraph('board', day, text));
    flushNotes();
  };

  /** Everything that is not a Board event closes the Board and any pending note. */
  const anchor = (day: number, partyId?: string): void => {
    closeBoard();
    flushNotes();
    noteDay = day;
    notePartyId = partyId;
    attachTo = undefined;
  };

  const openBoard = (day: number): BoardBuffer => {
    if (board !== undefined && board.day === day) return board;
    closeBoard();
    flushNotes();
    noteDay = day;
    notePartyId = undefined;
    attachTo = undefined;
    board = { day, posted: [], expired: [], taken: [] };
    return board;
  };

  for (const event of events) {
    // Everything but another drift closes the gathered drift note, so it reads in the
    // place the drifting happened rather than at the end of the stretch.
    if (!(event.type === 'HeroRegardForGuildmasterChanged' && event.reason === REASON_DRIFTED)) {
      flushDrift();
    }
    if (!(event.type === 'ApplicantDeclined' && event.reason === 'expired')) {
      flushGivingUp();
    }
    if (event.type !== 'RivalRosterChanged') flushRivalMoves();
    switch (event.type) {
      case 'CareerStarted': {
        anchor(event.day);
        const names = event.heroIds.map((id) => heroName(world, id));
        // The debt the Guild came with, said once and only when there is one (E7 §3's
        // adopted default, DL-25 §1). It is already out of the coin the Guild holds, so
        // this says where the missing float went rather than announcing an obligation:
        // nothing is owed after the first Day. At the default of 0 nothing is said.
        const debt =
          career.config.startingDebt > 0
            ? ` The books open ${coin(career.config.startingDebt)} down on what the last ` +
              'Guildmaster owed.'
            : '';
        out.push(
          paragraph(
            'note',
            event.day,
            `You take over ${event.guildName}. ${career.guild.guildmaster.name} is Guildmaster, ` +
              `and ${joinNames(names)} came with the Guild.${debt}`,
          ),
        );
        break;
      }

      case 'CommissionPosted':
        openBoard(event.day).posted.push({
          commissionId: event.commissionId,
          patronId: event.patronId,
        });
        break;

      case 'CommissionExpired':
        openBoard(event.day).expired.push({
          commissionId: event.commissionId,
          patronId: event.patronId,
        });
        break;

      case 'CommissionTakenByRival':
        openBoard(event.day).taken.push({
          commissionId: event.commissionId,
          patronId: event.patronId,
          rivalId: event.rivalId,
        });
        break;

      case 'HeroTransferred':
      case 'HeroPoached':
        // Deliberately silent, as `ApplicantAccepted` is. The transaction, the coin and
        // the Roster gaining a person are one moment for the reader, and `HeroJoined` is
        // where it is told — with what it cost, and who it was taken from (E4 §4, E5 §4).
        break;

      case 'RivalPoachedHero':
        // The Regard is the whole point of the sentence. A Hero is never taken from a
        // Regard the player has not watched fall, so the number that made them takeable
        // is what the line leads with (E5-S4).
        addNote(
          event.day,
          `${heroName(world, event.heroId)} has gone to ${rivalName(world, event.toRivalId)}. ` +
            `Regard for you had fallen to ${signed(event.regardValue)}, and somebody else ` +
            'was willing to ask.',
        );
        break;

      case 'RivalRosterChanged': {
        if (rivalMoves === undefined || rivalMoves.day !== event.day) {
          flushRivalMoves();
          rivalMoves = { day: event.day, said: [] };
        }
        const who = rivalName(world, event.rivalId);
        for (const id of event.joinedHeroIds) {
          rivalMoves.said.push(`${who} has taken on ${heroName(world, id)}`);
        }
        // Somebody who has left a Rival has left the world with it — a Rival's Roster is
        // not the player's history to keep (ADR-0003) — so there is no name to give.
        if (event.leftHeroIds.length > 0) {
          rivalMoves.said.push(
            event.leftHeroIds.length === 1
              ? `${who} is one Hero lighter`
              : `${who} is ${event.leftHeroIds.length} Heroes lighter`,
          );
        }
        break;
      }

      case 'RivalRegardChanged':
        if (event.delta !== 0) {
          addNote(
            event.day,
            sentence(
              `${rivalName(world, event.rivalId)} thinks ` +
                `${event.delta > 0 ? 'better' : 'worse'} of the Guild: ${event.reason}`,
            ),
          );
        }
        break;

      case 'TransferRefused':
        addNote(event.day, refusedMoveText(event, world));
        break;

      case 'BoardRefreshed':
        openBoard(event.day);
        closeBoard();
        break;

      case 'PartyCommitted': {
        anchor(event.day, event.partyId);
        const commission = commissionById(career, event.commissionId);
        const title = commission?.title ?? 'the work';
        const patron =
          commission === undefined ? 'their Patron' : patronName(world, commission.patronId);
        const names = joinNames(event.heroIds.map((id) => heroName(world, id)));
        // Backing can now be negative, because what a Party thinks of the Guildmaster is
        // part of it (E2). A number with a minus sign in front of it reads as a typing
        // mistake, so the sign is spelled out instead.
        const backing =
          event.backing > 0
            ? `with Backing of ${event.backing}`
            : event.backing === 0
              ? 'with no Backing'
              : `worse off by ${Math.abs(event.backing)} for what they think of you`;
        out.push(
          paragraph(
            'commit',
            event.day,
            `${names} set out on ${title}, for ${patron}, ${backing}. ` +
              `They are due back on ${formatDay(event.returnsOn, career)}.`,
            event.partyId,
          ),
        );
        break;
      }

      case 'BeatResolved': {
        anchor(event.day, event.partyId);
        const built = paragraph('beat', event.day, beatText(event, career, world), event.partyId);
        out.push(built);
        attachTo = built;
        break;
      }

      case 'PartyReturned': {
        anchor(event.day, event.partyId);
        const title = commissionTitle(career, world, event.commissionId, event.patronId);
        const names = joinNames(event.heroIds.map((id) => heroName(world, id)));
        const outcome = event.succeeded ? 'the work was finished' : 'the work was not finished';
        const fee =
          event.feePaid > 0
            ? `The fee of ${coin(event.feePaid)} was paid.`
            : 'Nothing was paid for it.';
        const built = paragraph(
          'return',
          event.day,
          `${title}, for ${patronName(world, event.patronId)}: ${outcome}. ` +
            `${names} came back. ${fee}`,
          event.partyId,
        );
        out.push(built);
        attachTo = built;
        break;
      }

      case 'PartyAwaitingWord': {
        // The loudest thing in the report: the Party has stopped and is waiting. The
        // options themselves are not listed here — they are a decision to be taken in the
        // front end, from `wordOffers` and `wordProse`, not a paragraph to be read.
        anchor(event.day, event.partyId);
        const words = wordProse(event, career, content);
        out.push(
          paragraph(
            'word',
            event.day,
            `${words.prompt} They are waiting on your word, and will act on their own ` +
              `judgement after ${formatDay(event.timesOutOn, career)}.`,
            event.partyId,
          ),
        );
        break;
      }

      case 'PartyAnswered': {
        anchor(event.day, event.partyId);
        const label = wordProse(event, career, content).labels[event.optionId];
        const said = label ?? 'Word went back.';
        const built = paragraph(
          'answer',
          event.day,
          event.byDefault
            ? `No word went back in time, and they did what they thought best. ${said}`
            : `Word goes back up the road. ${said}`,
          event.partyId,
        );
        out.push(built);
        attachTo = built;
        break;
      }

      case 'PartyTurnedBack':
        addNote(
          event.day,
          `${workNamed(career, event.commissionId)} is called off. They come home with ` +
            `${String(event.beatsResolved)} of ${String(event.beatCount)} of it behind them.`,
        );
        break;

      case 'UpkeepOwed':
        anchor(event.day);
        out.push(
          paragraph(
            'coin',
            event.day,
            `Upkeep of ${coin(event.amount)} falls due. ${coin(event.balance)} remains.`,
          ),
        );
        break;

      case 'CoinChanged': {
        // Upkeep, a Hall improvement and a joining fee each already have a line of their
        // own carrying the amount, so the movement is not told a second time here (E3, E4).
        if (
          event.reason === 'upkeep' ||
          event.reason === 'hall' ||
          event.reason === 'recruitment' ||
          // A Transfer and a Poaching each already have a line of their own carrying the
          // fee, told on the `HeroJoined` that closes the moment (E5 §4).
          event.reason === 'transfer' ||
          event.reason === 'poach'
        ) {
          break;
        }
        if (event.reason === 'fee') {
          if (attachTo !== undefined) {
            attachTo.text += ` The Guild holds ${coin(event.balance)}.`;
          }
          break;
        }
        const movement =
          event.delta < 0
            ? `It cost the Guild ${coin(Math.abs(event.delta))}`
            : `It brought the Guild ${coin(event.delta)}`;
        const line = `${movement}; ${coin(event.balance)} remains.`;
        if (attachTo === undefined) addNote(event.day, line);
        else attachTo.text += ` ${line}`;
        break;
      }

      case 'PatronRegardChanged':
        if (event.delta !== 0) {
          addNote(
            event.day,
            sentence(
              `Regard from ${patronName(world, event.patronId)} moved ` +
                `${event.delta > 0 ? 'up' : 'down'}: ${event.reason}`,
            ),
          );
        }
        break;

      case 'CommissionRefused':
        addNote(event.day, refusalText(event, career, world));
        break;

      case 'InsistenceApplied': {
        const name = heroName(world, event.heroId);
        addNote(
          event.day,
          event.delta === 0
            ? `You insisted, and ${name} goes anyway. Their Regard for you was already as ` +
                'low as it goes.'
            : `You insisted, and ${name} goes anyway: it cost ${Math.abs(event.delta)} Regard, ` +
                `leaving ${signed(event.value)}.`,
        );
        break;
      }

      case 'HeroDeparted': {
        const departed = world.heroes.get(event.heroId);
        const last = departed?.exit?.reason ?? departed?.regardForGuildmaster?.reason;
        const fallen = `Regard for you had fallen to ${signed(event.regardValue)}`;
        addNote(
          event.day,
          last === undefined
            ? `${heroName(world, event.heroId)} has left the Guild. ${fallen}.`
            : `${heroName(world, event.heroId)} has left the Guild. ${fallen}, and the last ` +
                `thing to move it was: ${last}.`,
        );
        break;
      }

      case 'HeroRegardForGuildmasterChanged':
        // Insistence already has its own sentence, and it says what it cost; drift is
        // gathered so that a whole Board refresh of it reads as one line (E2).
        if (event.reason === REASON_INSISTED) break;
        if (event.reason === REASON_DRIFTED) {
          if (drifting === undefined || drifting.day !== event.day) {
            flushDrift();
            drifting = { day: event.day, names: [] };
          }
          drifting.names.push(heroName(world, event.heroId));
          break;
        }
        if (event.delta !== 0) {
          addNote(
            event.day,
            sentence(
              `${heroName(world, event.heroId)} thinks ` +
                `${event.delta > 0 ? 'better' : 'worse'} of you: ${event.reason}`,
            ),
          );
        }
        break;

      case 'TraitGained':
        // Silent where an Injury or a Scar already tells it: the same Trait, the same
        // Hero, the same Day. Nothing is said twice.
        if (toldAsHarm.has(`${event.day}|${event.heroId}|${event.trait}`)) break;
        addNote(
          event.day,
          event.liftsOn === undefined
            ? `${heroName(world, event.heroId)} carries ${event.trait} from now on.`
            : `${heroName(world, event.heroId)} carries ${event.trait} until ` +
              `${formatDay(event.liftsOn, career)}.`,
        );
        break;

      case 'TraitLifted':
        addNote(event.day, `${heroName(world, event.heroId)} is clear of ${event.trait}.`);
        break;

      case 'HeroInjured':
        addNote(
          event.day,
          `${heroName(world, event.heroId)} came off worst: ${event.trait}, and no work ` +
            `until ${formatDay(event.liftsOn, career)}.`,
        );
        break;

      case 'InjuryLifted':
        addNote(
          event.day,
          `${heroName(world, event.heroId)} is over ${event.trait} after ` +
            `${count(event.daysBorne, 'Day', 'Days')}, and can be sent out again.`,
        );
        break;

      case 'HeroScarred': {
        const summary = world.traits.get(event.trait)?.summary;
        addNote(
          event.day,
          summary === undefined
            ? `${heroName(world, event.heroId)} will carry ${event.trait} for the rest of it.`
            : `${heroName(world, event.heroId)} will carry ${event.trait} for the rest of ` +
              `it: ${summary}`,
        );
        break;
      }

      case 'HeroDied':
        addNote(event.day, `${heroName(world, event.heroId)} did not come back.`);
        break;

      case 'HeroRetired': {
        // A Rival's Hero retires by the same rule and at the same age (E5-S1). One of
        // theirs who has gone has left the world with them — a Rival's Roster is not the
        // player's history to keep (ADR-0003) — so there is no name left to give, and the
        // line says as much rather than putting somebody else's career in your Guild's
        // mouth. One of your own is named, and served with you.
        const who = world.heroes.get(event.heroId);
        addNote(
          event.day,
          who === undefined
            ? `Somebody at another Guild has had enough of it at ${event.age}, after ` +
              `${count(event.yearsServed, 'year', 'years')} of it.`
            : `${who.name} has had enough of it at ${event.age}, after ` +
              `${count(event.yearsServed, 'year', 'years')} with ` +
              `${world.employedBy.get(event.heroId) ?? 'the Guild'}. ` +
              'They leave on their own terms.',
        );
        break;
      }

      case 'ApplicantsArrived': {
        const named = event.applicantIds
          .map((id) => applicantName(world, id))
          .filter((name): name is string => name !== undefined);
        const who =
          named.length === event.applicantIds.length
            ? `: ${joinNames(named)}`
            : '';
        addNote(
          event.day,
          `${count(event.applicantIds.length, 'person comes', 'people come')} to the Hall ` +
            `looking for work${who}. They will wait until ${formatDay(event.expiresOn, career)}.`,
        );
        break;
      }

      case 'ApplicantDeclined':
        if (event.reason === 'expired') {
          if (givingUp === undefined || givingUp.day !== event.day) {
            flushGivingUp();
            givingUp = { day: event.day, names: [] };
          }
          givingUp.names.push(event.name);
          break;
        }
        addNote(event.day, `You send ${event.name} away.`);
        break;

      case 'ApplicantAccepted':
        // Deliberately silent. The offer taken, the coin paid and the Roster gaining a
        // person are one moment for the reader, and `HeroJoined` is where it is told.
        break;

      case 'HeroJoined': {
        const crossed = crossedOver.get(`${event.day}|${event.heroId}`);
        if (crossed !== undefined) {
          // Somebody who came over from another Guild (E5-S2, E5-S3). One sentence for
          // the three events: who arrived, what it cost, and — where it was not done
          // above board — what it cost besides coin.
          const from = rivalName(world, crossed.rivalId);
          const bill =
            crossed.poached && crossed.regardDelta !== undefined && crossed.regardDelta !== 0
              ? ` ${from} will not forget it: ${Math.abs(crossed.regardDelta)} Regard, and ` +
                'they will be taking more off your Board.'
              : '';
          addNote(
            event.day,
            crossed.poached
              ? `${event.name} leaves ${from} for you at ${event.age}, for ` +
                `${coin(crossed.fee)} and without anybody asking them.${bill}`
              : `${event.name} comes over from ${from} at ${event.age}, for ` +
                `${coin(crossed.fee)}, and nobody has been wronged by it.`,
          );
          break;
        }
        const fee = feePaidFor.get(`${event.day}|${event.heroId}`);
        const paid = fee === undefined ? '' : ` for ${coin(fee)}`;
        addNote(
          event.day,
          event.formerHeroId === undefined
            ? `${event.name} joins the Roster at ${event.age}${paid}.`
            : `${event.name} is back on the Roster at ${event.age}${paid}, after walking ` +
              'out on you once already.',
        );
        break;
      }

      case 'HallImproved':
        anchor(event.day);
        out.push(
          paragraph(
            'coin',
            event.day,
            `The Hall has ${hallName(event.improvement)} at last: ${coin(event.cost)}, ` +
              `leaving ${groupDigits(event.balance)}.`,
          ),
        );
        break;

      case 'ConsequenceApplied':
        // Deliberately silent: the movement it announces arrives as its own event with
        // the clamping applied, and a score change is already told by the Beat.
        break;

      case 'CareerEnded': {
        anchor(event.day);
        const opening =
          event.reason === 'retirement'
            ? `${career.guild.guildmaster.name} retires on ${formatDay(event.day, career)}.`
            : `The Guild cannot meet its Upkeep. ${career.guild.name} closes on ` +
              `${formatDay(event.day, career)}.`;
        out.push(
          paragraph(
            'end',
            event.day,
            [opening, ...reckoningLines(event.reckoning, career)].join('\n'),
          ),
        );
        break;
      }

      default: {
        const unreachable: never = event;
        throw new NarrationError(
          `no narration for event ${String((unreachable as { type: string }).type)}`,
        );
      }
    }
  }

  flushDrift();
  flushGivingUp();
  flushRivalMoves();
  closeBoard();
  flushNotes();
  return out;
}
