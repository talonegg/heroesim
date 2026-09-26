// Afternoon: Quests in flight advance (approach §2). Nothing in M2: a Party is simply away until
// its `returnsOnTurn` (M2-S4). Its Encounters resolve on the night it returns, not here: M4 defers
// reporting a Quest's progress in the afternoon (M4's "deliberately deferred"), so a Quest is a report.

import type { PhaseRun } from './phase.js';

export const questsAdvance: PhaseRun = () => [];
