import { describe, expect, test } from 'vitest';
import { dispatchRefusal, type DispatchRequest } from './actions/dispatch.js';
import type { Encounter, NumQuery } from './content-types.js';
import type { Guild, Hero, HeroId, Quest, World, WorldDocument } from './document.js';
import { guildmasterOf, negotiatedReward } from './guildmaster.js';
import { addStack } from './items.js';
import { previewDispatch, skillsThatHelp, statsRead } from './preview.js';
import { estimateQuest } from './quest-engine/estimate.js';
import { queryParty } from './quest-engine/query.js';
import { synergiesFor } from './quest-engine/synergy.js';
import { serialise } from './serialise.js';
import { buildDocument, testContent, testDeps, withValid } from './world.test-support.js';
import { applyAction } from './actions/action.js';

// The dispatch preview (M7-S3, DL-66): what a proposed Party would meet on a Quest from the Board,
// moved into the engine from the CLI's `preview` so that both front ends show the rule's own
// answers, and dispatch's verdict found by dispatch's own checks.

const deps = testDeps({ rivalCount: 0 });

/**
 * The built document with a Roster of four (a Warrior away in a Party, then a Rogue, a Mage, a
 * Healer), the offered Quest given three drawn Encounters, a Class and a Skill it requires, and the
 * Guild holding two whetstones beside its three healing draughts.
 */
function proposal() {
  const built = buildDocument({ rosterSize: 4 });
  const document = structuredClone(built.document);
  const { world } = document;
  const player = world.guilds[built.ids.playerGuild] as Guild;
  const [warrior, rogue, mage, healer] = player.rosterIds as [HeroId, HeroId, HeroId, HeroId];
  const quest = world.quests[built.ids.offeredQuest] as Quest;
  quest.encounterKeys = ['ambush-on-the-road', 'the-long-march', 'past-the-watch'];
  quest.requirements = { partySizeMin: 2, partySizeMax: 3, classKey: 'mage', skillKey: 'lockpicking' };
  addStack(world, 'whetstone', 2, { kind: 'guild', id: player.id });
  return { document: withValid(document, deps), ids: built.ids, player, quest, warrior, rogue, mage, healer };
}

function request(
  { ids, quest }: { ids: { playerGuild: Guild['id'] }; quest: Quest },
  heroIds: HeroId[],
  consumables: DispatchRequest['consumables'] = [],
): DispatchRequest {
  return { guildId: ids.playerGuild, questId: quest.id, heroIds, consumables };
}

function unchanged(document: WorldDocument, look: () => void): void {
  const before = serialise(document);
  const entries = document.history.entries.length;
  look();
  expect(serialise(document)).toBe(before);
  expect(document.history.entries).toHaveLength(entries);
}

