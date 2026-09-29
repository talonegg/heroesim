// A Quest's return, read from the History (M9-F5, DL-111 items 2 and 3, DL-112 item 8, DL-113): what
// the report on Guild › Home shows, and what the return's one entry in the rail and the player's
// Guild's History gathers. It is read by its Party and its Quest, never from the last play's log, so
// a report reopens from its entry (Q7).
//
// What belongs to a return is what an event says it belongs to (principle 5, DL-112 item 2): every
// entry naming the Quest, read through the History's own index (`entriesFor`), which since M9-F1
// holds the Encounters, the consumables used, the outcome, the Loot, the Injuries and Deaths, and
// the XP, Morale and Regard the return caused (DL-114). Two things name no Quest, and are matched by
// Hero and night: a Level, since `levelUps` runs straight after the return and a Hero away trains
// for none, so a Level a Party's Hero gains that night follows the Quest's XP; and a dead Hero's gear
// going back to the Guild on the night of the Death (`gearReturn`). Nothing is built for a return
// written before M9-F1 (DL-113 item 3): its Morale and Regard name no Quest, and read as none.
//
// Nothing here computes a rule (ADR-0007): every figure is an event's payload, and the Patron's band
// now is the engine's `regardBand` of `patronRegardFor`.

import {
  entriesFor,
  patronRegardFor,
  regardBand,
  type EncounterOutcome,
  type Entry,
  type EngineEventOf,
  type GuildId,
  type HeroId,
  type History,
  type PartyId,
  type PatronId,
  type QuestBand,
  type QuestId,
  type RegardBand,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { nameIn, nightOf } from './names';
import { crossed, itemsWords, listed, narrateSegments, narrationFor, resolvedWords, textOf, type Narration, type Segment } from './narrate';
import { playDeps } from './reducer';
import { whenOf } from './selectors';

/** What a return is read by: its Party and its Quest (DL-112 item 8). */
export interface ReturnKey {
  partyId: PartyId;
  questId: QuestId;
}

/** A Quest band in words, as the home view says it. */
const bandWords: Readonly<Record<QuestBand, string>> = { fail: 'Failure', success: 'Success', strong: 'Strong success' };

/** A line in the History's words: its segments, each name opening whom it names, and its sentence. */
export interface ReturnLine {
  segments: Segment[];
  sentence: string;
}

/** An Encounter of the Quest, in the History's words, with the consumables the Party used on it. */
export interface ReturnEncounter extends ReturnLine {
  key: string;
  outcome: EncounterOutcome;
  used: ReturnLine[];
}

/** How one Hero of the Party fared. */
export interface HeroOutcome {
  heroId: HeroId;
  /** Their name when they went: the outcome's label. */
  name: string;
  /** The XP the Quest gave them; `null` for a Hero who died. */
  xp: number | null;
  /** The Levels they reached that night, in order. */
  levels: number[];
  /** Their Morale before the return and after it, and its band after, when the return moved it. */
  morale: { before: number; after: number; band: string } | null;
  /** The Injury the Quest left them with, and the night it heals; `null` for none. */
  injury: { name: string; heals: string } | null;
  /** They died on the Quest. */
  died: boolean;
  /** The gear a Hero who died carried, back to the Guild that night, by name. */
  gear: string[];
  /** Their Regard for each Party mate that moved into a new band on the return. */
  regard: { heroId: HeroId; name: string; bandBefore: RegardBand; bandAfter: RegardBand }[];
  /** What happened to them, each in a few words, in the order the report gives them: `gained 60 XP`, `reached Level 2`. */
  words: string[];
}

/** A Party's return, as the report and the entry read it. */
export interface QuestReturn {
  key: ReturnKey;
  guildId: GuildId;
  /** The night it came home. */
  turn: number;
  /** `Day 10, night`. */
  when: string;
  /** The Quest's name, its template's. */
  quest: string;
  /** Who offered it; `null` when the History does not say. */
  patron: { patronId: PatronId; name: string } | null;
  band: QuestBand;
  /** `Strong success`. */
  bandWords: string;
  /** The Party, in its order. */
  heroes: { heroId: HeroId; name: string }[];
  /** Each Encounter reached, in order, with the consumables used on it. */
  encounters: ReturnEncounter[];
  /** The consumables used on no Encounter: a heal of a Hero's Injury. */
  used: ReturnLine[];
  /** What the Quest paid the Guild, and the XP each Hero home alive gained. */
  reward: { wealth: number; fame: number; xp: number };
  /** The Loot found, each Item by name, with its quantity when more than one: `3 × Whetstone`. */
  loot: string[];
  /** Each Hero's outcome, in the Party's order. */
  outcomes: HeroOutcome[];
  /** The Patron's Regard for the Guild; `null` when the History names no Patron. */
  patronRegard: PatronStanding | null;
}

/**
 * The Patron's Regard for the Guild, alone and as a band (DL-111 item 3, Q3): the band the Quest
 * moved it into, or, since the core records Regard only when it crosses a band (DL-84), its band now.
 */
export interface PatronStanding {
  patronId: PatronId;
  name: string;
  /** The band it left and the band it moved into with this Quest; `null` when it did not cross one. */
  moved: { bandBefore: RegardBand; bandAfter: RegardBand } | null;
  /** Its band now, read from the world. */
  band: RegardBand;
  sentence: string;
}

type Resolved = EngineEventOf<'quest.resolved'>;

/** The `quest.resolved` of `key`'s return, and its place in the History; `null` when the History has none. */
function outcomeOf(history: History, key: ReturnKey): { entry: Resolved; position: number } | null {
  const positions = Object.hasOwn(history.byEntity, key.questId) ? (history.byEntity[key.questId] ?? []) : [];
  for (let at = positions.length - 1; at >= 0; at -= 1) {
    const position = positions[at] ?? -1;
    const entry = history.entries[position];
    if (entry?.type === 'quest.resolved' && (entry as Resolved).payload.partyId === key.partyId) return { entry: entry as Resolved, position };
  }
  return null;
}

/**
 * The entries of the night of the return from its outcome on, in the order they happened: where a
 * Level and a dead Hero's gear are found, by Hero and night.
 */
function nightFrom(history: History, position: number): Entry[] {
  const turn = history.entries[position]?.turn;
  const night: Entry[] = [];
  for (let at = position + 1; at < history.entries.length && history.entries[at]?.turn === turn; at += 1) night.push(history.entries[at] as Entry);
  return night;
}

function lineOf(entry: Entry, narration: Narration): ReturnLine {
  const segments = narrateSegments(entry as TurnEvent, narration);
  return { segments, sentence: textOf(segments) };
}

/**
 * Whether `entry` is a part of a Party's return, which the player's Guild's History gathers under
 * the return's one entry (DL-111 item 2, DL-113 item 1): an Encounter or a consumable used, an
 * Injury or a Death on a Quest; a Level a Hero gains on the night their Party came home (by Hero
 * and night, as `questReturn` reads it); and a dead Hero's gear going back that night. `entry` is
 * one of `history`'s. Its Loot is not a part: it is the next entry.
 */
export function partOfAReturn(history: History, entry: Entry): boolean {
  switch (entry.type) {
    case 'quest.encounter':
    case 'item.expended':
    case 'hero.died':
      return true;
    case 'hero.injured':
      return (entry as EngineEventOf<'hero.injured'>).payload.questId !== null;
    case 'item.returned':
      return (entry as EngineEventOf<'item.returned'>).payload.cause === 'died';
    case 'hero.levelled':
      return cameHomeThatNight(history, entry as EngineEventOf<'hero.levelled'>);
    default:
      return false;
  }
}

/** Whether the Hero `levelled` names came home with a Party on its night: an outcome that night names them. */
function cameHomeThatNight(history: History, levelled: EngineEventOf<'hero.levelled'>): boolean {
  const { heroId } = levelled.payload;
  const positions = Object.hasOwn(history.byEntity, heroId) ? (history.byEntity[heroId] ?? []) : [];
  // The Hero's positions ascend, and so do their Turns: the first of the night is found by halves.
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((history.entries[positions[middle] ?? -1]?.turn ?? Infinity) < levelled.turn) low = middle + 1;
    else high = middle;
  }
  for (let at = low; at < positions.length; at += 1) {
    const entry = history.entries[positions[at] ?? -1];
    if (entry === undefined || entry.turn !== levelled.turn) return false;
    if (entry.type === 'quest.resolved' && (entry as Resolved).payload.heroIds.includes(heroId)) return true;
  }
  return false;
}

