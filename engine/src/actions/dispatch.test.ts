import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import type { Guild, GuildId, Hero, HeroId, PartyId, Quest, QuestId, World, WorldDocument } from '../document.js';
import { negotiatedReward } from '../guildmaster.js';
import { count } from '../history.js';
import { phaseContext } from '../phases/phase.js';
import { questsAdvance } from '../phases/quests-advance.js';
import { playerGuild } from '../selectors.js';
import { serialise } from '../serialise.js';
import { dayOf, durationDaysOf, nightOf, timeOfDay } from '../time.js';
import { validate } from '../validate.js';
import { buildDocument, fixtureTurn, harmlessContent, testDeps, withValid } from '../world.test-support.js';
import { applyAction } from './action.js';
import { dispatch, type DispatchRejection, type DispatchRequest } from './dispatch.js';

// No Rivals in a created world: from M2-S9 they take Quests off the Board each afternoon, and
// these tests play Turns to watch the player's own Parties.
const deps = testDeps({ rivalCount: 0 });
const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/** A built document with a Roster of four (a Warrior in a Party, then a Rogue, a Mage, a Healer). */
function built() {
  const { document, ids } = buildDocument({ rosterSize: 4 });
  const player = document.world.guilds[ids.playerGuild] as Guild;
  const [, rogue, mage, healer] = player.rosterIds as [HeroId, HeroId, HeroId, HeroId];
  return { document: withValid(document, deps), ids, rogue, mage, healer };
}

function questOf(world: World, questId: QuestId): Quest {
  const quest = world.quests[questId];
  if (quest === undefined) throw new Error(`No Quest ${questId}`);
  return quest;
}

function heroOf(world: World, heroId: HeroId): Hero {
  const hero = world.heroes[heroId];
  if (hero === undefined) throw new Error(`No Hero ${heroId}`);
  return hero;
}

/** Dispatches and returns the rejection, asserting that nothing changed and nothing was thrown. */
function rejected(document: WorldDocument, request: DispatchRequest): DispatchRejection {
  const before = serialise(document);
  const entries = document.history.entries.length;
  const result = dispatch(document, request, deps);
  expect(serialise(document)).toBe(before);
  expect(document.history.entries).toHaveLength(entries);
  if (result.ok) throw new Error('Expected a rejection');
  return result.rejection;
}

