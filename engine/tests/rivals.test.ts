/**
 * E5-S1: Rivals gain Rosters and Regard.
 *
 * A Rival is a Guild-shaped thing that is still not a Guild (ADR-0003). It has people, a
 * Standing and an opinion of you, and it has no Hall, no Board, no coin and no
 * Guildmaster — which the first block below proves is not merely absent but *not
 * expressible*. The rest holds the other half of the story: a Hero is a Hero wherever they
 * work, so somebody on a Rival's Roster ages, retires and is serialised exactly as one of
 * yours is, and holds Regard for exactly one employer.
 */

import { describe, expect, it } from 'vitest';
import { advance } from '../src/career.js';
import { defaultConfig, type GameConfig } from '../src/config.js';
import {
  calibreStatBudget,
  deserialiseCareer,
  employerRegard,
  isPoachable,
  maxCalibreFor,
  newCareer,
  serialiseCareer,
  startingAge,
  statTotal,
  type AnyHero,
  type Career,
  type GameEvent,
  type Hero,
  type Rival,
  type RivalHero,
} from '../src/index.js';
import { deepFreeze, fixtureContent, gone, walkedOut } from './fixtures.js';

const content = fixtureContent;

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/** Everybody in the world, on whichever Roster they are standing on. */
function everybody(career: Career): AnyHero[] {
  return [
    ...career.guild.roster,
    ...career.guild.formerHeroes,
    ...career.rivals.flatMap((rival) => rival.roster),
  ];
}

describe('a Rival is not a Guild', () => {
  const career = newCareer('e5-not-a-guild', content).career;
  const rival = career.rivals[0];
  if (rival === undefined) throw new Error('the test expected a Rival');

  it('has a Roster, a Standing and a Regard for your Guild', () => {
    expect(rival.roster.length).toBeGreaterThan(0);
    expect(typeof rival.standing).toBe('number');
    expect(rival.regardForGuild.value).toBe(career.config.rivalStartingRegard);
    expect(rival.regardForGuild.nature).toBe('neutral');
    expect(rival.regardForGuild.reason.length).toBeGreaterThan(0);
  });

  it('has no Hall, no Board, no coin and no Guildmaster, and none of them is expressible', () => {
    // A type-level test as much as a runtime one: each `@ts-expect-error` fails the build
    // the moment somebody adds the field to `Rival` (ADR-0003 — "the unified type would
    // carry fields that are meaningless for one of its inhabitants").
    // @ts-expect-error a Rival has no Hall: the Hall is the player's premises
    expect(rival.hall).toBeUndefined();
    // @ts-expect-error a Rival has no Board: the Board is where work is offered to you
    expect(rival.board).toBeUndefined();
    // @ts-expect-error a Rival has no coin: money is the player's problem
    expect(rival.coin).toBeUndefined();
    // @ts-expect-error a Rival has no Guildmaster: the Guildmaster is the player (ADR-0007)
    expect(rival.guildmaster).toBeUndefined();

    // And the same read the other way: the keys a Rival actually carries, whole.
    expect(Object.keys(rival).sort()).toEqual(
      ['id', 'name', 'standing', 'roster', 'regardForGuild'].sort(),
    );
  });

  it('is not a Guild to the type checker either, in either direction', () => {
    // @ts-expect-error a Guild has a Guildmaster, a Hall and coin; a Rival has none of them
    const notAGuild: typeof career.guild = rival;
    // @ts-expect-error a Guild has no Standing of its own: the player's is derived
    const notARival: Rival = career.guild;
    expect(notAGuild.name).toBe(rival.name);
    expect(notARival.name).toBe(career.guild.name);
  });
});

