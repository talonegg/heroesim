/**
 * E3-S1: what a failed Beat costs the person who failed it.
 *
 * Nothing here reads a sentence. Harm is proved through the typed events the engine emits
 * and the state it leaves behind, and every probability is driven from `GameConfig` rather
 * than from a seed that happens to land the right way: `injuryChanceOnFailure: 1` means
 * *every* plain failure injures, so the rule is under test and the dice are not.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  availableHeroes,
  commitParty,
  defaultConfig,
  injuryOutcome,
  newCareer,
  serialiseCareer,
  type Career,
  type GameConfig,
  type GameEvent,
} from '../src/index.js';
import { fixtureContent, oneVignetteContent } from './fixtures.js';

/** Every Beat's DC put out of reach, so that every Check in a test is a failure. */
const ALWAYS_FAILS: Partial<GameConfig> = { dcMin: 40, dcMax: 40 };
/** No failure is ever wide enough to be a critical one. */
const NEVER_CRITICAL: Partial<GameConfig> = { criticalMargin: 100 };
/** Every failure is a critical one, however narrow. */
const ALWAYS_CRITICAL: Partial<GameConfig> = { criticalMargin: 1 };

const plain = oneVignetteContent();
const authored = oneVignetteContent([{ kind: 'trait', trait: 'Bruised', days: 4 }]);

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/** Send one Party on one Commission and run the whole of it, over the given content. */
function work(
  seed: string,
  content = plain,
  config: Partial<GameConfig> = {},
  partySize = 1,
): { career: Career; events: GameEvent[] } {
  const opened = newCareer(seed, content, {
    commissionSpanMin: 6,
    commissionSpanMax: 6,
    beatsMin: 4,
    beatsMax: 4,
    boardRefreshEveryDays: 200,
    upkeepEveryDays: 200,
    ...config,
  });
  const commission = opened.career.board[0];
  if (commission === undefined) throw new Error('the test expected a Commission');
  const sent = commitParty(
    opened.career,
    commission.id,
    opened.career.guild.roster.slice(0, partySize).map((hero) => hero.id),
    content,
  );
  const run = advance(sent.career, 6, content);
  return { career: run.career, events: [...sent.events, ...run.events] };
}

describe('injuryOutcome', () => {
  it('classifies the whole margin range, one point either side of every boundary', () => {
    const config: GameConfig = { ...defaultConfig, criticalMargin: 9 };
    const dc = 12;
    // The whole range a d20 Check can reach either side of this DC, as a table: the
    // classification is a function of the margin alone, and here is every margin.
    const table: [total: number, expected: ReturnType<typeof injuryOutcome>][] = [];
    for (let total = dc - 20; total <= dc + 20; total += 1) {
      table.push([
        total,
        total >= dc ? 'none' : total <= dc - config.criticalMargin ? 'critical' : 'injury',
      ]);
    }
    for (const [total, expected] of table) {
      expect(injuryOutcome(total, dc, config), `total ${total} against DC ${dc}`).toBe(expected);
    }

    // And the three boundaries named, so the table above cannot drift without being seen.
    expect(injuryOutcome(dc, dc, config)).toBe('none');
    expect(injuryOutcome(dc + 1, dc, config)).toBe('none');
    expect(injuryOutcome(dc - 1, dc, config)).toBe('injury');
    expect(injuryOutcome(dc - config.criticalMargin + 1, dc, config)).toBe('injury');
    expect(injuryOutcome(dc - config.criticalMargin, dc, config)).toBe('critical');
    expect(injuryOutcome(dc - config.criticalMargin - 1, dc, config)).toBe('critical');
  });

  it('moves with criticalMargin and with nothing else', () => {
    for (const criticalMargin of [1, 4, 9, 15]) {
      const config: GameConfig = { ...defaultConfig, criticalMargin };
      expect(injuryOutcome(10 - criticalMargin, 10, config)).toBe('critical');
      expect(injuryOutcome(10 - criticalMargin + 1, 10, config)).toBe(
        criticalMargin === 1 ? 'none' : 'injury',
      );
    }
  });

  it('is pure: the same answer for the same numbers, and it draws nothing', () => {
    const config = defaultConfig;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(injuryOutcome(3, 14, config)).toBe('critical');
      expect(injuryOutcome(13, 14, config)).toBe('injury');
      expect(injuryOutcome(14, 14, config)).toBe('none');
    }
  });

  it('adds no fourth BeatResult: a critical failure is still reported as a failure', () => {
    const run = work('harm-still-a-failure', plain, {
      ...ALWAYS_FAILS,
      ...ALWAYS_CRITICAL,
      injuryChanceOnFailure: 0,
      scarChanceOnCriticalFailure: 0,
      deathChanceOnCriticalFailure: 0,
    });
    const beats = of(run.events, 'BeatResolved');
    expect(beats.length).toBeGreaterThan(0);
    for (const beat of beats) {
      expect(beat.result).toBe('failure');
      expect(injuryOutcome(beat.total, beat.dc, run.career.config)).toBe('critical');
    }
  });
});

