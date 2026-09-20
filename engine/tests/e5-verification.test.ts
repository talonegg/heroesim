/**
 * Independent verification of E5, written after the fact and against the public API only.
 *
 * Nothing here was written by the agent that built E5. Every engine symbol comes from
 * `../src/index.js`, so a rule that is only reachable through an internal module is not
 * reachable from here at all — which is the point: this is the engine as a front end, a
 * save file and a determined player actually meet it.
 *
 * The blocks are adversarial rather than illustrative: the exact boundary rather than a
 * comfortable value either side of it, degenerate configuration rather than the shipped
 * defaults, and the long loops — Transfer, Departure, return, Poaching, retaliation,
 * Poaching again — that no single-rule test walks end to end.
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  advance,
  advanceUntilAttention,
  commitParty,
  deserialiseCareer,
  employerRegard,
  EngineError,
  isPoachable,
  league,
  maxCalibreFor,
  moveRefusal,
  newCareer,
  poachFee,
  poachHero,
  proposeParty,
  rivalById,
  rivalHeroById,
  rivalHeroOffer,
  rivalOffers,
  serialiseCareer,
  souredRivals,
  statTotal,
  standing,
  transferFee,
  transferHero,
  type AnyHero,
  type Career,
  type GameEvent,
  type Hero,
  type RivalHero,
} from '../src/index.js';
import { deepFreeze, fixtureContent, oneVignetteContent, roomyNameContent } from './fixtures.js';

const content = fixtureContent;

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/**
 * A copy of a Career with one change made to it, taken **through the public save round
 * trip** rather than through an internal clone — so every constructed state in this file
 * is one `deserialiseCareer` has already agreed is a legal world.
 */
function edit(career: Career, change: (draft: Career) => void): Career {
  const copy = deserialiseCareer(serialiseCareer(career));
  change(copy);
  // And again, so that a change this file makes by hand is itself checked at the boundary.
  return deserialiseCareer(serialiseCareer(copy));
}

function firstRival(career: Career, id = 'r1'): { rival: NonNullable<ReturnType<typeof rivalById>>; hero: RivalHero } {
  const rival = rivalById(career, id);
  if (rival === undefined) throw new Error(`no Rival ${id}`);
  const hero = rival.roster[0];
  if (hero === undefined) throw new Error(`Rival ${id} employs nobody`);
  return { rival, hero };
}

/** Somebody a Rival employs, put at a Regard the opening world will not have dealt. */
function rivalHeroAt(career: Career, heroId: string, value: number): Career {
  return edit(career, (draft) => {
    for (const rival of draft.rivals) {
      for (const person of rival.roster) {
        if (person.id === heroId) person.regardForRival = { ...person.regardForRival, value };
      }
    }
  });
}

// ── The exact edges of a Transfer ───────────────────────────────────────────

describe('a Transfer at the exact edge of what the Guild can do', () => {
  const base = newCareer('e5v-edge', content).career;
  const { hero } = firstRival(base);
  const fee = transferFee(hero, base.config);

  it('goes through on coin exactly equal to the fee, and leaves nothing behind', () => {
    const exact = edit(base, (draft) => {
      draft.guild.coin = fee;
    });
    expect(moveRefusal(exact, firstRival(exact).rival, firstRival(exact).hero, 'transfer')).toBeUndefined();
    const step = transferHero(exact, 'r1', hero.id);
    expect(of(step.events, 'HeroTransferred')).toHaveLength(1);
    expect(step.career.guild.coin).toBe(0);
    expect(of(step.events, 'CoinChanged')[0]?.balance).toBe(0);
  });

  it('is refused one coin short, and says exactly how short', () => {
    const short = edit(base, (draft) => {
      draft.guild.coin = fee - 1;
    });
    const step = transferHero(short, 'r1', hero.id);
    expect(of(step.events, 'TransferRefused')[0]?.reason).toBe('coin');
    expect(rivalHeroOffer(short, 'r1', hero.id)?.transferRefusal).toEqual({
      reason: 'coin',
      shortfall: 1,
    });
    expect(serialiseCareer(step.career)).toBe(serialiseCareer(short));
  });

  it('fills the last place on the Roster and refuses the one after it', () => {
    const roomForOne = edit(base, (draft) => {
      draft.guild.coin = 10_000;
      draft.config.rosterCap = draft.guild.roster.length + 1;
    });
    const ids = (rivalById(roomForOne, 'r1')?.roster ?? []).map((person) => person.id);
    expect(ids.length).toBeGreaterThan(1);
    const filled = transferHero(roomForOne, 'r1', ids[0] ?? '');
    expect(of(filled.events, 'HeroTransferred')).toHaveLength(1);
    expect(filled.career.guild.roster.length).toBe(filled.career.config.rosterCap);
    const over = transferHero(filled.career, 'r1', ids[1] ?? '');
    expect(of(over.events, 'TransferRefused')[0]?.reason).toBe('rosterFull');
    expect(serialiseCareer(over.career)).toBe(serialiseCareer(filled.career));
  });
});

// ── Saving in the middle of it ──────────────────────────────────────────────

describe('a save taken in the middle of dealing with the other Guilds', () => {
  /** A Career in which somebody has crossed in every direction E5 allows. */
  function movedEveryWay(seed: string): Career {
    let career = edit(newCareer(seed, content).career, (draft) => {
      draft.guild.coin = 100_000;
      draft.config.rosterCap = 20;
    });
    const above = firstRival(career, 'r1').hero.id;
    career = transferHero(career, 'r1', above).career;
    const below = firstRival(career, 'r2').hero.id;
    career = poachHero(rivalHeroAt(career, below, -5), 'r2', below).career;
    // And one taken back off the player by the Rival they wronged.
    career = edit(career, (draft) => {
      for (const rival of draft.rivals) {
        rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
        rival.roster = rival.roster.slice(0, 1);
      }
      for (const person of draft.guild.roster) {
        person.regardForGuildmaster = { ...person.regardForGuildmaster, value: -4 };
      }
    });
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    expect(of(run.events, 'RivalPoachedHero').length).toBeGreaterThan(0);
    return run.career;
  }

  it('loads twice to the same bytes, and to the same Career', () => {
    const career = movedEveryWay('e5v-save');
    const written = serialiseCareer(career);
    const once = deserialiseCareer(written, content);
    const twice = deserialiseCareer(written, content);
    expect(serialiseCareer(once)).toBe(written);
    expect(serialiseCareer(twice)).toBe(written);
    expect(once).toEqual(twice);
  });

  it('carries on exactly as it would have without being saved at all', () => {
    const career = movedEveryWay('e5v-resume');
    const straight = advance(career, 200, content);
    const viaSave = advance(deserialiseCareer(serialiseCareer(career), content), 200, content);
    expect(serialiseCareer(viaSave.career)).toBe(serialiseCareer(straight.career));
    expect(viaSave.events).toEqual(straight.events);
  });
});

