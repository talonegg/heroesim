import { createWorld, defaultConfig, playerGuild, type Guild } from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { expect, test } from 'vitest';
import { dispatchParty } from './dispatch.js';

const content = loadContent();
const deps = { config: defaultConfig, content };

// The player's Guild never folds (its ending ends the game), so no save the CLI plays reaches this
// refusal; the message map must still have it, since `dispatch` refuses a folded Guild first (DL-31).
test("puts dispatch's guild-folded refusal into words, before any other check", () => {
  const { document } = createWorld('demo', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps);
  const guild = playerGuild(document.world) as Guild;
  guild.foldedOnTurn = 0;
  const [questId] = document.world.board;
  if (questId === undefined) throw new Error('An empty Board');

  const outcome = dispatchParty(
    { name: 'dispatch', save: 'current', quest: questId, heroes: guild.rosterIds.slice(0, 1) },
    document,
    deps,
  );

  expect(outcome).toEqual({ ok: false, problem: 'The Test has folded and sends no one.' });
});
