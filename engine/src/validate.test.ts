import { describe, expect, test } from 'vitest';
import {
  append,
  makeId,
  parseId,
  passiveEntryTypes,
  refusalChecks,
  validate,
  warningChecks,
  type ContentSet,
  type Guild,
  type Guildmaster,
  type Hero,
  type Party,
  type Patron,
  type Quest,
  type RefusalCheck,
  type RegardEntry,
  type Stack,
  type TransferOffer,
  type UniqueItem,
  type WarningCheck,
  type WorldDocument,
} from './index.js';
import { buildDocument, fixtureTurn, heroStatKeys, testContent, testDeps, withValid } from './world.test-support.js';

// M1-S7: the validator of data-model §6. Each refusal test mutates the valid fixture document into
// one failing shape and asserts the check it names and the id it points at, never the prose.

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

/** buildDocument is deterministic, so every document it builds has these ids. */
const { ids } = buildDocument();
const idleHero = ids.idleHero ?? makeId('heroes', 0);
const unattachedHero = ids.unattachedHero ?? makeId('heroes', 0);

const deps = testDeps();

function row<Row>(table: Record<string, Row>, id: string): Row {
  const found = table[id];
  if (found === undefined) throw new Error(`The fixture has no ${id}`);
  return found;
}

type Doc = WorldDocument;
type Mutation = (document: Doc) => unknown;

const guild = (d: Doc, id: string): Guild => row(d.world.guilds, id);
const guildmaster = (d: Doc, id: string): Guildmaster => row(d.world.guildmasters, id);
const hero = (d: Doc, id: string): Hero => row(d.world.heroes, id);
const patron = (d: Doc, id: string): Patron => row(d.world.patrons, id);
const quest = (d: Doc, id: string): Quest => row(d.world.quests, id);
const party = (d: Doc, id: string): Party => row(d.world.parties, id);
const offer = (d: Doc, id: string): TransferOffer => row(d.world.offers, id);
const item = (d: Doc, id: string): UniqueItem => row(d.world.items, id);
const stack = (d: Doc, id: string): Stack => row(d.world.stacks, id);

/** Where a failure points, without its prose. */
interface Named {
  check: RefusalCheck;
  id: string;
}

const failure = (check: RefusalCheck, id: string): Named => ({ check, id });

/** The failures the fixture document has once `mutate` has changed it; none when it is accepted. */
function refusals(mutate: Mutation): Named[] {
  const { document } = buildDocument();
  mutate(document);
  const result = validate(document, deps);
  return result.ok ? [] : result.failures.map(({ check, id }) => failure(check, id));
}

function warnings(mutate: Mutation, content: ContentSet = testContent) {
  const { document } = buildDocument();
  mutate(document);
  const result = validate(document, { ...deps, content });
  if (!result.ok) throw new Error(`Refused: ${result.failures.map(({ check }) => check).join(', ')}`);
  return result.warnings.map(({ check, id, key }) => ({ check, id, key }));
}

const regard = (): RegardEntry => ({ value: 5, since: 20, reason: 'quest.resolved' });

/** A second Party, the Rival's, on `questId`, which lists it. */
function secondParty(document: Doc, questId: Quest['id'], heroIds: Hero['id'][]): Party {
  const id = makeId('parties', document.world.counters.parties++);
  const second: Party = { id, questId, guildId: ids.rivalGuild, heroIds, departedOnTurn: 39, returnsOnTurn: 47 };
  document.world.parties[id] = second;
  quest(document, questId).partyIds.push(id);
  return second;
}

// ── The fixture ──────────────────────────────────────────────────────────────────────────────

