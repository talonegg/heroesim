import { describe, expect, test } from 'vitest';
import { createWorld, portraitFit, setupRefusal, type SetupRefusal, type WorldSetup } from './create.js';
import type { Disposition } from './content-types.js';
import { makeId, tableNames, type Guild, type GuildId, type Sex, type WorldDocument } from './document.js';
import { count, entriesFor } from './history.js';
import { isJsonSafe } from './json-safe.js';
import { ageIntoPortrait } from './portraits.js';
import { validate } from './validate.js';
import { testDeps, withoutPortraits, withValid } from './world.test-support.js';

const playerId = makeId('guilds', 1);

const setup: WorldSetup = {
  guildmasterName: 'Aldith Barrowby',
  guildName: 'The Salt Road Guild',
  backgroundKey: 'old-charter',
  createdAt: 'harness',
};

function guilds(document: WorldDocument): Guild[] {
  return Object.values(document.world.guilds);
}

function rivals(document: WorldDocument): Guild[] {
  return guilds(document).filter((guild) => guild.controller.kind === 'rival');
}

/**
 * `document` with every Guildmaster's Portrait and the texts it writes set aside (v1.1.3-S5): a
 * Portrait is chosen to fit the Guildmaster drawn, among the pictures no living Guildmaster has
 * (DL-135 item 4), so a change to one Guildmaster may change the pictures of those after, and with
 * them their Appearance and Biography, while every draw of every stream is the same.
 */
function picturesAside(document: WorldDocument): WorldDocument {
  const copy = structuredClone(document);
  for (const guildmaster of Object.values(copy.world.guildmasters)) Object.assign(guildmaster, { portraitKey: null, appearance: '', biography: '' });
  // A Hero's too (v1.1.3-S6): the test content's one Hero picture fits a female Warrior.
  for (const hero of Object.values(copy.world.heroes)) Object.assign(hero, { portraitKey: null, appearance: '', biography: '' });
  return copy;
}

function tally(keys: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}

