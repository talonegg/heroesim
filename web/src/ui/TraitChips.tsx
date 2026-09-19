import type { HeroTrait } from '@heroesim/engine';

/**
 * Traits as chips. An Injury — a Trait carrying the Day it lifts — is marked, because a
 * Trait that heals reads differently from one that does not (ADR-0005).
 */
export function TraitChips({ traits, label }: { traits: HeroTrait[]; label: string }) {
  if (traits.length === 0) return <p className="empty">No Traits.</p>;
  return (
    <ul className="chips" aria-label={label}>
      {traits.map((trait) => (
        <li
          className={trait.liftsOn === undefined ? 'chip' : 'chip chip--injury'}
          key={`${trait.name}.${trait.since}`}
        >
          {trait.name}
          {trait.liftsOn === undefined ? '' : ` · lifts on Day ${trait.liftsOn}`}
        </li>
      ))}
    </ul>
  );
}
