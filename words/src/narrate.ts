// The narration (v1.1.6-S12, DL-186 item 1): a typed event in, one sentence out, for the CLI and the
// page alike. The engine emits data, never prose (ADR-0003); these are the words both front ends put
// it in, written once. A sentence is its words and a slot for each name in it, each slot carrying the
// id it was read from and what it names; a front end's Namer fills each slot its own way: the CLI
// with the id its commands take, `Brenna Ashcombe (hero-000007)`, the page with a name that opens whom
// it names. One narration serves both front ends (DL-198); where the page's words differed from the
// CLI's (DL-65 item 6: a Party called its Guild's and a Quest by its template's name, and no id),
// the difference is the slots'.
//
// Names come from each event's labels, written when it happened, so a Hero or a Guild whose row has
// since gone still reads; content keys become content's names. One map, keyed by every event type, so
// that `tsc -b` refuses a type the engine adds until it has words, and `narrate.test.ts` holds it to
// the union. A module's own event, which the engine does not type, gets one generic sentence for any
// type, whatever its payload: the Module, its type and whom it concerns (M8-S2, M8-S4, DL-77, DL-79).
//
// A date in a sentence is the calendar's, `the night of Year 1 Day 8`, from the game's own length of
// a Year, which each front end passes in (DL-210, DL-206 items 30 to 33).

import {
  compareByCodeUnit,
  encounterForm,
  isId,
  isModuleEvent,
  parseId,
  regardBandNames,
  type EndingReason,
  type EngineEvent,
  type EngineEventOf,
  type EngineEventType,
  type EntityId,
  type FormDecided,
  type GearMove,
  type GearReturnCause,
  type HeroRegardCause,
  type ModuleEvent,
  type OfferId,
  type PartyId,
  type PatronRegardCause,
  type QuestBand,
  type QuestId,
  type RegardBand,
  type StopReason,
  type TableName,
  type TransferOfferEndCause,
  type TurnEvent,
  type World,
} from '@heroesim/engine';
import { type ContentSet, type Degree, type FacilityKey } from '@heroesim/engine/content';
import { dateOfTurn, nightOfDay, nightOfTurn, type Calendar } from './calendar.js';
import { coinWords } from './coins.js';
import { listed, nameIn, signed, signedCoins } from './names.js';

// ── Sentences ────────────────────────────────────────────────────────────────────────────────

/**
 * Someone a sentence names by the label its event carries: a Guild, a Guildmaster, a Patron, or
 * whoever a Regard or a module's event concerns (`name`); or a Hero the sentence names as a Hero
 * (`hero`), whom the CLI names with the id its commands take. `table` is what its id is of, `null`
 * for an id of no table; `label` is undefined where the event carries none.
 */
export interface NameSlot {
  kind: 'name' | 'hero';
  table: TableName | null;
  id: EntityId;
  label: string | undefined;
}

/** A Quest: by its template's name where the sentence knows it, else by its id alone. */
export interface QuestSlot {
  kind: 'quest';
  id: QuestId;
  template: string | undefined;
}

/**
 * A Party, which the CLI names by its id: with its Guild where the page calls it that Guild's Party,
 * with its Heroes where the page names them instead, or with neither, the page's `Party`.
 */
export interface PartySlot {
  kind: 'party';
  id: PartyId;
  guild?: NameSlot;
  heroes?: readonly NameSlot[];
}

/**
 * A Transfer Offer: the one a Transfer accepted, the CLI's id and the page's "its Transfer Offer"; or,
 * `withdrawn`, one a stop names that the world no longer holds, the CLI's id and the page's "an Offer
 * since withdrawn" (v1.1.7-S3, DL-209).
 */
export interface OfferSlot {
  kind: 'offer';
  id: OfferId;
  withdrawn?: true;
}

/**
 * The Parties a stop names (v1.1.7-S3, DL-209): `noun`, the words `Party` or `Parties` (the page
 * counts them, `3 Parties`), or `ids`, the Parties listed after what they did by the id a command
 * takes (`: party-000004`), which the page leaves out.
 */
export interface PartiesSlot {
  kind: 'parties';
  ids: readonly PartyId[];
  form: 'noun' | 'ids';
}

/**
 * What the CLI points the player to (DL-209, DL-240): a command to run, `(show board)`, or the flag a
 * refusal of `new` asks for, `: --guild <name>`. The page leaves it out: it has a button or a form
 * for it (`nextFor` in `views/stop.tsx`).
 */
