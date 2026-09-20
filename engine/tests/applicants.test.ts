/**
 * E4-S2: Applicants arrive. A batch every `applicantsEveryDays`, twice as often and as
 * large as it goes while the Roster is short-handed, made from the authored content, and
 * gone again on the exact Day their patience runs out.
 *
 * Every draw a batch takes comes from a stream derived from the seed and the Day rather
 * than from `career.rng` (DL-19 §1), which is what makes arrival deterministic from the
 * seed and keeps a batch from moving anything else in the world.
 */

import { describe, expect, it } from 'vitest';
import { advance, commitParty } from '../src/career.js';
import { applicantInterval, calibreStatBudget, maxCalibre } from '../src/applicant.js';
import type { GameConfig } from '../src/config.js';
import { validateContent, type Content } from '../src/content.js';
import type { GameEvent } from '../src/events.js';
import { deserialiseCareer, serialiseCareer } from '../src/save.js';
import { CALIBRES, STATS, type Applicant, type Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { fixtureContent, patronsThinking, walkedOut } from './fixtures.js';

const content = fixtureContent;

/** Rich enough to watch for a long time without going insolvent between batches. */
const PATIENT: Partial<GameConfig> = { startingCoin: 1_000_000 };

/** The fixture content with a name pool small enough to run dry on purpose (DL-22 §1). */
function poolOf(heroFirst: string[], heroEpithets: string[]): Content {
  return validateContent({
    traits: content.traits,
    backgrounds: content.backgrounds,
    spheres: content.spheres,
    names: {
      heroFirst,
      heroEpithets,
      guildNames: content.names.guildNames,
      rivalNames: content.names.rivalNames,
    },
    vignettes: content.vignettes,
  });
}

function arrivals(events: readonly GameEvent[]): Extract<GameEvent, { type: 'ApplicantsArrived' }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: 'ApplicantsArrived' }> =>
    event.type === 'ApplicantsArrived',
  );
}

function declines(events: readonly GameEvent[]): Extract<GameEvent, { type: 'ApplicantDeclined' }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: 'ApplicantDeclined' }> =>
    event.type === 'ApplicantDeclined',
  );
}

