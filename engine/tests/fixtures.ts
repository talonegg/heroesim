/**
 * A small hand-built world for the engine's own tests, so they never depend on the
 * `content` package or on what happens to be authored on disk. It is shaped like the
 * real content — a Vignette with no conditions, ones gated on tags, one gated on a Beat
 * index and a Trait — so that selection behaves here as it does in play.
 *
 * It follows the authored set on scoring too: no outcome carries a `score` consequence,
 * because the per-Beat increment is the rule and content adds score only for the
 * exceptional (DL-13). `loop.test.ts` proves the consequence kind still works.
 */

import { advanceUntilAttention, availableHeroes, commitParty, proposeParty } from '../src/career.js';
import { cloneCareer } from '../src/clone.js';
import { validateContent, type Content } from '../src/content.js';
import type { GameEvent } from '../src/events.js';
import { hallCost, improveHall } from '../src/hall.js';
import { rngOn, type Rng, type RngState } from '../src/rng.js';
import { HALL_IMPROVEMENTS } from '../src/types.js';
import type { Career, Commission, Hero, RivalHero } from '../src/types.js';

/** The fixture content, admitted through the real validator. */
export const fixtureContent: Content = validateContent({
  traits: [
    {
      name: 'Steady',
      kind: 'disposition',
      summary: 'Nothing much moves them.',
      modifiers: [{ stat: 'Nerve', delta: 1 }],
    },
    {
      name: 'Craven',
      kind: 'disposition',
      summary: 'Fear arrives early and leaves late.',
      modifiers: [{ stat: 'Nerve', delta: -2 }],
    },
    {
      name: 'Sure-footed',
      kind: 'disposition',
      summary: 'Goes over wet stone the way other people go along a street.',
      modifiers: [{ stat: 'Might', tags: ['water'], delta: 2 }],
    },
    {
      name: 'Old campaigner',
      kind: 'background',
      summary: 'Twenty years of other people’s wars.',
      modifiers: [{ stat: 'Nerve', tags: ['fight'], delta: 1 }],
      backing: 1,
    },
    {
      name: 'Bruised',
      kind: 'injury',
      summary: 'Stiff down one side.',
      modifiers: [{ stat: 'Might', delta: -1 }],
    },
    // Three refusing Traits, one of each shape the rule allows (E2). No fixture
    // Background carries one, so under E2 a test that wanted a refusal had to give it
    // deliberately and every other fixture Career behaved exactly as it did before. Under
    // E3 that is no longer true of `Worn`: it is one of only two `kind: 'scar'` Traits
    // here, and E3's harm draws a Scar from every Trait of that kind, evenly, whenever a
    // critical failure marks someone — so roughly half of the Scars any fixture Career
    // hands out are `Worn`, and its unconditional refusal (`refusal: {}`) then stops that
    // Hero working for good without a test ever asking for it (DL-17 §4).
    {
      name: 'Worn',
      kind: 'scar',
      summary: 'Has given the work everything it asked for.',
      modifiers: [],
      refusal: {},
    },
    {
      name: 'Never the water',
      kind: 'scar',
      summary: 'Went under once and will not go near it again.',
      modifiers: [],
      refusal: { tags: ['water'] },
    },
    {
      name: 'Nothing desperate',
      kind: 'disposition',
      summary: 'Will take the work but not the kind nobody comes back from.',
      modifiers: [],
      refusal: { minDifficulty: 13 },
    },
  ],
  backgrounds: [
    { name: 'Levy years', summary: 'Taken by the levy at seventeen.', traits: ['Old campaigner', 'Steady'] },
    { name: 'Copy-house', summary: 'Ten years bent over other people’s ledgers.', traits: ['Craven'] },
    { name: 'Ferry family', summary: 'Grew up on the crossings.', traits: ['Sure-footed'] },
  ],
  spheres: [
    {
      id: 'river',
      name: 'the river towns',
      patronNames: [
        'The Wending Ferrymen',
        'Reeve Halloran of Lowford',
        'The Salt Factors of Marrow Quay',
        'Widow Sessil, who keeps the weir',
      ],
      commissionTitles: [
        { title: 'The ford at Lowford', difficulty: 10, tags: ['water', 'escort'] },
        { title: 'The night watch at the quay', difficulty: 12, tags: ['guard'] },
        { title: 'The tithe barge down to Lowford', difficulty: 8, tags: ['escort', 'water'] },
      ],
    },
    {
      id: 'hill',
      name: 'the drovers’ road',
      patronNames: [
        'The Drovers of Cairn Pass',
        'Bailiff Skene of Thurrow',
        'The Hill Families of Cairn',
        'Goodwife Merrin of Ashfall steading',
      ],
      commissionTitles: [
        { title: 'The autumn drove', difficulty: 9, tags: ['escort', 'wilds'] },
        { title: 'Whoever is lifting beasts', difficulty: 14, tags: ['fight', 'wilds'] },
        { title: 'The toll house at Thurrow', difficulty: 11, tags: ['guard'] },
      ],
    },
  ],
  names: {
    heroFirst: ['Brenna', 'Aldis', 'Corran', 'Maelis', 'Roskil', 'Ysolde', 'Hale', 'Thessa', 'Garrick'],
    heroEpithets: ['of Ashfall', 'of Lowford', 'the Quiet'],
    guildNames: ['The Lowford Guild', 'The Ashfall Guild'],
    rivalNames: [
      'The Iron Weir Guild',
      'The Kestrel Guild',
      'The Tallow Guild',
      'The Northgate Guild',
      'The Sixpenny Guild',
    ],
  },
  vignettes: [
    {
      id: 'the-find',
      name: 'The find',
      stat: 'Craft',
      difficulty: 11,
      weight: 3,
      tags: ['delve', 'recover'],
      conditions: {},
      slots: { hero: 'any' },
      outcomes: {
        failure: {
          narrative: '{hero} has it out of the wall before anyone suggests otherwise, and it goes to powder.',
          consequences: [],
        },
        success: {
          narrative: '{hero} notices the dressed stone, and what is behind it goes into {hero.their} pack for {patron}.',
          consequences: [],
        },
        critical: {
          narrative: '{hero} comes away with the box and the ledger it was buried with, which is the part that matters.',
          consequences: [
            { kind: 'coin', delta: 15 },
          ],
        },
      },
    },
    {
      id: 'river-crossing',
      name: 'The crossing',
      stat: 'Might',
      difficulty: 10,
      weight: 3,
      tags: ['water', 'wilds'],
      conditions: { tags: ['water', 'wilds', 'escort'] },
      slots: { hero: 'highest:Might' },
      outcomes: {
        failure: {
          narrative: 'The ford is higher than the map allows for and {hero} goes from under {hero.them}.',
          consequences: [
            { kind: 'coin', delta: -20 },
          ],
        },
        success: {
          narrative: '{hero} goes first with the line, and {hero.they} {hero.is} the last one out of the water.',
          consequences: [],
        },
        critical: {
          narrative: '{hero} reads the water and takes them to an old drove crossing nobody has marked.',
          consequences: [],
        },
      },
    },
    {
      id: 'night-watch',
      name: 'The night watch',
      stat: 'Nerve',
      difficulty: 11,
      weight: 2,
      tags: ['fight', 'dark'],
      conditions: { tags: ['guard', 'fight', 'escort'] },
      slots: { hero: 'lowest:Nerve' },
      outcomes: {
        failure: {
          narrative: 'Something crosses the firelight and {hero} does nothing at all until the shouting is finished.',
          consequences: [
            { kind: 'trait', trait: 'Bruised', days: 6 },
          ],
        },
        success: {
          narrative: '{hero} is on {hero.their} feet before the others, and it is finished quickly.',
          consequences: [],
        },
        critical: {
          narrative: '{hero} lets them come all the way in, then closes the trap, and {patron} hears of it.',
          consequences: [
            { kind: 'patronRegard', delta: 1, reason: 'the lost crates came back with the Party' },
          ],
        },
      },
    },
    {
      id: 'the-quarrel',
      name: 'The quarrel',
      stat: 'Guile',
      difficulty: 10,
      weight: 1,
      tags: ['talk'],
      conditions: { minBeat: 2, requiresTrait: 'Craven' },
      slots: { hero: 'with_trait:Craven' },
      outcomes: {
        failure: {
          narrative: 'It starts over nothing, and because {hero} is {trait} it does not stop there.',
          consequences: [
            { kind: 'heroRegardForGuildmaster', delta: -1, reason: 'nobody had thought about who would be sent out together' },
          ],
        },
        success: {
          narrative: 'Being {trait} is not the same as being wrong, and {hero} lets it go before anyone stands up.',
          consequences: [],
        },
        critical: {
          narrative: '{hero} sees it coming and takes the other one off to look at the horses.',
          consequences: [
            { kind: 'heroRegardForGuildmaster', delta: 1, reason: 'the quarrel was settled without anyone being made to look small' },
          ],
        },
      },
    },
    {
      id: 'word-spreads',
      name: 'Word spreads',
      stat: 'Guile',
      difficulty: 10,
      weight: 1,
      tags: ['talk', 'town'],
      conditions: { minBeat: 2 },
      slots: { hero: 'highest:Guile' },
      outcomes: {
        failure: {
          narrative: 'The telling of it gets away from them, and {sphere} hears the wrong account first.',
          consequences: [],
        },
        success: {
          narrative: '{hero} says little in the taproom, and what reaches {sphere} is roughly what happened.',
          consequences: [],
        },
        critical: {
          narrative: 'The telling of {commission} reaches two places nobody has worked, and one writes to {guildmaster}.',
          consequences: [],
        },
      },
    },
  ],
});

