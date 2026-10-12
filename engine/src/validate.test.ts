import { describe, expect, test } from 'vitest';
import {
  advance,
  createWorld,
  parseId,
  validate,
  type ContentSet,
  type Entry,
  type Guild,
  type Guildmaster,
  type Hero,
  type Holder,
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
import { append } from './history.js';
import { makeId, takeId } from './document.js';
import { passiveEntryTypes, refusalChecks, warningChecks } from './validate.js';
import { buildDocument, checkWhatHistoryFromHid, fixtureTurn, heroStatKeys, setEncounters, testContent, testDeps, withValid } from './world.test-support.js';

// The validator of data-model §6. Each refusal test mutates the valid fixture document into
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
  const second: Party = { id, questId, guildId: ids.rivalGuild, heroIds, departedOnTurn: 39, returnsOnTurn: 47, fatigueAtDispatch: Object.fromEntries(heroIds.map((heroId) => [heroId, 0])) };
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
    [
      "a Party's Heroes",
      // Its Fatigue at dispatch recorded, so that only the reference is wrong.
      (d) => {
        party(d, ids.party).heroIds.push(nowhere.hero);
        party(d, ids.party).fatigueAtDispatch[nowhere.hero] = 0;
      },
      ids.party,
    ],
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
      (d) => (stack(d, ids.heroStack).holder = { kind: 'hero', id: nowhere.hero, slot: 'armour' }),
      ids.heroStack,
    ],
    // DL-50: a Party's consumables go home as it is removed, so none is held by a removed Party.
    ["a Party's consumables' holder", (d) => (stack(d, ids.partyStack).holder = { kind: 'party', id: nowhere.party }), ids.partyStack],
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

  test("a Party whose Fatigue at dispatch misses one of its Heroes, or names another, naming the Party (DL-282)", () => {
    expect(refusals((d) => (party(d, ids.party).fatigueAtDispatch = {}))).toEqual([failure('party-member-mismatch', ids.party)]);
    expect(refusals((d) => (party(d, ids.party).fatigueAtDispatch[idleHero] = 0))).toEqual([failure('party-member-mismatch', ids.party)]);
    expect(refusals((d) => (party(d, ids.party).fatigueAtDispatch = { [idleHero]: 0 }))).toEqual([failure('party-member-mismatch', ids.party)]);
  });
});

