import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import type { Guild, Hero, HeroId, Party, Quest, QuestId, WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf } from '../events.js';
import { phaseContext } from '../phases/phase.js';
import { resolveQuest, type Resolution } from '../quest-engine/resolve.js';
import { playReturnNight } from '../return-night.js';
import { playerGuild } from '../selectors.js';
import { dayOf, nightOf, turnsPerDay } from '../time.js';
import { validate } from '../validate.js';
import { testDeps, withCaptaincy, withDispositions, withValid } from '../world.test-support.js';
import { copyWorld } from '../world-copy.js';
import { applyAction } from './action.js';
import type { NameCaptainRejection } from './captain.js';
import type { ActionResult } from './result.js';

// `nameCaptain` (DL-280 item 6, Q3 c; DL-287; R40): a Guild's Captain, any Hero of its Roster, named
// free to an empty post; a change costs the outgoing Captain `captainChangeMoraleCost` and locks the
// post for `captainChangeLockDays`; a post a Death, a Retirement or a Transfer empties is filled free,
// lock or none. Every document a test makes is held to the validator; the figures are pinned.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

const pins = { rivalCount: 0, captainChangeMoraleCost: -10, captainChangeLockDays: 30, moraleMin: 0, moraleMax: 100 };
const deps = testDeps(pins, withCaptaincy());

function created(seed: string, with_: EngineDeps = deps): { document: WorldDocument; guild: Guild; heroIds: HeroId[] } {
  const document = withValid(createWorld(seed, setup, with_).document, with_);
  const guild = playerGuild(document.world) as Guild;
  return { document, guild, heroIds: [...guild.rosterIds] };
}

/** Names `heroId` the Guild's Captain, the document held to the validator; throws on a refusal. */
function named(document: WorldDocument, guild: Guild, heroId: HeroId, with_: EngineDeps = deps): { document: WorldDocument; events: EngineEvent[] } {
  const result = applyAction(document, { kind: 'nameCaptain', guildId: guild.id, heroId }, with_);
  if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
  return { document: withValid(result.document, with_), events: result.events };
}

function refusal(result: ActionResult<NameCaptainRejection>): NameCaptainRejection {
  if (result.ok) throw new Error('Expected a refusal');
  return result.rejection;
}

const guildOf = (document: WorldDocument, guild: Guild): Guild => document.world.guilds[guild.id] as Guild;
const heroOf = (document: WorldDocument, heroId: HeroId): Hero => document.world.heroes[heroId] as Hero;

/** Plays Turns until the world stands on `turn`. */
function playTo(document: WorldDocument, turn: number, with_: EngineDeps = deps): WorldDocument {
  let current = document;
  while (current.world.turn < turn) current = advance(current, with_).document;
  return current;
}

