// What a command that acts within the current Turn makes of an open save (M2-S4): `main.ts`'s
// `act` opens the save, applies the command, and writes and prints, or refuses and writes nothing.

import type { WorldDocument } from '@heroesim/engine';

/** A new document to write and the lines to print, or the problem to print instead. */
export type CommandOutcome = { ok: true; document: WorldDocument; lines: string[] } | { ok: false; problem: string };
