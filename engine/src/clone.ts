/**
 * Every public engine function works on a private copy of the Career it was given, so a
 * caller's Career is never mutated (solution architecture §6). One copy is taken at the
 * boundary; everything inside works on the draft.
 *
 * The copy is written out field by field rather than handed to `structuredClone`,
 * because a Career is copied several times per Day of play and the hand-written version
 * is an order of magnitude cheaper. The cost is that this file must know the whole of
 * the world state: `clone.test.ts` proves it does, against a Career with every optional
 * field populated.
 */

import type {
  Career,
  CareerEnd,
  CareerLedger,
  Commission,
  Guild,
  Guildmaster,
  Hero,
  HeroTrait,
  Party,
  Patron,
  Reckoning,
  Regard,
  Rival,
  Stats,
} from './types.js';

function cloneStats(stats: Stats): Stats {
  return { Might: stats.Might, Craft: stats.Craft, Nerve: stats.Nerve, Guile: stats.Guile };
}

function cloneRegard(regard: Regard): Regard {
  return { value: regard.value, reason: regard.reason, nature: regard.nature };
}

function cloneRegardMap(map: Record<string, Regard>): Record<string, Regard> {
  const copy: Record<string, Regard> = {};
  for (const [id, regard] of Object.entries(map)) copy[id] = cloneRegard(regard);
  return copy;
}

function cloneCounts(map: Record<string, number>): Record<string, number> {
  const copy: Record<string, number> = {};
  for (const [id, count] of Object.entries(map)) copy[id] = count;
  return copy;
}

function cloneTrait(trait: HeroTrait): HeroTrait {
  return trait.liftsOn === undefined
    ? { name: trait.name, since: trait.since }
    : { name: trait.name, since: trait.since, liftsOn: trait.liftsOn };
}

function cloneHero(hero: Hero): Hero {
  return {
    id: hero.id,
    name: hero.name,
    pronouns: hero.pronouns,
    stats: cloneStats(hero.stats),
    background: hero.background,
    traits: hero.traits.map(cloneTrait),
    regardForGuildmaster: cloneRegard(hero.regardForGuildmaster),
    regardFor: cloneRegardMap(hero.regardFor),
    joinedOn: hero.joinedOn,
  };
}

function cloneGuildmaster(guildmaster: Guildmaster): Guildmaster {
  return {
    name: guildmaster.name,
    pronouns: guildmaster.pronouns,
    stats: cloneStats(guildmaster.stats),
    background: guildmaster.background,
    traits: guildmaster.traits.map(cloneTrait),
    regardFor: cloneRegardMap(guildmaster.regardFor),
    startingStats: cloneStats(guildmaster.startingStats),
  };
}

function cloneGuild(guild: Guild): Guild {
  return {
    name: guild.name,
    guildmaster: cloneGuildmaster(guild.guildmaster),
    roster: guild.roster.map(cloneHero),
    formerHeroes: guild.formerHeroes.map(cloneHero),
    coin: guild.coin,
    hall: [...guild.hall],
  };
}

function clonePatron(patron: Patron): Patron {
  return {
    id: patron.id,
    name: patron.name,
    sphere: patron.sphere,
    regardForGuild: cloneRegard(patron.regardForGuild),
  };
}

function cloneCommission(commission: Commission): Commission {
  return {
    id: commission.id,
    patronId: commission.patronId,
    title: commission.title,
    fee: commission.fee,
    difficulty: commission.difficulty,
    spanDays: commission.spanDays,
    beatCount: commission.beatCount,
    tags: [...commission.tags],
    postedOn: commission.postedOn,
    expiresOn: commission.expiresOn,
  };
}

function cloneParty(party: Party): Party {
  return {
    id: party.id,
    commissionId: party.commissionId,
    commission: cloneCommission(party.commission),
    heroIds: [...party.heroIds],
    backing: party.backing,
    departedOn: party.departedOn,
    returnsOn: party.returnsOn,
    beatDays: [...party.beatDays],
    beatsResolved: [...party.beatsResolved],
    vignettesUsed: [...party.vignettesUsed],
    score: party.score,
  };
}

function cloneRival(rival: Rival): Rival {
  return { id: rival.id, name: rival.name, standing: rival.standing };
}

function cloneLedger(ledger: CareerLedger): CareerLedger {
  return {
    commissionsCompleted: ledger.commissionsCompleted,
    commissionsFailed: ledger.commissionsFailed,
    commissionsByPatron: cloneCounts(ledger.commissionsByPatron),
    peakCoin: ledger.peakCoin,
    lastUpkeepNegative: ledger.lastUpkeepNegative,
  };
}

function cloneReckoning(reckoning: Reckoning): Reckoning {
  const copy: Reckoning = {
    years: reckoning.years,
    heroesOnRoster: reckoning.heroesOnRoster,
    heroesLost: reckoning.heroesLost,
    commissionsCompleted: reckoning.commissionsCompleted,
    commissionsFailed: reckoning.commissionsFailed,
    peakCoin: reckoning.peakCoin,
    finalCoin: reckoning.finalCoin,
    standing: reckoning.standing,
    guildmasterStats: {
      start: cloneStats(reckoning.guildmasterStats.start),
      end: cloneStats(reckoning.guildmasterStats.end),
    },
  };
  if (reckoning.favouritePatron !== undefined) {
    copy.favouritePatron = { ...reckoning.favouritePatron };
  }
  return copy;
}

function cloneEnd(end: CareerEnd): CareerEnd {
  return { reason: end.reason, onDay: end.onDay, reckoning: cloneReckoning(end.reckoning) };
}

/** A deep copy of a Career, sharing nothing with the original. */
export function cloneCareer(career: Career): Career {
  const copy: Career = {
    formatVersion: career.formatVersion,
    seed: career.seed,
    config: { ...career.config },
    rng: [career.rng[0], career.rng[1], career.rng[2], career.rng[3]],
    day: career.day,
    guild: cloneGuild(career.guild),
    patrons: career.patrons.map(clonePatron),
    board: career.board.map(cloneCommission),
    parties: career.parties.map(cloneParty),
    rivals: career.rivals.map(cloneRival),
    ledger: cloneLedger(career.ledger),
    recentCommissions: career.recentCommissions.map(cloneCommission),
  };
  if (career.ended !== undefined) copy.ended = cloneEnd(career.ended);
  return copy;
}
