// The probe module (M8-S3, ADR-0005 as amended 2026-09-25, data-model §3.4, approach §2, N6, DL-78):
// a module that exists only to prove the module contract end to end, before any real module is
// written. It is test-only: exported for the engine's tests, the harness (`HEROESIM_MODULES=probe`)
// and the front ends' test-only switches, and never installed by default or by a front end on its
// own.
//
// It uses every part of the contract once:
//
// - a slice, `world.modules.probe`, holding its version, a count of each hook it was called at, the
//   Turn it last asked for a stop, and its own tunables, since a module owns its tunables and none
//   is a `GameConfig` field (the epic's §2);
// - a stream of its own, `probe`, the only randomness it has;
// - all three hooks: `onMorning` counts; `onAfternoon` counts and asks fast forward to stop every
//   `probeStopEveryDays` Days; `onNight` counts, draws one number and, below `probeFireBelow`,
//   applies one effect of each kind through the effects API to a Hero on a Roster, their Guild and a
//   Patron, and emits `probe.fired` listing what it applied;
// - a migration: a slice of a fabricated version 0, which had no `lastStopTurn`, is brought to
//   version 1, so the path from a save to `migrateSlice` is exercised.

import type { InjuryTypeKey } from '../content-types.js';
import { compareByCodeUnit, type GuildId, type HeroId, type ModuleId, type PatronId, type Turn } from '../document.js';
import type { EffectRejection, EffectResult, ModuleEffect, ModuleEffects } from '../effects.js';
import type { ModuleEvent, TurnEvent } from '../events.js';
import type { Module, ModuleContext, ModuleResult, ReadonlyWorld, SliceFailure } from '../modules.js';
import { dayOf, timesOfDay, type TimeOfDay } from '../time.js';

/** The probe's id, the key of its slice, and the name of its stream. */
export const probeId: ModuleId = 'probe';

/** The version of the slice this code reads and writes. */
export const probeSliceVersion = 1;

/**
 * The probe's tunables, on its slice rather than on `GameConfig`, because a module owns its own
 * (the epic's §2): a game keeps the values its slice was made with, as it keeps its `meta.config`.
 */
export interface ProbeTunables {
  /** Days between the afternoons on which it asks fast forward to stop: a whole number from 1. */
  probeStopEveryDays: number;
  /** It fires on a night whose draw is below this, from 0 (never) to 1 (every night). */
  probeFireBelow: number;
  /** The Morale it adds to the Hero it fires on: a whole number. */
  probeMoraleDelta: number;
  /** The Wealth it adds to that Hero's Guild: a whole number. */
  probeWealthDelta: number;
  /** The Regard it adds to what the Patron it fires on holds for that Guild: a finite number. */
  probeRegardDelta: number;
  /** The Days of the Injury it gives the Hero, before their Guild's infirmary: a whole number from 1. */
  probeInjuryDays: number;
}

/**
 * The probe's tunables unless a test gives its own (`createProbe`). It fires on one night in fifty,
 * about seven times a year of 360 nights, and each effect is small beside the core's own changes (a
 * death on the Roster costs its Heroes 10 Morale). Marked pure, as `probe` is, so a bundle that never
 * installs the probe leaves both out.
 */
export const probeDefaults: Readonly<ProbeTunables> = /* @__PURE__ */ Object.freeze({
  probeStopEveryDays: 30,
  probeFireBelow: 0.02,
  probeMoraleDelta: -5,
  probeWealthDelta: 25,
  probeRegardDelta: 2,
  probeInjuryDays: 2,
});

/** The probe's slice, version 1. JSON-safe, as every slice is (data-model rule 6). */
export interface ProbeSlice extends ProbeTunables {
  version: typeof probeSliceVersion;
  /** How many times each hook was called, by the time of day it runs at. */
  hooks: Record<TimeOfDay, number>;
  /** The afternoon it last asked for a stop; `null` before its first. */
  lastStopTurn: Turn | null;
}

/** What the probe did with one effect: applied it, or had it refused. */
export type ProbeEffectOutcome =
  | { effect: ModuleEffect; applied: true }
  | { effect: ModuleEffect; applied: false; rejection: EffectRejection };

/** `probe.fired`'s payload: the night's draw, and each effect it applied, in the order it applied them. */
export interface ProbeFiredPayload {
  roll: number;
  effects: ProbeEffectOutcome[];
}

/**
 * The probe's one event: it fired, on a night, naming the Hero and the Patron it fired on (and the
 * Hero's Guild, which `emit` adds). Typed by the probe, beside the engine's union (DL-77); not a
 * Milestone.
 */
