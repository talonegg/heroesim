/**
 * World generation: turning a seed and the authored content into a going concern — a
 * Guild that already has a Guildmaster, a Roster with history between its members,
 * Patrons, Rivals and work on the Board.
 */

import { postCommissions } from './board.js';
import { defaultConfig, type GameConfig } from './config.js';
import type { BackgroundDef, Content } from './content.js';
import { EngineError } from './errors.js';
import type { GameEvent } from './events.js';
import { rngOn, seedRng, type Rng } from './rng.js';
import { standingOf } from './state.js';
import { STATS } from './types.js';
import type { Career, Guildmaster, Hero, Patron, Pronouns, Regard, Stats, Step } from './types.js';

/** The reason every Regard a Career starts with carries. */
export const REASON_CAME_WITH_THE_GUILD = 'came with the Guild';

const PRONOUNS: readonly Pronouns[] = ['she', 'he', 'they'];

function blankStats(): Stats {
  return { Might: 0, Craft: 0, Nerve: 0, Guile: 0 };
}

/** Four Stats within the configured range, totalling `total`. */
function distributeStats(total: number, config: GameConfig, rng: Rng): Stats {
  const stats: Stats = { ...blankStats() };
  for (const stat of STATS) stats[stat] = config.statMin;
  let remaining = total - config.statMin * STATS.length;
  while (remaining > 0) {
    const room = STATS.filter((stat) => stats[stat] < config.statMax);
    if (room.length === 0) break;
    stats[rng.pick(room)] += 1;
    remaining -= 1;
  }
  return stats;
}

function drawFrom(pool: string[], rng: Rng, what: string): string {
  if (pool.length === 0) throw new EngineError('InternalError', `ran out of ${what} to draw from`);
  const index = rng.int(pool.length);
  const [drawn] = pool.splice(index, 1);
  if (drawn === undefined) throw new EngineError('InternalError', `ran out of ${what} to draw from`);
  return drawn;
}

function traitsOf(background: BackgroundDef, day: number): Hero['traits'] {
  return background.traits.map((name) => ({ name, since: day }));
}

function regard(value: number, reason: string, nature: Regard['nature']): Regard {
  return { value, reason, nature };
}

/**
 * The places a shared history can have happened in, read off the epithets in the name
 * pools so that "Ashfall" means the same thing as an epithet and as a reason.
 */
function placeNames(content: Content): string[] {
  const places = content.names.heroEpithets
    .filter((epithet) => epithet.startsWith('of '))
    .map((epithet) => epithet.slice('of '.length));
  return places.length > 0 ? places : content.spheres.map((sphere) => sphere.name);
}

function makeGuildmaster(content: Content, config: GameConfig, rng: Rng, firstNames: string[]): Guildmaster {
  const background = rng.pick(content.backgrounds);
  const stats = distributeStats(config.guildmasterStatTotal, config, rng);
  return {
    name: drawFrom(firstNames, rng, 'hero first names'),
    pronouns: rng.pick(PRONOUNS),
    stats,
    background: background.name,
    traits: traitsOf(background, 1),
    regardFor: {},
    startingStats: { ...stats },
  };
}

function makeHero(
  index: number,
  content: Content,
  config: GameConfig,
  rng: Rng,
  firstNames: string[],
  epithets: string[],
): Hero {
  const background = rng.pick(content.backgrounds);
  const first = drawFrom(firstNames, rng, 'hero first names');
  const named = epithets.length > 0 && rng.chance(config.heroEpithetChance);
  return {
    id: `h${index + 1}`,
    name: named ? `${first} ${drawFrom(epithets, rng, 'hero epithets')}` : first,
    pronouns: rng.pick(PRONOUNS),
    stats: distributeStats(rng.between(config.heroStatTotalMin, config.heroStatTotalMax), config, rng),
    background: background.name,
    traits: traitsOf(background, 1),
    regardForGuildmaster: regard(
      rng.between(config.heroRegardForGuildmasterMin, config.heroRegardForGuildmasterMax),
      REASON_CAME_WITH_THE_GUILD,
      'neutral',
    ),
    regardFor: {},
    joinedOn: 1,
  };
}

