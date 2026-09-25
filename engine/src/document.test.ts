import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, test } from 'vitest';
import {
  defaultConfig,
  emptyDocument,
  facilityKeys,
  idPrefixes,
  isId,
  isJsonSafe,
  makeId,
  maxIdNumber,
  parseId,
  streamNames,
  tableNames,
  type Controller,
  type Entry,
  type FacilityKey,
  type Guild,
  type GuildId,
  type Guildmaster,
  type GuildmasterId,
  type Hero,
  type HeroId,
  type History,
  type Holder,
  type ItemId,
  type Meta,
  type ModuleId,
  type OfferId,
  type Party,
  type PartyId,
  type Patron,
  type PatronId,
  type Quest,
  type QuestId,
  type RegardEntry,
  type Stack,
  type StackHolder,
  type StackId,
  type TransferOffer,
  type UniqueItem,
  type World,
  type WorldDocument,
} from './index.js';
import { createStreams } from './rng.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

const meta: Meta = {
  version: defaultConfig.schemaVersion,
  seed: 'amber-fox-4821',
  content: { id: 'core', version: 1 },
  config: { ...defaultConfig },
  createdAt: 'harness',
};

// Real streams, seeded from the fixture's seed (M1-S2).
const rng = createStreams(meta.seed, streamNames);

/** A valid empty world: every table empty, the Board empty, History empty. */
const defaultDocument = emptyDocument(meta, rng);

// One row in every table, every field populated, so that each row's keys are exactly its
// interface's (an object literal may neither omit a required field nor add an unknown one).
const guildId = makeId('guilds', 1);
const rivalId = makeId('guilds', 2);
const guildmasterId = makeId('guildmasters', 1);
const rivalGuildmasterId = makeId('guildmasters', 2);
const heroId = makeId('heroes', 1);
const patronId = makeId('patrons', 1);
const questId = makeId('quests', 1);
const partyId = makeId('parties', 1);
const offerId = makeId('offers', 1);
const itemId = makeId('items', 1);
const stackId = makeId('stacks', 1);

const regardEntry: RegardEntry = { value: 12, since: 30, reason: 'quest.resolved' };

const guild: Guild = {
  id: guildId,
  name: 'The Iron Lantern',
  backgroundKey: 'disgraced-order',
  foundedTurn: 0,
  guildmasterId,
  rosterIds: [heroId],
  wealth: 500,
  fame: 3,
  belowFloorSince: null,
  foldedOnTurn: null,
  hall: { infirmary: 1, trainingYard: 0, quarters: 0 },
  controller: { kind: 'player' },
  regard: { [patronId]: regardEntry },
};

const rival: Guild = {
  ...guild,
  id: rivalId,
  name: 'The Grey Wardens',
  guildmasterId: rivalGuildmasterId,
  rosterIds: [],
  controller: { kind: 'rival', disposition: 'steady' },
  regard: {},
};

const guildmaster: Guildmaster = {
  id: guildmasterId,
  name: 'Aldric Venn',
  sex: 'male',
  guildId,
  enteredTurn: 0,
  ageAtEntry: 38,
  stats: { inspiration: 12, influence: 9, negotiation: 11, coaching: 8, judgement: 14 },
  traits: ['old-soldier'],
  regard: { [heroId]: regardEntry },
};

const hero: Hero = {
  id: heroId,
  name: 'Brenna Hale',
  sex: 'female',
  backgroundKey: 'farmhand',
  classKey: 'warrior',
  enteredTurn: 0,
  ageAtEntry: 24,
  guildId,
  partyId,
  stats: { strength: 14, weaponry: 12, courage: 9 },
  potential: { strength: 19, weaponry: 17, courage: 15 },
  skills: { swordplay: 2 },
  traits: [],
  xp: 40,
  level: 1,
  injury: { typeKey: 'broken-arm', healsOnTurn: 60 },
  morale: 60,
  diedOnTurn: null,
  retiredOnTurn: null,
  regard: { [guildmasterId]: regardEntry },
};

const patron: Patron = {
  id: patronId,
  name: 'Lady Maud of Stannary',
  sphereKey: 'crown',
  regard: { [guildId]: regardEntry },
};