/** `key`'s return, read from `document`'s History; `null` when the History holds no such return. */
export function questReturn(document: WorldDocument, key: ReturnKey): QuestReturn | null {
  const { world, history } = document;
  const found = outcomeOf(history, key);
  if (found === null) return null;
  const { entry: outcome, position } = found;
  const { payload, labels } = outcome;
  const named = (id: string): string => labels[id as keyof typeof labels] ?? 'a Hero';
  // In the order they happened: `entriesFor` gives the newest first.
  const ofQuest = entriesFor(history, key.questId).reverse();
  const offered = ofQuest.find((entry): entry is EngineEventOf<'quest.offered'> => entry.type === 'quest.offered');
  const patronId = offered?.payload.patronId ?? (outcome.participants.find((id) => id.startsWith('patron-')) as PatronId | undefined);
  const patronName = patronId === undefined ? undefined : (Object.hasOwn(world.patrons, patronId) ? world.patrons[patronId]?.name : undefined) ?? labels[patronId];
  const night = nightFrom(history, position);
  const narration = narrationFor(document, content);
  const ofParty = ofQuest.filter((entry) => (entry.payload as { partyId?: unknown }).partyId === key.partyId);
  const expended = ofParty.filter((entry): entry is EngineEventOf<'item.expended'> => entry.type === 'item.expended');
  const encounters = ofParty
    .filter((entry): entry is EngineEventOf<'quest.encounter'> => entry.type === 'quest.encounter')
    .map((entry): ReturnEncounter => ({
      key: `encounter-${entry.payload.index}`,
      outcome: entry.payload.outcome,
      ...lineOf(entry, narration),
      used: expended.filter((use) => 'encounterIndex' in use.payload && use.payload.encounterIndex === entry.payload.index).map((use) => lineOf(use, narration)),
    }));
  const injured = ofQuest.filter((entry): entry is EngineEventOf<'hero.injured'> => entry.type === 'hero.injured');
  const morale = ofQuest.filter((entry): entry is EngineEventOf<'hero.morale-changed'> => entry.type === 'hero.morale-changed');
  const regard = ofQuest.filter((entry): entry is EngineEventOf<'hero.regard-changed'> => entry.type === 'hero.regard-changed');
  const returned = night.filter((entry): entry is EngineEventOf<'item.returned'> => entry.type === 'item.returned' && (entry as EngineEventOf<'item.returned'>).payload.cause === 'died');
  const guildName = labels[payload.guildId] ?? 'the Guild';
  const loot = ofParty
    .filter((entry): entry is EngineEventOf<'quest.loot'> => entry.type === 'quest.loot')
    .map((entry) => itemsWords(content, entry.payload.definitionKey, entry.payload.quantity));

  const outcomes = payload.heroIds.map((heroId): HeroOutcome => {
    const died = payload.deaths.includes(heroId);
    const xp = died ? null : payload.xpPerHero;
    const levels = night
      .filter((entry): entry is EngineEventOf<'hero.levelled'> => entry.type === 'hero.levelled' && (entry as EngineEventOf<'hero.levelled'>).payload.heroId === heroId)
      .map((entry) => entry.payload.level);
    const moved = morale.filter((entry) => entry.payload.heroId === heroId);
    const [first] = moved;
    const last = moved.at(-1);
    const mood = first === undefined || last === undefined ? null : { before: first.payload.before, after: last.payload.after, band: last.payload.bandAfter };
    const hurt = injured.find((entry) => entry.payload.heroId === heroId);
    const injury = hurt === undefined ? null : { name: nameIn(content.injuries, hurt.payload.typeKey), heals: nightOf(hurt.payload.healsOnTurn) };
    const gear = died ? returned.filter((entry) => entry.payload.heroId === heroId).map((entry) => nameIn(content.items, entry.payload.definitionKey)) : [];
    const mates = regard
      .filter((entry) => entry.payload.heroId === heroId)
      .map(({ payload: { entityId, bandBefore, bandAfter } }) => ({ heroId: entityId as HeroId, name: named(entityId), bandBefore, bandAfter }));
    const words = [
      ...(died ? ['died on the Quest'] : []),
      ...(gear.length === 0 ? [] : [`their gear went back to ${guildName}: ${listed(gear)}`]),
      ...(xp === null ? [] : [`gained ${xp} XP`]),
      ...levels.map((level) => `reached Level ${level}`),
      ...(mood === null ? [] : [`Morale went from ${mood.before} to ${mood.after}, ${mood.band}`]),
      ...(injury === null ? [] : [`injured: ${injury.name}, healing on ${injury.heals}`]),
      ...mates.map((mate) => `Regard for ${mate.name} ${crossed(mate.bandBefore, mate.bandAfter)}`),
    ];
    return { heroId, name: named(heroId), xp, levels, morale: mood, injury, died, gear, regard: mates, words };
  });

  return {
    key,
    guildId: payload.guildId,
    turn: outcome.turn,
    when: whenOf(outcome.turn),
    quest: nameIn(content.questTemplates, payload.templateKey),
    patron: patronId === undefined || patronName === undefined ? null : { patronId, name: patronName },
    band: payload.band,
    bandWords: bandWords[payload.band],
    heroes: payload.heroIds.map((heroId) => ({ heroId, name: named(heroId) })),
    encounters,
    used: expended.filter((use) => !('encounterIndex' in use.payload)).map((use) => lineOf(use, narration)),
    reward: { wealth: payload.wealthDelta, fame: payload.fameDelta, xp: payload.xpPerHero },
    loot,
    outcomes,
    patronRegard: patronId === undefined || patronName === undefined ? null : standing(document, ofQuest, { patronId, name: patronName, guildId: payload.guildId, guildName }),
  };
}

