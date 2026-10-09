import { describe, expect, test } from 'vitest';
import type { Hero } from './document.js';
import { eventEmitter } from './emit.js';
import { changeMorale } from './morale.js';
import { buildDocument, testDeps } from './world.test-support.js';

// `changeMorale`, the writer of a discrete change of Morale (DL-29). DL-112 item 2:
// a change a Quest's return causes names the Quest; any other names none.

describe('changeMorale', () => {
  const { config } = testDeps();

  function scene() {
    const { document, ids } = buildDocument({ rosterSize: 3 });
    const hero = document.world.heroes[ids.partyHero] as Hero;
    hero.morale = 50;
    return { world: document.world, hero, questId: ids.takenQuest, emit: eventEmitter(document.world) };
  }

  test('a change a Quest caused carries its questId, and the Quest is a participant', () => {
    for (const cause of ['encounters', 'strong-success', 'roster-death'] as const) {
      const { hero, questId, emit } = scene();

      const event = changeMorale(hero, 5, cause, config, emit, questId);

      expect(event.payload).toMatchObject({ heroId: hero.id, cause, questId, before: 50, after: 55 });
      expect(event.participants).toEqual([hero.id, questId, hero.guildId]);
    }
  });

  test('a change nothing named a Quest for carries no questId, and names the Hero and their Guild', () => {
    const { hero, emit } = scene();

    const event = changeMorale(hero, -5, 'module', config, emit);

    expect(event.payload).not.toHaveProperty('questId');
    expect(event.participants).toEqual([hero.id, hero.guildId]);
  });
});
