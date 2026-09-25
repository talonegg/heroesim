// A content set for the engine's tests. Engine tests may not import `@heroesim/content`
// (ADR-0007, pre-M0 review A3), so this mirrors the core set's shape and keys — twenty Hero Stats
// in four areas, five Guildmaster Stats, four Classes with the core's leading Stats and gated
// Skills, the core's Traits, Backgrounds and Spheres — with shorter name lists (DL-19). It is
// only ever read by tests; nothing in the engine's source imports it.

import { defaultConfig, type EngineDeps, type GameConfig } from '../config.js';
import type {
  Background,
  Class,
  ContentSet,
  Skill,
  Sphere,
  Stat,
  StatArea,
  StatOwner,
  Trait,
} from '../content-types.js';
import { emptyDocument, type World } from '../document.js';
import { createStreams, streamNames } from '../rng.js';

const heroStats: Record<StatArea, string[]> = {
  physical: ['strength', 'dexterity', 'weaponry', 'constitution', 'endurance'],
  mental: ['intelligence', 'knowledge', 'perception', 'wits', 'courage', 'willpower'],
  magical: ['arcana', 'power', 'spelllore', 'spirit', 'resistance'],
  social: ['leadership', 'charisma', 'diplomacy', 'adaptability'],
};

const guildmasterStats: Record<string, StatArea> = {
  inspiration: 'social',
  influence: 'social',
  negotiation: 'social',
  coaching: 'mental',
  judgement: 'mental',
};

const classes: Record<string, { leadingStats: string[]; gatedSkills: string[] }> = {
  warrior: { leadingStats: ['strength', 'weaponry', 'constitution', 'courage'], gatedSkills: ['swordcraft', 'shieldwork', 'tactics'] },
  rogue: { leadingStats: ['dexterity', 'perception', 'wits', 'adaptability'], gatedSkills: ['lockpicking', 'stealth', 'trapcraft'] },
  mage: { leadingStats: ['intelligence', 'arcana', 'power', 'spelllore'], gatedSkills: ['evocation', 'warding', 'runecraft'] },
  healer: { leadingStats: ['knowledge', 'willpower', 'spirit', 'charisma'], gatedSkills: ['field-surgery', 'herbalism', 'benediction'] },
};

const traits: Record<string, Trait['owner']> = {
  'old-soldier': 'guildmaster',
  'well-liked': 'guildmaster',
  thrifty: 'guildmaster',
  miser: 'guildmaster',
  spendthrift: 'guildmaster',
  'mistrusts-magic': 'guildmaster',
  scarred: 'hero',
  lame: 'hero',
  'one-eyed': 'hero',
  'short-winded': 'hero',
};

const backgrounds: Record<string, Background['owner']> = {
  'farm-born': 'hero',
  'levy-soldier': 'hero',
  'temple-ward': 'hero',
  'river-folk': 'hero',
  'old-charter': 'guild',
  breakaway: 'guild',
  'newly-founded': 'guild',
};

const spheres = ['crown', 'church', 'merchants', 'villages', 'scholars', 'underworld'];

const allHeroStatKeys = Object.values(heroStats).flat();

function title(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1).replaceAll('-', ' ');
}

function stat(key: string, area: StatArea, owner: StatOwner): Stat {
  return { key, name: title(key), area, min: 1, max: 20, default: 10, owner };
}

function keyed<Row extends { key: string }>(rows: Row[]): Record<string, Row> {
  return Object.fromEntries(rows.map((row) => [row.key, row]));
}

/** A fresh copy each call, so a test may change its own without touching another's. */
export function testContent(): ContentSet {
  return {
    id: 'test',
    version: 1,
    stats: keyed([
      ...Object.entries(heroStats).flatMap(([area, keys]) =>
        keys.map((key) => stat(key, area as StatArea, 'hero')),
      ),
      ...Object.entries(guildmasterStats).map(([key, area]) => stat(key, area, 'guildmaster')),
    ]),
    classes: keyed(
      Object.entries(classes).map(([key, { leadingStats, gatedSkills }]): Class => {
        // Leading Stats share two thirds of growth and the rest one third, as in the core (DL-17).
        const leadingWeight = 2 / 3 / leadingStats.length;
        const otherWeight = 1 / 3 / (allHeroStatKeys.length - leadingStats.length);
        const growth = Object.fromEntries(
          allHeroStatKeys.map((statKey) => [statKey, leadingStats.includes(statKey) ? leadingWeight : otherWeight]),
        );
        return { key, name: title(key), leadingStats: [...leadingStats], gatedSkills: [...gatedSkills], growth };
      }),
    ),
    skills: keyed(
      Object.values(classes).flatMap(({ gatedSkills }) => gatedSkills.map((key): Skill => ({ key, name: title(key) }))),
    ),
    traits: keyed(Object.entries(traits).map(([key, owner]): Trait => ({ key, name: title(key), owner, effect: null }))),
    backgrounds: keyed(
      Object.entries(backgrounds).map(([key, owner]): Background => ({ key, name: title(key), owner })),
    ),
    spheres: keyed(spheres.map((key): Sphere => ({ key, name: title(key) }))),
    names: {
      given: {
        female: ['Aldith', 'Brynja', 'Cwen', 'Dagny', 'Edda', 'Frida', 'Gyda', 'Hild'],
        male: ['Aldred', 'Bram', 'Cenric', 'Dag', 'Egil', 'Finn', 'Grim', 'Hakon'],
      },
      family: ['Ashcombe', 'Barrowby', 'Carrick', 'Dalby', 'Fenwick', 'Garside', 'Hallam', 'Ingleby'],
      guild: [
        'The Ashford Guild',
        'The Coldbeck Guild',
        'The Greywater Guild',
        'The Lantern Guild',
        'The Kestrel Guild',
        'The Hollin Guild',
        'The Blackfen Guild',
        'The Northmoor Guild',
      ],
      patron: [
        'Aldous Fairweather',
        'Berengar Holt',
        'Cecily Ashdown',
        'Denholm Crane',
        'Edith Marlow',
        'Florian Keld',
        'Godwin Harrow',
        'Hawise Brennard',
        'Isolde Varney',
        'Jocelyn Pike',
        'Lambert Sowerby',
        'Mabel Thorne',
        'Nicolas Aske',
        'Orabel Quint',
      ],
    },
  };
}

/** The test content with the default config, or with `overrides` on it. */
export function testDeps(overrides: Partial<GameConfig> = {}): EngineDeps {
  return { config: { ...defaultConfig, ...overrides }, content: testContent() };
}

/**
 * An empty world at Turn 0 with a stream for each of `names`, seeded from `seed`: the core's
 * streams by default. A test that must see other streams stand still names them here.
 */
export function testWorld(seed: string, deps: EngineDeps, names: readonly string[] = streamNames): World {
  const meta = {
    version: deps.config.schemaVersion,
    seed,
    content: { id: deps.content.id, version: deps.content.version },
    config: { ...deps.config },
    createdAt: 'test',
  };
  // Every core stream is among `names` or the world is unusable; a test adds names, never drops one.
  const rng = { ...createStreams(seed, names), ...createStreams(seed, streamNames) };
  return emptyDocument(meta, rng).world;
}