/**
 * The fixture content with the **shipped** name pools in place of the nine first names and
 * three epithets the rest of the fixture makes do with.
 *
 * Nine names cannot seat a Guildmaster, four Heroes, four Rival Rosters and a queue at the
 * door all at once, so a Career played on `fixtureContent` runs the pool dry and two people
 * sharing a name there would say something about the fixture and nothing about the rule.
 * Anything asking "does anybody ever share a name" is played on this instead, and asserts
 * the pool was never exhausted so the question stays an honest one.
 */
export const roomyNameContent: Content = validateContent({
  traits: fixtureContent.traits,
  backgrounds: fixtureContent.backgrounds,
  spheres: fixtureContent.spheres,
  names: {
    heroFirst: [
      'Brenna', 'Aldis', 'Corran', 'Maelis', 'Roskil', 'Ysolde', 'Hale', 'Thessa',
      'Garrick', 'Noll', 'Edric', 'Sennet', 'Wyn', 'Orla', 'Dunn', 'Kest',
      'Halla', 'Brann', 'Ivo', 'Marta', 'Osric', 'Tamsin', 'Rual', 'Gethin',
      'Nerys', 'Haldor', 'Sibb', 'Colm', 'Ailith', 'Fenn', 'Morwen', 'Drust',
      'Elswith', 'Radek', 'Joss', 'Petra', 'Vane', 'Gwenna', 'Torrin', 'Bede',
      'Alric', 'Senna', 'Kel', 'Maud', 'Orrin', 'Pell', 'Rhia', 'Sawel',
      'Tibb', 'Una', 'Varr', 'Wilda', 'Ysane', 'Aneth', 'Berrick', 'Cait',
      'Dagan', 'Eira', 'Flin', 'Gower', 'Hesk', 'Ilsa', 'Jarran', 'Kern',
      'Lowri', 'Merrick', 'Nan', 'Oswin', 'Perrin', 'Quenna',
    ],
    heroEpithets: [
      'of Ashfall', 'the Younger', 'Half-hand', 'of Lowford', 'the Quiet',
      'of Marrow Quay', 'the Elder', 'Longshanks', 'of the Fen', 'Coldwater',
      'the Dour', 'Two-coats', 'of Thurrow', 'the Lame', 'Ninefingers',
      'of Cairn', 'the Patient', 'Sootfoot', 'of Gaunt Adit', 'the Bitter',
      'Nightwalker', 'of Ellersgate', 'the Steady', 'Saltborn', 'of Callow Drift',
      'the Unlucky', 'Stonehand', 'of Wend Water', 'the Mild', 'Ratcatcher',
      'of the Low Temple', 'the Wary', 'Hookarm', 'of Byre', 'the Late', 'Greyeye',
    ],
    guildNames: fixtureContent.names.guildNames,
    rivalNames: fixtureContent.names.rivalNames,
  },
  vignettes: fixtureContent.vignettes,
});

