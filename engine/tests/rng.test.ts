import { describe, expect, it } from 'vitest';
import { advance } from '../src/career.js';
import { nextFloat, nextInt, nextUint32, rngOn, seedRng, type RngState } from '../src/rng.js';
import { deserialiseCareer, serialiseCareer } from '../src/save.js';
import { newCareer } from '../src/world.js';
import { fixtureContent } from './fixtures.js';

describe('the Career generator', () => {
  it('gives the same four words for the same seed', () => {
    expect(seedRng('Ashfall')).toEqual(seedRng('Ashfall'));
    expect(seedRng('Ashfall')).not.toEqual(seedRng('Ashfall '));
  });

  it('never seeds a zero word, which xoshiro can never leave', () => {
    for (const seed of ['', '0', 'a', 'the Lowford Guild', 'x'.repeat(200)]) {
      for (const word of seedRng(seed)) expect(word).not.toBe(0);
    }
  });

  it('draws unsigned 32-bit words', () => {
    let state = seedRng('words');
    for (let draw = 0; draw < 1000; draw += 1) {
      const next = nextUint32(state);
      expect(Number.isInteger(next.value)).toBe(true);
      expect(next.value).toBeGreaterThanOrEqual(0);
      expect(next.value).toBeLessThan(0x100000000);
      state = next.state;
    }
  });

  it('does not touch the state it was handed', () => {
    const state: RngState = seedRng('immutable');
    const before = [...state];
    nextUint32(state);
    nextInt(state, 20);
    nextFloat(state);
    expect([...state]).toEqual(before);
  });

  it('draws floats inside the unit interval and ints inside their bound', () => {
    let state = seedRng('bounds');
    for (let draw = 0; draw < 2000; draw += 1) {
      const float = nextFloat(state);
      expect(float.value).toBeGreaterThanOrEqual(0);
      expect(float.value).toBeLessThan(1);
      const int = nextInt(float.state, 6);
      expect(int.value).toBeGreaterThanOrEqual(0);
      expect(int.value).toBeLessThan(6);
      state = int.state;
    }
  });

  it('refuses a bound that is not a positive whole number', () => {
    const state = seedRng('bad bound');
    expect(() => nextInt(state, 0)).toThrow(/positive whole bound/);
    expect(() => nextInt(state, -3)).toThrow(/positive whole bound/);
    expect(() => nextInt(state, 2.5)).toThrow(/positive whole bound/);
  });

  it('spreads a d20 over every face without a visible lean', () => {
    const rng = rngOn({ rng: seedRng('distribution') });
    const counts = new Array<number>(20).fill(0);
    const draws = 40_000;
    for (let draw = 0; draw < draws; draw += 1) {
      const face = rng.int(20);
      counts[face] = (counts[face] ?? 0) + 1;
    }
    const expected = draws / 20;
    for (const count of counts) {
      expect(count).toBeGreaterThan(expected * 0.85);
      expect(count).toBeLessThan(expected * 1.15);
    }
    const mean = counts.reduce((sum, count, face) => sum + count * face, 0) / draws;
    expect(mean).toBeGreaterThan(9.0);
    expect(mean).toBeLessThan(10.0);
  });

  it('shuffles without losing or duplicating anything', () => {
    const rng = rngOn({ rng: seedRng('shuffle') });
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let round = 0; round < 50; round += 1) {
      const shuffled = rng.shuffle(items);
      expect([...shuffled].sort()).toEqual([...items].sort());
    }
  });

  it('carries its state through a save, so a loaded Career runs the same path', () => {
    const start = advance(newCareer('rng-save', fixtureContent).career, 25, fixtureContent).career;
    const loaded = deserialiseCareer(serialiseCareer(start));
    expect(loaded.rng).toEqual(start.rng);

    const straightOn = advance(start, 40, fixtureContent);
    const afterLoad = advance(loaded, 40, fixtureContent);
    expect(afterLoad.events).toEqual(straightOn.events);
    expect(afterLoad.career).toEqual(straightOn.career);
  });
});
