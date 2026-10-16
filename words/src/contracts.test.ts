import { describe, expect, test } from 'vitest';
import { contractWords, daysUntil, releaseWarningWords } from './contracts.js';

// A Contract as a table cell and a sentence read it (DL-323): the Days left, Out of Contract, Under
// Offer, and the release warning said as an estimate. A Day is three Turns.

const contract = (endDay: number) => ({ contract: { wage: 22, signedOnTurn: 0, years: 1, endDay } });

describe('the Days left', () => {
  test('are the Days from the Day of the Turn to the end Day, 0 on it and once it has passed', () => {
    expect(daysUntil(0, 360)).toBe(360);
    expect(daysUntil(3 * 359 + 2, 360)).toBe(1);
    expect(daysUntil(3 * 360, 360)).toBe(0);
    expect(daysUntil(3 * 400, 360)).toBe(0);
  });
});

describe("a Hero's Contract as a cell", () => {
  test('says the Days left, with the singular', () => {
    expect(contractWords(contract(360), 0, false)).toBe('360 Days left');
    expect(contractWords(contract(360), 3 * 359, false)).toBe('1 Day left');
  });

  test('says Out of Contract from the night of the end Day, not before', () => {
    expect(contractWords(contract(10), 3 * 10, false)).toBe('0 Days left');
    expect(contractWords(contract(10), 3 * 10 + 2, false)).toBe('Out of Contract');
    expect(contractWords(contract(10), 3 * 30, false)).toBe('Out of Contract');
  });

  test('adds Under Offer after it, and says nothing for a Hero with no Contract', () => {
    expect(contractWords(contract(360), 0, true)).toBe('360 Days left, Under Offer');
    expect(contractWords(contract(10), 3 * 30, true)).toBe('Out of Contract, Under Offer');
    expect(contractWords({ contract: null }, 0, false)).toBe('');
  });
});

describe('the warning for releasing the last Hero', () => {
  const short = { payout: 400, wealthAfter: 50, cheapestFee: 110, covers: false };

  test('says the Roster would be wiped when the Wealth after the payout is short', () => {
    expect(releaseWarningWords('Bran Tull', short)).toBe(
      "Bran Tull is your Guild's last Hero. Releasing them pays 4 Gold, leaving 50 Silver, short of the cheapest signing fee, " +
        '1 Gold 10 Silver: the Roster would be wiped and the game would end.',
    );
  });

  test("says it covers the fee only as an estimate, the night's Hall upkeep and the pool's refresh coming first", () => {
    expect(releaseWarningWords('Bran Tull', { ...short, wealthAfter: 500, covers: true })).toBe(
      "Bran Tull is your Guild's last Hero. Releasing them pays 4 Gold, leaving 5 Gold, which covers the cheapest signing fee, " +
        "1 Gold 10 Silver, as an estimate: the night's Hall upkeep and the pool's refresh come before the Roster is checked.",
    );
  });
});