describe('a save written before Rivals had people', () => {
  /** An E4-era document: Rivals with a name and a Standing and nothing else. */
  function e4Document(seed: string): string {
    const career = newCareer(seed, content).career;
    const raw = JSON.parse(serialiseCareer(career)) as Record<string, unknown>;
    raw['rivals'] = (raw['rivals'] as Record<string, unknown>[]).map((rival) => ({
      id: rival['id'],
      name: rival['name'],
      standing: rival['standing'],
    }));
    raw['nextRivalHeroNumber'] = undefined;
    return JSON.stringify(raw);
  }

  it('is given the Rosters a Career on that seed would have had, when content is passed', () => {
    const loaded = deserialiseCareer(e4Document('e5v-e4-save'), content);
    const fresh = newCareer('e5v-e4-save', content).career;
    expect(loaded.rivals.map((rival) => rival.roster.map((hero) => hero.id))).toEqual(
      fresh.rivals.map((rival) => rival.roster.map((hero) => hero.id)),
    );
    expect(loaded.rivals.map((rival) => rival.roster.length).every((size) => size > 0)).toBe(true);
  });

  it('loads with EMPTY Rosters when content is not passed, and says so to every reader', () => {
    // The honest characterisation of the optional argument (DL-21 §13). A caller that
    // forgets it does not throw and does not get the Rosters: it gets a world in which
    // every other Guild employs nobody, until the engine is next handed content.
    const bare = deserialiseCareer(e4Document('e5v-e4-save'));
    expect(bare.rivals.map((rival) => rival.roster.length)).toEqual([0, 0, 0, 0]);
    // Every read-only selector agrees with that empty world rather than refusing it.
    expect(rivalOffers(bare, 'r1')).toEqual([]);
    expect(league(bare).filter((row) => !row.isPlayer).map((row) => row.rosterSize)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(souredRivals(bare)).toEqual([]);
    // And it is repaired at the first `advance`, before a Day is stepped — the same
    // Rosters, and the same bytes as the Career that was loaded with content.
    const withContent = deserialiseCareer(e4Document('e5v-e4-save'), content);
    expect(serialiseCareer(advance(bare, 1, content).career)).toBe(
      serialiseCareer(advance(withContent, 1, content).career),
    );
  });

  it('is not refilled behind the player once a Roster has been emptied by play', () => {
    let career = edit(newCareer('e5v-emptied', content).career, (draft) => {
      draft.guild.coin = 100_000;
      draft.config.rosterCap = 30;
    });
    for (const id of (rivalById(career, 'r1')?.roster ?? []).map((hero) => hero.id)) {
      career = transferHero(career, 'r1', id).career;
    }
    expect(rivalById(career, 'r1')?.roster).toEqual([]);
    const reloaded = deserialiseCareer(serialiseCareer(career), content);
    expect(reloaded.rivals[0]?.roster).toEqual([]);
  });
});

// ── What a person carries with them ─────────────────────────────────────────

describe('somebody who crosses carrying something', () => {
  const base = edit(newCareer('e5v-carries', content).career, (draft) => {
    draft.guild.coin = 100_000;
  });

  it('keeps an unexpired Injury, with the Day it lifts untouched', () => {
    const { hero } = firstRival(base);
    const injured = edit(base, (draft) => {
      const person = draft.rivals[0]?.roster[0];
      if (person === undefined) throw new Error('expected a Rival Hero');
      person.traits = [...person.traits, { name: 'Bruised', since: draft.day, liftsOn: draft.day + 17 }];
    });
    const step = transferHero(injured, 'r1', hero.id);
    const moved = step.career.guild.roster.find((person) => person.id === hero.id);
    expect(moved?.traits.find((trait) => trait.name === 'Bruised')?.liftsOn).toBe(base.day + 17);
    // And the engine's own readers agree they cannot be sent out.
    const commission = step.career.board[0];
    if (commission === undefined) throw new Error('expected a Commission');
    expect(() => commitParty(step.career, commission.id, [hero.id], content)).toThrow(EngineError);
  });

  it('keeps a refusing Scar, and refuses the work on the Day they arrive', () => {
    const { hero } = firstRival(base);
    const worn = edit(base, (draft) => {
      const person = draft.rivals[0]?.roster[0];
      if (person === undefined) throw new Error('expected a Rival Hero');
      person.traits = [...person.traits, { name: 'Worn', since: 1 }];
    });
    const step = transferHero(worn, 'r1', hero.id);
    const commission = step.career.board[0];
    if (commission === undefined) throw new Error('expected a Commission');
    const proposal = proposeParty(step.career, commission.id, [hero.id], content);
    expect(proposal.refusals.map((refusal) => refusal.trait)).toEqual(['Worn']);
  });

  it('keeps every opinion they had of the people they used to work beside', () => {
    // A Hero a Rival takes keeps their `regardFor`, which is a person's memory rather
    // than a Roster's bookkeeping (DL-21 §12). Drift and the Departure Check are put out
    // of reach so that the Hero this follows is taken rather than lost.
    const quiet = newCareer('e5v-carries-memory', content, {
      regardDecayAmount: 0,
      refusalRegardThreshold: -100,
    }).career;
    const soured = edit(quiet, (draft) => {
      draft.guild.coin = 100_000;
      for (const rival of draft.rivals) {
        rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
        rival.roster = rival.roster.slice(0, 1);
      }
      const mine = draft.guild.roster[0];
      if (mine === undefined) throw new Error('expected a Roster');
      mine.regardForGuildmaster = { ...mine.regardForGuildmaster, value: -5 };
    });
    const mine = soured.guild.roster[0];
    if (mine === undefined) throw new Error('expected a Roster');
    const before = JSON.stringify(mine.regardFor);
    const run = advance(soured, soured.config.boardRefreshEveryDays, content);
    const taken = run.career.rivals.flatMap((rival) => rival.roster).find((person) => person.id === mine.id);
    expect(taken).toBeDefined();
    expect(JSON.stringify(taken?.regardFor)).toBe(before);
  });
});

describe('the whole loop: brought over, walks out, comes back, taken on again', () => {
  it('keeps one id, one person and one honest age all the way round', () => {
    const opened = edit(
      newCareer('e5v-loop', content, {
        // The Departure Check can never be passed, so the Hero this test is about is lost
        // by the rule rather than by a seed hunt; and somebody who walked out is offered
        // their old place back at the first batch after they went.
        departureDc: 1000,
        returnCooldownDays: 0,
        returnAsApplicantChance: 1,
        transferJoiningRegard: -5,
      }).career,
      (draft) => {
        draft.guild.coin = 100_000;
      },
    );
    const { hero } = firstRival(opened);
    const crossed = transferHero(opened, 'r1', hero.id);
    const arrivedAt = crossed.career.day;
    const age = hero.age;

    // Out again: at −5 for the Guildmaster, the Departure Check fires and cannot be passed.
    let career = crossed.career;
    let walkedOut = false;
    for (let step = 0; step < 40 && !walkedOut; step += 1) {
      const run = advance(career, career.config.boardRefreshEveryDays, content);
      career = run.career;
      walkedOut = of(run.events, 'HeroDeparted').some((event) => event.heroId === hero.id);
    }
    expect(walkedOut).toBe(true);
    expect(career.guild.formerHeroes.map((person) => person.id)).toContain(hero.id);
    expect(career.guild.roster.map((person) => person.id)).not.toContain(hero.id);

    // And back to the door, under the id they left with.
    let offered = false;
    for (let step = 0; step < 60 && !offered; step += 1) {
      career = advance(career, 1, content).career;
      offered = career.applicants.some((applicant) => applicant.id === hero.id);
    }
    expect(offered).toBe(true);
    const asApplicant = career.applicants.find((applicant) => applicant.id === hero.id);
    expect(asApplicant?.formerHeroId).toBe(hero.id);
    // Their age came forward with the years, and was never re-derived from their id.
    expect(asApplicant?.age).toBe(age + Math.floor((career.day - arrivedAt) / career.config.daysPerYear));

    const taken = acceptApplicant(edit(career, (draft) => {
      draft.guild.coin = 100_000;
      draft.config.rosterCap = 30;
    }), hero.id);
    const back = taken.career.guild.roster.find((person) => person.id === hero.id);
    expect(back?.id).toBe(hero.id);
    expect(back?.age).toBe(asApplicant?.age);
    expect(taken.career.guild.formerHeroes.map((person) => person.id)).not.toContain(hero.id);
    expect(taken.career.applicants.map((applicant) => applicant.id)).not.toContain(hero.id);
    expect(back?.regardForRival).toBeUndefined();
  });
});

describe('two full cycles of taking and being taken back', () => {
  it('keeps the id and the age stable, and remembers what they thought of people', () => {
    let career = edit(
      newCareer('e5v-cycles', content, { regardDecayAmount: 0, refusalRegardThreshold: -100 })
        .career,
      (draft) => {
        draft.guild.coin = 100_000;
        draft.config.rosterCap = 30;
        for (const rival of draft.rivals) rival.roster = rival.roster.slice(0, 1);
      },
    );
    const { hero } = firstRival(career);
    const age = hero.age;
    const seen: string[] = [];

    for (let cycle = 0; cycle < 2; cycle += 1) {
      // Taken off them, without asking.
      career = poachHero(rivalHeroAt(career, hero.id, -5), 'r1', hero.id).career;
      const mine = career.guild.roster.find((person) => person.id === hero.id);
      expect(mine, `cycle ${cycle}: on your Roster`).toBeDefined();
      expect(mine?.age).toBe(age);
      seen.push(JSON.stringify(mine?.regardFor));

      // And taken straight back by the Guild that is now thoroughly soured.
      career = edit(career, (draft) => {
        for (const rival of draft.rivals) {
          rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
        }
        const person = draft.guild.roster.find((entry) => entry.id === hero.id);
        if (person === undefined) throw new Error('expected them on the Roster');
        person.regardForGuildmaster = { ...person.regardForGuildmaster, value: -5 };
        // Nobody else is takeable, so the one this test follows is the one taken.
        for (const entry of draft.guild.roster) {
          if (entry.id !== hero.id) entry.regardForGuildmaster = { ...entry.regardForGuildmaster, value: 5 };
        }
      });
      const run = advance(career, career.config.boardRefreshEveryDays, content);
      career = run.career;
      const back = of(run.events, 'RivalPoachedHero').map((event) => event.heroId);
      expect(back, `cycle ${cycle}: taken back`).toContain(hero.id);
      const theirs = rivalHeroById(career, hero.id);
      expect(theirs?.hero.age).toBe(age);
      expect(theirs?.hero.id).toBe(hero.id);
    }
    // What they think of the people they worked with survived both crossings.
    expect(seen[0]).toBe(seen[1]);
    expect(career.ledger.heroesPoachedIn).toBe(2);
    expect(career.ledger.heroesPoachedFromUs).toBe(2);
  });

  it('carries an unexpired Injury across when a Rival takes somebody', () => {
    const career = edit(
      newCareer('e5v-taken-hurt', content, { regardDecayAmount: 0, refusalRegardThreshold: -100 })
        .career,
      (draft) => {
        draft.guild.coin = 100_000;
        for (const rival of draft.rivals) {
          rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
          rival.roster = rival.roster.slice(0, 1);
        }
        const mine = draft.guild.roster[0];
        if (mine === undefined) throw new Error('expected a Roster');
        mine.regardForGuildmaster = { ...mine.regardForGuildmaster, value: -5 };
        mine.traits = [...mine.traits, { name: 'Bruised', since: draft.day, liftsOn: draft.day + 23 }];
        for (const entry of draft.guild.roster.slice(1)) {
          entry.regardForGuildmaster = { ...entry.regardForGuildmaster, value: 5 };
        }
      },
    );
    const mine = career.guild.roster[0];
    if (mine === undefined) throw new Error('expected a Roster');
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    const there = rivalHeroById(run.career, mine.id);
    expect(there).toBeDefined();
    expect(there?.hero.traits.find((trait) => trait.name === 'Bruised')?.liftsOn).toBe(
      career.day + 23,
    );
  });
});

// ── The order of the settling, one pair at a time ───────────────────────────

describe('the order of the settling, proved one pair at a time', () => {
  function soured(seed: string, overrides = {}): Career {
    return edit(
      newCareer(seed, content, { regardDecayAmount: 0, refusalRegardThreshold: -100, ...overrides })
        .career,
      (draft) => {
        draft.guild.coin = 100_000;
        for (const rival of draft.rivals) {
          rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
          rival.roster = rival.roster.slice(0, 1);
        }
      },
    );
  }

  it('lets a Hero retire on the very refresh a Rival would have taken them', () => {
    const career = edit(soured('e5v-order-1'), (draft) => {
      const mine = draft.guild.roster[0];
      if (mine === undefined) throw new Error('expected a Roster');
      mine.age = draft.config.heroRetirementAge;
      mine.regardForGuildmaster = { ...mine.regardForGuildmaster, value: -5 };
      for (const other of draft.guild.roster.slice(1)) {
        other.regardForGuildmaster = { ...other.regardForGuildmaster, value: 5 };
      }
    });
    const mine = career.guild.roster[0];
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    expect(of(run.events, 'HeroRetired').map((event) => event.heroId)).toContain(mine?.id);
    expect(of(run.events, 'RivalPoachedHero').map((event) => event.heroId)).not.toContain(mine?.id);
    expect(run.career.guild.formerHeroes.find((hero) => hero.id === mine?.id)?.exit?.kind).toBe(
      'retirement',
    );
  });

  it('lets a Hero depart on the very refresh a Rival would have taken them', () => {
    const career = edit(soured('e5v-order-2', { departureDc: 1000 }), (draft) => {
      for (const mine of draft.guild.roster) {
        mine.regardForGuildmaster = {
          ...mine.regardForGuildmaster,
          value: draft.config.departureRegardThreshold,
        };
      }
      // E2's own thresholds back on, so the Departure Check runs at all.
      draft.config.refusalRegardThreshold = -3;
    });
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    const departed = of(run.events, 'HeroDeparted').map((event) => event.heroId);
    const taken = of(run.events, 'RivalPoachedHero').map((event) => event.heroId);
    expect(departed.length).toBeGreaterThan(0);
    expect(departed.filter((id) => taken.includes(id))).toEqual([]);
    // The events say the same thing as the order: every Departure precedes every take.
    const types = run.events.map((event) => event.type);
    if (taken.length > 0) {
      expect(types.lastIndexOf('HeroDeparted')).toBeLessThan(types.indexOf('RivalPoachedHero'));
    }
  });

  it('settles a Rival’s own Retirement before that Rival tries to take anybody', () => {
    const career = edit(soured('e5v-order-3'), (draft) => {
      const theirs = draft.rivals[0]?.roster[0];
      if (theirs === undefined) throw new Error('expected a Rival Hero');
      theirs.age = draft.config.heroRetirementAge;
      for (const mine of draft.guild.roster) {
        mine.regardForGuildmaster = { ...mine.regardForGuildmaster, value: -5 };
      }
      draft.config.rivalRosterMax = 1;
      draft.config.rivalChurnChance = 0;
    });
    const theirs = career.rivals[0]?.roster[0];
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    expect(of(run.events, 'HeroRetired').map((event) => event.heroId)).toContain(theirs?.id);
    // Their Roster had no room until the Retirement made some, and the take follows it.
    const types = run.events.map((event) => event.type);
    expect(of(run.events, 'RivalPoachedHero').length).toBeGreaterThan(0);
    expect(types.indexOf('HeroRetired')).toBeLessThan(types.indexOf('RivalPoachedHero'));
  });

  it('churns after retaliation, so a Rival is at the size the take left them', () => {
    const career = edit(soured('e5v-order-4', { rivalChurnChance: 1, rivalChurnGainChance: 0 }), (draft) => {
      for (const mine of draft.guild.roster) {
        mine.regardForGuildmaster = { ...mine.regardForGuildmaster, value: -5 };
      }
      draft.config.rivalRosterMin = 0;
    });
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    const types = run.events.map((event) => event.type);
    expect(of(run.events, 'RivalPoachedHero').length).toBeGreaterThan(0);
    expect(of(run.events, 'RivalRosterChanged').length).toBeGreaterThan(0);
    expect(types.indexOf('RivalPoachedHero')).toBeLessThan(types.indexOf('RivalRosterChanged'));
  });
});

// ── How much can be lost at once ────────────────────────────────────────────

describe('how much a Guild can lose in one refresh, and what bounds it', () => {
  it('loses at most one Hero per soured Rival, however soured everybody is', () => {
    const career = edit(
      newCareer('e5v-bound', content, { regardDecayAmount: 0, refusalRegardThreshold: -100 })
        .career,
      (draft) => {
        draft.guild.coin = 1_000_000;
        draft.config.rosterCap = 30;
        for (const rival of draft.rivals) {
          rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
          rival.roster = [];
        }
        for (const mine of draft.guild.roster) {
          mine.regardForGuildmaster = { ...mine.regardForGuildmaster, value: -5 };
        }
        draft.config.rivalChurnChance = 0;
      },
    );
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    const taken = of(run.events, 'RivalPoachedHero');
    expect(taken.length).toBe(Math.min(career.rivals.length, career.guild.roster.length));
    expect(new Set(taken.map((event) => event.toRivalId)).size).toBe(taken.length);
    expect(run.career.ledger.heroesPoachedFromUs).toBe(taken.length);
  });

  it('takes nobody at all when every Rival Roster is already at its ceiling', () => {
    const career = edit(
      newCareer('e5v-full', content, {
        rivalRosterMin: 4,
        rivalRosterMax: 4,
        rivalChurnChance: 0,
        regardDecayAmount: 0,
        refusalRegardThreshold: -100,
      }).career,
      (draft) => {
        draft.guild.coin = 1_000_000;
        for (const rival of draft.rivals) {
          rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
        }
        for (const mine of draft.guild.roster) {
          mine.regardForGuildmaster = { ...mine.regardForGuildmaster, value: -5 };
        }
      },
    );
    for (const rival of career.rivals) expect(rival.roster).toHaveLength(4);
    const run = advance(career, career.config.boardRefreshEveryDays * 5, content);
    expect(of(run.events, 'RivalPoachedHero')).toEqual([]);
    // Yet they are still soured on the Board, which is the cost that is actually paid.
    expect(of(run.events, 'CommissionTakenByRival').length).toBeGreaterThan(0);
  });

  it('takes nobody from a Roster nobody is left on, and does not throw doing it', () => {
    const career = edit(
      newCareer('e5v-empty-roster', content, { rivalChurnChance: 0 }).career,
      (draft) => {
        draft.guild.coin = 1_000_000;
        draft.guild.roster = [];
        for (const rival of draft.rivals) {
          rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
          rival.roster = rival.roster.slice(0, 1);
        }
      },
    );
    const run = advance(career, career.config.boardRefreshEveryDays * 3, content);
    expect(of(run.events, 'RivalPoachedHero')).toEqual([]);
    expect(run.career.guild.roster).toEqual([]);
  });
});

// ── Degenerate configuration ────────────────────────────────────────────────

describe('configuration a player could actually type', () => {
  const shapes: [string, Record<string, number>][] = [
    ['no Rivals at all', { rivalCount: 0 }],
    ['one Rival', { rivalCount: 1 }],
    ['a Roster range that is upside down', { rivalRosterMin: 8, rivalRosterMax: 4 }],
    ['a Roster range of nothing', { rivalRosterMin: 0, rivalRosterMax: 0 }],
    ['Rivals that never take work', { rivalTakesPerRefresh: 0, rivalTakesMax: 0 }],
    ['churn that never fires', { rivalChurnChance: 0 }],
    ['churn that always fires', { rivalChurnChance: 1 }],
    ['churn that only ever gains', { rivalChurnChance: 1, rivalChurnGainChance: 1 }],
    ['churn that only ever loses', { rivalChurnChance: 1, rivalChurnGainChance: 0 }],
    ['a poaching threshold above the whole scale', { poachRegardThreshold: 5 }],
    ['a poaching threshold below it', { poachRegardThreshold: -6 }],
  ];

  for (const [what, overrides] of shapes) {
    it(`plays a whole Career out with ${what}`, () => {
      const career = edit(
        newCareer(`e5v-degenerate-${what}`, content, {
          careerYears: 2,
          ...overrides,
        }).career,
        (draft) => {
          draft.guild.coin = 1_000_000;
          for (const rival of draft.rivals) {
            rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
          }
          for (const mine of draft.guild.roster) {
            mine.regardForGuildmaster = { ...mine.regardForGuildmaster, value: -5 };
          }
        },
      );
      const run = advance(career, career.config.careerYears * career.config.daysPerYear + 5, content);
      expect(run.career.ended).toBeDefined();
      for (const rival of run.career.rivals) {
        expect(rival.roster.length, rival.id).toBeLessThanOrEqual(
          Math.max(run.career.config.rivalRosterMax, run.career.config.rivalRosterMin),
        );
      }
      expect(league(run.career)).toHaveLength(run.career.rivals.length + 1);
      expect(serialiseCareer(run.career)).not.toContain('NaN');
    });
  }

  it('gives a League of one row when there are no other Guilds', () => {
    const career = newCareer('e5v-no-rivals', content, { rivalCount: 0 }).career;
    expect(league(career)).toEqual([
      {
        guildId: 'player',
        name: career.guild.name,
        standing: standing(career),
        rosterSize: career.guild.roster.length,
        isPlayer: true,
      },
    ]);
    expect(souredRivals(career)).toEqual([]);
    expect(rivalOffers(career, 'r1')).toEqual([]);
    expect(() => transferHero(career, 'r1', 'h1')).toThrow(EngineError);
  });
});

// ── A Vignette that sours a Rival ───────────────────────────────────────────

describe('the rivalRegard Consequence', () => {
  function playing(seed: string, consequence: unknown): { events: GameEvent[]; career: Career } {
    const ruleContent = oneVignetteContent([consequence]);
    let career = edit(newCareer(seed, ruleContent, { beatsMin: 5, beatsMax: 5 }).career, (draft) => {
      draft.guild.coin = 1_000_000;
    });
    const events: GameEvent[] = [];
    for (let step = 0; step < 12; step += 1) {
      const commission = career.board[0];
      const free = career.guild.roster.filter(
        (hero) =>
          !career.parties.some((party) => party.heroIds.includes(hero.id)) &&
          !hero.traits.some((trait) => trait.liftsOn !== undefined),
      );
      if (commission !== undefined && free.length > 0) {
        const sent = commitParty(career, commission.id, [free[0]?.id ?? ''], ruleContent, {
          insist: true,
        });
        career = sent.career;
        events.push(...sent.events);
      }
      const run = advance(career, 10, ruleContent);
      career = run.career;
      events.push(...run.events);
    }
    return { events, career };
  }

  it('does nothing at all for a Rival id this Career does not hold', () => {
    const { events, career } = playing('e5v-conseq-unknown', {
      kind: 'rivalRegard',
      rivalId: 'r99',
      delta: -5,
      reason: 'a Guild that does not exist',
    });
    expect(of(events, 'ConsequenceApplied').length).toBeGreaterThan(0);
    expect(of(events, 'RivalRegardChanged')).toEqual([]);
    for (const rival of career.rivals) {
      expect(rival.regardForGuild.value, rival.id).toBe(career.config.rivalStartingRegard);
    }
  });

  it('lands on exactly the Rival a Vignette names, when it names one', () => {
    const { events, career } = playing('e5v-conseq-named', {
      kind: 'rivalRegard',
      rivalId: 'r2',
      delta: -1,
      reason: 'the business at Thurrow',
    });
    const moved = of(events, 'RivalRegardChanged');
    expect(moved.length).toBeGreaterThan(0);
    expect(new Set(moved.map((event) => event.rivalId))).toEqual(new Set(['r2']));
    expect(career.rivals.find((rival) => rival.id === 'r2')?.regardForGuild.value).toBeLessThan(0);
    expect(career.rivals.find((rival) => rival.id === 'r1')?.regardForGuild.value).toBe(
      career.config.rivalStartingRegard,
    );
  });

  it('reports the delta that actually landed once the scale is at its floor', () => {
    const { events } = playing('e5v-conseq-clamp', {
      kind: 'rivalRegard',
      rivalId: 'r1',
      delta: -4,
      reason: 'the business at Thurrow',
    });
    const moved = of(events, 'RivalRegardChanged');
    expect(moved.length).toBeGreaterThan(1);
    expect(moved.every((event) => event.value >= -5)).toBe(true);
    expect(moved.some((event) => event.delta !== -4)).toBe(true);
    const last = moved[moved.length - 1];
    expect(last?.value).toBe(-5);
  });
});

// ── Ids belong to one world each ────────────────────────────────────────────

describe('an id from one Roster offered to a call that belongs to the other', () => {
  const career = edit(newCareer('e5v-ids', content).career, (draft) => {
    draft.guild.coin = 100_000;
  });
  const { hero: theirs } = firstRival(career);
  const mine = career.guild.roster[0];
  if (mine === undefined) throw new Error('expected a Roster');
  const commission = career.board[0];
  if (commission === undefined) throw new Error('expected a Commission');

  it('will not commit, propose or accept somebody another Guild employs', () => {
    for (const call of [
      (): unknown => commitParty(career, commission.id, [theirs.id], content),
      (): unknown => proposeParty(career, commission.id, [theirs.id], content),
      (): unknown => acceptApplicant(career, theirs.id),
    ]) {
      expect(call).toThrow(EngineError);
    }
    // And nothing has been committed by the attempt.
    expect(career.parties).toEqual([]);
    expect(career.guild.roster.map((hero) => hero.id)).not.toContain(theirs.id);
  });

  it('will not Transfer or Poach somebody the Guild already employs', () => {
    for (const call of [
      (): unknown => transferHero(career, 'r1', mine.id),
      (): unknown => poachHero(career, 'r1', mine.id),
    ]) {
      try {
        call();
        throw new Error('expected a throw');
      } catch (thrown) {
        expect((thrown as EngineError).code).toBe('NoSuchHero');
      }
    }
  });

  it('will not Transfer somebody off a Rival by naming a different Rival', () => {
    const other = rivalById(career, 'r2')?.roster[0];
    if (other === undefined) throw new Error('expected a second Rival');
    try {
      poachHero(career, 'r1', other.id);
      throw new Error('expected a throw');
    } catch (thrown) {
      expect((thrown as EngineError).code).toBe('NoSuchHero');
    }
  });

  it('refuses both calls once the Career has ended, whichever would have gone through', () => {
    const ended = advance(
      newCareer('e5v-ended', content, { careerYears: 1, daysPerYear: 2 }).career,
      10,
      content,
    ).career;
    expect(ended.ended).toBeDefined();
    const theirId = rivalById(ended, 'r1')?.roster[0]?.id ?? '';
    for (const call of [
      (): unknown => transferHero(ended, 'r1', theirId),
      (): unknown => poachHero(ended, 'r1', theirId),
    ]) {
      try {
        call();
        throw new Error('expected a throw');
      } catch (thrown) {
        expect((thrown as EngineError).code).toBe('CareerEnded');
      }
    }
  });
});

// ── Purity and determinism ──────────────────────────────────────────────────

describe('every E5 export against a Career nothing may write to', () => {
  const frozen = deepFreeze(newCareer('e5v-frozen', content).career);
  const theirs = frozen.rivals[0]?.roster[0];
  if (theirs === undefined) throw new Error('expected a Rival Hero');
  const rival = frozen.rivals[0];
  if (rival === undefined) throw new Error('expected a Rival');

  it('reads without writing', () => {
    expect(() => league(frozen)).not.toThrow();
    expect(() => employerRegard(frozen, theirs.id)).not.toThrow();
    expect(() => isPoachable(theirs.regardForRival, frozen.config)).not.toThrow();
    expect(() => transferFee(theirs, frozen.config)).not.toThrow();
    expect(() => poachFee(theirs, frozen.config)).not.toThrow();
    expect(() => rivalById(frozen, 'r1')).not.toThrow();
    expect(() => rivalHeroById(frozen, theirs.id)).not.toThrow();
    expect(() => souredRivals(frozen)).not.toThrow();
    expect(() => rivalOffers(frozen, 'r1')).not.toThrow();
    expect(() => rivalHeroOffer(frozen, 'r1', theirs.id)).not.toThrow();
    expect(() => moveRefusal(frozen, rival, theirs, 'transfer')).not.toThrow();
    expect(() => moveRefusal(frozen, rival, theirs, 'poach')).not.toThrow();
    expect(() => maxCalibreFor(rival.standing, frozen.config)).not.toThrow();
    expect(() => statTotal(theirs.stats)).not.toThrow();
  });

  it('writes a new Career rather than the one it was handed, even frozen', () => {
    const rich = deepFreeze(
      deserialiseCareer(
        serialiseCareer(
          edit(newCareer('e5v-frozen', content).career, (draft) => {
            draft.guild.coin = 100_000;
          }),
        ),
      ),
    );
    const step = transferHero(rich, 'r1', theirs.id);
    expect(step.career.guild.roster.map((hero) => hero.id)).toContain(theirs.id);
    expect(rich.guild.roster.map((hero) => hero.id)).not.toContain(theirs.id);
  });
});

describe('the same seed and the same decisions', () => {
  it('give the same Career and the same events, to the byte', () => {
    const run = (): { written: string; events: GameEvent[] } => {
      let career = edit(newCareer('e5v-determinism', content).career, (draft) => {
        draft.guild.coin = 100_000;
        draft.config.rosterCap = 20;
      });
      const events: GameEvent[] = [];
      const take = (step: { career: Career; events: GameEvent[] }): void => {
        career = step.career;
        events.push(...step.events);
      };
      take(transferHero(career, 'r1', firstRival(career, 'r1').hero.id));
      const soured = firstRival(career, 'r2').hero.id;
      career = rivalHeroAt(career, soured, -5);
      take(poachHero(career, 'r2', soured));
      for (let step = 0; step < 30; step += 1) {
        const commission = career.board[0];
        const free = career.guild.roster.filter(
          (hero) =>
            !career.parties.some((party) => party.heroIds.includes(hero.id)) &&
            !hero.traits.some((trait) => trait.liftsOn !== undefined),
        );
        if (commission !== undefined && free.length > 1) {
          take(
            commitParty(career, commission.id, [free[0]?.id ?? '', free[1]?.id ?? ''], content, {
              insist: true,
            }),
          );
        }
        take(advanceUntilAttention(career, content));
        if (career.ended !== undefined) break;
      }
      return { written: serialiseCareer(career), events };
    };
    const one = run();
    const other = run();
    expect(one.written).toBe(other.written);
    expect(one.events).toEqual(other.events);
    expect(one.events.length).toBeGreaterThan(50);
  });
});

// ── The fleet ───────────────────────────────────────────────────────────────

interface Watch {
  ages: Map<string, number>;
  names: Map<string, string>;
}

/** Everything that must hold of any Career, at any moment a caller could look at it. */
function faults(career: Career, at: string, watch: Watch): string[] {
  const broken: string[] = [];
  const say = (held: boolean, what: string): void => {
    if (!held) broken.push(`${at}: ${what}`);
  };

  const rivalRosters = career.rivals.flatMap((rival) => rival.roster);
  const everybody: AnyHero[] = [...career.guild.roster, ...rivalRosters, ...career.guild.formerHeroes];

  // One person, one place.
  const where = new Map<string, string>();
  for (const hero of [...career.guild.roster, ...rivalRosters, ...career.guild.formerHeroes]) {
    const already = where.get(hero.id);
    say(already === undefined, `${hero.id} is in two places (${String(already)})`);
    where.set(hero.id, 'somewhere');
  }
  for (const applicant of career.applicants) {
    if (applicant.formerHeroId === undefined) {
      say(!where.has(applicant.id), `${applicant.id} is at the door and already employed`);
    } else {
      const inHistory = career.guild.formerHeroes.some((hero) => hero.id === applicant.id);
      say(inHistory, `${applicant.id} came back from nowhere`);
    }
  }

  // One employer each, and the employer's own Regard is the one they hold.
  for (const hero of [...career.guild.roster, ...rivalRosters]) {
    const both = hero.regardForGuildmaster !== undefined && hero.regardForRival !== undefined;
    const neither = hero.regardForGuildmaster === undefined && hero.regardForRival === undefined;
    say(!both, `${hero.id} holds two employer Regards`);
    say(!neither, `${hero.id} holds no employer Regard`);
    say(employerRegard(career, hero.id) !== undefined, `${hero.id} has no employer Regard to read`);
  }
  for (const hero of career.guild.roster) {
    say(hero.regardForRival === undefined, `${hero.id} on your Roster holds a Rival's Regard`);
  }
  for (const hero of rivalRosters) {
    say(hero.regardForGuildmaster === undefined, `${hero.id} elsewhere holds the Guildmaster's`);
  }

  // Bounds.
  say(career.guild.roster.length <= career.config.rosterCap, `your Roster holds ${career.guild.roster.length}`);
  for (const rival of career.rivals) {
    say(rival.roster.length <= career.config.rivalRosterMax, `${rival.id} holds ${rival.roster.length}`);
  }

  // Ages never go backwards, and one id is never handed to a second person.
  for (const hero of everybody) {
    const was = watch.ages.get(hero.id);
    say(was === undefined || hero.age >= was, `${hero.id} grew younger`);
    watch.ages.set(hero.id, hero.age);
    const named = watch.names.get(hero.id);
    say(named === undefined || named === hero.name, `${hero.id} is now somebody else`);
    watch.names.set(hero.id, hero.name);
    say(Number.isFinite(hero.age), `${hero.id} has an age that is not a number`);
  }
  return broken;
}

/** The checks that need the world as text: no NaN, no negative zero, no stored position. */
function writtenFaults(career: Career, at: string): string[] {
  const broken: string[] = [];
  const written = serialiseCareer(career);
  if (written.includes('NaN')) broken.push(`${at}: NaN`);
  if (written.includes('null')) broken.push(`${at}: null`);
  if (/-0[,}\]]/.test(written)) broken.push(`${at}: negative zero`);
  if (/"guild":\s*\{[^}]*"standing"/.test(written)) broken.push(`${at}: a Standing on the Guild`);
  for (const forbidden of ['"rank"', '"position"', '"ranking"', '"leaguePosition"']) {
    if (written.includes(forbidden)) broken.push(`${at}: ${forbidden} is stored`);
  }
  return broken;
}

