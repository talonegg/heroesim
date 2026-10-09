// @heroesim/engine/testing (v1.1.6-S8, DL-186 item 9): what the other packages' tests take of the
// engine and their production code does not, so that the engine's entry holds only what a front
// end, the harness, content or a tool plays or reads with. Rows, ids and History entries built by
// hand, the probe module's factory, and a few tables and readers a test pins words or Turns to.
// ESLint bars this entry from production code (eslint.config.js; engine/src/boundary.test.ts proves
// the rule fires), and engine/src/testing.test.ts holds every package's production code to it.

export { chanceBandNames, potentialHints } from './config.js';
export { describeHero } from './descriptions.js';
export { makeId } from './document.js';
export { append, count, createHistory } from './history.js';
export { createItem, findStack } from './items.js';
export { marketHolder } from './market.js';
export { createProbe } from './modules/probe.js';
export { chanceBand } from './quest-engine/estimate.js';
export { nightOf } from './time.js';