export interface CommandSlot {
  kind: 'command';
  command:
    | 'show-board'
    | 'show-pool'
    | 'answer-offer'
    | 'show-roster'
    | 'show-rosters'
    | 'show-market'
    | 'show-offers'
    | 'roster-holds'
    | 'market-holds'
    | 'pool-holds'
    | 'name-guild'
    | 'name-guildmaster'
    | 'portrait-sex';
}

/** The ids a command takes, after what they name, `(stack-000004)`: the CLI's alone. */
export interface IdsSlot {
  kind: 'ids';
  ids: readonly string[];
}

/**
 * A date, `Year 1 Day 181`, which the CLI follows with its Turn, `(Turn 540)`, as it does wherever it
 * shows the Turn beside a date (docs/agents/ui-text.md; DL-240).
 */
export interface DateSlot {
  kind: 'date';
  turn: number;
  date: string;
}

/**
 * What the player gave a new game's setup, which a refusal of it quotes (DL-240): the CLI says it as
 * its flag gave it, `--age 51`, `--stats negotiation=16`; the page as the form's value, `51`, `"other"`.
 * `key` is the Stat a `stats` value is for.
 */
export interface EntrySlot {
  kind: 'entry';
  field: 'sex' | 'age' | 'stats';
  value: string | number;
  key?: string;
}

/** A slot for a name in a sentence, which a front end's Namer fills. */
export type Slot = NameSlot | QuestSlot | PartySlot | OfferSlot | IdsSlot | PartiesSlot | CommandSlot | DateSlot | EntrySlot;

/** A piece of a sentence: its words, or a slot. */
export type Part = { kind: 'text'; text: string } | Slot;

/** A sentence: its words and its slots, in order, neighbouring words one piece. */
export type Sentence = readonly Part[];

/** A front end's names for what each slot holds. */
export type Namer<T> = (slot: Slot) => T;

/** A sentence as text, each slot as `namer` names it. */
export function sentenceText(sentence: Sentence, namer: Namer<string>): string {
  return sentence.map((part) => (part.kind === 'text' ? part.text : namer(part))).join('');
}

/** What goes into a sentence: words, a number, a slot or a sentence already made. */
export type Piece = string | number | Slot | Sentence;

/**
 * A sentence from a template, `say\`${called(event, guildId)} was founded.\``: its words as written,
 * and each slot where the template puts it. Neighbouring words join into one piece. The refusals'
 * table writes its sentences with it too (`refusals.ts`).
 */
export function say(strings: TemplateStringsArray, ...pieces: readonly Piece[]): Part[] {
  const out: Part[] = [];
  const words = (text: string): void => {
    if (text === '') return;
    const last = out.at(-1);
    if (last?.kind === 'text') out[out.length - 1] = { kind: 'text', text: last.text + text };
    else out.push({ kind: 'text', text });
  };
  const put = (part: Part): void => {
    if (part.kind === 'text') words(part.text);
    else out.push(part);
  };
  strings.forEach((text, index) => {
    words(text);
    if (index >= pieces.length) return;
    const piece = pieces[index] as Piece;
    if (typeof piece === 'string' || typeof piece === 'number') words(String(piece));
    else if (Array.isArray(piece)) for (const part of piece as Sentence) put(part);
    else put(piece as Slot);
  });
  return out;
}

/** `listed` for sentences: `a`, `a and b`, `a, b and c`, the slots in each kept. */
function listedSentences(items: readonly Sentence[]): Sentence {
  if (items.length <= 1) return items[0] ?? [];
  return say`${items.slice(0, -1).flatMap((item, index) => (index === 0 ? item : say`, ${item}`))} and ${items.at(-1) ?? []}`;
}

// ── Slots ────────────────────────────────────────────────────────────────────────────────────

type Labelled = Pick<TurnEvent, 'labels'>;

function slotOf(kind: NameSlot['kind'], event: Labelled, id: EntityId): NameSlot {
  return { kind, table: parseId(id)?.table ?? null, id, label: event.labels[id] };
}

/** A participant by the label the event carries. */
function called(event: Labelled, id: EntityId): NameSlot {
  return slotOf('name', event, id);
}

/** A Hero, named as a Hero. */
function hero(event: Labelled, id: EntityId): NameSlot {
  return slotOf('hero', event, id);
}

function quest(id: QuestId, template?: string): QuestSlot {
  return { kind: 'quest', id, template };
}

export function ids(...each: readonly string[]): IdsSlot {
  return { kind: 'ids', ids: each };
}

// ── Words ────────────────────────────────────────────────────────────────────────────────────

