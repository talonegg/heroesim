import type { HeroId, QuestId, WorldDocument } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { changed, played, started, withPartyOut } from './game.test-support';
import { choiceFor, noPartyChoices, standingChoices, withChoice, type PartyChoice } from './party-choices';

// The Parties chosen on the Board and not sent (DL-109 item 2, Q16): kept by Quest, beyond the Board
// view, until the Party is sent, its Quest leaves the Board, or another game is started or loaded.

function documentOf(state: ReturnType<typeof started>): WorldDocument {
  if (state.document === null) throw new Error('no game');
  return state.document;
}

const someone = 'hero-000001' as HeroId;

describe('the Parties chosen and not sent', () => {
  test("keeps each Quest's choice, the Heroes and the consumables, and reads an untouched Quest's as empty", () => {
    const [first, second] = documentOf(started()).world.board as [QuestId, QuestId];
    const choice: PartyChoice = { heroIds: [someone], carry: { 'healing-draught': 2 } };

    const kept = withChoice(noPartyChoices, first, choice);

    expect(choiceFor(kept, first)).toEqual(choice);
    expect(choiceFor(kept, second)).toEqual({ heroIds: [], carry: {} });
    // Another Quest's choice leaves the first as it was.
    const both = withChoice(kept, second, { heroIds: [], carry: { whetstone: 1 } });
    expect(choiceFor(both, first)).toEqual(choice);
    expect(choiceFor(both, second)).toEqual({ heroIds: [], carry: { whetstone: 1 } });
  });

  test('holds only for the Quests still on the Board: a Party sent, or a Quest gone from the Board, takes its choice with it', () => {
    const state = started();
    const choices = Object.fromEntries(documentOf(state).world.board.map((questId) => [questId, { heroIds: [someone], carry: {} }]));

    // Nothing has left the Board: the same choices, as they were.
    expect(standingChoices(choices, documentOf(state))).toBe(choices);

    // A Party sent: its Quest leaves the Board, and its choice goes with it.
    const sent = withPartyOut(state);
    const gone = documentOf(state).world.board.filter((questId) => !documentOf(sent).world.board.includes(questId));
    expect(gone).toHaveLength(1);
    expect(Object.keys(standingChoices(choices, documentOf(sent))).sort()).toEqual(documentOf(sent).world.board.slice().sort());

    // A Quest gone from the Board once its last Day has passed: its choice goes too.
    const expiring = changed(state, (document) => {
      const quest = document.world.quests[document.world.board[0] as QuestId];
      if (quest !== undefined) quest.expiresOnTurn = document.world.turn;
    });
    const later = played(expiring, { kind: 'advance', turns: 3 });
    const left = documentOf(expiring).world.board[0] as QuestId;
    expect(documentOf(later).world.board).not.toContain(left);
    expect(standingChoices(choices, documentOf(later))).not.toHaveProperty(left);
  });
});