/** Content with a single Vignette that can never fire, for the unreachable-selection case. */
export const unreachableContent: Content = validateContent({
  traits: fixtureContent.traits,
  backgrounds: fixtureContent.backgrounds,
  spheres: fixtureContent.spheres,
  names: fixtureContent.names,
  vignettes: [
    {
      id: 'far-off',
      name: 'Far off',
      stat: 'Craft',
      difficulty: 11,
      weight: 1,
      tags: [],
      conditions: { minBeat: 99 },
      slots: { hero: 'any' },
      outcomes: {
        failure: { narrative: '{hero} does nothing.', consequences: [] },
        success: { narrative: '{hero} does nothing.', consequences: [] },
        critical: { narrative: '{hero} does nothing.', consequences: [] },
      },
    },
  ],
});

/** What a scripted generator should return, in order. Exhausted scripts fall back to zero. */
export interface RngScript {
  /** Values `int(max)` returns, in order. */
  ints?: number[];
  /** Values `float()` returns, in order. */
  floats?: number[];
}

/**
 * A generator whose draws are written down in advance, so a test can put a Check on
 * either side of a boundary without reasoning about xoshiro.
 */
export function scriptedRng(script: RngScript): Rng {
  const ints = [...(script.ints ?? [])];
  const floats = [...(script.floats ?? [])];
  const rng: Rng = {
    int(max: number): number {
      const next = ints.shift() ?? 0;
      return Math.max(0, Math.min(max - 1, next));
    },
    between(low: number, high: number): number {
      if (high <= low) return low;
      return low + rng.int(high - low + 1);
    },
    float(): number {
      return floats.shift() ?? 0;
    },
    chance(probability: number): boolean {
      return rng.float() < probability;
    },
    pick<T>(items: readonly T[]): T {
      const item = items[rng.int(items.length)];
      if (item === undefined) throw new Error('scripted pick from an empty collection');
      return item;
    },
    shuffle<T>(items: readonly T[]): T[] {
      return [...items];
    },
  };
  return rng;
}