const bandWords: Readonly<Record<QuestBand, string>> = { fail: 'failed', success: 'succeeded', strong: 'succeeded strongly' };

/** A Degree, a glossary term in each (v1.1.4-S2, `CONTEXT.md` Degree). */
export const degreeWords: Readonly<Record<Degree, string>> = { triumph: 'Triumph', success: 'Success', setback: 'Setback', failure: 'Failure' };

/** The Encounter's one sentence when form decided a Check's Degree (v1.1.4-S3, `encounterForm`), for the Party, naming no Hero. */
const formWords: Readonly<Record<FormDecided, string>> = { lowered: 'Low spirits told against them.', raised: 'Their high spirits carried them through.' };

/** What befell a Guild at its ending, after its name. */
export const endingWords: Readonly<Record<EndingReason, string>> = Object.freeze({
  retirement: 'lost its Guildmaster to Retirement',
  bankruptcy: 'went bankrupt',
  'roster-wiped': 'had its Roster wiped out',
});

/** A facility of the Hall as a sentence names it: the infirmary, the training yard, the quarters. */
export const facilityNames: Readonly<Record<FacilityKey, string>> = Object.freeze({
  infirmary: 'infirmary',
  trainingYard: 'training yard',
  quarters: 'quarters',
});

/** The verb a facility's name takes in a sentence: the infirmary is, the quarters are. */
export const facilityIs: Readonly<Record<FacilityKey, string>> = Object.freeze({
  infirmary: 'is',
  trainingYard: 'is',
  quarters: 'are',
});

/** What moved a Patron's Regard, after the band it reached. */
const patronRegardWords: Readonly<Record<PatronRegardCause, string>> = {
  'quest-success': 'after a Quest of theirs succeeded',
  'quest-failure': 'after a Quest of theirs failed',
  'offer-expired': 'when an Offer of theirs went untaken',
  recovery: 'as time passed',
  module: 'through a Module',
};

/** What moved a Hero's Regard for another Hero, after the band it reached (M4-S4). */
const heroRegardWords: Readonly<Record<HeroRegardCause, string>> = {
  'shared-quest': 'after a Quest together',
  decay: 'as time passed apart',
  module: 'through a Module',
};

/** Why gear went back to a Guild (M5-S2), after the Hero it came from. */
const gearReturnWords: Readonly<Record<GearReturnCause, string>> = {
  died: ', who died',
  retired: ', who retired',
  'guild-folded': ' as the Guild folded',
  transferred: ', who was transferred',
};

/** What became of a Transfer Offer that went unanswered (M6-S2), after the Offer. */
const offerEndWords: Readonly<Record<TransferOfferEndCause, string>> = {
  expired: 'expired unanswered',
  'hero-left': 'lapsed: the Hero left that Roster',
  'guild-folded': 'lapsed as a Guild folded',
};

/** `rose from neutral to warm`, `fell from cool to hostile`: a Regard band crossed, never a number (M4-S5). */
export function crossed(before: RegardBand, after: RegardBand): string {
  const way = regardBandNames.indexOf(after) > regardBandNames.indexOf(before) ? 'rose' : 'fell';
  return `${way} from ${before} to ${after}`;
}

/** Items as a sentence names them (M5-S4): `Whetstone`, `3 × Whetstone`. */
export function itemsWords(content: ContentSet, definitionKey: string, quantity: number): string {
  const name = nameIn(content.items, definitionKey);
  return quantity === 1 ? name : `${quantity} × ${name}`;
}

/** An Item of gear that moved, by content's name and the id `equip` takes: `Arming sword (stack-000004)` in the CLI. */
function gear(move: GearMove, content: ContentSet): Sentence {
  return say`${nameIn(content.items, move.definitionKey)}${ids(move.itemId ?? move.stackId ?? '')}`;
}

// ── The map ──────────────────────────────────────────────────────────────────────────────────

type Sentences = { [Type in EngineEventType]: (event: EngineEventOf<Type>, content: ContentSet, calendar: Calendar) => Sentence };