describe('a batch arriving', () => {
  it('comes on the Days that are multiples of the interval, and on no other Day', () => {
    // `rosterFloor: 1` puts the starting four at or above the floor, so the plain interval
    // is the one in force.
    const opened = newCareer('cadence', content, { ...PATIENT, rosterFloor: 1 }).career;
    expect(applicantInterval(opened)).toBe(opened.config.applicantsEveryDays);
    const run = advance(opened, 100, content);
    expect(arrivals(run.events).map((event) => event.day)).toEqual([20, 40, 60, 80, 100]);
  });

  it('carries the ids and the calibres, so a front end needs no second lookup', () => {
    const run = advance(newCareer('carries', content, PATIENT).career, 20, content);
    const first = arrivals(run.events)[0];
    if (first === undefined) throw new Error('the test expected a batch');
    expect(first.applicantIds.length).toBe(first.calibres.length);
    expect(first.expiresOn).toBe(first.day + run.career.config.applicantLingerDays);
    for (const [index, id] of first.applicantIds.entries()) {
      const applicant = run.career.applicants.find((entry) => entry.id === id);
      expect(applicant, id).toBeDefined();
      expect(applicant?.calibre).toBe(first.calibres[index]);
      expect(applicant?.arrivedOn).toBe(first.day);
      expect(applicant?.expiresOn).toBe(first.expiresOn);
    }
  });

  it('pins the ids and the calibres of the first three batches', () => {
    const run = advance(newCareer('pinned-batches', content, PATIENT).career, 30, content);
    expect(
      arrivals(run.events).map((event) => ({
        day: event.day,
        ids: event.applicantIds,
        calibres: event.calibres,
      })),
    ).toEqual([
      { day: 10, ids: ['a1', 'a2', 'a3'], calibres: [1, 1, 1] },
      { day: 20, ids: ['a4', 'a5', 'a6'], calibres: [1, 1, 1] },
      { day: 30, ids: ['a7', 'a8', 'a9'], calibres: [1, 1, 1] },
    ]);
  });

  it('pins the ids and the calibres of the first three batches where Standing has earned them', () => {
    const rich = patronsThinking(newCareer('pinned-rich', content, PATIENT).career, 5);
    expect(maxCalibre(rich)).toBe(3);
    const run = advance(rich, 30, content);
    expect(
      arrivals(run.events).map((event) => ({
        day: event.day,
        ids: event.applicantIds,
        calibres: event.calibres,
      })),
    ).toEqual([
      { day: 10, ids: ['a1', 'a2', 'a3'], calibres: [1, 1, 3] },
      { day: 20, ids: ['a4', 'a5', 'a6'], calibres: [1, 1, 2] },
      { day: 30, ids: ['a7', 'a8', 'a9'], calibres: [3, 2, 3] },
    ]);
  });

  it('is deterministic from the seed, and the same Career twice gives the same people', () => {
    const once = advance(newCareer('deterministic', content, PATIENT).career, 60, content);
    const twice = advance(newCareer('deterministic', content, PATIENT).career, 60, content);
    expect(twice.career.applicants).toEqual(once.career.applicants);
    expect(arrivals(twice.events)).toEqual(arrivals(once.events));

    // A different seed deals different people. The ids and the calibres alone are not
    // enough to tell two Careers apart — the ids run a1, a2, a3 whoever turns up — so it
    // is the Applicants themselves that are compared.
    const elsewhere = advance(newCareer('deterministic-other', content, PATIENT).career, 60, content);
    expect(elsewhere.career.applicants.map((entry) => entry.name)).not.toEqual(
      once.career.applicants.map((entry) => entry.name),
    );
  });

  it('takes no draw from the Career’s own generator, so a Commission resolving the same Day is untouched', () => {
    // The whole point of the derived stream (DL-19 §1). A Career with Applicants switched
    // off and one with them switched on must produce exactly the same Beats, Board and
    // Checks, because a batch draws nothing the rest of the world would have drawn.
    const settings: Partial<GameConfig> = { ...PATIENT, commissionSpanMin: 9, commissionSpanMax: 9 };
    const without = newCareer('same-stream', content, {
      ...settings,
      applicantsEveryDays: 0,
      applicantsEveryDaysBelowFloor: 0,
    }).career;
    const with_ = newCareer('same-stream', content, settings).career;

    const send = (career: Career): { career: Career; events: GameEvent[] } => {
      const commission = career.board[0];
      if (commission === undefined) throw new Error('the test expected a Commission');
      const sent = commitParty(
        career,
        commission.id,
        career.guild.roster.slice(0, 2).map((hero) => hero.id),
        content,
      );
      const run = advance(sent.career, 60, content);
      return { career: run.career, events: [...sent.events, ...run.events] };
    };

    const quiet = send(without);
    const busy = send(with_);
    const recruitment: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>([
      'ApplicantsArrived',
      'ApplicantDeclined',
    ]);
    expect(busy.events.filter((event) => recruitment.has(event.type)).length).toBeGreaterThan(0);
    expect(busy.events.filter((event) => !recruitment.has(event.type))).toEqual(quiet.events);
    expect(busy.career.rng).toEqual(quiet.career.rng);
    expect(busy.career.guild.coin).toBe(quiet.career.guild.coin);
  });

  it('brings nobody once the Career has ended', () => {
    const opened = newCareer('after-the-end', content, { careerYears: 1, daysPerYear: 40 }).career;
    const run = advance(opened, 200, content);
    expect(run.career.ended).toBeDefined();
    const ended = run.career.ended?.onDay ?? 0;
    for (const arrival of arrivals(run.events)) expect(arrival.day).toBeLessThanOrEqual(ended);
    // And advancing a finished Career produces nothing at all, however many arrival Days
    // would have fallen inside the stretch.
    expect(advance(run.career, 200, content).events).toEqual([]);
  });
});

