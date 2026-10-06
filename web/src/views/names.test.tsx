import type { EngineEventOf, EntityId, GuildId, HeroId, PartyId, QuestId } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { content } from '../content';
import { narrateSegments, type Narration } from '../state/namer';
import { HistoryLinksContext, Names, type HistoryLinks } from './history-entries';

// The page's Namer, as the page draws it (v1.1.6-S12, DL-186 item 1): the narration's sentence
// (`@heroesim/words`) filled by `state/namer.ts`, each name a button that opens whom it names, the
// rest its words; and, where no shell gives links, words alone. No id is drawn.

afterEach(cleanup);

const guildId = 'guild-000002' as GuildId;
const heroId = 'hero-000007' as HeroId;
const otherHeroId = 'hero-000009' as HeroId;
const questId = 'quest-000003' as QuestId;
const labels: Record<string, string> = { [guildId]: 'The Kestrel Guild', [heroId]: 'Brenna Ashcombe', [otherHeroId]: 'Aldred Barrowby' };
const narration: Narration = { content, questName: () => 'Clear the barrow', calendar: { turnsPerYear: 1080 } };

const taken = {
  type: 'quest.taken',
  turn: 9,
  participants: [questId, 'party-000004', heroId, otherHeroId, guildId] as EntityId[],
  labels,
  milestone: false,
  payload: { questId, partyId: 'party-000004' as PartyId, guildId, heroIds: [heroId, otherHeroId], returnsOnTurn: 23 },
} as EngineEventOf<'quest.taken'>;

/** The shell's links, its `onName` a spy. */
function links(): HistoryLinks {
  return { log: [], onName: vi.fn(), onHistory: vi.fn() };
}

describe("the page's Namer, drawn", () => {
  test('makes each name a button that opens whom it names, and the rest words, reading as the sentence', () => {
    const shell = links();
    const { container } = render(
      <HistoryLinksContext.Provider value={shell}>
        <p>
          <Names segments={narrateSegments(taken, narration)} />
        </p>
      </HistoryLinksContext.Provider>,
    );

    expect(container.textContent).toBe('The Kestrel Guild sent Brenna Ashcombe and Aldred Barrowby on Clear the barrow, back on the night of Year 1 Day 8.');
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['The Kestrel Guild', 'Brenna Ashcombe', 'Aldred Barrowby']);
    fireEvent.click(screen.getByRole('button', { name: 'Aldred Barrowby' }));
    expect(shell.onName).toHaveBeenCalledWith({ kind: 'name', text: 'Aldred Barrowby', entityId: otherHeroId, table: 'heroes' });
    expect(container.textContent).not.toMatch(/(guild|hero|quest|party)-\d{6}/);
  });

  test('draws words alone where no shell gives links', () => {
    const { container } = render(
      <p>
        <Names segments={narrateSegments(taken, narration)} />
      </p>,
    );

    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(container.textContent).toBe('The Kestrel Guild sent Brenna Ashcombe and Aldred Barrowby on Clear the barrow, back on the night of Year 1 Day 8.');
  });
});
