import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import { makeId, type Guild, type Hero, type HeroId, type Quest, type World, type WorldDocument } from '../document.js';
import type { EngineEvent, TurnEvent } from '../events.js';
import { append, createHistory } from '../history.js';
import { phases } from '../pipeline.js';
import { createStreams } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { durationDaysOf, nightOf } from '../time.js';
import { buildDocument, deepFreeze, harmlessContent, ofType, plannedStreams, playWith, setup, streamsOutOfPlace, testContent, testDeps, withCaptaincy, withValid } from '../world.test-support.js';
import { captainScale } from '../captain.js';
import { heroState, lastAnniversaryNight, retirementChance } from './hero-state.js';
import { phaseContext } from './phase.js';
import { applyAction } from '../actions/action.js';

/** Advances to a Turn, validating every document. */
const playTo = playWith(advance);

// The night's Hero State Engine (DL-29). Documents a test inspects after `advance` are held
// to the validator; a test of one rule over many nights runs the phase alone on a world whose Turn
// it moves from night to night.

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A created world whose Guildmasters hold no Traits: a `guildMoraleShift` Trait moves the
 * Morale baseline, which these tests read as `moraleBaseline` (the Traits are guildmaster.test.ts's).
 */
function created(seed: string, deps: EngineDeps): WorldDocument {
  const { document } = createWorld(seed, setup, deps);
  for (const guildmaster of Object.values(document.world.guildmasters)) guildmaster.traits = [];
  return document;
}

/** Runs the phase alone on `world` on the night of Day `day`. */
function night(world: World, day: number, deps: EngineDeps, document?: WorldDocument): TurnEvent[] {
  world.turn = nightOf(day);
  return heroState(world, phaseContext(world, deps, document?.history));
}

const hero = (world: World, id: HeroId): Hero => world.heroes[id] as Hero;
const rosterOf = (world: World): HeroId[] => (playerGuild(world) as Guild).rosterIds;

describe('healing', () => {
  test('an Injury heals on its night and not before, with hero.healed', () => {
    // No Rivals: their Parties would come home hurt, and they are not the subject (DL-30 item 11).
    const deps = testDeps({ rivalCount: 0 });
    const start = created('heal', deps);
    const [heroId] = rosterOf(start.world) as [HeroId];
    hero(start.world, heroId).injury = { typeKey: 'bruised-ribs', healsOnTurn: nightOf(3) };

    const before = playTo(start, nightOf(3) - 1, deps);
    expect(hero(before.document.world, heroId).injury).toEqual({ typeKey: 'bruised-ribs', healsOnTurn: nightOf(3) });
    expect(ofType(before.events, 'hero.healed')).toEqual([]);

    const { document, events } = playTo(before.document, nightOf(3), deps);

    expect(hero(document.world, heroId).injury).toBeNull();
    expect(ofType(events, 'hero.healed')).toMatchObject([
      { turn: nightOf(3), participants: [heroId, (playerGuild(document.world) as Guild).id], milestone: false },
    ]);
    expect(ofType(events, 'hero.healed')[0]?.payload).toEqual({ heroId, typeKey: 'bruised-ribs', traitKey: null });
    expect(hero(document.world, heroId).traits).toEqual([]);
  });

  test('a type that leaves a Trait adds it once, however often the Hero heals of it', () => {
    const deps = testDeps();
    const { world } = created('scar', deps);
    const [heroId] = rosterOf(world) as [HeroId];
    const scarred = deps.content.injuries['deep-cut']?.leavesTrait;
    expect(scarred).toBe('scarred');

    const traitKeys: (string | null)[] = [];
    for (const day of [1, 2]) {
      hero(world, heroId).injury = { typeKey: 'deep-cut', healsOnTurn: nightOf(day) };
      const [healed] = ofType(night(world, day, deps), 'hero.healed');
      traitKeys.push(healed === undefined ? 'not healed' : healed.payload.traitKey);
    }

    expect(traitKeys).toEqual(['scarred', null]);
    expect(hero(world, heroId).traits).toEqual(['scarred']);
  });

  // DL-150 item 5: the wound is a fact of the body.
  test("a Trait an Injury leaves replaces each held one it conflicts with, either way round, with hero.trait-lost, a Milestone, after hero.healed", () => {
    const base = testDeps();
    const trait = (key: string, excludes: string[]) => ({ key, name: key, excludes, effects: [] });
    // `scarred` excludes `fearless`; `vain` excludes `scarred` only from its own side, which the rule reads too.
    const content = {
      ...base.content,
      heroTraits: {
        ...base.content.heroTraits,
        scarred: trait('scarred', ['fearless']),
        fearless: trait('fearless', ['scarred']),
        vain: trait('vain', ['scarred']),
        lucky: trait('lucky', []),
      },
    };
    const deps = testDeps({}, content);
    const { world } = created('replaced', deps);
    const [heroId] = rosterOf(world) as [HeroId];
    hero(world, heroId).traits = ['fearless', 'lucky', 'vain'];
    hero(world, heroId).injury = { typeKey: 'deep-cut', healsOnTurn: nightOf(1) };

    const events = night(world, 1, deps).filter((event) => event.type === 'hero.healed' || event.type === 'hero.trait-lost');

    expect(hero(world, heroId).traits).toEqual(['lucky', 'scarred']);
    expect(events.map((event) => [event.type, event.payload, event.milestone])).toEqual([
      ['hero.healed', { heroId, typeKey: 'deep-cut', traitKey: 'scarred' }, false],
      ['hero.trait-lost', { heroId, traitKey: 'fearless', replacedBy: 'scarred' }, true],
      ['hero.trait-lost', { heroId, traitKey: 'vain', replacedBy: 'scarred' }, true],
    ]);
    expect(events[1]?.participants).toEqual([heroId, (playerGuild(world) as Guild).id]);
  });

  test('a Trait already held replaces nothing, and one that conflicts with nothing held loses nothing', () => {
    const base = testDeps();
    const content = {
      ...base.content,
      heroTraits: {
        ...base.content.heroTraits,
        scarred: { key: 'scarred', name: 'Scarred', excludes: ['fearless'], effects: [] },
        fearless: { key: 'fearless', name: 'Fearless', excludes: ['scarred'], effects: [] },
      },
    };
    const deps = testDeps({}, content);
    const { world } = created('kept', deps);
    const [first, second] = rosterOf(world) as [HeroId, HeroId];
    hero(world, first).traits = ['scarred'];
    hero(world, second).traits = ['lame'];
    for (const heroId of [first, second]) hero(world, heroId).injury = { typeKey: 'deep-cut', healsOnTurn: nightOf(1) };

    const events = night(world, 1, deps);

    expect(ofType(events, 'hero.trait-lost')).toEqual([]);
    expect(hero(world, first).traits).toEqual(['scarred']);
    expect(hero(world, second).traits).toEqual(['lame', 'scarred']);
  });

  test('a type content no longer defines heals on its night and leaves nothing (data-model rule 5)', () => {
    const deps = testDeps();
    const { world } = created('unknown-injury', deps);
    const [heroId] = rosterOf(world) as [HeroId];
    hero(world, heroId).injury = { typeKey: 'frostbite', healsOnTurn: nightOf(1) };

    const events = night(world, 1, deps);

    expect(ofType(events, 'hero.healed')[0]?.payload).toEqual({ heroId, typeKey: 'frostbite', traitKey: null });
    expect(hero(world, heroId)).toMatchObject({ injury: null, traits: [] });
  });
});

describe('Morale drift', () => {
  test('converges on the baseline over nights from either side, never passing it', () => {
    // Inspiration still: the baseline is moraleBaseline.
    const deps = testDeps({ moraleDrift: 3, inspirationMoraleShift: 0 });
    const { world } = created('converge', deps);
    const baseline = deps.config.moraleBaseline;
    const starts = [100, 71, 61, 59, 50.5, 0];
    const ids = rosterOf(world);

    for (const [index, start] of starts.entries()) {
      const heroId = ids[index % ids.length] as HeroId;
      hero(world, heroId).morale = start;
      const seen = [start];
      for (let day = 1; day <= 40; day += 1) {
        night(world, index * 100 + day, deps);
        seen.push(hero(world, heroId).morale);
      }
      const side = Math.sign(start - baseline);
      for (let i = 1; i < seen.length; i += 1) {
        const [was, now] = [seen[i - 1] as number, seen[i] as number];
        // Each night closer by the drift, or onto the baseline, and never across it.
        expect(Math.abs(now - baseline)).toBe(Math.max(0, Math.abs(was - baseline) - 3));
        expect(Math.sign(now - baseline) === side || now === baseline).toBe(true);
      }
      expect(seen.at(-1)).toBe(baseline);
    }
  });

  // Morale drifts one a night, so each walk below reaches its band's edge within 20 nights; a month a half.
  test('a month of drift that crosses no band appends nothing; one crossing appends exactly one hero.morale-changed', () => {
    // Only the Hero State Engine runs, so every entry the month appends is its own.
    for (const phase of phases) if (phase.name !== 'heroState') vi.spyOn(phase, 'run').mockReturnValue([]);
    // Inspiration still: the baseline is moraleBaseline.
    // The walks below were worked out at the baseline 60 and these bands (DL-283 item 4, Q18).
    const deps = testDeps({ inspirationMoraleShift: 0, moraleBaseline: 60, moraleBands: { wretched: 0, low: 20, steady: 40, high: 75, elated: 90 } });
    const month = nightOf(30);
    const start = created('drift-year', deps);
    const [quiet, falling, rising] = rosterOf(start.world) as [HeroId, HeroId, HeroId];

    // Steady to steady: 70 drifts to 60 without leaving the band.
    hero(start.world, quiet).morale = 70;
    const calm = playTo(start, month, deps);
    expect(calm.events).toEqual([]);
    expect(hero(calm.document.world, quiet).morale).toBe(60);

    // High to steady, and low to steady: one crossing each, on the night it happens.
    hero(calm.document.world, falling).morale = 80;
    hero(calm.document.world, rising).morale = 35;
    const from = calm.document.world.turn;
    const { document, events } = playTo(calm.document, from + month, deps);

    const crossings = ofType(events, 'hero.morale-changed');
    expect(events).toHaveLength(2);
    expect(crossings.map(({ payload }) => [payload.heroId, payload.cause, payload.bandBefore, payload.bandAfter])).toEqual([
      [rising, 'drift', 'low', 'steady'],
      [falling, 'drift', 'high', 'steady'],
    ]);
    expect(crossings.map(({ payload }) => [payload.before, payload.after])).toEqual([
      [39, 40],
      [75, 74],
    ]);
    expect(document.history.byType['hero.morale-changed']).toHaveLength(2);
  });
});

describe('Retirement', () => {
  const certain = { heroRetirementChancePerYear: 1 };

  test('is checked on the night of each anniversary of entering the world', () => {
    const config = { turnsPerYear: 1080 };
    // Entered on the morning of Day 0: first anniversary on Day 360, whose night is Turn 1082.
    expect(lastAnniversaryNight({ enteredTurn: 0 }, 1081, config)).toBeNull();
    expect(lastAnniversaryNight({ enteredTurn: 0 }, 1082, config)).toBe(1082);
    expect(lastAnniversaryNight({ enteredTurn: 0 }, 2161, config)).toBe(1082);
    expect(lastAnniversaryNight({ enteredTurn: 0 }, 2162, config)).toBe(2162);
    // Entered at night, as a pool Hero does: the anniversary is that same night a year on.
    expect(lastAnniversaryNight({ enteredTurn: 50 }, 1130, config)).toBe(1130);
    expect(lastAnniversaryNight({ enteredTurn: 50 }, 1129, config)).toBeNull();
  });

  test('has a chance of heroRetirementChancePerYear for each year past heroRetirementAge, none at or below it, doubled while injured', () => {
    const { config } = testDeps({ heroRetirementAge: 45, heroRetirementChancePerYear: 0.02, heroRetirementInjuredMultiplier: 2 });
    const fit = { injury: null };
    const injured = { injury: { typeKey: 'broken-arm', healsOnTurn: 99 } };

    expect([18, 44, 45, 46, 50].map((age) => retirementChance(fit, age, config))).toEqual([0, 0, 0, 0.02, 0.1]);
    expect(retirementChance(injured, 46, config)).toBe(0.04);
    expect(retirementChance(injured, 200, config)).toBe(1);
  });

  test('never fires below heroRetirementAge, even at a chance of 1 a year past it', () => {
    const deps = testDeps({ ...certain, turnsPerYear: 30 });
    const { world } = created('young', deps);
    const ids = Object.values(world.guilds).flatMap((guild) => guild.rosterIds);
    for (const heroId of ids) Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 30 });

    // Anniversaries on the nights of Days 10, 20, …: ages 31 to 45 retire no one.
    for (let year = 1; year <= 15; year += 1) {
      expect(ofType(night(world, 10 * year, deps), 'hero.retired'), `age ${30 + year}`).toEqual([]);
    }
    // At 46, one year past it, every Hero goes.
    expect(ofType(night(world, 160, deps), 'hero.retired').map((event) => event.payload.age)).toEqual(ids.map(() => 46));
  });

  test('over 10,000 Hero-years past the age, retires at the configured chance within 20%', () => {
    const deps = testDeps();
    const { document, ids } = buildDocument({ rivals: 1, rosterSize: 100 });
    const base = document.world;
    const home = Object.values(base.guilds).flatMap((guild) => guild.rosterIds).filter((id) => id !== ids.partyHero);
    const rate = (fields: Partial<Hero>): number => {
      let checks = 0;
      let retired = 0;
      let stream = structuredClone(base.rng.heroes);
      while (checks < 10_000) {
        const world = structuredClone(base);
        world.rng.heroes = stream;
        // Entered on Turn 0 at 45: tonight, Day 360, is their first anniversary, at 46.
        for (const heroId of home) Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 45, ...fields });
        retired += ofType(night(world, 360, deps), 'hero.retired').length;
        checks += home.length;
        stream = world.rng.heroes;
      }
      return retired / checks;
    };
    const chance = deps.config.heroRetirementChancePerYear;

    expect(Math.abs(rate({}) - chance)).toBeLessThan(0.2 * chance);
    expect(Math.abs(rate({ ageAtEntry: 49 }) - 5 * chance)).toBeLessThan(0.2 * 5 * chance);
    const injured = rate({ injury: { typeKey: 'broken-arm', healsOnTurn: nightOf(400) } });
    expect(Math.abs(injured - 2 * chance)).toBeLessThan(0.2 * 2 * chance);
  });

  test('takes the Hero off the Roster, keeping their row, Guild and retiredOnTurn, with the hero.retired Milestone', () => {
    const deps = testDeps({ ...certain, turnsPerYear: 30, rivalCount: 0 });
    const start = created('retire', deps);
    const guild = playerGuild(start.world) as Guild;
    const [heroId] = guild.rosterIds as [HeroId];
    Object.assign(hero(start.world, heroId), { enteredTurn: 0, ageAtEntry: 60 });

    const { document, events } = playTo(start, nightOf(10), deps);

    const [retired] = ofType(events, 'hero.retired');
    expect(retired).toMatchObject({
      turn: nightOf(10),
      participants: [heroId, guild.id],
      milestone: true,
      payload: { heroId, guildId: guild.id, age: 61 },
    });
    expect(hero(document.world, heroId)).toMatchObject({ retiredOnTurn: nightOf(10), guildId: guild.id, partyId: null });
    expect(rosterOf(document.world)).not.toContain(heroId);
    expect(document.history.milestones).toContain(document.history.entries.indexOf(retired as EngineEvent));
  });

  test('checks a Hero away on the anniversary on the night their Party brings them home', () => {
    // No Rivals: they would take the Board's Quests and send Parties of their own (DL-30 item 11).
    const deps = testDeps({ ...certain, turnsPerYear: 30, rivalCount: 0 }, harmlessContent);
    const start = created('away', deps);
    const ids = rosterOf(start.world);
    for (const heroId of ids) Object.assign(hero(start.world, heroId), { enteredTurn: 0, ageAtEntry: 60 });
    // Sent on the first morning a Quest on the Board keeps them away over the night of Day 10.
    let morning = start;
    let quest: Quest | undefined;
    let day = 0;
    while (quest === undefined && day < 10) {
      day += 1;
      morning = playTo(morning, 3 * day, deps).document;
      const today = day;
      quest = morning.world.board
        .map((id) => morning.world.quests[id] as Quest)
        .find(({ requirements: { classKey, skillKey, partySizeMin }, durationTurns }) =>
          classKey === undefined && skillKey === undefined && partySizeMin <= 2 &&
          today + durationDaysOf({ durationTurns }) > 10,
        );
    }
    if (quest === undefined) throw new Error('No Quest to send them on');
    const away = ids.slice(0, 2);
    const sent = applyAction(morning, { kind: 'dispatch', guildId: (playerGuild(morning.world) as Guild).id, questId: quest.id, heroIds: away }, deps);
    if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
    const returnsOnTurn = nightOf(day + durationDaysOf(quest));

    const anniversary = playTo(withValid(sent.document, deps), nightOf(10), deps);
    const retiredThen = ofType(anniversary.events, 'hero.retired').map((event) => event.payload.heroId);
    expect(retiredThen).toEqual(ids.slice(2));
    for (const heroId of away) expect(hero(anniversary.document.world, heroId).retiredOnTurn).toBeNull();

    const home = playTo(anniversary.document, returnsOnTurn, deps);
    const retiredLater = ofType(home.events, 'hero.retired');
    expect(retiredLater.map((event) => [event.turn, event.payload.heroId])).toEqual(away.map((heroId) => [returnsOnTurn, heroId]));
    expect(ofType(home.events, 'quest.resolved')).toHaveLength(1);
  });

  test('a Hero sent out on the anniversary night itself was checked that night, and is not checked again on coming home', () => {
    // An action may be taken in any Turn (pre-M0 review D2), the night's included: a Party that
    // leaves on an anniversary night leaves after that night's check, so its homecoming takes no
    // draw. A chance of 0 still draws on each due check, so the heroes stream shows every check.
    const deps = testDeps({ heroRetirementChancePerYear: 0, turnsPerYear: 30, rivalCount: 0 });
    const { world } = created('left-on-the-night', deps);
    const guild = playerGuild(world) as Guild;
    const [sent] = guild.rosterIds as [HeroId];
    const history = createHistory();
    const at = (day: number): TurnEvent[] => {
      world.turn = nightOf(day);
      return heroState(world, phaseContext(world, deps, history));
    };

    const beforeAnniversary = structuredClone(world.rng.heroes);
    at(10);
    expect(world.rng.heroes).not.toEqual(beforeAnniversary);
    // Sent during the night of Day 10, after the night's phases; home on the night of Day 12.
    const partyId = makeId('parties', 99);
    append(history, {
      turn: nightOf(10),
      type: 'quest.taken',
      participants: [sent],
      labels: {},
      milestone: false,
      payload: { questId: makeId('quests', 99), partyId, guildId: guild.id, heroIds: [sent], returnsOnTurn: nightOf(12) },
    });
    // The Party's row, on a Quest of the Board: the night away reads its Tier for Fatigue (DL-282).
    const questId = world.board[0] as Quest['id'];
    world.parties[partyId] = { id: partyId, questId, guildId: guild.id, heroIds: [sent], departedOnTurn: nightOf(10), returnsOnTurn: nightOf(12), fatigueAtDispatch: { [sent]: 0 } };
    hero(world, sent).partyId = partyId;
    at(11);
    hero(world, sent).partyId = null;
    delete world.parties[partyId];
    const beforeHomecoming = structuredClone(world.rng.heroes);

    const events = at(12);

    expect(ofType(events, 'hero.retired')).toEqual([]);
    expect(world.rng.heroes).toEqual(beforeHomecoming);
  });
});

