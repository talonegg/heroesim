// The page's Namer (v1.1.6-S12, DL-186 item 1): how the page fills the name slots of the narration's
// sentences (`narrate` in `@heroesim/words`, the CLI's words written once). The page names, as the
// refusals do (DL-65 item 6):
//
// - a Hero, Guild, Patron or Guildmaster by name alone, never with the id a CLI command takes, and
//   someone with no label by what they are, `a Hero`;
// - a Quest by its template's name, never its id, and a Party as the Guild's Party, or by its Heroes;
// - an Item by content's name, without the id `equip` and `sell` take.
//
// A sentence becomes segments (M9-S5, DL-105): its words, and the names in it of a Guild, a Hero, a
// Guildmaster or a Patron, each carrying the id the sentence read it from, so the History can make a
// name open whom it names: `Names` (`views/history-entries.tsx`) renders each as a button. A name is
// marked where the sentence puts its slot, from the event's own ids (principle 5), never found by
// reading the sentence back; the plain sentence is the segments' words.
//
// It lives in `state/` because it reads engine values (`defaultConfig`), which only `state/` may import.
// A Quest carries no label, so its name comes from `questName`, which the caller reads from the world
// and the History (`questNamer` below).
//
// It fills a refusal's sentence too (`refusalSentence`, DL-240), naming what the world does not hold
// as "that Hero", "that Quest", and says the page's own refusals: no game in hand, and a save that
// does not load.

import { defaultConfig, type ContentSet, type EngineEventOf, type Entry, type QuestId, type TableName, type TurnEvent, type WorldDocument } from '@heroesim/engine';
import {
  capitalised,
  nameIn,
  narrate,
  refusalSentence,
  resolvedParts,
  type Calendar,
  type NameSlot,
  type Namer,
  type Sentence,
} from '@heroesim/words';
import { newestEntries } from './history-reader';
import { calendarFor, type LoadRejection, type NoGame, type PlayRejection } from './reducer';

/** What a sentence reads beyond its event: content's names, a Quest's name by its id, and the game's calendar. */
export interface Narration {
  content: ContentSet;
  /** A Quest's name: its template's, while the world or its History knows it. */
  questName: (questId: QuestId) => string;
  /** The game's calendar, `calendarFor`'s, for a sentence's dates, `the night of Year 1 Day 8` (DL-210). */
  calendar: Calendar;
}

// ── Segments ─────────────────────────────────────────────────────────────────────────────────

/** The kinds of entity a line can name for the page to open: those whose rows have names (M9-S5). */
export type NamedTable = 'guilds' | 'heroes' | 'guildmasters' | 'patrons';

const namedTables: ReadonlySet<TableName> = new Set<TableName>(['guilds', 'heroes', 'guildmasters', 'patrons']);

/**
 * A piece of a line (M9-S5, DL-105): words, or a name with the id the sentence read it from and
 * what it is, which the page can make open whom it names.
 */
export type Segment = { kind: 'text'; text: string } | { kind: 'name'; text: string; entityId: NameSlot['id']; table: NamedTable };

/** The words of a line given as segments: its sentence. */
export function textOf(segments: readonly Segment[]): string {
  return segments.map((segment) => segment.text).join('');
}

/** Segments with neighbouring words joined into one. */
function joined(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    if (segment.kind === 'text' && segment.text === '') continue;
    const last = out.at(-1);
    if (segment.kind === 'text' && last?.kind === 'text') out[out.length - 1] = { kind: 'text', text: last.text + segment.text };
    else out.push(segment);
  }
  return out;
}

const words = (text: string): Segment => ({ kind: 'text', text });

// ── The Namer ────────────────────────────────────────────────────────────────────────────────

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

/** What a refusal calls what the world does not hold: `that Hero`, `that Item` (DL-65 item 6). */
const that: Readonly<Record<TableName, string>> = Object.freeze({
  guilds: 'that Guild',
  guildmasters: 'that Guildmaster',
  heroes: 'that Hero',
  patrons: 'that Patron',
  quests: 'that Quest',
  parties: 'that Party',
  offers: 'that Offer',
  items: 'that Item',
  stacks: 'that Item',
});

/**
 * Someone by the label the event carries, marked as a name; or what they are, in words, when it
 * carries none, by `unnamed`.
 */
function person({ table, id, label }: NameSlot, unnamed: Readonly<Record<TableName, string>>): Segment[] {
  if (label === undefined) return [words(table === null ? 'someone' : unnamed[table])];
  return table !== null && namedTables.has(table) ? [{ kind: 'name', text: label, entityId: id, table: table as NamedTable }] : [words(label)];
}

/** `listed` for segments: the names in the list stay names. */
function listedSegments(items: readonly Segment[][]): Segment[] {
  if (items.length <= 1) return items[0] ?? [];
  return [...items.slice(0, -1).flatMap((item, index) => (index === 0 ? item : [words(', '), ...item])), words(' and '), ...(items.at(-1) ?? [])];
}

/**
 * The page's names for what each slot holds, a Quest's by `questName` where the sentence gives no
 * template, and someone with no label by `unnamed`, `a Hero` unless a refusal says `that Hero`.
 */