const sentences: Sentences = {
  'world.created': (event) => say`The world was made from seed ${event.payload.seed}.`,
  'guild.founded': (event) => say`${called(event, event.payload.guildId)} was founded.`,
  'guildmaster.generated': (event) => say`${called(event, event.payload.guildmasterId)} leads ${called(event, event.payload.guildId)}.`,
  'hero.generated': (event, content) => {
    const { heroId, guildId, classKey } = event.payload;
    const where = guildId === null ? 'the Unattached pool' : called(event, guildId);
    return say`${hero(event, heroId)}, ${nameIn(content.classes, classKey)}, joined ${where}.`;
  },
  'patron.generated': (event, content) =>
    say`${called(event, event.payload.patronId)} of the ${nameIn(content.spheres, event.payload.sphereKey)} became a Patron.`,
  'world.rules-adopted': (event) => say`The rules moved from configVersion ${event.payload.oldConfigVersion} to ${event.payload.newConfigVersion}.`,
  'guild.upkeep-paid': (event) =>
    say`${called(event, event.payload.guildId)} paid ${coinWords(event.payload.amount)} in Upkeep, leaving ${coinWords(event.payload.wealthAfter)}.`,
  // M9-S1: the night Bankruptcy falls on, as the countdown gives it (DL-95), from the event alone.
  'guild.below-floor': (event, _content, calendar) => {
    const { guildId, wealth, floor, dueDay } = event.payload;
    return say`${called(event, guildId)}'s Wealth, ${coinWords(wealth)}, fell below the Bankruptcy floor of ${coinWords(floor)}: Bankruptcy on ${nightOfDay(dueDay, calendar)} unless it recovers by then.`;
  },
  'guild.floor-recovered': (event, _content, calendar) => {
    const { guildId, wealth, floor, belowFloorSince } = event.payload;
    return say`${called(event, guildId)}'s Wealth, ${coinWords(wealth)}, is back to the Bankruptcy floor of ${coinWords(floor)} or more, after falling below it on ${dateOfTurn(belowFloorSince, calendar)}: no Bankruptcy is due.`;
  },
  'hero.recruited': (event) => say`${called(event, event.payload.guildId)} signed ${hero(event, event.payload.heroId)} for ${coinWords(event.payload.fee)}.`,
  'hero.left-pool': (event) => say`${hero(event, event.payload.heroId)} left the Unattached pool.`,
  'quest.offered': (event, content) => {
    const { patronId, templateKey, questId } = event.payload;
    return say`${called(event, patronId)} offered ${quest(questId, nameIn(content.questTemplates, templateKey))}.`;
  },
  'quest.expired': (event, content) => {
    const { patronId, templateKey, questId } = event.payload;
    return say`${called(event, patronId)}'s ${quest(questId, nameIn(content.questTemplates, templateKey))} expired untaken.`;
  },
  'quest.taken': (event, content, calendar) => {
    // What the Party carries (M5-S3, DL-50), when it carries anything; an entry written before DL-50 has none.
    const { guildId, partyId, questId, heroIds, returnsOnTurn, consumables = [] } = event.payload;
    const carrying = consumables.map(({ definitionKey, quantity }) => `${nameIn(content.items, definitionKey)} ×${quantity}`);
    const carried = carrying.length === 0 ? '' : `, carrying ${listed(carrying)}`;
    const party: PartySlot = { kind: 'party', id: partyId, heroes: heroIds.map((id) => hero(event, id)) };
    return say`${called(event, guildId)} sent ${party} on ${quest(questId)}, back on ${nightOfTurn(returnsOnTurn, calendar)}${carried}.`;
  },
  'quest.encounter': (event, content) => {
    // The roll and target are the engine's; the sentence says only how it went and what it cost, and
    // which Encounter it was, counted from 1 as a consumable's sentence counts them (item.expended).
    // Its Degree, and the Check that decided it when there are several or it is named otherwise than
    // its Encounter (DL-152). When form decided a Check's Degree, one sentence more, for the Party,
    // naming no Hero (DL-148 item 12).
    const { guildId, partyId, index, encounterKey, outcome, injured, died, decidedBy, checks } = event.payload;
    const went = outcome === 'success' ? 'came through' : 'failed at';
    const hurt = [...injured.map((id) => say`${hero(event, id)} was injured`), ...died.map((id) => say`${hero(event, id)} was killed`)];
    const encounterName = nameIn(content.encounters, encounterKey);
    const encounter = Object.hasOwn(content.encounters, encounterKey) ? content.encounters[encounterKey] : undefined;
    const decider = encounter?.checks.find((it) => it.key === decidedBy)?.name ?? decidedBy;
    const by = checks.length > 1 || decider !== encounterName ? `, decided by ${decider}` : '';
    const form = encounterForm(event.payload);
    const told = form === undefined ? '' : ` ${formWords[form]}`;
    const party: PartySlot = { kind: 'party', id: partyId, guild: called(event, guildId) };
    return say`${party} ${went} ${encounterName} (Encounter ${index + 1}), a ${degreeWords[event.payload.degree]}${by}${hurt.length === 0 ? '' : say`: ${listedSentences(hurt)}`}.${told}`;
  },
  'quest.resolved': (event, content) => {
    const { lead, band, rest } = resolvedParts(event, content);
    return say`${lead}${band}${rest}`;
  },
  'quest.loot': (event, content) => {
    // A unique Item by name and the id `equip` and `sell` take; a common one by name, quantity and the
    // stack it joined (M5-S5). A unique Item's quantity is 1 (content's check).
    const { guildId, questId, definitionKey, quantity, itemId, stackId } = event.payload;
    return say`${called(event, guildId)} found Loot on ${quest(questId)}: ${itemsWords(content, definitionKey, quantity)}${ids(itemId ?? stackId ?? 'no stack')}.`;
  },
  'hero.injured': (event, content, calendar) => {
    const { heroId, typeKey, healsOnTurn } = event.payload;
    return say`${hero(event, heroId)} was injured (${nameIn(content.injuries, typeKey)}), healing on ${nightOfTurn(healsOnTurn, calendar)}.`;
  },
  'hero.died': (event) => say`${hero(event, event.payload.heroId)} died on ${quest(event.payload.questId)}.`,
  'hero.xp-gained': (event) => say`${hero(event, event.payload.heroId)} gained ${event.payload.amount} XP.`,
  'hero.morale-changed': (event) => {
    const { heroId, before, after, bandAfter } = event.payload;
    return say`${hero(event, heroId)}'s Morale went from ${before} to ${after}, ${bandAfter}.`;
  },
  'hero.fatigue-changed': (event) => {
    const { heroId, before, after, bandAfter } = event.payload;
    return say`${hero(event, heroId)}'s Fatigue went from ${before} to ${after}, ${bandAfter}.`;
  },
  'hero.healed': (event, content) => {
    const { heroId, typeKey, traitKey } = event.payload;
    const left = traitKey === null ? '' : `, left ${nameIn(content.heroTraits, traitKey)}`;
    return say`${hero(event, heroId)} recovered from ${nameIn(content.injuries, typeKey)}${left}.`;
  },
  // v1.1.4-S7: an earned Trait (DL-148 item 25), named with the Encounter that gave it.
  'hero.trait-gained': (event, content) => {
    const { heroId, traitKey, questId, encounterKey } = event.payload;
    return say`${hero(event, heroId)} earned the Trait ${nameIn(content.heroTraits, traitKey)} on ${quest(questId)}, at ${nameIn(content.encounters, encounterKey)}.`;
  },
  // v1.1.4-S7: a Trait an Injury left replaced one it conflicts with (DL-150 item 5).
  'hero.trait-lost': (event, content) => {
    const { heroId, traitKey, replacedBy } = event.payload;
    return say`${hero(event, heroId)} lost the Trait ${nameIn(content.heroTraits, traitKey)}, replaced by ${nameIn(content.heroTraits, replacedBy)}.`;
  },
  'hero.retired': (event) => say`${hero(event, event.payload.heroId)} retired from ${called(event, event.payload.guildId)} at ${event.payload.age}.`,
  'hero.declined': (event, content) => {
    const { heroId, statKey, delta, age } = event.payload;
    return say`${hero(event, heroId)}, at ${age}, lost ${-delta} ${nameIn(content.stats, statKey)} to age.`;
  },
  'game.ended': (event) => say`The game ended: ${called(event, event.payload.guildId)} ${endingWords[event.payload.reason]}.`,
  'guild.folded': (event) => say`${called(event, event.payload.guildId)} ${endingWords[event.payload.reason]} and folded.`,
  // M9-S2: a Rival's Guildmaster's Retirement, met by Succession (DL-100 item 3).
  'guildmaster.succeeded': (event) => {
    const { guildId, guildmasterId, successorId, age } = event.payload;
    return say`${called(event, guildmasterId)} retired at ${age} as Guildmaster of ${called(event, guildId)}, and ${called(event, successorId)} succeeded them.`;
  },
  'hero.left-guild': (event) => say`${hero(event, event.payload.heroId)} left ${called(event, event.payload.guildId)} for the Unattached pool.`,
  'guild.improved': (event, content) => {
    const { guildId, facility, grade, improvementKey, cost } = event.payload;
    return say`${called(event, guildId)} built ${nameIn(content.improvements, improvementKey)} for ${coinWords(cost)}: its ${facilityNames[facility]} ${facilityIs[facility]} now grade ${grade}.`;
  },
  // DL-287: a Captain named to an empty post, or in another's place, the post then locked until a date.
  'guild.captain-named': (event, _content, calendar) => {
    const { guildId, heroId, replacedId, lockedUntilTurn } = event.payload;
    if (replacedId === null) return say`${called(event, guildId)} named ${hero(event, heroId)} its Captain.`;
    const locked = lockedUntilTurn === null ? '' : say`; the post cannot change again before ${dateOfTurn(lockedUntilTurn, calendar)}`;
    return say`${called(event, guildId)} named ${hero(event, heroId)} its Captain in place of ${hero(event, replacedId)}${locked}.`;
  },
  'hero.levelled': (event, content) => {
    // The Stats that rose, never the points Potential took: Potential is shown only as a hint.
    const { heroId, level, statDeltas } = event.payload;
    const rose = Object.entries(statDeltas)
      .sort(([a], [b]) => compareByCodeUnit(a, b))
      .map(([statKey, delta]) => `${nameIn(content.stats, statKey)} ${signed(delta)}`);
    return say`${hero(event, heroId)} reached Level ${level}${rose.length === 0 ? '' : `: ${rose.join(', ')}`}.`;
  },
  'patron.regard-changed': (event) => {
    const { patronId, guildId, cause, bandBefore, bandAfter } = event.payload;
    return say`${called(event, patronId)}'s Regard for ${called(event, guildId)} ${crossed(bandBefore, bandAfter)} ${patronRegardWords[cause]}.`;
  },
  'guildmaster.regard-changed': (event) => {
    // Whoever the Regard is for: a Hero as a Hero (the CLI adds the id, the page links), a Patron or
    // another Guild's Guildmaster by label alone (v1.1.7-S3, DL-209, DL-206 item 13).
    const { guildmasterId, entityId, bandBefore, bandAfter } = event.payload;
    const subject = isId('heroes', entityId) ? hero(event, entityId) : called(event, entityId);
    return say`${called(event, guildmasterId)}'s Regard for ${subject} ${crossed(bandBefore, bandAfter)}.`;
  },
  'hero.regard-changed': (event) => {
    const { heroId, entityId, cause, bandBefore, bandAfter } = event.payload;
    return say`${hero(event, heroId)}'s Regard for ${hero(event, entityId)} ${crossed(bandBefore, bandAfter)} ${heroRegardWords[cause]}.`;
  },
  'item.equipped': (event, content) => {
    const { guildId, heroId, slot } = event.payload;
    return say`${called(event, guildId)} put ${gear(event.payload, content)} in ${hero(event, heroId)}'s ${slot} slot.`;
  },
  'item.unequipped': (event, content) => {
    const { guildId, heroId, slot } = event.payload;
    return say`${called(event, guildId)} took ${gear(event.payload, content)} from ${hero(event, heroId)}'s ${slot} slot.`;
  },
  'item.returned': (event, content) => {
    const { guildId, heroId, cause } = event.payload;
    return say`${gear(event.payload, content)} went back to ${called(event, guildId)} from ${hero(event, heroId)}${gearReturnWords[cause]}.`;
  },
  'item.bought': (event, content) => {
    const { guildId, definitionKey, quantity, cost, itemIds } = event.payload;
    return say`${called(event, guildId)} bought ${itemsWords(content, definitionKey, quantity)}${ids(...itemIds)} at the Market for ${coinWords(cost)}.`;
  },
  'item.sold': (event, content) => {
    const { guildId, definitionKey, quantity, proceeds, itemIds, cause } = event.payload;
    const what = say`${itemsWords(content, definitionKey, quantity)}${ids(...itemIds)}`;
    return cause === 'fold'
      ? say`${called(event, guildId)}'s ${what} went to the Market for ${coinWords(proceeds)} as the Guild folded.`
      : say`${called(event, guildId)} sold ${what} at the Market for ${coinWords(proceeds)}.`;
  },
  'hero.transferred': (event) => {
    // M6-S2: who moved, from whom to whom, for how much, and the Offer accepted, if one was.
    const { heroId, fromGuildId, toGuildId, fee, offerId } = event.payload;
    const accepted = offerId === null ? '' : say`, accepting ${{ kind: 'offer', id: offerId }}`;
    return say`${called(event, toGuildId)} took ${hero(event, heroId)} from ${called(event, fromGuildId)} for ${coinWords(fee)}${accepted}.`;
  },
  'guild.transfer-offered': (event, _content, calendar) => {
    const { offerId, fromGuildId, toGuildId, heroId, fee, expiresOnTurn } = event.payload;
    return say`${called(event, toGuildId)} offered ${called(event, fromGuildId)} ${coinWords(fee)} for ${hero(event, heroId)}${ids(offerId)}, until ${nightOfTurn(expiresOnTurn, calendar)}.`;
  },
  'guild.transfer-offer-declined': (event) => {
    const { offerId, fromGuildId, toGuildId, heroId } = event.payload;
    return say`${called(event, fromGuildId)} declined ${called(event, toGuildId)}'s Offer for ${hero(event, heroId)}${ids(offerId)}.`;
  },
  'guild.transfer-offer-expired': (event) => {
    const { offerId, toGuildId, heroId, cause } = event.payload;
    return say`${called(event, toGuildId)}'s Offer for ${hero(event, heroId)}${ids(offerId)} ${offerEndWords[cause]}.`;
  },
  // M8-S2: a module's `adjustWealth` effect.
  'guild.wealth-changed': (event) => say`${called(event, event.payload.guildId)}'s Wealth went from ${coinWords(event.payload.before)} to ${coinWords(event.payload.after)}.`,
  'item.expended': (event, content) => {
    // The roll is the engine's; the sentence says which Encounter, counted from 1, and what it did (M5-S3).
    const { payload } = event;
    const used = say`${called(event, payload.guildId)}'s ${{ kind: 'party', id: payload.partyId }} used one ${nameIn(content.items, payload.definitionKey)}`;
    switch (payload.effect) {
      case 'bonus':
        return say`${used} on Encounter ${payload.encounterIndex + 1}: ${signed(payload.flat)} to its Check.`;
      case 'reroll':
        return say`${used} to try Encounter ${payload.encounterIndex + 1} again.`;
      case 'heal': {
        // Spent at the Injury's Encounter (DL-285): it eases the Injury for the rest of the Quest, and shortens it unless it was at 1 Day.
        const sooner = payload.days === 0 ? '' : `: it heals ${payload.days} ${payload.days === 1 ? 'Day' : 'Days'} sooner`;
        return say`${used} on ${hero(event, payload.heroId)} at Encounter ${payload.encounterIndex + 1}, easing their Injury${sooner}.`;
      }
    }
  },
};

