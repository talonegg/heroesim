// @vitest-environment node
import { createWorld, defaultConfig, guildmasterOf, playerGuild, type Guild, type Hero, type WorldDocument } from '@heroesim/engine';
import { heroReading } from '@heroesim/words';
import { describe, expect, test, vi } from 'vitest';
import { content } from '../content';
import { readingOf } from './reading';
import { headerView, heroPage } from './selectors';

// The player's reading on the page (DL-241): derived once a document, the config checked once a
// config, and given its own content or config by a test.

// The engine's config check, counted.
const checked = vi.hoisted(() => ({ times: 0 }));
vi.mock('@heroesim/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@heroesim/engine')>();
  return {
    ...real,
    playDeps: (...args: Parameters<typeof real.playDeps>): ReturnType<typeof real.playDeps> => {
      checked.times += 1;
      return real.playDeps(...args);
    },
  };
});

const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' };

function newGame(seed = 'reading'): WorldDocument {
  return structuredClone(createWorld(seed, setup, { config: defaultConfig, content }).document);
}

describe("the player's reading", () => {
  test("reads the document through the player's Guild and Guildmaster, under the rules it plays under and the page's content", () => {
    const document = newGame();
    const reading = readingOf(document);
    const guild = playerGuild(document.world) as Guild;

    expect(reading.guild).toBe(guild);
    expect(reading.guildmaster).toBe(guildmasterOf(guild, document.world));
    expect(reading.content).toBe(content);
    expect(reading.calendar.turnsPerYear).toBe(defaultConfig.turnsPerYear);
    expect(reading.narration).toMatchObject({ content, calendar: reading.calendar });
  });

  test('is derived once a document, and its config checked once a config, however many selectors read it', () => {
    const document = newGame('reading-once');
    checked.times = 0;

    const reading = readingOf(document);
    headerView(document);
    for (const heroId of Object.keys(document.world.heroes)) heroPage(document, heroId as Hero['id']);

    expect(readingOf(document)).toBe(reading);
    expect(checked.times).toBe(1);
    // The next document of the same rules reads its own world, and checks no config again.
    const next: WorldDocument = { ...document, world: structuredClone(document.world) };
    expect(readingOf(next)).not.toBe(reading);
    expect(checked.times).toBe(1);
  });

  test('is read afresh for a document given other rules or another world', () => {
    const document = newGame('reading-afresh');
    const before = readingOf(document);

    document.meta.config = { ...document.meta.config, turnsPerYear: 21 };
    const ruled = readingOf(document);
    expect(ruled).not.toBe(before);
    expect(ruled.calendar.turnsPerYear).toBe(21);

    document.world = structuredClone(document.world);
    expect(readingOf(document)).not.toBe(ruled);
  });

  test("takes a test's own content or config, and keeps neither as the document's own", () => {
    const document = newGame('reading-given');
    const hero = document.world.heroes[(playerGuild(document.world) as Guild).rosterIds[0] as Hero['id']] as Hero;
    const own = readingOf(document);
    const renamed = { ...content, classes: { ...content.classes, [hero.classKey]: { ...content.classes[hero.classKey], name: 'Hedge knight' } } } as typeof content;

    const given = readingOf(document, { content: renamed, config: { ...defaultConfig, turnsPerYear: 3 } });

    expect(given.content).toBe(renamed);
    expect(given.calendar.turnsPerYear).toBe(3);
    expect(heroReading(given, hero).className).toBe('Hedge knight');
    expect(readingOf(document)).toBe(own);
    expect(heroReading(own, hero).className).toBe(content.classes[hero.classKey]?.name);
  });
});