/** The Patron's Regard for the Guild after the return: the crossing its `patron.regard-changed` names, and the band now. */
function standing(document: WorldDocument, ofQuest: readonly Entry[], about: { patronId: PatronId; name: string; guildId: GuildId; guildName: string }): PatronStanding {
  const { patronId, name, guildId, guildName } = about;
  const crossing = ofQuest.find(
    (entry): entry is EngineEventOf<'patron.regard-changed'> =>
      entry.type === 'patron.regard-changed' &&
      (entry as EngineEventOf<'patron.regard-changed'>).payload.patronId === patronId &&
      (entry as EngineEventOf<'patron.regard-changed'>).payload.guildId === guildId,
  );
  const patron = Object.hasOwn(document.world.patrons, patronId) ? document.world.patrons[patronId] : undefined;
  const band = regardBand(patron === undefined ? 0 : patronRegardFor(patron, guildId), playDeps(document).config);
  const moved = crossing === undefined ? null : { bandBefore: crossing.payload.bandBefore, bandAfter: crossing.payload.bandAfter };
  const sentence =
    moved === null
      ? `${name}'s Regard for ${guildName} did not move into a new band with this Quest: it is ${band} now.`
      : `${name}'s Regard for ${guildName} ${crossed(moved.bandBefore, moved.bandAfter)} with this Quest.`;
  return { patronId, name, moved, band, sentence };
}

