import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from './advance.js';
import { createWorld } from './create.js';
import type { PatronId, WorldDocument } from './document.js';
import type { EngineEvent } from './events.js';
import { phases } from './pipeline.js';
import type { Phase, PhaseContext } from './phases/phase.js';
import { dayOf, timeOfDay } from './time.js';
import { testContent, testDeps, withValid } from './world.test-support.js';

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const deps = testDeps();

function newDocument(seed = 'advance'): WorldDocument {
  return createWorld(seed, setup, deps).document;
}

function phaseNamed(name: string): Phase {
  const found = phases.find((phase) => phase.name === name);
  if (found === undefined) throw new Error(`No phase ${name}`);
  return found;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('advance', () => {
  test("returns a new document with a new world, sharing the old one's meta and history", () => {
    const document = newDocument();

    const { document: next } = advance(document, deps);

    expect(next).not.toBe(document);
    expect(next.world).not.toBe(document.world);
    expect(next.meta).toBe(document.meta);
    expect(next.history).toBe(document.history);
    expect(withValid(next, testContent)).toBe(next);
  });

  test("leaves the input document's world as it was", () => {
    const document = newDocument();
    const before = structuredClone(document.world);

    advance(document, deps);

    expect(document.world).toEqual(before);
  });

  test('moves time on one Turn per call: after three, it is the morning of Day 1', () => {
    let document = newDocument();
    expect(document.world.turn).toBe(0);

    for (let call = 1; call <= 3; call += 1) {
      document = withValid(advance(document, deps).document, testContent);
      expect(document.world.turn).toBe(call);
    }

    expect(dayOf(document.world.turn)).toBe(1);
    expect(timeOfDay(document.world.turn)).toBe('morning');
  });

  test("runs the phases on the copy with the rules and content of deps, at the new Turn", () => {
    const document = newDocument();
    // Not the config the world was created under: the phases read deps, never meta.
    const played = testDeps({ turnsPerYear: 7 });
    const seen: { world: unknown; ctx: PhaseContext }[] = [];
    vi.spyOn(phaseNamed('rivalControllers'), 'run').mockImplementation((world, ctx) => {
      seen.push({ world, ctx });
      return [];
    });

    const { document: next } = advance(document, played);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.world).toBe(next.world);
    expect(seen[0]?.ctx).toMatchObject({ config: played.config, content: played.content, turn: 1 });
    expect(seen[0]?.ctx.config).toBe(played.config);
  });

  test('appends every event the phases return to the History, in order, and returns them', () => {
    const document = newDocument();
    const [first, second] = Object.keys(document.world.patrons) as PatronId[];
    if (first === undefined || second === undefined) throw new Error('The world has too few Patrons');
    const entries = document.history.entries.length;
    // Any event type serves: the phases are stubs until their stories fill them.
    const patronEvent = (ctx: PhaseContext, patronId: PatronId): EngineEvent =>
      ctx.emit({ type: 'patron.generated', participants: [patronId], payload: { patronId, sphereKey: 'crown' } });
    vi.spyOn(phaseNamed('questsAdvance'), 'run').mockImplementation((_world, ctx) => [patronEvent(ctx, second)]);
    vi.spyOn(phaseNamed('rivalControllers'), 'run').mockImplementation((_world, ctx) => [patronEvent(ctx, first)]);

    const { document: next, events } = advance(document, deps);

    expect(events.map((event) => event.participants)).toEqual([[first], [second]]);
    expect(events.every((event) => event.turn === 1)).toBe(true);
    expect(next.history.entries.slice(entries)).toEqual(events);
    expect(next.history.entries[entries]).toBe(events[0]);
    // The old document shares the History, so it sees the new entries too (ADR-0008).
    expect(document.history.entries).toHaveLength(entries + 2);
  });

  test('reports no stop when nothing asks time to stop', () => {
    expect(advance(newDocument(), deps).stoppedBecause).toBeNull();
  });
});

describe('an ended world', () => {
  test('advance changes nothing and reports the typed stop', () => {
    const document = newDocument();
    document.world.ended = { turn: 0, reason: 'retirement' };
    const before = structuredClone(document);
    const run = vi.spyOn(phaseNamed('rivalControllers'), 'run');

    const result = advance(document, deps);

    expect(result).toEqual({ document, events: [], stoppedBecause: { kind: 'ended' } });
    expect(result.document).toBe(document);
    expect(document).toEqual(before);
    expect(run).not.toHaveBeenCalled();
  });

  test('the Turn whose phases end the game reports the stop, and the next does nothing', () => {
    vi.spyOn(phaseNamed('endings'), 'run').mockImplementation((world) => {
      world.ended = { turn: world.turn, reason: 'bankruptcy' };
      return [];
    });
    let document = newDocument();

    document = advance(document, deps).document; // afternoon of Day 0
    const night = advance(document, deps);

    expect(night.stoppedBecause).toEqual({ kind: 'ended' });
    expect(night.document.world.ended).toEqual({ turn: 2, reason: 'bankruptcy' });
    const after = advance(night.document, deps);
    expect(after.document).toBe(night.document);
    expect(after.document.world.turn).toBe(2);
  });
});
