// @vitest-environment node
import type { HeroId, QuestId } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { changed, documentOf, holding, played, started, withPartyOut } from './game.test-support';
import { carrying, choiceFor, noPartyChoices, partyBuilder, standingChoices, toggled, withChoice, type PartyChoice } from './party-choices';
import { partyRows, previewView } from './selectors';

// The Parties chosen on the Board and not sent (DL-109 item 2, Q16): kept by Quest, beyond the Board
// view, until the Party is sent, its Quest leaves the Board, or another game is started or loaded.

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
    const expiring = changed(started(), (document) => {
      const quest = document.world.quests[document.world.board[0] as QuestId];
      if (quest !== undefined) quest.expiresOnTurn = document.world.turn;
    });
    const later = played(expiring, { kind: 'advance', turns: 3 });
    const left = documentOf(expiring).world.board[0] as QuestId;
    expect(documentOf(later).world.board).not.toContain(left);
    expect(standingChoices(choices, documentOf(later))).not.toHaveProperty(left);
  });
});

// The Party builder's rows without React (DL-186 item 5): what `Builder` laid out is
// one answer now, whose parts the view only renders.
describe('the Party builder', () => {
  const state = holding(started(), 'healing-draught', 3);
  const document = documentOf(state);
  const questId = document.world.board[0] as QuestId;
  const free = (partyRows(document, questId) ?? []).filter((row) => row.why === null).map((row) => row.heroId);

  test('marks the Heroes chosen on their rows, in the rows the selector gives', () => {
    const [first, second] = free as [HeroId, HeroId];

    const builder = partyBuilder(document, questId, { heroIds: [second], carry: {} });

    expect(builder.rows.map((row) => row.heroId)).toEqual((partyRows(document, questId) ?? []).map((row) => row.heroId));
    expect(builder.rows.filter((row) => row.chosen).map((row) => row.heroId)).toEqual([second]);
    expect(builder.rows.find((row) => row.heroId === first)).toMatchObject({ chosen: false });
    expect(builder.party).toEqual([second]);
  });

  test('keeps in the Party only Heroes who can still go: a Hero chosen and then injured, or gone, drops out', () => {
    const [first, second] = free as [HeroId, HeroId];
    const hurt = changed(state, (each) => {
      const hero = each.world.heroes[first];
      if (hero !== undefined) hero.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    });

    const builder = partyBuilder(documentOf(hurt), questId, { heroIds: [first, second, 'hero-999999' as HeroId], carry: {} });

    expect(builder.party).toEqual([second]);
    expect(builder.rows.find((row) => row.heroId === first)).toMatchObject({ chosen: false, why: 'injured' });
  });

  test('holds each consumable carried to what the Guild holds, the stocks and the Party showing the same number', () => {
    const builder = partyBuilder(document, questId, { heroIds: [], carry: { 'healing-draught': 9, whetstone: 2, lockpicks: -1 } });

    expect(builder.stocks.find((stock) => stock.definitionKey === 'healing-draught')).toMatchObject({ held: 3, carrying: 3 });
    expect(builder.stocks.find((stock) => stock.definitionKey === 'whetstone')).toBeUndefined();
    expect(builder.consumables).toEqual([{ definitionKey: 'healing-draught', quantity: 3 }]);
    expect(partyBuilder(document, questId, { heroIds: [], carry: { 'healing-draught': 1.9 } }).consumables).toEqual([{ definitionKey: 'healing-draught', quantity: 1 }]);
    expect(partyBuilder(document, questId, { heroIds: [], carry: {} }).consumables).toEqual([]);
  });

  test("gives dispatch's preview of the Party and the consumables, and none for a Quest off the Board", () => {
    const [first] = free as [HeroId];
    const choice = { heroIds: [first], carry: { 'healing-draught': 2 } };

    const builder = partyBuilder(document, questId, choice);

    expect(builder.preview).toEqual(previewView(document, questId, [first], [{ definitionKey: 'healing-draught', quantity: 2 }]));
    expect(builder.preview).not.toBeNull();
    const off = partyBuilder(document, 'quest-999999' as QuestId, choice);
    expect(off).toMatchObject({ rows: [], party: [], preview: null });
  });

  test('toggled ticks a Hero last and unticks them, leaving the rest in the order ticked', () => {
    const [a, b, c] = ['hero-000001', 'hero-000002', 'hero-000003'] as [HeroId, HeroId, HeroId];
    const choice: PartyChoice = { heroIds: [a, b], carry: { whetstone: 1 } };

    expect(toggled(choice, c, true)).toEqual({ heroIds: [a, b, c], carry: { whetstone: 1 } });
    expect(toggled(choice, a, true).heroIds).toEqual([b, a]);
    expect(toggled(choice, a, false).heroIds).toEqual([b]);
    expect(choice.heroIds).toEqual([a, b]);
  });

  test('carrying sets one consumable, leaving the others, and reads a number that is not finite as none', () => {
    const choice: PartyChoice = { heroIds: [someone], carry: { whetstone: 1 } };

    expect(carrying(choice, 'healing-draught', 2)).toEqual({ heroIds: [someone], carry: { whetstone: 1, 'healing-draught': 2 } });
    expect(carrying(choice, 'whetstone', Number.NaN).carry).toEqual({ whetstone: 0 });
    expect(choice.carry).toEqual({ whetstone: 1 });
  });
});