describe('an Injury from a plain failure', () => {
  it('is given to the slot Hero, with a span from the configured range', () => {
    const run = work('harm-injury', plain, {
      ...ALWAYS_FAILS,
      ...NEVER_CRITICAL,
      injuryChanceOnFailure: 1,
      injurySpanMin: 15,
      injurySpanMax: 30,
    });
    const injuries = of(run.events, 'HeroInjured');
    expect(injuries.length).toBeGreaterThan(0);

    const beats = of(run.events, 'BeatResolved');
    for (const injury of injuries) {
      const beat = beats.find((entry) => entry.beatIndex === injury.beatIndex);
      expect(injury.heroId).toBe(beat?.heroId);
      expect(injury.partyId).toBe(beat?.partyId);
      const span = injury.liftsOn - injury.day;
      expect(span).toBeGreaterThanOrEqual(run.career.config.injurySpanMin);
      expect(span).toBeLessThanOrEqual(run.career.config.injurySpanMax);
    }
  });

  it('is a Trait of kind injury, and the mechanical TraitGained fires beside it', () => {
    const run = work('harm-injury-trait', plain, {
      ...ALWAYS_FAILS,
      ...NEVER_CRITICAL,
      injuryChanceOnFailure: 1,
    });
    const injuries = of(run.events, 'HeroInjured');
    const gained = of(run.events, 'TraitGained');
    expect(injuries.length).toBeGreaterThan(0);

    const kinds = new Map(plain.traits.map((trait) => [trait.name, trait.kind]));
    for (const injury of injuries) {
      expect(kinds.get(injury.trait)).toBe('injury');
      const pair = gained.find(
        (event) => event.day === injury.day && event.heroId === injury.heroId && event.trait === injury.trait,
      );
      expect(pair, 'TraitGained is the mechanical fact and still fires').toBeDefined();
      expect(pair?.liftsOn).toBe(injury.liftsOn);
    }
  });

  it('never gives a Trait the Hero already holds, and gives at most one per Beat', () => {
    const run = work('harm-no-repeats', plain, {
      ...ALWAYS_FAILS,
      ...NEVER_CRITICAL,
      injuryChanceOnFailure: 1,
      injurySpanMin: 400,
      injurySpanMax: 400,
    });
    const injuries = of(run.events, 'HeroInjured');
    const scars = of(run.events, 'HeroScarred');
    expect(injuries.length).toBeGreaterThan(0);
    expect(scars).toHaveLength(0);

    // Four Beats, one Hero, spans long enough that nothing lifts in between: the second
    // Injury is a different Trait from the first, and the pool runs out rather than
    // repeating. One harm per Beat, so never two on the same beatIndex.
    const perBeat = new Map<number, number>();
    for (const injury of injuries) {
      perBeat.set(injury.beatIndex ?? -1, (perBeat.get(injury.beatIndex ?? -1) ?? 0) + 1);
    }
    for (const [beatIndex, count] of perBeat) {
      expect(count, `Beat ${beatIndex}`).toBe(1);
    }
    const byHero = new Map<string, string[]>();
    for (const injury of injuries) {
      byHero.set(injury.heroId, [...(byHero.get(injury.heroId) ?? []), injury.trait]);
    }
    for (const [heroId, traits] of byHero) {
      expect(new Set(traits).size, heroId).toBe(traits.length);
    }
    // And the pool is finite: the fixture ships two Injury Traits, so one Hero can never
    // be given more than two before it is exhausted.
    const injuryTraits = plain.traits.filter((trait) => trait.kind === 'injury').length;
    for (const [heroId, traits] of byHero) {
      expect(traits.length, heroId).toBeLessThanOrEqual(injuryTraits);
    }
  });

  it('never fires on a Check that was not failed', () => {
    const run = work('harm-success', plain, {
      dcMin: 1,
      dcMax: 1,
      injuryChanceOnFailure: 1,
      scarChanceOnCriticalFailure: 1,
      deathChanceOnCriticalFailure: 1,
    });
    expect(of(run.events, 'BeatResolved').length).toBeGreaterThan(0);
    expect(of(run.events, 'HeroInjured')).toHaveLength(0);
    expect(of(run.events, 'HeroScarred')).toHaveLength(0);
    expect(of(run.events, 'HeroDied')).toHaveLength(0);
  });

  it('does not fire at all when the chance is zero', () => {
    const run = work('harm-off', plain, {
      ...ALWAYS_FAILS,
      ...NEVER_CRITICAL,
      injuryChanceOnFailure: 0,
    });
    expect(of(run.events, 'BeatResolved').length).toBeGreaterThan(0);
    expect(of(run.events, 'HeroInjured')).toHaveLength(0);
  });
});