// DL-287: the Captain at home lifts the Roster's baseline by s·captainHomeBaselineBonus. The night
// keeps each Guild's lift once worked out, and each Hero's drift must still read the Captain as they
// stand when that Hero's turn comes: healed of an Injury tonight, or retired tonight.
describe("the Captain's lift through a night", () => {
  const pins = { rivalCount: 0, moraleDrift: 1, moraleBaseline: 50, quartersMoraleBonus: 0, inspirationMoraleShift: 0, captainHomeBaselineBonus: 5 };

  /** A world of three plain Heroes at Morale 50, the second the Captain, under `deps`. */
  function captained(seed: string, deps: EngineDeps) {
    const document = created(seed, deps);
    const { world } = document;
    const guild = playerGuild(world) as Guild;
    const [before, captain, after] = guild.rosterIds.map((id) => hero(world, id)) as [Hero, Hero, Hero];
    for (const it of [before, captain, after]) Object.assign(it, { morale: 50, traits: [], injury: null, ageAtEntry: 20 });
    guild.captainId = captain.id;
    return { document, world, guild, before, captain, after };
  }

  test("reads the Captain healed tonight from their own drift on: an Injury's Trait that raises the captaincy Stat lifts the Captain and those after them", () => {
    // Scarred, which Deep cut leaves, takes Leadership from its least to its most.
    const content = withCaptaincy(deepFreeze({ ...testContent, heroTraits: { ...testContent.heroTraits, scarred: { key: 'scarred', name: 'Scarred', excludes: [], effects: [{ kind: 'statModifiers', modifiers: { leadership: 19 } }] } } }));
    const deps = testDeps(pins, content);
    const { world, before, captain, after } = captained('captain-heals', deps);
    captain.stats['leadership'] = 1;
    captain.injury = { typeKey: 'deep-cut', healsOnTurn: nightOf(5) };
    expect(captainScale(captain, world, content)).toBe(0);

    night(world, 5, deps);

    expect(captain.traits).toContain('scarred');
    expect(captainScale(captain, world, content)).toBe(1);
    // The Hero before the Captain drifted toward the baseline unlifted; the Captain and the Hero after, toward 55.
    expect([before, captain, after].map((it) => it.morale)).toEqual([50, 51, 51]);
  });

  test('lifts no Hero after a Captain who retires tonight', () => {
    const deps = testDeps({ ...pins, heroRetirementChancePerYear: 1, turnsPerYear: 30 }, withCaptaincy());
    const { document, world, guild, before, captain, after } = captained('captain-retires', deps);
    captain.stats['leadership'] = 20;
    Object.assign(captain, { enteredTurn: 0, ageAtEntry: 60 });
    expect(captainScale(captain, world, deps.content)).toBe(1);

    night(world, 10, deps, document);

    expect(captain.retiredOnTurn).toBe(nightOf(10));
    expect(guild.captainId).toBeNull();
    // Before the Captain and the Captain, toward 55; after their Retirement, toward 50.
    expect([before, captain, after].map((it) => it.morale)).toEqual([51, 51, 50]);
  });
});

