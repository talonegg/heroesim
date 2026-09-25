// Morning: Board refresh, drawing from Patrons (approach §2). M2-S3 fills it: Quests offered past
// their `expiresOnTurn` expire, then the `board` stream draws Quests until the Board holds
// `config.boardSize`. Until then it changes nothing and emits nothing.

import type { PhaseRun } from './phase.js';

export const boardRefresh: PhaseRun = () => [];