describe('dispatch', () => {
  test('sends the Party: a parties row, the Quest taken and off the Board, each Hero in the Party, quest.taken', () => {
    const { document, ids, rogue, mage } = built();
    const questId = ids.offeredQuest;
    const quest = questOf(document.world, questId);
    const worldBefore = structuredClone(document.world);

    const result = dispatch(document, { guildId: ids.playerGuild, questId, heroIds: [rogue, mage] }, deps);

    if (!result.ok) throw new Error(`Rejected ${result.rejection.reason}`);
    const next = withValid(result.document, deps);
    const { world } = next;
    const partyId = 'party-000002' as PartyId;
    const returnsOnTurn = nightOf(dayOf(fixtureTurn) + durationDaysOf(quest));
    const guildmaster = world.guildmasters[world.guilds[ids.playerGuild]?.guildmasterId ?? ids.playerGuildmaster];
    const agreed = negotiatedReward(quest.reward, guildmaster, deps.content, deps.config);
    expect(world.parties[partyId]).toEqual({
      id: partyId,
      questId,
      guildId: ids.playerGuild,
      heroIds: [rogue, mage],
      departedOnTurn: fixtureTurn,
      returnsOnTurn,
    });
    expect(world.counters.parties).toBe(3);
    expect(questOf(world, questId)).toMatchObject({ status: 'taken', partyIds: [partyId] });
    expect(world.board).not.toContain(questId);
    expect([heroOf(world, rogue).partyId, heroOf(world, mage).partyId]).toEqual([partyId, partyId]);

    expect(result.events).toEqual([
      {
        turn: fixtureTurn,
        type: 'quest.taken',
        participants: [questId, partyId, rogue, mage, ids.playerGuild, quest.patronId],
        labels: {
          [rogue]: heroOf(world, rogue).name,
          [mage]: heroOf(world, mage).name,
          [ids.playerGuild]: world.guilds[ids.playerGuild]?.name,
          [quest.patronId]: world.patrons[quest.patronId]?.name,
        },
        milestone: false,
        payload: { questId, partyId, guildId: ids.playerGuild, heroIds: [rogue, mage], returnsOnTurn, reward: agreed },
      },
    ]);
    // The reward agreed is the offer's, the Guildmaster's Negotiation applied (M4-S5), and the Quest carries it.
    expect(questOf(world, questId).reward).toBe(agreed);
    expect(next.history.entries.at(-1)).toBe(result.events[0]);
    // A new world; the old one as it was; meta and the History shared, as advance shares them.
    expect(world).not.toBe(document.world);
    expect(document.world).toEqual(worldBefore);
    expect(next.meta).toBe(document.meta);
    expect(next.history).toBe(document.history);
  });

  test('is what applyAction does with a dispatch action', () => {
    const one = built();
    const two = built();
    const request = { guildId: one.ids.playerGuild, questId: one.ids.offeredQuest, heroIds: [one.rogue, one.healer] };

    const direct = dispatch(one.document, request, deps);
    const applied = applyAction(two.document, { kind: 'dispatch', ...request }, deps);

    expect(applied.ok && serialise(withValid(applied.document, deps))).toBe(direct.ok && serialise(direct.document));
  });

  test('leaves a document the validator accepts: quest.partyIds and party.questId agree, as it checks', () => {
    const { document, ids, rogue, mage } = built();
    const request = { guildId: ids.playerGuild, questId: ids.offeredQuest, heroIds: [rogue, mage] };
    const result = dispatch(document, request, deps);
    if (!result.ok) throw new Error(`Rejected ${result.rejection.reason}`);
    const next = withValid(result.document, deps);
    const [partyId] = questOf(next.world, ids.offeredQuest).partyIds;
    expect(next.world.parties[partyId as PartyId]?.questId).toBe(ids.offeredQuest);

    // The check is live: a Party pointing at another Quest is refused.
    const broken = structuredClone(next);
    const party = broken.world.parties[partyId as PartyId];
    if (party === undefined) throw new Error('No Party');
    party.questId = ids.takenQuest;
    const verdict = validate(broken, deps);
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.failures.map((failure) => failure.check)).toContain('quest-party-mismatch');
  });

  describe('rejects, typed, changing nothing and throwing nothing', () => {
    test('quest-not-offered: a Quest taken, removed, or never on the Board', () => {
      const { document, ids, rogue, mage } = built();
      const party = { guildId: ids.playerGuild, heroIds: [rogue, mage] };

      for (const questId of [ids.takenQuest, ids.resolvedQuest, 'quest-999998' as QuestId]) {
        expect(rejected(document, { ...party, questId })).toEqual({ action: 'dispatch', reason: 'quest-not-offered', questId });
      }
    });

    test("hero-not-on-roster: another Guild's Hero, an Unattached Hero, a Hero who left the pool", () => {
      const { document, ids, rogue } = built();
      const request = (heroId: HeroId): DispatchRequest => ({
        guildId: ids.playerGuild,
        questId: ids.offeredQuest,
        heroIds: [rogue, heroId],
      });

      for (const heroId of [ids.rivalHero, ids.unattachedHero as HeroId, ids.departedHero]) {
        expect(rejected(document, request(heroId))).toEqual({
          action: 'dispatch',
          reason: 'hero-not-on-roster',
          heroId,
          guildId: ids.playerGuild,
        });
      }
    });

    test('hero-unavailable: in a Party, dead, injured, or retired', () => {
      const { document, ids, rogue, mage, healer } = built();
      const changed = structuredClone(document);
      heroOf(changed.world, mage).injury = { typeKey: 'broken-arm', healsOnTurn: fixtureTurn + 30 };
      heroOf(changed.world, healer).retiredOnTurn = fixtureTurn - 1;
      const player = changed.world.guilds[ids.playerGuild] as Guild;
      player.rosterIds = player.rosterIds.filter((id) => id !== healer);
      withValid(changed, deps);
      const request = (heroId: HeroId): DispatchRequest => ({
        guildId: ids.playerGuild,
        questId: ids.offeredQuest,
        heroIds: [rogue, heroId],
      });

      const cases: [HeroId, string][] = [
        [ids.partyHero, 'in-party'],
        [ids.deadHero, 'dead'],
        [mage, 'injured'],
        [healer, 'retired'],
      ];
      for (const [heroId, because] of cases) {
        expect(rejected(changed, request(heroId))).toEqual({
          action: 'dispatch',
          reason: 'hero-unavailable',
          heroId,
          because,
        });
      }
    });

    test('requirement-unmet naming party-size: too few or too many, with partySizeMin and partySizeMax; any size within is accepted', () => {
      const { document, ids, rogue, mage, healer } = built();
      const { partySizeMin, partySizeMax } = questOf(document.world, ids.offeredQuest).requirements;
      expect([partySizeMin, partySizeMax]).toEqual([2, 4]);
      const request = (heroIds: HeroId[]): DispatchRequest => ({
        guildId: ids.playerGuild,
        questId: ids.offeredQuest,
        heroIds,
      });
      const refusal = (size: number, max = partySizeMax) => ({
        action: 'dispatch',
        reason: 'requirement-unmet',
        questId: ids.offeredQuest,
        unmet: [{ requirement: 'party-size', size, partySizeMin, partySizeMax: max }],
      });

      expect(rejected(document, request([]))).toEqual(refusal(0));
      expect(rejected(document, request([rogue]))).toEqual(refusal(1));
      const small = structuredClone(document);
      questOf(small.world, ids.offeredQuest).requirements.partySizeMax = 2;
      expect(rejected(withValid(small, deps), request([rogue, mage, healer]))).toEqual(refusal(3, 2));

      expect(dispatch(document, request([rogue, mage]), deps).ok).toBe(true);
      expect(dispatch(document, request([rogue, mage, healer]), deps).ok).toBe(true);
    });

    test('requirement-unmet: naming each requirement the Party misses, class and skill, in that order (M4-S5)', () => {
      const { document, ids, rogue, mage, healer } = built();
      const demanding = structuredClone(document);
      const quest = questOf(demanding.world, ids.offeredQuest);
      quest.requirements = { partySizeMin: 1, partySizeMax: 4, classKey: 'mage', skillKey: 'lockpicking' };
      withValid(demanding, deps);
      const request = (heroIds: HeroId[]): DispatchRequest => ({
        guildId: ids.playerGuild,
        questId: ids.offeredQuest,
        heroIds,
      });
      const unmet = (...missing: object[]) => ({
        action: 'dispatch',
        reason: 'requirement-unmet',
        questId: ids.offeredQuest,
        unmet: missing,
      });
      const needsMage = { requirement: 'class', classKey: 'mage' };
      const needsLockpicking = { requirement: 'skill', skillKey: 'lockpicking' };

      // buildDocument gives each Hero their Class's first Skill: the Rogue holds Lockpicking.
      expect(heroOf(demanding.world, rogue).skills).toHaveProperty('lockpicking');
      expect(rejected(demanding, request([healer]))).toEqual(unmet(needsMage, needsLockpicking));
      expect(rejected(demanding, request([rogue, healer]))).toEqual(unmet(needsMage));
      expect(rejected(demanding, request([mage, healer]))).toEqual(unmet(needsLockpicking));
      expect(dispatch(demanding, request([mage, rogue]), deps).ok).toBe(true);

      // Every requirement missed at once: the size, the Class and the Skill.
      quest.requirements = { partySizeMin: 2, partySizeMax: 4, classKey: 'mage', skillKey: 'lockpicking' };
      expect(rejected(demanding, request([healer]))).toEqual(
        unmet({ requirement: 'party-size', size: 1, partySizeMin: 2, partySizeMax: 4 }, needsMage, needsLockpicking),
      );
    });

    test('requirement-unmet: a Quest requiring a Healer refuses a Party without one, naming class (M4-S5)', () => {
      const { document, ids, rogue, mage, healer } = built();
      const wanting = structuredClone(document);
      questOf(wanting.world, ids.offeredQuest).requirements = { partySizeMin: 2, partySizeMax: 4, classKey: 'healer' };
      withValid(wanting, deps);
      const request = (heroIds: HeroId[]): DispatchRequest => ({ guildId: ids.playerGuild, questId: ids.offeredQuest, heroIds });

      const rejection = rejected(wanting, request([rogue, mage]));
      expect(rejection.reason).toBe('requirement-unmet');
      expect(rejection.reason === 'requirement-unmet' && rejection.unmet).toEqual([{ requirement: 'class', classKey: 'healer' }]);
      expect(heroOf(wanting.world, healer).classKey).toBe('healer');
      expect(dispatch(wanting, request([rogue, healer]), deps).ok).toBe(true);
    });

    test('guild-folded: a Guild that has folded sends no Party, whatever else the request gets right', () => {
      const { document, ids } = built();
      const folded = structuredClone(document);
      const rival = folded.world.guilds[ids.rivalGuild] as Guild;
      rival.foldedOnTurn = fixtureTurn - 1;
      // Its Roster is left in place, so that the first request would otherwise be accepted.
      const pair = rival.rosterIds.slice(0, 2);
      const refusal = { action: 'dispatch', reason: 'guild-folded', guildId: ids.rivalGuild };

      expect(rejected(folded, { guildId: ids.rivalGuild, questId: ids.offeredQuest, heroIds: pair })).toEqual(refusal);
      expect(rejected(folded, { guildId: ids.rivalGuild, questId: ids.takenQuest, heroIds: [] })).toEqual(refusal);
      expect(dispatch(document, { guildId: ids.rivalGuild, questId: ids.offeredQuest, heroIds: pair }, deps).ok).toBe(
        true,
      );
    });

    test('in order: the Guild, then the Quest, then each Hero, then the requirements, the size among them', () => {
      const { document, ids, rogue } = built();
      const reason = (questId: QuestId, heroIds: HeroId[]): string =>
        rejected(document, { guildId: ids.playerGuild, questId, heroIds }).reason;
      const folded = structuredClone(document);
      (folded.world.guilds[ids.playerGuild] as Guild).foldedOnTurn = fixtureTurn - 1;

      expect(rejected(folded, { guildId: ids.playerGuild, questId: ids.takenQuest, heroIds: [ids.rivalHero] }).reason).toBe(
        'guild-folded',
      );
      expect(reason(ids.takenQuest, [ids.rivalHero])).toBe('quest-not-offered');
      expect(reason(ids.offeredQuest, [ids.rivalHero])).toBe('hero-not-on-roster');
      expect(reason(ids.offeredQuest, [ids.partyHero])).toBe('hero-unavailable');
      expect(reason(ids.offeredQuest, [rogue])).toBe('requirement-unmet');
    });
  });

  test('throws on a programming error: a Guild not in the world, or a Hero named twice', () => {
    const { document, ids, rogue } = built();

    expect(() =>
      dispatch(document, { guildId: 'guild-000099' as GuildId, questId: ids.offeredQuest, heroIds: [rogue] }, deps),
    ).toThrow(/guild-000099/);
    expect(() =>
      dispatch(document, { guildId: ids.playerGuild, questId: ids.offeredQuest, heroIds: [rogue, rogue] }, deps),
    ).toThrow(new RegExp(rogue));
  });
});

