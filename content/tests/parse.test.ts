import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseToml } from 'smol-toml';
import {
  advanceUntilAttention,
  availableHeroes,
  defaultConfig,
  newCareer,
  commitParty,
  type Career,
  type Content,
  type GameEvent,
  type Hero,
} from '@heroesim/engine';
import { ContentError } from '@heroesim/engine';
import { parseContent } from '../src/index.js';
import { loadContentFromDisk } from '../src/node.js';

const content: Content = loadContentFromDisk();

/** The same policy the engine's contract suite plays with, over the real content. */
function autoPlay(start: Career, onEvents: (events: GameEvent[]) => void): Career {
  const strength = (hero: Hero): number =>
    hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;
  let career = start;
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the auto policy never reached the end of the Career');
    const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
    const byFee = [...career.board].sort((one, other) => other.fee - one.fee);
    let taken = 0;
    for (const commission of byFee) {
      const party = free.slice(taken, taken + 2).map((hero) => hero.id);
      if (party.length === 0) break;
      const step = commitParty(career, commission.id, party, content);
      career = step.career;
      onEvents(step.events);
      taken += party.length;
    }
    const step = advanceUntilAttention(career, content);
    career = step.career;
    onEvents(step.events);
  }
  return career;
}

describe('the authored content', () => {
  it('loads from disk without an error', () => {
    expect(() => loadContentFromDisk()).not.toThrow();
  });

  it('holds what the starter set is meant to hold', () => {
    expect(content.vignettes).toHaveLength(10);
    expect(content.traits).toHaveLength(27);
    expect(content.backgrounds).toHaveLength(12);
    expect(content.spheres).toHaveLength(4);
    expect(content.names.heroFirst.length).toBeGreaterThan(20);
    expect(content.names.guildNames.length).toBeGreaterThan(0);
    expect(content.names.rivalNames.length).toBeGreaterThan(0);
  });

  it('loads the Vignettes in a fixed order, so a seed means the same thing every run', () => {
    expect(content.vignettes.map((vignette) => vignette.id)).toEqual(
      loadContentFromDisk().vignettes.map((vignette) => vignette.id),
    );
    expect(content.vignettes.map((vignette) => vignette.id)).toEqual([
      'barred-gate',
      'collapsed-passage',
      'fever-in-the-wet',
      'night-attack',
      'quarrel-on-the-road',
      'river-crossing',
      'talked-past',
      'terms-on-the-road',
      'the-find',
      'word-spreads',
    ]);
  });

  it('maps the snake_case conditions on disk onto the contract’s names', () => {
    const quarrel = content.vignettes.find((vignette) => vignette.id === 'quarrel-on-the-road');
    expect(quarrel?.conditions.minBeat).toBe(2);
    expect(quarrel?.conditions.requiresTrait).toBe('Hot-headed');
    expect(quarrel?.slots.hero).toBe('with_trait:Hot-headed');

    const fall = content.vignettes.find((vignette) => vignette.id === 'collapsed-passage');
    expect(fall?.conditions.spheres).toEqual(['mine-consortium']);
    expect(fall?.conditions.tags).toEqual(['delve', 'dark', 'recover', 'hunt']);

    const find = content.vignettes.find((vignette) => vignette.id === 'the-find');
    expect(find?.conditions).toEqual({});
  });

  it('gives every Commission a Sphere can post at least three Vignettes for its first Beat', () => {
    for (const sphere of content.spheres) {
      for (const entry of sphere.commissionTitles) {
        const eligible = content.vignettes.filter((vignette) => {
          const { conditions } = vignette;
          if (conditions.minBeat !== undefined && conditions.minBeat > 1) return false;
          if (conditions.spheres !== undefined && !conditions.spheres.includes(sphere.id)) return false;
          if (conditions.requiresTrait !== undefined) return false;
          if (conditions.tags !== undefined && !conditions.tags.some((tag) => entry.tags.includes(tag))) {
            return false;
          }
          return true;
        });
        expect(
          eligible.length,
          `${sphere.id} / "${entry.title}" [${entry.tags.join(', ')}] has only ${eligible.length}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('draws every Commission tag from the set spheres.toml declares', () => {
    const declared = new Set(content.spheres.flatMap((sphere) => sphere.commissionTitles.flatMap((entry) => entry.tags)));
    for (const vignette of content.vignettes) {
      for (const tag of vignette.conditions.tags ?? []) expect(declared).toContain(tag);
    }
  });

  it('draws every Vignette and Trait tag from the same declared set', () => {
    const declared = new Set(
      content.spheres.flatMap((sphere) => sphere.commissionTitles.flatMap((entry) => entry.tags)),
    );
    for (const vignette of content.vignettes) {
      for (const tag of vignette.tags) {
        expect(declared, `vignette "${vignette.id}" carries "${tag}"`).toContain(tag);
      }
    }
    for (const trait of content.traits) {
      for (const modifier of trait.modifiers) {
        for (const tag of modifier.tags ?? []) {
          expect(declared, `Trait "${trait.name}" matches on "${tag}"`).toContain(tag);
        }
      }
    }
  });

  it('carries, on some Vignette, every tag a Trait modifier waits for', () => {
    // A Trait modifier is matched against the Vignette's tags, never the Commission's, so
    // a tag no Vignette carries is a modifier half that can never fire.
    //
    // Known gap, for the balance pass rather than for this test to hide: no Vignette
    // carries "hunt", so the "hunt" half of Poacher's Craft modifier is dead. Its "wilds"
    // half still fires, so the Trait is not wasted. Remove the entry when a Vignette
    // takes the tag.
    const knownGaps = new Set(['hunt']);
    const onVignettes = new Set(content.vignettes.flatMap((vignette) => vignette.tags));
    const waitedFor = new Set(
      content.traits.flatMap((trait) => trait.modifiers.flatMap((modifier) => modifier.tags ?? [])),
    );
    const dead = [...waitedFor].filter((tag) => !onVignettes.has(tag)).sort();
    expect(dead).toEqual([...knownGaps].sort());
  });

  it('never promises a Trait in prose that the Hero it names might not hold', () => {
    // `{trait}` renders conditions.requiresTrait if there is one, otherwise the Trait the
    // `with_trait:` slot asked for — and that slot falls back to any member of the Party
    // when nobody holds it. Only a matching requiresTrait makes the promise true.
    for (const vignette of content.vignettes) {
      const usesToken = Object.values(vignette.outcomes).some((outcome) =>
        outcome.narrative.includes('{trait}'),
      );
      if (!usesToken) continue;
      const slot = vignette.slots.hero;
      if (!slot.startsWith('with_trait:')) continue;
      expect(vignette.conditions.requiresTrait, `vignette "${vignette.id}"`).toBe(
        slot.slice('with_trait:'.length),
      );
    }
  });

  it('can always fill a Beat without relaxing the tags condition', () => {
    // Solution architecture section 5 throws a ContentError when not even the relaxed
    // pass finds a candidate, and says the starter set must make that unreachable. It is
    // unreachable a step earlier than that: a Vignette with no conditions at all is a
    // candidate for every Beat of every Commission, so the relaxed pass never runs.
    const unconditional = content.vignettes.filter(
      (vignette) => Object.keys(vignette.conditions).length === 0,
    );
    expect(unconditional.map((vignette) => vignette.id)).toEqual(['the-find']);

    const beatsMax = defaultConfig.beatsMax;
    for (const sphere of content.spheres) {
      for (const entry of sphere.commissionTitles) {
        for (let beat = 1; beat <= beatsMax; beat += 1) {
          const candidates = content.vignettes.filter(({ conditions }) => {
            if (conditions.minBeat !== undefined && beat < conditions.minBeat) return false;
            if (conditions.maxBeat !== undefined && beat > conditions.maxBeat) return false;
            if (conditions.spheres !== undefined && !conditions.spheres.includes(sphere.id)) {
              return false;
            }
            // a Party holding no Traits at all is the worst case
            if (conditions.requiresTrait !== undefined) return false;
            if (
              conditions.tags !== undefined &&
              !conditions.tags.some((tag) => entry.tags.includes(tag))
            ) {
              return false;
            }
            return true;
          });
          expect(
            candidates.length,
            `${sphere.id} / "${entry.title}" on Beat ${beat}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('the Vignette files on disk', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const directory = join(here, '..', 'vignettes');

  /** Every key `validateContent` reads off a Vignette table. Anything else is dropped. */
  const READ_KEYS = new Set([
    'id',
    'name',
    'stat',
    'difficulty',
    'weight',
    'tags',
    'conditions',
    'slots',
    'outcomes',
  ]);

  it('carries no top-level key the validator would silently drop', () => {
    const files = readdirSync(directory).filter((name) => name.endsWith('.toml'));
    expect(files.length).toBe(content.vignettes.length);
    for (const file of files) {
      const parsed = parseToml(readFileSync(join(directory, file), 'utf8')) as Record<string, unknown>;
      for (const key of Object.keys(parsed)) {
        expect(READ_KEYS.has(key), `${file} carries "${key}"`).toBe(true);
      }
    }
  });
});

describe('the parser', () => {
  it('refuses a condition that is not one, naming the file', () => {
    expect(() =>
      parseContent({
        'traits.toml': 'traits = []',
        'backgrounds.toml': 'backgrounds = []',
        'spheres.toml': 'spheres = []',
        'names.toml': 'heroFirst = []',
        'vignettes/bad.toml': '[conditions]\nmin_beats = 2\n',
      }),
    ).toThrow(/vignettes\/bad\.toml: \[conditions\]\.min_beats/);
  });

  it('refuses TOML it cannot parse, naming the file', () => {
    expect(() =>
      parseContent({
        'traits.toml': 'this is not = = toml',
        'backgrounds.toml': '',
        'spheres.toml': '',
        'names.toml': '',
        'vignettes/one.toml': '',
      }),
    ).toThrow(/traits\.toml: not valid TOML/);
  });

  it('refuses a content set with no Vignettes at all', () => {
    expect(() =>
      parseContent({
        'traits.toml': '',
        'backgrounds.toml': '',
        'spheres.toml': '',
        'names.toml': '',
      }),
    ).toThrow(ContentError);
  });

  it('refuses a missing file, naming it', () => {
    expect(() => parseContent({ 'vignettes/one.toml': '' })).toThrow(/names\.toml: the file is missing/);
  });
});

describe('a Career played over the real content', () => {
  it(
    'runs its twenty years and only ever fires a Vignette that exists',
    () => {
      const known = new Set(content.vignettes.map((vignette) => vignette.id));
      const fired = new Set<string>();
      let beats = 0;

      const opened = newCareer('the-real-thing', content);
      const career = autoPlay(opened.career, (events) => {
        for (const event of events) {
          if (event.type !== 'BeatResolved') continue;
          beats += 1;
          fired.add(event.vignetteId);
          expect(known.has(event.vignetteId)).toBe(true);
        }
      });

      expect(career.ended?.reason).toBe('retirement');
      expect(career.day).toBe(career.config.careerYears * career.config.daysPerYear + 1);
      expect(beats).toBeGreaterThan(100);
      expect(fired.size).toBeGreaterThanOrEqual(8);
      expect(career.ended?.reckoning.commissionsCompleted).toBeGreaterThan(0);
    },
    60_000,
  );
});