describe('the Roster floor', () => {
  /** At the floor, and one Hero short of it, on the same seed. */
  const AT_THE_FLOOR: Partial<GameConfig> = { ...PATIENT, rosterFloor: 4 };

  it('halves the interval and fills the batch once the Roster falls below it', () => {
    const opened = newCareer('floor', content, AT_THE_FLOOR).career;
    expect(opened.guild.roster).toHaveLength(4);
    expect(applicantInterval(opened)).toBe(opened.config.applicantsEveryDays);

    const full = advance(opened, 60, content);
    expect(arrivals(full.events).map((event) => event.day)).toEqual([20, 40, 60]);

    // Drive the Roster down by one, the way E2 and E3 take people off it.
    const short = walkedOut(opened, opened.guild.roster[0]?.id ?? '', 1);
    expect(short.guild.roster).toHaveLength(3);
    expect(applicantInterval(short)).toBe(short.config.applicantsEveryDaysBelowFloor);

    const helped = advance(short, 60, content);
    expect(arrivals(helped.events).map((event) => event.day)).toEqual([10, 20, 30, 40, 50, 60]);
    for (const arrival of arrivals(helped.events)) {
      expect(arrival.applicantIds).toHaveLength(short.config.applicantBatchMax);
    }
  });

  it('draws the batch size from the configured range while the Roster is not short-handed', () => {
    const sizes = new Set<number>();
    for (let seed = 0; seed < 40; seed += 1) {
      const opened = newCareer(`batch-size-${seed}`, content, AT_THE_FLOOR).career;
      for (const arrival of arrivals(advance(opened, 200, content).events)) {
        sizes.add(arrival.applicantIds.length);
      }
    }
    expect([...sizes].sort()).toEqual([
      defaultBatch().min,
      defaultBatch().max,
    ]);
  });

  function defaultBatch(): { min: number; max: number } {
    const config = newCareer('batch-config', content).career.config;
    return { min: config.applicantBatchMin, max: config.applicantBatchMax };
  }
});