describe('authored harm', () => {
  it('suppresses engine-supplied harm entirely', () => {
    // The same world twice, differing only in whether the Vignette's failure outcome
    // carries a `trait` Consequence of its own. Both fail every Check, and both would
    // otherwise be injured on every one of them.
    const forced: Partial<GameConfig> = {
      ...ALWAYS_FAILS,
      ...NEVER_CRITICAL,
      injuryChanceOnFailure: 1,
      injurySpanMin: 20,
      injurySpanMax: 20,
    };
    const engine = work('authored-wins', plain, forced);
    const content = work('authored-wins', authored, forced);

    expect(of(engine.events, 'HeroInjured').length).toBeGreaterThan(0);
    expect(of(content.events, 'HeroInjured')).toHaveLength(0);

    // The authored Trait did land, with the span the content asked for and not the one
    // the engine would have drawn.
    const gained = of(content.events, 'TraitGained');
    expect(gained.length).toBeGreaterThan(0);
    for (const event of gained) {
      expect(event.trait).toBe('Bruised');
      expect(event.liftsOn).toBe(event.day + 4);
    }
  });

  it('suppresses a Scar and a Death as well as an Injury', () => {
    const run = work('authored-wins-critical', authored, {
      ...ALWAYS_FAILS,
      ...ALWAYS_CRITICAL,
      deathChanceOnCriticalFailure: 1,
      scarChanceOnCriticalFailure: 1,
    });
    expect(of(run.events, 'BeatResolved').length).toBeGreaterThan(0);
    expect(of(run.events, 'HeroDied')).toHaveLength(0);
    expect(of(run.events, 'HeroScarred')).toHaveLength(0);
    expect(run.career.guild.roster).toHaveLength(run.career.config.startingHeroes);
  });
});