/** A player who recruits towards eight, deals with the other Guilds and sends people out. */
function playOut(
  start: Career,
  watch?: (career: Career) => void,
): { career: Career; events: GameEvent[] } {
  let career = start;
  const events: GameEvent[] = [];
  const take = (step: { career: Career; events: GameEvent[] }): void => {
    career = step.career;
    events.push(...step.events);
    watch?.(career);
  };
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 50_000) throw new Error('a Career that will not end');

    // The other Guilds first, so a place on the Roster is spent on somebody who has to be
    // taken off another Guild before it is spent on whoever happens to be at the door.
    for (const rival of career.rivals) {
      for (const offer of rivalOffers(career, rival.id)) {
        if (career.guild.roster.length >= 8) break;
        if (offer.poachRefusal === undefined && career.guild.coin > offer.poachFee + 200) {
          take(poachHero(career, rival.id, offer.hero.id));
          continue;
        }
        if (offer.transferRefusal === undefined && career.guild.coin > offer.transferFee + 1200) {
          take(transferHero(career, rival.id, offer.hero.id));
        }
      }
    }

    for (const applicant of [...career.applicants]) {
      if (career.guild.roster.length >= 8) break;
      if (career.guild.coin < applicant.askingFee + career.config.startingCoin) continue;
      try {
        take(acceptApplicant(career, applicant.id));
      } catch {
        break;
      }
    }

    const used = new Set<string>();
    for (const commission of [...career.board]) {
      const free = career.guild.roster.filter(
        (hero) =>
          !used.has(hero.id) &&
          !career.parties.some((party) => party.heroIds.includes(hero.id)) &&
          !hero.traits.some((trait) => trait.liftsOn !== undefined),
      );
      if (free.length === 0) break;
      const refusing = new Set(
        proposeParty(career, commission.id, free.map((hero) => hero.id), content).refusals.map(
          (refusal) => refusal.heroId,
        ),
      );
      const party = free.filter((hero) => !refusing.has(hero.id)).slice(0, 2).map((hero) => hero.id);
      if (party.length === 0) continue;
      take(commitParty(career, commission.id, party, content));
      for (const id of party) used.add(id);
    }

    take(advanceUntilAttention(career, content));
  }
  return { career, events };
}