describe('naming a Captain', () => {
  test('to an empty post is free: the Hero is Captain, no Morale moves, no lock, and the Milestone names the Guild and the Hero', () => {
    const { document, guild, heroIds } = created('name-free');
    const [first] = heroIds as [HeroId];
    const morale = heroIds.map((id) => heroOf(document, id).morale);

    const { document: after, events } = named(document, guild, first);

    expect(guildOf(after, guild)).toMatchObject({ captainId: first, captainChangedOnTurn: null });
    expect(heroIds.map((id) => heroOf(after, id).morale)).toEqual(morale);
    expect(events).toMatchObject([
      {
        type: 'guild.captain-named',
        participants: [guild.id, first],
        milestone: true,
        payload: { guildId: guild.id, heroId: first, replacedId: null, lockedUntilTurn: null },
      },
    ]);
    expect(after.history.byType['guild.captain-named']).toHaveLength(1);
    expect(guildOf(document, guild).captainId).toBeNull();
  });

  test('may name a Hero away on a Quest or injured: any Hero of the Roster', () => {
    const { document, guild, heroIds } = created('name-away');
    const [away] = heroIds as [HeroId];
    const quest = document.world.quests[document.world.board[0] as QuestId] as Quest;
    const sent = applyAction(document, { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds: heroIds.slice(0, quest.requirements.partySizeMin) }, deps);
    if (!sent.ok) throw new Error(sent.rejection.reason);
    expect(named(sent.document, guild, away).document.world.guilds[guild.id]?.captainId).toBe(away);

    const injured = created('name-injured');
    const hurt = injured.heroIds[0] as HeroId;
    heroOf(injured.document, hurt).injury = { typeKey: 'broken-arm', healsOnTurn: injured.document.world.turn + 40 };
    expect(named(injured.document, injured.guild, hurt).document.world.guilds[injured.guild.id]?.captainId).toBe(hurt);
  });

  test("refuses a Hero not on the Guild's Roster: a Rival's, or one the world does not hold", () => {
    const withRival = testDeps({ ...pins, rivalCount: 1 }, withCaptaincy());
    const { document, guild } = created('name-other', withRival);
    const rival = Object.values(document.world.guilds).find((it) => it.id !== guild.id) as Guild;
    const theirs = rival.rosterIds[0] as HeroId;

    expect(refusal(applyAction(document, { kind: 'nameCaptain', guildId: guild.id, heroId: theirs }, withRival))).toEqual({
      action: 'nameCaptain',
      reason: 'hero-not-on-roster',
      heroId: theirs,
    });
    expect(refusal(applyAction(document, { kind: 'nameCaptain', guildId: guild.id, heroId: 'hero-999999' as HeroId }, withRival)).reason).toBe('hero-not-on-roster');
  });

  test('refuses the Captain named again, changing nothing and charging nothing', () => {
    const { document, guild, heroIds } = created('name-again');
    const [first] = heroIds as [HeroId];
    const { document: after } = named(document, guild, first);
    const before = structuredClone(after.world);

    expect(refusal(applyAction(after, { kind: 'nameCaptain', guildId: guild.id, heroId: first }, deps))).toEqual({
      action: 'nameCaptain',
      reason: 'already-captain',
      heroId: first,
    });
    expect(after.world).toEqual(before);
  });

  test('refuses a folded Guild', () => {
    const { document, guild, heroIds } = created('name-folded');
    guildOf(document, guild).foldedOnTurn = document.world.turn;
    expect(refusal(applyAction(document, { kind: 'nameCaptain', guildId: guild.id, heroId: heroIds[0] as HeroId }, deps))).toEqual({
      action: 'nameCaptain',
      reason: 'guild-folded',
      guildId: guild.id,
    });
  });
});

describe('a change of Captain', () => {
  test('costs the outgoing Captain captainChangeMoraleCost and locks the post from that Turn, the Milestone naming both', () => {
    const { document, guild, heroIds } = created('change');
    const [first, second] = heroIds as [HeroId, HeroId];
    const start = named(document, guild, first).document;
    heroOf(start, first).morale = 50;
    const morale = heroOf(start, second).morale;

    const { document: after, events } = named(start, guild, second);

    const turn = start.world.turn;
    const untilTurn = (dayOf(turn) + 30) * turnsPerDay;
    expect(guildOf(after, guild)).toMatchObject({ captainId: second, captainChangedOnTurn: turn });
    expect(heroOf(after, first).morale).toBe(40);
    expect(heroOf(after, second).morale).toBe(morale);
    expect(events).toMatchObject([
      { type: 'guild.captain-named', participants: [guild.id, second, first], payload: { heroId: second, replacedId: first, lockedUntilTurn: untilTurn } },
      { type: 'hero.morale-changed', participants: [first, guild.id], payload: { heroId: first, before: 50, after: 40, cause: 'captain-changed' } },
    ]);
  });

  test('is refused while the lock holds, naming the Captain and the Turns, and made once it has run out', () => {
    const { document, guild, heroIds } = created('locked');
    const [first, second, third] = heroIds as [HeroId, HeroId, HeroId];
    const changed = named(named(document, guild, first).document, guild, second).document;
    const changedOnTurn = changed.world.turn;
    const untilTurn = (dayOf(changedOnTurn) + 30) * turnsPerDay;

    expect(refusal(applyAction(changed, { kind: 'nameCaptain', guildId: guild.id, heroId: third }, deps))).toEqual({
      action: 'nameCaptain',
      reason: 'captain-locked',
      captainId: second,
      changedOnTurn,
      untilTurn,
    });
    const eve = playTo(changed, untilTurn - 1);
    expect(refusal(applyAction(eve, { kind: 'nameCaptain', guildId: guild.id, heroId: third }, deps)).reason).toBe('captain-locked');
    const morning = playTo(eve, untilTurn);
    expect(guildOf(named(morning, guild, third).document, guild).captainId).toBe(third);
  });

  test('of a cost of 0 moves no Morale and emits only the naming; of a lock of 0 Days locks nothing', () => {
    const free = testDeps({ ...pins, captainChangeMoraleCost: 0, captainChangeLockDays: 0 }, withCaptaincy());
    const { document, guild, heroIds } = created('change-free', free);
    const [first, second, third] = heroIds as [HeroId, HeroId, HeroId];
    const start = named(document, guild, first, free).document;

    const { document: after, events } = named(start, guild, second, free);

    expect(events.map((event) => event.type)).toEqual(['guild.captain-named']);
    expect((events[0] as EngineEventOf<'guild.captain-named'>).payload.lockedUntilTurn).toBeNull();
    expect(guildOf(named(after, guild, third, free).document, guild).captainId).toBe(third);
  });
});

