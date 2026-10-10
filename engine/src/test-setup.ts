// The engine's tests: each History `withValid` read only from where it last left it during a test is
// read whole at the test's end, and a fault the partial reads could not see fails the test (DL-234).

import { afterEach } from 'vitest';
import { checkWhatHistoryFromHid } from './world.test-support.js';

checkWhatHistoryFromHid();
afterEach(() => {
  checkWhatHistoryFromHid();
});