export type ProbeFired = ModuleEvent<'probe.fired', ProbeFiredPayload>;

/** The probe with `tunables` in place of `probeDefaults`' on each slice it makes. */
export function createProbe(tunables: Partial<ProbeTunables> = {}): Module<ProbeSlice> {
  const made: ProbeTunables = { ...probeDefaults, ...tunables };
  return {
    id: probeId,
    streamName: probeId,
    createSlice: () => ({ version: probeSliceVersion, hooks: { morning: 0, afternoon: 0, night: 0 }, lastStopTurn: null, ...made }),
    validateSlice: probeSliceFailures,
    migrateSlice,
    onMorning: (_world, slice) => {
      slice.hooks.morning += 1;
      return { events: [] };
    },
    onAfternoon,
    onNight,
  };
}

/** The probe with its default tunables: the one the harness and the front ends' test switches install. */
export const probe: Module<ProbeSlice> = /* @__PURE__ */ createProbe();

// ── The hooks ────────────────────────────────────────────────────────────────────────────────

/**
 * Counts, and asks for a stop on the afternoon of the Day `probeStopEveryDays` after the Day of its
 * last stop (Day 0 before its first), recording the Turn.
 */
function onAfternoon(_world: ReadonlyWorld, slice: ProbeSlice, ctx: ModuleContext): ModuleResult {
  slice.hooks.afternoon += 1;
  const since = slice.lastStopTurn === null ? 0 : dayOf(slice.lastStopTurn);
  if (dayOf(ctx.turn) - since < slice.probeStopEveryDays) return { events: [] };
  slice.lastStopTurn = ctx.turn;
  return { events: [], stop: { kind: 'module', moduleId: probeId } };
}

/**
 * Counts, and draws one number from its stream. Below `probeFireBelow` it fires: the draw, scaled
 * to the range below the threshold, picks a Hero among those on a Roster who stand ready (neither in
 * a Party nor injured), in id order, and a Patron in id order; it applies, in the order the effects
 * API lists them, Morale to the Hero, Wealth to their Guild, the Patron's Regard for that Guild, an
 * Injury of content's first type to the Hero, and a Quest of the Patron's on the Board; and it emits
 * `probe.fired` with what each did, followed by the effects' own events. With no Hero ready it
 * fires on none.
 */
function onNight(world: ReadonlyWorld, slice: ProbeSlice, ctx: ModuleContext): ModuleResult {
  slice.hooks.night += 1;
  const roll = ctx.rng.next();
  if (roll >= slice.probeFireBelow) return { events: [] };
  const ready = readyHeroes(world);
  const patronIds = (Object.keys(world.patrons) as PatronId[]).sort(compareByCodeUnit);
  if (ready.length === 0 || patronIds.length === 0) return { events: [] };

  // A draw below the threshold is uniform below it, so scaled by it, uniform below 1.
  const share = roll / slice.probeFireBelow;
  const { heroId, guildId } = ready[Math.floor(share * ready.length)] as ReadyHero;
  const patronId = patronIds[Math.floor(share * patronIds.length)] as PatronId;
  const typeKey = (Object.keys(ctx.content.injuries) as InjuryTypeKey[]).sort(compareByCodeUnit)[0] as InjuryTypeKey;
  const planned: ModuleEffect[] = [
    { kind: 'adjustMorale', heroId, delta: slice.probeMoraleDelta },
    { kind: 'adjustWealth', guildId, delta: slice.probeWealthDelta },
    { kind: 'adjustRegard', holderId: patronId, entityId: guildId, delta: slice.probeRegardDelta },
    { kind: 'injure', heroId, typeKey, days: slice.probeInjuryDays },
    { kind: 'offerQuest', patronId },
  ];

  const effects: ProbeEffectOutcome[] = [];
  const events: TurnEvent[] = [];
  for (const effect of planned) {
    const result = applyThrough(ctx.effects, effect);
    if (result.ok) {
      effects.push({ effect, applied: true });
      events.push(...result.events);
    } else {
      effects.push({ effect, applied: false, rejection: result.rejection });
    }
  }
  const fired: ProbeFired = ctx.emit({ type: 'probe.fired', participants: [heroId, patronId], payload: { roll, effects } });
  return { events: [fired, ...events] };
}

/** A Hero on a Roster who stands ready, and the Guild whose Roster they are on. */
interface ReadyHero {
  heroId: HeroId;
  guildId: GuildId;
}

