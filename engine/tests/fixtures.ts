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

import { advanceUntilAttention, availableHeroes, commitParty } from '../src/career.js';
import { validateContent, type Content } from '../src/content.js';
import type { GameEvent } from '../src/events.js';
import { rngOn, type Rng, type RngState } from '../src/rng.js';
import type { Career, Hero } from '../src/types.js';

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
    const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
    const byFee = [...career.board].sort((one, other) => other.fee - one.fee);
    let taken = 0;
    for (const commission of byFee) {
      const party = free.slice(taken, taken + partySize).map((hero) => hero.id);
      if (party.length === 0) break;
      const step = commitParty(career, commission.id, party, content);
      career = step.career;
      options.onEvents?.(step.events);
      taken += party.length;
    }
    const step = advanceUntilAttention(career, content);
    career = step.career;
    options.onEvents?.(step.events);
  }
  return career;
}
