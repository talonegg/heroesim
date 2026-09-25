// Named random streams, one per subsystem that draws (ADR-0001, ADR-0009 as amended
// 2026-09-26, data-model §3.1).
//
// M1-S1 fixes only the stream names and that a stream's state is plain JSON inside
// `world.rng`. M1-S2 chooses the generator (DL-12) and adds, here, the functions that seed and
// draw from it.

/**
 * The core streams. Each is added in the milestone that introduces the subsystem that draws
 * from it, and a new subsystem never shares an old stream (pre-M0 review D7). M1 draws only
 * to generate the world.
 */
export const streamNames = ['generation'] as const;

export type StreamName = (typeof streamNames)[number];

/**
 * One stream's state: plain numbers, so that the document stays JSON-safe (data-model rule 6).
 * Its length and meaning belong to the generator M1-S2 chooses.
 */
export type RngState = number[];