/** Every event type the map has words for: the tests hold it to the engine's union. */
export const narratedTypes = Object.freeze(Object.keys(sentences)) as readonly EngineEventType[];

/**
 * A Party's outcome, cut at its band (M9-F5): the words before it, the band as the sentence says it
 * (`succeeded strongly`), and the words after it, the reward. Its sentence is the three read together,
 * so the page's return can put the band in bold and still read as the History does.
 */
export function resolvedParts(event: EngineEventOf<'quest.resolved'>, content: ContentSet): { lead: Sentence; band: string; rest: Sentence } {
  const { guildId, partyId, questId, templateKey, band, wealthDelta, fameDelta, synergyKeys = [] } = event.payload;
  // The Synergies that applied (M4-S3, DL-45), when any did; an entry written before DL-45 has none.
  const synergies = synergyKeys.length === 0 ? '' : ` Synergies: ${synergyKeys.map((key) => nameIn(content.synergies, key)).join(', ')}.`;
  const party: PartySlot = { kind: 'party', id: partyId };
  return {
    lead: say`${called(event, guildId)}'s ${party} came home from ${quest(questId, nameIn(content.questTemplates, templateKey))} and `,
    band: bandWords[band],
    rest: say`: Wealth ${signedCoins(wealthDelta)}, Fame ${signed(fameDelta)}.${synergies}`,
  };
}