export function pageNamer(questName: Narration['questName'], unnamed: Readonly<Record<TableName, string>> = someone): Namer<Segment[]> {
  const name: Namer<Segment[]> = (slot) => {
    switch (slot.kind) {
      case 'hero':
      case 'name':
        return person(slot, unnamed);
      case 'quest':
        return [words(slot.template ?? questName(slot.id))];
      case 'party':
        if (slot.heroes !== undefined) return listedSegments(slot.heroes.map(name));
        return slot.guild === undefined ? [words('Party')] : [...name(slot.guild), words("'s Party")];
      case 'offer':
        return [words(slot.withdrawn === true ? 'an Offer since withdrawn' : 'its Transfer Offer')];
      case 'parties':
        // A stop's Parties (v1.1.7-S3, DL-209): counted, never listed by id.
        if (slot.form === 'ids') return [];
        return [words(slot.ids.length === 1 ? 'Party' : `${slot.ids.length} Parties`)];
      case 'ids':
      case 'command':
        // The ids, the commands and the flags a CLI takes: the page has a button (`nextFor`,
        // `views/stop.tsx`) or a form.
        return [];
      case 'date':
        return [words(slot.date)];
      case 'entry':
        // What the form was given: a number as it is, words quoted (DL-240).
        return [words(typeof slot.value === 'number' ? String(slot.value) : `"${slot.value}"`)];
    }
  };
  return name;
}

/** A sentence as segments, each slot as `namer` names it. */
function segmentsOf(sentence: Sentence, namer: Namer<Segment[]>): Segment[] {
  return joined(sentence.flatMap((part) => (part.kind === 'text' ? [words(part.text)] : namer(part))));
}

/** A sentence of the words' that names no Quest, as plain words: the game's ending in the header (DL-241). */
export function sentenceWords(sentence: Sentence): string {
  return textOf(segmentsOf(sentence, pageNamer(() => 'a Quest')));
}

/**
 * `event`'s sentence as segments (M9-S5, DL-105): its words, and each name in it of a Guild, a Hero,
 * a Guildmaster or a Patron marked with the id the sentence read it from, capitalised where it opens
 * with `a Hero` or the like.
 */
export function narrateSegments(event: TurnEvent, narration: Narration): Segment[] {
  const [first, ...rest] = segmentsOf(narrate(event, narration.content, narration.calendar), pageNamer(narration.questName));
  if (first === undefined) return [];
  return [{ ...first, text: capitalised(first.text) }, ...rest];
}

/** `event` as one sentence, the words of its segments. */
export function narrateText(event: TurnEvent, narration: Narration): string {
  return textOf(narrateSegments(event, narration));
}

/**
 * A Party's outcome in segments, cut at its band (M9-F5, `resolvedParts`): the words before it, the
 * band as the sentence says it (`succeeded strongly`), and the words after it, the reward, so the
 * return's entry can put the band in bold and still read as the History does.
 */
export function resolvedWords(event: EngineEventOf<'quest.resolved'>, { content }: Pick<Narration, 'content'>): { lead: Segment[]; band: string; rest: Segment[] } {
  const { lead, band, rest } = resolvedParts(event, content);
  // The outcome names its Quest by the template it carries: no Quest's name is looked up.
  const namer = pageNamer(() => 'a Quest');
  return { lead: segmentsOf(lead, namer), band, rest: segmentsOf(rest, namer) };
}

// ── Quests by name ───────────────────────────────────────────────────────────────────────────

/** The template an entry names, as `quest.offered`, `quest.resolved` and `quest.expired` do; `undefined` for none. */
function templateKeyOf(entry: Entry | undefined): string | undefined {
  const key = (entry?.payload as { templateKey?: unknown } | undefined)?.templateKey;
  return typeof key === 'string' ? key : undefined;
}

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
    const templateKey = row?.templateKey ?? templateKeyOf(newestEntries(history, questId, (entry) => templateKeyOf(entry) !== undefined, 1)[0]);
    return templateKey === undefined ? 'a Quest' : nameIn(content.questTemplates, templateKey);
  };
}

// ── Refusals ─────────────────────────────────────────────────────────────────────────────────

/** A refusal's names: "that Hero", "that Quest" where the world holds no such row (DL-65 item 6, DL-240). */
const refusalNamer = pageNamer(() => 'that Quest', that);

/** The page's own refusals: a play with no game in hand, and a save that does not load. */
function ownWords(rejection: NoGame | LoadRejection): string {
  if (rejection.reason === 'no-game') return 'No game is in hand: start a new game or load a save.';
  // A save of an older schema, in the owner's words (DL-125 item 10.2, DL-135 item 7).
  if (rejection.reason === 'unsupported-version' && rejection.documentVersion < rejection.schemaVersion) {
    return 'This game was saved by an older Heroesim and cannot be loaded.';
  }
  return `Cannot load the save: ${rejection.message}.`;
}

/**
 * `rejection` as a sentence, naming what `document` holds: the game the play was refused in, the
 * state's `document`, or `null` when there is none. The refusals' table words it (DL-240), and this
 * Namer names a Hero, a Guild, a Quest or an Item without ids, and what the world does not hold as
 * `that Hero` or the like, capitalised where it opens the sentence; a date is by the game's
 * calendar (DL-210).
 */
export function rejectionSentence(rejection: PlayRejection, document: Pick<WorldDocument, 'world' | 'meta'> | null, content: ContentSet): string {
  if (rejection.reason === 'no-game' || rejection.action === 'load') return ownWords(rejection as NoGame | LoadRejection);
  const calendar = document === null ? defaultConfig : calendarFor(document);
  const sentence = refusalSentence(rejection as Exclude<PlayRejection, NoGame | LoadRejection>, { world: document?.world ?? null, content, calendar });
  return capitalised(textOf(segmentsOf(sentence, refusalNamer)));
}
