// Night, first: Quests concluding go to the Quest Engine and their outcomes are applied
// (approach §2). M2-S5 fills it: each Party whose `returnsOnTurn` has come is resolved by the stub
// Quest Engine, drawing from the `quests` stream. Until then it changes nothing and emits nothing.

import type { PhaseRun } from './phase.js';

export const questsConclude: PhaseRun = () => [];