// ── In play: a created world, advanced ──────────────────────────────────────────────────────

/** Plays Turns until `turn`, checking every document. */
function playTo(document: WorldDocument, turn: number, playDeps: EngineDeps = deps): WorldDocument {
  let current = document;
  while (current.world.turn < turn) current = withValid(advance(current, playDeps).document, playDeps);
  return current;
}

/**
 * The first Quest on the Board that asks for no Class or Skill, that `size` Heroes can take, and
 * that lasts at least `minDays`.
 */
function openQuest(world: World, size: number, minDays: number): Quest {
  const fits = (quest: Quest): boolean => {
    const { classKey, skillKey, partySizeMin, partySizeMax } = quest.requirements;
    const open = classKey === undefined && skillKey === undefined;
    return open && partySizeMin <= size && size <= partySizeMax && durationDaysOf(quest) >= minDays;
  };
  const quest = world.board.map((id) => questOf(world, id)).find(fits);
  if (quest === undefined) throw new Error(`No Quest on the Board at Turn ${world.turn} takes a Party of ${size}`);
  return quest;
}

/** The player's `heroIds` sent on an open Quest of at least `minDays`. */
function sent(
  document: WorldDocument,
  heroIds: HeroId[],
  minDays = 0,
): { document: WorldDocument; quest: Quest; partyId: PartyId } {
  const guild = playerGuild(document.world) as Guild;
  const quest = openQuest(document.world, heroIds.length, minDays);
  const result = dispatch(document, { guildId: guild.id, questId: quest.id, heroIds }, deps);
  if (!result.ok) throw new Error(`Rejected ${result.rejection.reason}`);
  const [partyId] = questOf(result.document.world, quest.id).partyIds;
  if (partyId === undefined) throw new Error('No Party');
  return { document: withValid(result.document, deps), quest, partyId };
}