// ── The report ───────────────────────────────────────────────────────────────────────────────

/**
 * A section of the Quest report (DL-112 item 8), typed, so that a later feature adds one (DL-111
 * item 3's "further outcomes"): the Quest, its Patron and its band; each Encounter with the
 * consumables used; the rewards, Wealth, Fame, XP and Loot; each Hero's outcome; and the Patron's
 * Regard for the Guild.
 */
export type ReportSection =
  | { kind: 'quest'; quest: string; patron: string | null; band: QuestBand; bandWords: string; heroes: string; when: string }
  | { kind: 'encounters'; encounters: ReturnEncounter[]; used: ReturnLine[] }
  | { kind: 'rewards'; wealth: number; fame: number; xp: number; loot: string[] }
  | { kind: 'heroes'; outcomes: HeroOutcome[] }
  | { kind: 'patron'; standing: PatronStanding };

/** The report's sections in DL-112 item 8's order; a section with nothing to say is left out. */
export function reportSections(report: QuestReturn): ReportSection[] {
  const { quest, patron, band, bandWords, heroes, turn, encounters, used, reward, loot, outcomes, patronRegard } = report;
  return [
    { kind: 'quest', quest, patron: patron?.name ?? null, band, bandWords, heroes: listed(heroes.map((hero) => hero.name)), when: nightOf(turn) },
    ...(encounters.length === 0 && used.length === 0 ? [] : [{ kind: 'encounters' as const, encounters, used }]),
    { kind: 'rewards', ...reward, loot },
    { kind: 'heroes', outcomes },
    ...(patronRegard === null ? [] : [{ kind: 'patron' as const, standing: patronRegard }]),
  ];
}

