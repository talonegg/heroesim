import { describe, expect, test } from 'vitest';
import { createWorld, type WorldSetup } from './create.js';
import { makeId, tableNames, type Guild, type WorldDocument } from './document.js';
import { count, entriesFor } from './history.js';
import { isJsonSafe } from './json-safe.js';
import { validate } from './validate.js';
import { testDeps, withValid } from './world.test-support.js';

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

  test('generates rivalCount steady Rivals, their Rosters, Wealth and names drawn from the config and content', () => {
    const deps = testDeps();
    for (const seed of ['rivals-1', 'rivals-2', 'rivals-3', 'rivals-4', 'rivals-5']) {
      const { document } = createWorld(seed, setup, deps);
      withValid(document, deps);
      const found = rivals(document);

      expect(found).toHaveLength(deps.config.rivalCount);
      for (const rival of found) {
        expect(rival.controller).toEqual({ kind: 'rival', disposition: 'steady' });
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

    // A Guild's page holds its founding, its Guildmaster and every Hero generated onto its Roster.
    const player = document.world.guilds[playerId];
    const page = entriesFor(history, playerId).reverse();
    expect(page.map((entry) => entry.type)).toEqual([
      'guild.founded',
      'guildmaster.generated',
      ...(player?.rosterIds.map(() => 'hero.generated') ?? []),
    ]);
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