describe('a Party in play', () => {
  test('returns on the night of Day d + k, whichever of the three Turns of Day d it left in', () => {
    for (const day of [0, 1, 14]) {
      for (const turn of [3 * day, 3 * day + 1, 3 * day + 2]) {
        // A world of its own each time: documents share their History, so no two branch from one.
        const document = playTo(createWorld(`return-${day}`, setup, deps).document, turn);
        const heroIds = (playerGuild(document.world) as Guild).rosterIds.slice(0, 2);
        const { document: after, quest, partyId } = sent(document, heroIds);
        const party = after.world.parties[partyId];
        const k = durationDaysOf(quest);

        expect(dayOf(turn)).toBe(day);
        expect(party?.departedOnTurn).toBe(turn);
        expect(party?.returnsOnTurn).toBe(nightOf(day + k));
        expect(timeOfDay(party?.returnsOnTurn ?? 0)).toBe('night');
        expect(dayOf(party?.returnsOnTurn ?? 0)).toBe(day + k);
      }
    }
  });

  // Every Turn before the return night; that night's questsConclude (M2-S5) frees them (next test).
  test('keeps a dispatched Hero from being dispatched again on every Turn until the Party returns', () => {
    const start = createWorld('twice', setup, deps).document;
    const guild = playerGuild(start.world) as Guild;
    const [first, second] = guild.rosterIds as [HeroId, HeroId];
    const { document: away, partyId } = sent(start, [first, second]);
    const returnsOnTurn = away.world.parties[partyId]?.returnsOnTurn ?? 0;

    let document = away;
    expect(returnsOnTurn).toBeGreaterThan(away.world.turn);
    for (let turn = away.world.turn; turn < returnsOnTurn; turn += 1) {
      document = playTo(document, turn);
      const questId = document.world.board[0] as QuestId;
      const again = dispatch(document, { guildId: guild.id, questId, heroIds: [first] }, deps);
      expect(again, `Turn ${turn}`).toEqual({
        ok: false,
        rejection: { action: 'dispatch', reason: 'hero-unavailable', heroId: first, because: 'in-party' },
      });
      expect(document.world.heroes[second]?.partyId).toBe(partyId);
    }
  });

  // M2-S4's last box, closed by M2-S5's questsConclude (DL-25 item 16, DL-29).
  test('frees its Heroes on the night of Day d + k, so they are dispatchable again on the morning of Day d + k + 1, whichever Turn of Day d they left in', () => {
    // No harm, so the Heroes come home fit to go again, and no Rivals to empty the Board (DL-30
    // item 11): the timing is what is checked.
    const unharmed = testDeps({ rivalCount: 0 }, harmlessContent);
    for (const day of [0, 2]) {
      for (const turn of [3 * day, 3 * day + 1, 3 * day + 2]) {
        const document = playTo(createWorld(`again-${turn}`, setup, unharmed).document, turn, unharmed);
        const guild = playerGuild(document.world) as Guild;
        const heroIds = guild.rosterIds.slice(0, 2);
        const { document: away, quest, partyId } = sent(document, heroIds);
        const k = durationDaysOf(quest);

        const eve = playTo(away, nightOf(day + k) - 1, unharmed);
        expect(eve.world.parties[partyId]?.returnsOnTurn).toBe(nightOf(day + k));
        expect(heroIds.map((heroId) => heroOf(eve.world, heroId).partyId)).toEqual([partyId, partyId]);

        const night = playTo(eve, nightOf(day + k), unharmed);
        expect(night.world.parties[partyId]).toBeUndefined();
        expect(heroIds.map((heroId) => heroOf(night.world, heroId).partyId)).toEqual([null, null]);

        const morning = playTo(night, nightOf(day + k) + 1, unharmed);
        expect([dayOf(morning.world.turn), timeOfDay(morning.world.turn)]).toEqual([day + k + 1, 'morning']);
        const next = openQuest(morning.world, heroIds.length, 0);
        const again = dispatch(morning, { guildId: guild.id, questId: next.id, heroIds }, unharmed);
        expect(again.ok, `left on Turn ${turn}`).toBe(true);
      }
    }
  });

  test('is away while questsAdvance, a no-op in M2, emits nothing, and its taken Quest never expires', () => {
    const start = createWorld('away', setup, deps).document;
    const heroIds = (playerGuild(start.world) as Guild).rosterIds.slice(0, 2);
    // Three Days or more, so the Party is still away at the morning that expires the others.
    const { document: away, quest, partyId } = sent(start, heroIds, 3);
    const expiryMorning = quest.expiresOnTurn + 1;
    expect(away.world.parties[partyId]?.returnsOnTurn).toBeGreaterThan(expiryMorning);

    const world = structuredClone(away.world);
    world.turn += 1;
    expect(questsAdvance(world, phaseContext(world, deps))).toEqual([]);
    expect(world).toEqual({ ...away.world, turn: away.world.turn + 1 });

    const later = playTo(away, expiryMorning);
    expect(later.world.quests[quest.id]).toMatchObject({ status: 'taken', partyIds: [partyId] });
    expect(count(later.history, 'quest.expired')).toBeGreaterThan(0);
    expect(later.history.byEntity[quest.id]?.map((position) => later.history.entries[position]?.type)).toEqual([
      'quest.offered',
      'quest.taken',
    ]);
  });
});
