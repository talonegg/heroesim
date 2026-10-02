// The front end's words for what the engine reports (M7-S3, DL-66): a typed event in, one sentence
// out; a stop reason in, one sentence out. The engine emits data, never prose (ADR-0003), and the
// CLI and the browser each put it in words: "the same engine, the same words", so every sentence
// here is the CLI's (`cli/src/narrate.ts`), adapted as the refusals were (DL-65 item 6):
//
// - a Hero, Guild, Patron or Guildmaster by name alone, never with the id a CLI command takes;
// - a Quest by its template's name, never its id, and a Party as the Guild's Party;
// - an Item by content's name, without the id `equip` and `sell` take;
// - no pointer to a CLI command: where the CLI says `(show board)`, the page puts a button.
//
// Names come from each event's labels, written when it happened, so a Hero whose row has since
// gone still reads. A Quest carries no label, so its name comes from `questName`, which the caller
// reads from the world and the History (`questNamer` below). One map, keyed by every event type,
// so that `tsc -b` refuses a type the engine adds until it has words, and `narrate.test.ts`
// enumerates the union. A module's own event, which the engine does not type, gets one generic
// sentence for any type, whatever its payload: the module, its type and who it concerns (M8-S2,
// M8-S4, DL-77, DL-79).
//
// It lives in `state/`, beside `rejections.ts`, because it reads engine values (`dayOf`,
// `regardBandNames`, `parseId`), which only `state/` may import (M7-S2).
//
// A line is also given as segments (M9-S5, DL-105): its words, and the names in it of a Guild, a
// Hero, a Guildmaster or a Patron, each carrying the id the sentence read it from, so the History
// can make a name open whom it names. A name is marked where the sentence puts it, from the event's
// own ids (principle 5), never found by reading the sentence back; the plain sentence is the
// segments' words, so every sentence reads exactly as before.

