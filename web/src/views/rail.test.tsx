import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { cameHome, played, started, withPartyOut, withReturn } from '../state/game.test-support';
import { navButton } from './page.test-support';

// The History rail (M9-S3, DL-103), as the player's Guild's History shows it since M9-F4 (DL-111
// item 4, DL-112 item 7): no XP, Morale, Regard, Upkeep, purchase or sale, and "New" counting only
// what it shows, as the navigation's count does.

afterEach(cleanup);

function rail(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Latest for The Lantern' });
}

/** The rail's lines, each its sentence: a return's is its own line's, without the Heroes' lines under it (M9-F5). */
function railSentences(): string[] {
  return Array.from(rail().querySelectorAll<HTMLElement>('.lines--rail > li')).map((item) =>
    (item.querySelector('.entry__text')?.textContent ?? (item.textContent ?? '').replace(/^Day \d+, (morning|afternoon|night)(New)? /, '')),
  );
}

describe('the rail keeps to what the Guild’s History shows (M9-F4)', () => {
  test('a Party home: its return is there and new, its Heroes’ XP and Morale are not, and "New" is the navigation’s count', () => {
    render(<App initial={cameHome(started('reducer-test'))} />);
    const sentences = railSentences();

    expect(sentences.some((sentence) => /^The Lantern's Party came home from /.test(sentence))).toBe(true);
    for (const pattern of [/ gained \d+ XP\.$/, /Morale/, /Regard/, / paid \d+ Upkeep/, / bought /, / sold /]) {
      expect(sentences.filter((sentence) => pattern.test(sentence)), String(pattern)).toEqual([]);
    }
    const count = /(\d+) new$/.exec(navButton('History').textContent ?? '')?.[1];
    expect(count).toBeDefined();
    expect(within(rail()).getByText(`${count} new`)).toBeDefined();
    expect(within(rail()).getAllByText('New')).toHaveLength(Number(count));
  });

  test('a purchase is not in it, and nothing is new', () => {
    render(<App initial={played(started(), { kind: 'buy', definitionKey: 'padded-jack', quantity: 1 })} />);

    expect(railSentences().some((sentence) => / bought /.test(sentence))).toBe(false);
    expect(within(rail()).queryByText('New')).toBeNull();
    expect(within(rail()).queryByText(/ new$/)).toBeNull();
  });
});

describe('a Party’s return in the rail (M9-F5, DL-111 item 2)', () => {
  test('is one entry: the band in bold and the reward, a line per Hero behind a disclosure, "Open the report", the Loot the next entry, its Injury after it (M9-F7), and no Encounter', () => {
    const written = withReturn(withPartyOut(started('rail-return')), {
      band: 'strong',
      wealth: 150,
      fame: 3,
      xp: 40,
      encounters: [{ outcome: 'success' }, { outcome: 'failure', injured: [0] }],
      injuries: [{ hero: 0, typeKey: 'bruised-ribs', healsOnTurn: 999 }],
      levels: [{ hero: 1, level: 2 }],
      loot: [{ definitionKey: 'whetstone', quantity: 2 }],
    });
    render(<App initial={written.state} />);
    const items = within(rail()).getAllByRole('listitem').filter((item) => item.parentElement?.classList.contains('lines--rail'));
    const at = items.findIndex((item) => item.querySelector('strong.entry__band') !== null);
    const entry = items[at] as HTMLElement;

    expect(entry.querySelector('strong')?.textContent).toBe('succeeded strongly');
    expect(entry.textContent).toMatch(/The Lantern's Party came home from .+ and succeeded strongly: Wealth \+150, Fame \+3\./);
    const heroes = within(entry).getByRole('button', { name: /^\d+ Heroes: how each fared on / });
    const lines = document.getElementById(heroes.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(heroes.getAttribute('aria-expanded')).toBe('false');
    expect(lines.hidden).toBe(true);
    fireEvent.click(heroes);
    expect(lines.hidden).toBe(false);
    expect(within(lines).getAllByRole('listitem')).toHaveLength(written.party.heroIds.length);
    expect(within(lines).getAllByRole('listitem')[0]?.textContent).toMatch(/^.+: gained 40 XP; injured: Bruised ribs, healing on the night of Day \d+\.$/);
    expect(within(lines).getAllByRole('listitem')[1]?.textContent).toMatch(/^.+: gained 40 XP; reached Level 2\.$/);
    expect(within(entry).getByRole('button', { name: /^Open the report: / })).toBeDefined();
    // The Loot is the next entry, then the Injury, standing out as an entry of its own (DL-120 item 6); no Encounter.
    expect(items[at + 1]?.textContent).toMatch(/The Lantern found Loot on .+: 2 × Whetstone\.$/);
    expect(items[at + 2]?.textContent).toMatch(/ was injured /);
    expect(railSentences().filter((sentence) => /was injured/.test(sentence))).toHaveLength(1);
    expect(railSentences().some((sentence) => /\(Encounter \d+\)/.test(sentence))).toBe(false);
  });
});
