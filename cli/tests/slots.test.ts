/**
 * Slots on disk (E7-S4, DL-02): the slot file's shape, a write that cannot leave half a
 * document behind, a listing that reads each slot's header without deserialising the
 * Career, a load that refuses anything it cannot trust, and a delete.
 *
 * Most of what is asserted here was asserted in `cli/tests/saves.test.ts` before the
 * restructure; it moved with the code it covers.
 */

import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  advance,
  newCareer,
  SaveError,
  serialiseCareer,
  yearOf,
  type Career,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import {
  checkSlotName,
  deleteSlot,
  deleteSlotForCareer,
  headerFor,
  listSlots,
  loadSlot,
  saveSlot,
  slotPath,
  AUTOSAVE_SLOT,
  NAMED_SLOTS,
  SLOT_FORMAT_VERSION,
  type SlotFile,
} from '../src/slots.js';

const content = loadContentFromDisk();
const career: Career = newCareer('saves', content).career;
const other: Career = newCareer('saves-elsewhere', content).career;
const SAVED_ON = '2026-09-20T09:00:00.000Z';

const root = mkdtempSync(join(tmpdir(), 'heroesim-slots-'));
let dir = root;
let run = 0;

beforeEach(() => {
  run += 1;
  dir = join(root, `run-${run}`);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The slot file as it is on disk. */
function fileIn(directory: string, name: string): SlotFile {
  return JSON.parse(readFileSync(slotPath(directory, name), 'utf8')) as SlotFile;
}

describe('the slot file', () => {
  it('wraps the exact string the engine serialised, and never re-encodes it', () => {
    saveSlot(dir, 'one', career, ['an entry'], SAVED_ON);
    const file = fileIn(dir, 'one');
    expect(file.career).toBe(serialiseCareer(career));
    expect(file.formatVersion).toBe(SLOT_FORMAT_VERSION);
    expect(file.savedOn).toBe(SAVED_ON);
    expect(file.history).toEqual(['an entry']);
  });

  it('carries a header the picker can read without deserialising the Career', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    expect(fileIn(dir, 'one').header).toEqual({
      guildName: career.guild.name,
      day: career.day,
      year: yearOf(career.day, career.config),
      rosterSize: career.guild.roster.length,
      seed: career.seed,
      ended: false,
    });
  });

  it('writes a header that agrees with the Career it wraps, for a played Career too', () => {
    const played = advance(career, 90, content).career;
    saveSlot(dir, 'one', played, [], SAVED_ON);
    expect(fileIn(dir, 'one').header).toEqual(headerFor(played));
    expect(headerFor(played).day).toBe(played.day);
  });

  it('takes the clock as an argument, so a save is deterministic in a test', () => {
    saveSlot(dir, 'one', career, [], '1999-01-01T00:00:00.000Z');
    expect(fileIn(dir, 'one').savedOn).toBe('1999-01-01T00:00:00.000Z');
  });
});

describe('saving', () => {
  it('creates the Career directory and writes the slot', () => {
    const path = saveSlot(dir, 'one', career, [], SAVED_ON);
    expect(path).toBe(slotPath(dir, 'one'));
    expect(readdirSync(dir)).toEqual(['one.json']);
  });

  it('writes atomically: nothing half-written is left beside the slot', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    saveSlot(dir, 'one', career, [], SAVED_ON);
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('renames over an existing slot, which is the whole of the atomic write on Windows', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    saveSlot(dir, 'one', other, [], SAVED_ON);
    expect(loadSlot(dir, 'one', content).career.seed).toBe(other.seed);
    expect(readdirSync(dir)).toEqual(['one.json']);
  });

  it('writes over a stale temporary file from a killed write rather than appending to it', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${slotPath(dir, 'one')}.tmp`, '{"half":', 'utf8');
    saveSlot(dir, 'one', career, [], SAVED_ON);
    expect(loadSlot(dir, 'one', content).career.seed).toBe(career.seed);
    expect(readdirSync(dir)).toEqual(['one.json']);
  });

  it('refuses a slot name that could walk out of the directory', () => {
    expect(() => saveSlot(dir, '../escape', career, [], SAVED_ON)).toThrow(SaveError);
    expect(() => saveSlot(dir, 'a/b', career, [], SAVED_ON)).toThrow(SaveError);
    expect(() => checkSlotName('')).toThrow(SaveError);
    expect(checkSlotName('auto_save-1.a')).toBe('auto_save-1.a');
  });
});

describe('loading', () => {
  it('gives back exactly the Career that was saved, and the history beside it', () => {
    saveSlot(dir, 'one', career, ['one thing'], SAVED_ON);
    const loaded = loadSlot(dir, 'one', content);
    expect(loaded.career).toEqual(career);
    expect(loaded.history).toEqual(['one thing']);
  });

  it('refuses a slot that is not there', () => {
    expect(() => loadSlot(dir, 'nothing', content)).toThrow(SaveError);
    expect(() => loadSlot(dir, 'nothing', content)).toThrow(/nothing saved in slot "nothing"/);
  });

  it('refuses a slot format it does not read, naming both versions, and changes nothing', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    const raw = fileIn(dir, 'one') as unknown as Record<string, unknown>;
    raw['formatVersion'] = 2;
    writeFileSync(slotPath(dir, 'one'), JSON.stringify(raw), 'utf8');
    const before = readFileSync(slotPath(dir, 'one'), 'utf8');

    expect(() => loadSlot(dir, 'one', content)).toThrow(SaveError);
    expect(() => loadSlot(dir, 'one', content)).toThrow(/saved in slot format 2/);
    expect(() => loadSlot(dir, 'one', content)).toThrow(/reads format 1/);
    expect(() => loadSlot(dir, 'one', content)).toThrow(/has not been changed/);
    expect(readFileSync(slotPath(dir, 'one'), 'utf8')).toBe(before);
  });

  it('refuses a save whose Career is written by another engine format version', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    const file = fileIn(dir, 'one');
    const inner = JSON.parse(file.career) as Record<string, unknown>;
    inner['formatVersion'] = 2;
    writeFileSync(
      slotPath(dir, 'one'),
      JSON.stringify({ ...file, career: JSON.stringify(inner) }),
      'utf8',
    );
    expect(() => loadSlot(dir, 'one', content)).toThrow(/format version 2/);
  });

  it('refuses a save that is not JSON at all', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    writeFileSync(slotPath(dir, 'one'), 'not a save', 'utf8');
    expect(() => loadSlot(dir, 'one', content)).toThrow(SaveError);
  });

  it('refuses a save that is missing part of the world', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    const file = fileIn(dir, 'one');
    const inner = JSON.parse(file.career) as Record<string, unknown>;
    delete inner['guild'];
    writeFileSync(
      slotPath(dir, 'one'),
      JSON.stringify({ ...file, career: JSON.stringify(inner) }),
      'utf8',
    );
    expect(() => loadSlot(dir, 'one', content)).toThrow(SaveError);
  });

  /**
   * Every save E1 to E6 wrote is a bare `serialiseCareer` string with no wrapper, and
   * "Saves from E6 load unchanged" is one of E7's own definition-of-done items, so they
   * are read rather than refused (DL-25 §10). Nothing on disk is rewritten by reading it.
   */
  describe('a save written before E7 wrapped one', () => {
    it('loads, with an empty history', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(slotPath(dir, 'old'), serialiseCareer(career), 'utf8');
      const loaded = loadSlot(dir, 'old', content);
      expect(loaded.career).toEqual(career);
      expect(loaded.history).toEqual([]);
    });

    it('is listed with its Guild, Day, Year and Roster size all the same', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(slotPath(dir, 'old'), serialiseCareer(career), 'utf8');
      const [summary] = listSlots(dir);
      expect(summary?.header).toEqual(headerFor(career));
    });

    it('is left exactly as it was by reading it', () => {
      mkdirSync(dir, { recursive: true });
      const text = serialiseCareer(career);
      writeFileSync(slotPath(dir, 'old'), text, 'utf8');
      loadSlot(dir, 'old', content);
      expect(readFileSync(slotPath(dir, 'old'), 'utf8')).toBe(text);
    });

    /**
     * DL-22 §7: `deserialiseCareer` takes the content so that a Rival written before
     * Rivals had people is given the Roster a Career on that seed would have had. Dropping
     * the argument loads those Rivals **empty**, and every selector then answers for that
     * empty world until the first `advance` — which no test noticed, because every save a
     * test loaded was a modern one where the argument makes no difference.
     */
    it('is handed the content, so a Rival written before Rivals had people is not empty', () => {
      mkdirSync(dir, { recursive: true });
      const beforeRivals = JSON.parse(serialiseCareer(career)) as Career & {
        nextRivalHeroNumber: number;
      };
      beforeRivals.rivals = beforeRivals.rivals.map((rival) => ({ ...rival, roster: [] }));
      beforeRivals.nextRivalHeroNumber = 1;
      writeFileSync(slotPath(dir, 'pre-e5'), JSON.stringify(beforeRivals, null, 2), 'utf8');

      const loaded = loadSlot(dir, 'pre-e5', content);
      expect(loaded.career.rivals.length).toBeGreaterThan(0);
      for (const rival of loaded.career.rivals) {
        expect(rival.roster.length, `${rival.name} came back with nobody`).toBeGreaterThan(0);
      }
    });
  });

  /**
   * E7-S4: "The slot picker reads each slot's header without deserialising the whole
   * Career". Nothing proved the negative half of that, so a picker that did deserialise
   * passed. A slot whose header is perfectly good and whose Career is nonsense settles it:
   * a picker that reads only the header lists it, and only the load refuses.
   */
  describe('a slot whose header is good and whose Career is nonsense', () => {
    const broken = (): void => {
      mkdirSync(dir, { recursive: true });
      const file: SlotFile = {
        formatVersion: SLOT_FORMAT_VERSION,
        savedOn: SAVED_ON,
        header: headerFor(career),
        career: '{"not":"a Career at all"}',
        history: [],
      };
      writeFileSync(slotPath(dir, 'rotten'), JSON.stringify(file, null, 2), 'utf8');
    };

    it('is listed from its header alone, because the picker never opens the Career', () => {
      broken();
      const [summary] = listSlots(dir);
      expect(summary?.name).toBe('rotten');
      expect(summary?.header).toEqual(headerFor(career));
      expect(summary?.problem).toBeUndefined();
    });

    it('refuses to load it, in a sentence naming the slot', () => {
      broken();
      expect(() => loadSlot(dir, 'rotten', content)).toThrow(SaveError);
      try {
        loadSlot(dir, 'rotten', content);
      } catch (error) {
        const said = (error as Error).message;
        expect(said).toContain('rotten');
        // A sentence, never a stack trace: no file path, no frame, no "at ".
        expect(said).not.toContain('\n');
        expect(said).not.toMatch(/\bat [A-Za-z]+ \(/);
        expect(said.length).toBeGreaterThan(20);
      }
    });
  });
});

describe('listing', () => {
  it('finds nothing in a directory that does not exist', () => {
    expect(listSlots(join(dir, 'never-made'))).toEqual([]);
  });

  it('reports each slot with the Guild, the Day, the Year and the Roster size', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    saveSlot(dir, AUTOSAVE_SLOT, other, [], SAVED_ON);
    const slots = listSlots(dir);
    expect(slots.map((slot) => slot.name)).toEqual([AUTOSAVE_SLOT, 'one']);
    expect(slots.find((slot) => slot.name === 'one')?.header).toEqual(headerFor(career));
    expect(slots.find((slot) => slot.name === 'one')?.savedOn).toBe(SAVED_ON);
  });

  it('says a Career has ended before it is opened', () => {
    const ended = advance(newCareer('slots-ended', content, { careerYears: 1 }).career, 5000, content)
      .career;
    expect(ended.ended).toBeDefined();
    saveSlot(dir, 'one', ended, [], SAVED_ON);
    expect(listSlots(dir)[0]?.header?.ended).toBe(true);
  });

  it('reports a file it cannot read rather than refusing to list at all', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    writeFileSync(slotPath(dir, 'broken'), '{ not json', 'utf8');
    const slots = listSlots(dir);
    expect(slots.map((slot) => slot.name)).toEqual(['broken', 'one']);
    expect(slots.find((slot) => slot.name === 'broken')?.problem).toBeDefined();
  });

  it('reports a slot format it does not read, rather than pretending to know what is in it', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    const raw = fileIn(dir, 'one') as unknown as Record<string, unknown>;
    raw['formatVersion'] = 9;
    writeFileSync(slotPath(dir, 'one'), JSON.stringify(raw), 'utf8');
    const [summary] = listSlots(dir);
    expect(summary?.header).toBeUndefined();
    expect(summary?.problem).toContain('slot format 9');
  });

  it('ignores anything that is not a slot, a temporary file included', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    writeFileSync(join(dir, 'notes.txt'), 'hello', 'utf8');
    writeFileSync(`${slotPath(dir, 'two')}.tmp`, 'half a document', 'utf8');
    expect(listSlots(dir).map((slot) => slot.name)).toEqual(['one']);
  });

  it('offers three named slots beside the autosave', () => {
    expect(NAMED_SLOTS).toEqual(['one', 'two', 'three']);
    expect(NAMED_SLOTS).not.toContain(AUTOSAVE_SLOT);
  });
});

describe('deleting', () => {
  it('says whether there was anything to delete', () => {
    saveSlot(dir, 'one', career, [], SAVED_ON);
    expect(deleteSlot(dir, 'one')).toBe(true);
    expect(deleteSlot(dir, 'one')).toBe(false);
    expect(listSlots(dir)).toEqual([]);
  });

  it('clears the autosave when the Career it holds is the one that ended', () => {
    saveSlot(dir, AUTOSAVE_SLOT, career, [], SAVED_ON);
    expect(deleteSlotForCareer(dir, AUTOSAVE_SLOT, career)).toBe(true);
    expect(listSlots(dir)).toEqual([]);
  });

  it('leaves another Career’s autosave alone', () => {
    saveSlot(dir, AUTOSAVE_SLOT, other, [], SAVED_ON);
    expect(deleteSlotForCareer(dir, AUTOSAVE_SLOT, career)).toBe(false);
    expect(listSlots(dir).map((slot) => slot.name)).toEqual([AUTOSAVE_SLOT]);
  });

  it('is content when there is no autosave to clear', () => {
    expect(deleteSlotForCareer(dir, AUTOSAVE_SLOT, career)).toBe(false);
  });
});

/**
 * E7-S4's own acceptance box: an interrupted write never leaves a corrupt slot. A child
 * process is killed **while it is writing**, and the slot beside it is then reloaded.
 *
 * On Windows `child.kill()` terminates the process outright, which is exactly the worst
 * case this is about: nothing gets to tidy up, the temporary file is left half written,
 * and the slot must still be the good one.
 */
describe('a write killed half way', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));

  it('leaves the slot that was already there intact, and the next save repairs the rest', () => {
    mkdirSync(dir, { recursive: true });
    saveSlot(dir, 'one', career, ['the good one'], SAVED_ON);
    const good = readFileSync(slotPath(dir, 'one'), 'utf8');

    // A child that opens the very temporary file a save writes to, puts half a document
    // in it, and then waits to be killed.
    const driver = join(dir, 'half-write.mjs');
    writeFileSync(
      driver,
      [
        "import { openSync, writeSync, fsyncSync } from 'node:fs';",
        `const handle = openSync(${JSON.stringify(`${slotPath(dir, 'one')}.tmp`)}, 'w');`,
        `writeSync(handle, ${JSON.stringify(good.slice(0, 200))});`,
        'fsyncSync(handle);',
        "process.stdout.write('ready\\n');",
        'setInterval(() => {}, 1000);',
      ].join('\n'),
      'utf8',
    );
    const killed = spawnSync(process.execPath, [driver], { encoding: 'utf8', timeout: 5000 });
    // The child never exits on its own; the timeout kills it mid-write, which is the
    // interruption this is about.
    expect(killed.signal ?? killed.status).toBeDefined();

    // The slot itself is untouched and still loads.
    expect(readFileSync(slotPath(dir, 'one'), 'utf8')).toBe(good);
    expect(loadSlot(dir, 'one', content).career.seed).toBe(career.seed);
    expect(loadSlot(dir, 'one', content).history).toEqual(['the good one']);

    // The half-written temporary file is not a slot, and the next save writes over it.
    expect(listSlots(dir).map((slot) => slot.name)).toEqual(['one']);
    saveSlot(dir, 'one', other, [], SAVED_ON);
    expect(loadSlot(dir, 'one', content).career.seed).toBe(other.seed);
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  }, 20_000);

  it('finds the directory it writes its driver into', () => {
    expect(here.length).toBeGreaterThan(0);
  });
});