describe('a hundred and fifty Careers played out', () => {
  it(
    'keeps every E5 promise, and adds up',
    () => {
      const broken: string[] = [];
      let transfers = 0;
      let poaches = 0;
      let taken = 0;
      let ended = 0;
      for (let seed = 0; seed < 150 && broken.length < 10; seed += 1) {
        const at = `seed ${seed}`;
        const watch: Watch = { ages: new Map(), names: new Map() };
        const opened = newCareer(`e5v-fleet-${seed}`, content);
        broken.push(...faults(opened.career, `${at} at the start`, watch));
        const run = playOut(opened.career, (career) => {
          if (broken.length < 10) broken.push(...faults(career, `${at} on Day ${career.day}`, watch));
        });
        const events = [...opened.events, ...run.events];
        broken.push(...writtenFaults(run.career, `${at} at the end`));

        if (run.career.ended === undefined) {
          broken.push(`${at}: the Career never ended`);
          continue;
        }
        ended += 1;

        // The coin adds up over the whole Career.
        let moved = 0;
        for (const event of events) if (event.type === 'CoinChanged') moved += event.delta;
        if (run.career.config.startingCoin + moved !== run.career.guild.coin) {
          broken.push(`${at}: the coin does not add up`);
        }

        // Each of the three ledgers counts the events, and counts each person once.
        const transferred = of(events, 'HeroTransferred');
        const poached = of(events, 'HeroPoached');
        const lost = of(events, 'RivalPoachedHero');
        if (run.career.ledger.heroesTransferredIn !== transferred.length) {
          broken.push(`${at}: heroesTransferredIn disagrees with the events`);
        }
        if (run.career.ledger.heroesPoachedIn !== poached.length) {
          broken.push(`${at}: heroesPoachedIn disagrees with the events`);
        }
        if (run.career.ledger.heroesPoachedFromUs !== lost.length) {
          broken.push(`${at}: heroesPoachedFromUs disagrees with the events`);
        }
        if (run.career.ended.reckoning.heroesPoachedFromUs !== run.career.ledger.heroesPoachedFromUs) {
          broken.push(`${at}: the reckoning disagrees with the ledger`);
        }
        // Every fee that was charged was charged under its own reason, once.
        const paid = of(events, 'CoinChanged').filter(
          (event) => event.reason === 'transfer' || event.reason === 'poach',
        );
        if (paid.length !== transferred.length + poached.length) {
          broken.push(`${at}: a fee was charged without a move, or the other way round`);
        }
        // A Rival's own Hero retiring is never counted as one of yours.
        const retiredOurs = run.career.guild.formerHeroes.filter(
          (hero) => hero.exit?.kind === 'retirement',
        ).length;
        if (run.career.ledger.heroesRetired !== retiredOurs) {
          broken.push(`${at}: heroesRetired counts somebody else's people`);
        }
        transfers += transferred.length;
        poaches += poached.length;
        taken += lost.length;
      }
      expect(broken.slice(0, 10)).toEqual([]);
      expect(ended).toBe(150);
      expect(transfers).toBeGreaterThan(0);
      expect(poaches).toBeGreaterThan(0);
      expect(taken).toBeGreaterThan(0);
    },
    900_000,
  );
});