const quest: Quest = {
  id: questId,
  templateKey: 'clear-the-barrow',
  patronId,
  difficulty: 30,
  tags: ['undead'],
  reward: 120,
  fameEffect: 2,
  durationTurns: 12,
  demands: [
    ['strength', 0.6],
    ['courage', 0.4],
  ],
  skillKeys: ['swordplay'],
  encounterKeys: [],
  requirements: { partySizeMin: 1, partySizeMax: 3, classKey: 'warrior', skillKey: 'swordplay' },
  lootTableKey: null,
  status: 'taken',
  offeredOnTurn: 27,
  expiresOnTurn: 36,
  partyIds: [partyId],
};

const party: Party = {
  id: partyId,
  questId,
  guildId,
  heroIds: [heroId],
  departedOnTurn: 30,
  returnsOnTurn: 44,
};

const offer: TransferOffer = {
  id: offerId,
  kind: 'transfer',
  fromGuildId: guildId,
  toGuildId: rivalId,
  heroId,
  fee: 300,
  offeredOnTurn: 30,
  expiresOnTurn: 39,
};

const item: UniqueItem = {
  id: itemId,
  definitionKey: 'lantern-of-stannary',
  holder: { kind: 'hero', id: heroId, slot: 'trinket' },
};

const stack: Stack = {
  id: stackId,
  definitionKey: 'healing-draught',
  quantity: 3,
  holder: { kind: 'market' },
};

const entry: Entry = {
  turn: 0,
  type: 'guild.founded',
  participants: [guildId],
  labels: { [guildId]: 'The Iron Lantern' },
  milestone: true,
  payload: { guildId },
};

const history: History = {
  entries: [entry],
  byEntity: { [guildId]: [0] },
  byType: { 'guild.founded': [0] },
  milestones: [0],
};

const world: World = {
  turn: 31,
  rng,
  counters: {
    guilds: 3,
    guildmasters: 3,
    heroes: 2,
    patrons: 2,
    quests: 2,
    parties: 2,
    offers: 2,
    items: 2,
    stacks: 2,
  },
  ended: null,
  guilds: { [guildId]: guild, [rivalId]: rival },
  guildmasters: {
    [guildmasterId]: guildmaster,
    [rivalGuildmasterId]: { ...guildmaster, id: rivalGuildmasterId, guildId: rivalId, regard: {} },
  },
  heroes: { [heroId]: hero },
  patrons: { [patronId]: patron },
  quests: { [questId]: quest },
  parties: { [partyId]: party },
  items: { [itemId]: item },
  stacks: { [stackId]: stack },
  board: [],
  offers: { [offerId]: offer },
  modules: { probe: { version: 1, seen: ['hero-000001'] } },
};

const populatedDocument: WorldDocument = { meta, world, history };

/** Every type `data-model.md` names, by that name, holding a fully populated sample. */
interface Documented {
  WorldDocument: WorldDocument;
  Meta: Meta;
  World: World;
  History: History;
  Entry: Entry;
  Guild: Guild;
  Guildmaster: Guildmaster;
  Hero: Hero;
  Patron: Patron;
  Quest: Quest;
  Party: Party;
  TransferOffer: TransferOffer;
  UniqueItem: UniqueItem;
  Stack: Stack;
  RegardEntry: RegardEntry;
}

const documented: Documented = {
  WorldDocument: populatedDocument,
  Meta: meta,
  World: world,
  History: history,
  Entry: entry,
  Guild: guild,
  Guildmaster: guildmaster,
  Hero: hero,
  Patron: patron,
  Quest: quest,
  Party: party,
  TransferOffer: offer,
  UniqueItem: item,
  Stack: stack,
  RegardEntry: regardEntry,
};

/** Every id type `data-model.md` names, by that name. */
const documentedIds: {
  GuildId: GuildId;
  GuildmasterId: GuildmasterId;
  HeroId: HeroId;
  PatronId: PatronId;
  QuestId: QuestId;
  PartyId: PartyId;
  OfferId: OfferId;
  ItemId: ItemId;
  StackId: StackId;
  ModuleId: ModuleId;
} = {
  GuildId: guildId,
  GuildmasterId: guildmasterId,
  HeroId: heroId,
  PatronId: patronId,
  QuestId: questId,
  PartyId: partyId,
  OfferId: offerId,
  ItemId: itemId,
  StackId: stackId,
  ModuleId: 'probe',
};