describe('previewDispatch', () => {
  test('says each of the Quest\'s requirements, met or missed, as dispatch reads them', () => {
    const setting = proposal();
    const { world } = setting.document;

    const missing = previewDispatch(world, request(setting, [setting.healer]), deps);
    const meeting = previewDispatch(world, request(setting, [setting.rogue, setting.mage]), deps);

    expect(missing?.requirements).toEqual([
      { requirement: 'party-size', met: false, size: 1, partySizeMin: 2, partySizeMax: 3 },
      { requirement: 'class', met: false, classKey: 'mage' },
      { requirement: 'skill', met: false, skillKey: 'lockpicking' },
    ]);
    expect(meeting?.requirements.map((it) => it.met)).toEqual([true, true, true]);
  });

  test('lists only the requirements the Quest has: the Party size alone when it names no Class or Skill', () => {
    const setting = proposal();
    const world: World = structuredClone(setting.document.world);
    (world.quests[setting.quest.id] as Quest).requirements = { partySizeMin: 1, partySizeMax: 4 };

    const preview = previewDispatch(world, request(setting, [setting.rogue]), deps);

    expect(preview?.requirements).toEqual([{ requirement: 'party-size', met: true, size: 1, partySizeMin: 1, partySizeMax: 4 }]);
  });

  test('names each Hero who cannot go, by dispatch\'s own test, in the order named', () => {
    const setting = proposal();
    const { world } = setting.document;
    const stranger = setting.ids.rivalHero;
    const nobody = 'hero-999999' as HeroId;

    const preview = previewDispatch(world, request(setting, [setting.warrior, stranger, setting.ids.deadHero, nobody, setting.rogue]), deps);

    expect(preview?.problems.map(({ heroId, because }) => [heroId, because])).toEqual([
      [setting.warrior, 'in-party'],
      [stranger, 'not-on-roster'],
      [setting.ids.deadHero, 'dead'],
      [nobody, 'not-on-roster'],
    ]);
    expect(preview?.heroes.map((hero) => hero.id)).toEqual([setting.warrior, stranger, setting.ids.deadHero, setting.rogue]);
  });

  test('gives the Synergies the Party would have and on how many of the Quest\'s Encounters each applies', () => {
    const setting = proposal();
    const { world } = setting.document;
    const party = [setting.rogue, setting.mage, setting.healer];
    const heroes = party.map((id) => world.heroes[id] as Hero);

    const preview = previewDispatch(world, request(setting, party), deps);

    // A Rogue and a Mage: shadow-and-spell, on stealth and arcane Encounters, one of these three.
    expect(preview?.encounterKinds).toEqual(['combat', 'travel', 'stealth']);
    expect(preview?.synergies.map(({ synergy }) => synergy.key)).toEqual(synergiesFor(queryParty(heroes, world, deps), testContent).map((it) => it.key));
    expect(preview?.synergies.find(({ synergy }) => synergy.key === 'shadow-and-spell')?.encounters).toBe(1);
  });

  test("gives the Party's mean form as it sets out and what it does to the odds, for the Party, and none for no one (v1.1.4-S3)", () => {
    const setting = proposal();
    const { world } = setting.document;
    const party = [setting.rogue, setting.mage];
    const at = (morales: [number, number]) => {
      party.forEach((id, index) => ((world.heroes[id] as Hero).morale = morales[index] as number));
      return previewDispatch(world, request(setting, party), deps)?.form;
    };
    const { moraleCheckFactor: factor } = deps.config;

    expect(at([60, 60])).toEqual({ mean: 1, effect: 'none' });
    expect(at([95, 60])).toEqual({ mean: (factor.elated + 1) / 2, effect: 'raises' });
    expect(at([30, 60])).toEqual({ mean: (factor.low + 1) / 2, effect: 'lowers-a-little' });
    expect(at([10, 30])).toEqual({ mean: (factor.wretched + factor.low) / 2, effect: 'lowers-badly' });
    expect(previewDispatch(world, request(setting, []), deps)?.form).toBeNull();
  });

  test('gives the chance estimate for the Party carrying what it would carry, and none for no one or Encounters drawn on the way (v1.1.4-S6)', () => {
    const setting = proposal();
    const { world } = setting.document;
    const party = [setting.rogue, setting.mage];
    const heroes = party.map((id) => world.heroes[id] as Hero);
    const carried = [{ definitionKey: 'whetstone', quantity: 1 }];

    const preview = previewDispatch(world, request(setting, party, carried), deps);

    expect(preview?.chances).toEqual(estimateQuest(world, setting.quest, heroes, deps, carried));
    expect(preview?.chances?.encounters.map((it) => it.encounterKey)).toEqual(setting.quest.encounterKeys);
    expect(preview?.chances?.ifNoOneFalls).toBe(true);
    expect(previewDispatch(world, request(setting, []), deps)?.chances).toBeNull();
    setting.quest.encounterKeys = [];
    expect(previewDispatch(world, request(setting, party), deps)?.chances).toBeNull();
  });

  test('counts every Encounter for a Synergy of every kind, and none while a Quest\'s Encounters are drawn on the way', () => {
    const setting = proposal();
    const world: World = structuredClone(setting.document.world);
    const party = [setting.rogue, setting.mage, setting.healer];
    // A full company: a Warrior home and well, so all four Classes are in the Party.
    const warrior = world.heroes[setting.warrior];
    if (warrior === undefined) throw new Error('no Warrior');
    warrior.partyId = null;

    const drawn = previewDispatch(world, request(setting, [setting.warrior, ...party]), deps);
    (world.quests[setting.quest.id] as Quest).encounterKeys = [];
    const onTheWay = previewDispatch(world, request(setting, [setting.warrior, ...party]), deps);

    expect(drawn?.synergies.find(({ synergy }) => synergy.key === 'a-full-company')?.encounters).toBe(3);
    expect(onTheWay?.encounterKinds).toEqual([]);
    expect(onTheWay?.synergies.length).toBeGreaterThan(0);
    for (const { encounters } of onTheWay?.synergies ?? []) expect(encounters).toBeNull();
  });

  test('says what the Party would carry, how many the Guild holds and on how many Encounters, and what it could carry', () => {
    const setting = proposal();
    const { world } = setting.document;
    const consumables = [
      { definitionKey: 'whetstone', quantity: 1 },
      { definitionKey: 'healing-draught', quantity: 4 },
      { definitionKey: 'arming-sword', quantity: 1 },
    ];

    const preview = previewDispatch(world, request(setting, [setting.rogue, setting.mage], consumables), deps);

    expect(preview?.consumables.map(({ definitionKey, quantity, held, encounters, consumable }) => [definitionKey, quantity, held, encounters, consumable?.key])).toEqual([
      ['whetstone', 1, 2, 1, 'whetstone'],
      ['healing-draught', 4, 3, null, 'healing-draught'],
      ['arming-sword', 1, 0, null, undefined],
    ]);
    expect(preview?.held.map((stack) => [stack.definitionKey, stack.quantity])).toEqual([
      ['healing-draught', 3],
      ['whetstone', 2],
    ]);
  });

  test('gives the reward offered and the reward the Guildmaster would agree', () => {
    const setting = proposal();
    const { world } = setting.document;

    const preview = previewDispatch(world, request(setting, [setting.rogue, setting.mage]), deps);

    expect(preview?.offeredReward).toBe(setting.quest.reward);
    expect(preview?.agreedReward).toBe(negotiatedReward(setting.quest.reward, guildmasterOf(setting.player, world), deps.content, deps.config));
  });

  test("gives dispatch's own verdict, and changes nothing", () => {
    const setting = proposal();
    const { document } = setting;
    const cases: DispatchRequest[] = [
      request(setting, [setting.rogue, setting.mage]),
      request(setting, [setting.rogue, setting.mage], [{ definitionKey: 'whetstone', quantity: 2 }]),
      request(setting, [setting.healer]),
      request(setting, [setting.warrior, setting.mage]),
      request(setting, [setting.rogue, setting.mage], [{ definitionKey: 'whetstone', quantity: 3 }]),
      request(setting, [setting.rogue, setting.mage], [{ definitionKey: 'lockpicks', quantity: 1 }]),
    ];

    for (const asked of cases) {
      unchanged(document, () => {
        const preview = previewDispatch(document.world, asked, deps);
        expect(preview?.refusal).toEqual(dispatchRefusal(document.world, asked, deps));
      });
      const sent = applyAction(document, { kind: 'dispatch', ...asked }, deps);
      expect(dispatchRefusal(document.world, asked, deps)).toEqual(sent.ok ? null : sent.rejection);
    }
  });

  test('is null for a Quest not on the Board: nothing to preview', () => {
    const setting = proposal();
    const { world } = setting.document;

    expect(previewDispatch(world, { ...request(setting, [setting.rogue]), questId: setting.ids.takenQuest }, deps)).toBeNull();
    expect(previewDispatch(world, { ...request(setting, [setting.rogue]), questId: 'quest-999999' as Quest['id'] }, deps)).toBeNull();
  });

  test('throws on the programming errors dispatch throws on: a Guild not in the world, a Hero named twice', () => {
    const setting = proposal();
    const { world } = setting.document;

    expect(() => previewDispatch(world, { ...request(setting, [setting.rogue]), guildId: 'guild-999999' as Guild['id'] }, deps)).toThrow(RangeError);
    expect(() => previewDispatch(world, request(setting, [setting.rogue, setting.rogue]), deps)).toThrow(RangeError);
  });
});

