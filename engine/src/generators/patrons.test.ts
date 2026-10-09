import { describe, expect, test } from 'vitest';
import { pickUnused, streamOf } from './draw.js';
import { generatePatron } from './patrons.js';
import { testDeps, testWorld } from '../world.test-support.js';

describe('generatePatron', () => {
  test('makes a Patron of a name, its sex, a Sphere and empty Regard, storing no Quest templates (D3)', () => {
    const deps = testDeps();
    const world = testWorld('patron', deps);
    const { patron } = generatePatron(world, deps);

    expect(Object.keys(patron).sort()).toEqual(['id', 'name', 'regard', 'sex', 'sphereKey']);
    expect(patron.id).toBe('patron-000001');
    expect(world.counters.patrons).toBe(2);
    expect(world.patrons[patron.id]).toBe(patron);
    expect(deps.content.names.patron).toContainEqual({ name: patron.name, sex: patron.sex });
    expect(Object.keys(deps.content.spheres)).toContain(patron.sphereKey);
    expect(patron.regard).toEqual({});
  });

  test('takes the Sphere, and the name and the sex it is given together', () => {
    const deps = testDeps();
    const world = testWorld('given', deps);
    const { patron } = generatePatron(world, deps, { sphereKey: 'church', name: 'Mother Aldith', sex: 'female' });

    expect(patron).toMatchObject({ sphereKey: 'church', name: 'Mother Aldith', sex: 'female' });
    // A body, which has no sex, is given `null` (DL-125 item 5); none is drawn yet.
    expect(generatePatron(world, deps, { name: 'The Salt Guild', sex: null }).patron.sex).toBeNull();
  });

  test('draws the name v1.1.1 drew, from the same names in the same order, and the sex that comes with it', () => {
    const deps = testDeps();
    const names = deps.content.names.patron.map(({ name }) => name);
    for (let round = 0; round < 10; round += 1) {
      const world = testWorld(`as-before-${round}`, deps);
      for (let i = 0; i < names.length; i += 1) {
        // v1.1.1's draw, from a copy of the stream: the bare names no Patron has, in one draw.
        const used = new Set(Object.values(world.patrons).map(({ name }) => name));
        const expected = pickUnused(structuredClone(streamOf(world)), names, used, 'Patron');

        const { patron } = generatePatron(world, deps);

        expect(patron.name).toBe(expected);
        expect(patron.sex).toBe(deps.content.names.patron.find(({ name }) => name === expected)?.sex);
      }
    }
  });

  test('draws Patrons of both sexes', () => {
    const deps = testDeps();
    const world = testWorld('sexes', deps);
    for (let i = 0; i < deps.content.names.patron.length; i += 1) generatePatron(world, deps);

    expect(new Set(Object.values(world.patrons).map(({ sex }) => sex))).toEqual(new Set(['female', 'male']));
  });

  test('draws every Sphere when none is given', () => {
    const deps = testDeps();
    const spheres = new Set<string>();
    for (let round = 0; round < 10; round += 1) {
      const world = testWorld(`spheres-${round}`, deps);
      for (let i = 0; i < deps.content.names.patron.length; i += 1) spheres.add(generatePatron(world, deps).patron.sphereKey);
    }

    expect([...spheres].sort()).toEqual(Object.keys(deps.content.spheres).sort());
  });

  test('never draws a name another Patron has, and throws once every name is taken', () => {
    const deps = testDeps();
    const world = testWorld('names', deps);
    for (let i = 0; i < deps.content.names.patron.length; i += 1) generatePatron(world, deps);

    expect(Object.values(world.patrons).map((patron) => patron.name).sort()).toEqual(
      deps.content.names.patron.map(({ name }) => name).sort(),
    );
    const before = structuredClone(world);
    expect(() => generatePatron(world, deps)).toThrow(/Patron name/);
    expect(world).toEqual(before);
  });

  test('emits patron.generated naming the Patron', () => {
    const deps = testDeps();
    const world = testWorld('events', deps);
    world.turn = 9;
    const { patron, events } = generatePatron(world, deps);

    expect(events).toEqual([
      {
        turn: 9,
        type: 'patron.generated',
        participants: [patron.id],
        labels: { [patron.id]: patron.name },
        milestone: false,
        payload: { patronId: patron.id, sphereKey: patron.sphereKey },
      },
    ]);
  });

  test('throws, changing nothing, on an unknown Sphere or a blank name', () => {
    const deps = testDeps();
    const world = testWorld('refusals', deps);
    const before = structuredClone(world);

    expect(() => generatePatron(world, deps, { sphereKey: 'guilds' })).toThrow(/guilds/);
    expect(() => generatePatron(world, deps, { name: '', sex: 'male' })).toThrow(RangeError);
    expect(world).toEqual(before);
  });

  test('throws, changing nothing, on a name given without a sex, or a sex without a name: a programming error', () => {
    const deps = testDeps();
    const world = testWorld('no-sex', deps);
    const before = structuredClone(world);

    expect(() => generatePatron(world, deps, { name: 'Mother Aldith' })).toThrow(/sex/);
    expect(() => generatePatron(world, deps, { sex: 'female' })).toThrow(/name/);
    expect(world).toEqual(before);
  });
});
