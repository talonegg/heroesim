import { describe, expect, it } from 'vitest';
import { advance, advanceUntilAttention, availableHeroes, commitParty } from '../src/career.js';
import type { GameConfig } from '../src/config.js';
import { defaultConfig } from '../src/config.js';
import type { Content, Vignette } from '../src/content.js';
import type { GameEvent, GameEventType } from '../src/events.js';
import { deserialiseCareer, serialiseCareer } from '../src/save.js';
import type { Career, Commission } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { fixtureContent } from './fixtures.js';

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`the test expected ${what}`);
  return value;
}

function byId(content: Content, id: string): Vignette {
  return must(
    content.vignettes.find((vignette) => vignette.id === id),
    `a Vignette with id "${id}"`,
  );
}

function of<T extends GameEventType>(events: readonly GameEvent[], type: T) {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/** A copy a test may adjust, taken the way a save is taken. */
function editable(career: Career): Career {
  return deserialiseCareer(serialiseCareer(career));
}

function start(seed: string, config?: Partial<GameConfig>): Career {
  return newCareer(seed, fixtureContent, config).career;
}

function sendFirstParty(career: Career): { career: Career; commission: Commission } {
  const commission = must(career.board[0], 'a Commission on the Board');
  const heroes = career.guild.roster.slice(0, 2).map((hero) => hero.id);
  return { career: commitParty(career, commission.id, heroes, fixtureContent).career, commission };
}

describe('Beats and the Commission they belong to', () => {
  it('fire on exactly the Days the Party was scheduled for', () => {
    const fixed = start('beats', { beatsMin: 3, beatsMax: 3, commissionSpanMin: 7, commissionSpanMax: 7 });
    const sent = sendFirstParty(fixed);
    const party = must(sent.career.parties[0], 'a Party');
    expect(party.beatDays).toHaveLength(3);
    for (const day of party.beatDays) {
      expect(day).toBeGreaterThanOrEqual(party.departedOn + 1);
      expect(day).toBeLessThanOrEqual(party.returnsOn);
    }

    let career = sent.career;
    const fired: number[] = [];
    for (let day = 0; day < 7; day += 1) {
      const step = advance(career, 1, fixtureContent);
      career = step.career;
      for (const beat of of(step.events, 'BeatResolved')) fired.push(beat.day);
    }
    expect(fired).toEqual([...party.beatDays].sort((one, other) => one - other));
  });

  it('runs every Beat it was given even when one of them fails', () => {
    // Solution architecture section 5: a Beat's outcome moves the score; it never cuts
    // the Commission short. Search for a seed whose first Beat fails, then count.
    let proved = false;
    for (let seed = 0; seed < 40 && !proved; seed += 1) {
      const fixed = start(`failures-${seed}`, {
        beatsMin: 4,
        beatsMax: 4,
        commissionSpanMin: 8,
        commissionSpanMax: 8,
      });
      const sent = sendFirstParty(fixed);
      const step = advance(sent.career, 8, fixtureContent);
      const beats = of(step.events, 'BeatResolved');
      if (!beats.some((beat) => beat.result === 'failure')) continue;
      proved = true;
      expect(beats).toHaveLength(4);
      expect(beats.map((beat) => beat.beatIndex)).toEqual([1, 2, 3, 4]);
      expect(of(step.events, 'PartyReturned')).toHaveLength(1);
    }
    expect(proved).toBe(true);
  });

  it('resolves exactly the Beats the Commission asked for, on every Party of a long run', () => {
    for (let seed = 0; seed < 6; seed += 1) {
      const asked = new Map<string, number>();
      const got = new Map<string, number>();
      let career = start(`beat-budget-${seed}`, { careerYears: 1, daysPerYear: 180 });
      while (career.ended === undefined) {
        const free = career.guild.roster.map((hero) => hero.id);
        const away = new Set(career.parties.flatMap((party) => party.heroIds));
        let taken = 0;
        for (const commission of [...career.board]) {
          const party = free.filter((id) => !away.has(id)).slice(taken, taken + 2);
          if (party.length === 0) break;
          career = commitParty(career, commission.id, party, fixtureContent).career;
          const sent = career.parties.at(-1);
          if (sent !== undefined) asked.set(sent.id, sent.commission.beatCount);
          taken += party.length;
        }
        const step = advanceUntilAttention(career, fixtureContent);
        for (const beat of of(step.events, 'BeatResolved')) {
          got.set(beat.partyId, (got.get(beat.partyId) ?? 0) + 1);
        }
        for (const home of of(step.events, 'PartyReturned')) {
          expect(got.get(home.partyId) ?? 0).toBe(asked.get(home.partyId));
        }
        career = step.career;
      }
      expect(asked.size).toBeGreaterThan(10);
    }
  });

  it('numbers its Beats from one and never runs more than the Commission asks for', () => {
    const fixed = start('beat-count', { beatsMin: 4, beatsMax: 4, commissionSpanMin: 8, commissionSpanMax: 8 });
    const sent = sendFirstParty(fixed);
    const step = advance(sent.career, 8, fixtureContent);
    const beats = of(step.events, 'BeatResolved');
    expect(beats).toHaveLength(4);
    expect(beats.map((beat) => beat.beatIndex)).toEqual([1, 2, 3, 4]);
  });

  it('brings the Party back on the Day it was due, and frees its Heroes', () => {
    const fixed = start('return', { commissionSpanMin: 6, commissionSpanMax: 6 });
    const sent = sendFirstParty(fixed);
    const party = must(sent.career.parties[0], 'a Party');

    const early = advance(sent.career, 5, fixtureContent);
    expect(of(early.events, 'PartyReturned')).toHaveLength(0);
    expect(early.career.parties).toHaveLength(1);

    const home = advance(early.career, 1, fixtureContent);
    const returned = must(of(home.events, 'PartyReturned')[0], 'a returned Party');
    expect(returned.day).toBe(party.returnsOn);
    expect(returned.partyId).toBe(party.id);
    expect(home.career.parties).toHaveLength(0);
  });

  it('pays the fee and lifts the Patron’s Regard when the work was finished', () => {
    const outcomes = new Set<boolean>();
    for (let seed = 0; seed < 25 && outcomes.size < 2; seed += 1) {
      const fixed = start(`score-${seed}`, { commissionSpanMin: 6, commissionSpanMax: 6 });
      const sent = sendFirstParty(fixed);
      const step = advance(sent.career, 6, fixtureContent);
      const returned = of(step.events, 'PartyReturned')[0];
      if (returned === undefined) continue;
      outcomes.add(returned.succeeded);

      const needed = Math.ceil(sent.commission.beatCount / 2);
      expect(returned.succeeded).toBe(returned.score >= needed);
      expect(returned.feePaid).toBe(returned.succeeded ? sent.commission.fee : 0);

      const fees = of(step.events, 'CoinChanged').filter((coin) => coin.reason === 'fee');
      expect(fees).toHaveLength(returned.succeeded ? 1 : 0);

      const regard = must(
        of(step.events, 'PatronRegardChanged')
          .filter((event) => event.patronId === returned.patronId)
          .at(-1),
        'a Patron Regard change on the Party coming home',
      );
      expect(regard.reason).toBe(
        returned.succeeded ? 'the work was finished' : 'the work was not finished',
      );
      expect(regard.delta).toBe(returned.succeeded ? 1 : -1);

      const ledger = step.career.ledger;
      expect(returned.succeeded ? ledger.commissionsCompleted : ledger.commissionsFailed).toBe(1);
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it('keeps a returned Commission readable, and tracks the peak coin', () => {
    const fixed = start('peak', { commissionSpanMin: 5, commissionSpanMax: 5 });
    const sent = sendFirstParty(fixed);
    const step = advance(sent.career, 5, fixtureContent);
    expect(step.career.recentCommissions[0]?.id).toBe(sent.commission.id);
    expect(step.career.ledger.peakCoin).toBeGreaterThanOrEqual(step.career.guild.coin);
    expect(step.career.ledger.peakCoin).toBeGreaterThanOrEqual(defaultConfig.startingCoin);
  });
});

describe('Upkeep', () => {
  it('falls due on the configured Days, for the configured amount', () => {
    const career = start('upkeep');
    const step = advance(career, 25, fixtureContent);
    const owed = of(step.events, 'UpkeepOwed');
    expect(owed.map((event) => event.day)).toEqual([10, 20]);
    const expected = defaultConfig.upkeepBase + defaultConfig.upkeepPerHero * career.guild.roster.length;
    for (const event of owed) expect(event.amount).toBe(expected);

    const paid = of(step.events, 'CoinChanged').filter((coin) => coin.reason === 'upkeep');
    expect(paid.map((event) => event.delta)).toEqual([-expected, -expected]);
    expect(paid.map((event) => event.day)).toEqual([10, 20]);
  });

  it('is owed whether or not anybody worked', () => {
    const idle = start('idle', { rivalCount: 0 });
    const step = advance(idle, 10, fixtureContent);
    expect(of(step.events, 'PartyReturned')).toHaveLength(0);
    expect(of(step.events, 'UpkeepOwed')).toHaveLength(1);
  });
});

describe('insolvency', () => {
  const broke: Partial<GameConfig> = { startingCoin: 30, upkeepBase: 50, upkeepPerHero: 0 };

  it('needs two Upkeeps in a row with the Guild in the red', () => {
    const career = start('broke', broke);
    const first = advance(career, 10, fixtureContent);
    expect(first.career.guild.coin).toBeLessThan(0);
    expect(first.career.ledger.lastUpkeepNegative).toBe(true);
    expect(first.career.ended).toBeUndefined();

    const second = advance(first.career, 10, fixtureContent);
    expect(second.career.ended?.reason).toBe('insolvency');
    expect(second.career.ended?.onDay).toBe(20);
    const ended = must(of(second.events, 'CareerEnded')[0], 'the end of the Career');
    expect(ended.reason).toBe('insolvency');
    expect(ended.reckoning.finalCoin).toBe(second.career.guild.coin);
  });

  it('is forgotten if the Guild is back in the black by the next Upkeep', () => {
    const first = advance(start('recovered', broke), 10, fixtureContent);
    const rescued = editable(first.career);
    rescued.guild.coin = 500;

    const second = advance(rescued, 10, fixtureContent);
    expect(second.career.ended).toBeUndefined();
    expect(second.career.ledger.lastUpkeepNegative).toBe(false);
  });
});

describe('the Board refresh', () => {
  it('lets a Rival take one, expires the rest and refills within bounds', () => {
    const career = start('refresh');
    const before = career.board.map((commission) => commission.id);
    const step = advance(career, 10, fixtureContent);

    const taken = of(step.events, 'CommissionTakenByRival');
    expect(taken).toHaveLength(defaultConfig.rivalTakesPerRefresh);
    const expired = of(step.events, 'CommissionExpired');
    expect(taken.length + expired.length).toBe(before.length);
    for (const event of [...taken, ...expired]) expect(before).toContain(event.commissionId);

    const posted = of(step.events, 'CommissionPosted');
    expect(posted.length).toBeGreaterThanOrEqual(defaultConfig.boardSizeMin);
    expect(posted.length).toBeLessThanOrEqual(defaultConfig.boardSizeMax);

    const refreshed = must(of(step.events, 'BoardRefreshed').at(-1), 'a refreshed Board');
    expect(refreshed.commissionIds).toEqual(step.career.board.map((commission) => commission.id));
    for (const id of refreshed.commissionIds) expect(before).not.toContain(id);
  });

  it('costs the Patron whose work was passed over some Regard, and pays the Rival in Standing', () => {
    const career = start('passed-over');
    const step = advance(career, 10, fixtureContent);
    const taken = must(of(step.events, 'CommissionTakenByRival')[0], 'a Commission taken by a Rival');

    const rivalBefore = must(
      career.rivals.find((rival) => rival.id === taken.rivalId),
      'the Rival before',
    );
    const rivalAfter = must(
      step.career.rivals.find((rival) => rival.id === taken.rivalId),
      'the Rival after',
    );
    expect(rivalAfter.standing).toBe(rivalBefore.standing + defaultConfig.rivalStandingPerCommission);

    const regard = must(
      of(step.events, 'PatronRegardChanged').find((event) => event.patronId === taken.patronId),
      'the Patron’s Regard moving',
    );
    expect(regard.reason).toBe('you passed on their work');
    expect(regard.delta).toBe(-1);
  });

  it('does not let a Commission a Party is out on expire', () => {
    const career = start('committed');
    const sent = sendFirstParty(career);
    const step = advance(sent.career, 10, fixtureContent);
    const gone = [...of(step.events, 'CommissionExpired'), ...of(step.events, 'CommissionTakenByRival')];
    for (const event of gone) expect(event.commissionId).not.toBe(sent.commission.id);
  });

  it('posts nothing at all for a Patron whose Regard has hit the floor', () => {
    const soured = editable(start('soured'));
    for (const patron of soured.patrons) patron.regardForGuild.value = -5;

    const step = advance(soured, 10, fixtureContent);
    expect(of(step.events, 'CommissionPosted')).toHaveLength(0);
    expect(step.career.board).toEqual([]);
    expect(must(of(step.events, 'BoardRefreshed').at(-1), 'a refreshed Board').commissionIds).toEqual([]);
  });

  it('posts nothing for a Patron sitting exactly on the floor', () => {
    const soured = editable(start('on-the-floor'));
    for (const patron of soured.patrons) patron.regardForGuild.value = defaultConfig.patronPostsAboveRegard;
    expect(of(advance(soured, 10, fixtureContent).events, 'CommissionPosted')).toHaveLength(0);
  });
});

describe('a Patron’s Regard over time', () => {
  /** A still world: nobody is paid, nobody is charged, and no Rival takes anything. */
  const still: Partial<GameConfig> = { rivalCount: 0, upkeepBase: 0, upkeepPerHero: 0 };

  it('recovers a point towards zero on the interval, and never past zero', () => {
    const soured = editable(start('recovers', { ...still, patronRegardRecoveryEveryDays: 30 }));
    for (const patron of soured.patrons) patron.regardForGuild.value = -5;

    // The Career opens on Day 1, so twenty-eight Days carry it to the eve of the first
    // recovery and the twenty-ninth is the Day it falls on.
    const early = advance(soured, 28, fixtureContent);
    expect(early.career.day).toBe(29);
    expect(of(early.events, 'PatronRegardChanged')).toHaveLength(0);

    const first = advance(early.career, 1, fixtureContent);
    const moved = of(first.events, 'PatronRegardChanged');
    expect(moved).toHaveLength(soured.patrons.length);
    for (const event of moved) {
      expect(event.day).toBe(30);
      expect(event.delta).toBe(1);
      expect(event.value).toBe(-4);
      expect(event.reason).toBe('time passed');
    }

    const later = advance(first.career, 5 * 30, fixtureContent);
    for (const patron of later.career.patrons) expect(patron.regardForGuild.value).toBe(0);

    // Goodwill above zero is earned, not waited for: nothing drifts once level.
    const settled = advance(later.career, 4 * 30, fixtureContent);
    expect(of(settled.events, 'PatronRegardChanged')).toHaveLength(0);
  });

  it('does not recover at all when the interval is zero', () => {
    const soured = editable(
      start('no-recovery', { ...still, patronRegardRecoveryEveryDays: 0, careerYears: 2 }),
    );
    for (const patron of soured.patrons) patron.regardForGuild.value = -5;
    const step = advance(soured, 2 * 360, fixtureContent);
    expect(of(step.events, 'PatronRegardChanged')).toHaveLength(0);
    for (const patron of step.career.patrons) expect(patron.regardForGuild.value).toBe(-5);
  });

  it('stops being docked for work a Rival took once it has already soured', () => {
    const soured = editable(
      start('no-further-dock', { upkeepBase: 0, upkeepPerHero: 0, patronRegardRecoveryEveryDays: 0 }),
    );
    for (const patron of soured.patrons) {
      patron.regardForGuild.value = defaultConfig.patronPassedOverAboveRegard;
    }
    const step = advance(soured, 10, fixtureContent);
    // Still posting — the guard sits above the posting floor — and still passed over.
    expect(of(step.events, 'CommissionPosted').length).toBeGreaterThan(0);
    expect(of(step.events, 'CommissionTakenByRival')).toHaveLength(
      defaultConfig.rivalTakesPerRefresh,
    );
    expect(of(step.events, 'PatronRegardChanged')).toHaveLength(0);
  });

  it('still falls past that guard when the Guild fails the Patron’s own work', () => {
    let proved = false;
    for (let seed = 0; seed < 40 && !proved; seed += 1) {
      const soured = editable(
        start(`sour-further-${seed}`, {
          upkeepBase: 0,
          upkeepPerHero: 0,
          patronRegardRecoveryEveryDays: 0,
          commissionSpanMin: 6,
          commissionSpanMax: 6,
        }),
      );
      for (const patron of soured.patrons) {
        patron.regardForGuild.value = defaultConfig.patronPassedOverAboveRegard;
      }
      const sent = sendFirstParty(soured);
      const step = advance(sent.career, 6, fixtureContent);
      const home = of(step.events, 'PartyReturned')[0];
      if (home === undefined || home.succeeded) continue;
      proved = true;
      const moved = must(
        of(step.events, 'PatronRegardChanged')
          .filter((event) => event.patronId === home.patronId)
          .at(-1),
        'the Patron’s Regard moving on the Party coming home',
      );
      expect(moved.reason).toBe('the work was not finished');
      expect(moved.delta).toBe(defaultConfig.patronRegardOnFailure);
      expect(moved.value).toBeLessThan(defaultConfig.patronPassedOverAboveRegard);
    }
    expect(proved).toBe(true);
  });
});

describe('the score consequence', () => {
  it('moves the Commission’s score on top of what the Beat itself is worth', () => {
    // Every Beat of this Commission fires the same Vignette, and every outcome of it
    // carries the same bonus, so the Party's score is the Beats plus exactly that.
    const bonus = 10;
    const only = byId(fixtureContent, 'the-find');
    const generous: Content = {
      ...fixtureContent,
      vignettes: [
        {
          ...only,
          outcomes: {
            failure: { ...only.outcomes.failure, consequences: [{ kind: 'score', delta: bonus }] },
            success: { ...only.outcomes.success, consequences: [{ kind: 'score', delta: bonus }] },
            critical: { ...only.outcomes.critical, consequences: [{ kind: 'score', delta: bonus }] },
          },
        },
      ],
    };

    const career = newCareer('score-consequence', generous, {
      beatsMin: 3,
      beatsMax: 3,
      commissionSpanMin: 6,
      commissionSpanMax: 6,
    }).career;
    const commission = must(career.board[0], 'a Commission on the Board');
    const heroes = career.guild.roster.slice(0, 2).map((hero) => hero.id);
    const sent = commitParty(career, commission.id, heroes, generous).career;
    const step = advance(sent, 6, generous);

    const beats = of(step.events, 'BeatResolved');
    expect(beats).toHaveLength(3);
    const fromBeats = beats.reduce(
      (total, beat) =>
        total +
        (beat.result === 'critical'
          ? defaultConfig.scoreCritical
          : beat.result === 'success'
            ? defaultConfig.scoreSuccess
            : defaultConfig.scoreFailure),
      0,
    );
    const home = must(of(step.events, 'PartyReturned')[0], 'a returned Party');
    expect(home.score).toBe(fromBeats + 3 * bonus);
    expect(
      of(step.events, 'ConsequenceApplied').filter((event) => event.consequence.kind === 'score'),
    ).toHaveLength(3);
  });
});

describe('Injuries that lift', () => {
  it('come off on the Day their span is up, and are reported when they do', () => {
    const career = editable(start('lifts'));
    const hero = must(career.guild.roster[0], 'a Hero');
    hero.traits.push({ name: 'Bruised', since: career.day, liftsOn: career.day + 3 });

    const early = advance(career, 2, fixtureContent);
    expect(of(early.events, 'TraitLifted')).toHaveLength(0);

    const later = advance(early.career, 1, fixtureContent);
    const lifted = must(of(later.events, 'TraitLifted')[0], 'a lifted Trait');
    expect(lifted.trait).toBe('Bruised');
    expect(lifted.heroId).toBe(hero.id);
    expect(lifted.day).toBe(4);
    expect(must(later.career.guild.roster[0], 'the Hero').traits.map((held) => held.name)).not.toContain(
      'Bruised',
    );
  });
});

describe('what the events say about the world they came from', () => {
  it('keeps every coin balance, and every Upkeep, agreeing with the Guild', () => {
    for (let seed = 0; seed < 4; seed += 1) {
      let career = start(`coin-${seed}`, { careerYears: 1, daysPerYear: 150 });
      let balance = career.guild.coin;
      while (career.ended === undefined) {
        const free = career.guild.roster.map((hero) => hero.id);
        const away = new Set(career.parties.flatMap((party) => party.heroIds));
        const party = free.filter((id) => !away.has(id)).slice(0, 2);
        const commission = career.board[0];
        if (commission !== undefined && party.length > 0) {
          career = commitParty(career, commission.id, party, fixtureContent).career;
        }
        const step = advanceUntilAttention(career, fixtureContent);
        step.events.forEach((event, index) => {
          if (event.type === 'CoinChanged') {
            balance += event.delta;
            expect(event.balance).toBe(balance);
          }
          if (event.type === 'UpkeepOwed') {
            const next = step.events[index + 1];
            expect(next?.type).toBe('CoinChanged');
            if (next?.type === 'CoinChanged') {
              expect(next.reason).toBe('upkeep');
              expect(next.delta).toBe(-event.amount);
              expect(next.balance).toBe(event.balance);
            }
          }
        });
        career = step.career;
        expect(career.guild.coin).toBe(balance);
      }
    }
  });

  it('hands back Heroes the moment their Party is reported home', () => {
    const career = start('home-again', { commissionSpanMin: 4, commissionSpanMax: 4 });
    const sent = sendFirstParty(career);
    const away = must(sent.career.parties[0], 'a Party').heroIds;
    expect(availableHeroes(sent.career).map((hero) => hero.id)).not.toContain(away[0]);
    const step = advance(sent.career, 4, fixtureContent);
    const home = must(of(step.events, 'PartyReturned')[0], 'a returned Party');
    const free = availableHeroes(step.career).map((hero) => hero.id);
    for (const id of home.heroIds) expect(free).toContain(id);
    expect(home.heroIds).toEqual(away);
  });
});

describe('the end of a Career', () => {
  const short: Partial<GameConfig> = { careerYears: 1, daysPerYear: 10 };

  it('retires the Guildmaster on the exact Day, and never a Day later', () => {
    const step = advance(start('retire', short), 50, fixtureContent);
    expect(step.career.day).toBe(11);
    expect(step.career.ended?.reason).toBe('retirement');
    expect(step.career.ended?.onDay).toBe(11);
    expect(of(step.events, 'CareerEnded')).toHaveLength(1);
    expect(step.career.ended?.reckoning.years).toBe(1);
  });

  it('does nothing at all once it is over', () => {
    const ended = advance(start('over', short), 50, fixtureContent);
    const after = advance(ended.career, 100, fixtureContent);
    expect(after.events).toEqual([]);
    expect(after.career).toEqual(ended.career);
  });

  it('answers advanceUntilAttention the same way it answers advance', () => {
    // The contract names `CareerEnded` as a rejection for `commitParty` alone. The two
    // advancing calls report an ended Career as an empty Step instead, and they agree.
    const ended = advance(start('over-again', short), 50, fixtureContent).career;
    const stepped = advance(ended, 5, fixtureContent);
    const attended = advanceUntilAttention(ended, fixtureContent);
    expect(stepped.events).toEqual([]);
    expect(attended.events).toEqual([]);
    expect(stepped.career).toEqual(ended);
    expect(attended.career).toEqual(ended);
    expect(() => commitParty(ended, 'anything', ['h1'], fixtureContent)).toThrow(/Career has ended/);
  });

  it('reports the end last, once, and never again', () => {
    const run = advance(start('last-word', short), 500, fixtureContent);
    expect(of(run.events, 'CareerEnded')).toHaveLength(1);
    expect(run.events.at(-1)?.type).toBe('CareerEnded');
    expect(advance(run.career, 500, fixtureContent).events).toEqual([]);
    expect(advanceUntilAttention(run.career, fixtureContent).events).toEqual([]);
  });

  it('treats no Days, a fraction of a Day and a Day owed backwards as standing still', () => {
    const career = start('standing-still');
    for (const days of [0, 0.9, -1, -10_000, Number.NaN]) {
      const step = advance(career, days, fixtureContent);
      expect(step.events).toEqual([]);
      expect(step.career).toEqual(career);
      expect(step.career).not.toBe(career);
    }
  });
});

describe('a Guild with nobody on the Roster', () => {
  // E1 has no Death, Departure or Retirement of a Hero, so the Roster cannot empty during
  // play; E3 to E5 will make it reachable. The loop already survives it, and this pins it.
  it('still advances, still owes Upkeep, and still refuses a Party', () => {
    const alone = start('alone', { startingHeroes: 0, careerYears: 1, daysPerYear: 60 });
    expect(alone.guild.roster).toEqual([]);
    const step = advance(alone, 60, fixtureContent);
    expect(step.career.ended?.reason).toBe('retirement');
    const owed = of(step.events, 'UpkeepOwed');
    expect(owed.length).toBeGreaterThan(0);
    for (const event of owed) expect(event.amount).toBe(defaultConfig.upkeepBase);
    expect(of(step.events, 'BeatResolved')).toHaveLength(0);
    const commission = must(alone.board[0], 'a Commission on the Board');
    expect(() => commitParty(alone, commission.id, [], fixtureContent)).toThrow(/at least one Hero/);
    expect(() => commitParty(alone, commission.id, ['h1'], fixtureContent)).toThrow(/no Hero with id/);
  });
});

describe('a world where nobody will post', () => {
  // The rule under test is what an empty Board does, so the recovery that would refill
  // it in time is switched off here rather than raced against (DL-13).
  const neverRecovers: Partial<GameConfig> = { patronRegardRecoveryEveryDays: 0 };

  it('keeps running with an empty Board rather than breaking', () => {
    const soured = editable(
      start('nobody-posts', { ...neverRecovers, careerYears: 1, daysPerYear: 60 }),
    );
    for (const patron of soured.patrons) patron.regardForGuild.value = -5;
    const step = advance(soured, 200, fixtureContent);
    expect(step.career.ended).toBeDefined();
    expect(step.career.board).toEqual([]);
    const refreshes = of(step.events, 'BoardRefreshed');
    expect(refreshes.length).toBeGreaterThan(3);
    for (const refresh of refreshes) expect(refresh.commissionIds).toEqual([]);
    // Nothing can be earned from an empty Board, so coin only ever goes one way.
    expect(step.career.guild.coin).toBeLessThan(soured.guild.coin);
    expect(of(step.events, 'CoinChanged').every((coin) => coin.reason === 'upkeep')).toBe(true);
  });

  it('runs out of money in the end, because no work can be taken', () => {
    const soured = editable(
      start('nobody-posts-ever', { ...neverRecovers, careerYears: 20, daysPerYear: 360 }),
    );
    for (const patron of soured.patrons) patron.regardForGuild.value = -5;
    const step = advance(soured, 20 * 360, fixtureContent);
    expect(step.career.ended?.reason).toBe('insolvency');
  });
});

describe('advancing until something wants attention', () => {
  it('stops on the Day the Board refreshes', () => {
    const step = advanceUntilAttention(start('attention-board'), fixtureContent);
    expect(step.career.day).toBe(10);
    expect(of(step.events, 'BoardRefreshed')).toHaveLength(1);
  });

  it('stops on the Day a Party comes home', () => {
    const career = start('attention-return', { commissionSpanMin: 4, commissionSpanMax: 4 });
    const sent = sendFirstParty(career);
    const step = advanceUntilAttention(sent.career, fixtureContent);
    expect(step.career.day).toBe(5);
    expect(of(step.events, 'PartyReturned')).toHaveLength(1);
  });

  it('stops on the Day the Career ends', () => {
    const career = start('attention-end', { careerYears: 1, daysPerYear: 10, boardRefreshEveryDays: 1000 });
    const first = advanceUntilAttention(career, fixtureContent);
    expect(first.career.day).toBe(11);
    expect(of(first.events, 'CareerEnded')).toHaveLength(1);
  });

  it('gives up after the Days it was allowed when nothing happens at all', () => {
    const quiet = start('attention-quiet', {
      boardRefreshEveryDays: 1000,
      upkeepEveryDays: 1000,
      careerYears: 100,
    });
    const step = advanceUntilAttention(quiet, fixtureContent, 5);
    expect(step.career.day).toBe(6);
    expect(of(step.events, 'BoardRefreshed')).toHaveLength(0);
  });
});