describe('thirty full-length Careers, examined on every single Day', () => {
  it(
    'never passes through a state that breaks one of E5’s promises',
    () => {
      const broken: string[] = [];
      for (let seed = 0; seed < 30 && broken.length < 10; seed += 1) {
        const at = `seed ${seed}`;
        const watch: Watch = { ages: new Map(), names: new Map() };
        // Every Rival soured from the start, so retaliation is live on every Day there is
        // anybody to take — and the player deals with them throughout regardless.
        let career = edit(newCareer(`e5v-daily-${seed}`, content).career, (draft) => {
          for (const rival of draft.rivals) {
            rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
          }
        });
        let guard = 0;
        while (career.ended === undefined && broken.length < 10) {
          guard += 1;
          if (guard > 20_000) throw new Error(`${at}: a Career that will not end`);

          for (const applicant of [...career.applicants]) {
            if (career.guild.roster.length >= 8) break;
            if (career.guild.coin < applicant.askingFee + career.config.startingCoin) continue;
            try {
              career = acceptApplicant(career, applicant.id).career;
            } catch {
              break;
            }
            broken.push(...faults(career, `${at} taking somebody on`, watch));
          }
          for (const rival of career.rivals) {
            const offer = rivalOffers(career, rival.id).find(
              (entry) => entry.poachRefusal === undefined && career.guild.coin > entry.poachFee + 800,
            );
            if (offer === undefined) continue;
            career = poachHero(career, rival.id, offer.hero.id).career;
            broken.push(...faults(career, `${at} poaching`, watch));
          }
          const commission = career.board[0];
          const free = career.guild.roster.filter(
            (hero) =>
              !career.parties.some((party) => party.heroIds.includes(hero.id)) &&
              !hero.traits.some((trait) => trait.liftsOn !== undefined),
          );
          if (commission !== undefined && free.length > 0) {
            const refusing = new Set(
              proposeParty(career, commission.id, free.map((hero) => hero.id), content).refusals.map(
                (refusal) => refusal.heroId,
              ),
            );
            const party = free
              .filter((hero) => !refusing.has(hero.id))
              .slice(0, 2)
              .map((hero) => hero.id);
            if (party.length > 0) {
              career = commitParty(career, commission.id, party, content).career;
              broken.push(...faults(career, `${at} committing`, watch));
            }
          }
          career = advance(career, 1, content).career;
          broken.push(...faults(career, `${at} on Day ${career.day}`, watch));
        }
        broken.push(...writtenFaults(career, `${at} at the end`));
        if (career.ended === undefined && broken.length < 10) {
          broken.push(`${at}: the Career never ended`);
        }
      }
      expect(broken.slice(0, 10)).toEqual([]);
    },
    900_000,
  );
});