/**
 * `event` as a sentence, its names as slots for a Namer to fill, its dates by `calendar`, the game's
 * (DL-210). A module's own event is not the engine's to word: its sentence is `moduleSentence`'s, for
 * any type.
 */
export function narrate(event: TurnEvent, content: ContentSet, calendar: Calendar): Sentence {
  if (isModuleEvent(event)) return moduleSentence(event);
  return (sentences[event.type] as (event: EngineEvent, content: ContentSet, calendar: Calendar) => Sentence)(event, content, calendar);
}

/**
 * A module's own event, of a type the front ends have no words for and a payload they never read
 * (M8-S4, DL-79): the Module, named by its type's namespace (`probe.fired` is the probe's, DL-77), the
 * type, and whom it concerns, a Hero as a Hero. `The probe Module recorded probe.fired for Una Greave,
 * Ranulf Tarrant and The Hollin Guild.` A type outside any namespace, which no module's `emit` makes,
 * is still worded, from "A Module".
 */
function moduleSentence(event: ModuleEvent): Sentence {
  const dot = event.type.indexOf('.');
  const who = dot > 0 ? `The ${event.type.slice(0, dot)} Module` : 'A Module';
  const named = event.participants.map((id) => [isId('heroes', id) ? hero(event, id) : called(event, id)]);
  return say`${who} recorded ${event.type}${named.length === 0 ? '' : say` for ${listedSentences(named)}`}.`;
}