/** Seed the Regard the starting Roster holds for one another: some bonds, at most one rivalry. */
function seedHeroRegard(roster: readonly Hero[], content: Content, config: GameConfig, rng: Rng): void {
  const pairs: [Hero, Hero][] = [];
  for (let left = 0; left < roster.length; left += 1) {
    for (let right = left + 1; right < roster.length; right += 1) {
      const one = roster[left];
      const other = roster[right];
      if (one === undefined || other === undefined) continue;
      pairs.push([one, other]);
    }
  }
  const places = placeNames(content);
  const shuffled = rng.shuffle(pairs);
  const bonds = Math.max(0, Math.min(config.startingBonds, shuffled.length));
  const rivalries = Math.max(0, Math.min(config.startingRivalries, shuffled.length - bonds));

  shuffled.forEach(([one, other], index) => {
    const nature: Regard['nature'] =
      index < bonds ? 'bond' : index < bonds + rivalries ? 'rivalry' : 'neutral';
    const [low, high] =
      nature === 'bond'
        ? [config.bondRegardMin, config.bondRegardMax]
        : nature === 'rivalry'
          ? [config.rivalryRegardMin, config.rivalryRegardMax]
          : [config.neutralRegardMin, config.neutralRegardMax];
    const where = rng.pick(places);
    one.regardFor[other.id] = regard(rng.between(low, high), where, nature);
    other.regardFor[one.id] = regard(rng.between(low, high), where, nature);
  });
}

function makePatrons(content: Content, config: GameConfig, rng: Rng): Patron[] {
  const taken = new Set<string>();
  const patrons: Patron[] = [];
  for (let index = 0; index < config.patronCount; index += 1) {
    const sphere = content.spheres[index % content.spheres.length];
    if (sphere === undefined) break;
    const free = sphere.patronNames.filter((name) => !taken.has(name));
    const name = rng.pick(free.length > 0 ? free : sphere.patronNames);
    taken.add(name);
    patrons.push({
      id: `pa${index + 1}`,
      name,
      sphere: sphere.id,
      regardForGuild: regard(
        rng.between(config.patronStartingRegardMin, config.patronStartingRegardMax),
        REASON_CAME_WITH_THE_GUILD,
        'neutral',
      ),
    });
  }
  return patrons;
}

/**
 * Begin a Career. The same seed and the same content always give the same world.
 *
 * @param seed the string the world is generated from
 * @param content the authored Traits, Backgrounds, Spheres, names and Vignettes
 * @param config overrides for any of the balance defaults
 */
export function newCareer(seed: string, content: Content, config?: Partial<GameConfig>): Step {
  const settings: GameConfig = { ...defaultConfig, ...config };
  const career: Career = {
    formatVersion: 1,
    seed,
    config: settings,
    rng: seedRng(seed),
    day: 1,
    guild: {
      name: '',
      guildmaster: {
        name: '',
        pronouns: 'they',
        stats: blankStats(),
        background: '',
        traits: [],
        regardFor: {},
        startingStats: blankStats(),
      },
      roster: [],
      formerHeroes: [],
      coin: settings.startingCoin,
      hall: [],
    },
    patrons: [],
    board: [],
    parties: [],
    rivals: [],
    ledger: {
      commissionsCompleted: 0,
      commissionsFailed: 0,
      commissionsByPatron: {},
      peakCoin: settings.startingCoin,
      lastUpkeepNegative: false,
    },
    recentCommissions: [],
  };

  const rng = rngOn(career);
  const firstNames = [...content.names.heroFirst];
  const epithets = [...content.names.heroEpithets];
  const rivalNames = [...content.names.rivalNames];

  career.guild.name = rng.pick(content.names.guildNames);
  career.guild.guildmaster = makeGuildmaster(content, settings, rng, firstNames);

  for (let index = 0; index < settings.startingHeroes; index += 1) {
    career.guild.roster.push(makeHero(index, content, settings, rng, firstNames, epithets));
  }
  seedHeroRegard(career.guild.roster, content, settings, rng);
  for (const hero of career.guild.roster) {
    career.guild.guildmaster.regardFor[hero.id] = regard(
      rng.between(settings.guildmasterRegardForHeroMin, settings.guildmasterRegardForHeroMax),
      REASON_CAME_WITH_THE_GUILD,
      'neutral',
    );
  }

  career.patrons = makePatrons(content, settings, rng);

  const standing = standingOf(career);
  for (let index = 0; index < settings.rivalCount; index += 1) {
    career.rivals.push({
      id: `r${index + 1}`,
      name: drawFrom(rivalNames, rng, 'Rival names'),
      standing: Math.max(
        0,
        standing + rng.between(-settings.rivalStandingSpread, settings.rivalStandingSpread),
      ),
    });
  }

  const events: GameEvent[] = [
    {
      type: 'CareerStarted',
      day: career.day,
      seed,
      guildName: career.guild.name,
      heroIds: career.guild.roster.map((hero) => hero.id),
    },
  ];
  postCommissions(
    career,
    content,
    rng,
    rng.between(settings.boardSizeMin, settings.boardSizeMax),
    events,
  );
  events.push({
    type: 'BoardRefreshed',
    day: career.day,
    commissionIds: career.board.map((commission) => commission.id),
  });

  return { career, events };
}