// ── Heroes on a Rival's Roster are people, not decoration ───────────────────

describe('a Hero is a Hero wherever they work', () => {
  it('generates everybody a Rival employs to the same Stat budget yours are', () => {
    const career = newCareer('e5v-people', content).career;
    for (const rival of career.rivals) {
      for (const hero of rival.roster) {
        expect(hero.calibre, hero.id).toBeLessThanOrEqual(maxCalibreFor(rival.standing, career.config));
        expect(statTotal(hero.stats), hero.id).toBeGreaterThan(0);
        expect(hero.traits.length, hero.id).toBeGreaterThan(0);
        expect(hero.name.length, hero.id).toBeGreaterThan(0);
      }
    }
  });

  it('gives everybody an id nobody else holds, and a name nobody else answers to', () => {
    // The id is the guarantee and it never slips; the name is now a promise too, for as
    // long as the pool can keep it (DL-22 §1). Before the fix these same forty worlds held
    // duplicates, because a Rival's people were made without the Guildmaster in the set of
    // names to avoid and an Applicant's without any Rival's Roster in it. The fixture pool
    // is nine first names and three epithets — thirty-six combinations — which eleven
    // people do not exhaust.
    let worlds = 0;
    let withADuplicateName = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const career = newCareer(`e5v-names-${seed}`, content, {
        rivalCount: 2,
        rivalRosterMin: 3,
        rivalRosterMax: 3,
      }).career;
      const people = [...career.guild.roster, ...career.rivals.flatMap((rival) => rival.roster)];
      const ids = people.map((hero) => hero.id);
      expect(new Set(ids).size, `seed ${seed} ids`).toBe(ids.length);
      worlds += 1;
      const names = [...people.map((hero) => hero.name), career.guild.guildmaster.name];
      if (new Set(names).size !== names.length) withADuplicateName += 1;
    }
    expect(worlds).toBe(40);
    expect(withADuplicateName).toBe(0);
  });

  it('never hands one id to two people, however hard the world churns', () => {
    // Ids are the guarantee; names are best effort. `freeName` falls back to a name
    // already in use once the pool it is drawing from is exhausted, which the fixture
    // pool (nine first names and three epithets) reaches inside a played Career and the
    // authored pool (seventy and thirty-six) does not.
    const career = advance(
      edit(newCareer('e5v-names', content, { rivalChurnChance: 1 }).career, (draft) => {
        draft.guild.coin = 1_000_000;
      }),
      600,
      content,
    ).career;
    const ids = [
      ...career.guild.roster.map((hero) => hero.id),
      ...career.guild.formerHeroes.map((hero) => hero.id),
      ...career.rivals.flatMap((rival) => rival.roster.map((hero) => hero.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives sixty played Careers no two living people who answer to one name', () => {
    /**
     * Finding F6, closed (DL-22 §1). Nobody in work — the Guildmaster, anybody on your
     * Roster, anybody on a Rival's, anybody at the door, and anybody who walked out and
     * could still knock again — ever shares a name with anybody else, **with exactly one
     * shape of exception, which is asserted to be the only one rather than counted and
     * shrugged at**: somebody a Rival took on while a person of that name was standing at
     * your door, whom the player then took on too.
     *
     * A Rival's own generator is the one thing that must not read `career.applicants`,
     * because declining an Applicant and ignoring one have to give the same Career (E4's
     * definition of done, DL-19 §1) and that list is the only thing the two differ in —
     * checked by flipping it and watching `e4-verification.test.ts`'s own claim break. So
     * an Applicant avoids every Rival's Roster, and a Rival cannot avoid the door. The
     * measured defect ran the other way, and is gone: before, every one of these sixty
     * Careers held a clash and there were 3,845 distinct pairs; after, the only pairs left
     * are an `a<n>` who came through the door and an `r<n>h<n>` hired while they waited.
     *
     * Played on `roomyNameContent` rather than on the fixture's nine first names, because
     * a pool that cannot seat the world says nothing about the rule; the run asserts the
     * plain-name pool was never used up, so the question stays an honest one.
     */
    const clashes: string[] = [];
    const pairs = new Set<string>();
    const throughTheDoor = new Set<string>();
    const settled = new Set<string>();
    const careersWithAClash = new Set<number>();
    let names = 0;
    let observations = 0;
    const pool = roomyNameContent.names.heroFirst;
    /** Somebody who came in off the door, against somebody a Rival hired: the one exception. */
    const cameThroughTheDoor = (one: string, other: string): boolean =>
      [one, other].some((id) => /^a\d+$/.test(id)) &&
      [one, other].some((id) => /^r\d+h\d+$/.test(id));

    for (let seed = 0; seed < 60; seed += 1) {
      const at = `seed ${seed}`;
      let career = newCareer(`e5v-one-name-${seed}`, roomyNameContent).career;

      const look = (where: string): void => {
        observations += 1;
        const living: { id: string; name: string; place: string; waiting: boolean }[] = [
          { id: 'guildmaster', name: career.guild.guildmaster.name, place: 'the Guildmaster', waiting: false },
          ...career.guild.roster.map((hero) => ({
            id: hero.id, name: hero.name, place: 'your Roster', waiting: false,
          })),
          ...career.rivals.flatMap((rival) =>
            rival.roster.map((hero) => ({
              id: hero.id, name: hero.name, place: rival.name, waiting: false,
            })),
          ),
          ...career.applicants.map((one) => ({
            id: one.id, name: one.name, place: 'the door', waiting: true,
          })),
          // Somebody who walked out is alive and may knock again, and must come back under
          // their own name. The dead and the retired never do, and are not counted.
          ...career.guild.formerHeroes
            .filter((hero) => hero.exit?.kind === 'departure')
            .map((hero) => ({
              id: hero.id, name: hero.name, place: 'gone, and could come back', waiting: false,
            })),
        ];
        const held = new Map<string, { id: string; place: string; waiting: boolean }>();
        for (const person of living) {
          const already = held.get(person.name);
          if (already !== undefined && already.id !== person.id) {
            const pair = `${String(seed)} ${[already.id, person.id].sort().join(' ')}`;
            if (cameThroughTheDoor(already.id, person.id)) {
              throughTheDoor.add(pair);
              if (!already.waiting && !person.waiting) settled.add(pair);
            } else {
              careersWithAClash.add(seed);
              pairs.add(pair);
              clashes.push(
                `${at} ${where}: "${person.name}" is ${already.id} on ${already.place} ` +
                  `and ${person.id} on ${person.place}`,
              );
            }
          }
          held.set(person.name, { id: person.id, place: person.place, waiting: person.waiting });
        }
        names = Math.max(names, held.size);
        // The pool is never used up, so no observation above is an artefact of one.
        if (pool.every((first) => held.has(first))) {
          clashes.push(`${at} ${where}: the first-name pool was exhausted`);
        }
      };

      look('at the start');
      let guard = 0;
      while (career.ended === undefined) {
        guard += 1;
        if (guard > 50_000) throw new Error(`${at}: a Career that will not end`);
        for (const applicant of [...career.applicants]) {
          if (career.guild.roster.length >= career.config.rosterCap) break;
          if (career.guild.coin < applicant.askingFee + career.config.startingCoin) continue;
          try {
            career = acceptApplicant(career, applicant.id).career;
          } catch {
            break;
          }
          look('taking somebody on');
        }
        const used = new Set<string>();
        for (const commission of [...career.board]) {
          const free = career.guild.roster.filter(
            (hero) =>
              !used.has(hero.id) &&
              !career.parties.some((party) => party.heroIds.includes(hero.id)) &&
              !hero.traits.some((trait) => trait.liftsOn !== undefined),
          );
          if (free.length === 0) break;
          const refusing = new Set(
            proposeParty(career, commission.id, free.map((hero) => hero.id), roomyNameContent)
              .refusals.map((refusal) => refusal.heroId),
          );
          const party = free.filter((hero) => !refusing.has(hero.id)).slice(0, 2).map((h) => h.id);
          if (party.length === 0) continue;
          career = commitParty(career, commission.id, party, roomyNameContent).career;
          for (const id of party) used.add(id);
        }
        career = advanceUntilAttention(career, roomyNameContent).career;
        look(`on Day ${career.day}`);
      }
    }

    expect(observations).toBeGreaterThan(1000);
    // Room to spare: the most names ever held at once, against a pool of seventy.
    expect(names).toBeLessThan(pool.length);
    expect(clashes.slice(0, 10)).toEqual([]);
    expect([careersWithAClash.size, pairs.size]).toEqual([0, 0]);
    // Recorded rather than asserted away: the one shape E4's own invariant leaves open.
    // Measured here at 211 pairs against the 3,845 this run held before the fix, and of
    // those 211 only 4 outlived the wait at the door — the rest went away with the person
    // when nobody took them on. Bounded rather than pinned to the digit, because the
    // numbers are a fact about sixty particular seeds and not a rule.
    expect(throughTheDoor.size).toBeGreaterThan(0);
    expect(throughTheDoor.size).toBeLessThan(500);
    expect(settled.size).toBeLessThan(20);
  }, 900_000);

  it('prices a Transfer on the person and never on the Guild that employs them', () => {
    // Standing gets you people; it has nothing to say about what one of them costs.
    const career = newCareer('e5v-price', content).career;
    const dearer = edit(career, (draft) => {
      for (const rival of draft.rivals) rival.standing = 900;
      for (const patron of draft.patrons) patron.regardForGuild = { ...patron.regardForGuild, value: 5 };
    });
    const hero = firstRival(career).hero;
    const same = dearer.rivals[0]?.roster.find((person) => person.id === hero.id);
    expect(same).toBeDefined();
    expect(transferFee(same as RivalHero, dearer.config)).toBe(transferFee(hero, career.config));
    expect(poachFee(same as RivalHero, dearer.config)).toBe(poachFee(hero, career.config));
  });

  it('answers employerRegard for everybody in work and nobody out of it', () => {
    const career = advance(
      edit(newCareer('e5v-employer', content).career, (draft) => {
        draft.guild.coin = 1_000_000;
      }),
      400,
      content,
    ).career;
    for (const hero of career.guild.roster) {
      expect(employerRegard(career, hero.id)).toEqual((hero as Hero).regardForGuildmaster);
    }
    for (const rival of career.rivals) {
      for (const hero of rival.roster) {
        expect(employerRegard(career, hero.id)).toEqual(hero.regardForRival);
      }
    }
    for (const hero of career.guild.formerHeroes) {
      expect(employerRegard(career, hero.id), hero.id).toBeUndefined();
    }
  });
});

// ── What the mutation survey found unpinned ─────────────────────────────────
//
// Each block below closes a mutation of `engine/src` that the shipped suite let through.
// The comment on each says what survived and why nothing caught it.

describe('the two config fields no test drove at a value they do not default to', () => {
  it('draws a Rival Hero’s Regard against rivalHeroRegardMax, not the number it defaults to', () => {
    // Survivor: `rng.between(config.rivalHeroRegardMin, config.rivalHeroRegardMax)` with
    // the ceiling replaced by the literal 2. The only test that drives the band sets
    // `{ min: 1, max: 2 }`, and 2 IS the default — so the field could be a literal and the
    // whole suite stayed green. Driving the ceiling onto the floor makes the read matter.
    const pinned = newCareer('e5v-band', content, {
      rivalHeroRegardMin: -3,
      rivalHeroRegardMax: -3,
    }).career;
    const people = pinned.rivals.flatMap((rival) => rival.roster);
    expect(people.length).toBeGreaterThan(8);
    for (const hero of people) expect(hero.regardForRival.value, hero.id).toBe(-3);

    // And again at a band the default ceiling does not reach at all.
    const high = newCareer('e5v-band-high', content, {
      rivalHeroRegardMin: 3,
      rivalHeroRegardMax: 5,
    }).career;
    const up = high.rivals.flatMap((rival) => rival.roster);
    for (const hero of up) {
      expect(hero.regardForRival.value, hero.id).toBeGreaterThanOrEqual(3);
      expect(hero.regardForRival.value, hero.id).toBeLessThanOrEqual(5);
    }
    expect(new Set(up.map((hero) => hero.regardForRival.value)).size).toBeGreaterThan(1);
  });

  it('adds souredRivalExtraTakes for each soured Rival, under a cap that does not swallow it', () => {
    // Survivor: `config.souredRivalExtraTakes` replaced by the literal 1. The only test
    // that drives it sets it to 2 with `rivalTakesMax: 5` and four Rivals soured, where
    // 1 + 2×4 and 1 + 1×4 both clamp to 5 — the cap swallows the difference. Two soured
    // Rivals under a cap neither arm reaches is what separates them.
    const board = {
      boardSizeMin: 8,
      boardSizeMax: 8,
      rivalTakesMax: 9,
      souredRivalThreshold: -1,
    };
    const takes = (extra: number): number => {
      const career = edit(
        newCareer('e5v-extra-takes', content, { ...board, souredRivalExtraTakes: extra }).career,
        (draft) => {
          draft.guild.coin = 1_000_000;
          for (const rival of draft.rivals.slice(0, 2)) {
            rival.regardForGuild = { ...rival.regardForGuild, value: -1 };
          }
        },
      );
      expect(souredRivals(career)).toHaveLength(2);
      expect(career.board.length).toBeGreaterThanOrEqual(8);
      const run = advance(career, career.config.boardRefreshEveryDays, content);
      return of(run.events, 'CommissionTakenByRival').length;
    };
    // 1 + 1×2 = 3 against 1 + 3×2 = 7, and the cap of nine is out of reach of both.
    expect(takes(1)).toBe(3);
    expect(takes(3)).toBe(7);
  });
});

describe('the three Days a move resets, on a Day that is not the first', () => {
  // Survivors: each of `joinedOn`, `lastCommittedOn` and `regardDecayedOn` carried across
  // from the person instead of set to today. Every pin E5 ships moves somebody on **Day
  // 1**, where all three already are 1, so the mutation is invisible to it; the only
  // thing that ever catches one is whether a moved Hero happens to still be on the Roster
  // at the end of the gate's one twenty-year Career. These move somebody on a later Day.
  const settled = edit(
    advance(newCareer('e5v-timers', content, { rivalChurnChance: 0 }).career, 45, content).career,
    (draft) => {
      draft.guild.coin = 1_000_000;
      draft.config.rosterCap = 30;
    },
  );

  it('sets all three to today when somebody is brought over', () => {
    const hero = settled.rivals[0]?.roster[0];
    if (hero === undefined) throw new Error('expected a Rival Hero');
    expect(hero.joinedOn).toBeLessThan(settled.day);
    const moved = transferHero(settled, 'r1', hero.id).career.guild.roster.find(
      (person) => person.id === hero.id,
    );
    expect(moved?.joinedOn).toBe(settled.day);
    expect(moved?.lastCommittedOn).toBe(settled.day);
    expect(moved?.regardDecayedOn).toBe(settled.day);
  });

  it('sets all three to today when somebody is taken without asking', () => {
    const hero = settled.rivals[1]?.roster[0];
    if (hero === undefined) throw new Error('expected a Rival Hero');
    const ready = rivalHeroAt(settled, hero.id, -5);
    const moved = poachHero(ready, 'r2', hero.id).career.guild.roster.find(
      (person) => person.id === hero.id,
    );
    expect(moved?.joinedOn).toBe(settled.day);
    expect(moved?.lastCommittedOn).toBe(settled.day);
    expect(moved?.regardDecayedOn).toBe(settled.day);
  });

  it('sets all three to the Day a Rival takes somebody off you', () => {
    const attacked = edit(settled, (draft) => {
      draft.config.regardDecayAmount = 0;
      draft.config.refusalRegardThreshold = -100;
      for (const rival of draft.rivals) {
        rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
        rival.roster = rival.roster.slice(0, 1);
      }
      for (const mine of draft.guild.roster) {
        mine.regardForGuildmaster = { ...mine.regardForGuildmaster, value: -5 };
      }
    });
    const mine = attacked.guild.roster[0];
    if (mine === undefined) throw new Error('expected a Roster');
    expect(mine.joinedOn).toBeLessThan(attacked.day);
    const run = advance(attacked, attacked.config.boardRefreshEveryDays, content);
    const taken = of(run.events, 'RivalPoachedHero').find((event) => event.heroId === mine.id);
    expect(taken, 'they should have been taken').toBeDefined();
    const there = rivalHeroById(run.career, mine.id);
    expect(there?.hero.joinedOn).toBe(taken?.day);
    expect(there?.hero.lastCommittedOn).toBe(taken?.day);
    expect(there?.hero.regardDecayedOn).toBe(taken?.day);
  });
});

describe('retaliation where two Heroes are equally soured', () => {
  it('breaks the tie by id, lowest first', () => {
    // Survivor: the tie-break reversed. Nothing in the suite puts two Heroes at the same
    // Regard with one taker, so either order passed.
    const career = edit(
      newCareer('e5v-tie', content, { regardDecayAmount: 0, refusalRegardThreshold: -100 }).career,
      (draft) => {
        draft.guild.coin = 1_000_000;
        // Exactly one Rival soured, and with room, so exactly one Hero is taken.
        draft.rivals = draft.rivals.map((rival, index) =>
          index === 0
            ? {
                ...rival,
                regardForGuild: { ...rival.regardForGuild, value: -5 },
                roster: rival.roster.slice(0, 1),
              }
            : { ...rival, regardForGuild: { ...rival.regardForGuild, value: 0 } },
        );
        const [one, other] = draft.guild.roster;
        if (one === undefined || other === undefined) throw new Error('expected two Heroes');
        for (const hero of draft.guild.roster) {
          hero.regardForGuildmaster = {
            ...hero.regardForGuildmaster,
            value: hero.id === one.id || hero.id === other.id ? -4 : 5,
          };
        }
      },
    );
    const ids = career.guild.roster.slice(0, 2).map((hero) => hero.id);
    expect([...ids].sort((one, other) => one.localeCompare(other))).toEqual(ids);
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    const taken = of(run.events, 'RivalPoachedHero');
    expect(taken).toHaveLength(1);
    expect(taken[0]?.regardValue).toBe(-4);
    expect(taken[0]?.heroId).toBe(ids[0]);
  });
});

describe('churn takes both of its draws for every Rival, whatever it then decides', () => {
  it('does not let one Rival’s decision shift the next Rival’s', () => {
    // Survivor: the second `chance()` moved inside the branch, so a Rival who does not
    // churn stops costing a draw and every Rival after them is shifted. That is the exact
    // trap DL-20's "E5 must know" named and DL-21 §1 says it designed around, and nothing
    // pinned it: at a churn chance of 0 or 1 the two are identical, and only an
    // intermediate chance tells them apart. Pinned as the seed's own answer.
    const career = edit(
      newCareer('e5v-churn-order', content, {
        rivalChurnChance: 0.5,
        rivalChurnGainChance: 0.5,
      }).career,
      (draft) => {
        draft.guild.coin = 1_000_000;
      },
    );
    const run = advance(career, career.config.boardRefreshEveryDays * 6, content);
    const changed = of(run.events, 'RivalRosterChanged').map(
      (event) =>
        `${String(event.day)} ${event.rivalId} ${event.joinedHeroIds.length > 0 ? 'in' : 'out'}`,
    );
    expect(changed.length).toBeGreaterThan(4);
    expect(changed).toMatchInlineSnapshot(`
      [
        "10 r1 out",
        "10 r2 in",
        "10 r4 out",
        "20 r1 out",
        "20 r3 in",
        "20 r4 in",
        "40 r2 out",
        "40 r3 out",
        "50 r2 in",
        "50 r3 in",
        "60 r1 in",
        "60 r2 out",
      ]
    `);
  });
});

describe('somebody who came back, and what `moveHero` carries for them', () => {
  it('keeps the id they left with and takes them out of the Guild’s history', () => {
    // Survivors: `formerHeroId` dropped by `moveHero`, and `formerHeroes` not cleared.
    // Both are reachable only through the returner path, which no E5 test walks.
    const opened = edit(
      newCareer('e5v-former', content, {
        departureDc: 1000,
        returnCooldownDays: 0,
        returnAsApplicantChance: 1,
        regardDecayAmount: 0,
      }).career,
      (draft) => {
        draft.guild.coin = 1_000_000;
        draft.config.rosterCap = 30;
        for (const mine of draft.guild.roster) {
          mine.regardForGuildmaster = {
            ...mine.regardForGuildmaster,
            value: draft.config.departureRegardThreshold,
          };
        }
      },
    );
    let career = opened;
    let gone = '';
    for (let step = 0; step < 40 && gone === ''; step += 1) {
      const run = advance(career, career.config.boardRefreshEveryDays, content);
      career = run.career;
      gone = of(run.events, 'HeroDeparted')[0]?.heroId ?? '';
    }
    expect(gone).not.toBe('');

    let offered = false;
    for (let step = 0; step < 120 && !offered; step += 1) {
      career = advance(career, 1, content).career;
      offered = career.applicants.some((applicant) => applicant.id === gone);
    }
    expect(offered).toBe(true);

    const taken = acceptApplicant(career, gone);
    const back = taken.career.guild.roster.find((hero) => hero.id === gone);
    expect(back?.formerHeroId).toBe(gone);
    expect(taken.career.guild.formerHeroes.map((hero) => hero.id)).not.toContain(gone);
    expect(of(taken.events, 'HeroJoined')[0]?.formerHeroId).toBe(gone);
  });
});
