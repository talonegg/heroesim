import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceUntilAttention,
  availableHeroes,
  commitParty,
  proposeParty,
} from '../src/career.js';
import { defaultConfig } from '../src/config.js';
import { SaveError } from '../src/errors.js';
import type { GameEvent } from '../src/events.js';
import { REASON_DRIFTED } from '../src/regard.js';
import { startingAge } from '../src/age.js';
import { calibreOfStats, statTotal } from '../src/people.js';
import { souredRivals } from '../src/rival.js';
import { deserialiseCareer, serialiseCareer, SAVE_FORMAT_VERSION } from '../src/save.js';
import type { Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { autoPlay, fixtureContent } from './fixtures.js';

function roundTrip(career: Career): Career {
  return deserialiseCareer(serialiseCareer(career));
}

/** A Career taken down several different decision paths, for the round-trip corpus. */
function along(seed: string): Career[] {
  const stops: Career[] = [];
  let career = newCareer(seed, fixtureContent, { careerYears: 1, daysPerYear: 90 }).career;
  stops.push(career);
  for (let round = 0; round < 8 && career.ended === undefined; round += 1) {
    // Who can actually be sent: not away, and — since E3-S2 — not still hurt. Asking
    // `availableHeroes` rather than taking the whole Roster is the only change E3 made
    // here; every assertion below is untouched.
    const free = availableHeroes(career).map((hero) => hero.id);
    const commission = career.board[round % Math.max(1, career.board.length)];
    if (commission !== undefined && free.length > 0 && career.parties.length === 0) {
      career = commitParty(career, commission.id, free.slice(0, 2), fixtureContent).career;
      stops.push(career);
    }
    career = advanceUntilAttention(career, fixtureContent).career;
    stops.push(career);
  }
  stops.push(autoPlay(career, fixtureContent));
  return stops;
}

describe('saving and loading', () => {
  it('writes JSON a person could read', () => {
    const text = serialiseCareer(newCareer('readable', fixtureContent).career);
    expect(text.startsWith('{\n')).toBe(true);
    expect(JSON.parse(text)).toHaveProperty('formatVersion', SAVE_FORMAT_VERSION);
  });

  it('comes back deep-equal from every seed and every decision path', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      for (const career of along(`save-${seed}`)) {
        expect(roundTrip(career)).toEqual(career);
        expect(serialiseCareer(roundTrip(career))).toBe(serialiseCareer(career));
      }
    }
  });

  it('comes back deep-equal from a Career that has ended', () => {
    const ended = advance(
      newCareer('ended', fixtureContent, { careerYears: 1, daysPerYear: 10 }).career,
      30,
      fixtureContent,
    ).career;
    expect(ended.ended).toBeDefined();
    expect(roundTrip(ended)).toEqual(ended);
  });

  it('carries Injuries with their span, and Parties with their work', () => {
    const career = newCareer('carried', fixtureContent, { commissionSpanMin: 8, commissionSpanMax: 8 }).career;
    const commission = career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const sent = commitParty(career, commission.id, [career.guild.roster.slice(0, 3)[0]?.id ?? ''], fixtureContent)
      .career;
    const midway = advance(sent, 4, fixtureContent).career;
    expect(midway.parties).toHaveLength(1);
    expect(roundTrip(midway)).toEqual(midway);
    expect(roundTrip(midway).parties[0]?.commission).toEqual(midway.parties[0]?.commission);
  });

  it('resumes on exactly the same path it would have taken unsaved', () => {
    const midway = advance(newCareer('resume', fixtureContent).career, 37, fixtureContent).career;
    const straightOn = advance(midway, 200, fixtureContent);
    const afterLoad = advance(roundTrip(midway), 200, fixtureContent);
    expect(afterLoad.events).toEqual(straightOn.events);
    expect(afterLoad.career).toEqual(straightOn.career);
  });

  it('drops anything a front end kept beside the Career, at the boundary (F13)', () => {
    // A front end may store its own keys in the same document; DL-11 tolerates them.
    // They are dropped here, on purpose and in one place, rather than surviving until
    // the next call happens to clone the Career (DL-13).
    const career = advance(newCareer('extras', fixtureContent).career, 15, fixtureContent).career;
    const save = JSON.parse(serialiseCareer(career)) as Record<string, unknown>;
    save['uiScrollPosition'] = 400;
    (save['guild'] as Record<string, unknown>)['favouriteColour'] = 'green';
    const roster = (save['guild'] as { roster: Record<string, unknown>[] }).roster;
    if (roster[0] !== undefined) roster[0]['portrait'] = 'brenna.png';

    const loaded = deserialiseCareer(JSON.stringify(save));
    expect(loaded).toEqual(career);
    expect(Object.keys(loaded)).not.toContain('uiScrollPosition');
    expect(Object.keys(loaded.guild)).not.toContain('favouriteColour');
    expect(Object.keys(loaded.guild.roster[0] ?? {})).not.toContain('portrait');
    expect(serialiseCareer(loaded)).toBe(serialiseCareer(career));
  });
});

/**
 * A save is a contract across epics (epics README §5.5). E2 added fields to `GameConfig`,
 * to `Hero` and to the ledger without bumping `formatVersion`, because the world an E1
 * save describes is complete — it simply predates a rule. This is the test that the
 * promise holds: a document with every E2 field stripped out of it loads, takes the
 * documented defaults, and goes on being played (DL-14).
 */