describe('who turns up', () => {
  /** Everybody who ever turned up, gathered as they did — a batch is gone twenty Days later. */
  function everyoneWhoCame(start: Career, days: number): { career: Career; seen: Applicant[] } {
    const seen: Applicant[] = [];
    const known = new Set<string>();
    let career = start;
    for (let step = 0; step < days; step += 1) {
      career = advance(career, 1, content).career;
      for (const applicant of career.applicants) {
        if (known.has(applicant.id)) continue;
        known.add(applicant.id);
        seen.push(applicant);
      }
    }
    return { career, seen };
  }

  const walked = everyoneWhoCame(patronsThinking(newCareer('who', content, PATIENT).career, 5), 400);
  const run = { career: walked.career };
  const seen = walked.seen;

  it('is made from the content: a name from the pools and a Background that supplies the Traits', () => {
    expect(run.career.applicants.length).toBeGreaterThan(0);
    for (const applicant of run.career.applicants) {
      const first = applicant.name.split(' ')[0] ?? '';
      expect(content.names.heroFirst, applicant.name).toContain(first);
      const background = content.backgrounds.find((entry) => entry.name === applicant.background);
      expect(background, applicant.background).toBeDefined();
      expect(applicant.traits.map((trait) => trait.name)).toEqual(background?.traits ?? []);
      for (const trait of applicant.traits) expect(trait.since).toBe(applicant.arrivedOn);
      expect(['she', 'he', 'they']).toContain(applicant.pronouns);
    }
  });

  it('carries an age in E3’s range', () => {
    const { heroStartingAgeMin, heroStartingAgeMax } = run.career.config;
    for (const applicant of run.career.applicants) {
      expect(applicant.age, applicant.id).toBeGreaterThanOrEqual(heroStartingAgeMin);
      expect(applicant.age, applicant.id).toBeLessThanOrEqual(heroStartingAgeMax);
    }
  });

  it('shares no id with anybody the Guild has ever had, and never repeats one', () => {
    const everyId = seen.map((applicant) => applicant.id);
    expect(everyId.length).toBeGreaterThan(50);
    expect(new Set(everyId).size).toBe(everyId.length);
    const heroes = new Set([
      ...run.career.guild.roster.map((hero) => hero.id),
      ...run.career.guild.formerHeroes.map((hero) => hero.id),
    ]);
    for (const id of everyId) {
      expect(id, id).toMatch(/^a\d+$/);
      expect(heroes.has(id), `${id} collides with a Hero`).toBe(false);
    }
  });

  it('holds no two people the player could not tell apart', () => {
    const names = run.career.applicants.map((applicant) => applicant.name);
    expect(new Set(names).size).toBe(names.length);
    const roster = run.career.guild.roster.map((hero) => hero.name);
    for (const name of names) expect(roster).not.toContain(name);
  });

  it('has Stats summing to the calibre budget exactly, none of them outside the range', () => {
    expect(seen.length).toBeGreaterThan(20);
    const byCalibre = new Map<number, number>();
    for (const applicant of seen) {
      const budget = calibreStatBudget(applicant.calibre, run.career.config);
      const total = STATS.reduce((sum, stat) => sum + applicant.stats[stat], 0);
      expect(total, `${applicant.id} at calibre ${applicant.calibre}`).toBe(budget);
      for (const stat of STATS) {
        expect(applicant.stats[stat], `${applicant.id} ${stat}`).toBeGreaterThanOrEqual(
          run.career.config.statMin,
        );
        expect(applicant.stats[stat], `${applicant.id} ${stat}`).toBeLessThanOrEqual(
          run.career.config.statMax,
        );
      }
      byCalibre.set(applicant.calibre, (byCalibre.get(applicant.calibre) ?? 0) + 1);
    }
    // All three budgets were actually exercised, including the smallest — ten points over
    // four Stats each at least one, which is the distribution's tightest case.
    expect([...byCalibre.keys()].sort()).toEqual([1, 2, 3]);
  });

  it('distributes every calibre budget exactly, over six hundred fresh batches', () => {
    for (const calibre of CALIBRES) {
      const forced = patronsThinking(
        newCareer(`budget-${calibre}`, content, {
          ...PATIENT,
          calibre2Standing: calibre >= 2 ? -50 : 50,
          calibre3Standing: calibre >= 3 ? -50 : 50,
        }).career,
        0,
      );
      expect(maxCalibre(forced)).toBe(calibre);
      const played = everyoneWhoCame(forced, 400);
      let counted = 0;
      for (const applicant of played.seen) {
        counted += 1;
        expect(applicant.calibre).toBeLessThanOrEqual(calibre);
        expect(STATS.reduce((sum, stat) => sum + applicant.stats[stat], 0)).toBe(
          calibreStatBudget(applicant.calibre, played.career.config),
        );
      }
      expect(counted, `calibre ${calibre}`).toBeGreaterThan(100);
    }
  });

  it('asks a fee built from the two configured numbers', () => {
    const { applicantFeeBase, applicantFeePerCalibre } = run.career.config;
    for (const applicant of seen) {
      expect(applicant.askingFee, applicant.id).toBe(
        applicantFeeBase + applicantFeePerCalibre * applicant.calibre,
      );
    }
    const dearer = advance(
      patronsThinking(
        newCareer('dear', content, { ...PATIENT, applicantFeeBase: 5, applicantFeePerCalibre: 100 })
          .career,
        5,
      ),
      20,
      content,
    ).career;
    for (const applicant of dearer.applicants) {
      expect(applicant.askingFee).toBe(5 + 100 * applicant.calibre);
    }
  });
});