describe('which Heroes it covers', () => {
  test('leaves the Unattached pool, the dead, the retired and a folded Guild alone', () => {
    const deps = testDeps({ heroRetirementChancePerYear: 1 });
    const { document, ids } = buildDocument({ rivals: 1, rosterSize: 2, unattached: 1 });
    const { world } = document;
    const player = world.guilds[ids.playerGuild] as Guild;
    const retired = hero(world, ids.idleHero as HeroId);
    retired.retiredOnTurn = 30;
    player.rosterIds = player.rosterIds.filter((id) => id !== retired.id);
    (world.guilds[ids.rivalGuild] as Guild).foldedOnTurn = 0;
    const untouched = [ids.unattachedHero as HeroId, ids.deadHero, retired.id, ids.rivalHero].map((id) => hero(world, id));
    for (const it of untouched) Object.assign(it, { morale: 90, ageAtEntry: 70, injury: { typeKey: 'deep-cut', healsOnTurn: 0 } });
    const before = structuredClone(untouched);

    const events = night(world, 360, deps);

    expect(untouched).toEqual(before);
    const named = new Set(events.flatMap((event) => event.participants));
    for (const it of untouched) expect(named.has(it.id), it.id).toBe(false);
  });

  test('advances the heroes stream and no other', () => {
    const deps = testDeps();
    const { document, ids } = buildDocument({ rivals: 1, rosterSize: 20 });
    const { world } = document;
    Object.assign(world.rng, createStreams(document.meta.seed, plannedStreams), structuredClone(world.rng));
    for (const heroId of (world.guilds[ids.playerGuild] as Guild).rosterIds) {
      Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 50, morale: 80, injury: { typeKey: 'deep-cut', healsOnTurn: 0 } });
    }
    const before = structuredClone(world.rng) as Record<string, unknown>;

    const events = night(world, 360, deps);

    expect(ofType(events, 'hero.healed').length).toBeGreaterThan(0);
    expect(streamsOutOfPlace(before, world.rng, ['heroes'])).toEqual([]);
  });
});
