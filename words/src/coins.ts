// Wealth in coins (DL-294 item 1): every amount is held in whole Silver, and shown largest Gold
// first, then the Silver left, a zero part left out. One formatter for the page, the CLI and the
// words: the sentence form for prose ("5 Gold 20 Silver"), the letters form for the CLI's tables and
// command lines (`5g 20s`), and the parts the page draws as coins. The signed form for a gain or a
// loss is `signedCoins`, beside `signed()` (`names.ts`).

/** Silver in a Gold (DL-294 item 1): a fixed rate of the words, not a tuning value. */
export const silverPerGold = 100;

/** Wealth's two coins (CONTEXT.md: Gold, Silver). */
export type Coin = 'gold' | 'silver';

/** One coin's part of an amount: `count` of `coin`, never 0 but for nothing's `0` Silver. */
export interface CoinPart {
  coin: Coin;
  count: number;
}

/** An amount in coins: its magnitude's parts, largest first, and whether a minus leads them. */
export interface CoinParts {
  negative: boolean;
  parts: readonly CoinPart[];
}

/**
 * `silver` in its parts: the Gold, then the Silver left, a zero part left out, and `0` Silver alone
 * for nothing. Throws a RangeError on an amount that is not whole Silver, which no stored amount is
 * (`engine/src/validate.ts`): a fraction here is a bug upstream, never something to round away.
 */
export function coinParts(silver: number): CoinParts {
  if (!Number.isSafeInteger(silver)) throw new RangeError(`An amount is whole Silver; got ${silver}`);
  const magnitude = Math.abs(silver);
  const gold = Math.floor(magnitude / silverPerGold);
  const left = magnitude % silverPerGold;
  const parts: CoinPart[] = [];
  if (gold > 0) parts.push({ coin: 'gold', count: gold });
  if (left > 0 || gold === 0) parts.push({ coin: 'silver', count: left });
  return { negative: silver < 0, parts };
}

const coinNames: Readonly<Record<Coin, string>> = { gold: 'Gold', silver: 'Silver' };
const coinLettersOf: Readonly<Record<Coin, string>> = { gold: 'g', silver: 's' };

/** The sentence form: `5 Gold 20 Silver`, `1 Gold`, `20 Silver`, `0 Silver`, `-5 Gold 20 Silver`. */
export function coinWords(silver: number): string {
  const { negative, parts } = coinParts(silver);
  return (negative ? '-' : '') + parts.map(({ coin, count }) => `${count} ${coinNames[coin]}`).join(' ');
}

/** The letters form, the CLI's: `5g 20s`, `1g`, `20s`, `0s`, `-5g 20s`. */
export function coinLetters(silver: number): string {
  const { negative, parts } = coinParts(silver);
  return (negative ? '-' : '') + parts.map(({ coin, count }) => `${count}${coinLettersOf[coin]}`).join(' ');
}