describe('a save written before E2 existed', () => {
  /** The `GameConfig` fields E2 added. An E1 save carries none of them. */
  const CONFIG_ADDED_IN_E2 = [
    'backingMin',
    'backingRegardDivisor',
    'refusalRegardThreshold',
    'insistenceRegardCost',
    'departureRegardThreshold',
    'departureDc',
    'talkedRoundRegardGain',
    'regardDecayEveryDays',
    'regardDecayAmount',
    'regardDecayQuartersFactor',
  ] as const;

  /** A Career as E1 would have written it: the same world, without anything E2 added. */
  function asWrittenByE1(career: Career): string {
    const save = JSON.parse(serialiseCareer(career)) as Record<string, unknown>;
    const config = save['config'] as Record<string, unknown>;
    for (const field of CONFIG_ADDED_IN_E2) delete config[field];
    const guild = save['guild'] as { roster: Record<string, unknown>[]; formerHeroes: Record<string, unknown>[] };
    for (const hero of [...guild.roster, ...guild.formerHeroes]) {
      delete hero['lastCommittedOn'];
      delete hero['regardDecayedOn'];
      delete hero['exit'];
    }
    delete (save['ledger'] as Record<string, unknown>)['departures'];
    return JSON.stringify(save);
  }

  // Ample coin, so a Career that never takes a Commission can be advanced far enough,
  // later, to reach the first Board refresh at or after drift falls due, without going
  // insolvent on Upkeep alone first.
  const written = advance(
    newCareer('e1-save', fixtureContent, { startingCoin: 100_000 }).career,
    45,
    fixtureContent,
  ).career;
  const text = asWrittenByE1(written);

  it('is genuinely missing every field E2 added', () => {
    const save = JSON.parse(text) as {
      config: Record<string, unknown>;
      guild: { roster: Record<string, unknown>[] };
      ledger: Record<string, unknown>;
    };
    for (const field of CONFIG_ADDED_IN_E2) expect(save.config[field]).toBeUndefined();
    expect(save.guild.roster.length).toBeGreaterThan(0);
    for (const hero of save.guild.roster) {
      expect(hero['lastCommittedOn']).toBeUndefined();
      expect(hero['regardDecayedOn']).toBeUndefined();
    }
    expect(save.ledger['departures']).toBeUndefined();
  });

  it('loads, and the missing fields take their documented defaults', () => {
    const loaded = deserialiseCareer(text);
    for (const field of CONFIG_ADDED_IN_E2) {
      expect(loaded.config[field], field).toBe(defaultConfig[field]);
    }
    expect(loaded.ledger.departures).toBe(0);
    for (const hero of loaded.guild.roster) {
      // `lastCommittedOn` is "initialised to joinedOn" — what the Career would have
      // carried had the field existed all along. `regardDecayedOn` is initialised to the
      // Day the document is loaded on instead, so a Hero idle since before the rule
      // existed is not charged drift for the Days that came before it (DL-15, F1).
      expect(hero.lastCommittedOn).toBe(hero.joinedOn);
      expect(hero.regardDecayedOn).toBe(loaded.day);
      expect('exit' in hero).toBe(false);
    }
    expect(loaded.day).toBe(written.day);
    expect(loaded.guild.coin).toBe(written.guild.coin);
    expect(loaded.guild.roster.map((hero) => hero.id)).toEqual(
      written.guild.roster.map((hero) => hero.id),
    );
  });

  it('goes on being played, under the rules E2 brought with it', () => {
    const loaded = deserialiseCareer(text);

    // `written`, and so `loaded`, sits on Day 46 — well past `regardDecayEveryDays` (30).
    // Drift is owed from the Day the fields were filled in (the load Day), not from
    // `joinedOn`, so a Hero idle since before E2 is not handed a Regard loss at the very
    // next Board refresh (F1); the first point is not lost until `regardDecayEveryDays`
    // Days after the load, at the first Board refresh on or after that Day.
    const { regardDecayEveryDays, boardRefreshEveryDays } = loaded.config;
    const eligibleFrom = loaded.day + regardDecayEveryDays;
    const expectedDriftDay = Math.ceil(eligibleFrom / boardRefreshEveryDays) * boardRefreshEveryDays;
    const daysToAdvance = expectedDriftDay - loaded.day + boardRefreshEveryDays;

    const run = advance(loaded, daysToAdvance, fixtureContent);
    expect(run.career.day).toBe(loaded.day + daysToAdvance);
    expect(run.events.some((event) => event.type === 'BoardRefreshed')).toBe(true);
    expect(serialiseCareer(roundTrip(run.career))).toBe(serialiseCareer(run.career));

    const drifted = run.events.filter(
      (event): event is Extract<GameEvent, { type: 'HeroRegardForGuildmasterChanged' }> =>
        event.type === 'HeroRegardForGuildmasterChanged' && event.reason === REASON_DRIFTED,
    );
    expect(drifted.some((event) => event.day < expectedDriftDay)).toBe(false);
    expect(drifted.length).toBeGreaterThan(0);
    expect(drifted.every((event) => event.day === expectedDriftDay)).toBe(true);

    const commission = loaded.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const proposal = proposeParty(loaded, commission.id, [loaded.guild.roster[0]?.id ?? ''], fixtureContent);
    expect(proposal.refusals).toEqual([]);

    const played = autoPlay(loaded, fixtureContent);
    expect(played.ended).toBeDefined();
  });

  it('is still refused when a field E1 itself always wrote is missing', () => {
    const save = JSON.parse(text) as Record<string, unknown>;
    delete (save['config'] as Record<string, unknown>)['upkeepPerHero'];
    expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(SaveError);
    expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(/config\.upkeepPerHero/);
  });
});

/**
 * DL-15 named two `GameConfig` fields, `backingStatDivisor` and `backingStatOffset`, that
 * had been literals in `backingFor` since E1 (Fix 2, finding F4). A save from before they
 * were named carries neither, and has to load exactly as it did when they were still
 * inline `2`s.
 */
