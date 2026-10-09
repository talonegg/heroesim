import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { calibrationAt } from './quest-review.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'heroesim-quest-review-'));
  dirs.push(dir);
  return dir;
}

describe('the review page reads the calibration', () => {
  test("names the run that writes the drafts' calibration without touching the kept report, when there is none", () => {
    const path = join(scratch(), 'calibration.json');
    expect(() => calibrationAt(path)).toThrow(`No ${path}`);
    expect(() => calibrationAt(path)).toThrow(/HEROESIM_DRAFTS=docs\/quests\/drafts HEROESIM_CALIBRATION_OUT=<folder> npm run harness -- calibrate/);
    expect(() => calibrationAt(path)).toThrow(/rewrites docs\/quests\/calibration\.md, the record DL-218 keeps/);
  });

  test('reads one that is there', () => {
    const path = join(scratch(), 'calibration.json');
    writeFileSync(path, '{"encounters":[]}\n');
    expect(calibrationAt(path)).toEqual({ encounters: [] });
  });
});