describe('a critical failure', () => {
  it('checks Death before the Scar, so the rare case is not swallowed by the common one', () => {
    // Both are certain. If the Scar were drawn first there would be no Death at all.
    const run = work('harm-order', plain, {
      ...ALWAYS_FAILS,
      ...ALWAYS_CRITICAL,
      deathChanceOnCriticalFailure: 1,
      scarChanceOnCriticalFailure: 1,
    });
    expect(of(run.events, 'HeroDied').length).toBeGreaterThan(0);
    expect(of(run.events, 'HeroScarred')).toHaveLength(0);
  });

  it('leaves a Scar when Death does not fall, and the Scar never lifts', () => {
    const run = work('harm-scar', plain, {
      ...ALWAYS_FAILS,
      ...ALWAYS_CRITICAL,
      deathChanceOnCriticalFailure: 0,
      scarChanceOnCriticalFailure: 1,
    });
    const scars = of(run.events, 'HeroScarred');
    expect(scars.length).toBeGreaterThan(0);
    expect(of(run.events, 'HeroDied')).toHaveLength(0);

    const kinds = new Map(plain.traits.map((trait) => [trait.name, trait.kind]));
    for (const scar of scars) expect(kinds.get(scar.trait)).toBe('scar');

    // A Scar carries no span, so nothing can ever lift it: five hundred Days on.
    const scarred = run.career.guild.roster.find((hero) => hero.id === scars[0]?.heroId);
    expect(scarred?.traits.some((trait) => trait.name === scars[0]?.trait)).toBe(true);
    const later = advance(run.career, 500, plain);
    const still = later.career.guild.roster.find((hero) => hero.id === scars[0]?.heroId);
    if (still !== undefined) {
      expect(still.traits.some((trait) => trait.name === scars[0]?.trait)).toBe(true);
    }
    for (const trait of still?.traits ?? []) {
      if (kinds.get(trait.name) === 'scar') expect(trait.liftsOn).toBeUndefined();
    }
  });

  it('does neither when both chances are zero', () => {
    const run = work('harm-critical-off', plain, {
      ...ALWAYS_FAILS,
      ...ALWAYS_CRITICAL,
      deathChanceOnCriticalFailure: 0,
      scarChanceOnCriticalFailure: 0,
    });
    expect(of(run.events, 'BeatResolved').length).toBeGreaterThan(0);
    expect(of(run.events, 'HeroScarred')).toHaveLength(0);
    expect(of(run.events, 'HeroDied')).toHaveLength(0);
  });
});