describe('a save written before backingStatDivisor and backingStatOffset were named', () => {
  const written = advance(newCareer('pre-dl15', fixtureContent).career, 10, fixtureContent).career;

  function withoutTheNewBackingFields(career: Career): string {
    const save = JSON.parse(serialiseCareer(career)) as Record<string, unknown>;
    delete (save['config'] as Record<string, unknown>)['backingStatDivisor'];
    delete (save['config'] as Record<string, unknown>)['backingStatOffset'];
    return JSON.stringify(save);
  }

  it('is genuinely missing both fields', () => {
    const save = JSON.parse(withoutTheNewBackingFields(written)) as { config: Record<string, unknown> };
    expect(save.config['backingStatDivisor']).toBeUndefined();
    expect(save.config['backingStatOffset']).toBeUndefined();
  });

  it('loads, and the two fields take their documented defaults', () => {
    const loaded = deserialiseCareer(withoutTheNewBackingFields(written));
    expect(loaded.config.backingStatDivisor).toBe(defaultConfig.backingStatDivisor);
    expect(loaded.config.backingStatOffset).toBe(defaultConfig.backingStatOffset);
    expect(loaded.day).toBe(written.day);
    expect(serialiseCareer(roundTrip(loaded))).toBe(serialiseCareer(loaded));
  });
});

/**
 * E3 adds fourteen `GameConfig` fields (the last, `patronRegardRecoveryAmount`, is Fix 3's
 * literal named out of `career.ts` under invariant 8 rather than anything about harm),
 * `Hero.age`, four ledger counters, the reckoning's `heroesRetired` and a narrowed
 * `guild.hall`, again without bumping `formatVersion`. The one that needs care is `age`:
 * it is filled from the same derivation world generation uses (DL-16 §1), so the Hero is
 * given the age they would always have had, loading the same document twice gives the
 * same ages, and the load advances no generator.
 */
describe('a save written before E3 existed', () => {
  const CONFIG_ADDED_IN_E3 = [
    'injuryChanceOnFailure',
    'scarChanceOnCriticalFailure',
    'deathChanceOnCriticalFailure',
    'injurySpanMin',
    'injurySpanMax',
    'heroStartingAgeMin',
    'heroStartingAgeMax',
    'heroRetirementAge',
    'hallInfirmaryCost',
    'hallTrainingYardCost',
    'hallQuartersCost',
    'infirmaryInjuryFactor',
    'trainingYardBacking',
    'patronRegardRecoveryAmount',
  ] as const;

  const LEDGER_ADDED_IN_E3 = ['heroesInjured', 'heroesScarred', 'heroesDied', 'heroesRetired'] as const;

  /** A Career as E2 would have written it: the same world, without anything E3 added. */
  function asWrittenByE2(career: Career): string {
    const save = JSON.parse(serialiseCareer(career)) as Record<string, unknown>;
    const config = save['config'] as Record<string, unknown>;
    for (const field of CONFIG_ADDED_IN_E3) delete config[field];
    const guild = save['guild'] as { roster: Record<string, unknown>[]; formerHeroes: Record<string, unknown>[] };
    for (const hero of [...guild.roster, ...guild.formerHeroes]) delete hero['age'];
    const ledger = save['ledger'] as Record<string, unknown>;
    for (const field of LEDGER_ADDED_IN_E3) delete ledger[field];
    const ended = save['ended'] as { reckoning: Record<string, unknown> } | undefined;
    if (ended !== undefined) delete ended.reckoning['heroesRetired'];
    return JSON.stringify(save);
  }

  const written = advance(newCareer('e2-save', fixtureContent).career, 45, fixtureContent).career;
  const text = asWrittenByE2(written);

  it('is genuinely missing every field E3 added', () => {
    const save = JSON.parse(text) as {
      config: Record<string, unknown>;
      guild: { roster: Record<string, unknown>[] };
      ledger: Record<string, unknown>;
    };
    for (const field of CONFIG_ADDED_IN_E3) expect(save.config[field]).toBeUndefined();
    for (const field of LEDGER_ADDED_IN_E3) expect(save.ledger[field]).toBeUndefined();
    expect(save.guild.roster.length).toBeGreaterThan(0);
    for (const hero of save.guild.roster) expect(hero['age']).toBeUndefined();
  });

  it('loads, and the missing fields take their documented defaults', () => {
    const loaded = deserialiseCareer(text);
    for (const field of CONFIG_ADDED_IN_E3) {
      expect(loaded.config[field], field).toBe(defaultConfig[field]);
    }
    for (const field of LEDGER_ADDED_IN_E3) expect(loaded.ledger[field], field).toBe(0);
    expect(loaded.day).toBe(written.day);
    expect(loaded.guild.hall).toEqual([]);
  });

  it('gives every Hero an age from the configured range, the one they would always have had', () => {
    const loaded = deserialiseCareer(text);
    expect(loaded.guild.roster.length).toBeGreaterThan(0);
    for (const hero of loaded.guild.roster) {
      expect(hero.age, hero.id).toBeGreaterThanOrEqual(loaded.config.heroStartingAgeMin);
      expect(hero.age, hero.id).toBeLessThanOrEqual(loaded.config.heroStartingAgeMax);
      expect(hero.age, hero.id).toBe(startingAge(loaded.seed, hero.id, loaded.config));
      // And it is the age world generation gave them, so nothing about the Hero changed.
      const asGenerated = written.guild.roster.find((entry) => entry.id === hero.id);
      expect(hero.age, hero.id).toBe(asGenerated?.age);
    }
  });

  it('is deterministic: the same document loaded twice gives the same ages', () => {
    const once = deserialiseCareer(text);
    const twice = deserialiseCareer(text);
    expect(twice.guild.roster.map((hero) => hero.age)).toEqual(
      once.guild.roster.map((hero) => hero.age),
    );
    // And the load takes no draw, so the generator is exactly where the document left it.
    expect(once.rng).toEqual(twice.rng);
    expect(once.rng).toEqual(written.rng);
    expect(serialiseCareer(once)).toBe(serialiseCareer(twice));
  });

  it('goes on being played, and does not spring a surprise on the first Day after loading', () => {
    const loaded = deserialiseCareer(text);
    // Nobody is handed a Retirement they had not earned: the ages are starting ages, so
    // a Hero is only retired once ageing has actually carried them to the line.
    const soon = advance(loaded, loaded.config.boardRefreshEveryDays * 2, fixtureContent);
    for (const event of soon.events) {
      if (event.type !== 'HeroRetired') continue;
      expect(event.age, 'nobody retires who was not already old enough').toBeGreaterThanOrEqual(
        loaded.config.heroRetirementAge,
      );
    }
    expect(
      soon.career.guild.roster.every(
        (hero) => hero.age < loaded.config.heroRetirementAge,
      ),
      'everyone still on the Roster is under the retirement age',
    ).toBe(true);

    const played = autoPlay(loaded, fixtureContent);
    expect(played.ended).toBeDefined();
    expect(serialiseCareer(roundTrip(played))).toBe(serialiseCareer(played));
  });

  it('is still refused when a field E2 itself always wrote is missing', () => {
    const save = JSON.parse(text) as Record<string, unknown>;
    const roster = (save['guild'] as { roster: Record<string, unknown>[] }).roster;
    delete roster[0]?.['joinedOn'];
    expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(SaveError);
    expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(/joinedOn/);
  });

  it('refuses a Hall improvement the world has no meaning for', () => {
    const save = JSON.parse(text) as { guild: { hall: string[] } };
    save.guild.hall = ['a swimming pool'];
    expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(SaveError);
    expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(/guild\.hall\[0\]/);
  });
});

