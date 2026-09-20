/**
 * World generation: turning a seed and the authored content into a going concern — a
 * Guild that already has a Guildmaster, a Roster with history between its members,
 * Patrons, Rivals and work on the Board.
 */

import { startingAge } from './age.js';
import { postCommissions } from './board.js';
import { defaultConfig, type GameConfig } from './config.js';
import type { BackgroundDef, Content } from './content.js';
import { EngineError } from './errors.js';
import type { GameEvent } from './events.js';
import { calibreOfStats, distributeStats, PRONOUNS, statTotal } from './people.js';
import { populateRivalRosters, REASON_NOTHING_BETWEEN_YOU } from './rival.js';
import { rngOn, seedRng, type Rng } from './rng.js';
import { standingOf } from './state.js';
import type { Career, Guildmaster, Hero, Patron, Regard, Stats, Step } from './types.js';

/** The reason every Regard a Career starts with carries. */
export const REASON_CAME_WITH_THE_GUILD = 'came with the Guild';

/**
 * Kept here because E1 put them here and several modules import them from this path. The
 * definitions themselves moved to `people.ts` in E5, where world generation, an Applicant
 * at the door and a Rival's Roster all reach them without importing one another.
 */
export { distributeStats, PRONOUNS };

function blankStats(): Stats {
  return { Might: 0, Craft: 0, Nerve: 0, Guile: 0 };
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
  seed: string,
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
  const id = `h${index + 1}`;
  // Drawn in exactly the order E1 drew them — the epithet, then the pronouns, then the
  // Stats — because every seeded expectation in the suite is this sequence. E5 needs the
  // Stats in hand before the object is built, to read a calibre off them, and taking them
  // out of the literal is the only change: not one draw moves.
  const name = named ? `${first} ${drawFrom(epithets, rng, 'hero epithets')}` : first;
  const pronouns = rng.pick(PRONOUNS);
  const stats = distributeStats(
    rng.between(config.heroStatTotalMin, config.heroStatTotalMax),
    config,
    rng,
  );
  return {
    id,
    name,
    pronouns,
    stats,
    // Drawn from a stream of its own rather than from `rng`, so that adding ages to world
    // generation moved no other draw and a save without them can be filled with exactly
    // the same number (DL-16 §1).
    age: startingAge(seed, id, config),
    background: background.name,
    traits: traitsOf(background, 1),
    // Read off the Stats they were generated with rather than drawn, so nothing about
    // world generation moves for E5 carrying calibre onto a person (DL-19 §7).
    calibre: calibreOfStats(statTotal(stats), config),
    regardForGuildmaster: regard(
      rng.between(config.heroRegardForGuildmasterMin, config.heroRegardForGuildmasterMax),
      REASON_CAME_WITH_THE_GUILD,
      'neutral',
    ),
    regardFor: {},
    joinedOn: 1,
    lastCommittedOn: 1,
    regardDecayedOn: 1,
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
  // The debt the Guild came with, taken out of the opening float and then never spoken of
  // again: no obligation is tracked, no event is emitted and no draw is taken for it, so
  // at the default of 0 this is `startingCoin` and every seeded expectation is untouched
  // (E7 §3's adopted default, DL-25 §1). The peak is set to the same number because it is
  // the largest balance the Guild has actually held.
  const openingCoin = settings.startingCoin - settings.startingDebt;
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
      coin: openingCoin,
      hall: [],
    },
    patrons: [],
    board: [],
    parties: [],
    rivals: [],
    // A Career opens with nobody waiting and no Applicant ever made: the first batch is
    // due on the first Day that is a multiple of `applicantsEveryDays` (E4-S2). Nothing
    // here takes a draw for it, so world generation is bit-identical to E3's (DL-19 §1).
    applicants: [],
    nextApplicantNumber: 1,
    nextRivalHeroNumber: 1,
    ledger: {
      commissionsCompleted: 0,
      commissionsFailed: 0,
      commissionsByPatron: {},
      peakCoin: openingCoin,
      lastUpkeepNegative: false,
      departures: 0,
      heroesInjured: 0,
      heroesScarred: 0,
      heroesDied: 0,
      heroesRetired: 0,
      applicantsSeen: 0,
      applicantsAccepted: 0,
      returners: 0,
      returnersOffered: 0,
      heroesTransferredIn: 0,
      heroesPoachedIn: 0,
      heroesPoachedFromUs: 0,
      wordsSent: 0,
      turnedBack: 0,
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
    career.guild.roster.push(makeHero(seed, index, content, settings, rng, firstNames, epithets));
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
      roster: [],
      regardForGuild: regard(
        settings.rivalStartingRegard,
        REASON_NOTHING_BETWEEN_YOU,
        'neutral',
      ),
    });
  }
  // Each Rival's Roster is drawn from a stream of its own, keyed on the seed and that
  // Rival's id, so world generation takes not one extra draw from `career.rng` and every
  // seeded expectation E1 to E4 pinned is bit-identical to what it was (E5 §5, DL-19 §1).
  populateRivalRosters(career, content);

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