describe('an Applicant running out of patience', () => {
  it('goes on the exact Day, and is gone from the Career', () => {
    const opened = newCareer('patience', content, PATIENT).career;
    const linger = opened.config.applicantLingerDays;
    const first = advance(opened, 10, content);
    const batch = arrivals(first.events)[0];
    if (batch === undefined) throw new Error('the test expected a batch');
    expect(batch.expiresOn).toBe(10 + linger);

    // Still there the Day before, gone at the start of the Day itself.
    const dayBefore = advance(first.career, batch.expiresOn - 1 - first.career.day, content);
    expect(dayBefore.career.day).toBe(batch.expiresOn - 1);
    expect(dayBefore.career.applicants.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(batch.applicantIds),
    );
    expect(declines(dayBefore.events).map((event) => event.applicantId)).not.toEqual(
      expect.arrayContaining(batch.applicantIds),
    );

    const theDay = advance(dayBefore.career, 1, content);
    expect(theDay.career.day).toBe(batch.expiresOn);
    const gone = declines(theDay.events).filter((event) => event.reason === 'expired');
    expect(gone.map((event) => event.applicantId).sort()).toEqual([...batch.applicantIds].sort());
    for (const event of gone) expect(event.name.length).toBeGreaterThan(0);
    for (const id of batch.applicantIds) {
      expect(theDay.career.applicants.find((entry) => entry.id === id), id).toBeUndefined();
    }
  });

  it('moves with the configured span, and nothing else does', () => {
    const brief = advance(
      newCareer('brief', content, { ...PATIENT, applicantLingerDays: 5 }).career,
      30,
      content,
    );
    expect(arrivals(brief.events).map((event) => event.expiresOn)).toEqual([15, 25, 35]);
    expect(
      declines(brief.events)
        .filter((event) => event.reason === 'expired')
        .map((event) => event.day),
    ).toEqual([15, 15, 15, 25, 25, 25]);
  });

  it('leaves nobody lingering past their Day over a whole Career', () => {
    const played = advance(newCareer('lingering', content, PATIENT).career, 2000, content);
    for (const applicant of played.career.applicants) {
      expect(applicant.expiresOn, applicant.id).toBeGreaterThan(played.career.day);
    }
  });
});