/**
 * E4 adds nineteen `GameConfig` fields, `career.applicants`, `career.nextApplicantNumber`,
 * four ledger counters, the reckoning's `heroesRecruited` and an optional
 * `Hero.formerHeroId`, again without bumping `formatVersion`. The two that need care are
 * the batch — an E3 save has nobody waiting, which is a complete world and not a missing
 * one — and the id counter, which is filled from the ids the document actually carries so
 * that a hand-edited save can never mint an id somebody is already using (DL-19 §9).
 */
describe('a save written before E5 existed', () => {
  const CONFIG_ADDED_IN_E5 = [
    'rivalRosterMin',
    'rivalRosterMax',
    'rivalChurnChance',
    'rivalChurnGainChance',
    'rivalStartingRegard',
    'rivalHeroRegardMin',
    'rivalHeroRegardMax',
    'transferFeeBase',
    'transferFeePerCalibre',
    'transferConsentRegard',
    'transferJoiningRegard',
    'poachFeeFactor',
    'poachRegardThreshold',
    'poachRivalRegardCost',
    'retaliationRegardThreshold',
    'souredRivalThreshold',
    'souredRivalExtraTakes',
    'rivalTakesMax',
  ] as const;

  const LEDGER_ADDED_IN_E5 = [
    'heroesTransferredIn',
    'heroesPoachedIn',
    'heroesPoachedFromUs',
  ] as const;

  /** A Career as E4 would have written it: the same world, without anything E5 added. */
  function asWrittenByE4(career: Career): string {
    const save = JSON.parse(serialiseCareer(career)) as Record<string, unknown>;
    const config = save['config'] as Record<string, unknown>;
    for (const field of CONFIG_ADDED_IN_E5) delete config[field];
    delete save['nextRivalHeroNumber'];
    for (const rival of save['rivals'] as Record<string, unknown>[]) {
      delete rival['roster'];
      delete rival['regardForGuild'];
    }
    const guild = save['guild'] as { roster: Record<string, unknown>[]; formerHeroes: Record<string, unknown>[] };
    for (const hero of [...guild.roster, ...guild.formerHeroes]) delete hero['calibre'];
    const ledger = save['ledger'] as Record<string, unknown>;
    for (const field of LEDGER_ADDED_IN_E5) delete ledger[field];
    const ended = save['ended'] as { reckoning: Record<string, unknown> } | undefined;
    if (ended !== undefined) delete ended.reckoning['heroesPoachedFromUs'];
    return JSON.stringify(save);
  }

  const written = advance(newCareer('e4-save', fixtureContent).career, 45, fixtureContent).career;
  const text = asWrittenByE4(written);

  it('is genuinely missing every field E5 added', () => {
    const save = JSON.parse(text) as {
      config: Record<string, unknown>;
      ledger: Record<string, unknown>;
      rivals: Record<string, unknown>[];
      guild: { roster: Record<string, unknown>[] };
      nextRivalHeroNumber?: unknown;
    };
    for (const field of CONFIG_ADDED_IN_E5) expect(save.config[field]).toBeUndefined();
    for (const field of LEDGER_ADDED_IN_E5) expect(save.ledger[field]).toBeUndefined();
    expect(save.nextRivalHeroNumber).toBeUndefined();
    for (const rival of save.rivals) {
      expect(rival['roster']).toBeUndefined();
      expect(rival['regardForGuild']).toBeUndefined();
    }
    for (const hero of save.guild.roster) expect(hero['calibre']).toBeUndefined();
  });

  it('loads, and takes the defaults for every field it does not carry', () => {
    const loaded = deserialiseCareer(text);
    for (const field of CONFIG_ADDED_IN_E5) {
      expect(loaded.config[field], field).toBe(defaultConfig[field]);
    }
    for (const field of LEDGER_ADDED_IN_E5) expect(loaded.ledger[field], field).toBe(0);
    expect(loaded.day).toBe(written.day);
    // A Rival with no opinion of the Guild is given a neutral one, so that nobody is
    // soured on the first Day after a load and nothing about the Board changes under the
    // player (DL-15's care, DL-21 section 13).
    for (const rival of loaded.rivals) {
      expect(rival.regardForGuild.value, rival.id).toBe(defaultConfig.rivalStartingRegard);
      expect(rival.regardForGuild.reason.length).toBeGreaterThan(0);
    }
    // And nobody is soured, so the Board loses exactly what E1 said it loses.
    expect(souredRivals(loaded)).toEqual([]);
    expect(serialiseCareer(roundTrip(loaded))).toBe(serialiseCareer(loaded));
  });

  it('fills a calibre from the Stats the person already has, and never re-derives one', () => {
    const loaded = deserialiseCareer(text);
    for (const hero of [...loaded.guild.roster, ...loaded.guild.formerHeroes]) {
      expect(hero.calibre, hero.id).toBe(calibreOfStats(statTotal(hero.stats), loaded.config));
      // The person the save described, unchanged in every other particular.
      const was = written.guild.roster.find((entry) => entry.id === hero.id);
      if (was === undefined) continue;
      expect(hero.stats).toEqual(was.stats);
      expect(hero.age).toBe(was.age);
      expect(hero.calibre).toBe(was.calibre);
    }
  });

  it('is given the Rosters a Career on that seed would have had', () => {
    // Against the Rosters the seed *generates*, not the ones forty-five Days of churn and
    // Retirement have since left behind: the stream is keyed on the seed and the Rival's
    // id, so a document that never had people gets the people it would have opened with.
    const loaded = deserialiseCareer(text, fixtureContent);
    const fresh = newCareer('e4-save', fixtureContent).career;
    for (const [index, rival] of loaded.rivals.entries()) {
      const same = fresh.rivals[index];
      expect(rival.roster.length, rival.id).toBe(same?.roster.length);
      expect(
        rival.roster.map((hero) => hero.id),
        rival.id,
      ).toEqual(same?.roster.map((hero) => hero.id));
      expect(
        rival.roster.map((hero) => hero.regardForRival.value),
        rival.id,
      ).toEqual(same?.roster.map((hero) => hero.regardForRival.value));
      for (const hero of rival.roster) {
        expect(hero.regardForRival).toBeDefined();
        expect(hero.regardForGuildmaster).toBeUndefined();
        expect(hero.age, hero.id).toBe(startingAge(loaded.seed, hero.id, loaded.config));
      }
    }
    expect(loaded.nextRivalHeroNumber).toBe(fresh.nextRivalHeroNumber);
  });

  it('loads the same document twice to the same Rosters, down to the bytes', () => {
    expect(serialiseCareer(deserialiseCareer(text, fixtureContent))).toBe(
      serialiseCareer(deserialiseCareer(text, fixtureContent)),
    );
    // And the load advances no generator, so a loaded Career is on the same random path
    // as an unloaded one (DL-16 section 1, applied to a Rival's Roster).
    expect(deserialiseCareer(text, fixtureContent).rng).toEqual(written.rng);
    expect(deserialiseCareer(text).rng).toEqual(written.rng);
  });

  it('populates at the first advance for a Career loaded without content, before a Day is stepped', () => {
    const blind = deserialiseCareer(text);
    for (const rival of blind.rivals) expect(rival.roster).toEqual([]);
    const run = advance(blind, 1, fixtureContent);
    for (const rival of run.career.rivals) expect(rival.roster.length).toBeGreaterThan(0);
    // The same people either way: the stream is the seed and the Rival's id, and nothing
    // about when it is asked changes what it answers.
    const withContent = deserialiseCareer(text, fixtureContent);
    expect(run.career.rivals.map((rival) => rival.roster.map((hero) => hero.id))).toEqual(
      withContent.rivals.map((rival) => rival.roster.map((hero) => hero.id)),
    );
    // And nothing about the first Day is a surprise: nobody was taken, nothing was paid.
    expect(run.events.filter((event) => event.type === 'RivalPoachedHero')).toEqual([]);
    expect(run.career.guild.roster.map((hero) => hero.id)).toEqual(
      blind.guild.roster.map((hero) => hero.id),
    );
  });

  it('never hands out an id a hand-edited document is already using', () => {
    const save = JSON.parse(text) as { rivals: { id: string; roster?: unknown[] }[] };
    const first = save.rivals[0];
    if (first === undefined) throw new Error('the test expected a Rival');
    // Somebody already numbered far above anything a fresh Career would mint.
    first.roster = [
      {
        id: `${first.id}h900`,
        name: 'Somebody Already Here',
        pronouns: 'they',
        stats: { Might: 3, Craft: 3, Nerve: 2, Guile: 2 },
        age: 30,
        background: 'Levy years',
        traits: [],
        calibre: 1,
        regardForRival: { value: 0, reason: 'this is who they work for', nature: 'neutral' },
        regardFor: {},
        joinedOn: 1,
        lastCommittedOn: 1,
        regardDecayedOn: 1,
      },
    ];
    const loaded = deserialiseCareer(JSON.stringify(save), fixtureContent);
    expect(loaded.nextRivalHeroNumber).toBeGreaterThan(900);
    const ids = loaded.rivals.flatMap((rival) => rival.roster.map((hero) => hero.id));
    expect(new Set(ids).size).toBe(ids.length);
    // The Rival who already had somebody is left exactly as the document described them.
    expect(loaded.rivals[0]?.roster.map((hero) => hero.id)).toEqual([`${first.id}h900`]);
  });

  it('goes on being played to an ending', () => {
    const played = autoPlay(deserialiseCareer(text, fixtureContent), fixtureContent);
    expect(played.ended).toBeDefined();
    expect(played.ended?.reckoning.heroesPoachedFromUs).toBe(played.ledger.heroesPoachedFromUs);
    expect(serialiseCareer(roundTrip(played))).toBe(serialiseCareer(played));
  });
});