describe('a Hero holds Regard for one employer at a time', () => {
  const career = newCareer('e5-one-employer', content).career;
  const mine = career.guild.roster[0];
  const theirs = career.rivals[0]?.roster[0];
  if (mine === undefined || theirs === undefined) throw new Error('the test expected both');

  it('does not type-check as the other, in either direction', () => {
    // @ts-expect-error one of yours holds Regard for the Guildmaster and never for a Rival
    const notTheirs: RivalHero = mine;
    // @ts-expect-error one of theirs holds Regard for a Rival and never for the Guildmaster
    const notMine: Hero = theirs;
    expect(notTheirs.id).toBe(mine.id);
    expect(notMine.id).toBe(theirs.id);
  });

  it('cannot be given the other one, even by hand', () => {
    /**
     * **The compiler is the assertion here, and nothing else is.** Each `@ts-expect-error`
     * below fails the build the moment the field it names stops being `never` — that is
     * the whole test, and it runs at `npm run typecheck` rather than at `npm test`.
     *
     * Finding F8, closed (DL-22). This block used to wrap each assignment in an arrow
     * function and assert the arrow `toBeDefined()`, which never invoked it and which is
     * true of every arrow function ever written. The assignments are now written plainly,
     * inside a branch nothing takes, so that nothing here pretends to be a runtime check.
     */
    const copyOfMine = { ...mine };
    const copyOfTheirs = { ...theirs };
    // @ts-expect-error `regardForRival` is `never` on somebody in your own employ
    copyOfMine.regardForRival = theirs.regardForRival;
    // @ts-expect-error `regardForGuildmaster` is `never` on somebody a Rival employs
    copyOfTheirs.regardForGuildmaster = mine.regardForGuildmaster;

    // What a runtime assertion *can* say, and now does: each of them holds exactly one of
    // the two, which is the fact the two `never`s exist to keep true.
    expect(mine.regardForRival).toBeUndefined();
    expect(theirs.regardForGuildmaster).toBeUndefined();
    expect(mine.regardForGuildmaster).toBeDefined();
    expect(theirs.regardForRival).toBeDefined();
  });

  it('answers `employerRegard` with whichever one it is', () => {
    expect(employerRegard(career, mine.id)).toEqual(mine.regardForGuildmaster);
    expect(employerRegard(career, theirs.id)).toEqual(theirs.regardForRival);
    expect(employerRegard(career, 'nobody-at-all')).toBeUndefined();
  });

  it('answers with nothing for somebody nobody employs', () => {
    const left = walkedOut(career, mine.id, 1);
    expect(left.guild.formerHeroes.map((hero) => hero.id)).toContain(mine.id);
    expect(employerRegard(left, mine.id)).toBeUndefined();
  });

  it('reads a deep-frozen Career without writing to it', () => {
    const frozen = deepFreeze(newCareer('e5-frozen', content).career);
    expect(() => employerRegard(frozen, mine.id)).not.toThrow();
    expect(() => isPoachable({ value: -3, reason: 'x', nature: 'neutral' }, frozen.config)).not.toThrow();
  });
});