describe('the names a batch must avoid', () => {
  /** Everybody alive in a Career, by the same reckoning `namesInUse` uses. */
  function livingNames(career: Career): string[] {
    return [
      career.guild.guildmaster.name,
      ...career.guild.roster.map((hero) => hero.name),
      ...career.rivals.flatMap((rival) => rival.roster.map((hero) => hero.name)),
      ...career.applicants.map((applicant) => applicant.name),
    ];
  }

  it('widening the names a batch must avoid moves the names and nothing else', () => {
    /**
     * The RNG discipline behind DL-22 §1. A name is picked with `rng.pick` over a
     * **filtered** array, and a `pick` costs exactly one draw whatever the array's length
     * — so widening the set of names to avoid changes *which* name is drawn and never
     * *how many* draws are taken. Everything after the name on the same stream stays
     * exactly where it was.
     *
     * The two arms differ only in whether there are any Rival Heroes to avoid; the
     * Applicant stream is keyed on the seed and the Day and is untouched either way.
     */
    const settings: Partial<GameConfig> = { ...PATIENT, rosterFloor: 1 };
    const withRivals = advance(newCareer('widen', content, settings).career, 120, content).career;
    const without = advance(
      newCareer('widen', content, { ...settings, rivalRosterMin: 0, rivalRosterMax: 0 }).career,
      120,
      content,
    ).career;

    expect(withRivals.rivals.flatMap((rival) => rival.roster).length).toBeGreaterThan(10);
    expect(without.rivals.flatMap((rival) => rival.roster)).toEqual([]);
    expect(withRivals.applicants.length).toBeGreaterThan(0);
    expect(withRivals.applicants.length).toBe(without.applicants.length);
    expect(withRivals.nextApplicantNumber).toBe(without.nextApplicantNumber);

    const avoided = new Set(livingNames(withRivals));
    let moved = 0;
    for (const [index, wide] of withRivals.applicants.entries()) {
      const narrow = without.applicants[index];
      if (narrow === undefined) throw new Error('the two arms held different batches');
      // Everything the batch drew but the name is bit-identical.
      expect(wide.id, wide.id).toBe(narrow.id);
      expect(wide.calibre, wide.id).toBe(narrow.calibre);
      expect(wide.stats, wide.id).toEqual(narrow.stats);
      expect(wide.background, wide.id).toBe(narrow.background);
      expect(wide.traits, wide.id).toEqual(narrow.traits);
      expect(wide.age, wide.id).toBe(narrow.age);
      expect(wide.pronouns, wide.id).toBe(narrow.pronouns);
      expect(wide.askingFee, wide.id).toBe(narrow.askingFee);
      expect(wide.arrivedOn, wide.id).toBe(narrow.arrivedOn);
      expect(wide.expiresOn, wide.id).toBe(narrow.expiresOn);
      if (wide.name === narrow.name) continue;
      moved += 1;
      // And where a name did move, it moved off somebody: the name the narrow arm gave
      // them is one the wide arm's world already has somebody answering to.
      expect(avoided.has(narrow.name), `${wide.id} took "${narrow.name}" for no reason`).toBe(true);
    }
    expect(moved, 'some name moved, or the arms were not different enough to prove anything')
      .toBeGreaterThan(0);
  });

  it('takes a free combination of the pool before it ever repeats a name', () => {
    // Two first names and two epithets is six people the pool can tell apart. The
    // Guildmaster and the one starting Hero take two of them, and a batch of Applicants
    // takes the rest without a repeat — the exhaustive fallback, which costs no draw.
    const roomy = poolOf(['Solo', 'Duo'], ['the Elder', 'the Younger']);
    const career = advance(
      newCareer('pool-has-room', roomy, {
        ...PATIENT,
        startingHeroes: 1,
        rosterFloor: 0,
        rivalCount: 0,
        applicantBatchMin: 4,
        applicantBatchMax: 4,
      }).career,
      20,
      roomy,
    ).career;
    const names = livingNames(career);
    expect(names).toHaveLength(6);
    expect(new Set(names).size).toBe(6);
    for (const name of names) {
      expect(['Solo', 'Duo', 'Solo the Elder', 'Solo the Younger', 'Duo the Elder', 'Duo the Younger'])
        .toContain(name);
    }
  });

  it('hands back a name somebody already answers to only when every combination is taken', () => {
    // The truth `freeName`'s doc comment now tells (DL-22 §1). Two first names and one
    // epithet is four people the pool can tell apart; the fifth must repeat, and does so
    // deterministically rather than at the mercy of which draw happened to land.
    const tiny = poolOf(['Solo', 'Duo'], ['the Only']);
    const settings: Partial<GameConfig> = {
      ...PATIENT,
      startingHeroes: 1,
      rosterFloor: 0,
      rivalCount: 0,
      applicantBatchMin: 3,
      applicantBatchMax: 3,
    };
    const once = advance(newCareer('pool-runs-dry', tiny, settings).career, 20, tiny).career;
    const twice = advance(newCareer('pool-runs-dry', tiny, settings).career, 20, tiny).career;

    const names = livingNames(once);
    expect(names).toHaveLength(5);
    for (const name of names) {
      expect(['Solo', 'Duo', 'Solo the Only', 'Duo the Only']).toContain(name);
    }
    // Five people and four names the pool can make: somebody is sharing, which is what an
    // exhausted pool does and what the doc comment now says it does.
    expect(new Set(names).size).toBe(4);
    // And it is not arbitrary: the same seed and the same pool give the same names twice.
    expect(livingNames(twice)).toEqual(names);
  });
});

describe('Applicants and the save', () => {
  it('survive a round trip, with everything about them intact', () => {
    const played = advance(
      patronsThinking(newCareer('applicant-save', content, PATIENT).career, 5),
      55,
      content,
    ).career;
    expect(played.applicants.length).toBeGreaterThan(0);
    const loaded = deserialiseCareer(serialiseCareer(played));
    expect(loaded).toEqual(played);
    expect(loaded.applicants).toEqual(played.applicants);
    expect(loaded.nextApplicantNumber).toBe(played.nextApplicantNumber);
    expect(serialiseCareer(loaded)).toBe(serialiseCareer(played));
  });

  it('carry on from where the save left them, on the same path an unsaved Career would take', () => {
    const midway = advance(newCareer('applicant-resume', content, PATIENT).career, 35, content).career;
    const straightOn = advance(midway, 200, content);
    const afterLoad = advance(deserialiseCareer(serialiseCareer(midway)), 200, content);
    expect(afterLoad.events).toEqual(straightOn.events);
    expect(serialiseCareer(afterLoad.career)).toBe(serialiseCareer(straightOn.career));
  });
});
