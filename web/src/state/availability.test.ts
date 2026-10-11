// @vitest-environment node
import { advance, defaultConfig, playerGuild, type Hero, type PartyId, type QuestId, type World, type WorldDocument } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { availabilityOf } from './availability';
import { newDocument } from './game.test-support';

// Whether a Hero can go, and where they are (DL-186 item 2): the one reading the Roster,
// a Hero's page and the Party builder share.

const deps = { config: defaultConfig, content };
function firstHero(document: WorldDocument): Hero {
  const guild = playerGuild(document.world);
  const hero = guild === undefined ? undefined : document.world.heroes[guild.rosterIds[0] as Hero['id']];
  if (hero === undefined) throw new Error('no Hero');
  return hero;
}

function withParty(world: World, hero: Hero, returnsOnTurn: number): void {
  const id = 'party-000009' as PartyId;
  hero.partyId = id;
  world.parties[id] = { id, questId: 'quest-000001' as QuestId, guildId: hero.guildId as never, heroIds: [hero.id], departedOnTurn: 0, returnsOnTurn };
}

describe('whether a Hero can be injured and in a Party at once', () => {
  // The Heroes found both are gathered, not each read by an expect, which cost as much as the play (DL-164).
  test('never, in any Hero of any Guild on any of 180 Turns played: an Injury is dealt as the Party comes home, and a module refuses a Hero away', () => {
    let injured = 0;
    let away = 0;
    const both: string[] = [];
    // Games of 180 Turns from availability-both, availability-both-1, …, until Heroes were both injured
    // and away in them, so that the test is not vacuous whatever the content (DL-272).
    for (let at = 0; at < 10 && (injured === 0 || away === 0); at += 1) {
      let document = newDocument(at === 0 ? 'availability-both' : `availability-both-${at}`);
      for (let turn = 0; turn < 180; turn += 1) {
        document = advance(document, deps).document;
        for (const hero of Object.values(document.world.heroes)) {
          if (hero.injury !== null) injured += 1;
          if (hero.partyId !== null) away += 1;
          if (hero.injury !== null && hero.partyId !== null) both.push(`${hero.id} of ${document.meta.seed} on Turn ${document.world.turn}`);
        }
      }
    }
    expect(both).toEqual([]);
    // The test is not vacuous: Heroes were injured and were away.
    expect(injured).toBeGreaterThan(0);
    expect(away).toBeGreaterThan(0);
  });

  test('if a world were to hold both, the engine reads the Injury first, and so does the page', () => {
    const document = newDocument('availability');
    const hero = firstHero(document);
    hero.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    withParty(document.world, hero, 14);

    expect(availabilityOf(hero, document.world, document.meta.config)).toMatchObject({ why: 'injured', until: 'Injured, healing on the night of Year 1 Day 7', freeOnTurn: 20 });
  });
});

describe('availabilityOf', () => {
  test('a Hero at the Hall can go: free now, nothing to say but where they are', () => {
    const document = newDocument('availability');
    expect(availabilityOf(firstHero(document), document.world, document.meta.config)).toEqual({
      why: null,
      freeOnTurn: -Infinity,
      where: 'At the Hall',
      until: null,
      chip: null,
    });
  });

  test('an injured Hero is free when the Injury heals', () => {
    const document = newDocument('availability');
    const hero = firstHero(document);
    hero.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    expect(availabilityOf(hero, document.world, document.meta.config)).toEqual({
      why: 'injured',
      freeOnTurn: 20,
      where: 'Injured, healing on the night of Year 1 Day 7',
      until: 'Injured, healing on the night of Year 1 Day 7',
      chip: 'Injured',
    });
  });

  test("a Hero away is free when their Party returns", () => {
    const document = newDocument('availability');
    const hero = firstHero(document);
    withParty(document.world, hero, 14);
    expect(availabilityOf(hero, document.world, document.meta.config)).toEqual({
      why: 'in-party',
      freeOnTurn: 14,
      where: 'Away with a Party, back on the night of Year 1 Day 5',
      until: 'Away with a Party, back on the night of Year 1 Day 5',
      chip: 'Away',
    });
  });

  test('a Hero whose Party the world no longer holds is Away with no Day to read, who sorts last', () => {
    const document = newDocument('availability');
    const hero = firstHero(document);
    hero.partyId = 'party-000777' as PartyId;
    expect(availabilityOf(hero, document.world, document.meta.config)).toEqual({
      why: 'in-party',
      freeOnTurn: null,
      where: 'Away with a Party',
      until: 'Away with a Party',
      chip: 'Away',
    });
  });

  test.each([
    ['dead', { diedOnTurn: 30 }, 'Died on Year 1 Day 11', 'Dead'],
    ['retired', { retiredOnTurn: 30 }, 'Retired on Year 1 Day 11', 'Retired'],
  ] as const)('a %s Hero cannot go and has no Day to be free', (why, change, words, chip) => {
    const document = newDocument('availability');
    const hero = Object.assign(firstHero(document), change);
    expect(availabilityOf(hero, document.world, document.meta.config)).toEqual({ why, freeOnTurn: null, where: words, until: words, chip });
    // On no Roster, they say so first, as the Roster's words always did (DL-200).
    Object.assign(hero, { guildId: null, unattachedSince: 12 });
    expect(availabilityOf(hero, document.world, document.meta.config)).toEqual({ why, freeOnTurn: null, where: words, until: words, chip });
  });

  test('a Hero on no Roster is at no Hall, and can go if nothing else stops them', () => {
    const document = newDocument('availability');
    const hero = firstHero(document);
    hero.guildId = null;
    hero.unattachedSince = 12;
    expect(availabilityOf(hero, document.world, document.meta.config)).toMatchObject({ why: null, where: 'In the Unattached pool', until: null, chip: null });
    hero.unattachedSince = null;
    expect(availabilityOf(hero, document.world, document.meta.config).where).toBe('On no Roster');
  });
});