// ── The document ─────────────────────────────────────────────────────────────────────────────

describe('the World State document', () => {
  test('the default (empty) document is JSON-safe (data-model rule 6)', () => {
    expect(isJsonSafe(defaultDocument)).toBe(true);
    expect(JSON.parse(JSON.stringify(defaultDocument))).toEqual(structuredClone(defaultDocument));
  });

  test('a document with a row in every table is JSON-safe, and structuredClone and JSON agree on it', () => {
    expect(isJsonSafe(populatedDocument)).toBe(true);
    expect(JSON.parse(JSON.stringify(populatedDocument))).toEqual(structuredClone(populatedDocument));
  });

  test('the empty document has empty tables, an empty Board and History, and counters at 1', () => {
    const { world: empty, history: emptyHistory } = defaultDocument;

    expect(empty.turn).toBe(0);
    expect(empty.ended).toBeNull();
    expect(empty.rng).toEqual(rng);
    expect(empty.board).toEqual([]);
    expect(empty.modules).toEqual({});
    for (const table of tableNames) {
      expect(empty[table]).toEqual({});
      expect(empty.counters[table]).toBe(1);
    }
    expect(Object.keys(empty.counters).sort()).toEqual([...tableNames].sort());
    expect(emptyHistory).toEqual({ entries: [], byEntity: {}, byType: {}, milestones: [] });
    expect(defaultDocument.meta).toBe(meta);
  });

  test('the only stream in M1 is generation (ADR-0009 as amended)', () => {
    expect(streamNames).toEqual(['generation']);
  });

  test('the Hall has the three facilities of data-model §3.2', () => {
    expect(facilityKeys).toEqual(['infirmary', 'trainingYard', 'quarters']);
  });
});

// ── Ids ──────────────────────────────────────────────────────────────────────────────────────

