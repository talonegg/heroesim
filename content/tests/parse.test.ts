import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseToml } from 'smol-toml';
import {
  advanceUntilAttention,
  availableHeroes,
  defaultConfig,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  newCareer,
  commitParty,
  proposeParty,
  type Career,
  type Content,
  type GameEvent,
  type Hero,
} from '@heroesim/engine';
import { ContentError } from '@heroesim/engine';
import { parseContent } from '../src/index.js';
import { loadContentFromDisk } from '../src/node.js';

const content: Content = loadContentFromDisk();

/**
 * The same policy the engine's contract suite plays with, over the real content. It asks
 * who would refuse and sends somebody else rather than insisting (E2); if nobody on the
 * Roster will take a Commission it is left alone.
 */
function autoPlay(start: Career, onEvents: (events: GameEvent[]) => void): Career {
  const strength = (hero: Hero): number =>
    hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;
  let career = start;
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the auto policy never reached the end of the Career');
    // It improves the Hall when it can comfortably afford one, as the engine's own policy
    // does and as a player would: an injured Hero cannot be sent, and a Guild that never
    // buys the infirmary spends a growing share of twenty years with half its Roster at
    // home (E3). `availableHeroes` is what keeps it from committing anybody who is injured.
    for (const improvement of HALL_IMPROVEMENTS) {
      if (career.guild.hall.includes(improvement)) continue;
      if (career.guild.coin < hallCost(improvement, career.config) + career.config.startingCoin) {
        continue;
      }
      const bought = improveHall(career, improvement);
      career = bought.career;
      onEvents(bought.events);
    }
    const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
    const byFee = [...career.board].sort((one, other) => other.fee - one.fee);
    const used = new Set<string>();
    for (const commission of byFee) {
      const left = free.filter((hero) => !used.has(hero.id));
      if (left.length === 0) break;
      const refusing = new Set(
        proposeParty(
          career,
          commission.id,
          left.map((hero) => hero.id),
          content,
        ).refusals.map((refusal) => refusal.heroId),
      );
      const party = left
        .filter((hero) => !refusing.has(hero.id))
        .slice(0, 2)
        .map((hero) => hero.id);
      if (party.length === 0) continue;
      const step = commitParty(career, commission.id, party, content);
      career = step.career;
      onEvents(step.events);
      for (const id of party) used.add(id);
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
    expect(content.vignettes).toHaveLength(11);
    expect(content.traits).toHaveLength(30);
    expect(content.backgrounds).toHaveLength(13);
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
      'the-other-guild-at-the-inn',
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

  it('ships at least three refusing Traits, each with a summary that reads as a reason (E2)', () => {
    const refusing = content.traits.filter((trait) => trait.refusal !== undefined);
    expect(refusing.map((trait) => trait.name).sort()).toEqual([
      'Godfearing',
      'Never again the deep',
      'Worn',
    ]);
    for (const trait of refusing) {
      expect(trait.summary.length, trait.name).toBeGreaterThan(20);
      expect(trait.summary.endsWith('.'), trait.name).toBe(true);
    }

    // Every tag a refusal waits for must be a tag a Commission can actually carry, or the
    // Trait refuses nothing and the content is quietly dead.
    const declared = new Set(
      content.spheres.flatMap((sphere) => sphere.commissionTitles.flatMap((entry) => entry.tags)),
    );
    for (const trait of refusing) {
      for (const tag of trait.refusal?.tags ?? []) {
        expect(declared, `Trait "${trait.name}" refuses on "${tag}"`).toContain(tag);
      }
    }

    // Two of the three reach a starting Hero through a Background, so refusal happens in
    // ordinary play without the Guildmaster having first earned one.
    const fromBackgrounds = new Set(content.backgrounds.flatMap((background) => background.traits));
    expect(refusing.filter((trait) => fromBackgrounds.has(trait.name)).map((trait) => trait.name)).toEqual([
      'Godfearing',
      'Never again the deep',
    ]);
  });

  it('ships Injuries and Scars for E3 to draw from, each with a summary (E3)', () => {
    const injuries = content.traits.filter((trait) => trait.kind === 'injury');
    const scars = content.traits.filter((trait) => trait.kind === 'scar');

    // Four Injuries and six Scars: E3 §3 adopted four of each, but six Scars shipped (see
    // the DoD evidence note on E3-injuries-and-scars.md). The engine draws evenly across
    // the pool and never repeats a Trait the Hero already holds, so a shallow pool is a
    // Hero who stops being markable; these are deep enough for a twenty-year Career.
    expect(injuries.map((trait) => trait.name).sort()).toEqual([
      'Bruised',
      'Cracked rib',
      'Cut hand',
      'Fevered',
    ]);
    expect(scars.map((trait) => trait.name).sort()).toEqual([
      'Burned',
      'Haunted',
      'Limps',
      'Never again the deep',
      'One-eyed',
      'Worn',
    ]);
    expect(injuries.length).toBeGreaterThanOrEqual(2);
    expect(scars.length).toBeGreaterThanOrEqual(4);

    for (const trait of [...injuries, ...scars]) {
      // A summary the front ends print, written as a sentence about a person.
      expect(trait.summary.length, trait.name).toBeGreaterThan(20);
      expect(trait.summary.endsWith('.'), trait.name).toBe(true);
      // And every one of them actually does something to a Check, or it is a label
      // rather than a Trait.
      expect(trait.modifiers.length, trait.name).toBeGreaterThan(0);
      for (const modifier of trait.modifiers) {
        expect(Math.abs(modifier.delta), trait.name).toBeLessThanOrEqual(2);
      }
    }

    // No Background hands anybody an Injury or a Scar at the start of a Career: these are
    // things the work does to a person, not things they arrive with.
    const fromBackgrounds = new Set(content.backgrounds.flatMap((background) => background.traits));
    for (const trait of injuries) {
      expect(fromBackgrounds.has(trait.name), `${trait.name} is dealt at world generation`).toBe(false);
    }
  });

  it('gives every Injury a Vignette or the engine can reach it (E3)', () => {
    // Harm is the engine's fallback, so every Injury is reachable through it; the two an
    // authored outcome also names are reachable both ways, which is the point of "every
    // Vignette outcome can still be authored without knowing harm exists".
    const authored = new Set(
      content.vignettes.flatMap((vignette) =>
        Object.values(vignette.outcomes).flatMap((outcome) =>
          outcome.consequences.filter((consequence) => consequence.kind === 'trait').map((consequence) =>
            consequence.kind === 'trait' ? consequence.trait : '',
          ),
        ),
      ),
    );
    expect([...authored].sort()).toEqual(['Bruised', 'Fevered']);
    for (const name of authored) {
      const trait = content.traits.find((entry) => entry.name === name);
      expect(trait?.kind, name).toBe('injury');
    }
  });

  it('moves Regard for the Guildmaster on at least two non-success outcomes (E2)', () => {
    const moving = content.vignettes.flatMap((vignette) =>
      (['failure', 'critical'] as const)
        .filter((result) =>
          vignette.outcomes[result].consequences.some(
            (consequence) => consequence.kind === 'heroRegardForGuildmaster',
          ),
        )
        .map((result) => `${vignette.id}:${result}`),
    );
    expect(moving.length).toBeGreaterThanOrEqual(2);
    expect(moving).toEqual([
      'collapsed-passage:failure',
      'fever-in-the-wet:failure',
      'quarrel-on-the-road:failure',
      'quarrel-on-the-road:critical',
      'terms-on-the-road:critical',
    ]);

    // Every one of them carries a reason, because that reason is the last thing the
    // player reads about a Hero before they walk out.
    for (const vignette of content.vignettes) {
      for (const outcome of Object.values(vignette.outcomes)) {
        for (const consequence of outcome.consequences) {
          if (consequence.kind !== 'heroRegardForGuildmaster') continue;
          expect(consequence.reason.length, vignette.id).toBeGreaterThan(10);
          expect(Math.abs(consequence.delta), vignette.id).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('sours or sweetens a Rival on an authored outcome, without naming one (E5)', () => {
    // The whole reason the `rivalRegard` Consequence exists: a Vignette can move what
    // another Guild thinks of yours without an engine change, and without knowing an id
    // that only exists inside a Career (E5 §4).
    const moving = content.vignettes.flatMap((vignette) =>
      (['failure', 'success', 'critical'] as const)
        .filter((result) =>
          vignette.outcomes[result].consequences.some(
            (consequence) => consequence.kind === 'rivalRegard',
          ),
        )
        .map((result) => `${vignette.id}:${result}`),
    );
    expect(moving).toEqual([
      'the-other-guild-at-the-inn:failure',
      'the-other-guild-at-the-inn:critical',
    ]);
    for (const vignette of content.vignettes) {
      for (const outcome of Object.values(vignette.outcomes)) {
        for (const consequence of outcome.consequences) {
          if (consequence.kind !== 'rivalRegard') continue;
          // No id: content cannot name a Rival, and the engine picks one for it.
          expect(consequence.rivalId, vignette.id).toBeUndefined();
          expect(consequence.reason.length, vignette.id).toBeGreaterThan(10);
          expect(Math.abs(consequence.delta), vignette.id).toBeLessThanOrEqual(1);
        }
      }
    }
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

describe('the Decisions on disk (E6)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const directory = join(here, '..', 'decisions');

  /** Every key `validateContent` reads off a Decision table. Anything else is dropped. */
  const READ_KEYS = new Set([
    'id',
    'name',
    'weight',
    'tags',
    'conditions',
    'slots',
    'prompt',
    'options',
  ]);

  it('ships three Decisions, each offering all three kinds with exactly one default', () => {
    expect(content.decisions.map((decision) => decision.id)).toEqual([
      'somebody-is-flagging',
      'the-guide-wants-more',
      'the-workings-are-wrong',
    ]);
    for (const decision of content.decisions) {
      const kinds = decision.options.map((option) => option.kind).sort();
      expect(kinds, decision.id).toEqual(['pressOn', 'sendCoin', 'turnBack']);
      const defaults = decision.options.filter((option) => option.default === true);
      expect(defaults, decision.id).toHaveLength(1);
      // The default is what happens when nobody answers, so it costs nothing and waits on
      // nothing: press-on in all three, as E6 §3's own example has it.
      expect(defaults[0]?.kind, decision.id).toBe('pressOn');
      expect(defaults[0]?.cost, decision.id).toBeUndefined();
      expect(defaults[0]?.requires, decision.id).toBeUndefined();
      // The one that costs coin says how much, and asks for it.
      const paid = decision.options.find((option) => option.kind === 'sendCoin');
      expect(paid?.cost, decision.id).toBeGreaterThan(0);
      expect(paid?.requires?.minCoin, decision.id).toBe(paid?.cost);
    }
  });

  it('is read in a fixed order, so a seed means the same thing every run', () => {
    expect(content.decisions.map((decision) => decision.id)).toEqual(
      loadContentFromDisk().decisions.map((decision) => decision.id),
    );
  });

  it('draws every tag it waits for from the set spheres.toml declares', () => {
    const declared = new Set(
      content.spheres.flatMap((sphere) => sphere.commissionTitles.flatMap((entry) => entry.tags)),
    );
    for (const decision of content.decisions) {
      for (const tag of [...decision.tags, ...(decision.conditions.tags ?? [])]) {
        expect(declared, `Decision "${decision.id}" carries "${tag}"`).toContain(tag);
      }
    }
  });

  it('never stops a Commission before its second Beat', () => {
    // "After the first Beat" is a rule of the engine's, and the authored set agrees with
    // it rather than relying on it (E6-S2).
    for (const decision of content.decisions) {
      expect(decision.conditions.minBeat ?? 0, decision.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('can stop work in every Sphere, and none of the three fires indiscriminately', () => {
    // Every Decision names the work it belongs to. Until DL-24 §A3 one of the three
    // carried no tags condition at all, so it was eligible on every Commission in the
    // game and was by a distance the commonest of them — a rate nobody chose, and prose
    // that had to be generic enough to fit everything. A Commission with nothing eligible
    // simply never stops, which is E6-S2's own rule and not a hole.
    for (const decision of content.decisions) {
      expect(decision.conditions.tags?.length ?? 0, decision.id).toBeGreaterThan(0);
    }
    for (const sphere of content.spheres) {
      const reachable = sphere.commissionTitles.filter((entry) =>
        content.decisions.some((decision) =>
          (decision.conditions.tags ?? []).some((tag) => entry.tags.includes(tag)),
        ),
      );
      expect(reachable.length, sphere.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('never tells the player of an Injury the state does not carry', () => {
    // An Injury is a Trait (ADR-0005) and CONTEXT.md puts "hurt", "wound" and "damage" on
    // the avoid-list for that concept. A Decision may only reach for the vocabulary if one
    // of its options actually gives a Trait: otherwise the player reads that somebody has
    // been walking on a bad leg for two days while the Roster shows nothing at all and the
    // Hero is committable the moment they are home (F12, DL-24 §A3).
    const injuryWords = /\b(hurt|hurts|injur\w*|wound\w*|damage\w*|lame|limping)\b/i;
    for (const decision of content.decisions) {
      const givesATrait = decision.options.some((option) =>
        option.consequences.some((consequence) => consequence.kind === 'trait'),
      );
      if (givesATrait) continue;
      const prose = [
        decision.id,
        decision.name,
        decision.prompt,
        ...decision.options.map((option) => option.label),
      ].join(' ');
      expect(prose, decision.id).not.toMatch(injuryWords);
    }
  });

  it('makes the coin an option asks for buy something the rules actually do', () => {
    // A label that promises a physician and a bed, paid for with sixty coin, and an
    // `effect` that only nudges Backing, is a label the rules do not keep (F12). Every
    // `sendCoin` carries an effect, and what it says it buys is what the effect is.
    for (const decision of content.decisions) {
      const paid = decision.options.find((option) => option.kind === 'sendCoin');
      expect(Object.keys(paid?.effect ?? {}).length, decision.id).toBeGreaterThan(0);
    }
  });

  it('keeps the ford-and-guide Decision to work that has a road and somebody on it', () => {
    const guide = content.decisions.find((decision) => decision.id === 'the-guide-wants-more');
    expect(guide?.conditions.tags).toEqual(['escort']);
    // Named rather than counted: these are the four Commissions its prose used to reach,
    // and a ford and a hired guide belong to none of them (DL-24 §A3).
    const wrong = [
      'The flooded lower gallery',
      'The old workings above Callow Drift',
      'Whatever walks the old burial ground',
      'Terms with the hill families at Cairn',
    ];
    for (const sphere of content.spheres) {
      for (const entry of sphere.commissionTitles) {
        const fits = (guide?.conditions.tags ?? []).some((tag) => entry.tags.includes(tag));
        if (wrong.includes(entry.title)) expect(fits, entry.title).toBe(false);
        if (fits) expect(entry.tags, entry.title).toContain('escort');
      }
    }
  });

  it('keeps the shaft-and-timber Decision to work that goes below ground', () => {
    const workings = content.decisions.find(
      (decision) => decision.id === 'the-workings-are-wrong',
    );
    expect(workings?.conditions.tags).toEqual(['delve']);
    // Named rather than counted, as above: "water" alone used to let timbers and the head
    // of a shaft turn up on a barge and a drove, and "dark" alone would let them into a
    // crypt and a burial ground. None of these has workings to go wrong.
    const wrong = [
      'The tithe barge down to Lowford',
      "The ferryman's strongbox in the shallows",
      'The drove at Wend Water before the rains',
      'The vigil in the crypt at Ellersgate',
      'Whatever walks the old burial ground',
    ];
    let reached = 0;
    for (const sphere of content.spheres) {
      for (const entry of sphere.commissionTitles) {
        const fits = (workings?.conditions.tags ?? []).some((tag) => entry.tags.includes(tag));
        if (wrong.includes(entry.title)) expect(fits, entry.title).toBe(false);
        if (fits) {
          reached += 1;
          expect(entry.tags, entry.title).toContain('delve');
        }
      }
    }
    // It must still be able to fire somewhere, or narrowing it has only switched it off.
    expect(reached).toBeGreaterThanOrEqual(3);
  });

  it('keeps the tone plain: coin never abbreviated, no emoji, no exclamation marks', () => {
    for (const decision of content.decisions) {
      const prose = [decision.prompt, ...decision.options.map((option) => option.label)];
      for (const text of prose) {
        expect(text.length, decision.id).toBeGreaterThan(10);
        expect(text, decision.id).not.toContain('!');
        expect(text, decision.id).not.toMatch(/\p{Extended_Pictographic}/u);
        // "40c" and "40 c" are never how coin is written.
        expect(text, decision.id).not.toMatch(/\b\d+\s?c\b/);
      }
      // A label is a thing the Guildmaster says, so it ends as a sentence does.
      for (const option of decision.options) {
        expect(option.label.endsWith('.'), `${decision.id}/${option.id}`).toBe(true);
      }
    }
  });

  it('carries no top-level key the validator would silently drop', () => {
    const files = readdirSync(directory).filter((name) => name.endsWith('.toml'));
    expect(files.length).toBe(content.decisions.length);
    for (const file of files) {
      const parsed = parseToml(readFileSync(join(directory, file), 'utf8')) as Record<string, unknown>;
      for (const key of Object.keys(parsed)) {
        expect(READ_KEYS.has(key), `${file} carries "${key}"`).toBe(true);
      }
      // `prompt` must sit above `[conditions]`: a bare key written after a table header
      // belongs to that table, and the Decision would load without its prose.
      expect(typeof parsed['prompt'], `${file} keeps its prompt at the top level`).toBe('string');
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
