// @vitest-environment node
import { createWorld, defaultConfig, playerGuild, unattachedHeroes, type Hero, type WorldDocument } from '@heroesim/engine';
import { describe, expect, test, vi } from 'vitest';
import { content } from '../content';
import { defaultHeroOrder, orderWords, reverseOrderName } from './selectors';
import { poolView } from './trade-views';

// The page's lists by Class read the declared order (`class-order.json`, DL-186 item 24),
// not the order of `classes.json`' keys: here the page's content set lists its Classes backwards, and
// declares an order of its own, which the sort and its words both read, from the one content set
// (DL-205).
vi.mock('../content', async (importOriginal) => {
  const real = await importOriginal<typeof import('../content')>();
  return {
    ...real,
    content: { ...real.content, classes: Object.fromEntries(Object.entries(real.content.classes).reverse()), classOrder: ['mage', 'healer', 'warrior', 'rogue'] },
  };
});

const declared = ['Mage', 'Healer', 'Warrior', 'Rogue'];
const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' };

function newGame(): WorldDocument {
  return createWorld('class-order', setup, { config: defaultConfig, content }).document;
}

/** The Classes in the order `names` first shows them. */
function classesIn(names: readonly string[]): string[] {
  return [...new Set(names)];
}

describe("the page's Class order with classes.json's keys reversed and an order of its own declared", () => {
  test('is the declared order, Mage, Healer, Warrior, Rogue: the default Hero order, the Unattached pool and the sort button', () => {
    expect(Object.values(content.classes).map((each) => each.name)).toEqual(['Healer', 'Mage', 'Rogue', 'Warrior']);

    const document = newGame();
    const heroes = [...(playerGuild(document.world)?.rosterIds ?? []), ...unattachedHeroes(document.world).map((hero) => hero.id)].map(
      (heroId) => document.world.heroes[heroId] as Hero,
    );
    heroes.forEach((hero, index) => (hero.classKey = ['healer', 'mage', 'rogue', 'warrior'][index % 4] as string));
    const sorted = [...heroes].sort(defaultHeroOrder(document)).map((hero) => content.classes[hero.classKey]?.name ?? '');
    expect(classesIn(sorted)).toEqual(declared);

    expect(classesIn(poolView(document, 'class').rows.map((row) => row.className))).toEqual(declared);
    expect([orderWords('class', 'ascending'), orderWords('class', 'descending')]).toEqual(['Mage first', 'Rogue first']);
    expect(reverseOrderName('class', 'descending')).toBe('Reverse the order, now Rogue first');
  });
});