describe('a Hero who dies mid-Commission', () => {
  const deadly: Partial<GameConfig> = {
    ...ALWAYS_FAILS,
    ...ALWAYS_CRITICAL,
    deathChanceOnCriticalFailure: 1,
  };

  it('leaves the Roster for formerHeroes with an exit that says so, and never returns', () => {
    const run = work('death-exit', plain, deadly, 2);
    const died = of(run.events, 'HeroDied');
    expect(died.length).toBeGreaterThan(0);

    const gone = died[0];
    if (gone === undefined) throw new Error('the test expected a Death');
    expect(run.career.guild.roster.map((hero) => hero.id)).not.toContain(gone.heroId);
    const former = run.career.guild.formerHeroes.find((hero) => hero.id === gone.heroId);
    expect(former?.exit?.kind).toBe('death');
    expect(former?.exit?.onDay).toBe(gone.day);
    expect(former?.exit?.reason.length ?? 0).toBeGreaterThan(0);
    expect(former?.name.length ?? 0).toBeGreaterThan(0);
    expect(run.career.ledger.heroesDied).toBe(new Set(died.map((event) => event.heroId)).size);

    // Five hundred Days later they are still gone, and still readable.
    const later = advance(run.career, 500, plain).career;
    expect(later.guild.roster.map((hero) => hero.id)).not.toContain(gone.heroId);
    expect(later.guild.formerHeroes.map((hero) => hero.id)).toContain(gone.heroId);
  });

  it('stops appearing in later Beats, and the Party carries on short-handed', () => {
    const run = work('death-short-handed', plain, deadly, 2);
    const died = of(run.events, 'HeroDied');
    const beats = of(run.events, 'BeatResolved');
    expect(died.length).toBeGreaterThan(0);
    expect(beats.length).toBeGreaterThan(1);

    const first = died[0];
    if (first === undefined) throw new Error('the test expected a Death');
    const afterwards = beats.filter(
      (beat) => beat.day > first.day || (beat.beatIndex ?? 0) > (first.beatIndex ?? 0),
    );
    for (const beat of afterwards) {
      expect(beat.heroId, 'a dead Hero cannot take a later Check').not.toBe(first.heroId);
      expect(beat.slots.heroId).not.toBe(first.heroId);
    }

    // The Party that came home names only the people who walked back through the door.
    const home = of(run.events, 'PartyReturned');
    for (const returned of home) {
      expect(returned.heroIds).not.toContain(first.heroId);
    }
  });

  it('returns a wholly dead Party at once, with succeeded false and no fee', () => {
    const run = work('death-whole-party', plain, deadly, 1);
    const died = of(run.events, 'HeroDied');
    const home = of(run.events, 'PartyReturned');
    expect(died.length).toBeGreaterThan(0);
    expect(home).toHaveLength(1);

    const returned = home[0];
    const last = died[died.length - 1];
    if (returned === undefined || last === undefined) throw new Error('the test expected both');
    expect(returned.succeeded).toBe(false);
    expect(returned.feePaid).toBe(0);
    expect(returned.heroIds).toEqual([]);
    // Home on the Day the last of them died, not on the Day the Commission was due.
    expect(returned.day).toBe(last.day);
    expect(run.career.parties).toHaveLength(0);
    expect(of(run.events, 'CoinChanged').filter((event) => event.reason === 'fee')).toHaveLength(0);
  });

  it('is survivable when the whole Roster is lost to it: the Career still reaches an ending', () => {
    const opened = newCareer('death-everyone', plain, {
      ...deadly,
      careerYears: 1,
      daysPerYear: 120,
      commissionSpanMin: 4,
      commissionSpanMax: 4,
      beatsMin: 4,
      beatsMax: 4,
    });
    let career = opened.career;
    // Send everybody, over and over, until there is nobody left to send.
    for (let round = 0; round < 12 && career.guild.roster.length > 0; round += 1) {
      const commission = career.board[0];
      const free = availableHeroes(career).map((hero) => hero.id);
      if (commission !== undefined && free.length > 0) {
        career = commitParty(career, commission.id, free, plain).career;
      }
      career = advance(career, 10, plain).career;
      if (career.ended !== undefined) break;
    }
    expect(career.guild.roster).toHaveLength(0);
    expect(career.guild.formerHeroes.length).toBeGreaterThan(0);

    const ending = advance(career, 200, plain);
    expect(ending.career.ended).toBeDefined();
    expect(ending.career.ended?.reckoning.heroesOnRoster).toBe(0);
    expect(ending.career.ended?.reckoning.heroesLost).toBeGreaterThan(0);
  });
});

