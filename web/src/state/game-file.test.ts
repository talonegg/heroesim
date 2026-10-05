import { configVersion, createWorld, dayOf, defaultConfig, deserialise, serialise, type WorldDocument } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { rulesNotice, saveFileName, saveText } from './game-file';

// The game as a file, the CLI's `save --as` and `load` (M7-S3 part 2, DL-73), and the notice of
// new rules (pre-M0 review D1).

const deps = { config: defaultConfig, content };

function newGame(seed = 'game-file'): WorldDocument {
  return createWorld(seed, { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' }, deps).document;
}

describe('saveText', () => {
  test("is the engine's canonical serialisation, which loads back as the same game", () => {
    const document = newGame();

    const text = saveText(document);

    expect(text).toBe(serialise(document));
    const loaded = deserialise(text, deps);
    expect(loaded.ok && serialise(loaded.document)).toBe(text);
  });
});

describe('saveFileName', () => {
  test('names the seed and the Day, in characters any file system takes', () => {
    const document = structuredClone(newGame('amber fox/4821'));
    document.world.turn = 31;

    expect(saveFileName(document)).toBe(`heroesim-amber-fox-4821-day-${dayOf(31)}.json`);
  });
});

describe('rulesNotice', () => {
  test("names the game's rules and this release's while the game's are behind, and nothing once they are not", () => {
    const current = newGame();
    const older = structuredClone(current);
    older.meta.configVersion = configVersion - 3;

    expect(rulesNotice(current)).toBeNull();
    expect(rulesNotice(older)).toEqual({ from: configVersion - 3, to: configVersion });
  });
});
