import { describe, expect, it } from 'vitest';
import { availableHeroes, type Career } from '@heroesim/engine';
import {
  careerReducer,
  emptyCareerState,
  MAX_PARAGRAPHS,
  type CareerAction,
  type CareerState,
} from '../src/state/careerReducer';

const SEED = 'reducer-test-01';

/** Start a Career and settle it, so the next action is accepted. */
function started(): CareerState {
  const begun = careerReducer(emptyCareerState, { type: 'newCareer', seed: SEED, years: 1 });
  return careerReducer(begun, { type: 'settled' });
}

/** Drive a list of actions, settling between each, as the app does. */
function drive(state: CareerState, actions: CareerAction[]): CareerState {
  return actions.reduce(
    (held, action) => careerReducer(careerReducer(held, action), { type: 'settled' }),
    state,
  );
}

function careerOf(state: CareerState): Career {
  if (state.career === null) throw new Error('expected a Career');
  return state.career;
}

describe('the career reducer', () => {
  it('starts a Career from a seed and narrates what happened', () => {
    const state = started();
    expect(careerOf(state).seed).toBe(SEED);
    expect(careerOf(state).day).toBe(1);
    expect(state.paragraphs.length).toBeGreaterThan(0);
    expect(state.message).toBeNull();
  });

  it('honours the optional years field, for testing a short Career', () => {
    expect(careerOf(started()).config.careerYears).toBe(1);
    const full = careerReducer(emptyCareerState, { type: 'newCareer', seed: SEED });
    expect(careerOf(full).config.careerYears).toBeGreaterThan(1);
  });

  it('commits a Party and advances until something wants attention', () => {
    const begun = started();
    const career = careerOf(begun);
    const commission = career.board[0];
    expect(commission).toBeDefined();
    const heroIds = availableHeroes(career)
      .slice(0, 2)
      .map((hero) => hero.id);

    const committed = drive(begun, [
      { type: 'commit', commissionId: commission?.id ?? '', heroIds },
    ]);
    expect(careerOf(committed).parties).toHaveLength(1);
    expect(careerOf(committed).board).toHaveLength(career.board.length - 1);

    const advanced = drive(committed, [{ type: 'advance' }]);
    expect(careerOf(advanced).day).toBeGreaterThan(careerOf(committed).day);
    expect(advanced.paragraphs.length).toBeGreaterThan(committed.paragraphs.length);
  });

  it('never mutates the Career it was given, over twenty actions', () => {
    let state = started();
    const before = JSON.stringify(careerOf(state));
    const frozen = careerOf(state);
    Object.freeze(frozen);

    for (let step = 0; step < 20; step += 1) {
      const career = careerOf(state);
      const commission = career.board[0];
      const heroIds = availableHeroes(career)
        .slice(0, 2)
        .map((hero) => hero.id);
      state = drive(state, [
        ...(commission !== undefined && heroIds.length > 0
          ? [{ type: 'commit', commissionId: commission.id, heroIds } as CareerAction]
          : []),
        { type: 'advance' },
      ]);
    }

    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('turns every EngineError into a sentence rather than a crash', () => {
    const begun = started();

    const noCommission = careerReducer(begun, {
      type: 'commit',
      commissionId: 'no-such-commission',
      heroIds: ['h1'],
    });
    expect(noCommission.message).toBe('That Commission is not on the Board any more.');
    expect(noCommission.career).toBe(begun.career);

    const commission = careerOf(begun).board[0];
    const empty = careerReducer(begun, {
      type: 'commit',
      commissionId: commission?.id ?? '',
      heroIds: [],
    });
    expect(empty.message).toBe('A Party needs at least one Hero in it.');

    const unknownHero = careerReducer(begun, {
      type: 'commit',
      commissionId: commission?.id ?? '',
      heroIds: ['nobody'],
    });
    expect(unknownHero.message).toContain('cannot go');
  });

  it('refuses to commit a Hero who will not go unless the action says to insist (E2)', () => {
    const begun = started();
    const career = careerOf(begun);

    // World generation never starts anybody low enough to refuse, so the Career is put
    // into the state the rule is about and handed back through `load`.
    const soured = JSON.parse(JSON.stringify(career)) as Career;
    const hero = soured.guild.roster[0];
    if (hero === undefined) throw new Error('expected a Roster');
    hero.regardForGuildmaster = {
      value: soured.config.refusalRegardThreshold,
      reason: 'you sent them anyway',
      nature: 'neutral',
    };
    const loaded = drive(begun, [{ type: 'load', career: soured }]);
    const commissionId = careerOf(loaded).board[0]?.id ?? '';

    const refused = careerReducer(loaded, { type: 'commit', commissionId, heroIds: [hero.id] });
    expect(refused.message).toContain('will not take this work');
    expect(refused.career).toBe(loaded.career);
    expect(careerOf(refused).parties).toHaveLength(0);

    const insisted = drive(loaded, [
      { type: 'commit', commissionId, heroIds: [hero.id], insist: true },
    ]);
    expect(insisted.message).toBeNull();
    expect(careerOf(insisted).parties).toHaveLength(1);
    expect(
      careerOf(insisted).guild.roster.find((entry) => entry.id === hero.id)?.regardForGuildmaster
        .value,
    ).toBe(soured.config.refusalRegardThreshold - soured.config.insistenceRegardCost);
  });

  it('drops a second engine action that arrives before the first has settled', () => {
    const begun = started();
    const once = careerReducer(begun, { type: 'advance' });
    const twice = careerReducer(once, { type: 'advance' });
    expect(twice).toBe(once);
    expect(careerOf(twice).day).toBe(careerOf(once).day);

    // Once it has settled, the next Advance is taken as normal.
    const settled = careerReducer(twice, { type: 'settled' });
    const third = careerReducer(settled, { type: 'advance' });
    expect(careerOf(third).day).toBeGreaterThan(careerOf(once).day);
  });

  it('dismisses a message without touching the Career', () => {
    const begun = started();
    const refused = careerReducer(begun, {
      type: 'commit',
      commissionId: 'nope',
      heroIds: ['h1'],
    });
    const settled = careerReducer(refused, { type: 'settled' });
    const dismissed = careerReducer(settled, { type: 'dismiss' });
    expect(dismissed.message).toBeNull();
    expect(dismissed.career).toBe(begun.career);
  });

  it('loads a Career and says so, keeping the report short', () => {
    const begun = started();
    const career = careerOf(begun);
    const loaded = careerReducer(begun, { type: 'load', career });
    expect(loaded.career).toBe(career);
    expect(loaded.paragraphs).toHaveLength(1);
    expect(loaded.paragraphs[0]?.text).toContain(career.guild.name);
  });

  it('keeps only the last 200 Paragraphs', () => {
    let state = started();
    for (let step = 0; step < 90 && state.paragraphs.length <= MAX_PARAGRAPHS; step += 1) {
      const career = careerOf(state);
      const commission = career.board[0];
      const heroIds = availableHeroes(career)
        .slice(0, 2)
        .map((hero) => hero.id);
      state = drive(state, [
        ...(commission !== undefined && heroIds.length > 0
          ? [{ type: 'commit', commissionId: commission.id, heroIds } as CareerAction]
          : []),
        { type: 'advance' },
      ]);
    }
    expect(state.paragraphs.length).toBeLessThanOrEqual(MAX_PARAGRAPHS);
  });
});