/** A real generator bound to a throwaway state, for tests that only need determinism. */
export function seededRng(state: RngState): Rng {
  return rngOn({ rng: [...state] as RngState });
}

// ── Putting a world into a state a seed alone will not reach (E2) ───────────
//
// Refusal, drift and Departure all turn on a Regard value, and world generation starts
// every Hero between −1 and +2. Rather than hunt for a seed that eventually souring
// happens to reach, these helpers set the state the rule is being tested against, the way
// `api.test.ts` expires a Commission by hand. Each returns a fresh Career and leaves the
// one it was given alone, so a test can build several from the same start.

/** A copy of a Career in which one Hero thinks exactly this much of the Guildmaster. */
export function thinking(career: Career, heroId: string, value: number, reason = 'the business at Thurrow'): Career {
  const copy = cloneCareer(career);
  const hero = copy.guild.roster.find((candidate) => candidate.id === heroId);
  if (hero === undefined) throw new Error(`no Hero "${heroId}" is on the Roster`);
  hero.regardForGuildmaster = { value, reason, nature: hero.regardForGuildmaster.nature };
  return copy;
}

/** A copy of a Career in which the whole Roster thinks exactly this much of the Guildmaster. */
export function allThinking(career: Career, value: number): Career {
  return career.guild.roster.reduce((held, hero) => thinking(held, hero.id, value), career);
}