describe('a save written before E4 existed', () => {
  const CONFIG_ADDED_IN_E4 = [
    'applicantsEveryDays',
    'applicantsEveryDaysBelowFloor',
    'applicantBatchMin',
    'applicantBatchMax',
    'applicantLingerDays',
    'rosterCap',
    'rosterFloor',
    'calibre2Standing',
    'calibre3Standing',
    'calibreStatBudget1',
    'calibreStatBudget2',
    'calibreStatBudget3',
    'applicantFeeBase',
    'applicantFeePerCalibre',
    'joiningRegard',
    'joiningRegardAmongHeroes',
    'returnCooldownDays',
    'returnAsApplicantChance',
    'returningRegard',
  ] as const;

  const LEDGER_ADDED_IN_E4 = [
    'applicantsSeen',
    'applicantsAccepted',
    'returners',
    'returnersOffered',
  ] as const;

  /** A Career as E3 would have written it: the same world, without anything E4 added. */
  function asWrittenByE3(career: Career): string {
    const save = JSON.parse(serialiseCareer(career)) as Record<string, unknown>;
    const config = save['config'] as Record<string, unknown>;
    for (const field of CONFIG_ADDED_IN_E4) delete config[field];
    delete save['applicants'];
    delete save['nextApplicantNumber'];
    const ledger = save['ledger'] as Record<string, unknown>;
    for (const field of LEDGER_ADDED_IN_E4) delete ledger[field];
    const ended = save['ended'] as { reckoning: Record<string, unknown> } | undefined;
    if (ended !== undefined) delete ended.reckoning['heroesRecruited'];
    return JSON.stringify(save);
  }

  const written = advance(newCareer('e3-save', fixtureContent).career, 45, fixtureContent).career;
  const text = asWrittenByE3(written);

  it('is genuinely missing every field E4 added', () => {
    const save = JSON.parse(text) as {
      config: Record<string, unknown>;
      ledger: Record<string, unknown>;
      applicants?: unknown;
      nextApplicantNumber?: unknown;
    };
    for (const field of CONFIG_ADDED_IN_E4) expect(save.config[field]).toBeUndefined();
    for (const field of LEDGER_ADDED_IN_E4) expect(save.ledger[field]).toBeUndefined();
    expect(save.applicants).toBeUndefined();
    expect(save.nextApplicantNumber).toBeUndefined();
  });

  it('loads, and a Career without applicants takes an empty batch', () => {
    const loaded = deserialiseCareer(text);
    expect(loaded.applicants).toEqual([]);
    expect(loaded.nextApplicantNumber).toBe(1);
    for (const field of CONFIG_ADDED_IN_E4) {
      expect(loaded.config[field], field).toBe(defaultConfig[field]);
    }
    for (const field of LEDGER_ADDED_IN_E4) expect(loaded.ledger[field], field).toBe(0);
    expect(loaded.day).toBe(written.day);
    expect(serialiseCareer(roundTrip(loaded))).toBe(serialiseCareer(loaded));
  });

  it('loads the same way twice, down to the bytes', () => {
    expect(serialiseCareer(deserialiseCareer(text))).toBe(serialiseCareer(deserialiseCareer(text)));
    expect(deserialiseCareer(text).rng).toEqual(written.rng);
  });

  it('springs no surprise on the first arrival Day after loading', () => {
    // DL-15's lesson applied to the new fields: nothing a load has to invent may change
    // what the very next Day does. The first batch after a load is the batch that Day
    // would have brought in an unbroken Career, ids and all.
    const loaded = deserialiseCareer(text);
    const unbroken = advance(written, 40, fixtureContent);
    const resumed = advance(loaded, 40, fixtureContent);
    const days = (step: { events: GameEvent[] }): number[] =>
      step.events.filter((event) => event.type === 'ApplicantsArrived').map((event) => event.day);
    const people = (career: Career): unknown[] =>
      career.applicants.map((applicant) => ({
        name: applicant.name,
        calibre: applicant.calibre,
        stats: applicant.stats,
        background: applicant.background,
        arrivedOn: applicant.arrivedOn,
        expiresOn: applicant.expiresOn,
      }));

    // The same batches, on the same Days, of the same people: arrival reads the Day, the
    // Roster size and Standing, none of which a load has to invent.
    expect(days(resumed)).toEqual(days(unbroken));
    expect(people(resumed.career)).toEqual(people(unbroken.career));
    // Their ids are the one thing that differs, and honestly so: an E3 save had never
    // seen an Applicant, so the counter starts at one rather than carrying on. Age
    // follows the id (DL-16 §1), so it differs with it — and is still the age the seed
    // and that id would always have given, which is what matters about it.
    const numberOf = (career: Career): number[] =>
      career.applicants.map((applicant) => Number(/^a(\d+)$/.exec(applicant.id)?.[1] ?? NaN));
    expect(numberOf(resumed.career).every(Number.isInteger)).toBe(true);
    expect(numberOf(unbroken.career).every(Number.isInteger)).toBe(true);
    expect(Math.max(...numberOf(resumed.career))).toBeLessThan(
      Math.min(...numberOf(unbroken.career)),
    );
    for (const career of [resumed.career, unbroken.career]) {
      for (const applicant of career.applicants) {
        expect(applicant.age, applicant.id).toBe(
          startingAge(career.seed, applicant.id, career.config),
        );
      }
    }
    // And nobody is taken on, or charged for, by the act of loading.
    expect(resumed.career.guild.roster.map((hero) => hero.id)).toEqual(
      unbroken.career.guild.roster.map((hero) => hero.id),
    );
    expect(resumed.career.guild.coin).toBe(unbroken.career.guild.coin);
    expect(resumed.career.ledger.applicantsAccepted).toBe(0);
  });

  it('goes on being played to an ending', () => {
    const played = autoPlay(deserialiseCareer(text), fixtureContent);
    expect(played.ended).toBeDefined();
    expect(serialiseCareer(roundTrip(played))).toBe(serialiseCareer(played));
  });

  it('never hands out an id a hand-edited document is already using', () => {
    // The counter is filled from the ids the document carries, not from zero, so a save
    // that lost it — or never had it — still cannot mint `a3` twice (DL-19 §9).
    const withBatch = advance(newCareer('counter', fixtureContent).career, 15, fixtureContent).career;
    expect(withBatch.applicants.length).toBeGreaterThan(0);
    const save = JSON.parse(serialiseCareer(withBatch)) as Record<string, unknown>;
    delete save['nextApplicantNumber'];
    const loaded = deserialiseCareer(JSON.stringify(save));
    const highest = Math.max(
      ...loaded.applicants.map((applicant) => Number(/^a(\d+)$/.exec(applicant.id)?.[1] ?? 0)),
    );
    expect(loaded.nextApplicantNumber).toBe(highest + 1);

    const later = advance(loaded, 30, fixtureContent).career;
    const everyId = [
      ...later.applicants.map((applicant) => applicant.id),
      ...later.guild.roster.map((hero) => hero.id),
    ];
    expect(new Set(everyId).size).toBe(everyId.length);
  });
});

