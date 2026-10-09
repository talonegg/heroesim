import { loadContent } from '@heroesim/content/node';
import {
  applyAction,
  applyActions,
  defaultConfig,
  serialise,
  type EngineDeps,
  type GuildAction,
  type WorldActionResult,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { playGame } from './play.js';
import { automaticPolicy } from './policy.js';

// A Guild's actions in a Turn applied on one copy (DL-238, ADR-0011 as amended), held to the same
// actions applied one by one through `applyAction` over played games: the policy's list each Turn,
// each of its actions twice in a row, and the Turn before's list with this Turn's reversed after it,
// so that the lists hold refusals of many kinds between actions done.

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };
/** Twenty Days: long enough for Parties to leave and come home, and short for `npm test`. */
const years = 60 / deps.config.turnsPerYear;

/** `actions` applied one by one to `document` through `applyAction`: the document they leave, and each one's outcome. */
function oneByOne(document: WorldDocument, actions: readonly GuildAction[], given: EngineDeps) {
  const results: WorldActionResult[] = [];
  let current = document;
  for (const action of actions) {
    const result = applyAction(current, action, given);
    if (result.ok) current = result.document;
    results.push(result.ok ? { ok: true, events: result.events } : result);
  }
  return { document: current, results };
}

describe('A list of actions applied at once', () => {
  test.each(['actions-a', 'actions-b', 'actions-c'])(
    'equals the same actions applied one by one, refusals included: the documents to the byte, and every outcome and event (%s)',
    (seed) => {
      const reasons = new Set<string>();
      let done = 0;
      let lists = 0;
      let last: GuildAction[] = [];
      const choose = (document: WorldDocument, played: EngineDeps, policy: Parameters<typeof automaticPolicy>[2]): GuildAction[] => {
        const chosen = automaticPolicy(document, played, policy);
        const variants = [chosen, chosen.flatMap((action) => [action, action]), [...last, ...[...chosen].reverse()]];
        for (const actions of variants) {
          if (actions.length === 0) continue;
          lists += 1;
          const together = applyActions(structuredClone(document), actions, played);
          const apart = oneByOne(structuredClone(document), actions, played);
          expect(together.results).toEqual(apart.results);
          expect(serialise(together.document)).toBe(serialise(apart.document));
          for (const result of together.results) {
            if (result.ok) done += 1;
            else reasons.add(`${result.rejection.action} ${result.rejection.reason}`);
          }
        }
        last = chosen;
        return chosen;
      };

      const game = playGame(seed, deps, { years, choose });

      expect(game.refusals).toEqual([]);
      expect(lists).toBeGreaterThan(20);
      expect(done).toBeGreaterThan(20);
      expect(reasons.size).toBeGreaterThanOrEqual(4);
    },
    60_000,
  );
});