describe('ids', () => {
  test.each([
    ['heroes', 42, 'hero-000042'],
    ['guilds', 2, 'guild-000002'],
    ['quests', 1337, 'quest-001337'],
    ['guildmasters', 1, 'guildmaster-000001'],
    ['patrons', 7, 'patron-000007'],
    ['parties', 10, 'party-000010'],
    ['offers', 100, 'offer-000100'],
    ['items', 0, 'item-000000'],
    ['stacks', 999_999, 'stack-999999'],
  ] as const)('makeId(%s, %i) is %s: six digits in every table', (table, n, id) => {
    expect(makeId(table, n)).toBe(id);
  });

  test('every table has its own prefix', () => {
    const prefixes = tableNames.map((table) => idPrefixes[table]);

    expect(new Set(prefixes).size).toBe(tableNames.length);
  });

  test.each([
    ['past 999,999', maxIdNumber + 1],
    ['negative', -1],
    ['not an integer', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('makeId throws on a number %s, a programming error', (_name, n) => {
    expect(() => makeId('heroes', n)).toThrow(RangeError);
  });

  test('parseId reads back what makeId wrote, for every table', () => {
    for (const table of tableNames) {
      for (const n of [0, 1, 42, maxIdNumber]) {
        expect(parseId(makeId(table, n))).toEqual({ table, n });
      }
    }
  });

  test.each([
    'hero-42',
    'hero-0000042',
    'heroes-000042',
    'Hero-000042',
    'villain-000042',
    'constructor-000001',
    'hero-00004a',
    ' hero-000042',
    'hero-000042 ',
    '',
  ])('parseId refuses %j, which is not <table>-<six digits>', (value) => {
    expect(parseId(value)).toBeNull();
  });

  test('isId checks the table as well as the form', () => {
    expect(isId('heroes', 'hero-000001')).toBe(true);
    expect(isId('heroes', 'guild-000001')).toBe(false);
    expect(isId('heroes', 42)).toBe(false);
  });

  test('the compiler refuses a GuildId where a HeroId is expected', () => {
    const nameOf = (id: HeroId): string => (id === hero.id ? hero.name : '');
    const aGuild: GuildId = makeId('guilds', 1);

    // @ts-expect-error a GuildId is not a HeroId; `npm run typecheck` fails if this compiles
    nameOf(aGuild);
    // @ts-expect-error nor is a plain string, even one of the right form
    nameOf('hero-000001');

    expect(nameOf(makeId('heroes', 1))).toBe('Brenna Hale');
    expectTypeOf(makeId('heroes', 1)).toEqualTypeOf<HeroId>();
    expectTypeOf<GuildId>().not.toEqualTypeOf<HeroId>();
  });
});

// ── data-model.md ────────────────────────────────────────────────────────────────────────────
//
// Acceptance: every interface in data-model.md §3.2 and §4 has a type of the same name and
// fields. The field lists are read from the document itself, so the two cannot drift apart
// unnoticed; the samples above are typed with the engine's interfaces, so their keys are
// exactly each interface's fields.

interface Block {
  heading: string;
  label: string;
  lines: string[];
}

const dataModel = readFileSync(new URL('../../docs/data-model.md', import.meta.url), 'utf8');

function fencedBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let heading = '';
  let label = '';
  let open: Block | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (open) {
      if (line.startsWith('```')) {
        blocks.push(open);
        open = null;
      } else {
        open.lines.push(line);
      }
    } else if (line.startsWith('```')) {
      open = { heading, label, lines: [] };
    } else if (line.startsWith('#')) {
      heading = line;
      label = '';
    } else if (line.trim() !== '') {
      label = line;
    }
  }
  return blocks;
}

/**
 * Field names from a block written one declaration per line: `name: type   note`, or a comma
 * list `id, name, sphereKey`. An indented line continues the note above it.
 */
function listedFields(lines: string[]): string[] {
  const fields: string[] = [];
  for (const line of lines) {
    if (line.trim() === '' || /^\s/.test(line)) continue;
    const declaration = line.split(/\s{2,}/)[0] ?? '';
    const single = /^(\w+):/.exec(declaration);
    const parts = single ? [declaration] : declaration.split(',');
    for (const part of parts) {
      const name = /^\s*(\w+)/.exec(part)?.[1];
      if (name) fields.push(name);
    }
  }
  return fields;
}

/** Field names from a block written as one object literal: `{ value: number, since: turn }`. */
function bracedFields(lines: string[]): string[] {
  const text = lines.join(' ');
  const body = text.slice(text.indexOf('{') + 1, text.lastIndexOf('}'));
  const parts: string[] = [];
  let depth = 0;
  let part = '';
  for (const character of body) {
    if ('<{[('.includes(character)) depth += 1;
    if ('>}])'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(part);
      part = '';
    } else {
      part += character;
    }
  }
  parts.push(part);
  return parts.map((each) => /^\s*(\w+)/.exec(each)?.[1] ?? '').filter(Boolean);
}

/** The interfaces of the §8 type sketch, by name, with their field names. */
function sketchedInterfaces(lines: string[]): Map<string, string[]> {
  const interfaces = new Map<string, string[]>();
  let fields: string[] | null = null;
  for (const line of lines) {
    const opened = /^interface (\w+) \{/.exec(line);
    if (opened?.[1]) {
      fields = [];
      interfaces.set(opened[1], fields);
    } else if (line.startsWith('}')) {
      fields = null;
    } else {
      const name = /^\s+(\w+):/.exec(line)?.[1];
      if (fields && name) fields.push(name);
    }
  }
  return interfaces;
}

const blocks = fencedBlocks(dataModel);
const inSection = (prefix: string) => blocks.filter((block) => block.heading.startsWith(prefix));
const sketch = sketchedInterfaces(inSection('## 8.').flatMap((block) => block.lines));

/** From the sketch's `guilds: Record<GuildId, Guild>;`: each table's id type and row type. */
const sketchedRecords = [...dataModel.matchAll(/^ {2}(\w+): Record<(\w+), (\w+)>;/gm)].map(
  ([, field = '', key = '', value = '']) => ({ field, key, value }),
);

/** The row blocks of §3.2 and §3.3, headed `**guilds**`, `**RegardEntry**` and the like. */
const rowBlocks = blocks
  .filter((block) => /^### 3\.[23] /.test(block.heading))
  .map((block) => ({ name: /^\*\*(\w+)\*\*/.exec(block.label)?.[1] ?? '', lines: block.lines }))
  .filter((block) => block.name !== '');

function keysOf(name: string): string[] {
  expect(Object.keys(documented), `no type named ${name}`).toContain(name);
  return Object.keys(documented[name as keyof Documented]).sort();
}

describe('the types match data-model.md', () => {
  test('the document was read: its row blocks name exactly the engine tables, plus RegardEntry', () => {
    const names = rowBlocks.map((block) => block.name);

    expect(names.filter((name) => name !== 'RegardEntry').sort()).toEqual([...tableNames].sort());
    expect(names).toContain('RegardEntry');
  });

  test('every table of §3.2 and §3.3 has a row type of the name the §8 sketch gives it, with the same fields', () => {
    for (const { name, lines } of rowBlocks) {
      const typeName = name === 'RegardEntry' ? name : sketchedRecords.find((record) => record.field === name)?.value;
      const fields = name === 'RegardEntry' ? bracedFields(lines) : listedFields(lines);

      expect(typeName, `the §8 sketch names no row type for ${name}`).toBeDefined();
      expect(fields.length, `no fields read for ${name}`).toBeGreaterThan(1);
      expect(keysOf(typeName ?? ''), `${typeName} (data-model §3: ${name})`).toEqual(fields.sort());
    }
  });

  test('History and Entry match §4', () => {
    const [historyBlock, entryBlock] = inSection('## 4.');

    expect(keysOf('History')).toEqual(listedFields(historyBlock?.lines ?? []).sort());
    expect(keysOf('Entry')).toEqual(bracedFields(entryBlock?.lines ?? []).sort());
  });

  test('Meta matches §2', () => {
    const [metaBlock] = inSection('## 2.');

    expect(keysOf('Meta')).toEqual(listedFields(metaBlock?.lines ?? []).sort());
  });

  test('World holds §3.1, every table, the Board and §3.4, exactly as the §8 sketch lists', () => {
    const [timeBlock] = inSection('### 3.1');
    const [modulesBlock] = inSection('### 3.4');
    const described = [
      ...listedFields(timeBlock?.lines ?? []),
      ...tableNames,
      'board',
      ...listedFields(modulesBlock?.lines ?? []),
    ];

    expect(keysOf('World')).toEqual(described.sort());
    expect(keysOf('World')).toEqual([...(sketch.get('World') ?? [])].sort());
  });

  test('every interface of the §8 sketch exists with the same fields', () => {
    expect([...sketch.keys()].sort()).toEqual(['History', 'World', 'WorldDocument']);
    for (const [name, fields] of sketch) {
      expect(keysOf(name), name).toEqual([...fields].sort());
    }
  });

  test('every id type the §8 sketch names exists', () => {
    const idTypes = sketchedRecords.map((record) => record.key).filter((key) => key.endsWith('Id'));

    expect(idTypes.length).toBeGreaterThanOrEqual(tableNames.length);
    for (const idType of idTypes) expect(Object.keys(documentedIds)).toContain(idType);
  });

  test('the unions data-model §3 spells out are the types', () => {
    expectTypeOf<Holder['kind']>().toEqualTypeOf<'hero' | 'guild' | 'party'>();
    expectTypeOf<StackHolder['kind']>().toEqualTypeOf<'hero' | 'guild' | 'party' | 'market'>();
    expectTypeOf<Extract<Holder, { kind: 'hero' }>>().toHaveProperty('slot');
    expectTypeOf<Controller['kind']>().toEqualTypeOf<'player' | 'rival'>();
    expectTypeOf<Extract<Controller, { kind: 'rival' }>>().toHaveProperty('disposition');
    expectTypeOf<Quest['status']>().toEqualTypeOf<'offered' | 'taken' | 'resolved'>();
    expectTypeOf<TransferOffer['kind']>().toEqualTypeOf<'transfer'>();
    expectTypeOf<FacilityKey>().toEqualTypeOf<'infirmary' | 'trainingYard' | 'quarters'>();
    expectTypeOf<Hero['skills'][string]>().toEqualTypeOf<1 | 2 | 3 | 4 | 5>();
    expectTypeOf<Hero['guildId']>().toEqualTypeOf<GuildId | null>();
    expectTypeOf<World['board']>().toEqualTypeOf<QuestId[]>();
  });
});