describe('a valid document', () => {
  test('is accepted with no warning', () => {
    const { document } = buildDocument();
    expect(validate(document, deps)).toEqual({ ok: true, warnings: [] });
    expect(withValid(document, deps)).toBe(document);
  });

  test('holds every lifecycle the validator tells apart', () => {
    const { document } = buildDocument();
    const { world, history } = document;
    // A dead Hero keeps their row and guildId, off the Roster.
    expect(hero(document, ids.deadHero).diedOnTurn).not.toBeNull();
    expect(guild(document, ids.playerGuild).rosterIds).not.toContain(ids.deadHero);
    // A resolved Quest and a pool Hero who left have no row; the History still names them.
    expect(world.quests).not.toHaveProperty(ids.resolvedQuest);
    expect(world.heroes).not.toHaveProperty(ids.departedHero);
    expect(history.byEntity[ids.resolvedQuest]).toHaveLength(1);
    const departed = history.byEntity[ids.departedHero]?.map((position) => history.entries[position]?.type);
    expect(departed).toEqual([...passiveEntryTypes]);
    // A stack for every kind of holder.
    const holders = Object.values(world.stacks).map(({ holder }) => holder.kind);
    expect(holders.sort()).toEqual(['guild', 'hero', 'market', 'party']);
  });

  test.each([
    ['null', null],
    ['a number', 42],
    ['a string', 'hero-000001'],
    ['an array', []],
    ['an empty object', {}],
    ['empty sections', { meta: {}, world: {}, history: {} }],
  ])('%s is refused by document-shape, without a throw', (_, value) => {
    const result = validate(value, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(new Set(result.failures.map(({ check }) => check))).toEqual(new Set(['document-shape']));
  });
});

// ── data-model §6, one describe per refusal row ──────────────────────────────────────────────

describe('§6: an id referenced by a row that does not exist in its table', () => {
  const nowhere = {
    guild: makeId('guilds', 99),
    guildmaster: makeId('guildmasters', 99),
    hero: makeId('heroes', 999),
    party: makeId('parties', 99),
    patron: makeId('patrons', 99),
    quest: makeId('quests', 99),
  };

  test.each<[string, Mutation, string, Named[]?]>([
    ["a Guild's Guildmaster", (d) => (guild(d, ids.playerGuild).guildmasterId = nowhere.guildmaster), ids.playerGuild],
    ['a Roster', (d) => guild(d, ids.rivalGuild).rosterIds.push(nowhere.hero), ids.rivalGuild],
    [
      "a Guildmaster's Guild",
      (d) => (guildmaster(d, ids.playerGuildmaster).guildId = nowhere.guild),
      ids.playerGuildmaster,
      // Their Guild names them, and their guildId is not that Guild.
      [failure('guildmaster-guild-mismatch', ids.playerGuildmaster)],
    ],
    [
      "a Hero's Guild",
      // Out of the pool as well, as recruiting would leave them, so only the Guild is wrong.
      (d) => Object.assign(hero(d, unattachedHero), { guildId: nowhere.guild, unattachedSince: null }),
      unattachedHero,
    ],
    ["a Hero's Party", (d) => (hero(d, idleHero).partyId = nowhere.party), idleHero],
    ["a Quest's Patron", (d) => (quest(d, ids.offeredQuest).patronId = nowhere.patron), ids.offeredQuest],
    ["a Quest's Parties", (d) => quest(d, ids.offeredQuest).partyIds.push(nowhere.party), ids.offeredQuest],
    ["a Party's Quest", (d) => delete d.world.quests[ids.takenQuest], ids.party],
    ["a Party's Guild", (d) => (party(d, ids.party).guildId = nowhere.guild), ids.party],
    ["a Party's Heroes", (d) => party(d, ids.party).heroIds.push(nowhere.hero), ids.party],
    ["an offer's Guild", (d) => (offer(d, ids.offer).toGuildId = nowhere.guild), ids.offer],
    [
      "an offer's Hero",
      (d) => (offer(d, ids.offer).heroId = nowhere.hero),
      ids.offer,
      // A Hero who does not exist is on no Roster either.
      [failure('offer-hero-not-on-roster', ids.offer)],
    ],
    ["a unique Item's holder", (d) => (item(d, ids.item).holder = { kind: 'party', id: nowhere.party }), ids.item],
    [
      "a stack's holder",
      (d) => (stack(d, ids.heroStack).holder = { kind: 'hero', id: nowhere.hero, slot: 'belt' }),
      ids.heroStack,
    ],
    ['a Regard key', (d) => (hero(d, ids.partyHero).regard[nowhere.patron] = regard()), ids.partyHero],
    ['the Board', (d) => d.world.board.push(nowhere.quest), '$.world.board'],
  ])('in %s', (_, mutate, id, also = []) => {
    expect(refusals(mutate)).toEqual([failure('dangling-reference', id), ...also]);
  });
});

describe('§6: a Hero on two Rosters, or in two Parties, or on a Roster of a Guild other than guildId', () => {
  test('on two Rosters', () => {
    expect(refusals((d) => guild(d, ids.rivalGuild).rosterIds.push(idleHero))).toEqual([
      failure('hero-on-two-rosters', idleHero),
      // Whichever Roster is right, the other disagrees with the Hero's guildId.
      failure('roster-guild-mismatch', idleHero),
    ]);
  });

  test('twice on one Roster', () => {
    expect(refusals((d) => guild(d, ids.playerGuild).rosterIds.push(idleHero))).toEqual([
      failure('hero-on-two-rosters', idleHero),
    ]);
  });

  test('in two Parties', () => {
    expect(refusals((d) => secondParty(d, ids.offeredQuest, [ids.partyHero]))).toEqual([
      failure('hero-in-two-parties', ids.partyHero),
      // The Hero's partyId can name only one of them.
      failure('party-member-mismatch', ids.partyHero),
    ]);
  });

  test('on the Roster of a Guild other than their guildId', () => {
    expect(refusals((d) => (hero(d, idleHero).guildId = ids.rivalGuild))).toEqual([
      // On the player's Roster with the Rival's guildId, and missing from the Rival's Roster.
      failure('roster-guild-mismatch', idleHero),
      failure('roster-guild-mismatch', idleHero),
    ]);
  });

  const offTheRoster = (d: Doc): void => {
    const player = guild(d, ids.playerGuild);
    player.rosterIds = player.rosterIds.filter((id) => id !== idleHero);
  };

  test("a living Hero missing from their Guild's Roster", () => {
    expect(refusals(offTheRoster)).toEqual([failure('roster-guild-mismatch', idleHero)]);
  });

  test('a retired Hero off the Roster, keeping their guildId, is accepted', () => {
    const retired = (d: Doc): void => {
      offTheRoster(d);
      hero(d, idleHero).retiredOnTurn = 38;
    };
    expect(refusals(retired)).toEqual([]);
  });

  test('a Hero whose partyId names a Party that does not list them, or the reverse', () => {
    expect(refusals((d) => (hero(d, idleHero).partyId = ids.party))).toEqual([
      failure('party-member-mismatch', idleHero),
    ]);
    expect(refusals((d) => (hero(d, ids.partyHero).partyId = null))).toEqual([
      failure('party-member-mismatch', ids.partyHero),
    ]);
  });
});

describe("§6: a Hero's pool fields disagree with their Guild (DL-27)", () => {
  test.each<[string, Mutation, string]>([
    [
      'a Hero on a Roster still in the pool',
      (d) => {
        hero(d, unattachedHero).guildId = ids.rivalGuild;
        guild(d, ids.rivalGuild).rosterIds.push(unattachedHero);
      },
      unattachedHero,
    ],
    ['a Hero on a Roster marked as gone from the pool', (d) => (hero(d, idleHero).leftPoolOnTurn = 30), idleHero],
    ['a pool Hero marked as gone from it too', (d) => (hero(d, unattachedHero).leftPoolOnTurn = 30), unattachedHero],
    ['a pool Hero who has retired', (d) => (hero(d, unattachedHero).retiredOnTurn = 30), unattachedHero],
    [
      'a Hero with no Guild, not in the pool, not gone',
      (d) => (hero(d, unattachedHero).unattachedSince = null),
      unattachedHero,
    ],
  ])('%s is refused', (_, mutate, id) => {
    expect(refusals(mutate)).toEqual([failure('unattached-mismatch', id)]);
  });

  test.each<[string, Mutation]>([
    [
      'a Hero who left the pool and whose row an entry kept',
      (d) => Object.assign(hero(d, unattachedHero), { unattachedSince: null, leftPoolOnTurn: 30 }),
    ],
    [
      'a Hero with no Guild who retired out of the pool',
      (d) => Object.assign(hero(d, unattachedHero), { unattachedSince: null, retiredOnTurn: 30 }),
    ],
  ])('%s is accepted', (_, mutate) => {
    expect(refusals(mutate)).toEqual([]);
  });
});

describe('§6: a Guildmaster whose guildId differs from the Guild that names them', () => {
  test('is refused, naming the Guildmaster', () => {
    expect(refusals((d) => (guildmaster(d, ids.playerGuildmaster).guildId = ids.rivalGuild))).toEqual([
      failure('guildmaster-guild-mismatch', ids.playerGuildmaster),
    ]);
  });
});

describe('§6: quest.partyIds and party.questId disagree, or more Parties than the build allows', () => {
  test("a Party whose questId is another Quest's", () => {
    expect(refusals((d) => (party(d, ids.party).questId = ids.offeredQuest))).toEqual([
      failure('quest-party-mismatch', ids.takenQuest),
      failure('quest-party-mismatch', ids.party),
    ]);
  });

  test('a Party its Quest does not list', () => {
    expect(refusals((d) => (quest(d, ids.takenQuest).partyIds = []))).toEqual([
      failure('quest-party-mismatch', ids.party),
    ]);
  });

  test('two Parties on one Quest, where the first build allows one', () => {
    const twoParties = (d: Doc): void => {
      const rivalHero = guild(d, ids.rivalGuild).rosterIds[1] ?? ids.rivalHero;
      hero(d, rivalHero).partyId = secondParty(d, ids.takenQuest, [rivalHero]).id;
    };
    expect(refusals(twoParties)).toEqual([failure('too-many-parties', ids.takenQuest)]);
  });
});

describe('§6: two stacks with the same definition, holder and slot', () => {
  const copyInSlot = (slot: string) => (d: Doc) => {
    const id = makeId('stacks', d.world.counters.stacks++);
    d.world.stacks[id] = { ...stack(d, ids.heroStack), id, holder: { kind: 'hero', id: ids.partyHero, slot } };
  };

  test('are refused, naming the second', () => {
    const second = makeId('stacks', buildDocument().document.world.counters.stacks);
    expect(refusals(copyInSlot('belt'))).toEqual([failure('duplicate-stack', second)]);
  });

  test('in two slots of one Hero are accepted', () => {
    expect(refusals(copyInSlot('pack'))).toEqual([]);
  });
});

describe("§6: an offer whose Hero is not on fromGuildId's Roster, or whose expiresOnTurn is past", () => {
  test("a Hero on another Guild's Roster", () => {
    expect(refusals((d) => (offer(d, ids.offer).heroId = idleHero))).toEqual([
      failure('offer-hero-not-on-roster', ids.offer),
    ]);
  });

  test('an offer past its expiry', () => {
    expect(refusals((d) => (offer(d, ids.offer).expiresOnTurn = fixtureTurn - 1))).toEqual([
      failure('offer-expired', ids.offer),
    ]);
  });

  test('an offer expiring this Turn is still live', () => {
    expect(refusals((d) => (offer(d, ids.offer).expiresOnTurn = fixtureTurn))).toEqual([]);
  });
});

describe('§6: an id not of the form <table>-<six digits>, or a counter past 999,999', () => {
  /** Moves the unattached Hero's row under `key`; their one entry is passive, so nothing else fails. */
  const rekey = (key: string) => (d: Doc) => {
    const moved = hero(d, unattachedHero);
    delete d.world.heroes[unattachedHero];
    (d.world.heroes as Record<string, Hero>)[key] = { ...moved, id: key as Hero['id'] };
  };

  test.each([
    ['too few digits', 'hero-42'],
    ["another table's prefix", 'guild-000050'],
    ['no prefix', '000050'],
  ])('a row keyed with %s', (_, key) => {
    expect(refusals(rekey(key))).toEqual([failure('id-format', key)]);
  });

  test('a row whose id is not its key', () => {
    expect(refusals((d) => (hero(d, unattachedHero).id = makeId('heroes', 77)))).toEqual([
      failure('id-format', unattachedHero),
    ]);
  });

  test('a Regard key that is not an id', () => {
    const regardFor = (d: Doc): Record<string, RegardEntry> => hero(d, ids.partyHero).regard;
    expect(refusals((d) => (regardFor(d)['the-crown'] = regard()))).toEqual([failure('id-format', ids.partyHero)]);
  });

  test('a History participant that is not an id', () => {
    const found = refusals((d) => (d.history.entries[0]?.participants as string[]).push('nobody'));
    expect(found).toContainEqual(failure('id-format', '$.history.entries[0].participants[0]'));
  });

  test('a History index key that is not an id', () => {
    expect(refusals((d) => ((d.history.byEntity as Record<string, number[]>).nobody = []))).toEqual([
      failure('id-format', '$.history.byEntity.nobody'),
    ]);
  });

  test('a counter past 999,999', () => {
    expect(refusals((d) => (d.world.counters.quests = 1_000_000))).toEqual([
      failure('counter-range', '$.world.counters.quests'),
    ]);
  });

  test('a counter that would reuse an id only the History still holds', () => {
    const departed = parseId(ids.departedHero)?.n ?? 0;
    expect(refusals((d) => (d.world.counters.heroes = departed))).toEqual([
      failure('counter-range', '$.world.counters.heroes'),
    ]);
  });

  test('a missing counter', () => {
    expect(refusals((d) => delete (d.world.counters as Partial<Record<string, number>>).items)).toEqual([
      failure('counter-range', '$.world.counters.items'),
    ]);
  });
});

describe('§6: a History position outside entries', () => {
  test.each<[string, (d: Doc) => number[], string]>([
    ['byEntity', (d) => d.history.byEntity[ids.partyHero] ?? [], `$.history.byEntity["${ids.partyHero}"]`],
    ['byType', (d) => d.history.byType['hero.died'] ?? [], '$.history.byType["hero.died"]'],
    ['milestones', (d) => d.history.milestones, '$.history.milestones'],
  ])('in %s', (_, list, path) => {
    for (const outside of [-1, 1.5, 10_000]) {
      let index = 0;
      const found = refusals((d) => {
        const positions = list(d);
        index = positions.length;
        positions.push(outside);
      });
      expect(found).toContainEqual(failure('history-position-out-of-range', `${path}[${index}]`));
    }
  });
});

// ── The checks beyond §6's rows (DL-20) ──────────────────────────────────────────────────────

describe('json-safe (rule 6), over the whole document', () => {
  const payloadOf = (d: Doc, index: number) => d.history.entries[index] as { payload: unknown };

  test.each<[string, Mutation, string]>([
    ['NaN in a row', (d) => (hero(d, ids.partyHero).morale = Number.NaN), `$.world.heroes["${ids.partyHero}"].morale`],
    ['undefined in a payload', (d) => (payloadOf(d, 3).payload = { at: undefined }), '$.history.entries[3].payload.at'],
    ['a Map in a module slice', (d) => (d.world.modules.probe = new Map()), '$.world.modules.probe'],
  ])('%s is refused, naming the path', (_, mutate, path) => {
    expect(refusals(mutate)).toEqual([failure('json-safe', path)]);
  });
});

describe('document-shape', () => {
  /** Sets `field` of `target` to a value its type forbids. */
  const set = (target: object, field: string, value: unknown): void => {
    (target as Record<string, unknown>)[field] = value;
  };
  const drop = (target: object, field: string): void => {
    Reflect.deleteProperty(target, field);
  };
  const heroPath = `$.world.heroes["${ids.partyHero}"]`;
  const itemPath = `$.world.items["${ids.item}"]`;
  const patronPath = `$.world.patrons["${ids.patron}"]`;

  test.each<[string, Mutation, string]>([
    ['a missing table', (d) => drop(d.world, 'offers'), '$.world.offers'],
    ['a missing field', (d) => drop(hero(d, ids.partyHero), 'stats'), `${heroPath}.stats`],
    ['a field of the wrong kind', (d) => set(hero(d, ids.partyHero), 'traits', 'none'), `${heroPath}.traits`],
    ['a row that is not an object', (d) => set(d.world.patrons, ids.patron, 'Maud'), patronPath],
    ['an entry without a payload', (d) => drop(d.history.entries[0] ?? {}, 'payload'), '$.history.entries[0].payload'],
    ['an index that is not a list', (d) => set(d.history.byType, 'hero.died', 4), '$.history.byType["hero.died"]'],
    [
      'a Quest demand that is not a pair',
      (d) => set(quest(d, ids.takenQuest).demands, '0', 'strength'),
      `$.world.quests["${ids.takenQuest}"].demands[0]`,
    ],
    [
      'a unique Item held by the Market',
      (d) => set(item(d, ids.item), 'holder', { kind: 'market' }),
      `${itemPath}.holder.kind`,
    ],
    [
      'a holder without its slot',
      (d) => set(item(d, ids.item), 'holder', { kind: 'hero', id: ids.partyHero }),
      `${itemPath}.holder.slot`,
    ],
  ])('%s is refused, and no other check runs on it', (_, mutate, path) => {
    expect(refusals(mutate)).toEqual([failure('document-shape', path)]);
  });

  test('a field no interface names is kept and ignored (rule 5)', () => {
    const { document } = buildDocument();
    set(hero(document, ids.partyHero), 'nickname', 'the Lantern');
    set(document, 'notes', ['kept']);
    expect(validate(document, deps)).toEqual({ ok: true, warnings: [] });
  });
});

describe('the History indexes agree with the entries', () => {
  test('a position pointing at an entry of another type', () => {
    expect(refusals((d) => (d.history.byType['hero.died'] = [0]))).toEqual([
      failure('history-index-mismatch', '$.history.byType["hero.died"]'),
    ]);
  });

  test('positions out of order', () => {
    expect(refusals((d) => d.history.byEntity[ids.partyHero]?.reverse())).toEqual([
      failure('history-index-mismatch', `$.history.byEntity["${ids.partyHero}"]`),
    ]);
  });

  test.each<[string, Mutation, string]>([
    ['byType', (d) => d.history.byType['hero.died']?.pop(), '$.history.byType'],
    ['byEntity', (d) => d.history.byEntity[ids.deadHero]?.pop(), '$.history.byEntity'],
    ['milestones', (d) => d.history.milestones.pop(), '$.history.milestones'],
  ])('an entry %s leaves out', (_, mutate, id) => {
    expect(refusals(mutate)).toEqual([failure('history-index-mismatch', id)]);
  });

  test("entries out of Turn order, or after the world's Turn", () => {
    const last = buildDocument().document.history.entries.length - 1;
    const at = (turn: number) => (d: Doc) => ((d.history.entries[last] as { turn: number }).turn = turn);
    expect(refusals(at(0))).toEqual([failure('history-turn-order', `$.history.entries[${last}]`)]);
    expect(refusals(at(fixtureTurn + 1))).toEqual([failure('history-turn-order', `$.history.entries[${last}]`)]);
  });
});

describe('rule 8: a removed Hero named by a non-passive entry', () => {
  test('the passive entry types are a named list', () => {
    expect(passiveEntryTypes).toEqual(['hero.generated', 'hero.left-pool']);
  });

  test('a dead Hero removed while hero.died names them is refused', () => {
    expect(refusals((d) => delete d.world.heroes[ids.deadHero])).toEqual([
      failure('removed-hero-in-history', ids.deadHero),
    ]);
  });

  test('a pool Hero gone with only passive entries is accepted; one any other entry names is refused', () => {
    expect(refusals(() => undefined)).toEqual([]);
    const named = (d: Doc): void => {
      const participants = [ids.departedHero, ids.playerGuild];
      const entry = { turn: fixtureTurn, participants, labels: {}, milestone: false, payload: {} };
      append(d.history, { ...entry, type: 'hero.recruited' });
    };
    expect(refusals(named)).toEqual([failure('removed-hero-in-history', ids.departedHero)]);
  });

  test('a Quest removed while the History names it is accepted', () => {
    const removed = (d: Doc): void => {
      delete d.world.quests[ids.offeredQuest];
      d.world.board = [];
    };
    expect(refusals(removed)).toEqual([]);
  });
});

// ── Warnings: content keys (rule 5) ──────────────────────────────────────────────────────────

describe('a key the content does not define warns and never refuses', () => {
  test('an unknown Stat on a Hero warns, and the Hero keeps it and their other Stats', () => {
    const { document } = buildDocument();
    const before = { ...hero(document, ids.partyHero).stats };
    hero(document, ids.partyHero).stats.luck = 7;

    const result = validate(document, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map(({ check, id, key }) => ({ check, id, key }))).toEqual([
      { check: 'unknown-stat', id: ids.partyHero, key: 'luck' },
    ]);
    const stats = hero(document, ids.partyHero).stats;
    expect(stats).toEqual({ ...before, luck: 7 });
    for (const key of heroStatKeys) expect(stats[key]).toBe(before[key]);
  });

  const gm = ids.playerGuildmaster;
  const offered = ids.offeredQuest;
  test.each<[string, Mutation, WarningCheck, string, string]>([
    [
      'a Guildmaster Stat on a Hero',
      (d) => (hero(d, idleHero).potential.judgement = 2),
      'unknown-stat',
      idleHero,
      'judgement',
    ],
    ['a Hero Stat on a Guildmaster', (d) => (guildmaster(d, gm).stats.strength = 9), 'unknown-stat', gm, 'strength'],
    ['a Quest demand', (d) => quest(d, offered).demands.push(['luck', 1]), 'unknown-stat', offered, 'luck'],
    ['a Class', (d) => (hero(d, idleHero).classKey = 'bard'), 'unknown-class', idleHero, 'bard'],
    [
      'a Class a Quest requires',
      (d) => (quest(d, ids.takenQuest).requirements.classKey = 'bard'),
      'unknown-class',
      ids.takenQuest,
      'bard',
    ],
    ['a Skill', (d) => (hero(d, idleHero).skills.juggling = 2), 'unknown-skill', idleHero, 'juggling'],
    [
      'a Skill a Quest reads',
      (d) => quest(d, ids.offeredQuest).skillKeys.push('juggling'),
      'unknown-skill',
      ids.offeredQuest,
      'juggling',
    ],
    [
      'a Guildmaster Trait on a Hero',
      (d) => hero(d, idleHero).traits.push('thrifty'),
      'unknown-trait',
      idleHero,
      'thrifty',
    ],
    [
      'a Hero Background on a Guild',
      (d) => (guild(d, ids.rivalGuild).backgroundKey = 'farm-born'),
      'unknown-background',
      ids.rivalGuild,
      'farm-born',
    ],
    ['a Sphere', (d) => (patron(d, ids.patron).sphereKey = 'the-sea'), 'unknown-sphere', ids.patron, 'the-sea'],
    ['an Item', (d) => (stack(d, ids.marketStack).definitionKey = 'rope'), 'unknown-item', ids.marketStack, 'rope'],
    [
      'a Quest template',
      (d) => (quest(d, ids.offeredQuest).templateKey = 'slay-the-wyrm'),
      'unknown-template',
      ids.offeredQuest,
      'slay-the-wyrm',
    ],
  ])('%s', (_, mutate, check, id, key) => {
    expect(warnings(mutate)).toEqual([{ check, id, key }]);
  });

  test('before content has Quest templates or Items, every such key warns', () => {
    const withoutLaterTables: ContentSet = { ...testContent };
    Reflect.deleteProperty(withoutLaterTables, 'questTemplates');
    Reflect.deleteProperty(withoutLaterTables, 'items');
    const found = warnings(() => undefined, withoutLaterTables);
    const templates = found.filter(({ check }) => check === 'unknown-template').map(({ id }) => id);
    expect(templates).toEqual([ids.takenQuest, ids.offeredQuest]);
    // The unique Item and the four stacks.
    expect(found.filter(({ check }) => check === 'unknown-item')).toHaveLength(5);
  });
});

// ── The checks' names, and speed ─────────────────────────────────────────────────────────────

describe('the checks', () => {
  test('have unique kebab-case names', () => {
    const names = [...refusalChecks, ...warningChecks];
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+(-[a-z0-9]+)*$/);
  });

  test('validate a 1,000-Hero world in under 50 ms (median of seven runs)', () => {
    const { document } = buildDocument({ rivals: 9, rosterSize: 20, unattached: 799 });
    expect(Object.keys(document.world.heroes)).toHaveLength(1000);
    withValid(document, deps);

    const times = Array.from({ length: 7 }, () => {
      const start = performance.now();
      validate(document, deps);
      return performance.now() - start;
    }).sort((a, b) => a - b);

    expect(times[3]).toBeLessThan(50);
  });
});

describe('withValid', () => {
  test('throws, naming the check and the id, on a refused document', () => {
    const { document } = buildDocument();
    delete document.world.heroes[ids.deadHero];
    expect(() => withValid(document, deps)).toThrow(`removed-hero-in-history ${ids.deadHero}`);
  });

  test('throws on a warning unless warnings are allowed', () => {
    const { document } = buildDocument();
    hero(document, ids.partyHero).stats.luck = 7;
    expect(() => withValid(document, deps)).toThrow(`unknown-stat ${ids.partyHero}`);
    expect(withValid(document, deps, { allowWarnings: true })).toBe(document);
  });
});