import {
  compareByCodeUnit,
  dayOf,
  encounterDegree,
  entriesFor,
  isModuleEvent,
  parseId,
  regardBandNames,
  type ContentSet,
  type Degree,
  type EndingReason,
  type EngineEvent,
  type EngineEventOf,
  type EngineEventType,
  type EntityId,
  type GearMove,
  type GearReturnCause,
  type GuildId,
  type HeroId,
  type HeroRegardCause,
  type ModuleEvent,
  type PatronRegardCause,
  type QuestBand,
  type QuestId,
  type RegardBand,
  type StopReason,
  type TableName,
  type TransferOfferEndCause,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { listed } from './names';
import { facilityIs, facilityNames } from './rejections';

/** What a sentence reads beyond its event: content's names, and a Quest's name by its id. */
export interface Narration {
  content: ContentSet;
  /** A Quest's name: its template's, while the world or its History knows it. */
  questName: (questId: QuestId) => string;
}

// ── Names ────────────────────────────────────────────────────────────────────────────────────

/** A content row's name; a key the content does not define is shown as it is (data-model rule 5). */
function nameIn(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  return Object.hasOwn(rows, key) ? (rows[key]?.name ?? key) : key;
}

/** What an entity with no label is called: `a Hero`, `a Guild`. */
const someone: Readonly<Record<TableName, string>> = Object.freeze({
  guilds: 'a Guild',
  guildmasters: 'a Guildmaster',
  heroes: 'a Hero',
  patrons: 'a Patron',
  quests: 'a Quest',
  parties: 'a Party',
  offers: 'an Offer',
  items: 'an Item',
  stacks: 'an Item',
});

// ── Segments ─────────────────────────────────────────────────────────────────────────────────

/** The kinds of entity a line can name for the page to open: those whose rows have names (M9-S5). */
export type NamedTable = 'guilds' | 'heroes' | 'guildmasters' | 'patrons';

const namedTables: ReadonlySet<TableName> = new Set<TableName>(['guilds', 'heroes', 'guildmasters', 'patrons']);

/**
 * A piece of a line (M9-S5, DL-105): words, or a name with the id the sentence read it from and
 * what it is, which the page can make open whom it names.
 */
export type Segment = { kind: 'text'; text: string } | { kind: 'name'; text: string; entityId: EntityId; table: NamedTable };

/** A line, or part of one, as segments. */
type Words = readonly Segment[];

/** The words of a line given as segments: its sentence. */
export function textOf(segments: readonly Segment[]): string {
  return segments.map((segment) => segment.text).join('');
}

/** What goes into a line: words, a number, or segments already made. */
type Part = string | number | Words;

/**
 * A line from a template, `say\`${called(event, guildId)} was founded.\``: its text as written, and
 * each name `called` marked where the template puts it. Neighbouring words join into one segment.
 */
function say(strings: TemplateStringsArray, ...parts: readonly Part[]): Words {
  const out: Segment[] = [];
  const words = (text: string): void => {
    if (text === '') return;
    const last = out.at(-1);
    if (last?.kind === 'text') out[out.length - 1] = { kind: 'text', text: last.text + text };
    else out.push({ kind: 'text', text });
  };
  strings.forEach((text, index) => {
    words(text);
    if (index >= parts.length) return;
    const part = parts[index] as Part;
    if (typeof part === 'string' || typeof part === 'number') words(String(part));
    else for (const segment of part) if (segment.kind === 'text') words(segment.text);
      else out.push(segment);
  });
  return out;
}

/** A participant by the label the event carries, marked as a name; or what it is, in words, when it has none. */
function called(event: Pick<TurnEvent, 'labels'>, id: EntityId): Words {
  const label = event.labels[id];
  const parsed = parseId(id);
  if (label !== undefined) {
    return parsed !== null && namedTables.has(parsed.table) ? [{ kind: 'name', text: label, entityId: id, table: parsed.table as NamedTable }] : say`${label}`;
  }
  return say`${parsed === null ? 'someone' : someone[parsed.table]}`;
}

/** `+120`, `-2`, `0`. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function night(turn: number): string {
  return `the night of Day ${dayOf(turn)}`;
}

/** A list as a sentence gives one (`names.ts`, since v1.1.4-S11, where the refusals' words read it too). */
export { listed };

/** `listed` for segments: the names in the list stay names. */
function listedWords(items: readonly Words[]): Words {
  if (items.length <= 1) return items[0] ?? [];
  return say`${items.slice(0, -1).flatMap((item, index) => (index === 0 ? item : say`, ${item}`))} and ${items.at(-1) ?? []}`;
}

const bandWords: Readonly<Record<QuestBand, string>> = { fail: 'failed', success: 'succeeded', strong: 'succeeded strongly' };

/** A Degree, a glossary term in each (v1.1.4-S2, `CONTEXT.md` Degree): the CLI's words. */
export const degreeWords: Readonly<Record<Degree, string>> = { triumph: 'Triumph', success: 'Success', setback: 'Setback', failure: 'Failure' };

/** What befell a Guild at its ending, after its name. */
const endingWords: Readonly<Record<EndingReason, string>> = {
  retirement: 'lost its Guildmaster to Retirement',
  bankruptcy: 'went bankrupt',
  'roster-wiped': 'had its Roster wiped out',
};

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

/** What became of a Transfer Offer that went unanswered (M6-S2), after the offer. */
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

function gear(move: GearMove, content: ContentSet): string {
  return nameIn(content.items, move.definitionKey);
}

// ── The map ──────────────────────────────────────────────────────────────────────────────────

type Sentences = { [Type in EngineEventType]: (event: EngineEventOf<Type>, narration: Narration) => Words };

const sentences: Sentences = {
  'world.created': (event) => say`The world was made from seed ${event.payload.seed}.`,
  'guild.founded': (event) => say`${called(event, event.payload.guildId)} was founded.`,
  'guildmaster.generated': (event) =>
    say`${called(event, event.payload.guildmasterId)} leads ${called(event, event.payload.guildId)}.`,
  'hero.generated': (event, { content }) => {
    const { heroId, guildId, classKey } = event.payload;
    const where = guildId === null ? 'the Unattached pool' : called(event, guildId);
    return say`${called(event, heroId)}, ${nameIn(content.classes, classKey)}, joined ${where}.`;
  },
  'patron.generated': (event, { content }) =>
    say`${called(event, event.payload.patronId)} of the ${nameIn(content.spheres, event.payload.sphereKey)} became a Patron.`,
  'world.rules-adopted': (event) =>
    say`The rules moved from configVersion ${event.payload.oldConfigVersion} to ${event.payload.newConfigVersion}.`,
  'guild.upkeep-paid': (event) =>
    say`${called(event, event.payload.guildId)} paid ${event.payload.amount} Upkeep, leaving ${event.payload.wealthAfter} Wealth.`,
  // M9-S1: the night Bankruptcy falls on, as the countdown gives it (DL-95), from the event alone.
  'guild.below-floor': (event) => {
    const { guildId, wealth, floor, dueDay } = event.payload;
    return say`${called(event, guildId)}'s Wealth, ${wealth}, fell below the Bankruptcy floor of ${floor}: Bankruptcy on the night of Day ${dueDay} unless it is back to ${floor} or more on a night by then.`;
  },
  'guild.floor-recovered': (event) => {
    const { guildId, wealth, floor, belowFloorSince } = event.payload;
    return say`${called(event, guildId)}'s Wealth, ${wealth}, is back to the Bankruptcy floor of ${floor} or more, after falling below it on Day ${dayOf(belowFloorSince)}: no Bankruptcy is due.`;
  },
  'hero.recruited': (event) =>
    say`${called(event, event.payload.guildId)} signed ${called(event, event.payload.heroId)} for ${event.payload.fee} Wealth.`,
  'hero.left-pool': (event) => say`${called(event, event.payload.heroId)} left the Unattached pool.`,
  'quest.offered': (event, { content }) =>
    say`${called(event, event.payload.patronId)} offered ${nameIn(content.questTemplates, event.payload.templateKey)}.`,
  'quest.expired': (event, { content }) =>
    say`${called(event, event.payload.patronId)}'s ${nameIn(content.questTemplates, event.payload.templateKey)} expired untaken.`,
  'quest.taken': (event, { content, questName }) => {
    // What the Party carries (M5-S3), when it carries anything; an entry from before M5-S3 has none.
    const { guildId, questId, heroIds, returnsOnTurn, consumables = [] } = event.payload;
    const carrying = consumables.map(({ definitionKey, quantity }) => `${nameIn(content.items, definitionKey)} ×${quantity}`);
    const carried = carrying.length === 0 ? '' : `, carrying ${listed(carrying)}`;
    const party = listedWords(heroIds.map((id) => called(event, id)));
    return say`${called(event, guildId)} sent ${party} on ${questName(questId)}, back on ${night(returnsOnTurn)}${carried}.`;
  },
  'quest.encounter': (event, { content }) => {
    // The roll and target are the engine's; the page says only how it went and what it cost, and
    // which Encounter it was, counted from 1. Its Degree, and the Check that decided it when there
    // are several or it is named otherwise than its Encounter (v1.1.4-S2, DL-152); an entry written
    // before then reads as its outcome, a Success or a Failure.
    const { guildId, index, encounterKey, outcome, injured, died, decidedBy, checks = [] } = event.payload;
    const went = outcome === 'success' ? 'came through' : 'failed at';
    const hurt = [
      ...injured.map((id) => say`${called(event, id)} was injured`),
      ...died.map((id) => say`${called(event, id)} was killed`),
    ];
    const which = `${nameIn(content.encounters, encounterKey)} (Encounter ${index + 1})`;
    const encounter = Object.hasOwn(content.encounters, encounterKey) ? content.encounters[encounterKey] : undefined;
    const decider = encounter?.checks.find((it) => it.key === decidedBy)?.name ?? decidedBy;
    const named = decider !== undefined && (checks.length > 1 || decider !== nameIn(content.encounters, encounterKey));
    const by = named ? `, decided by ${decider}` : '';
    const degree = `, a ${degreeWords[encounterDegree(event.payload)]}${by}`;
    return say`${called(event, guildId)}'s Party ${went} ${which}${degree}${hurt.length === 0 ? '' : say`: ${listedWords(hurt)}`}.`;
  },
  'quest.resolved': (event, narration) => {
    const { lead, band, rest } = resolvedWords(event, narration);
    return say`${lead}${band}${rest}`;
  },
  'quest.loot': (event, { content, questName }) => {
    const { guildId, questId, definitionKey, quantity } = event.payload;
    return say`${called(event, guildId)} found Loot on ${questName(questId)}: ${itemsWords(content, definitionKey, quantity)}.`;
  },
  'hero.injured': (event, { content }) => {
    const { heroId, typeKey, healsOnTurn } = event.payload;
    return say`${called(event, heroId)} was injured (${nameIn(content.injuries, typeKey)}), healing on ${night(healsOnTurn)}.`;
  },
  'hero.died': (event, { questName }) => say`${called(event, event.payload.heroId)} died on ${questName(event.payload.questId)}.`,
  'hero.xp-gained': (event) => say`${called(event, event.payload.heroId)} gained ${event.payload.amount} XP.`,
  'hero.morale-changed': (event) => {
    const { heroId, before, after, bandAfter } = event.payload;
    return say`${called(event, heroId)}'s Morale went from ${before} to ${after}, ${bandAfter}.`;
  },
  'hero.healed': (event, { content }) => {
    const { heroId, typeKey, traitKey } = event.payload;
    const left = traitKey === null ? '' : `, left ${nameIn(content.traits, traitKey)}`;
    return say`${called(event, heroId)} recovered from ${nameIn(content.injuries, typeKey)}${left}.`;
  },
  'hero.retired': (event) =>
    say`${called(event, event.payload.heroId)} retired from ${called(event, event.payload.guildId)} at ${event.payload.age}.`,
  'hero.declined': (event, { content }) => {
    const { heroId, statKey, delta, age } = event.payload;
    return say`${called(event, heroId)}, at ${age}, lost ${-delta} ${nameIn(content.stats, statKey)} to age.`;
  },
  'game.ended': (event) => say`The game ended: ${called(event, event.payload.guildId)} ${endingWords[event.payload.reason]}.`,
  'guild.folded': (event) => say`${called(event, event.payload.guildId)} ${endingWords[event.payload.reason]} and folded.`,
  // M9-S2: a Rival's Guildmaster's Retirement, met by Succession (DL-100 item 3).
  'guildmaster.succeeded': (event) => {
    const { guildmasterId, guildId, successorId, age } = event.payload;
    return say`${called(event, guildmasterId)} retired at ${age} as Guildmaster of ${called(event, guildId)}, and ${called(event, successorId)} succeeded them.`;
  },
  'hero.left-guild': (event) =>
    say`${called(event, event.payload.heroId)} left ${called(event, event.payload.guildId)} for the Unattached pool.`,
  'guild.improved': (event, { content }) => {
    const { guildId, facility, grade, improvementKey, cost } = event.payload;
    return say`${called(event, guildId)} built ${nameIn(content.improvements, improvementKey)} for ${cost} Wealth: its ${facilityNames[facility]} ${facilityIs[facility]} now grade ${grade}.`;
  },
  'hero.levelled': (event, { content }) => {
    // The Stats that rose, never the points Potential took: Potential is shown only as a hint.
    const { heroId, level, statDeltas } = event.payload;
    const rose = Object.entries(statDeltas)
      .sort(([a], [b]) => compareByCodeUnit(a, b))
      .map(([statKey, delta]) => `${nameIn(content.stats, statKey)} ${signed(delta)}`);
    return say`${called(event, heroId)} reached Level ${level}${rose.length === 0 ? '' : `: ${rose.join(', ')}`}.`;
  },
  'patron.regard-changed': (event) => {
    const { patronId, guildId, cause, bandBefore, bandAfter } = event.payload;
    return say`${called(event, patronId)}'s Regard for ${called(event, guildId)} ${crossed(bandBefore, bandAfter)} ${patronRegardWords[cause]}.`;
  },
  'guildmaster.regard-changed': (event) => {
    const { guildmasterId, entityId, bandBefore, bandAfter } = event.payload;
    return say`${called(event, guildmasterId)}'s Regard for ${called(event, entityId)} ${crossed(bandBefore, bandAfter)}.`;
  },
  'hero.regard-changed': (event) => {
    const { heroId, entityId, cause, bandBefore, bandAfter } = event.payload;
    return say`${called(event, heroId)}'s Regard for ${called(event, entityId)} ${crossed(bandBefore, bandAfter)} ${heroRegardWords[cause]}.`;
  },
  'item.equipped': (event, { content }) => {
    const { guildId, heroId, slot } = event.payload;
    return say`${called(event, guildId)} put ${gear(event.payload, content)} in ${called(event, heroId)}'s ${slot} slot.`;
  },
  'item.unequipped': (event, { content }) => {
    const { guildId, heroId, slot } = event.payload;
    return say`${called(event, guildId)} took ${gear(event.payload, content)} from ${called(event, heroId)}'s ${slot} slot.`;
  },
  'item.returned': (event, { content }) => {
    const { guildId, heroId, cause } = event.payload;
    return say`${gear(event.payload, content)} went back to ${called(event, guildId)} from ${called(event, heroId)}${gearReturnWords[cause]}.`;
  },
  'item.bought': (event, { content }) => {
    const { guildId, definitionKey, quantity, cost } = event.payload;
    return say`${called(event, guildId)} bought ${itemsWords(content, definitionKey, quantity)} at the Market for ${cost} Wealth.`;
  },
  'item.sold': (event, { content }) => {
    const { guildId, definitionKey, quantity, proceeds, cause } = event.payload;
    const what = itemsWords(content, definitionKey, quantity);
    return cause === 'fold'
      ? say`${called(event, guildId)}'s ${what} went to the Market for ${proceeds} Wealth as the Guild folded.`
      : say`${called(event, guildId)} sold ${what} at the Market for ${proceeds} Wealth.`;
  },
  'hero.transferred': (event) => {
    // M6-S2: who moved, from whom to whom, for how much, and whether an offer was accepted.
    const { heroId, fromGuildId, toGuildId, fee, offerId } = event.payload;
    const accepted = offerId === null ? '' : ', accepting its Transfer Offer';
    return say`${called(event, toGuildId)} took ${called(event, heroId)} from ${called(event, fromGuildId)} for ${fee} Wealth${accepted}.`;
  },
  'guild.transfer-offered': (event) => {
    const { fromGuildId, toGuildId, heroId, fee, expiresOnTurn } = event.payload;
    return say`${called(event, toGuildId)} offered ${called(event, fromGuildId)} ${fee} Wealth for ${called(event, heroId)}, until ${night(expiresOnTurn)}.`;
  },
  'guild.transfer-offer-declined': (event) => {
    const { fromGuildId, toGuildId, heroId } = event.payload;
    return say`${called(event, fromGuildId)} declined ${called(event, toGuildId)}'s Offer for ${called(event, heroId)}.`;
  },
  'guild.transfer-offer-expired': (event) => {
    const { toGuildId, heroId, cause } = event.payload;
    return say`${called(event, toGuildId)}'s Offer for ${called(event, heroId)} ${offerEndWords[cause]}.`;
  },
  // M8-S2: a module's `adjustWealth` effect.
  'guild.wealth-changed': (event) =>
    say`${called(event, event.payload.guildId)}'s Wealth went from ${event.payload.before} to ${event.payload.after}.`,
  'item.expended': (event, { content }) => {
    // The roll is the engine's; the page says which Encounter, counted from 1, and what it did (M5-S3).
    const { payload } = event;
    const used = say`${called(event, payload.guildId)}'s Party used one ${nameIn(content.items, payload.definitionKey)}`;
    switch (payload.effect) {
      case 'bonus':
        return say`${used} on Encounter ${payload.encounterIndex + 1}: ${signed(payload.flat)} to its Check.`;
      case 'reroll':
        return say`${used} to try Encounter ${payload.encounterIndex + 1} again.`;
      case 'heal':
        return say`${used} on ${called(event, payload.heroId)}: their Injury heals ${payload.days} ${payload.days === 1 ? 'Day' : 'Days'} sooner.`;
    }
  },
};

/**
 * A Party's outcome in words, cut at its band (M9-F5): the words before it, the band as the sentence
 * says it (`succeeded strongly`), and the words after it, the reward. Its sentence is the three read
 * together, so the return's entry can put the band in bold and still read as the History does.
 */
export function resolvedWords(event: EngineEventOf<'quest.resolved'>, { content }: Pick<Narration, 'content'>): { lead: Segment[]; band: string; rest: Segment[] } {
  const { guildId, templateKey, band, wealthDelta, fameDelta, synergyKeys = [] } = event.payload;
  // The Synergies that applied (M4-S3), when any did; an entry from before M4-S3 has none.
  const synergies = synergyKeys.length === 0 ? '' : ` Synergies: ${synergyKeys.map((key) => nameIn(content.synergies, key)).join(', ')}.`;
  return {
    lead: [...say`${called(event, guildId)}'s Party came home from ${nameIn(content.questTemplates, templateKey)} and `],
    band: bandWords[band],
    rest: [...say`: Wealth ${signed(wealthDelta)}, Fame ${signed(fameDelta)}.${synergies}`],
  };
}

/** Every event type the map has words for: the test holds it to the union. */
export const narratedTypes = Object.freeze(Object.keys(sentences)) as readonly EngineEventType[];

/**
 * `event` as one sentence, in the CLI's words, capitalised when it opens with `a Hero` or the like. A
 * module's own event is not the engine's to word, nor the page's: its sentence is `moduleSentence`'s,
 * for any type.
 */
export function narrate(event: TurnEvent, narration: Narration): string {
  return textOf(narrateSegments(event, narration));
}

/**
 * `narrate`'s sentence as segments (M9-S5, DL-105): its words, and each name in it of a Guild, a
 * Hero, a Guildmaster or a Patron marked with the id the sentence read it from. Their words are the
 * sentence, word for word, capitalised where it opens.
 */
export function narrateSegments(event: TurnEvent, narration: Narration): Segment[] {
  const words = isModuleEvent(event)
    ? moduleSentence(event)
    : (sentences[event.type] as (event: EngineEvent, narration: Narration) => Words)(event, narration);
  const [first, ...rest] = words;
  if (first === undefined) return [];
  return [{ ...first, text: first.text.charAt(0).toUpperCase() + first.text.slice(1) }, ...rest];
}

/**
 * A module's own event, of a type the page has no words for and a payload it never reads (M8-S4,
 * DL-79), as the CLI words it: the module, named by its type's namespace (`probe.fired` is the
 * probe's, DL-77), the type, and whom it concerns by name. `The probe Module recorded probe.fired for
 * Una Greave, Ranulf Tarrant and The Hollin Guild.` A type outside any namespace, which no module's
 * `emit` makes, is still worded, from "A module".
 */
function moduleSentence(event: ModuleEvent): Words {
  const dot = event.type.indexOf('.');
  const who = dot > 0 ? `The ${event.type.slice(0, dot)} Module` : 'A Module';
  const named = event.participants.map((id) => called(event, id));
  return say`${who} recorded ${event.type}${named.length === 0 ? '' : say` for ${listedWords(named)}`}.`;
}

// ── Quests by name ───────────────────────────────────────────────────────────────────────────

/**
 * A Quest's name from `document`: its template's, from its row while the world holds one, else
 * from the History, whose `quest.offered` names the template of every Quest ever posted, and whose
 * `quest.resolved` and `quest.expired` do too once the row is gone. `a Quest` for an id neither
 * knows.
 */
export function questNamer(document: WorldDocument, content: ContentSet): (questId: QuestId) => string {
  const { world, history } = document;
  return (questId) => {
    const row = Object.hasOwn(world.quests, questId) ? world.quests[questId] : undefined;
    const templateKey =
      row?.templateKey ??
      entriesFor(history, questId)
        .map((entry) => (entry.payload as { templateKey?: unknown }).templateKey)
        .find((key): key is string => typeof key === 'string');
    return templateKey === undefined ? 'a Quest' : nameIn(content.questTemplates, templateKey);
  };
}

/** The narration for `document`: its content's names and its Quests' names. */
export function narrationFor(document: WorldDocument, content: ContentSet): Narration {
  return { content, questName: questNamer(document, content) };
}

// ── Why time stopped ─────────────────────────────────────────────────────────────────────────

/**
 * Why an advance or a fast forward stopped, in one sentence (the CLI's `narrateStop`). `document` is
 * where it stopped; `maxTurns` the cap it played under. Where the CLI points to a command, the page
 * gives a button (`nextFor` in `views/time.tsx`).
 */
export function narrateStop(stop: StopReason, document: WorldDocument, maxTurns: number, narration: Narration): string {
  const { world } = document;
  const guildName = (guildId: GuildId): string => (Object.hasOwn(world.guilds, guildId) ? world.guilds[guildId]?.name : undefined) ?? 'a Guild';
  const heroName = (heroId: HeroId): string => (Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId]?.name : undefined) ?? 'a Hero';
  switch (stop.kind) {
    case 'ended':
      return 'Stopped: the game is over.';
    case 'party-returned': {
      const parties = stop.partyIds.length === 1 ? 'Party' : `${stop.partyIds.length} Parties`;
      return `Stopped: ${guildName(stop.guildId)}'s ${parties} came home.`;
    }
    case 'below-floor':
      // M9-S1: the countdown stands in the header with the floor and the rest (`countdownView`).
      return (
        `Stopped: ${guildName(stop.guildId)} fell below the Bankruptcy floor: Bankruptcy on the night of Day ${stop.dueDay} ` +
        'unless its Wealth recovers by then.'
      );
    case 'decision-needed':
      return (
        `Stopped: a decision is needed: ${guildName(stop.guildId)} has no Party out, and could send one on ` +
        `${listed(stop.questIds.map((questId) => narration.questName(questId)))}.`
      );
    case 'quest-staffable':
      // M9-S1: the opt-in stop, whether or not a Party is out.
      return (
        `Stopped: a Quest to staff: ${guildName(stop.guildId)}'s Heroes at home could go on ` +
        `${listed(stop.questIds.map((questId) => narration.questName(questId)))}.`
      );
    case 'transfer-offer': {
      // M6-S2: each offer that arrived, and who made it.
      const offers = stop.offerIds.map((offerId) => {
        const offer = Object.hasOwn(world.offers, offerId) ? world.offers[offerId] : undefined;
        if (offer === undefined) return 'an Offer since withdrawn';
        return `${guildName(offer.toGuildId)} offers ${offer.fee} Wealth for ${heroName(offer.heroId)} until ${night(offer.expiresOnTurn)}`;
      });
      return `Stopped: a Transfer Offer: ${listed(offers)}.`;
    }
    case 'module':
      // M8-S2: an installed module's hook asked for the stop.
      return `Stopped: the ${stop.moduleId} Module asked to stop.`;
    case 'max-turns':
      return `Stopped: played the most Turns allowed, ${maxTurns}.`;
    case 'pool-refreshed':
      return `Stopped: new in the Unattached pool: ${listed(stop.heroIds.map(heroName))}.`;
  }
}
