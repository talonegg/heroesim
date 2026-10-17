// A signing's Contract length (DL-315 item 4): the first wage at each length the config offers, and the
// choice of one beside the button that signs (Recruit, Take in). The wages are the engine's
// (`contractTerms`); the length chosen goes to the action as `years`, which the engine checks.

import { useState } from 'react';
import type { ContractTerm } from '../state/contract-terms';
import { Coins } from './coins';

/** `1 Year`, `2 Years`: Year is a glossary term (ui-text.md). */
export function yearsWords(years: number): string {
  return `${years} ${years === 1 ? 'Year' : 'Years'}`;
}

/** The first wage at each length, as a sentence: `Contract wage by length: 1 Year 20 Silver, 2 Years …`. */
export function WagesByLength({ terms }: { terms: ContractTerm[] }) {
  if (terms.length === 0) return null;
  return (
    <p data-testid="wages-by-length">
      Contract wage by length:{' '}
      {terms.map(({ years, wage }, index) => (
        <span key={years}>
          {index === 0 ? '' : ', '}
          {yearsWords(years)} <Coins silver={wage} />
        </span>
      ))}
      .
    </p>
  );
}

/** A length to choose, the first offered to begin with, and the button that signs for it. */
export function SignForLength({
  terms,
  name,
  text,
  label,
  className,
  disabled,
  describedBy,
  onSign,
}: {
  terms: ContractTerm[];
  /** The Hero, for the length's own label. */
  name: string;
  /** The button's words, and its label naming the Hero. */
  text: string;
  label: string;
  className?: string;
  disabled: boolean;
  describedBy?: string | undefined;
  onSign: (years: number) => void;
}) {
  const [years, setYears] = useState(terms[0]?.years ?? 0);
  return (
    <span className="sign-for-length">
      <select aria-label={`Contract length for ${name}`} value={years} disabled={disabled} onChange={(event) => setYears(Number(event.target.value))}>
        {terms.map((term) => (
          <option key={term.years} value={term.years}>
            {yearsWords(term.years)}
          </option>
        ))}
      </select>
      <button type="button" className={className} aria-label={label} aria-describedby={describedBy} disabled={disabled} onClick={() => onSign(years)}>
        {text}
      </button>
    </span>
  );
}
