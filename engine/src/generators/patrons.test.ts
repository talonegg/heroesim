import { describe, expect, test } from 'vitest';
import { generatePatron } from './patrons.js';
import { testDeps, testWorld } from './test-content.js';

describe('generatePatron', () => {
  test('makes a Patron of a name, a Sphere and empty Regard, storing no Quest templates (D3)', () => {
    const deps = testDeps();
    const world = testWorld('patron', deps);
    const { patron } = generatePatron(world, deps);

    expect(Object.keys(patron).sort()).toEqual(['id', 'name', 'regard', 'sphereKey']);
    expect(patron.id).toBe('patron-000001');
    expect(world.counters.patrons).toBe(2);
    expect(world.patrons[patron.id]).toBe(patron);
    expect(deps.content.names.patron).toContain(patron.name);
    expect(Object.keys(deps.content.spheres)).toContain(patron.sphereKey);
    expect(patron.regard).toEqual({});
  });

  test('takes the Sphere and name it is given', () => {
    const deps = testDeps();
    const world = testWorld('given', deps);
    const { patron } = generatePatron(world, deps, { sphereKey: 'church', name: 'Mother Aldith' });

    expect(patron).toMatchObject({ sphereKey: 'church', name: 'Mother Aldith' });
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
      [...deps.content.names.patron].sort(),
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
    expect(() => generatePatron(world, deps, { name: '' })).toThrow(RangeError);
    expect(world).toEqual(before);
  });
});