describe('the harm rules themselves', () => {
  it('reads every probability and every span from GameConfig and from nowhere else', () => {
    // No literal probability appears in the rule (E3-S1 acceptance; CLAUDE.md invariant 8).
    // This is the behavioural proof of it: each of the four numbers is driven to both of
    // its extremes through `newCareer`'s config alone, and the rule follows every time.
    const both: [Partial<GameConfig>, (events: readonly GameEvent[]) => number][] = [
      [{ ...NEVER_CRITICAL, injuryChanceOnFailure: 1 }, (events) => of(events, 'HeroInjured').length],
      [{ ...NEVER_CRITICAL, injuryChanceOnFailure: 0 }, (events) => of(events, 'HeroInjured').length],
      [
        { ...ALWAYS_CRITICAL, deathChanceOnCriticalFailure: 1 },
        (events) => of(events, 'HeroDied').length,
      ],
      [
        { ...ALWAYS_CRITICAL, deathChanceOnCriticalFailure: 0 },
        (events) => of(events, 'HeroDied').length,
      ],
      [
        { ...ALWAYS_CRITICAL, deathChanceOnCriticalFailure: 0, scarChanceOnCriticalFailure: 1 },
        (events) => of(events, 'HeroScarred').length,
      ],
      [
        { ...ALWAYS_CRITICAL, deathChanceOnCriticalFailure: 0, scarChanceOnCriticalFailure: 0 },
        (events) => of(events, 'HeroScarred').length,
      ],
    ];
    const counts = both.map(([config, read]) =>
      read(work('config-drives-harm', plain, { ...ALWAYS_FAILS, ...config }).events),
    );
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBe(0);
    expect(counts[2]).toBeGreaterThan(0);
    expect(counts[3]).toBe(0);
    expect(counts[4]).toBeGreaterThan(0);
    expect(counts[5]).toBe(0);

    // And the span is the configured range, wherever that range is put.
    const ranges: [number, number][] = [
      [1, 1],
      [15, 30],
      [99, 120],
    ];
    for (const [injurySpanMin, injurySpanMax] of ranges) {
      const run = work('config-drives-span', plain, {
        ...ALWAYS_FAILS,
        ...NEVER_CRITICAL,
        injuryChanceOnFailure: 1,
        injurySpanMin,
        injurySpanMax,
      });
      const injuries = of(run.events, 'HeroInjured');
      expect(injuries.length).toBeGreaterThan(0);
      for (const injury of injuries) {
        expect(injury.liftsOn - injury.day).toBeGreaterThanOrEqual(injurySpanMin);
        expect(injury.liftsOn - injury.day).toBeLessThanOrEqual(injurySpanMax);
      }
    }
  });

  it('moves with the configured chance, over a fleet of seeds', () => {
    // Not a distribution test: only that zero means never and one means always, which is
    // what makes every other test in this file able to drive the rule rather than the dice.
    let never = 0;
    let always = 0;
    for (let seed = 0; seed < 20; seed += 1) {
      const off = work(`chance-${seed}`, plain, {
        ...ALWAYS_FAILS,
        ...NEVER_CRITICAL,
        injuryChanceOnFailure: 0,
      });
      const on = work(`chance-${seed}`, plain, {
        ...ALWAYS_FAILS,
        ...NEVER_CRITICAL,
        injuryChanceOnFailure: 1,
      });
      never += of(off.events, 'HeroInjured').length;
      always += of(on.events, 'HeroInjured').length;
    }
    expect(never).toBe(0);
    expect(always).toBeGreaterThan(20);
  });

  it('does not touch the Career it was given', () => {
    const opened = newCareer('harm-immutable', plain, { ...ALWAYS_FAILS, injuryChanceOnFailure: 1 });
    const commission = opened.career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const sent = commitParty(
      opened.career,
      commission.id,
      [opened.career.guild.roster[0]?.id ?? ''],
      plain,
    ).career;
    const before = serialiseCareer(sent);
    advance(sent, 20, plain);
    expect(serialiseCareer(sent)).toBe(before);
  });

  it('leaves E1’s own authored Injury exactly as it was: Bruised, for six Days', () => {
    // `night-watch`'s failure outcome has given Bruised for six Days since E1, and it
    // still does — the span is the content's, and no engine harm is added beside it.
    const authoredSpan = 6;
    let proved = false;
    for (let seed = 0; seed < 12 && !proved; seed += 1) {
      const opened = newCareer(`authored-span-${seed}`, fixtureContent, {
        commissionSpanMin: 6,
        commissionSpanMax: 6,
      });
      const commission = opened.career.board[0];
      if (commission === undefined) throw new Error('the test expected a Commission');
      const run = advance(
        commitParty(
          opened.career,
          commission.id,
          opened.career.guild.roster.map((hero) => hero.id),
          fixtureContent,
        ).career,
        6,
        fixtureContent,
      );
      for (const applied of of(run.events, 'ConsequenceApplied')) {
        const consequence = applied.consequence;
        if (consequence.kind !== 'trait') continue;
        const gained = of(run.events, 'TraitGained').find(
          (entry) =>
            entry.day === applied.day &&
            entry.heroId === applied.heroId &&
            entry.trait === consequence.trait,
        );
        expect(gained).toBeDefined();
        expect(gained?.trait).toBe('Bruised');
        expect(gained?.liftsOn).toBe(applied.day + authoredSpan);
        // Authored harm wins, so nothing the engine drew landed on that Beat.
        expect(
          of(run.events, 'HeroInjured').filter(
            (event) => event.day === applied.day && event.heroId === applied.heroId,
          ),
        ).toHaveLength(0);
        proved = true;
      }
    }
    expect(proved, 'the fixture should have fired night-watch on at least one of these seeds').toBe(
      true,
    );
  });
});
