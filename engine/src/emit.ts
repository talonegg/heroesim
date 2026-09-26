// Making an event (data-model §4, epics README §4). A rule says what happened — the type, the
// entities it touches and the payload — and `emit` completes it from the world as it stands: the
// Turn, the Guild of every Hero involved, each participant's display name, and whether the type
// is a Milestone. The phases of the Turn pipeline reach it as `ctx.emit`; actions make their own.
//
// `emit` only makes the event. The caller returns it, and `advance` or the action appends it to
// the History through `append`, the History's one writer (ADR-0008). The choices here are DL-24.

import { isId, parseId, type EntityId, type Hero, type World } from './document.js';
import { isMilestone, type EngineEventOf, type EngineEventType } from './events.js';

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
  return <Type extends EngineEventType>({ type, participants, payload }: EventDraft<Type>) => {
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
    const event = { turn: world.turn, type, participants: named, labels, milestone: isMilestone(type, payload), payload };
    return event as unknown as EngineEventOf<Type>;
  };
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
