import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { cameHome, played, started } from '../state/game.test-support';
import { navButton } from './page.test-support';

// The History rail (M9-S3, DL-103), as the player's Guild's History shows it since M9-F4 (DL-111
// item 4, DL-112 item 7): no XP, Morale, Regard, Upkeep, purchase or sale, and "New" counting only
// what it shows, as the navigation's count does.

afterEach(cleanup);

function rail(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Latest for The Lantern' });
}

function railSentences(): string[] {
  return within(rail())
    .getAllByRole('listitem')
    .map((item) => (item.textContent ?? '').replace(/^Day \d+, (morning|afternoon|night)(New)? /, ''));
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