// ADR-0011, DL-203: a Hero out of play is written once, frozen and shared by the per-Turn
// copy; the rules that walk a Roster or a Party write those they find, so a save with one there is
// refused, not played until a write to the frozen row throws.
describe('a Hero out of play on a Roster or in a Party (ADR-0011)', () => {
  test('a dead Hero back on their Roster is refused, naming the Hero', () => {
    expect(refusals((d) => guild(d, ids.playerGuild).rosterIds.push(ids.deadHero))).toEqual([
      failure('departed-hero-in-play', ids.deadHero),
    ]);
  });

  test('a retired Hero left on their Roster is refused, naming the Hero', () => {
    expect(refusals((d) => (hero(d, idleHero).retiredOnTurn = 30))).toEqual([failure('departed-hero-in-play', idleHero)]);
  });

  test('a dead Hero still in their Party is refused once, naming the Hero', () => {
    const dead = (d: Doc): void => {
      hero(d, ids.partyHero).diedOnTurn = 30;
      guild(d, ids.playerGuild).rosterIds = guild(d, ids.playerGuild).rosterIds.filter((id) => id !== ids.partyHero);
    };
    expect(refusals(dead)).toEqual([failure('departed-hero-in-play', ids.partyHero)]);
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

  test('a Hero on a Roster marked as gone from the pool is refused, and as out of play on a Roster', () => {
    expect(refusals((d) => (hero(d, idleHero).leftPoolOnTurn = 30))).toEqual([
      failure('unattached-mismatch', idleHero),
      failure('departed-hero-in-play', idleHero),
    ]);
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

describe('§6: a folded Guild with a Hero on its Roster or a Party of its own (DL-28)', () => {
  /** Folds the Rival as the endings phase does: its Roster released into the pool. */
  const foldRival = (d: Doc): void => {
    const rival = guild(d, ids.rivalGuild);
    for (const heroId of rival.rosterIds) Object.assign(hero(d, heroId), { guildId: null, unattachedSince: 38 });
    rival.rosterIds = [];
    rival.foldedOnTurn = 38;
    // The Transfer offer was for one of its Heroes: M6 settles what a fold does to an offer.
    Reflect.deleteProperty(d.world.offers, ids.offer);
  };

  test('a folded Guild with an empty Roster, its Guildmaster kept, and its Heroes in the pool is accepted', () => {
    const { document } = buildDocument();
    foldRival(document);
    expect(guildmaster(document, guild(document, ids.rivalGuild).guildmasterId).guildId).toBe(ids.rivalGuild);
    expect(validate(document, deps)).toEqual({ ok: true, warnings: [] });
  });

  test('a folded Guild with a Hero still on its Roster is refused, naming the Guild', () => {
    expect(refusals((d) => (guild(d, ids.rivalGuild).foldedOnTurn = 38))).toEqual([
      failure('folded-guild-in-play', ids.rivalGuild),
    ]);
  });

  test('a Party of a folded Guild is refused, naming the Party', () => {
    const fold = (d: Doc): void => {
      foldRival(d);
      party(d, ids.party).guildId = ids.rivalGuild;
    };
    expect(refusals(fold)).toEqual([failure('folded-guild-in-play', ids.party)]);
  });
});

describe('a retired Guildmaster (DL-102)', () => {
  test("a Guild in play led by a Guildmaster who has retired is refused, naming the Guildmaster", () => {
    const rivalGuildmaster = guild(buildDocument().document, ids.rivalGuild).guildmasterId;
    expect(refusals((d) => (guildmaster(d, rivalGuildmaster).retiredOnTurn = 30))).toEqual([
      failure('retired-guildmaster-in-office', rivalGuildmaster),
    ]);
  });

  test('a retired Guildmaster kept beside their successor, the Guild naming the successor, is accepted', () => {
    const { document } = buildDocument();
    const rival = guild(document, ids.rivalGuild);
    const retired = guildmaster(document, rival.guildmasterId);
    const successorId = takeId(document.world, 'guildmasters');
    document.world.guildmasters[successorId] = { ...structuredClone(retired), id: successorId, name: 'Oswin Hale', enteredTurn: 30, regard: {} };
    retired.retiredOnTurn = 30;
    rival.guildmasterId = successorId;

    expect(validate(document, deps)).toEqual({ ok: true, warnings: [] });
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
  /** A hand-built copy of stack `from`, held by `holder`: what `moveStack` never makes (items.test.ts). */
  const copyTo = (from: Stack['id'], holder: Holder) => (d: Doc) => {
    const id = makeId('stacks', d.world.counters.stacks++);
    d.world.stacks[id] = { ...stack(d, from), id, holder };
  };
  const second = makeId('stacks', buildDocument().document.world.counters.stacks);

  // The second acceptance box, its first half.
  test('are refused, naming the second', () => {
    expect(refusals(copyTo(ids.guildStack, { kind: 'guild', id: ids.playerGuild }))).toEqual([
      failure('duplicate-stack', second),
    ]);
    expect(refusals(copyTo(ids.marketStack, { kind: 'market' }))).toEqual([failure('duplicate-stack', second)]);
  });

  test('in one slot of a Hero are refused, and overfill the slot', () => {
    expect(refusals(copyTo(ids.heroStack, { kind: 'hero', id: ids.partyHero, slot: 'armour' }))).toEqual([
      failure('duplicate-stack', second),
      failure('gear-slot-overfull', ids.partyHero),
    ]);
  });

  test('in two slots of one Hero, or held by two holders, are accepted', () => {
    expect(refusals(copyTo(ids.heroStack, { kind: 'hero', id: ids.partyHero, slot: 'weapon' }))).toEqual([]);
    expect(refusals(copyTo(ids.guildStack, { kind: 'guild', id: ids.rivalGuild }))).toEqual([]);
  });
});

describe('a stack of no Items (data-model §3.3, DL-48)', () => {
  test.each([0, -2])('holding %d is refused, naming the stack', (quantity) => {
    expect(refusals((d) => (stack(d, ids.guildStack).quantity = quantity))).toEqual([failure('empty-stack', ids.guildStack)]);
  });

  test('holding a quantity that is not whole is refused by document-shape', () => {
    expect(refusals((d) => (stack(d, ids.guildStack).quantity = 1.5))).toEqual([
      failure('document-shape', `$.world.stacks["${ids.guildStack}"].quantity`),
    ]);
  });
});

describe("a Hero's gear slot holding more than one Item (slot-occupied, DL-48)", () => {
  const armour = { kind: 'hero', id: ids.partyHero, slot: 'armour' } as const;

  test.each<[string, Mutation]>([
    ['a stack of two', (d) => (stack(d, ids.heroStack).quantity = 2)],
    ['a unique Item beside a stack', (d) => (item(d, ids.item).holder = { ...armour })],
    ['a second stack of another definition', (d) => (stack(d, ids.guildStack).holder = { ...armour })],
    [
      'two unique Items',
      (d) => {
        const id = makeId('items', d.world.counters.items++);
        d.world.items[id] = { id, definitionKey: 'lucky-charm', holder: { kind: 'hero', id: ids.partyHero, slot: 'trinket' } };
      },
    ],
  ])('%s is refused once, naming the Hero', (_, mutate) => {
    expect(refusals(mutate)).toEqual([failure('gear-slot-overfull', ids.partyHero)]);
  });

  test("one Item in each of a Hero's slots is accepted", () => {
    const three = (d: Doc): void => {
      const id = makeId('stacks', d.world.counters.stacks++);
      d.world.stacks[id] = { id, definitionKey: 'short-sword', quantity: 1, holder: { kind: 'hero', id: ids.partyHero, slot: 'weapon' } };
    };
    expect(refusals(three)).toEqual([]);
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
    // DL-193: the version of the defaults is `meta`'s, a whole number. `meta` is shared
    // between documents, so each is changed on a copy.
    [
      'a meta without the version of its defaults, as schema 6 wrote it',
      (d) => {
        const meta = { ...d.meta };
        drop(meta, 'configVersion');
        set(d, 'meta', meta);
      },
      '$.meta.configVersion',
    ],
    [
      'a version of the defaults that is not a whole number',
      (d) => set(d, 'meta', { ...d.meta, configVersion: 13.5 }),
      '$.meta.configVersion',
    ],
    ['a missing field', (d) => drop(hero(d, ids.partyHero), 'stats'), `${heroPath}.stats`],
    ['a field of the wrong kind', (d) => set(hero(d, ids.partyHero), 'traits', 'none'), `${heroPath}.traits`],
    ['a row that is not an object', (d) => set(d.world.patrons, ids.patron, 'Maud'), patronPath],
    ['an entry without a payload', (d) => drop(d.history.entries[0] ?? {}, 'payload'), '$.history.entries[0].payload'],
    ['an index that is not a list', (d) => set(d.history.byType, 'hero.died', 4), '$.history.byType["hero.died"]'],
    [
      'a holder of no kind the tables know',
      (d) => set(item(d, ids.item), 'holder', { kind: 'vault' }),
      `${itemPath}.holder.kind`,
    ],
    ['an ending without its reason', (d) => set(d.world, 'ended', { turn: 3 }), '$.world.ended.reason'],
    [
      'a Guildmaster without a Biography',
      (d) => drop(guildmaster(d, ids.playerGuildmaster), 'biography'),
      `$.world.guildmasters["${ids.playerGuildmaster}"].biography`,
    ],
    [
      'a Guildmaster whose Retirement is not a Turn',
      (d) => set(guildmaster(d, ids.playerGuildmaster), 'retiredOnTurn', 'yesterday'),
      `$.world.guildmasters["${ids.playerGuildmaster}"].retiredOnTurn`,
    ],
    [
      "a Guildmaster without a Portrait's key, as schema 4 wrote them",
      (d) => drop(guildmaster(d, ids.playerGuildmaster), 'portraitKey'),
      `$.world.guildmasters["${ids.playerGuildmaster}"].portraitKey`,
    ],
    [
      "a Guildmaster whose Portrait's key is not a string or null",
      (d) => set(guildmaster(d, ids.playerGuildmaster), 'portraitKey', 7),
      `$.world.guildmasters["${ids.playerGuildmaster}"].portraitKey`,
    ],
    ['a Patron without a sex, as schema 4 wrote them', (d) => drop(patron(d, ids.patron), 'sex'), `${patronPath}.sex`],
    // DL-135 items 6 and 7: a Hero's Portrait and two texts, which schema 5 lacked.
    ["a Hero without a Portrait's key, as schema 5 wrote them", (d) => drop(hero(d, ids.partyHero), 'portraitKey'), `${heroPath}.portraitKey`],
    ["a Hero whose Portrait's key is not a string or null", (d) => set(hero(d, ids.partyHero), 'portraitKey', 7), `${heroPath}.portraitKey`],
    ['a Hero without an Appearance, as schema 5 wrote them', (d) => drop(hero(d, ids.partyHero), 'appearance'), `${heroPath}.appearance`],
    ['a Hero whose Biography is not a string', (d) => set(hero(d, ids.partyHero), 'biography', null), `${heroPath}.biography`],
    ['a Patron whose sex is not a string or null', (d) => set(patron(d, ids.patron), 'sex', false), `${patronPath}.sex`],
    // A sex is one of the engine's `sexes`, as a holder's kind is one it knows,
    // since the page finds a Portrait's folder by it.
    [
      "a Guildmaster whose sex is none of the engine's",
      (d) => set(guildmaster(d, ids.playerGuildmaster), 'sex', 'other'),
      `$.world.guildmasters["${ids.playerGuildmaster}"].sex`,
    ],
    ["a Hero whose sex is none of the engine's", (d) => set(hero(d, ids.partyHero), 'sex', 'Female'), `${heroPath}.sex`],
    ["a Patron whose sex is none of the engine's", (d) => set(patron(d, ids.patron), 'sex', ''), `${patronPath}.sex`],
    [
      'a holder without its slot',
      (d) => set(item(d, ids.item), 'holder', { kind: 'hero', id: ids.partyHero }),
      `${itemPath}.holder.slot`,
    ],
    // DL-248: every Quest is drawn with one Encounter or more.
    ['a Quest with no Encounters', (d) => set(quest(d, ids.offeredQuest), 'encounterKeys', []), `$.world.quests["${ids.offeredQuest}"].encounterKeys`],
    // DL-262: a Quest's Tier, from 1, and a line for each of its Encounters.
    ['a Quest without a Tier, as schema 7 wrote them', (d) => drop(quest(d, ids.offeredQuest), 'tier'), `$.world.quests["${ids.offeredQuest}"].tier`],
    ['a Quest of Tier 0', (d) => set(quest(d, ids.offeredQuest), 'tier', 0), `$.world.quests["${ids.offeredQuest}"].tier`],
    ['a Quest of a Tier that is not whole', (d) => set(quest(d, ids.offeredQuest), 'tier', 1.5), `$.world.quests["${ids.offeredQuest}"].tier`],
    ["a Quest without its Beats' lines", (d) => drop(quest(d, ids.offeredQuest), 'beatLines'), `$.world.quests["${ids.offeredQuest}"].beatLines`],
    ['a Quest with a line that is not a string', (d) => set(quest(d, ids.offeredQuest), 'beatLines', [7]), `$.world.quests["${ids.offeredQuest}"].beatLines`],
    ['a Quest with more lines than Encounters', (d) => set(quest(d, ids.offeredQuest), 'beatLines', ['One.', 'Two.']), `$.world.quests["${ids.offeredQuest}"].beatLines`],
    ['a Quest with fewer lines than Encounters', (d) => set(quest(d, ids.offeredQuest), 'beatLines', []), `$.world.quests["${ids.offeredQuest}"].beatLines`],
    // DL-282: a Hero's Fatigue, and their Party's record of it at dispatch.
    ['a Hero without Fatigue, as schema 9 wrote them', (d) => drop(hero(d, ids.partyHero), 'fatigue'), `${heroPath}.fatigue`],
    ['a Hero whose Fatigue is not a number', (d) => set(hero(d, ids.partyHero), 'fatigue', '0'), `${heroPath}.fatigue`],
    [
      'a Party without its Fatigue at dispatch, as schema 9 wrote them',
      (d) => drop(party(d, ids.party), 'fatigueAtDispatch'),
      `$.world.parties["${ids.party}"].fatigueAtDispatch`,
    ],
    [
      'a Party whose Fatigue at dispatch is not a number for each Hero',
      (d) => set(party(d, ids.party), 'fatigueAtDispatch', { [ids.partyHero]: null }),
      `$.world.parties["${ids.party}"].fatigueAtDispatch`,
    ],
    // DL-294 item 1: Wealth and every stored amount are whole Silver.
    ['a Guild whose Wealth is not whole Silver', (d) => set(guild(d, ids.playerGuild), 'wealth', 120.5), `$.world.guilds["${ids.playerGuild}"].wealth`],
    ['a Quest whose reward is not whole Silver', (d) => set(quest(d, ids.offeredQuest), 'reward', 40.25), `$.world.quests["${ids.offeredQuest}"].reward`],
    ['a Transfer Offer whose fee is not whole Silver', (d) => set(offer(d, ids.offer), 'fee', 99.9), `$.world.offers["${ids.offer}"].fee`],
    // DL-297: a Hall is each Facility's grade, a whole number from 0.
    ['a Hall whose grade is not whole', (d) => set(guild(d, ids.playerGuild), 'hall', { infirmary: 1.5 }), `$.world.guilds["${ids.playerGuild}"].hall`],
    ['a Hall whose grade is below 0', (d) => set(guild(d, ids.playerGuild), 'hall', { quarters: -1 }), `$.world.guilds["${ids.playerGuild}"].hall`],
  ])('%s is refused, and no other check runs on it', (_, mutate, path) => {
    expect(refusals(mutate)).toEqual([failure('document-shape', path)]);
  });

  test("a unique Item held by the Market is accepted: a folded Guild's are listed there (D6, DL-48)", () => {
    expect(refusals((d) => set(item(d, ids.item), 'holder', { kind: 'market' }))).toEqual([]);
  });

  test("a Guild's founding that names a Wealth not whole Silver is refused, naming the entry (DL-294 item 1)", () => {
    const { document } = buildDocument();
    const founded = document.history.entries.findIndex((entry) => entry.type === 'guild.founded');
    expect(founded).toBeGreaterThanOrEqual(0);
    set((document.history.entries[founded] as { payload: object }).payload, 'wealth', 500.5);
    expect(validate(document, deps)).toMatchObject({ ok: false, failures: [{ check: 'entry-field-missing', id: `$.history.entries[${founded}]` }] });
  });

  // DL-297: every amount an entry carries is whole Silver, so that a hand-edited save is refused at
  // load rather than met by the formatter, which throws on a fraction (DL-296).
  test.each([
    ['guild.upkeep-paid', ['amount', 'wealthAfter']],
    ['guild.below-floor', ['wealth', 'floor']],
    ['guild.floor-recovered', ['wealth', 'floor']],
    ['hero.recruited', ['fee']],
    ['guild.improved', ['cost']],
    ['item.bought', ['unitPrice', 'cost']],
    ['item.sold', ['unitPrice', 'proceeds']],
    ['hero.transferred', ['fee']],
    ['guild.transfer-offered', ['fee']],
    ['guild.transfer-offer-declined', ['fee']],
    ['guild.transfer-offer-expired', ['fee']],
    ['guild.wealth-changed', ['before', 'after']],
    ['quest.resolved', ['wealthDelta']],
  ] as const)("a %s entry whose amount is not whole Silver is refused, naming the entry; whole, it is accepted", (type, fields) => {
    const appended = (fraction: string | null): { document: WorldDocument; at: number } => {
      const { document } = buildDocument();
      const payload = Object.fromEntries(fields.map((field) => [field, field === fraction ? 100.5 : -100]));
      const at = append(document.history, { turn: fixtureTurn, type, participants: [ids.playerGuild], labels: {}, milestone: false, payload } as Entry);
      return { document, at };
    };

    const whole = appended(null);
    expect(validate(whole.document, deps)).toEqual({ ok: true, warnings: [] });
    for (const field of fields) {
      const { document, at } = appended(field);
      expect(validate(document, deps), field).toMatchObject({ ok: false, failures: [{ check: 'entry-field-missing', id: `$.history.entries[${at}]` }] });
    }
  });

  // The reward a Quest's taking agreed (DL-43), an amount too: whole Silver where the entry writes it,
  // which one made before DL-43 does not.
  test('a quest.taken entry whose reward is not whole Silver is refused, naming the entry; whole or absent, it is accepted', () => {
    const taking = (reward?: number): { document: WorldDocument; at: number } => {
      const { document } = buildDocument();
      const payload = { tier: 1, ...(reward === undefined ? {} : { reward }) };
      const at = append(document.history, { turn: fixtureTurn, type: 'quest.taken', participants: [ids.playerGuild], labels: {}, milestone: false, payload } as Entry);
      return { document, at };
    };

    expect(validate(taking().document, deps)).toEqual({ ok: true, warnings: [] });
    expect(validate(taking(120).document, deps)).toEqual({ ok: true, warnings: [] });
    const fraction = taking(120.5);
    expect(validate(fraction.document, deps)).toMatchObject({ ok: false, failures: [{ check: 'entry-field-missing', id: `$.history.entries[${fraction.at}]` }] });
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
  test('a dead Hero removed while hero.died names them is refused', () => {
    expect(refusals((d) => delete d.world.heroes[ids.deadHero])).toEqual([
      failure('removed-hero-in-history', ids.deadHero),
    ]);
  });

  test('a pool Hero gone with only passive entries is accepted; one any other entry names is refused', () => {
    expect(refusals(() => undefined)).toEqual([]);
    const named = (d: Doc): void => {
      const participants = [ids.departedHero, ids.playerGuild];
      const entry = { turn: fixtureTurn, participants, labels: {}, milestone: false, payload: { fee: 0 } };
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
  test.each<[string, Mutation, WarningCheck, string, string]>([
    [
      'a Guildmaster Stat on a Hero',
      (d) => (hero(d, idleHero).potential.judgement = 2),
      'unknown-stat',
      idleHero,
      'judgement',
    ],
    ['a Hero Stat on a Guildmaster', (d) => (guildmaster(d, gm).stats.strength = 9), 'unknown-stat', gm, 'strength'],
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
    [
      'an Injury type',
      (d) => (hero(d, idleHero).injury = { typeKey: 'frostbite', healsOnTurn: fixtureTurn + 3 }),
      'unknown-injury',
      idleHero,
      'frostbite',
    ],
    [
      "a Rival's Disposition",
      (d) => (guild(d, ids.rivalGuild).controller = { kind: 'rival', disposition: 'timid' }),
      'unknown-disposition',
      ids.rivalGuild,
      'timid',
    ],
    [
      'gear a Hero holds in a slot it is not made for',
      (d) => (stack(d, ids.heroStack).holder = { kind: 'hero', id: ids.partyHero, slot: 'weapon' }),
      'misplaced-item',
      ids.heroStack,
      'padded-jack',
    ],
    [
      'a consumable a Hero holds in a slot',
      (d) => (stack(d, ids.heroStack).definitionKey = 'healing-draught'),
      'misplaced-item',
      ids.heroStack,
      'healing-draught',
    ],
    [
      "a Quest's Loot table",
      (d) => (quest(d, ids.offeredQuest).lootTableKey = 'the-lost-hoard'),
      'unknown-loot-table',
      ids.offeredQuest,
      'the-lost-hoard',
    ],
    [
      "a Guildmaster's Portrait the content has no picture for",
      (d) => (guildmaster(d, gm).portraitKey = 'gm-male-99'),
      'unknown-portrait',
      gm,
      'gm-male-99',
    ],
    [
      "a Hero's picture as a Guildmaster's Portrait",
      (d) => Object.assign(guildmaster(d, gm), { sex: 'female', portraitKey: 'hero-female-01' }),
      'unknown-portrait',
      gm,
      'hero-female-01',
    ],
    [
      "a Guildmaster's Portrait of the other sex",
      (d) => Object.assign(guildmaster(d, gm), { sex: 'female', portraitKey: 'gm-male-01' }),
      'portrait-of-another-sex',
      gm,
      'gm-male-01',
    ],
    [
      "a Guildmaster's picture as a Hero's Portrait",
      (d) => Object.assign(hero(d, ids.partyHero), { sex: 'male', portraitKey: 'gm-male-01' }),
      'unknown-portrait',
      ids.partyHero,
      'gm-male-01',
    ],
    [
      "a Hero's Portrait of the other sex",
      (d) => Object.assign(hero(d, ids.partyHero), { sex: 'male', portraitKey: 'hero-female-01' }),
      'portrait-of-another-sex',
      ids.partyHero,
      'hero-female-01',
    ],
    [
      "a Facility in a Guild's Hall",
      (d) => (guild(d, ids.rivalGuild).hall = { ...guild(d, ids.rivalGuild).hall, stables: 1 }),
      'unknown-facility',
      ids.rivalGuild,
      'stables',
    ],
    [
      "an Encounter in a Quest's sequence",
      (d) => setEncounters(quest(d, ids.offeredQuest), ['hold-the-line', 'the-dragon-wakes']),
      'unknown-encounter',
      ids.offeredQuest,
      'the-dragon-wakes',
    ],
  ])('%s', (_, mutate, check, id, key) => {
    expect(warnings(mutate)).toEqual([{ check, id, key }]);
  });

  test('two Traits held of which one excludes the other warn, naming the later of the first pair (DL-150 item 3)', () => {
    // Miser excludes Well liked; Thrifty excludes neither.
    expect(warnings((d) => (guildmaster(d, gm).traits = ['miser', 'thrifty', 'well-liked']))).toEqual([
      { check: 'excluded-traits', id: gm, key: 'well-liked' },
    ]);
    const exclusive = (key: string, other: string) => ({ key, name: key, excludes: [other], effects: [] });
    const content: ContentSet = { ...testContent, heroTraits: { ...testContent.heroTraits, scarred: exclusive('scarred', 'lame'), lame: exclusive('lame', 'scarred') } };
    expect(warnings((d) => (hero(d, idleHero).traits = ['lame', 'one-eyed', 'scarred']), content)).toEqual([
      { check: 'excluded-traits', id: idleHero, key: 'scarred' },
    ]);
    expect(warnings((d) => (hero(d, idleHero).traits = ['lame', 'one-eyed']), content)).toEqual([]);
  });

  test("a Hero's Portrait of their sex warns of nothing, nor does none, the Silhouette", () => {
    expect(warnings((d) => Object.assign(hero(d, ids.partyHero), { sex: 'female', portraitKey: 'hero-female-01' }))).toEqual([]);
    expect(warnings((d) => Object.assign(hero(d, ids.partyHero), { portraitKey: null }))).toEqual([]);
  });

  test("a Guildmaster's Portrait of their sex warns of nothing, nor does none, the Silhouette", () => {
    expect(warnings((d) => Object.assign(guildmaster(d, gm), { sex: 'female', portraitKey: 'gm-female-02' }))).toEqual([]);
    expect(warnings((d) => Object.assign(guildmaster(d, gm), { sex: 'male', portraitKey: 'gm-male-03' }))).toEqual([]);
    expect(warnings((d) => (guildmaster(d, gm).portraitKey = null))).toEqual([]);
  });

  test('an Item a Hero holds in a slot that is no gear slot warns, naming the slot (DL-193)', () => {
    const { document } = buildDocument();
    Object.assign(document.world.items[ids.item]?.holder ?? {}, { slot: 'belt' });
    const result = validate(document, testDeps());

    expect(result.ok && result.warnings.map(({ check, id, key }) => ({ check, id, key }))).toEqual([
      { check: 'unknown-slot', id: ids.item, key: 'belt' },
      { check: 'misplaced-item', id: ids.item, key: expect.any(String) },
    ]);
  });

  test('before content has Quest templates, Dispositions or Items, every such key warns', () => {
    const withoutLaterTables: ContentSet = { ...testContent };
    Reflect.deleteProperty(withoutLaterTables, 'questTemplates');
    Reflect.deleteProperty(withoutLaterTables, 'dispositions');
    Reflect.deleteProperty(withoutLaterTables, 'items');
    const found = warnings(() => undefined, withoutLaterTables);
    const templates = found.filter(({ check }) => check === 'unknown-template').map(({ id }) => id);
    expect(templates).toEqual([ids.takenQuest, ids.offeredQuest]);
    // The Rival's, and not the player's, which names none.
    const dispositions = found.filter(({ check }) => check === 'unknown-disposition').map(({ id }) => id);
    expect(dispositions).toEqual([ids.rivalGuild]);
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

  // DL-234: a test game is checked Turn after Turn from where the last check left its History, and
  // whole at the test's end, where a fault in an older entry, which no later check reads, is found.
  test('reads a game Turn by Turn from where it left its History; a fault in an older entry is found at the end', () => {
    const played = testDeps();
    let { document } = createWorld('with-valid', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, played);
    document = withValid(document, played);
    for (let turn = 0; turn < 5; turn += 1) document = withValid(advance(document, played).document, played);
    expect(() => checkWhatHistoryFromHid()).not.toThrow();

    const first = document.history.entries[0] as { turn: number };
    const turn = first.turn;
    first.turn = document.world.turn + 1;
    expect(validate(document, played).ok).toBe(false);
    // The next Turn's check reads only its own entries, and passes; the check at the end does not.
    withValid(advance(document, played).document, played);
    expect(() => checkWhatHistoryFromHid()).toThrow('history-turn-order $.history.entries[1]: $.history.entries[1] is at Turn 0, after an entry at Turn');
    first.turn = turn;
  });
});

// ── historyFrom: the History read from where the last validation left it (DL-34) ────

describe('validating from historyFrom', () => {
  const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

  /** Appends two valid entries, the second a Milestone, to the History; returns where they begin. */
  function grow(d: Doc): number {
    const from = d.history.entries.length;
    const participants = [ids.partyHero, ids.playerGuild];
    const entry = { turn: fixtureTurn, labels: {}, payload: { at: from, fee: 0 } };
    append(d.history, { ...entry, participants: [...participants], type: 'hero.morale-changed', milestone: false });
    append(d.history, { ...entry, participants: [...participants], type: 'hero.recruited', milestone: true });
    return from;
  }

  /** What a validation from `from` finds in `document`. */
  function refusalsOf(document: Doc, from: number): Named[] {
    const result = validate(document, deps, { historyFrom: from });
    return result.ok ? [] : result.failures.map(({ check, id }) => failure(check, id));
  }

  /** What a validation from where it grew finds in the fixture, grown and then changed by `mutate`. */
  function refusalsFrom(mutate: (d: Doc, from: number) => unknown): { from: number; found: Named[] } {
    const { document } = buildDocument();
    const from = grow(document);
    mutate(document, from);
    return { from, found: refusalsOf(document, from) };
  }

  type Loose = { turn: number; participants: string[]; payload: unknown };
  const entryAt = (d: Doc, position: number): Loose => d.history.entries[position] as Loose;

  test('accepts, after every Turn of a played game, exactly what a validation from 0 accepts', () => {
    const played = testDeps();
    let { document } = createWorld('history-from', setup, played);
    let validated = document.history.entries.length;
    for (let turn = 0; turn < 60; turn += 1) {
      document = advance(document, played).document;
      const fromLast = validate(document, played, { historyFrom: validated });
      expect(fromLast).toEqual(validate(document, played));
      expect(fromLast.ok).toBe(true);
      validated = document.history.entries.length;
    }
  });

  test('from 0 reads the whole History; from its end, the World State alone, in full', () => {
    const { document } = buildDocument();
    const end = document.history.entries.length;
    expect(validate(document, deps, { historyFrom: 0 })).toEqual(validate(document, deps));
    expect(validate(document, deps, { historyFrom: end })).toEqual({ ok: true, warnings: [] });

    hero(document, ids.partyHero).morale = Number.NaN;
    expect(refusalsOf(document, end)).toEqual([failure('json-safe', `$.world.heroes["${ids.partyHero}"].morale`)]);
  });

  test.each<[string, (d: Doc, from: number) => unknown, (from: number) => Named]>([
    [
      'a participant that is not an id',
      (d, from) => entryAt(d, from).participants.push('nobody'),
      (from) => failure('id-format', `$.history.entries[${from}].participants[2]`),
    ],
    [
      'NaN in a payload',
      (d, from) => (entryAt(d, from).payload = { at: Number.NaN }),
      (from) => failure('json-safe', `$.history.entries[${from}].payload.at`),
    ],
    [
      'an entry without a payload',
      (d, from) => Reflect.deleteProperty(entryAt(d, from), 'payload'),
      (from) => failure('document-shape', `$.history.entries[${from}].payload`),
    ],
    [
      'an entry at a Turn before the one it follows',
      (d, from) => (entryAt(d, from + 1).turn = 0),
      (from) => failure('history-turn-order', `$.history.entries[${from + 1}]`),
    ],
    [
      'an entry left out of the list of its type',
      (d) => d.history.byType['hero.recruited']?.pop(),
      () => failure('history-index-mismatch', '$.history.byType["hero.recruited"]'),
    ],
    [
      'a Milestone left out of the Milestones',
      (d) => d.history.milestones.pop(),
      () => failure('history-index-mismatch', '$.history.milestones'),
    ],
    [
      'an entry listed under a type it is not',
      (d, from) => d.history.byType['hero.recruited']?.splice(-1, 0, from),
      () => failure('history-index-mismatch', '$.history.byType["hero.recruited"]'),
    ],
    [
      'an entry left out of a participant’s list',
      (d) => d.history.byEntity[ids.playerGuild]?.pop(),
      () => failure('history-index-mismatch', `$.history.byEntity["${ids.playerGuild}"]`),
    ],
  ])('finds %s among the new entries, naming it', (_, mutate, expected) => {
    const { from, found } = refusalsFrom(mutate);
    expect(found).toContainEqual(expected(from));
  });

  test('finds a position outside the entries at the end of a list a new entry names', () => {
    let index = 0;
    const { found } = refusalsFrom((d) => {
      const positions = d.history.byEntity[ids.partyHero] ?? [];
      index = positions.length;
      positions.push(10_000);
    });
    expect(found).toEqual([failure('history-position-out-of-range', `$.history.byEntity["${ids.partyHero}"][${index}]`)]);
  });

  test('finds a removed Hero a new entry names, and a counter that would reuse a new entry’s id', () => {
    const naming = (type: 'hero.recruited' | 'hero.left-pool') => (d: Doc) => {
      const entry = { turn: fixtureTurn, labels: {}, milestone: false, payload: { fee: 0 } };
      append(d.history, { ...entry, type, participants: [ids.departedHero] });
    };
    expect(refusalsFrom(naming('hero.recruited')).found).toEqual([failure('removed-hero-in-history', ids.departedHero)]);
    expect(refusalsFrom(naming('hero.left-pool')).found).toEqual([]);

    const departed = parseId(ids.departedHero)?.n ?? 0;
    const lowered = (d: Doc): void => {
      naming('hero.left-pool')(d);
      d.world.counters.heroes = departed;
    };
    expect(refusalsFrom(lowered).found).toEqual([failure('counter-range', '$.world.counters.heroes')]);
  });

  test('does not read the entries before it, which a validation from 0 does', () => {
    const { document } = buildDocument();
    const from = grow(document);
    entryAt(document, 0).payload = { at: Number.NaN };
    expect(refusalsOf(document, from)).toEqual([]);
    expect(refusalsOf(document, 0)).toEqual([failure('json-safe', '$.history.entries[0].payload.at')]);
  });

  test('throws on a position that is not a whole number, or is past the end of the History', () => {
    const { document } = buildDocument();
    const end = document.history.entries.length;
    for (const historyFrom of [-1, 1.5, Number.NaN, end + 1]) {
      expect(() => validate(document, deps, { historyFrom })).toThrow(RangeError);
    }
  });

  test('reads a document too damaged to have a list of entries from 0, without a throw', () => {
    const result = validate({ meta: {}, world: {}, history: { entries: 3 } }, deps, { historyFrom: 5 });
    expect(result.ok).toBe(false);
  });
});