describe('a save that cannot be trusted', () => {
  const good = newCareer('refusals', fixtureContent).career;

  it('is refused when it is not JSON at all', () => {
    expect(() => deserialiseCareer('not a save')).toThrow(SaveError);
    expect(() => deserialiseCareer('')).toThrow(SaveError);
    expect(() => deserialiseCareer('{ "formatVersion": 1,')).toThrow(/not valid JSON/);
  });

  it('is refused when it is JSON but not a Career', () => {
    expect(() => deserialiseCareer('[]')).toThrow(SaveError);
    expect(() => deserialiseCareer('null')).toThrow(SaveError);
    expect(() => deserialiseCareer('42')).toThrow(SaveError);
  });

  it('is refused when the format version is not the one this engine writes', () => {
    const wrong = JSON.parse(serialiseCareer(good)) as Record<string, unknown>;
    wrong['formatVersion'] = 2;
    expect(() => deserialiseCareer(JSON.stringify(wrong))).toThrow(SaveError);
    expect(() => deserialiseCareer(JSON.stringify(wrong))).toThrow(/format version 2/);

    // A document carrying none says so plainly: "format version undefined" names a
    // JavaScript value and is not something a person can act on (E8-S6 housekeeping).
    delete wrong['formatVersion'];
    expect(() => deserialiseCareer(JSON.stringify(wrong))).toThrow(SaveError);
    expect(() => deserialiseCareer(JSON.stringify(wrong))).toThrow(
      /carries no format version at all, and this engine writes version 1/,
    );
    expect(() => deserialiseCareer(JSON.stringify(wrong))).not.toThrow(/undefined/);
  });

  it('is refused when a field the world needs is missing, and says which', () => {
    const cases: [string, (save: Record<string, unknown>) => void][] = [
      ['seed', (save) => delete save['seed']],
      ['day', (save) => delete save['day']],
      ['rng', (save) => delete save['rng']],
      ['guild', (save) => delete save['guild']],
      ['patrons', (save) => delete save['patrons']],
      ['board', (save) => delete save['board']],
      ['parties', (save) => delete save['parties']],
      ['rivals', (save) => delete save['rivals']],
      ['ledger', (save) => delete save['ledger']],
      ['recentCommissions', (save) => delete save['recentCommissions']],
      ['config', (save) => delete save['config']],
    ];
    for (const [field, break_] of cases) {
      const save = JSON.parse(serialiseCareer(good)) as Record<string, unknown>;
      break_(save);
      expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(SaveError);
      expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(new RegExp(field));
    }
  });

  it('is refused when the reckoning is a table but not a reckoning', () => {
    const ended = advance(
      newCareer('half-reckoning', fixtureContent, { careerYears: 1, daysPerYear: 10 }).career,
      30,
      fixtureContent,
    ).career;
    const save = JSON.parse(serialiseCareer(ended)) as { ended: Record<string, unknown> };
    save.ended['reckoning'] = {};
    expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(SaveError);
    expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(/ended\.reckoning\.years/);

    const noStats = JSON.parse(serialiseCareer(ended)) as {
      ended: { reckoning: Record<string, unknown> };
    };
    delete noStats.ended.reckoning['guildmasterStats'];
    expect(() => deserialiseCareer(JSON.stringify(noStats))).toThrow(
      /ended\.reckoning\.guildmasterStats/,
    );

    const badReason = JSON.parse(serialiseCareer(ended)) as { ended: Record<string, unknown> };
    badReason.ended['reason'] = 'boredom';
    expect(() => deserialiseCareer(JSON.stringify(badReason))).toThrow(/ended\.reason/);
  });

  it('is refused when an enumerated field carries a value the world has no meaning for', () => {
    const cases: [RegExp, (save: Record<string, unknown>) => void][] = [
      [
        /pronouns/,
        (save) => {
          const roster = (save['guild'] as { roster: Record<string, unknown>[] }).roster;
          const hero = roster[0];
          if (hero !== undefined) hero['pronouns'] = 'it';
        },
      ],
      [
        /nature/,
        (save) => {
          const patron = (save['patrons'] as { regardForGuild: Record<string, unknown> }[])[0];
          if (patron !== undefined) patron.regardForGuild['nature'] = 'friendly';
        },
      ],
      [
        /liftsOn/,
        (save) => {
          const hero = (save['guild'] as { roster: { traits: unknown[] }[] }).roster[0];
          hero?.traits.push({ name: 'Bruised', since: 1, liftsOn: 'tomorrow' });
        },
      ],
      [
        /beatsResolved/,
        (save) => {
          const party = (save['parties'] as { beatsResolved: unknown[] }[])[0];
          party?.beatsResolved.push('triumph');
        },
      ],
    ];
    const away = commitParty(
      good,
      good.board[0]?.id ?? '',
      [good.guild.roster[0]?.id ?? ''],
      fixtureContent,
    ).career;
    for (const [pattern, break_] of cases) {
      const save = JSON.parse(serialiseCareer(away)) as Record<string, unknown>;
      break_(save);
      expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(SaveError);
      expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(pattern);
    }
  });

  it('is refused when a nested field is the wrong shape', () => {
    const missingStat = JSON.parse(serialiseCareer(good)) as Record<string, unknown>;
    const guild = missingStat['guild'] as { roster: { stats: Record<string, unknown> }[] };
    delete guild.roster[0]?.stats['Nerve'];
    expect(() => deserialiseCareer(JSON.stringify(missingStat))).toThrow(/roster\[0\].stats.Nerve/);

    const shortRng = JSON.parse(serialiseCareer(good)) as Record<string, unknown>;
    shortRng['rng'] = [1, 2, 3];
    expect(() => deserialiseCareer(JSON.stringify(shortRng))).toThrow(/four words/);

    const thinConfig = JSON.parse(serialiseCareer(good)) as Record<string, unknown>;
    delete (thinConfig['config'] as Record<string, unknown>)['upkeepPerHero'];
    expect(() => deserialiseCareer(JSON.stringify(thinConfig))).toThrow(/config.upkeepPerHero/);
  });
});