/** The Heroes on the Rosters of the Guilds in play, neither in a Party nor injured, in id order. */
function readyHeroes(world: ReadonlyWorld): ReadyHero[] {
  const ready: ReadyHero[] = [];
  for (const guild of Object.values(world.guilds)) {
    if (guild.foldedOnTurn !== null) continue;
    for (const heroId of guild.rosterIds) {
      const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
      if (hero !== undefined && hero.partyId === null && hero.injury === null) ready.push({ heroId, guildId: guild.id });
    }
  }
  return ready.sort((a, b) => compareByCodeUnit(a.heroId, b.heroId));
}

/** `effect` applied through the effects API a hook is given: the only way the probe changes a core row. */
function applyThrough(effects: ModuleEffects, effect: ModuleEffect): EffectResult {
  // Each function takes its effect's fields; the record's own `kind` is the one it sets.
  switch (effect.kind) {
    case 'adjustMorale':
      return effects.adjustMorale(effect);
    case 'adjustWealth':
      return effects.adjustWealth(effect);
    case 'adjustRegard':
      return effects.adjustRegard(effect);
    case 'injure':
      return effects.injure(effect);
    case 'offerQuest':
      return effects.offerQuest(effect);
  }
}

// ── The slice read from a save ───────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A save's slice in the shape version 1 reads. Version 0, which the probe never wrote but the
 * tests fabricate so the path is exercised, had no `lastStopTurn`: it gains one, `null`, as if the
 * probe had never stopped, so its next stop comes `probeStopEveryDays` Days after Day 0. Anything
 * else is returned as it is, for `validateSlice` to accept or refuse. Changes nothing it is given.
 */
function migrateSlice(slice: unknown): ProbeSlice {
  if (!isRecord(slice) || slice.version !== 0) return slice as ProbeSlice;
  // Version 1's fields in the order `createSlice` writes them; version 0's own `version` is replaced.
  const migrated: Record<string, unknown> = { version: probeSliceVersion, hooks: slice.hooks, lastStopTurn: null, ...slice };
  migrated.version = probeSliceVersion;
  migrated.lastStopTurn = null;
  return migrated as unknown as ProbeSlice;
}

const whole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);

/**
 * The probe's refusals of a slice read from a save, after `migrateSlice`: each names the probe and
 * says where in the slice. It refuses a slice that is not an object or not version 1; a count that
 * is not a whole number from 0, a negative one first among them, or a count of anything but the
 * three times of day; a `lastStopTurn` that is neither `null` nor a Turn; and a tunable outside what
 * `ProbeTunables` allows.
 */
export function probeSliceFailures(slice: unknown): SliceFailure[] {
  const refuse = (at: (string | number)[], detail: string): SliceFailure => ({ at, detail: `The probe module refuses its slice: ${detail}` });
  if (!isRecord(slice)) return [refuse([], 'it is not an object')];
  if (slice.version !== probeSliceVersion) {
    return [refuse(['version'], `version ${JSON.stringify(slice.version)} is not the ${probeSliceVersion} this module reads`)];
  }
  const failures: SliceFailure[] = [];
  const { hooks } = slice;
  if (!isRecord(hooks)) {
    failures.push(refuse(['hooks'], 'hooks is not a count for each time of day'));
  } else {
    for (const time of timesOfDay) {
      const count = hooks[time];
      if (!whole(count) || count < 0) failures.push(refuse(['hooks', time], `the ${time} count is a whole number from 0; got ${JSON.stringify(count)}`));
    }
    for (const key of Object.keys(hooks)) {
      if (!(timesOfDay as readonly string[]).includes(key)) failures.push(refuse(['hooks', key], `${key} is not a time of day`));
    }
  }
  const { lastStopTurn } = slice;
  if (lastStopTurn !== null && (!whole(lastStopTurn) || lastStopTurn < 0)) {
    failures.push(refuse(['lastStopTurn'], `lastStopTurn is null or a Turn; got ${JSON.stringify(lastStopTurn)}`));
  }
  const tunable = (key: keyof ProbeTunables, ok: (value: unknown) => boolean, what: string): void => {
    if (!ok(slice[key])) failures.push(refuse([key], `${key} is ${what}; got ${JSON.stringify(slice[key])}`));
  };
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  tunable('probeStopEveryDays', (value) => whole(value) && value >= 1, 'a whole number from 1');
  tunable('probeFireBelow', (value) => finite(value) && value >= 0 && value <= 1, 'a number from 0 to 1');
  tunable('probeMoraleDelta', whole, 'a whole number');
  tunable('probeWealthDelta', whole, 'a whole number');
  tunable('probeRegardDelta', finite, 'a finite number');
  tunable('probeInjuryDays', (value) => whole(value) && value >= 1, 'a whole number from 1');
  return failures;
}
