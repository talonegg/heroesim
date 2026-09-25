// Night: the Unattached pool refresh (approach §2). M2-S8 fills it: Heroes past
// `unattachedStayDays` leave, then the `pool` stream refills the pool to `unattachedPoolSize`.
// Until then it changes nothing and emits nothing.

import type { PhaseRun } from './phase.js';

export const poolRefresh: PhaseRun = () => [];
