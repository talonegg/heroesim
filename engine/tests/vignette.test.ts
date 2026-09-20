import { describe, expect, it } from 'vitest';
import { validateContent, type Content, type Vignette } from '../src/content.js';
import { ContentError } from '../src/errors.js';
import type { Hero } from '../src/types.js';
import { fillHeroSlot, selectVignette, type VignetteContext } from '../src/vignette.js';
import { fixtureContent, scriptedRng, seededRng, unreachableContent } from './fixtures.js';
import { seedRng } from '../src/rng.js';

function hero(id: string, stats: Partial<Hero['stats']> = {}, traits: string[] = []): Hero {
  return {
    id,
    name: id.toUpperCase(),
    pronouns: 'they',
    stats: { Might: 2, Craft: 2, Nerve: 2, Guile: 2, ...stats },
    age: 30,
    background: 'Ferry family',
    traits: traits.map((name) => ({ name, since: 1 })),
    calibre: 1,
    regardForGuildmaster: { value: 0, reason: 'came with the Guild', nature: 'neutral' },
    regardFor: {},
    joinedOn: 1,
    lastCommittedOn: 1,
    regardDecayedOn: 1,
  };
}

function context(overrides: Partial<VignetteContext> = {}): VignetteContext {
  return {
    beatIndex: 1,
    commissionTags: ['water', 'escort'],
    sphereId: 'river',
    heroes: [hero('h1'), hero('h2')],
    used: [],
    ...overrides,
  };
}

function byId(content: Content, id: string): Vignette {
  const vignette = content.vignettes.find((candidate) => candidate.id === id);
  if (vignette === undefined) throw new Error(`the fixture has no Vignette "${id}"`);
  return vignette;
}

/** Every Vignette the rule would admit, found by exhausting the weighted pick. */
function candidates(content: Content, where: VignetteContext): Set<string> {
  const found = new Set<string>();
  for (let step = 0; step < 400; step += 1) {
    found.add(selectVignette(content, where, scriptedRng({ floats: [step / 400] })).id);
  }
  return found;
}

describe('choosing a Vignette', () => {
  it('admits one with no conditions at all', () => {
    expect(candidates(fixtureContent, context())).toContain('the-find');
  });

  it('admits one whose tags meet the Commission’s, and refuses one whose do not', () => {
    const admitted = candidates(fixtureContent, context({ commissionTags: ['water', 'escort'] }));
    expect(admitted).toContain('river-crossing');
    expect(admitted).toContain('night-watch');

    const quiet = candidates(fixtureContent, context({ commissionTags: ['guard'] }));
    expect(quiet).not.toContain('river-crossing');
    expect(quiet).toContain('night-watch');
  });

  it('holds a Vignette back until its Beat', () => {
    expect(candidates(fixtureContent, context({ beatIndex: 1 }))).not.toContain('word-spreads');
    expect(candidates(fixtureContent, context({ beatIndex: 2 }))).toContain('word-spreads');
  });

  it('refuses a Vignette whose Trait nobody in the Party holds', () => {
    const without = candidates(fixtureContent, context({ beatIndex: 2 }));
    expect(without).not.toContain('the-quarrel');

    const withCraven = candidates(
      fixtureContent,
      context({ beatIndex: 2, heroes: [hero('h1'), hero('h2', {}, ['Craven'])] }),
    );
    expect(withCraven).toContain('the-quarrel');
  });

  it('refuses a Vignette from another Sphere', () => {
    const gated: Content = {
      ...fixtureContent,
      vignettes: [
        { ...byId(fixtureContent, 'the-find'), conditions: { spheres: ['hill'] } },
        byId(fixtureContent, 'river-crossing'),
      ],
    };
    expect(candidates(gated, context({ sphereId: 'river' }))).not.toContain('the-find');
    expect(candidates(gated, context({ sphereId: 'hill', commissionTags: ['wilds'] }))).toContain(
      'the-find',
    );
  });

  it('prefers one that has not been spent on this Commission yet', () => {
    const where = context({ used: ['the-find', 'river-crossing'] });
    for (let step = 0; step < 50; step += 1) {
      const picked = selectVignette(fixtureContent, where, scriptedRng({ floats: [step / 50] }));
      expect(picked.id).toBe('night-watch');
    }
  });

  it('falls back to spent ones once every candidate has been used', () => {
    const where = context({ used: ['the-find', 'river-crossing', 'night-watch'] });
    const reused = candidates(fixtureContent, where);
    expect(reused.size).toBe(3);
    expect([...reused].sort()).toEqual(['night-watch', 'river-crossing', 'the-find']);
  });

  it('falls back to the tags condition alone when nothing else can fire', () => {
    const tagged: Content = {
      ...fixtureContent,
      vignettes: [byId(fixtureContent, 'river-crossing')],
    };
    const nothingMatches = context({ commissionTags: ['talk'] });
    expect(selectVignette(tagged, nothingMatches, scriptedRng({})).id).toBe('river-crossing');
  });

  it('will not relax any condition other than tags', () => {
    expect(() => selectVignette(unreachableContent, context(), scriptedRng({}))).toThrow(ContentError);
    expect(() => selectVignette(unreachableContent, context(), scriptedRng({}))).toThrow(
      /no Vignette can fire on Beat 1/,
    );
  });

  it('picks by weight', () => {
    const weighted: Content = {
      ...fixtureContent,
      vignettes: [
        { ...byId(fixtureContent, 'the-find'), weight: 3 },
        { ...byId(fixtureContent, 'river-crossing'), weight: 1 },
      ],
    };
    const where = context();
    expect(selectVignette(weighted, where, scriptedRng({ floats: [0.1] })).id).toBe('the-find');
    expect(selectVignette(weighted, where, scriptedRng({ floats: [0.9] })).id).toBe('river-crossing');
  });
});

