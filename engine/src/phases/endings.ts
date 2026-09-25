// Night, last: the ending checks — Retirement, Bankruptcy, Roster wiped (approach §2). M2-S10
// fills it: a Rival's ending folds it, the player's sets `world.ended`, after which `advance` is a
// no-op. Until then it changes nothing and emits nothing.

import type { PhaseRun } from './phase.js';

export const endings: PhaseRun = () => [];