describe('a post left empty', () => {
  test('by a Transfer is filled free, though the lock holds', () => {
    const dealing = testDeps({ ...pins, rivalCount: 1, transferLockDays: 0 }, withDispositions({ transferAppetite: 1, recruitThreshold: 0 }, withCaptaincy()));
    const { document, guild, heroIds } = created('vacated-transfer', dealing);
    const [first, second, third] = heroIds as [HeroId, HeroId, HeroId];
    const rival = Object.values(document.world.guilds).find((it) => it.id !== guild.id) as Guild;
    rival.wealth = 1_000_000;
    const changed = named(named(document, guild, first, dealing).document, guild, second, dealing).document;
    const morale = heroOf(changed, second).morale;

    const gone = applyAction(changed, { kind: 'transferOut', guildId: guild.id, heroId: second, toGuildId: rival.id }, dealing);
    if (!gone.ok) throw new Error(gone.rejection.reason);
    expect(guildOf(withValid(gone.document, dealing), guild).captainId).toBeNull();

    const { document: after, events } = named(gone.document, guild, third, dealing);
    expect(guildOf(after, guild)).toMatchObject({ captainId: third, captainChangedOnTurn: changed.world.turn });
    expect(events).toMatchObject([{ type: 'guild.captain-named', payload: { heroId: third, replacedId: null, lockedUntilTurn: null } }]);
    expect(heroOf(after, second).morale).toBe(morale);
  });

  test('by a Death is filled free', () => {
    const { document, guild, heroIds } = created('vacated-death');
    const quest = document.world.quests[document.world.board[0] as QuestId] as Quest;
    const party = heroIds.slice(0, Math.max(2, quest.requirements.partySizeMin));
    const [captain, mate] = party as [HeroId, HeroId];
    const sent = applyAction(named(document, guild, captain).document, { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds: party }, deps);
    if (!sent.ok) throw new Error(sent.rejection.reason);
    const out = Object.values(sent.document.world.parties)[0] as Party;
    const eve = playTo(sent.document, out.returnsOnTurn - 1);
    const night = copyWorld(eve.world);
    night.turn += 1;
    const drawn = resolveQuest(night, structuredClone(night.quests[out.questId] as Quest), structuredClone(out), phaseContext(night, deps, eve.history));
    const told: Resolution = { ...drawn, outcome: { ...drawn.outcome, deaths: [captain], injuries: [] }, traits: [] };

    const home = playReturnNight(eve, [{ partyId: out.id, resolution: told }], deps, out.returnsOnTurn).document;

    expect(validate(home, deps)).toMatchObject({ ok: true });
    expect(guildOf(home, guild).captainId).toBeNull();
    expect(named(home, guild, mate).events).toMatchObject([{ payload: { replacedId: null, lockedUntilTurn: null } }]);
  });

  test('by a Retirement is filled free', () => {
    const ageing = testDeps({ ...pins, heroRetirementChancePerYear: 1, turnsPerYear: 30 }, withCaptaincy());
    const { document, guild, heroIds } = created('vacated-retirement', ageing);
    const [captain, next] = heroIds as [HeroId, HeroId];
    const start = named(document, guild, captain, ageing).document;
    Object.assign(heroOf(start, captain), { enteredTurn: 0, ageAtEntry: 60 });

    const after = withValid(playTo(start, nightOf(10), ageing), ageing);

    expect(heroOf(after, captain).retiredOnTurn).toBe(nightOf(10));
    expect(guildOf(after, guild).captainId).toBeNull();
    expect(named(after, guild, next, ageing).events).toMatchObject([{ payload: { replacedId: null } }]);
  });
});