// ── Why it stopped ───────────────────────────────────────────────────────────────────────────

/** A Guild or a Hero by the name the world holds, or none where its row is gone. */
function held(kind: NameSlot['kind'], id: EntityId, rows: Readonly<Record<string, { name: string } | undefined>>): NameSlot {
  const row = Object.hasOwn(rows, id) ? rows[id] : undefined;
  return { kind, table: parseId(id)?.table ?? null, id, label: row?.name };
}

/**
 * Why an advance or a fast forward stopped (M2-S11, M7-S3), one narration for both front ends
 * (DL-206 item 2, DL-209): its nine sentences, the names as slots a
 * front end's Namer fills, a Guild, a Hero, a Quest, the Parties counted or listed, an Offer's line,
 * and what to do next (`command`), which the CLI says as a command and the page as a button. `world`
 * is where it stopped, for the names its rows hold; `maxTurns` the cap it played under; `calendar` the
 * game's, for its dates (DL-210).
 */
export function narrateStop(stop: StopReason, world: Pick<World, 'guilds' | 'heroes' | 'offers'>, maxTurns: number, calendar: Calendar): Sentence {
  const guild = (id: EntityId): NameSlot => held('name', id, world.guilds);
  const heroSlot = (id: EntityId): NameSlot => held('hero', id, world.heroes);
  const quests = (questIds: readonly QuestId[]): Sentence => listedSentences(questIds.map((id) => [quest(id)]));
  const next = (command: CommandSlot['command']): CommandSlot => ({ kind: 'command', command });
  switch (stop.kind) {
    case 'ended':
      return say`Stopped: the game is over.`;
    case 'party-returned': {
      const noun: PartiesSlot = { kind: 'parties', ids: stop.partyIds, form: 'noun' };
      return say`Stopped: ${guild(stop.guildId)}'s ${noun} came home${{ kind: 'parties', ids: stop.partyIds, form: 'ids' }}.`;
    }
    case 'below-floor':
      // M9-S1: the countdown's line follows with the floor and the rest.
      return say`Stopped: ${guild(stop.guildId)} fell below the Bankruptcy floor: Bankruptcy on ${nightOfDay(stop.dueDay, calendar)} unless its Wealth recovers by then.`;
    case 'decision-needed':
      return say`Stopped: a decision is needed: ${guild(stop.guildId)} has no Party out, and could send one on ${quests(stop.questIds)}${next('show-board')}.`;
    case 'quest-staffable':
      // M9-S1: `--until staffable`, whether or not a Party is out.
      return say`Stopped: a Quest to staff: ${guild(stop.guildId)}'s Heroes at home could go on ${quests(stop.questIds)}${next('show-board')}.`;
    case 'transfer-offer': {
      // M6-S2: each Offer that arrived, who made it, for whom and until when.
      const offers = stop.offerIds.map((offerId): Sentence => {
        const offer = Object.hasOwn(world.offers, offerId) ? world.offers[offerId] : undefined;
        if (offer === undefined) return [{ kind: 'offer', id: offerId, withdrawn: true }];
        return say`${guild(offer.toGuildId)} offers ${coinWords(offer.fee)} for ${heroSlot(offer.heroId)} until ${nightOfTurn(offer.expiresOnTurn, calendar)}${ids(offerId)}`;
      });
      return say`Stopped: a Transfer Offer: ${listedSentences(offers)}.${next('answer-offer')}`;
    }
    case 'module':
      // M8-S2: an installed module's hook asked for the stop.
      return say`Stopped: the ${stop.moduleId} Module asked to stop.`;
    case 'max-turns':
      return say`Stopped: played the most Turns allowed, ${maxTurns}.`;
    case 'pool-refreshed':
      return say`Stopped: new in the Unattached pool: ${listedSentences(stop.heroIds.map((id): Sentence => [heroSlot(id)]))}${next('show-pool')}.`;
  }
}
