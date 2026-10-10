// @vitest-environment node
import { configVersion, defaultConfig, deserialise, serialise } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { newDocument } from './game.test-support';
import { rulesNotice, saveFileName, saveText } from './game-file';

// The game as a file, the CLI's `save --as` and `load` (DL-73), and the notice of
// new rules (pre-M0 review D1).

const deps = { config: defaultConfig, content };

describe('saveText', () => {
  test("is the engine's canonical serialisation, which loads back as the same game", () => {
    const document = newDocument('game-file');

    const text = saveText(document);

    expect(text).toBe(serialise(document));
    const loaded = deserialise(text, deps);
    expect(loaded.ok && serialise(loaded.document)).toBe(text);
  });
});

describe('saveFileName', () => {
  test('names the seed and the date, in characters any file system takes (DL-210)', () => {
    const document = structuredClone(newDocument('amber fox/4821'));
    document.world.turn = 31;
    expect(saveFileName(document)).toBe('heroesim-amber-fox-4821-year-1-day-11.json');
  });
});

describe('rulesNotice', () => {
  test("names the game's rules and this release's while the game's are behind, and nothing once they are not", () => {
    const current = newDocument('game-file');
    const older = structuredClone(current);
    older.meta.configVersion = configVersion - 3;

    expect(rulesNotice(current)).toBeNull();
    expect(rulesNotice(older)).toEqual({ from: configVersion - 3, to: configVersion });
  });
});