describe('skillsThatHelp', () => {
  test("names each Skill the Quest's Encounters' Checks read, once, in the order it meets them (DL-70)", () => {
    const { quest } = proposal();

    // ambush-on-the-road: swordcraft, tactics; the-long-march: field-surgery, herbalism; past-the-watch: stealth, lockpicking.
    expect(skillsThatHelp(quest, testContent)).toEqual(['swordcraft', 'tactics', 'field-surgery', 'herbalism', 'stealth', 'lockpicking']);
    expect(skillsThatHelp({ ...quest, encounterKeys: ['ambush-on-the-road', 'hold-the-line'] }, testContent)).toEqual([
      'swordcraft',
      'tactics',
      'shieldwork',
    ]);
  });

  test("gives a Quest drawn before M4 its own Skills, and leaves out a key content lacks (rule 5)", () => {
    const { quest } = proposal();

    expect(skillsThatHelp({ ...quest, encounterKeys: [], skillKeys: ['swordcraft', 'no-such-skill'] }, testContent)).toEqual(['swordcraft']);
    expect(skillsThatHelp({ ...quest, encounterKeys: ['no-such-encounter', 'the-flooded-ford'] }, testContent)).toEqual(['tactics']);
  });
});

// v1.1.4-S6 (DL-148 item 16): the Stats the Party builder shows, in place of the template's demands.
describe('statsRead', () => {
  test("names each Hero Stat the Quest's Encounters' Checks read, once, in the order it meets them", () => {
    const { quest } = proposal();

    // ambush-on-the-road: weaponry, strength; the-long-march: endurance, constitution; past-the-watch: stealth's Stats.
    const read = statsRead(quest, testContent);
    expect(read.slice(0, 4)).toEqual(['weaponry', 'strength', 'endurance', 'constitution']);
    expect(new Set(read).size).toBe(read.length);
    expect(statsRead({ encounterKeys: ['ambush-on-the-road', 'hold-the-line'] }, testContent)).toEqual(['weaponry', 'strength', 'constitution']);
  });

  test('reads a Stat wherever a score names it, and leaves out a key content lacks (rule 5) and Encounters drawn on the way', () => {
    const score: NumQuery = ['of', ['best', ['where', 'party', ['>=', ['stat', 'wits'], 5]], ['stat', 'perception']], ['+', ['stat', 'strength'], ['stat', 'no-such-stat']]];
    const odd: Encounter = { key: 'odd', name: 'Odd', kind: 'travel', checks: [{ key: 'odd', name: 'Odd', score, skills: [], difficultyFactor: 0.2 }], consequences: { success: [], failure: [] } };
    const encounters = { ...testContent.encounters, odd };

    expect(statsRead({ encounterKeys: ['no-such-encounter', 'odd'] }, { ...testContent, encounters })).toEqual(['wits', 'perception', 'strength']);
    expect(statsRead({ encounterKeys: [] }, testContent)).toEqual([]);
  });
});