/**
 * A save comes from a file or from browser storage, so anything at all can be in it. The
 * two acceptable answers are a `SaveError` at the boundary or a Career the engine can go
 * on using — never a `TypeError` several calls later out of a half-world that was let in.
 */
describe('a save corrupted one field at a time', () => {
  /** A Career carrying every optional part: a Party out, an Injury, finished work, an end. */
  function fullyPopulated(): Career {
    const opened = newCareer('corruption', fixtureContent, {
      careerYears: 1,
      daysPerYear: 60,
      commissionSpanMin: 9,
      commissionSpanMax: 9,
    }).career;
    const first = opened.board[0];
    if (first === undefined) throw new Error('the test expected a Commission');
    let career = commitParty(opened, first.id, [opened.guild.roster[0]?.id ?? ''], fixtureContent)
      .career;
    career = advance(career, 12, fixtureContent).career;
    const next = career.board[0];
    if (next === undefined) throw new Error('the test expected the Board to have refilled');
    career = commitParty(career, next.id, [career.guild.roster[1]?.id ?? ''], fixtureContent).career;
    career.guild.roster[0]?.traits.push({
      name: 'Bruised',
      since: career.day,
      liftsOn: career.day + 40,
    });
    career.ledger.commissionsByPatron['pa1'] = 3;
    const away = career.parties[0];
    if (away !== undefined) {
      // Keep the Party out past the end, so the save carries one alongside `ended`.
      away.returnsOn = 9990;
      away.beatDays = [9980];
    }
    return advance(career, 200, fixtureContent).career;
  }

  /** Every path through a JSON document, as a list of keys. */
  function paths(
    value: unknown,
    at: (string | number)[] = [],
    out: (string | number)[][] = [],
  ): (string | number)[][] {
    if (at.length > 0) out.push(at);
    if (Array.isArray(value)) {
      value.forEach((item, index) => paths(item, [...at, index], out));
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, item] of Object.entries(value)) paths(item, [...at, key], out);
    }
    return out;
  }

  function parentOf(root: unknown, path: (string | number)[]) {
    let node = root as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
    return { parent: node, key: path[path.length - 1] as string | number };
  }

  it('is either refused or still usable, and never leaks a TypeError', () => {
    const text = serialiseCareer(fullyPopulated());
    const every = paths(JSON.parse(text));
    expect(every.length).toBeGreaterThan(300);
    const corruptions: [string, unknown][] = [
      ['delete', undefined],
      ['null', null],
      ['a string', 'corrupt'],
      ['a number', 12345],
      ['an array', []],
      ['an object', {}],
      ['a boolean', true],
    ];
    const leaks: string[] = [];

    for (const path of every) {
      for (const [what, value] of corruptions) {
        const copy: unknown = JSON.parse(text);
        const { parent, key } = parentOf(copy, path);
        if (what === 'delete') delete parent[key];
        else parent[key] = value;

        let loaded: Career;
        try {
          loaded = deserialiseCareer(JSON.stringify(copy));
        } catch (thrown) {
          if (!(thrown instanceof SaveError)) {
            leaks.push(`${path.join('.')} set to ${what}: load threw ${String(thrown)}`);
          }
          continue;
        }
        try {
          advance(loaded, 3, fixtureContent);
          advanceUntilAttention(loaded, fixtureContent, 3);
          serialiseCareer(loaded);
        } catch (thrown) {
          const name = thrown instanceof Error ? thrown.name : 'something';
          if (name !== 'EngineError' && name !== 'ContentError' && name !== 'SaveError') {
            leaks.push(`${path.join('.')} set to ${what}: loaded, then ${String(thrown)}`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
    // E5 put a Roster on each of the four Rivals, so a fully populated save carries some
    // twenty-five more people and the sweep — seven corruptions of every path, each
    // loaded and advanced — grew past Vitest's five-second default. Nothing about what it
    // asserts changed; there is simply more world to corrupt.
  }, 60_000);
});