describe('filling the Hero slot', () => {
  const party = [
    hero('h1', { Might: 4, Nerve: 1, Guile: 2 }),
    hero('h2', { Might: 2, Nerve: 5, Guile: 3 }, ['Craven']),
    hero('h3', { Might: 3, Nerve: 3, Guile: 1 }),
  ];

  it('picks the strongest for highest:, and the weakest for lowest:', () => {
    expect(fillHeroSlot(byId(fixtureContent, 'river-crossing'), party, scriptedRng({})).hero.id).toBe('h1');
    expect(fillHeroSlot(byId(fixtureContent, 'night-watch'), party, scriptedRng({})).hero.id).toBe('h1');
  });

  it('breaks a tie with the generator rather than by position', () => {
    const tied = [
      hero('h1', { Might: 4 }),
      hero('h2', { Might: 4 }),
      hero('h3', { Might: 4 }),
    ];
    const crossing = byId(fixtureContent, 'river-crossing');
    expect(fillHeroSlot(crossing, tied, scriptedRng({ ints: [0] })).hero.id).toBe('h1');
    expect(fillHeroSlot(crossing, tied, scriptedRng({ ints: [2] })).hero.id).toBe('h3');

    const drawn = new Set<string>();
    const rng = seededRng(seedRng('ties'));
    for (let step = 0; step < 60; step += 1) drawn.add(fillHeroSlot(crossing, tied, rng).hero.id);
    expect(drawn.size).toBe(3);
  });

  it('picks uniformly for any', () => {
    const find = byId(fixtureContent, 'the-find');
    expect(fillHeroSlot(find, party, scriptedRng({ ints: [1] })).hero.id).toBe('h2');
    expect(fillHeroSlot(find, party, scriptedRng({ ints: [2] })).hero.id).toBe('h3');
  });

  it('picks a holder for with_trait:, and reports the Trait the Beat turns on', () => {
    const quarrel = byId(fixtureContent, 'the-quarrel');
    const filled = fillHeroSlot(quarrel, party, scriptedRng({ ints: [0] }));
    expect(filled.hero.id).toBe('h2');
    expect(filled.trait).toBe('Craven');
  });

  it('falls back to anyone when nobody holds the Trait the slot asks for', () => {
    const quarrel = byId(fixtureContent, 'the-quarrel');
    const nobody = [hero('h1'), hero('h2')];
    expect(fillHeroSlot(quarrel, nobody, scriptedRng({ ints: [1] })).hero.id).toBe('h2');
  });

  it('names no Trait when the fallback fired, so prose cannot claim one (F11)', () => {
    // `with_trait:` falls back to any member of the Party, and `requiresTrait` only
    // promises that somebody in the Party holds it. Reporting the asked-for Trait
    // regardless would hand narration a Trait this Hero has not got.
    const quarrel = byId(fixtureContent, 'the-quarrel');
    expect(fillHeroSlot(quarrel, [hero('h1'), hero('h2')], scriptedRng({ ints: [1] })).trait)
      .toBeUndefined();

    const party = [hero('h1'), hero('h2', {}, ['Craven'])];
    const filled = fillHeroSlot(quarrel, party, scriptedRng({}));
    expect(filled.hero.id).toBe('h2');
    expect(filled.trait).toBe('Craven');
  });

  it('reports no Trait when the Vignette turns on nobody in particular', () => {
    expect(fillHeroSlot(byId(fixtureContent, 'the-find'), party, scriptedRng({})).trait).toBeUndefined();
  });

  it('refuses to fill a slot from an empty Party', () => {
    expect(() => fillHeroSlot(byId(fixtureContent, 'the-find'), [], scriptedRng({}))).toThrow(
      /no Heroes/,
    );
  });
});

describe('admitting a Vignette that names a Trait in its prose', () => {
  const holder = byId(fixtureContent, 'the-quarrel');

  function admit(conditions: unknown, slot: string): Content {
    return validateContent({
      traits: fixtureContent.traits,
      backgrounds: fixtureContent.backgrounds,
      spheres: fixtureContent.spheres,
      names: fixtureContent.names,
      vignettes: [{ ...holder, conditions, slots: { hero: slot } }],
    });
  }

  it('admits it when the slot asks for the very Trait the condition requires', () => {
    const content = admit({ minBeat: 2, requiresTrait: 'Craven' }, 'with_trait:Craven');
    expect(content.vignettes[0]?.slots.hero).toBe('with_trait:Craven');
  });

  it('refuses a with_trait slot with no condition behind it', () => {
    expect(() => admit({ minBeat: 2 }, 'with_trait:Craven')).toThrow(ContentError);
    expect(() => admit({ minBeat: 2 }, 'with_trait:Craven')).toThrow(/\{trait\}/);
  });

  it('refuses a condition with no with_trait slot in front of it', () => {
    expect(() => admit({ minBeat: 2, requiresTrait: 'Craven' }, 'any')).toThrow(/\{trait\}/);
    expect(() => admit({ minBeat: 2, requiresTrait: 'Craven' }, 'highest:Guile')).toThrow(/\{trait\}/);
  });

  it('refuses a slot and a condition that name different Traits', () => {
    expect(() => admit({ minBeat: 2, requiresTrait: 'Craven' }, 'with_trait:Steady')).toThrow(
      /\{trait\}/,
    );
  });
});
