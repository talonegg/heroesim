/**
 * E4-S1: Standing, and what it gates. It is derived from Patron Regard alone, nothing
 * stores it, nothing writes to it, and the one thing it buys is the calibre an Applicant
 * may be drawn at. *Regard gets you work; Standing gets you people* (CONTEXT · Standing).
 *
 * The other half of that promise — that no Commission, fee or Board decision reads it
 * anywhere in the engine — is a static scan over `engine/src`, and lives in
 * `content/tests/e4-standing-callsites.test.ts` because ESLint forbids `fs` under
 * `engine/` including its tests (DL-19 §11).
 */

import { describe, expect, it } from 'vitest';
import { advance, standing } from '../src/career.js';
import { maxCalibre } from '../src/applicant.js';
import { defaultConfig } from '../src/config.js';
import { serialiseCareer } from '../src/save.js';
import type { Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { deepFreeze, fixtureContent, patronsThinking, walkedOut } from './fixtures.js';

const content = fixtureContent;

/** Standing worked out from the Regard on the page, independently of the engine. */
function standingByHand(career: Career): number {
  const values = career.patrons.map((patron) => patron.regardForGuild.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * career.config.standingScale);
}

describe('Standing', () => {
  const opened = newCareer('standing', content).career;

  it('is the mean Patron Regard scaled, and is unchanged from E1', () => {
    for (let value = -5; value <= 5; value += 1) {
      const world = patronsThinking(opened, value);
      expect(standing(world), `every Patron at ${value}`).toBe(standingByHand(world));
      expect(standing(world)).toBe(value * world.config.standingScale);
    }
  });

  it('is derived and never stored: nothing in the Career holds it', () => {
    const saved = JSON.parse(serialiseCareer(opened)) as Record<string, unknown>;
    expect(Object.keys(saved)).not.toContain('standing');
    expect(Object.keys(saved['guild'] as object)).not.toContain('standing');
    // A Rival carries a stored Standing because a Rival is not simulated; the Guild's
    // own is worked out from its Patrons every time it is asked for (architecture §3).
    for (const rival of opened.rivals) expect(typeof rival.standing).toBe('number');
  });

  it('reads a deep-frozen Career without writing to it', () => {
    const frozen = deepFreeze(newCareer('standing-frozen', content).career);
    const before = serialiseCareer(frozen);
    expect(standing(frozen)).toBe(standingByHand(frozen));
    expect(maxCalibre(frozen)).toBeGreaterThanOrEqual(1);
    expect(serialiseCareer(frozen)).toBe(before);
  });
});

describe('maxCalibre', () => {
  const opened = newCareer('max-calibre', content).career;

  it('walks Patron Regard from −5 to +5 and answers at every step', () => {
    const walked = [];
    for (let value = -5; value <= 5; value += 1) {
      const world = patronsThinking(opened, value);
      walked.push({ value, standing: standing(world), calibre: maxCalibre(world) });
    }
    // Calibre 2 unlocks at Standing 10 and calibre 3 at 30, which on the ×10 scale is a
    // mean Patron Regard of +1 and +3 (E4 §3).
    expect(walked).toEqual([
      { value: -5, standing: -50, calibre: 1 },
      { value: -4, standing: -40, calibre: 1 },
      { value: -3, standing: -30, calibre: 1 },
      { value: -2, standing: -20, calibre: 1 },
      { value: -1, standing: -10, calibre: 1 },
      { value: 0, standing: 0, calibre: 1 },
      { value: 1, standing: 10, calibre: 2 },
      { value: 2, standing: 20, calibre: 2 },
      { value: 3, standing: 30, calibre: 3 },
      { value: 4, standing: 40, calibre: 3 },
      { value: 5, standing: 50, calibre: 3 },
    ]);
  });

  it('moves with the two thresholds and with nothing else', () => {
    const strict = newCareer('max-calibre-strict', content, {
      calibre2Standing: 40,
      calibre3Standing: 50,
    }).career;
    expect(maxCalibre(patronsThinking(strict, 3))).toBe(1);
    expect(maxCalibre(patronsThinking(strict, 4))).toBe(2);
    expect(maxCalibre(patronsThinking(strict, 5))).toBe(3);

    const generous = newCareer('max-calibre-generous', content, {
      calibre2Standing: -50,
      calibre3Standing: -50,
    }).career;
    expect(maxCalibre(patronsThinking(generous, -5))).toBe(3);
  });
});

describe('the calibre ceiling', () => {
  /** Every calibre that turned up over `days` of a Career nobody sends anywhere. */
  function calibresSeen(career: Career, days: number): number[] {
    const run = advance(career, days, content);
    return run.events
      .filter((event) => event.type === 'ApplicantsArrived')
      .flatMap((event) => event.calibres);
  }

  it('never generates a calibre-2 Applicant below calibre2Standing, over two hundred seeds', () => {
    let batches = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      // Every Patron at zero, so Standing is zero and stays well under the threshold: the
      // only thing that moves it over a hundred quiet Days is being passed over, which
      // moves it down (architecture §5).
      // Coin enough to see the whole hundred Days out: at the shipped Upkeep a Guild that
      // never takes work is insolvent by Day 90, which would cut the sample short.
      const world = patronsThinking(
        newCareer(`ceiling-${seed}`, content, { startingCoin: 100_000 }).career,
        0,
      );
      expect(standing(world)).toBeLessThan(world.config.calibre2Standing);
      const run = advance(world, 100, content);
      expect(standing(run.career), `seed ${seed} ended above the threshold`).toBeLessThan(
        run.career.config.calibre2Standing,
      );
      for (const event of run.events) {
        if (event.type !== 'ApplicantsArrived') continue;
        batches += 1;
        expect(event.calibres, `seed ${seed}, Day ${event.day}`).toEqual(
          event.calibres.map(() => 1),
        );
      }
      for (const applicant of run.career.applicants) expect(applicant.calibre).toBe(1);
    }
    // Ten arrival Days each, because a starting Roster of four sits below `rosterFloor`.
    expect(batches, 'the seeds should actually have produced batches').toBe(2000);
  });

  it('widens the range rather than guaranteeing the top of it', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 40; seed += 1) {
      const world = patronsThinking(newCareer(`widened-${seed}`, content).career, 5);
      expect(maxCalibre(world)).toBe(3);
      for (const calibre of calibresSeen(world, 100)) seen.add(calibre);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('clamps somebody coming back to the ceiling Standing has earned', () => {
    // A returner's calibre is what their Stats already earn — but Standing gates every
    // Applicant without exception, so a Guild nobody thinks well of cannot get a
    // calibre-3 veteran back through the door (DL-19 §7).
    const opened = newCareer('returning-ceiling', content, { returnAsApplicantChance: 1 }).career;
    const hero = opened.guild.roster[0];
    if (hero === undefined) throw new Error('the test expected a Roster');
    const strong = walkedOut(opened, hero.id, 1);
    const veteran = strong.guild.formerHeroes[0];
    if (veteran === undefined) throw new Error('the test expected a former Hero');
    veteran.stats = { Might: 5, Craft: 5, Nerve: 4, Guile: 4 };
    expect(
      veteran.stats.Might + veteran.stats.Craft + veteran.stats.Nerve + veteran.stats.Guile,
    ).toBeGreaterThanOrEqual(defaultConfig.calibreStatBudget3);

    const poor = advance(patronsThinking(strong, 0), 100, content).career;
    const back = poor.applicants.find((applicant) => applicant.formerHeroId === veteran.id);
    expect(back, 'the veteran should have come back').toBeDefined();
    expect(back?.calibre).toBe(1);
    // Their Stats are untouched: only what they ask for is gated.
    expect(back?.stats).toEqual(veteran.stats);

    const rich = advance(patronsThinking(strong, 5), 100, content).career;
    expect(rich.applicants.find((applicant) => applicant.formerHeroId === veteran.id)?.calibre).toBe(3);
  });
});
