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
  AnyHero,
  Applicant,
  Career,
  CareerEnd,
  CareerLedger,
  Commission,
  Guild,
  Guildmaster,
  HeroTrait,
  Party,
  Patron,
  PendingWord,
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
  const copy: HeroTrait = { name: trait.name, since: trait.since };
  if (trait.liftsOn !== undefined) copy.liftsOn = trait.liftsOn;
  // E6: the kind travels with the Trait, so a timed Trait that is not an Injury stays one
  // through a copy, a save and a move between Rosters (DL-23 §10).
  if (trait.kind !== undefined) copy.kind = trait.kind;
  return copy;
}

/**
 * A copy of anybody on any Roster. The employer Regard is exclusive (E5 §4), so exactly
 * one of the two is present and the copy carries the one that was there — which keeps a
 * round trip deep-equal and keeps the exclusivity true of every copy ever made.
 *
 * The cast is the price of writing one function for the two shapes rather than two nearly
 * identical ones; `clone.test.ts` and `rivals.test.ts` are what prove it right.
 */
function cloneHero<T extends AnyHero>(hero: T): T {
  // Written as spreads rather than as assignments afterwards so that the copy's keys fall
  // in the same order as the original's: `clone.test.ts` compares the two serialised, and
  // `JSON.stringify` writes keys in the order they were set.
  const copy = {
    id: hero.id,
    name: hero.name,
    pronouns: hero.pronouns,
    stats: cloneStats(hero.stats),
    age: hero.age,
    background: hero.background,
    traits: hero.traits.map(cloneTrait),
    calibre: hero.calibre,
    ...(hero.regardForGuildmaster === undefined
      ? {}
      : { regardForGuildmaster: cloneRegard(hero.regardForGuildmaster) }),
    ...(hero.regardForRival === undefined
      ? {}
      : { regardForRival: cloneRegard(hero.regardForRival) }),
    regardFor: cloneRegardMap(hero.regardFor),
    joinedOn: hero.joinedOn,
    lastCommittedOn: hero.lastCommittedOn,
    regardDecayedOn: hero.regardDecayedOn,
    ...(hero.formerHeroId === undefined ? {} : { formerHeroId: hero.formerHeroId }),
    ...(hero.exit === undefined
      ? {}
      : { exit: { kind: hero.exit.kind, onDay: hero.exit.onDay, reason: hero.exit.reason } }),
  };
  return copy as unknown as T;
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

function clonePendingWord(word: PendingWord): PendingWord {
  return {
    decisionId: word.decisionId,
    beatIndex: word.beatIndex,
    askedOn: word.askedOn,
    timesOutOn: word.timesOutOn,
    slots:
      word.slots.trait === undefined
        ? { heroId: word.slots.heroId, patronId: word.slots.patronId, sphereId: word.slots.sphereId }
        : {
            heroId: word.slots.heroId,
            patronId: word.slots.patronId,
            sphereId: word.slots.sphereId,
            trait: word.slots.trait,
          },
    optionIds: [...word.optionIds],
  };
}

function cloneParty(party: Party): Party {
  const copy: Party = {
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
    decisionUsed: party.decisionUsed,
    dcDelta: party.dcDelta,
  };
  if (party.pendingWord !== undefined) copy.pendingWord = clonePendingWord(party.pendingWord);
  if (party.turnedBackOn !== undefined) copy.turnedBackOn = party.turnedBackOn;
  return copy;
}

function cloneRival(rival: Rival): Rival {
  return {
    id: rival.id,
    name: rival.name,
    standing: rival.standing,
    roster: rival.roster.map(cloneHero),
    regardForGuild: cloneRegard(rival.regardForGuild),
  };
}

function cloneApplicant(applicant: Applicant): Applicant {
  const copy: Applicant = {
    id: applicant.id,
    name: applicant.name,
    pronouns: applicant.pronouns,
    stats: cloneStats(applicant.stats),
    background: applicant.background,
    traits: applicant.traits.map(cloneTrait),
    age: applicant.age,
    calibre: applicant.calibre,
    askingFee: applicant.askingFee,
    arrivedOn: applicant.arrivedOn,
    expiresOn: applicant.expiresOn,
  };
  if (applicant.formerHeroId !== undefined) copy.formerHeroId = applicant.formerHeroId;
  return copy;
}

function cloneLedger(ledger: CareerLedger): CareerLedger {
  return {
    commissionsCompleted: ledger.commissionsCompleted,
    commissionsFailed: ledger.commissionsFailed,
    commissionsByPatron: cloneCounts(ledger.commissionsByPatron),
    peakCoin: ledger.peakCoin,
    lastUpkeepNegative: ledger.lastUpkeepNegative,
    departures: ledger.departures,
    heroesInjured: ledger.heroesInjured,
    heroesScarred: ledger.heroesScarred,
    heroesDied: ledger.heroesDied,
    heroesRetired: ledger.heroesRetired,
    applicantsSeen: ledger.applicantsSeen,
    applicantsAccepted: ledger.applicantsAccepted,
    returners: ledger.returners,
    returnersOffered: ledger.returnersOffered,
    heroesTransferredIn: ledger.heroesTransferredIn,
    heroesPoachedIn: ledger.heroesPoachedIn,
    heroesPoachedFromUs: ledger.heroesPoachedFromUs,
    wordsSent: ledger.wordsSent,
    turnedBack: ledger.turnedBack,
  };
}

function cloneReckoning(reckoning: Reckoning): Reckoning {
  const copy: Reckoning = {
    years: reckoning.years,
    heroesOnRoster: reckoning.heroesOnRoster,
    heroesLost: reckoning.heroesLost,
    heroesRetired: reckoning.heroesRetired,
    heroesRecruited: reckoning.heroesRecruited,
    heroesPoachedFromUs: reckoning.heroesPoachedFromUs,
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
    applicants: career.applicants.map(cloneApplicant),
    nextApplicantNumber: career.nextApplicantNumber,
    nextRivalHeroNumber: career.nextRivalHeroNumber,
    ledger: cloneLedger(career.ledger),
    recentCommissions: career.recentCommissions.map(cloneCommission),
  };
  if (career.ended !== undefined) copy.ended = cloneEnd(career.ended);
  return copy;
}
