/**
 * Architecture §10: every Vignette outcome renders with every pronoun set, and no `{`
 * survives. This is the test that stops a mis-typed token reaching a reader.
 */

import { describe, expect, it } from 'vitest';
import {
  newCareer,
  type BeatResult,
  type Career,
  type GameEvent,
  type Pronouns,
  type Vignette,
} from '@heroesim/engine';
import { narrateEvents } from '../src/index.js';
import { content } from './helpers.js';

const RESULTS: readonly BeatResult[] = ['failure', 'success', 'critical'];
const PRONOUN_SETS: readonly Pronouns[] = ['she', 'he', 'they'];

const opened = newCareer('vignette-render', content);
const base = opened.career;

function withPronouns(career: Career, pronouns: Pronouns): Career {
  return {
    ...career,
    guild: {
      ...career.guild,
      roster: career.guild.roster.map((hero, index) =>
        index === 0 ? { ...hero, pronouns } : hero,
      ),
    },
  };
}

/** The Trait the engine would have put in the Beat's slots, if the Vignette turns on one. */
function traitFor(vignette: Vignette): string | undefined {
  if (vignette.conditions.requiresTrait !== undefined) return vignette.conditions.requiresTrait;
  const rule = vignette.slots.hero;
  return rule.startsWith('with_trait:') ? rule.slice('with_trait:'.length) : undefined;
}

function beatEvent(vignette: Vignette, result: BeatResult, career: Career): GameEvent {
  const commission = career.board[0];
  const hero = career.guild.roster[0];
  if (commission === undefined || hero === undefined) {
    throw new Error('the fixture Career has no Board or no Roster');
  }
  const patron = career.patrons.find((candidate) => candidate.id === commission.patronId);
  if (patron === undefined) throw new Error('the fixture Commission has no Patron');
  const trait = traitFor(vignette);
  return {
    type: 'BeatResolved',
    day: career.day,
    partyId: 'p1.1',
    commissionId: commission.id,
    vignetteId: vignette.id,
    beatIndex: 1,
    heroId: hero.id,
    stat: vignette.stat,
    roll: 10,
    total: 14,
    dc: 12,
    result,
    slots:
      trait === undefined
        ? { heroId: hero.id, patronId: patron.id, sphereId: patron.sphere }
        : { heroId: hero.id, patronId: patron.id, sphereId: patron.sphere, trait },
  };
}

describe('every authored Vignette renders', () => {
  it('has Vignettes to render', () => {
    expect(content.vignettes.length).toBeGreaterThanOrEqual(6);
  });

  for (const vignette of content.vignettes) {
    for (const result of RESULTS) {
      for (const pronouns of PRONOUN_SETS) {
        it(`${vignette.id} / ${result} / ${pronouns}`, () => {
          const career = withPronouns(base, pronouns);
          const paragraphs = narrateEvents([beatEvent(vignette, result, career)], career, content);

          expect(paragraphs).toHaveLength(1);
          const only = paragraphs[0];
          if (only === undefined) throw new Error('no paragraph was produced');
          expect(only.kind).toBe('beat');
          expect(only.partyId).toBe('p1.1');
          expect(only.day).toBe(career.day);
          expect(only.text.trim().length).toBeGreaterThan(0);
          expect(only.text).not.toContain('{');
          expect(only.text).not.toContain('}');
        });
      }
    }
  }
});

describe('pronoun agreement in the authored prose', () => {
  const SUBJECT_VERB = '{hero.they} {hero.moves}';
  const pairs = content.vignettes.flatMap((vignette) =>
    RESULTS.filter((result) => vignette.outcomes[result].narrative.includes(SUBJECT_VERB)).map(
      (result) => ({ vignette, result }),
    ),
  );

  it('has at least one Vignette putting a pronoun in front of a verb', () => {
    expect(pairs.length).toBeGreaterThan(0);
  });

  for (const { vignette, result } of pairs) {
    it(`${vignette.id} / ${result} agrees with a singular and a plural subject`, () => {
      const she = withPronouns(base, 'she');
      const they = withPronouns(base, 'they');
      const singular = narrateEvents([beatEvent(vignette, result, she)], she, content)[0];
      const plural = narrateEvents([beatEvent(vignette, result, they)], they, content)[0];
      if (singular === undefined || plural === undefined) throw new Error('no paragraph');
      expect(singular.text).toMatch(/she moves/i);
      expect(plural.text).toMatch(/they move\b/i);
      expect(plural.text).not.toMatch(/they moves/i);
    });
  }
});