// DL-280 item 6, Q12 a; DL-287 (R40): a Party coming home with its Guild's Captain alive among it gives
// each other Hero of it who came home s·captainHomecomingMorale Morale, rounded to a whole number as a
// Quest's Morale is, s the Captain's captaincy Stat from its least, 0, to its most, 1.
describe("the Captain's homecoming", () => {
  const homecoming = testDeps({ ...pins, captainHomecomingMorale: 5 }, withCaptaincy());

  /**
   * The player's Party of three sent with `captain` among it or not, Leadership `leadership`, and brought
   * home on its night with a told outcome: a success, no harm, no Morale from its Encounters, `deaths`
   * dead. The Morale changes of the return, by Hero, and the Party.
   */
  function returned(seed: string, { leadership, captainSent = true, deaths = [] as number[] }: { leadership: number; captainSent?: boolean; deaths?: number[] }) {
    const { document, guild, heroIds } = created(seed, homecoming);
    const quest = document.world.quests[document.world.board[0] as QuestId] as Quest;
    quest.requirements = { partySizeMin: 2 };
    const [captain] = heroIds as [HeroId];
    heroOf(document, captain).stats['leadership'] = leadership;
    heroOf(document, captain).traits = [];
    const start = named(document, guild, captain, homecoming).document;
    const party = captainSent ? heroIds.slice(0, 3) : heroIds.slice(1, 4);
    const sent = applyAction(start, { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds: party }, homecoming);
    if (!sent.ok) throw new Error(sent.rejection.reason);
    const out = Object.values(sent.document.world.parties)[0] as Party;
    const eve = playTo(sent.document, out.returnsOnTurn - 1, homecoming);
    const night = copyWorld(eve.world);
    night.turn += 1;
    const drawn = resolveQuest(night, structuredClone(night.quests[out.questId] as Quest), structuredClone(out), phaseContext(night, homecoming, eve.history));
    const dead = deaths.map((at) => party[at] as HeroId);
    const told: Resolution = { ...drawn, outcome: { ...drawn.outcome, band: 'success', deaths: dead, injuries: [], moraleByHero: {} }, traits: [] };
    const { document: home, events } = playReturnNight(eve, [{ partyId: out.id, resolution: told }], homecoming, out.returnsOnTurn);
    withValid(home, homecoming);
    const lifted = events
      .filter((event): event is EngineEventOf<'hero.morale-changed'> => event.type === 'hero.morale-changed' && event.payload.cause === 'captain-homecoming')
      .map((event) => [event.payload.heroId, event.payload.after - event.payload.before, event.payload.questId]);
    return { lifted, party, captain, questId: out.questId };
  }

  test("at the Stat's most, each other Hero who came home gains captainHomecomingMorale, naming the Quest; the Captain gains none", () => {
    const { lifted, party, captain, questId } = returned('homecoming-most', { leadership: 20 });
    expect(lifted).toEqual(party.filter((id) => id !== captain).map((id) => [id, 5, questId]));
  });

  test("at the Stat's least none, and between a share, rounded", () => {
    expect(returned('homecoming-least', { leadership: 1 }).lifted).toEqual([]);
    const some = returned('homecoming-some', { leadership: 10.5 });
    expect(some.lifted.map(([, gain]) => gain)).toEqual([3, 3]);
  });

  test('none for a Party without its Captain, nor one whose Captain died on the Quest; the dead gain none', () => {
    expect(returned('homecoming-without', { leadership: 20, captainSent: false }).lifted).toEqual([]);
    expect(returned('homecoming-fallen', { leadership: 20, deaths: [0] }).lifted).toEqual([]);
    const { lifted, party } = returned('homecoming-mate-fallen', { leadership: 20, deaths: [1] });
    expect(lifted.map(([heroId]) => heroId)).toEqual([party[2]]);
  });
});

describe('the validator', () => {
  test("refuses a Captain not on their Guild's Roster", () => {
    const { document, guild, heroIds } = created('validator');
    const after = named(document, guild, heroIds[0] as HeroId).document;
    const broken = structuredClone(after);
    const guildRow = broken.world.guilds[guild.id] as Guild;
    guildRow.rosterIds = guildRow.rosterIds.filter((id) => id !== heroIds[0]);
    const pooled = broken.world.heroes[heroIds[0] as HeroId] as Hero;
    pooled.guildId = null;
    pooled.unattachedSince = broken.world.turn;

    const result = validate(broken, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures).toContainEqual(expect.objectContaining({ check: 'captain-off-roster', id: guild.id }));
  });
});