/** A copy of a Career in which one Hero holds a Trait they did not have before. */
export function holding(career: Career, heroId: string, trait: string): Career {
  const copy = cloneCareer(career);
  const hero = copy.guild.roster.find((candidate) => candidate.id === heroId);
  if (hero === undefined) throw new Error(`no Hero "${heroId}" is on the Roster`);
  if (!hero.traits.some((held) => held.name === trait)) {
    hero.traits.push({ name: trait, since: copy.day });
  }
  return copy;
}

// ── Putting a world into a state a seed alone will not reach (E3) ───────────

/**
 * A copy of a Career in which one Hero is carrying an Injury given on `since` and lifting
 * on `liftsOn`. Set directly, so that a test of the lift does not also depend on the dice
 * that would have caused it.
 */
export function hurt(
  career: Career,
  heroId: string,
  trait: string,
  since: number,
  liftsOn: number,
): Career {
  const copy = cloneCareer(career);
  const hero = copy.guild.roster.find((candidate) => candidate.id === heroId);
  if (hero === undefined) throw new Error(`no Hero "${heroId}" is on the Roster`);
  hero.traits = hero.traits.filter((held) => held.name !== trait);
  hero.traits.push({ name: trait, since, liftsOn });
  return copy;
}

/** A copy of a Career in which one Hero is exactly this old. */
export function aged(career: Career, heroId: string, age: number): Career {
  const copy = cloneCareer(career);
  const hero = copy.guild.roster.find((candidate) => candidate.id === heroId);
  if (hero === undefined) throw new Error(`no Hero "${heroId}" is on the Roster`);
  hero.age = age;
  return copy;
}

/** A copy of a Career holding this much coin. */
export function holdingCoin(career: Career, coin: number): Career {
  const copy = cloneCareer(career);
  copy.guild.coin = coin;
  return copy;
}

// ── Putting a world into a state a seed alone will not reach (E4) ───────────

/**
 * A copy of a Career in which every Patron thinks exactly this much of the Guild, and so
 * the Guild's Standing is exactly `value × config.standingScale`. World generation starts
 * every Patron between 0 and +1, so the calibre thresholds are otherwise out of reach.
 */
export function patronsThinking(career: Career, value: number): Career {
  const copy = cloneCareer(career);
  for (const patron of copy.patrons) {
    patron.regardForGuild = { ...patron.regardForGuild, value };
  }
  return copy;
}

/**
 * A copy of a Career in which one Hero has left the Roster the way E2 loses them — by
 * choice, over low Regard, on a named Day. Set directly, because reaching a Departure
 * through play takes a seed hunt and this file's job is to put the world where the rule
 * under test can be read (E4-S4).
 */
export function walkedOut(
  career: Career,
  heroId: string,
  onDay: number,
  reason = 'you sent them anyway',
): Career {
  const copy = cloneCareer(career);
  const hero = copy.guild.roster.find((candidate) => candidate.id === heroId);
  if (hero === undefined) throw new Error(`no Hero "${heroId}" is on the Roster`);
  copy.guild.roster = copy.guild.roster.filter((candidate) => candidate.id !== heroId);
  hero.exit = { kind: 'departure', onDay, reason };
  copy.guild.formerHeroes.push(hero);
  copy.ledger.departures += 1;
  return copy;
}

