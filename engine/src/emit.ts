// Making an event (data-model §4, epics README §4). A rule says what happened — the type, the
// entities it touches and the payload — and `emit` completes it from the world as it stands: the
// Turn, the Guild of every Hero involved, each participant's display name, and whether the type
// is a Milestone. The phases of the Turn pipeline reach it as `ctx.emit`; actions make their own.
// A module's hooks reach `moduleEventEmitter`'s, which makes the module's own events the same way
// (M8-S2, DL-77).
//
// `emit` only makes the event. The caller returns it, and `advance` or the action appends it to
// the History through `append`, the History's one writer (ADR-0008). The choices here are DL-24.

import { isId, parseId, type EntityId, type EventType, type Hero, type ModuleId, type World } from './document.js';
import { isEngineEvent, isMilestone, type EngineEventOf, type EngineEventType, type ModuleEvent } from './events.js';

/** What a rule writes to emit an event: its type, the entities it touches, and its payload. */
export interface EventDraft<Type extends EngineEventType = EngineEventType> {
  type: Type;
  /** Every entity the event touches; the Guild of a Hero among them may be left out. */
  participants: readonly EntityId[];
  payload: EngineEventOf<Type>['payload'];
}

/** Completes a draft into the event it describes (see `eventEmitter`). */
export type Emit = <Type extends EngineEventType>(draft: EventDraft<Type>) => EngineEventOf<Type>;

/**
 * An `emit` reading `world`, the World State the events happen in. The event it makes carries:
 *
 * - `turn`: `world.turn`;
 * - `participants`: the draft's, each once and in its order, then the Guild of each Hero among
 *   them who has one and whose Guild is not already listed (data-model §4), so a Guild's index
 *   holds its Heroes' entries;
 * - `labels`: each participant's display name as it is now, for the rows that have one (Guilds,
 *   Guildmasters, Heroes, Patrons); a row with no name of its own has no label and a front end
 *   shows its id;
 * - `milestone`: its type's entry in `milestoneTypes`, or for a type in `milestoneWhen` what that
 *   type's rule says of the payload (`isMilestone`; M5-S5's `quest.loot`, DL-52).
 *
 * Throws on a programming error: a participant that is not an entity id, or whose row is not in
 * `world`. A rule that removes a row emits its event first.
 */
export function eventEmitter(world: World): Emit {
  return <Type extends EngineEventType>({ type, participants, payload }: EventDraft<Type>) =>
    entryOf(world, type, participants, payload, isMilestone(type, payload)) as unknown as EngineEventOf<Type>;
}

/**
 * What a module writes to emit one of its own events (M8-S2, DL-77): its type, in the module's
 * namespace, the entities it touches, its payload, JSON-safe as every payload is (data-model rule 6),
 * and whether it is a Milestone, which it is not unless the module says so.
 */
export interface ModuleEventDraft<Type extends EventType = EventType, Payload = unknown> {
  type: Type;
  participants: readonly EntityId[];
  payload: Payload;
  milestone?: boolean;
}

/** Completes a module's draft into its event (see `moduleEventEmitter`). */
export type ModuleEmit = <Type extends EventType, Payload>(draft: ModuleEventDraft<Type, Payload>) => ModuleEvent<Type, Payload>;

/**
 * The `emit` a hook of the module `moduleId` is given (M8-S2, DL-77): it completes the module's
 * draft from `world` exactly as `eventEmitter` completes an engine event (the Turn, the Heroes'
 * Guilds among the participants, their labels), with the Milestone flag the draft gives, `false`
 * when it gives none, since the engine's table knows no module's types.
 *
 * Throws on a programming error: a type outside the module's namespace, `<moduleId>.<what>`, or one
 * of the engine's, which a module changes only through its effects; and whatever `eventEmitter`
 * throws on.
 */
export function moduleEventEmitter(world: World, moduleId: ModuleId): ModuleEmit {
  const prefix = `${moduleId}.`;
  return <Type extends EventType, Payload>({ type, participants, payload, milestone = false }: ModuleEventDraft<Type, Payload>) => {
    if (!type.startsWith(prefix) || type.length === prefix.length || isEngineEvent({ type })) {
      throw new RangeError(
        `The ${moduleId} module emits its own events, typed ${prefix}<what-happened> and none of the engine's; got ${JSON.stringify(type)}`,
      );
    }
    return entryOf(world, type, participants, payload, milestone) as unknown as ModuleEvent<Type, Payload>;
  };
}

/** The entry `world` makes of an event of `type` touching `participants`, with its Milestone flag. */
function entryOf(world: World, type: EventType, participants: readonly EntityId[], payload: unknown, milestone: boolean): object {
  const given = [...new Set(participants)];
  const named = [...given];
  for (const id of given) {
    const row = rowOf(world, id);
    if (!isId('heroes', id)) continue;
    const { guildId } = row as Hero;
    if (guildId !== null && !named.includes(guildId)) named.push(guildId);
  }
  const labels: Record<EntityId, string> = {};
  for (const id of named) {
    const row = rowOf(world, id);
    if ('name' in row && typeof row.name === 'string') labels[id] = row.name;
  }
  return { turn: world.turn, type, participants: named, labels, milestone, payload };
}

/** The row `id` names in `world`, which must be there. */
function rowOf(world: World, id: EntityId): object {
  const parsed = parseId(id);
  if (parsed === null) throw new TypeError(`A participant is an entity id; got ${JSON.stringify(id)}`);
  const rows: Readonly<Record<string, object>> = world[parsed.table];
  const row = Object.hasOwn(rows, id) ? rows[id] : undefined;
  if (row === undefined) {
    throw new RangeError(`${id} is not in world.${parsed.table}: a rule emits its event before it removes a row`);
  }
  return row;
}
