import type { Career, HeroTrait } from '@heroesim/engine';
import { isInjuryTrait, isScar, traitSummary } from '../state/selectors';
import { formatDay } from '../words';

/**
 * Traits as chips. Three kinds are told apart in words as well as in colour: an Injury
 * carries the Day it lifts, a Scar says it is one, and everything else is what the person
 * is (ADR-0005). Nothing here is distinguished by colour alone.
 *
 * @param career when given, the Day an Injury lifts is shown as the player reads it —
 * "Year 3, Day 47" rather than a Day number.
 * @param summaries when true, each chip carries the summary content gives the Trait
 * beside its name — which is the whole of why a Trait is worth printing, and what the
 * terminal's Roster has always shown (E7-S3, E8-S6). Off elsewhere, because the terminal
 * prints bare names on the other screens too.
 */
export function TraitChips({
  traits,
  label,
  career,
  summaries = false,
}: {
  traits: HeroTrait[];
  label: string;
  career?: Career;
  summaries?: boolean;
}) {
  if (traits.length === 0) return <p className="empty">No Traits.</p>;
  return (
    <ul className="chips" aria-label={label}>
      {traits.map((trait) => {
        const injury = isInjuryTrait(trait);
        const scar = !injury && isScar(trait.name);
        // Wrapped, never cut: the summary is the whole of why the Trait is printed.
        const says = summaries ? traitSummary(trait.name) : undefined;
        return (
          <li
            className={injury ? 'chip chip--injury' : scar ? 'chip chip--scar' : 'chip'}
            key={`${trait.name}.${trait.since}`}
            data-testid={injury ? 'chip-injury' : scar ? 'chip-scar' : 'chip'}
          >
            {trait.name}
            {says === undefined ? '' : ` — ${says}`}
            {injury
              ? ` · lifts ${
                  career === undefined ? `on Day ${trait.liftsOn}` : formatDay(trait.liftsOn, career)
                }`
              : scar
                ? ' · Scar'
                : ''}
          </li>
        );
      })}
    </ul>
  );
}