/** A copy of a Career in which one Hero has left the Roster in one of the other two ways. */
export function gone(
  career: Career,
  heroId: string,
  kind: 'death' | 'retirement',
  onDay: number,
): Career {
  const copy = cloneCareer(career);
  const hero = copy.guild.roster.find((candidate) => candidate.id === heroId);
  if (hero === undefined) throw new Error(`no Hero "${heroId}" is on the Roster`);
  copy.guild.roster = copy.guild.roster.filter((candidate) => candidate.id !== heroId);
  hero.exit = { kind, onDay, reason: kind === 'death' ? 'did not come back' : 'reached the end' };
  copy.guild.formerHeroes.push(hero);
  if (kind === 'death') copy.ledger.heroesDied += 1;
  else copy.ledger.heroesRetired += 1;
  return copy;
}

// ── Putting a world into a state a seed alone will not reach (E5) ───────────
//
// A Rival starts neutral about the Guild and their Heroes start between
// `rivalHeroRegardMin` and `rivalHeroRegardMax`, so consent, poaching, retaliation and a
// soured Board all turn on values the opening world does not hold. These set them, the
// way `thinking` sets what one of your own Heroes makes of the Guildmaster.

/** A copy of a Career in which one Rival thinks exactly this much of your Guild. */
export function rivalThinking(
  career: Career,
  rivalId: string,
  value: number,
  reason = 'the business at Thurrow',
): Career {
  const copy = cloneCareer(career);
  const rival = copy.rivals.find((candidate) => candidate.id === rivalId);
  if (rival === undefined) throw new Error(`no Rival "${rivalId}" is in this Career`);
  rival.regardForGuild = { value, reason, nature: rival.regardForGuild.nature };
  return copy;
}

/** A copy of a Career in which every Rival thinks exactly this much of your Guild. */
export function allRivalsThinking(career: Career, value: number): Career {
  return career.rivals.reduce((held, rival) => rivalThinking(held, rival.id, value), career);
}

/** A copy of a Career in which one of a Rival's Heroes thinks exactly this much of them. */
export function rivalHeroThinking(
  career: Career,
  heroId: string,
  value: number,
  reason = 'the business at Thurrow',
): Career {
  const copy = cloneCareer(career);
  for (const rival of copy.rivals) {
    const hero = rival.roster.find((candidate) => candidate.id === heroId);
    if (hero === undefined) continue;
    hero.regardForRival = { value, reason, nature: hero.regardForRival.nature };
    return copy;
  }
  throw new Error(`no Rival employs a Hero with id "${heroId}"`);
}

/**
 * A copy of a Career in which every Rival's Roster has been cut to `size` people, so that
 * a test of retaliation is never quietly refused for want of room on the other side.
 */
export function trimRivalRosters(career: Career, size: number): Career {
  const copy = cloneCareer(career);
  for (const rival of copy.rivals) rival.roster = rival.roster.slice(0, size);
  return copy;
}

/** The first Hero on the named Rival's Roster, which the seed has always dealt somebody to. */
export function firstRivalHero(career: Career, rivalId: string): RivalHero {
  const hero = career.rivals.find((rival) => rival.id === rivalId)?.roster[0];
  if (hero === undefined) throw new Error(`no Rival "${rivalId}" with anybody on its Roster`);
  return hero;
}

/**
 * Content with exactly one Vignette, so that a harm test knows which Beat it resolved and
 * what that Beat's own outcome did. The Vignette has no conditions, so it is always the
 * candidate; its Hero slot is `any`, so the Party's first member takes the Check under a
 * scripted generator.
 *
 * It carries two more Traits than `fixtureContent` does — a second Injury and a third
 * Scar — so that a harm test has a pool deep enough to prove the draw never repeats a
 * Trait the Hero already holds. They live here rather than on `fixtureContent` because
 * every Career in the suite draws harm from that pool, and widening it would move every
 * seeded outcome E1 and E2 pinned.
 *
 * @param failureConsequences what the failure outcome carries. Empty is the ordinary case
 * the engine's own harm falls back on; a `trait` Consequence is the authored-harm case,
 * which suppresses it entirely.
 */
