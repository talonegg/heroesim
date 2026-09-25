// Afternoon, first: Rival controllers act, on what the player left on the Board and in the pool
// during the morning (approach §2, pre-M0 review D2). M2-S9 fills it: each Rival, in Guild id
// order, takes the `Action`s its disposition chooses through the same actions a player's front
// end calls. Until then it changes nothing and emits nothing.

import type { PhaseRun } from './phase.js';

export const rivalControllers: PhaseRun = () => [];
