// An amount of Wealth as coins (DL-294 item 1): each part's number and then its disc, a gold disc for
// the Gold and a silver one for the Silver left, largest first and a zero part left out, `0` and a
// silver disc for nothing, a minus leading a debt. The parts are `@heroesim/words`' `coinParts`, one
// formatter for the page, the CLI and the words.
//
// What a screen reader reads is the sentence form, "5 Gold 20 Silver", in a visually hidden span; the
// numbers and discs are hidden from it, and say the sentence again as a tooltip. This is the Chip's
// `spoken` pattern (`ui.tsx`): an `aria-label` on a span with no role is not read reliably, and the
// hidden sentence stays a text a test finds by `getByText`. The amount in Silver is on `data-silver`,
// for a test to read as a number.

import { coinParts, coinWords, signedCoins } from '@heroesim/words';

/**
 * `silver` as coins. `signed` shows a gain with a plus, as a ledger's or a return's change is shown
 * (`signedCoins`); nothing stays unsigned.
 */
export function Coins({ silver, signed = false }: { silver: number; signed?: boolean }) {
  const { negative, parts } = coinParts(silver);
  const words = signed ? signedCoins(silver) : coinWords(silver);
  const sign = negative ? '-' : signed && silver > 0 ? '+' : '';
  return (
    <span className="coins" data-silver={silver}>
      <span aria-hidden="true" title={words}>
        {sign}
        {parts.map(({ coin, count }) => (
          <span key={coin} className={`coin coin--${coin}`}>
            {count}
          </span>
        ))}
      </span>
      <span className="visually-hidden">{words}</span>
    </span>
  );
}