export function oneVignetteContent(failureConsequences: unknown[] = []): Content {
  return validateContent({
    traits: [
      ...fixtureContent.traits,
      {
        name: 'Cut hand',
        kind: 'injury',
        summary: 'Bound tight, and no use for anything needing grip.',
        modifiers: [{ stat: 'Craft', delta: -2 }],
      },
      {
        name: 'Limps',
        kind: 'scar',
        summary: 'The leg set badly and never came right.',
        modifiers: [{ stat: 'Might', delta: -1 }],
      },
    ],
    backgrounds: fixtureContent.backgrounds,
    spheres: fixtureContent.spheres,
    names: fixtureContent.names,
    vignettes: [
      {
        id: 'the-only-one',
        name: 'The only one',
        stat: 'Craft',
        difficulty: 11,
        weight: 1,
        tags: [],
        conditions: {},
        slots: { hero: 'any' },
        outcomes: {
          failure: { narrative: '{hero} does not manage it.', consequences: failureConsequences },
          success: { narrative: '{hero} manages it.', consequences: [] },
          critical: { narrative: '{hero} manages it very well indeed.', consequences: [] },
        },
      },
    ],
  });
}

/**
 * A copy of a Career whose first Commission on the Board is exactly as described, so that
 * a refusal can be aimed at a known set of tags and a known difficulty.
 */
export function offering(career: Career, patch: Partial<Commission>): { career: Career; commission: Commission } {
  const copy = cloneCareer(career);
  const commission = copy.board[0];
  if (commission === undefined) throw new Error('the test expected a Commission on the Board');
  Object.assign(commission, patch);
  return { career: copy, commission };
}

/** Freeze an object and everything reachable from it, so any mutation throws. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return value;
}

/**
 * The policy the contract suite plays with: at every attention stop, send the best
 * available Heroes to the best-paying Commission until the Roster is used, then advance.
 * It makes no interesting decisions — it exists so that a Career can be run end to end
 * without a player.
 *
 * It never insists (E2). It asks `proposeParty` who would refuse, sends somebody else,
 * and if nobody on the Roster will take a Commission it leaves that one alone and moves
 * on — so the Regard the suite measures is only ever moved by work and by neglect, never
 * by a policy deciding to spend it.
 *
 * It does improve the Hall (E3), because a player would: an injured Hero cannot be sent,
 * and a policy that never buys the infirmary spends a growing share of a twenty-year
 * Career with half its Roster sitting at home. It buys an improvement only when it can
 * comfortably afford one — the cost plus a full `startingCoin` of runway left over — so
 * the purchase is never what makes it insolvent. `availableHeroes` is what keeps it from
 * committing anybody who is hurt, so the policy itself needs no rule about that.
 */
export function autoPlay(
  start: Career,
  content: Content,
  options: { partySize?: number; onEvents?: (events: GameEvent[]) => void } = {},
): Career {
  const partySize = options.partySize ?? 2;
  const strength = (hero: Hero): number =>
    hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;
  let career = start;
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the auto policy never reached the end of the Career');
    for (const improvement of HALL_IMPROVEMENTS) {
      if (career.guild.hall.includes(improvement)) continue;
      if (career.guild.coin < hallCost(improvement, career.config) + career.config.startingCoin) {
        continue;
      }
      const bought = improveHall(career, improvement);
      career = bought.career;
      options.onEvents?.(bought.events);
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
        .slice(0, partySize)
        .map((hero) => hero.id);
      if (party.length === 0) continue;
      const step = commitParty(career, commission.id, party, content);
      career = step.career;
      options.onEvents?.(step.events);
      for (const id of party) used.add(id);
    }
    const step = advanceUntilAttention(career, content);
    career = step.career;
    options.onEvents?.(step.events);
  }
  return career;
}