describe('a Rival’s Roster as it is generated', () => {
  it('holds between rivalRosterMin and rivalRosterMax people, at a non-default range', () => {
    const wide = newCareer('e5-bounds', content, { rivalRosterMin: 2, rivalRosterMax: 3 }).career;
    for (const rival of wide.rivals) {
      expect(rival.roster.length, rival.id).toBeGreaterThanOrEqual(2);
      expect(rival.roster.length, rival.id).toBeLessThanOrEqual(3);
    }
    const narrow = newCareer('e5-bounds', content, { rivalRosterMin: 7, rivalRosterMax: 7 }).career;
    for (const rival of narrow.rivals) expect(rival.roster.length, rival.id).toBe(7);
  });

  it('gives everybody an id nobody else in the Career holds, and never reuses one', () => {
    const career = newCareer('e5-ids', content).career;
    const ids = [
      ...everybody(career).map((hero) => hero.id),
      ...career.patrons.map((patron) => patron.id),
      ...career.rivals.map((rival) => rival.id),
      ...career.board.map((commission) => commission.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    // `<rivalId>h<n>`: the namespace is its own, and the counter only ever goes up.
    for (const rival of career.rivals) {
      for (const hero of rival.roster) expect(hero.id).toMatch(/^r\d+h\d+$/);
    }
    const numbers = career.rivals
      .flatMap((rival) => rival.roster)
      .map((hero) => Number(/h(\d+)$/.exec(hero.id)?.[1]));
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(career.nextRivalHeroNumber).toBeGreaterThan(Math.max(...numbers));
  });

  it('gives everybody the age their own id earns, and never anybody else’s', () => {
    const career = newCareer('e5-ages', content).career;
    for (const rival of career.rivals) {
      for (const hero of rival.roster) {
        expect(hero.age, hero.id).toBe(startingAge(career.seed, hero.id, career.config));
      }
    }
  });

  it('draws their Regard for the Rival from the configured band, at a non-default one', () => {
    const career = newCareer('e5-regard-band', content, {
      rivalHeroRegardMin: 1,
      rivalHeroRegardMax: 2,
    }).career;
    for (const rival of career.rivals) {
      for (const hero of rival.roster) {
        expect(hero.regardForRival.value, hero.id).toBeGreaterThanOrEqual(1);
        expect(hero.regardForRival.value, hero.id).toBeLessThanOrEqual(2);
      }
    }
  });

  it('starts every Rival at the configured opinion of the Guild, at a non-default one', () => {
    const career = newCareer('e5-start-regard', content, { rivalStartingRegard: -2 }).career;
    for (const rival of career.rivals) expect(rival.regardForGuild.value, rival.id).toBe(-2);
  });

  it('gates their calibre on that Rival’s own stored Standing, as E4 gates an Applicant’s', () => {
    // Every Rival is put at a Standing that earns all three calibres, and then at one that
    // earns only the first, and the people they attract move with it. High Standing widens
    // the range rather than guaranteeing the top of it, exactly as it does for an
    // Applicant (E4-S1, CONTEXT · Standing).
    const high = newCareer('e5-calibre', content, { calibre2Standing: -100, calibre3Standing: -100 })
      .career;
    const low = newCareer('e5-calibre', content, { calibre2Standing: 900, calibre3Standing: 900 })
      .career;
    for (const rival of high.rivals) {
      for (const hero of rival.roster) {
        expect(hero.calibre, hero.id).toBeLessThanOrEqual(
          maxCalibreFor(rival.standing, high.config),
        );
      }
    }
    expect(high.rivals.flatMap((rival) => rival.roster).some((hero) => hero.calibre > 1)).toBe(true);
    for (const rival of low.rivals) {
      expect(maxCalibreFor(rival.standing, low.config)).toBe(1);
      for (const hero of rival.roster) expect(hero.calibre, hero.id).toBe(1);
    }

    // And the Stats they carry are the budget that calibre is worth, exactly (E4-S2).
    for (const rival of high.rivals) {
      for (const hero of rival.roster) {
        expect(statTotal(hero.stats), hero.id).toBe(calibreStatBudget(hero.calibre, high.config));
      }
    }
  });

  it('costs the same one draw for its size at every range, so nothing after it shifts', () => {
    /**
     * Finding F13, closed (DL-22). `rng.between(low, high)` takes **no** draw at all when
     * `high <= low`, so a Roster size drawn with it cost nothing at
     * `rivalRosterMin === rivalRosterMax` and the whole of that Rival's derived stream
     * shifted under a config change — the exact trap DL-20's "E5 must know" named and
     * DL-21 §1 claims to have designed around. The size now costs one draw at every range,
     * as `drawCalibre` does.
     *
     * The precise property that proves it: at `rivalRosterMin = rivalRosterMax = 6` a
     * Rival's people are the **first six** of the people the same seed gives that Rival at
     * a range wide enough to draw at least six — same ids, same names, same Stats, same
     * everything, because the size cost the same one draw either way and every draw after
     * it therefore lands in the same place.
     *
     * It holds for the **first** Rival unconditionally. Past that it depends on the
     * earlier Rivals having drawn the same size, because a Rival's ids come from a counter
     * the Rosters before them advanced and their names avoid the names those Rosters took.
     */
    const fixed = newCareer('e5-size-draw', content, { rivalRosterMin: 6, rivalRosterMax: 6 })
      .career;
    const wide = newCareer('e5-size-draw', content, { rivalRosterMin: 6, rivalRosterMax: 9 })
      .career;
    const theirs = fixed.rivals[0]?.roster ?? [];
    const others = wide.rivals[0]?.roster ?? [];
    expect(theirs).toHaveLength(6);
    expect(others.length).toBeGreaterThanOrEqual(6);
    expect(theirs).toEqual(others.slice(0, 6));

    // And at the shipped 4–8 the value is the one `between` gave, so nothing E5 pinned
    // moved: the same seed at the shipped defaults is the same world it always was.
    const shipped = newCareer('e5-size-draw', content).career;
    for (const rival of shipped.rivals) {
      expect(rival.roster.length, rival.id).toBeGreaterThanOrEqual(defaultConfig.rivalRosterMin);
      expect(rival.roster.length, rival.id).toBeLessThanOrEqual(defaultConfig.rivalRosterMax);
    }
  });

  it('takes not one draw from the Career’s own generator', () => {
    // The whole reason the Rosters come from a derived stream: world generation is
    // bit-identical with Rivals emptied and with Rivals full, so nothing E1 to E4 pinned
    // could have moved (E5 §5, DL-19 §1).
    const withPeople = newCareer('e5-no-draw', content).career;
    const without = newCareer('e5-no-draw', content, { rivalRosterMin: 0, rivalRosterMax: 0 })
      .career;
    expect(withPeople.rng).toEqual(without.rng);
    expect(withPeople.guild.roster).toEqual(without.guild.roster);
    expect(withPeople.patrons).toEqual(without.patrons);
    expect(withPeople.board).toEqual(without.board);
    expect(withPeople.rivals.map((rival) => [rival.id, rival.name, rival.standing])).toEqual(
      without.rivals.map((rival) => [rival.id, rival.name, rival.standing]),
    );
  });
});

describe('a Rival’s people are serialised with the Career', () => {
  it('survives a round trip with everything about them intact, over 120 played Days', () => {
    // Solvent for the whole of them, and asserted to be: without the coin this Career went
    // insolvent on Day 70 and the last fifty Days of the claim never happened (F7, DL-22).
    const opened = newCareer('e5-roundtrip', content, { startingCoin: 5_000_000 }).career;
    const run = advance(opened, 120, content);
    const played = run.career;
    expect(played.ended).toBeUndefined();
    expect(played.day).toBeGreaterThan(120);
    expect(run.events.filter((event) => event.type === 'BoardRefreshed')).toHaveLength(12);
    const there = deserialiseCareer(serialiseCareer(played));
    expect(there).toEqual(played);
    expect(serialiseCareer(there)).toBe(serialiseCareer(played));
    expect(there.rivals.flatMap((rival) => rival.roster).length).toBeGreaterThan(0);
  });

  it('refuses a document that gives one of them Regard for the Guildmaster too', () => {
    const career = newCareer('e5-exclusive-save', content).career;
    const raw = JSON.parse(serialiseCareer(career)) as {
      rivals: { roster: Record<string, unknown>[] }[];
    };
    const hero = raw.rivals[0]?.roster[0];
    if (hero === undefined) throw new Error('the test expected a Rival Hero');
    hero['regardForGuildmaster'] = { value: 0, reason: 'x', nature: 'neutral' };
    expect(() => deserialiseCareer(JSON.stringify(raw))).toThrow(
      /regardForGuildmaster is set on somebody a Rival employs/,
    );
  });

  it('refuses a document that gives one of yours Regard for a Rival', () => {
    const career = newCareer('e5-exclusive-save-2', content).career;
    const raw = JSON.parse(serialiseCareer(career)) as {
      guild: { roster: Record<string, unknown>[] };
    };
    const hero = raw.guild.roster[0];
    if (hero === undefined) throw new Error('the test expected a Hero');
    hero['regardForRival'] = { value: 0, reason: 'x', nature: 'neutral' };
    expect(() => deserialiseCareer(JSON.stringify(raw))).toThrow(
      /regardForRival is set on somebody in your own employ/,
    );
  });
});

describe('a Rival’s Heroes age and retire exactly as yours do', () => {
  it('gets a year older at every year boundary, at home and on every Roster', () => {
    // Coin enough that nobody is ever insolvent, because this measures birthdays and
    // a Career that ends in year one has none to measure.
    const career = newCareer('e5-ageing', content, {
      heroRetirementAge: 200,
      startingCoin: 100_000,
    }).career;
    const before = new Map(
      career.rivals.flatMap((rival) => rival.roster.map((hero) => [hero.id, hero.age] as const)),
    );
    const run = advance(career, career.config.daysPerYear * 2, content).career;
    for (const rival of run.rivals) {
      for (const hero of rival.roster) {
        const was = before.get(hero.id);
        if (was === undefined) continue; // churned in later, and younger for it
        expect(hero.age, hero.id).toBe(was + 2);
      }
    }
  });

  it('retires at the configured age, emits HeroRetired and leaves that Rival’s Roster', () => {
    const career = newCareer('e5-rival-retire', content, { rivalChurnChance: 0 }).career;
    const rival = career.rivals[0];
    const hero = rival?.roster[0];
    if (rival === undefined || hero === undefined) throw new Error('the test expected a Rival Hero');
    const aged = JSON.parse(serialiseCareer(career)) as Career;
    const target = aged.rivals[0]?.roster[0];
    if (target === undefined) throw new Error('the test expected a Rival Hero');
    target.age = career.config.heroRetirementAge;

    const run = advance(aged, career.config.boardRefreshEveryDays, content);
    const retired = of(run.events, 'HeroRetired').filter((event) => event.heroId === hero.id);
    expect(retired).toHaveLength(1);
    expect(retired[0]?.age).toBe(career.config.heroRetirementAge);
    expect(run.career.rivals[0]?.roster.map((entry) => entry.id)).not.toContain(hero.id);
    // They leave the world rather than the player's history: `formerHeroes` is the Guild's
    // own record of the people it lost, and this is not one of them (ADR-0003).
    expect(run.career.guild.formerHeroes.map((entry) => entry.id)).not.toContain(hero.id);
    // And the player's own ledger is untouched, because nobody of theirs retired.
    expect(run.career.ledger.heroesRetired).toBe(0);
  });
});

describe('two hundred Careers', () => {
  it('never has one person on two Rosters, and never one holding both employer Regards', () => {
    /**
     * Finding F7, closed (DL-22). This claimed to play 400 Days "so that churn, Retirement
     * and the Board have moved everything", and did not: the policy commits no Party, so
     * no fee ever comes in against Upkeep and every one of the 200 Careers went insolvent
     * on **Day 70**. Seven Board refreshes, not forty, and not one `HeroRetired`.
     *
     * Two config overrides put that right, and the run now asserts it rather than
     * assuming it. `startingCoin` keeps the Guild solvent for the whole 400 Days without
     * anybody having to work — the cheapest honest way to buy the Days this wants.
     * `heroRetirementAge` is brought within reach of them, because 400 Days is one year
     * and one month and nobody generated between 22 and 40 retires at 55 inside it,
     * however long the Career is otherwise solvent.
     */
    const played: Partial<GameConfig> = { startingCoin: 5_000_000, heroRetirementAge: 41 };
    const broken: string[] = [];
    let refreshes = 0;
    let churned = 0;
    let rivalsRetired = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const at = `seed ${seed}`;
      const opened = newCareer(`e5-two-rosters-${seed}`, content, played).career;
      // Played far enough for churn, Retirement and the Board to have moved everything.
      const run = advance(opened, 400, content);
      const career = run.career;
      if (career.ended !== undefined) {
        broken.push(`${at}: the Career ended on Day ${String(career.ended.onDay)}`);
      }
      if (career.day <= 400) broken.push(`${at}: only reached Day ${String(career.day)}`);
      for (const event of run.events) {
        if (event.type === 'BoardRefreshed') refreshes += 1;
        if (event.type === 'RivalRosterChanged') churned += 1;
        if (event.type === 'HeroRetired' && /^r\d+h\d+$/.test(event.heroId)) rivalsRetired += 1;
      }

      const seen = new Map<string, string>();
      const place = (hero: AnyHero, where: string): void => {
        // Read out first, so that the checks below are against values rather than against
        // a `hero` the type checker has already narrowed to `never` for holding both.
        const { id } = hero;
        const forGuildmaster = hero.regardForGuildmaster;
        const forRival = hero.regardForRival;
        const already = seen.get(id);
        if (already !== undefined) broken.push(`${at}: ${id} is on ${already} and ${where}`);
        seen.set(id, where);
        if (forGuildmaster !== undefined && forRival !== undefined) {
          broken.push(`${at}: ${id} holds Regard for two employers`);
        }
        if (
          forGuildmaster === undefined &&
          forRival === undefined &&
          where !== 'the Guild’s history'
        ) {
          broken.push(`${at}: ${id} holds Regard for nobody`);
        }
      };
      for (const hero of career.guild.roster) place(hero, 'your Roster');
      for (const rival of career.rivals) for (const hero of rival.roster) place(hero, rival.name);
      for (const hero of career.guild.formerHeroes) place(hero, 'the Guild’s history');
    }
    expect(broken.slice(0, 10)).toEqual([]);
    // It cannot pass vacuously again: forty refreshes a Career, churn throughout, and
    // Rival Heroes actually reaching the end of a working life.
    expect(refreshes).toBeGreaterThanOrEqual(200 * 40);
    expect(churned).toBeGreaterThan(200);
    expect(rivalsRetired).toBeGreaterThan(0);
  }, 300_000);
});

describe('somebody the Guild has lost', () => {
  it('is readable in the Guild’s history with no employer Regard to read', () => {
    const career = newCareer('e5-history', content).career;
    const ids = career.guild.roster.map((hero) => hero.id);
    const after = gone(walkedOut(career, ids[0] ?? '', 1), ids[1] ?? '', 'death', 1);
    for (const hero of after.guild.formerHeroes) {
      expect(employerRegard(after, hero.id), hero.id).toBeUndefined();
      // They keep what they thought of the Guildmaster, which is what `HeroDeparted` and
      // the reckoning read; it is simply not a live employer Regard any more.
      expect(hero.regardForGuildmaster).toBeDefined();
    }
  });
});

describe('the config E5 adds', () => {
  it('ships every field with the default E5 §4 adopted', () => {
    expect(defaultConfig.rivalRosterMin).toBe(4);
    expect(defaultConfig.rivalRosterMax).toBe(8);
    expect(defaultConfig.rivalChurnChance).toBe(0.3);
    expect(defaultConfig.transferFeeBase).toBe(100);
    expect(defaultConfig.transferFeePerCalibre).toBe(50);
    expect(defaultConfig.transferConsentRegard).toBe(0);
    expect(defaultConfig.transferJoiningRegard).toBe(0);
    expect(defaultConfig.poachFeeFactor).toBe(0.5);
    expect(defaultConfig.poachRegardThreshold).toBe(-2);
    // INPUTS 6.3 offered −5; E5 §3 adopted −3, so souring has somewhere to escalate to.
    expect(defaultConfig.poachRivalRegardCost).toBe(3);
    expect(defaultConfig.retaliationRegardThreshold).toBe(-3);
    expect(defaultConfig.souredRivalThreshold).toBe(-3);
    expect(defaultConfig.souredRivalExtraTakes).toBe(1);
    expect(defaultConfig.rivalTakesMax).toBe(3);
  });

  it('is all numbers, so `--config key=value` and the save can carry every one of them', () => {
    for (const [key, value] of Object.entries(defaultConfig)) {
      expect(typeof value, key).toBe('number');
    }
  });
});
