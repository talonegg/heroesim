/**
 * The terminal front end's entry point. Everything it does is in `main.ts`; this exists
 * so that `npm run play` and every spawned end-to-end test keep pointing at one path
 * while the modules behind it are free to move (E7 §4).
 */

import { main } from './main.js';

await main();
