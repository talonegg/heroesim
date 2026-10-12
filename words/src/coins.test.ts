import { describe, expect, test } from 'vitest';
import { coinLetters, coinParts, coinWords, silverPerGold } from './coins.js';
import { signedCoins } from './names.js';

// DL-294 item 1: Wealth is held in whole Silver, 100 Silver a Gold, and shown largest Gold first, a
// zero part left out: "5 Gold 20 Silver" in sentences, `5g 20s` in the CLI.

describe('the coins', () => {
  test('a Gold is 100 Silver', () => {
    expect(silverPerGold).toBe(100);
  });

  test.each<[string, number, string, string]>([
    ['nothing', 0, '0 Silver', '0s'],
    ['a Silver', 1, '1 Silver', '1s'],
    ['under a Gold', 20, '20 Silver', '20s'],
    ['a Silver short of a Gold', 99, '99 Silver', '99s'],
    ['one whole Gold', 100, '1 Gold', '1g'],
    ['whole Gold', 500, '5 Gold', '5g'],
    ['Gold and Silver', 520, '5 Gold 20 Silver', '5g 20s'],
    ['a Gold and a Silver', 101, '1 Gold 1 Silver', '1g 1s'],
    ['a debt under a Gold', -20, '-20 Silver', '-20s'],
    ['a debt of whole Gold', -300, '-3 Gold', '-3g'],
    ['a debt of Gold and Silver', -520, '-5 Gold 20 Silver', '-5g 20s'],
    ['a large amount', 1_000_000, '10000 Gold', '10000g'],
    ['a large amount with Silver left', 1_234_567, '12345 Gold 67 Silver', '12345g 67s'],
  ])('%s: %i Silver reads "%s" and `%s`', (_, silver, words, letters) => {
    expect(coinWords(silver)).toBe(words);
    expect(coinLetters(silver)).toBe(letters);
  });

  test('the parts: largest Gold first, then the Silver left, a zero part left out', () => {
    expect(coinParts(520)).toEqual({ negative: false, parts: [{ coin: 'gold', count: 5 }, { coin: 'silver', count: 20 }] });
    expect(coinParts(500)).toEqual({ negative: false, parts: [{ coin: 'gold', count: 5 }] });
    expect(coinParts(20)).toEqual({ negative: false, parts: [{ coin: 'silver', count: 20 }] });
  });

  test('the parts of nothing are 0 Silver alone, unsigned, even a negative zero', () => {
    expect(coinParts(0)).toEqual({ negative: false, parts: [{ coin: 'silver', count: 0 }] });
    expect(coinParts(-0)).toEqual({ negative: false, parts: [{ coin: 'silver', count: 0 }] });
    expect(coinWords(-0)).toBe('0 Silver');
  });

  test('a negative amount is its magnitude in parts, the minus leading', () => {
    expect(coinParts(-520)).toEqual({ negative: true, parts: [{ coin: 'gold', count: 5 }, { coin: 'silver', count: 20 }] });
  });

  test.each([0.5, -20.25, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])('%s is not whole Silver, and is refused with a throw', (silver) => {
    expect(() => coinParts(silver)).toThrow(RangeError);
    expect(() => coinWords(silver)).toThrow(RangeError);
    expect(() => coinLetters(silver)).toThrow(RangeError);
    expect(() => signedCoins(silver)).toThrow(RangeError);
  });
});

describe('a gain or a loss in coins, beside signed()', () => {
  test.each<[string, number, string]>([
    ['a gain', 520, '+5 Gold 20 Silver'],
    ['a gain under a Gold', 20, '+20 Silver'],
    ['a loss', -20, '-20 Silver'],
    ['a loss of Gold and Silver', -1_050, '-10 Gold 50 Silver'],
    ['nothing, unsigned as signed(0) is', 0, '0 Silver'],
  ])('%s', (_, silver, expected) => {
    expect(signedCoins(silver)).toBe(expected);
  });
});