// ── The entry ────────────────────────────────────────────────────────────────────────────────

/**
 * A return as one entry, in the rail and the player's Guild's History alike (DL-111 item 2, DL-112
 * item 8): the History's sentence of the outcome with its band apart, to be bold, then the reward;
 * behind a disclosure, a line per Hero of the Party gathering what happened to them; and a way to
 * the report. Its Loot is the next entry, and no Encounter is under it.
 */
export interface ReturnEntry {
  key: ReturnKey;
  quest: string;
  /** `Day 10, night`. */
  when: string;
  band: QuestBand;
  /** The words before the band, `The Lantern's Party came home from Clear the barrow and `. */
  lead: Segment[];
  /** The band as the sentence says it: `succeeded strongly`. */
  bandSaid: string;
  /** The words after it, the reward: `: Wealth +180, Fame +4.` */
  rest: Segment[];
  /** What the disclosure says: `3 Heroes`. */
  heroesWords: string;
  /** A line per Hero, in the Party's order: their name, which opens their page, then what happened to them. */
  heroes: { heroId: HeroId; segments: Segment[]; sentence: string }[];
}

/** `key`'s return as its entry; `null` when the History holds no such return. */
export function returnEntry(document: WorldDocument, key: ReturnKey): ReturnEntry | null {
  const report = questReturn(document, key);
  const found = report === null ? null : outcomeOf(document.history, key);
  if (report === null || found === null) return null;
  const { lead, band, rest } = resolvedWords(found.entry, { content });
  const [first, ...after] = lead;
  const opening = first === undefined ? [] : [{ ...first, text: first.text.charAt(0).toUpperCase() + first.text.slice(1) }, ...after];
  const count = report.outcomes.length;
  return {
    key,
    quest: report.quest,
    when: report.when,
    band: report.band,
    lead: opening,
    bandSaid: band,
    rest,
    heroesWords: `${count} ${count === 1 ? 'Hero' : 'Heroes'}`,
    heroes: report.outcomes.map(({ heroId, name, words }) => {
      const segments: Segment[] = [
        { kind: 'name', text: name, entityId: heroId, table: 'heroes' },
        { kind: 'text', text: words.length === 0 ? '.' : `: ${words.join('; ')}.` },
      ];
      return { heroId, segments, sentence: textOf(segments) };
    }),
  };
}