describe('createWorld', () => {
  test('writes meta from the seed, the setup, the content and a copy of the config passed in', () => {
    const deps = testDeps({ rivalCount: 2 });
    const { document } = createWorld('amber-fox-4821', setup, deps);
    withValid(document, deps);

    expect(document.meta.seed).toBe('amber-fox-4821');
    expect(document.meta.config).toEqual(deps.config);
    expect(document.meta.config).not.toBe(deps.config);
    expect(document.meta).toMatchObject({
      version: deps.config.schemaVersion,
      content: { id: deps.content.id, version: deps.content.version },
      createdAt: 'harness',
    });
    expect(document.world.turn).toBe(0);
    expect(document.world.ended).toBeNull();
  });

  test("generates the player's Guild first, from the setup, with one Hero per Class", () => {
    const deps = testDeps();
    const { document } = createWorld('player', setup, deps);
    withValid(document, deps);
    const guild = document.world.guilds[playerId];
    const classes = guild?.rosterIds.map((id) => document.world.heroes[id]?.classKey);

    expect(deps.config.startingRosterSize).toBe(4);
    expect(guild).toMatchObject({
      name: setup.guildName,
      backgroundKey: setup.backgroundKey,
      controller: { kind: 'player' },
      wealth: deps.config.startingWealth,
    });
    expect(guild?.guildmasterId).toBe(makeId('guildmasters', 1));
    expect(document.world.guildmasters[makeId('guildmasters', 1)]?.name).toBe(setup.guildmasterName);
    expect(classes?.sort()).toEqual(Object.keys(deps.content.classes).sort());
  });

  test('generates rivalCount Rivals, their Rosters, Wealth and names drawn from the config and content', () => {
    const deps = testDeps();
    for (const seed of ['rivals-1', 'rivals-2', 'rivals-3', 'rivals-4', 'rivals-5']) {
      const { document } = createWorld(seed, setup, deps);
      withValid(document, deps);
      const found = rivals(document);

      expect(found).toHaveLength(deps.config.rivalCount);
      for (const rival of found) {
        expect(rival.controller).toMatchObject({ kind: 'rival' });
        expect(rival.rosterIds.length).toBeGreaterThanOrEqual(deps.config.rivalRosterMin);
        expect(rival.rosterIds.length).toBeLessThanOrEqual(deps.config.rivalRosterMax);
        expect(rival.wealth).toBeGreaterThanOrEqual(deps.config.rivalStartingWealthMin);
        expect(rival.wealth).toBeLessThanOrEqual(deps.config.rivalStartingWealthMax);
        expect(deps.content.names.guild).toContain(rival.name);
        expect(deps.content.backgrounds[rival.backgroundKey]?.owner).toBe('guild');
      }
      const names = guilds(document).map((guild) => guild.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  // M6-S1 (DL-56): every world has every Disposition, dealt round-robin in key order, with no draw.
  test('deals the Dispositions to the Rivals round-robin, so that every world has all four', () => {
    const deps = testDeps();
    expect(deps.config.rivalCount).toBe(4);
    for (const seed of ['deal-1', 'deal-2', 'deal-3']) {
      const { document } = createWorld(seed, setup, deps);
      const dealt = rivals(document).map((rival) => rival.controller);

      expect(dealt).toEqual(['ambitious', 'miserly', 'reckless', 'steady'].map((disposition) => ({ kind: 'rival', disposition })));
    }

    const six = testDeps({ rivalCount: 6 });
    const { document } = createWorld('deal-six', setup, six);
    withValid(document, six);
    expect(rivals(document).map((rival) => rival.controller.kind === 'rival' && rival.controller.disposition)).toEqual([
      ...['ambitious', 'miserly', 'reckless', 'steady', 'ambitious', 'miserly'],
    ]);
  });

  test('deals the Dispositions without a draw: a world is what it would be with every Rival steady', () => {
    const deps = testDeps();
    const steadyOnly = testDeps({}, { ...deps.content, dispositions: { steady: deps.content.dispositions['steady'] as Disposition } });
    const dealt = createWorld('no-draw', setup, deps).document.world;
    const steady = createWorld('no-draw', setup, steadyOnly).document.world;

    expect(dealt.rng).toEqual(steady.rng);
    expect(Object.values(dealt.heroes)).toEqual(Object.values(steady.heroes));
    for (const guild of Object.values(steady.guilds)) {
      expect({ ...dealt.guilds[guild.id], controller: guild.controller }).toEqual(guild);
    }
  });

  test('generates patronCount Patrons with the Spheres dealt evenly, and the Unattached pool', () => {
    const deps = testDeps();
    const { document } = createWorld('patrons', setup, deps);
    withValid(document, deps);
    const patrons = Object.values(document.world.patrons);
    const perSphere = deps.config.patronCount / Object.keys(deps.content.spheres).length;
    const unattached = Object.values(document.world.heroes).filter((hero) => hero.guildId === null);

    expect(deps.config.patronCount).toBe(12);
    expect(patrons).toHaveLength(12);
    expect(tally(patrons.map((patron) => patron.sphereKey))).toEqual(
      Object.fromEntries(Object.keys(deps.content.spheres).map((key) => [key, perSphere])),
    );
    expect(unattached).toHaveLength(deps.config.unattachedPoolSize);
  });

  test('puts every Hero on the Roster of the Guild it names, or in the pool, and numbers every table from 1', () => {
    const deps = testDeps();
    const { document } = createWorld('consistency', setup, deps);
    withValid(document, deps);
    const { world } = document;
    const onRosters = guilds(document).flatMap((guild) => guild.rosterIds.map((id) => [id, guild.id] as const));

    expect(new Set(onRosters.map(([id]) => id)).size).toBe(onRosters.length);
    for (const [heroId, guildId] of onRosters) expect(world.heroes[heroId]?.guildId).toBe(guildId);
    for (const hero of Object.values(world.heroes)) {
      if (hero.guildId !== null) expect(world.guilds[hero.guildId]?.rosterIds).toContain(hero.id);
    }
    for (const guild of guilds(document)) {
      expect(world.guildmasters[guild.guildmasterId]?.guildId).toBe(guild.id);
    }
    for (const table of tableNames) {
      expect(world.counters[table], table).toBe(Object.keys(world[table]).length + 1);
    }
  });

  test('starts the History with world.created, then a guild.founded Milestone per Guild, and returns those entries', () => {
    const deps = testDeps();
    const { document, events } = createWorld('history', setup, deps);
    withValid(document, deps);
    const { history } = document;
    const guildCount = 1 + deps.config.rivalCount;
    const heroCount = Object.keys(document.world.heroes).length;

    expect(history.entries).toHaveLength(events.length);
    events.forEach((event, position) => expect(history.entries[position]).toBe(event));
    expect(events[0]).toEqual({
      turn: 0,
      type: 'world.created',
      participants: [],
      labels: {},
      milestone: false,
      payload: { seed: 'history' },
    });
    expect(count(history, 'world.created')).toBe(1);
    expect(count(history, 'guild.founded')).toBe(guildCount);
    expect(count(history, 'guildmaster.generated')).toBe(guildCount);
    expect(count(history, 'hero.generated')).toBe(heroCount);
    expect(count(history, 'patron.generated')).toBe(deps.config.patronCount);
    expect(history.milestones.map((position) => history.entries[position]?.type)).toEqual(
      Array.from({ length: guildCount }, () => 'guild.founded'),
    );

    // Each founding names the Guild's founding Wealth, the player's and every Rival's (M9-F7, DL-120 item 4).
    for (const entry of history.entries.filter((it) => it.type === 'guild.founded')) {
      const { guildId, wealth } = entry.payload as { guildId: GuildId; wealth?: number };
      expect(wealth, guildId).toBe(document.world.guilds[guildId]?.wealth);
    }
    expect(document.world.guilds[playerId]?.wealth).toBe(deps.config.startingWealth);

    // A Guild's page holds its founding, its Guildmaster and every Hero generated onto its Roster.
    const player = document.world.guilds[playerId];
    const page = entriesFor(history, playerId).reverse();
    expect(page.map((entry) => entry.type)).toEqual([
      'guild.founded',
      'guildmaster.generated',
      ...(player?.rosterIds.map(() => 'hero.generated') ?? []),
    ]);
  });

  test('opens on a full Board, drawn last and from the board stream alone (M2-S3, DL-25)', () => {
    const deps = testDeps();
    const { document, events } = createWorld('first-board', setup, deps);
    withValid(document, deps);
    const { world, history } = document;
    // The same world with no first Board: what createWorld made before M2-S3.
    const empty = createWorld('first-board', setup, testDeps({ boardSize: 0 })).document;

    expect(world.board).toHaveLength(deps.config.boardSize);
    for (const questId of world.board) {
      expect(world.quests[questId]).toMatchObject({ status: 'offered', offeredOnTurn: 0 });
    }
    expect(count(history, 'quest.offered')).toBe(deps.config.boardSize);
    expect(events.slice(-deps.config.boardSize).map((event) => event.participants[0])).toEqual(world.board);
    expect(world.rng.generation).toEqual(empty.world.rng.generation);
    expect(world.rng.board).not.toEqual(empty.world.rng.board);
    for (const table of ['guilds', 'guildmasters', 'heroes', 'patrons'] as const) {
      expect(world[table], table).toEqual(empty.world[table]);
    }
    expect(empty.world.board).toEqual([]);
  });

  test('is deterministic: the same seed and setup give deep-equal documents, byte for byte', () => {
    const deps = testDeps();
    const one = createWorld('determinism', setup, deps);
    const two = createWorld('determinism', setup, deps);
    withValid(one.document, deps);

    expect(two.document).toEqual(one.document);
    expect(JSON.stringify(two.document)).toBe(JSON.stringify(one.document));
    expect(two.events).toEqual(one.events);
    expect(createWorld('determinism-2', setup, deps).document.world).not.toEqual(one.document.world);
  });

  test('returns a JSON-safe document', () => {
    const deps = testDeps();
    const { document } = createWorld('json', setup, deps);
    withValid(document, deps);
    expect(isJsonSafe(document)).toBe(true);
  });

  test('returns a document the validator accepts, with no warning', () => {
    // M1-S6's first box. harness/src/creation.test.ts checks the same against the core content.
    const deps = testDeps();
    for (const seed of ['valid-1', 'valid-2', 'valid-3']) {
      const { document } = createWorld(seed, setup, deps);
      expect(validate(document, deps)).toEqual({ ok: true, warnings: [] });
      expect(withValid(document, deps)).toBe(document);
    }
  });

  test('reads its counts from the config it is given', () => {
    const deps = testDeps({
      startingRosterSize: 6,
      startingWealth: 90,
      rivalCount: 1,
      rivalRosterMin: 2,
      rivalRosterMax: 2,
      rivalStartingWealthMin: 70,
      rivalStartingWealthMax: 70,
      patronCount: 3,
      unattachedPoolSize: 0,
    });
    const { document } = createWorld('config', setup, deps);
    withValid(document, deps);
    const [player, rival, ...others] = guilds(document);

    expect(others).toEqual([]);
    expect(player?.rosterIds).toHaveLength(6);
    expect(player?.wealth).toBe(90);
    expect(rival?.rosterIds).toHaveLength(2);
    expect(rival?.wealth).toBe(70);
    expect(Object.keys(document.world.patrons)).toHaveLength(3);
    expect(Object.values(document.world.heroes).filter((hero) => hero.guildId === null)).toEqual([]);
  });

  test("draws the player's Background from the Guild Backgrounds when the setup gives none", () => {
    const deps = testDeps();
    const withoutBackground: WorldSetup = {
      guildmasterName: setup.guildmasterName,
      guildName: setup.guildName,
      createdAt: setup.createdAt,
    };
    const { document } = createWorld('background', withoutBackground, deps);
    withValid(document, deps);
    const player = document.world.guilds[playerId];

    expect(deps.content.backgrounds[player?.backgroundKey ?? '']?.owner).toBe('guild');
  });

  test('throws on a blank name or a Background that is not a Guild one', () => {
    const deps = testDeps();

    expect(() => createWorld('bad', { ...setup, guildName: ' ' }, deps)).toThrow(RangeError);
    expect(() => createWorld('bad', { ...setup, guildmasterName: '' }, deps)).toThrow(RangeError);
    expect(() => createWorld('bad', { ...setup, backgroundKey: 'farm-born' }, deps)).toThrow(/farm-born/);
  });
});

// ── The Guildmaster's setup (M9-S2, R8, DL-100 item 3, DL-102) ────────────────────────────────

describe('setupRefusal', () => {
  const deps = testDeps();
  const chosen: WorldSetup = {
    ...setup,
    guildmasterSex: 'female',
    guildmasterAge: 45,
    guildmasterTraitKeys: ['thrifty', 'miser'],
    guildmasterBirthplace: '  Harrowgate  ',
    guildmasterAppearance: 'Tall, with a soldier’s stoop.',
    guildmasterBiography: 'x'.repeat(1000),
  };

  test('accepts the bare setup, and one that sets everything within the rules', () => {
    expect(setupRefusal(setup, deps)).toBeNull();
    expect(setupRefusal(chosen, deps)).toBeNull();
    expect(setupRefusal({ ...setup, guildmasterTraitKeys: [] }, deps)).toBeNull();
    expect(setupRefusal({ ...setup, guildmasterAge: 30, guildmasterTraitKeys: ['well-liked', 'spendthrift'] }, deps)).toBeNull();
  });

  test('accepts ages 21 and 50, the ends of the range, and refuses 20 and 51 with the refusal it gave before (M9-F1, DL-113 item 4)', () => {
    expect(setupRefusal({ ...setup, guildmasterAge: 21 }, deps)).toBeNull();
    expect(setupRefusal({ ...setup, guildmasterAge: 50 }, deps)).toBeNull();
    expect(setupRefusal({ ...setup, guildmasterAge: 20 }, deps)).toEqual({ reason: 'age-out-of-range', age: 20, min: 21, max: 50 });
    expect(setupRefusal({ ...setup, guildmasterAge: 51 }, deps)).toEqual({ reason: 'age-out-of-range', age: 51, min: 21, max: 50 });
  });

  test.each<[string, Partial<WorldSetup>, SetupRefusal]>([
    ['a blank Guild name', { guildName: '  ' }, { reason: 'guild-name-blank' }],
    ['a blank Guildmaster name', { guildmasterName: '' }, { reason: 'guildmaster-name-blank' }],
    ['a Hero Background', { backgroundKey: 'farm-born' }, { reason: 'unknown-background', backgroundKey: 'farm-born' }],
    // The M9 review: the sex is checked here, as everything else is, not by createWorld alone.
    ['a sex that is not one', { guildmasterSex: 'other' as Sex }, { reason: 'unknown-sex', sex: 'other' }],
    ['a sex in capitals', { guildmasterSex: 'Female' as Sex }, { reason: 'unknown-sex', sex: 'Female' }],
    ['an age below the range', { guildmasterAge: 20 }, { reason: 'age-out-of-range', age: 20, min: 21, max: 50 }],
    ['an age above the range', { guildmasterAge: 51 }, { reason: 'age-out-of-range', age: 51, min: 21, max: 50 }],
    ['an age not whole', { guildmasterAge: 32.5 }, { reason: 'age-out-of-range', age: 32.5, min: 21, max: 50 }],
    ['a Trait content lacks', { guildmasterTraitKeys: ['miser', 'brave'] }, { reason: 'unknown-trait', traitKey: 'brave' }],
    ['a Hero Trait', { guildmasterTraitKeys: ['scarred'] }, { reason: 'unknown-trait', traitKey: 'scarred' }],
    ['a Trait twice', { guildmasterTraitKeys: ['miser', 'miser'] }, { reason: 'repeated-trait', traitKey: 'miser' }],
    [
      'more Traits than guildmasterTraitsMax',
      { guildmasterTraitKeys: ['mistrusts-magic', 'miser', 'old-soldier'] },
      { reason: 'too-many-traits', count: 3, max: 2 },
    ],
    [
      'an excluded pair',
      { guildmasterTraitKeys: ['thrifty', 'spendthrift'] },
      { reason: 'excluded-pair', traitKey: 'thrifty', otherKey: 'spendthrift' },
    ],
    ['a buff over the budget alone', { guildmasterTraitKeys: ['well-liked'] }, { reason: 'over-budget', cost: 2, budget: 1 }],
    ['a buff with too small a penalty', { guildmasterTraitKeys: ['thrifty', 'old-soldier'] }, { reason: 'over-budget', cost: 3, budget: 1 }],
    [
      'a Birthplace too long',
      { guildmasterBirthplace: ` ${'é'.repeat(61)} ` },
      { reason: 'text-too-long', attribute: 'birthplace', length: 61, max: 60 },
    ],
    [
      'an Appearance too long',
      { guildmasterAppearance: 'a'.repeat(281) },
      { reason: 'text-too-long', attribute: 'appearance', length: 281, max: 280 },
    ],
    [
      'a Biography too long',
      { guildmasterBiography: 'b'.repeat(1001) },
      { reason: 'text-too-long', attribute: 'biography', length: 1001, max: 1000 },
    ],
  ])('refuses %s with a reason of its own', (_, change, refusal) => {
    expect(setupRefusal({ ...setup, ...change }, deps)).toEqual(refusal);
  });

  test('counts characters, not UTF-16 units, once trimmed: sixty emblems fit a Birthplace', () => {
    expect(setupRefusal({ ...setup, guildmasterBirthplace: `  ${'\u{1F3F0}'.repeat(60)}\n` }, deps)).toBeNull();
  });

  test('reads its bounds from the config it is given', () => {
    const wider = testDeps({ guildmasterStartingAgeMin: 18, guildmasterTraitsMax: 3, guildmasterTraitBudget: 4 });
    const setupWider = { ...setup, guildmasterAge: 18, guildmasterTraitKeys: ['well-liked', 'old-soldier', 'mistrusts-magic'] };
    expect(setupRefusal(setupWider, wider)).toBeNull();
    expect(setupRefusal(setupWider, deps)).toEqual({ reason: 'age-out-of-range', age: 18, min: 21, max: 50 });
  });
});

describe("createWorld with the Guildmaster's setup (M9-S2)", () => {
  const deps = testDeps();
  const guildmasterOf = (document: WorldDocument) => {
    const guildmasterId = document.world.guilds[playerId]?.guildmasterId;
    const guildmaster = guildmasterId === undefined ? undefined : document.world.guildmasters[guildmasterId];
    if (guildmaster === undefined) throw new Error("No player's Guildmaster");
    return guildmaster;
  };

  test("gives the player's Guildmaster the sex, age, Traits and descriptive Attributes chosen, trimmed; a Rival's are written", () => {
    const { document } = createWorld(
      'chosen',
      {
        ...setup,
        guildmasterSex: 'male',
        guildmasterAge: 31,
        guildmasterTraitKeys: ['spendthrift', 'well-liked'],
        guildmasterBirthplace: '  Harrowgate ',
        guildmasterAppearance: '\tGrey at the temples.\n',
        guildmasterBiography: 'Once a quartermaster of the river levies.',
      },
      deps,
    );
    withValid(document, deps);

    expect(guildmasterOf(document)).toMatchObject({
      sex: 'male',
      ageAtEntry: 31,
      traits: ['spendthrift', 'well-liked'],
      birthplace: 'Harrowgate',
      appearance: 'Grey at the temples.',
      biography: 'Once a quartermaster of the river levies.',
      retiredOnTurn: null,
    });
    for (const rival of rivals(document)) {
      const { birthplace, appearance, biography } = document.world.guildmasters[rival.guildmasterId] ?? {};
      expect([birthplace, appearance, biography].every((text) => text !== undefined && text !== '')).toBe(true);
    }
  });

  test('draws what is left unset as a Rival Guildmaster is drawn; an empty list of Traits is none', () => {
    const drawn = createWorld('unset', setup, deps).document;
    const none = createWorld('unset', { ...setup, guildmasterTraitKeys: [] }, deps).document;

    expect(guildmasterOf(none).traits).toEqual([]);
    // The Biography gives the Traits held a sentence each (v1.1.2-S5).
    expect({ ...guildmasterOf(none), traits: guildmasterOf(drawn).traits, biography: guildmasterOf(drawn).biography }).toEqual(guildmasterOf(drawn));
    expect(guildmasterOf(drawn).birthplace).not.toBe('');
  });

  test("the player's choices move no draw: the world is the one drawn without them, but for their Guildmaster", () => {
    for (const seed of ['moves-1', 'moves-2', 'moves-3']) {
      const drawn = createWorld(seed, setup, deps).document;
      const chosen = createWorld(
        seed,
        { ...setup, guildmasterSex: 'female', guildmasterAge: 44, guildmasterTraitKeys: ['old-soldier'], guildmasterBiography: 'A life.' },
        deps,
      ).document;
      const was = guildmasterOf(drawn);
      Object.assign(guildmasterOf(chosen), {
        sex: was.sex,
        ageAtEntry: was.ageAtEntry,
        traits: was.traits,
        // Written for the Guildmaster they are (v1.1.2-S5), by the same draws of `descriptions`.
        birthplace: was.birthplace,
      });

      // Every Guildmaster's picture fits them, so theirs and the Rivals' after may differ (v1.1.3-S5).
      expect(picturesAside(chosen)).toEqual(picturesAside(drawn));
    }
  });

  test('throws on a setup setupRefusal refuses, naming its reason, a sex that is not one among them', () => {
    expect(() => createWorld('bad', { ...setup, guildmasterAge: 12 }, deps)).toThrow(/age-out-of-range/);
    expect(() => createWorld('bad', { ...setup, guildmasterTraitKeys: ['well-liked'] }, deps)).toThrow(/over-budget/);
    expect(() => createWorld('bad', { ...setup, guildmasterSex: 'other' as never }, deps)).toThrow(/unknown-sex/);
  });
});

describe("seeded worlds' drawn Guildmaster Traits, a whole legal set (DL-109 item 1)", () => {
  const deps = testDeps();
  const seeds = Array.from({ length: 40 }, (_, index) => `seed-${String(index + 1).padStart(4, '0')}`);
  const order = Object.keys(deps.content.traits).sort();

  test("every Guildmaster, the player's left to the draw among them, holds a legal set in the content's Trait order", () => {
    const held = new Set<string>();
    for (const seed of seeds) {
      for (const { traits } of Object.values(createWorld(seed, setup, deps).document.world.guildmasters)) {
        const rows = traits.map((key) => deps.content.traits[key]);
        expect(rows.every((row) => row?.owner === 'guildmaster'), traits.join(' ')).toBe(true);
        expect(new Set(traits).size).toBe(traits.length);
        expect(rows.some((row) => traits.some((key) => row?.excludes.includes(key))), traits.join(' ')).toBe(false);
        expect(rows.reduce((sum, row) => sum + (row?.cost ?? Number.NaN), 0)).toBeLessThanOrEqual(deps.config.guildmasterTraitBudget);
        expect(traits).toEqual([...traits].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
        for (const key of traits) held.add(key);
      }
    }
    // Every Guildmaster Trait is drawn somewhere in forty worlds, the dearer buffs among them.
    expect([...held].sort()).toEqual(['miser', 'mistrusts-magic', 'old-soldier', 'spendthrift', 'thrifty', 'well-liked']);
  });

  test("the costs and exclusions move nothing else: each world is the one drawn with every Trait free, but for the Guildmasters' Traits", () => {
    const free = testDeps({}, {
      ...deps.content,
      traits: Object.fromEntries(Object.entries(deps.content.traits).map(([key, trait]) => [key, { ...trait, cost: 0, excludes: [] }])),
    });
    for (const seed of seeds) {
      const priced = picturesAside(createWorld(seed, setup, deps).document);
      // A Biography gives the Traits held a sentence each (v1.1.2-S5), and a Portrait prefers
      // Callings that suit them (v1.1.3-S5): both are set aside.
      const unpriced = picturesAside(createWorld(seed, setup, free).document);
      for (const guildmaster of Object.values(unpriced.world.guildmasters)) {
        guildmaster.traits = priced.world.guildmasters[guildmaster.id]?.traits ?? [];
      }
      expect(unpriced, seed).toEqual(priced);
    }
  });
});

// M9-F1 (DL-113 item 4): every Guildmaster 21 to 50 at the start, drawn with the draws of before.
describe("the founders' ages, 21 to 50, over 1,000 worlds (M9-F1)", () => {
  test("span 21 to 50, and each world is the one drawn under 30 to 45 but for the Guildmasters' ages: the draws are unchanged", () => {
    const deps = testDeps();
    const before = testDeps({ guildmasterStartingAgeMin: 30, guildmasterStartingAgeMax: 45 });
    const ages = new Set<number>();
    for (let index = 0; index < 1000; index += 1) {
      const seed = `founders-${index}`;
      // The age's band chooses the Appearance's and Biography's words (v1.1.2-S5), and the Portrait
      // (v1.1.3-S5): all three are set aside.
      const { world } = picturesAside(createWorld(seed, setup, deps).document);
      const { world: was } = picturesAside(createWorld(seed, setup, before).document);
      for (const guildmaster of Object.values(world.guildmasters)) {
        ages.add(guildmaster.ageAtEntry);
        const old = was.guildmasters[guildmaster.id];
        if (old !== undefined) old.ageAtEntry = guildmaster.ageAtEntry;
      }
      expect(was, seed).toEqual(world);
    }
    expect(Math.min(...ages)).toBe(21);
    expect(Math.max(...ages)).toBe(50);
    expect(ages.size).toBe(30);
    // 2,000 worlds, each now choosing Portraits and writing every Hero's texts (v1.1.3-S5, S6).
  }, 30_000);
});

describe("the player's Guildmaster's Portrait (v1.1.2-S3, DL-125 items 3 and 4)", () => {
  const deps = testDeps();
  const guildmasterOf = (document: WorldDocument) => {
    const guildmasterId = document.world.guilds[playerId]?.guildmasterId;
    const guildmaster = guildmasterId === undefined ? undefined : document.world.guildmasters[guildmasterId];
    if (guildmaster === undefined) throw new Error("No player's Guildmaster");
    return guildmaster;
  };
  const seeds = Array.from({ length: 60 }, (_, n) => `portrait-${n}`);

  test.each<[string, Partial<WorldSetup>, SetupRefusal | null]>([
    ['a Portrait of the sex chosen', { guildmasterSex: 'female', guildmasterPortraitKey: 'gm-female-02' }, null],
    ['a Portrait with no sex chosen', { guildmasterPortraitKey: 'gm-male-03' }, null],
    ['a key content has no picture for', { guildmasterPortraitKey: 'gm-male-99' }, { reason: 'unknown-portrait', portraitKey: 'gm-male-99' }],
    ["a Hero's picture", { guildmasterSex: 'female', guildmasterPortraitKey: 'hero-female-01' }, { reason: 'unknown-portrait', portraitKey: 'hero-female-01' }],
    [
      'a Portrait of the other sex',
      { guildmasterSex: 'female', guildmasterPortraitKey: 'gm-male-01' },
      { reason: 'portrait-of-another-sex', portraitKey: 'gm-male-01', sex: 'female', portraitSex: 'male' },
    ],
  ])('setupRefusal: %s', (_, change, refusal) => {
    expect(setupRefusal({ ...setup, ...change }, deps)).toEqual(refusal);
  });

  test('setupRefusal checks the Portrait after the sex and before the age', () => {
    expect(setupRefusal({ ...setup, guildmasterSex: 'other' as Sex, guildmasterPortraitKey: 'nope' }, deps)).toMatchObject({ reason: 'unknown-sex' });
    expect(setupRefusal({ ...setup, guildmasterPortraitKey: 'nope', guildmasterAge: 12 }, deps)).toMatchObject({ reason: 'unknown-portrait' });
  });

  test('a Guildmaster set up with a Portrait keeps it', () => {
    const { document } = createWorld('kept', { ...setup, guildmasterSex: 'female', guildmasterPortraitKey: 'gm-female-01' }, deps);
    withValid(document, deps);

    expect(guildmasterOf(document)).toMatchObject({ sex: 'female', portraitKey: 'gm-female-01' });
  });

  test("with a Portrait and no sex, the Guildmaster is of the Portrait's sex", () => {
    for (const seed of seeds.slice(0, 10)) {
      const { document } = createWorld(seed, { ...setup, guildmasterPortraitKey: 'gm-female-02' }, deps);
      expect(guildmasterOf(document)).toMatchObject({ sex: 'female', portraitKey: 'gm-female-02' });
    }
  });

  test("without one, the Portrait is chosen from the pictures of the Guildmaster's sex, chosen or drawn, and each of them is chosen", () => {
    const drawn = new Map<Sex, Set<string | null>>([['female', new Set()], ['male', new Set()]]);
    for (const seed of seeds) {
      for (const change of [{}, { guildmasterSex: 'female' as const }, { guildmasterSex: 'male' as const }]) {
        const guildmaster = guildmasterOf(createWorld(seed, { ...setup, ...change }, deps).document);
        drawn.get(guildmaster.sex)?.add(guildmaster.portraitKey);
      }
    }

    expect([...(drawn.get('female') ?? [])].sort()).toEqual(deps.content.portraits.guildmaster.female);
    expect([...(drawn.get('male') ?? [])].sort()).toEqual(deps.content.portraits.guildmaster.male);
  });

  test('the same seed draws the same Portrait', () => {
    for (const seed of seeds.slice(0, 10)) {
      const first = guildmasterOf(createWorld(seed, setup, deps).document).portraitKey;
      expect(guildmasterOf(createWorld(seed, setup, deps).document).portraitKey).toBe(first);
    }
  });

  test('it is null, the Silhouette, when the sex has no picture, as in the core until v1.1.2-S4', () => {
    const bare = testDeps({}, withoutPortraits());
    const { document } = createWorld('none', setup, bare);
    withValid(document, bare);

    expect(guildmasterOf(document).portraitKey).toBeNull();
  });

  test("every Rival's Guildmaster has a picture that fits them, or the Silhouette: never the player's, and never another's (v1.1.3-S5)", () => {
    let pictured = 0;
    for (const seed of seeds.slice(0, 20)) {
      const { document } = createWorld(seed, { ...setup, guildmasterPortraitKey: 'gm-male-02' }, deps);
      const keys = [guildmasterOf(document).portraitKey];
      for (const rival of rivals(document)) {
        const guildmaster = document.world.guildmasters[rival.guildmasterId];
        if (guildmaster === undefined) throw new Error('No Guildmaster');
        if (guildmaster.portraitKey === null) continue;
        pictured += 1;
        keys.push(guildmaster.portraitKey);
        const [from, to] = deps.content.portraitAppearances.portraits[guildmaster.portraitKey]?.apparentAge ?? [99, 0];
        // The test content's bands: young to 35, older from 36.
        const [low, high] = guildmaster.ageAtEntry >= 36 ? [36, Number.POSITIVE_INFINITY] : [0, 35];
        expect(deps.content.portraits.guildmaster[guildmaster.sex]).toContain(guildmaster.portraitKey);
        expect(from <= high && to >= low, `${guildmaster.portraitKey} at ${guildmaster.ageAtEntry}`).toBe(true);
      }
      expect(new Set(keys).size, seed).toBe(keys.length);
    }
    expect(pictured).toBeGreaterThan(20);
  });

  test("the Portrait is drawn on its own stream, gm-portraits, one draw a Guildmaster whatever is chosen or listed, so it moves no other draw", () => {
    for (const seed of seeds.slice(0, 5)) {
      const drawn = createWorld(seed, setup, deps).document;
      const was = guildmasterOf(drawn);
      const chosen = createWorld(seed, { ...setup, guildmasterAge: was.ageAtEntry, guildmasterPortraitKey: 'gm-male-02' }, deps).document;
      const bare = createWorld(seed, setup, testDeps({}, withoutPortraits())).document;

      expect(Object.keys(drawn.world.rng)).toContain('gm-portraits');
      for (const other of [chosen, bare]) {
        // The sex chooses the name's and the texts' words (v1.1.2-S5); the pictures are set aside.
        Object.assign(guildmasterOf(other), { sex: was.sex, birthplace: was.birthplace });
        expect({ ...picturesAside(other), meta: drawn.meta }).toEqual(picturesAside(drawn));
      }
    }
  });

  test("a Portrait chosen with the age left blank moves the age drawn into the picture's ages, and nothing else (DL-134 item 7)", () => {
    for (const seed of seeds.slice(0, 20)) {
      const drawn = createWorld(seed, { ...setup, guildmasterSex: 'male' }, deps).document;
      const chosen = createWorld(seed, { ...setup, guildmasterPortraitKey: 'gm-male-01' }, deps).document;
      // gm-male-01 looks 40 to 50.
      const age = guildmasterOf(chosen).ageAtEntry;
      expect(age).toBeGreaterThanOrEqual(40);
      expect(age).toBeLessThanOrEqual(50);
      expect(age).toBe(ageIntoPortrait(guildmasterOf(drawn).ageAtEntry, [40, 50], 21, 50));
      Object.assign(guildmasterOf(chosen), { ageAtEntry: guildmasterOf(drawn).ageAtEntry });
      expect(picturesAside(chosen)).toEqual(picturesAside(drawn));
    }
  });

  test('portraitFit notes where a chosen Portrait does not fit the age or the Traits, chosen or drawn, and never refuses', () => {
    const chosen = { ...setup, guildmasterPortraitKey: 'gm-female-01' };
    // gm-female-01 looks 22 to 30, and is a soldier's; gm-female-02 looks 38 to 50, and a scholar's.
    expect(portraitFit({ ...chosen, guildmasterAge: 25, guildmasterTraitKeys: [] }, 'fit', deps)).toEqual([]);
    expect(portraitFit({ ...chosen, guildmasterAge: 44, guildmasterTraitKeys: [] }, 'fit', deps)).toEqual([
      { kind: 'age', portraitKey: 'gm-female-01', age: 44, apparentAge: [22, 30], looks: 'younger' },
    ]);
    expect(
      portraitFit({ ...setup, guildmasterPortraitKey: 'gm-female-02', guildmasterAge: 21, guildmasterTraitKeys: ['mistrusts-magic'] }, 'fit', deps),
    ).toEqual([
      { kind: 'age', portraitKey: 'gm-female-02', age: 21, apparentAge: [38, 50], looks: 'older' },
      { kind: 'calling-clash', portraitKey: 'gm-female-02', callingKey: 'scholar', traitKey: 'mistrusts-magic' },
    ]);
    // With the age blank it is moved into the picture's ages, so only a Trait drawn may be noted.
    for (const seed of seeds.slice(0, 20)) {
      expect(portraitFit({ ...setup, guildmasterPortraitKey: 'gm-female-02' }, seed, deps).filter((note) => note.kind === 'age')).toEqual([]);
    }
    // No Portrait chosen, or a setup refused: no note.
    expect(portraitFit({ ...setup, guildmasterAge: 44 }, 'fit', deps)).toEqual([]);
    expect(portraitFit({ ...chosen, guildmasterAge: 12 }, 'fit', deps)).toEqual([]);
  });

  test('throws on a Portrait setupRefusal refuses', () => {
    expect(() => createWorld('bad', { ...setup, guildmasterPortraitKey: 'gm-male-99' }, deps)).toThrow(/unknown-portrait/);
    expect(() => createWorld('bad', { ...setup, guildmasterSex: 'male', guildmasterPortraitKey: 'gm-female-01' }, deps)).toThrow(
      /portrait-of-another-sex/,
    );
  });
});
