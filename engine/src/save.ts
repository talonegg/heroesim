/**
 * Saves are snapshots of world state, never replayed event logs (ADR-0004). One
 * serialiser; the front ends differ only in where they put the text (DL-02).
 *
 * `deserialiseCareer(serialiseCareer(c))` deep-equals `c` for every reachable Career:
 * all state is plain JSON data and optional fields are omitted rather than set to
 * `undefined`, so nothing is lost on the way through.
 */

import { startingAge } from './age.js';
import { cloneCareer } from './clone.js';
import { defaultConfig, type GameConfig } from './config.js';
import type { Content } from './content.js';
import { SaveError } from './errors.js';
import { calibreOfStats, statTotal } from './people.js';
import { populateRivalRosters, REASON_NOTHING_BETWEEN_YOU } from './rival.js';
import type { RngState } from './rng.js';
import { HALL_IMPROVEMENTS } from './types.js';
import type { Career, Stats } from './types.js';

/** The `formatVersion` this engine writes and will load. */
export const SAVE_FORMAT_VERSION = 1;

const PRONOUNS = ['she', 'he', 'they'];
const REGARD_NATURES = ['neutral', 'bond', 'rivalry'];
const BEAT_RESULTS = ['failure', 'success', 'critical'];
const END_REASONS = ['retirement', 'insolvency'];
const STAT_NAMES = ['Might', 'Craft', 'Nerve', 'Guile'];
const EXIT_KINDS = ['departure', 'death', 'retirement'];
const TRAIT_KINDS = ['background', 'disposition', 'injury', 'scar'];

/**
 * The `GameConfig` fields added after this format version was first written. A save from
 * before them is loaded with the default rather than refused: the world it describes is
 * complete, it simply predates a rule (E2, DL-14; DL-15 for the two Backing constants;
 * E3 for harm, age and the Hall; `patronRegardRecoveryAmount` for the recovery literal
 * named out of `career.ts` under invariant 8). Every other field is still required,
 * because a config missing one of those is a document this engine never wrote.
 */
const CONFIG_ADDED_LATER: ReadonlySet<string> = new Set([
  'backingMin',
  'backingRegardDivisor',
  'backingStatDivisor',
  'backingStatOffset',
  'refusalRegardThreshold',
  'insistenceRegardCost',
  'departureRegardThreshold',
  'departureDc',
  'talkedRoundRegardGain',
  'regardDecayEveryDays',
  'regardDecayAmount',
  'regardDecayQuartersFactor',
  'injuryChanceOnFailure',
  'scarChanceOnCriticalFailure',
  'deathChanceOnCriticalFailure',
  'injurySpanMin',
  'injurySpanMax',
  'heroStartingAgeMin',
  'heroStartingAgeMax',
  'heroRetirementAge',
  'hallInfirmaryCost',
  'hallTrainingYardCost',
  'hallQuartersCost',
  'infirmaryInjuryFactor',
  'trainingYardBacking',
  'patronRegardRecoveryAmount',
  'applicantsEveryDays',
  'applicantsEveryDaysBelowFloor',
  'applicantBatchMin',
  'applicantBatchMax',
  'applicantLingerDays',
  'rosterCap',
  'rosterFloor',
  'calibre2Standing',
  'calibre3Standing',
  'calibreStatBudget1',
  'calibreStatBudget2',
  'calibreStatBudget3',
  'applicantFeeBase',
  'applicantFeePerCalibre',
  'joiningRegard',
  'joiningRegardAmongHeroes',
  'returnCooldownDays',
  'returnAsApplicantChance',
  'returningRegard',
  'rivalRosterMin',
  'rivalRosterMax',
  'rivalChurnChance',
  'rivalChurnGainChance',
  'rivalStartingRegard',
  'rivalHeroRegardMin',
  'rivalHeroRegardMax',
  'transferFeeBase',
  'transferFeePerCalibre',
  'transferConsentRegard',
  'transferJoiningRegard',
  'poachFeeFactor',
  'poachRegardThreshold',
  'poachRivalRegardCost',
  'retaliationRegardThreshold',
  'souredRivalThreshold',
  'souredRivalExtraTakes',
  'rivalTakesMax',
  'decisionChancePerBeat',
  'decisionsPerCommission',
  'wordTimeoutDays',
  'turnBackTravelDays',
  'turnBackFeeFactor',
  // E7, DL-25 §1. A save written before the debt was named takes the default of 0, which
  // is what every Career written before it opened at.
  'startingDebt',
]);

function fail(what: string): never {
  throw new SaveError(`this save cannot be loaded: ${what}`);
}

function table(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${where} is missing or is not an object`);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where} is missing or is not an array`);
  return value;
}

function number(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${where} is missing or is not a number`);
  return value;
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string') fail(`${where} is missing or is not a string`);
  return value;
}

function optionalNumber(value: unknown, where: string): void {
  if (value !== undefined) number(value, where);
}

function optionalText(value: unknown, where: string): void {
  if (value !== undefined) text(value, where);
}

function oneOf(value: unknown, allowed: readonly string[], where: string): void {
  const found = text(value, where);
  if (!allowed.includes(found)) {
    fail(`${where} is "${found}", and the only values it may take are ${allowed.join(', ')}`);
  }
}

function textList(value: unknown, where: string): void {
  list(value, where).forEach((item, index) => text(item, `${where}[${index}]`));
}

function numberList(value: unknown, where: string): void {
  list(value, where).forEach((item, index) => number(item, `${where}[${index}]`));
}

function checkRng(value: unknown): RngState {
  const words = list(value, 'rng');
  if (words.length !== 4) fail('rng does not hold four words');
  words.forEach((word, index) => number(word, `rng[${index}]`));
  return value as RngState;
}

function checkConfig(value: unknown): GameConfig {
  const raw = table(value, 'config');
  for (const key of Object.keys(defaultConfig)) {
    if (raw[key] === undefined && CONFIG_ADDED_LATER.has(key)) continue;
    number(raw[key], `config.${key}`);
  }
  return value as GameConfig;
}

function checkRegard(value: unknown, where: string): void {
  const raw = table(value, where);
  number(raw['value'], `${where}.value`);
  text(raw['reason'], `${where}.reason`);
  oneOf(raw['nature'], REGARD_NATURES, `${where}.nature`);
}

function checkTraits(value: unknown, where: string): void {
  list(value, where).forEach((held, index) => {
    const raw = table(held, `${where}[${index}]`);
    text(raw['name'], `${where}[${index}].name`);
    number(raw['since'], `${where}[${index}].since`);
    optionalNumber(raw['liftsOn'], `${where}[${index}].liftsOn`);
    // Added in E6. Absent on every Trait written before it, and read as an Injury where
    // the Trait is timed — which is what those documents mean (DL-23 §10).
    if (raw['kind'] !== undefined) oneOf(raw['kind'], TRAIT_KINDS, `${where}[${index}].kind`);
  });
}

function checkStats(value: unknown, where: string): void {
  const raw = table(value, where);
  for (const stat of STAT_NAMES) {
    number(raw[stat], `${where}.${stat}`);
  }
}

function checkRegardMap(value: unknown, where: string): void {
  const raw = table(value, where);
  for (const [key, entry] of Object.entries(raw)) checkRegard(entry, `${where}.${key}`);
}

/**
 * One person on a Roster.
 *
 * @param employer which Regard they must carry. **Exactly one of the two**: a Hero holds
 * Regard for whoever employs them and never for both (E5 §4), and a document that says
 * otherwise is refused here rather than becoming a Hero the movement rules cannot read.
 */
function checkHero(value: unknown, where: string, employer: 'guild' | 'rival' = 'guild'): void {
  const raw = table(value, where);
  text(raw['id'], `${where}.id`);
  text(raw['name'], `${where}.name`);
  oneOf(raw['pronouns'], PRONOUNS, `${where}.pronouns`);
  checkStats(raw['stats'], `${where}.stats`);
  text(raw['background'], `${where}.background`);
  checkTraits(raw['traits'], `${where}.traits`);
  // Added in E5, and filled on load from the Stats they already have (`calibreOfStats`),
  // so a save from before a person carried one is given the calibre they had all along.
  optionalNumber(raw['calibre'], `${where}.calibre`);
  if (employer === 'guild') {
    checkRegard(raw['regardForGuildmaster'], `${where}.regardForGuildmaster`);
    if (raw['regardForRival'] !== undefined) {
      fail(`${where}.regardForRival is set on somebody in your own employ`);
    }
  } else {
    checkRegard(raw['regardForRival'], `${where}.regardForRival`);
    if (raw['regardForGuildmaster'] !== undefined) {
      fail(`${where}.regardForGuildmaster is set on somebody a Rival employs`);
    }
  }
  checkRegardMap(raw['regardFor'], `${where}.regardFor`);
  number(raw['joinedOn'], `${where}.joinedOn`);
  // Added in E2. A save written before them is read with `lastCommittedOn` from
  // `joinedOn` — what the Career would have carried had the field existed all along —
  // and `regardDecayedOn` from the Career's current Day, so drift is owed from the Day
  // this rule arrived rather than from a Day that may be decades stale (DL-15).
  optionalNumber(raw['lastCommittedOn'], `${where}.lastCommittedOn`);
  optionalNumber(raw['regardDecayedOn'], `${where}.regardDecayedOn`);
  // Added in E3. A save from before ages existed is filled with the age world generation
  // would have given this Hero, derived from the seed and their id rather than drawn, so
  // that loading the same document twice gives the same ages (DL-16 §1).
  optionalNumber(raw['age'], `${where}.age`);
  // Added in E4, and set only on somebody who walked out and was taken back on (E4-S4).
  optionalText(raw['formerHeroId'], `${where}.formerHeroId`);
  if (raw['exit'] !== undefined) {
    const exit = table(raw['exit'], `${where}.exit`);
    oneOf(exit['kind'], EXIT_KINDS, `${where}.exit.kind`);
    number(exit['onDay'], `${where}.exit.onDay`);
    text(exit['reason'], `${where}.exit.reason`);
  }
}

function checkCommission(value: unknown, where: string): void {
  const raw = table(value, where);
  text(raw['id'], `${where}.id`);
  text(raw['patronId'], `${where}.patronId`);
  text(raw['title'], `${where}.title`);
  number(raw['fee'], `${where}.fee`);
  number(raw['difficulty'], `${where}.difficulty`);
  number(raw['spanDays'], `${where}.spanDays`);
  number(raw['beatCount'], `${where}.beatCount`);
  textList(raw['tags'], `${where}.tags`);
  number(raw['postedOn'], `${where}.postedOn`);
  number(raw['expiresOn'], `${where}.expiresOn`);
}

function checkParty(value: unknown, where: string): void {
  const raw = table(value, where);
  text(raw['id'], `${where}.id`);
  text(raw['commissionId'], `${where}.commissionId`);
  checkCommission(raw['commission'], `${where}.commission`);
  textList(raw['heroIds'], `${where}.heroIds`);
  number(raw['backing'], `${where}.backing`);
  number(raw['departedOn'], `${where}.departedOn`);
  number(raw['returnsOn'], `${where}.returnsOn`);
  numberList(raw['beatDays'], `${where}.beatDays`);
  list(raw['beatsResolved'], `${where}.beatsResolved`).forEach((result, index) =>
    oneOf(result, BEAT_RESULTS, `${where}.beatsResolved[${index}]`),
  );
  textList(raw['vignettesUsed'], `${where}.vignettesUsed`);
  number(raw['score'], `${where}.score`);
  // Added in E6. A Party committed before Decisions existed has stopped for none and
  // carries no shift to its Beats, which is a complete Party and not a missing one.
  if (raw['decisionUsed'] !== undefined && typeof raw['decisionUsed'] !== 'boolean') {
    fail(`${where}.decisionUsed is not a boolean`);
  }
  optionalNumber(raw['dcDelta'], `${where}.dcDelta`);
  optionalNumber(raw['turnedBackOn'], `${where}.turnedBackOn`);
  if (raw['pendingWord'] !== undefined) {
    const word = table(raw['pendingWord'], `${where}.pendingWord`);
    text(word['decisionId'], `${where}.pendingWord.decisionId`);
    number(word['beatIndex'], `${where}.pendingWord.beatIndex`);
    number(word['askedOn'], `${where}.pendingWord.askedOn`);
    number(word['timesOutOn'], `${where}.pendingWord.timesOutOn`);
    textList(word['optionIds'], `${where}.pendingWord.optionIds`);
    const slots = table(word['slots'], `${where}.pendingWord.slots`);
    text(slots['heroId'], `${where}.pendingWord.slots.heroId`);
    text(slots['patronId'], `${where}.pendingWord.slots.patronId`);
    text(slots['sphereId'], `${where}.pendingWord.slots.sphereId`);
    optionalText(slots['trait'], `${where}.pendingWord.slots.trait`);
  }
}

/** One Applicant. Added in E4; a save from before them carries none at all. */
function checkApplicant(value: unknown, where: string): void {
  const raw = table(value, where);
  text(raw['id'], `${where}.id`);
  text(raw['name'], `${where}.name`);
  oneOf(raw['pronouns'], PRONOUNS, `${where}.pronouns`);
  checkStats(raw['stats'], `${where}.stats`);
  text(raw['background'], `${where}.background`);
  checkTraits(raw['traits'], `${where}.traits`);
  number(raw['age'], `${where}.age`);
  number(raw['calibre'], `${where}.calibre`);
  number(raw['askingFee'], `${where}.askingFee`);
  number(raw['arrivedOn'], `${where}.arrivedOn`);
  number(raw['expiresOn'], `${where}.expiresOn`);
  optionalText(raw['formerHeroId'], `${where}.formerHeroId`);
}

/**
 * The reckoning inside a finished Career. It is read straight back out by `cloneCareer`
 * and by the front ends, so an `ended` block that is a table but not a reckoning has to
 * be refused here rather than becoming a TypeError on the next call.
 */
function checkReckoning(value: unknown, where: string): void {
  const raw = table(value, where);
  for (const field of [
    'years',
    'heroesOnRoster',
    'heroesLost',
    'commissionsCompleted',
    'commissionsFailed',
    'peakCoin',
    'finalCoin',
    'standing',
  ]) {
    number(raw[field], `${where}.${field}`);
  }
  // Added in E3: a Career that ended before Retirement existed retired nobody.
  optionalNumber(raw['heroesRetired'], `${where}.heroesRetired`);
  // Added in E4: a Career that ended before Applicants existed recruited nobody.
  optionalNumber(raw['heroesRecruited'], `${where}.heroesRecruited`);
  // Added in E5: a Career that ended before Rivals had Rosters lost nobody to one.
  optionalNumber(raw['heroesPoachedFromUs'], `${where}.heroesPoachedFromUs`);
  const stats = table(raw['guildmasterStats'], `${where}.guildmasterStats`);
  checkStats(stats['start'], `${where}.guildmasterStats.start`);
  checkStats(stats['end'], `${where}.guildmasterStats.end`);
  if (raw['favouritePatron'] !== undefined) {
    const favourite = table(raw['favouritePatron'], `${where}.favouritePatron`);
    text(favourite['id'], `${where}.favouritePatron.id`);
    text(favourite['name'], `${where}.favouritePatron.name`);
    number(favourite['count'], `${where}.favouritePatron.count`);
  }
}

function checkGuild(value: unknown): void {
  const guild = table(value, 'guild');
  text(guild['name'], 'guild.name');
  const guildmaster = table(guild['guildmaster'], 'guild.guildmaster');
  text(guildmaster['name'], 'guild.guildmaster.name');
  oneOf(guildmaster['pronouns'], PRONOUNS, 'guild.guildmaster.pronouns');
  checkStats(guildmaster['stats'], 'guild.guildmaster.stats');
  checkStats(guildmaster['startingStats'], 'guild.guildmaster.startingStats');
  text(guildmaster['background'], 'guild.guildmaster.background');
  checkTraits(guildmaster['traits'], 'guild.guildmaster.traits');
  checkRegardMap(guildmaster['regardFor'], 'guild.guildmaster.regardFor');
  list(guild['roster'], 'guild.roster').forEach((hero, index) =>
    checkHero(hero, `guild.roster[${index}]`),
  );
  list(guild['formerHeroes'], 'guild.formerHeroes').forEach((hero, index) =>
    checkHero(hero, `guild.formerHeroes[${index}]`),
  );
  number(guild['coin'], 'guild.coin');
  // Narrowed to the three improvements in E3. Nothing E1 or E2 ever wrote carried an
  // entry here at all, so no document this engine produced is newly refused.
  list(guild['hall'], 'guild.hall').forEach((improvement, index) =>
    oneOf(improvement, HALL_IMPROVEMENTS, `guild.hall[${index}]`),
  );
}

function checkLedger(value: unknown): void {
  const ledger = table(value, 'ledger');
  number(ledger['commissionsCompleted'], 'ledger.commissionsCompleted');
  number(ledger['commissionsFailed'], 'ledger.commissionsFailed');
  const byPatron = table(ledger['commissionsByPatron'], 'ledger.commissionsByPatron');
  for (const [id, count] of Object.entries(byPatron)) {
    number(count, `ledger.commissionsByPatron.${id}`);
  }
  number(ledger['peakCoin'], 'ledger.peakCoin');
  if (typeof ledger['lastUpkeepNegative'] !== 'boolean') {
    fail('ledger.lastUpkeepNegative is missing or is not a boolean');
  }
  // Added in E2: a save from before Departure existed has none to count (DL-14).
  optionalNumber(ledger['departures'], 'ledger.departures');
  // Added in E3: a save from before harm and Retirement existed has none of those either.
  for (const field of ['heroesInjured', 'heroesScarred', 'heroesDied', 'heroesRetired']) {
    optionalNumber(ledger[field], `ledger.${field}`);
  }
  // Added in E4: nobody ever applied to a Guild written before Applicants existed.
  for (const field of ['applicantsSeen', 'applicantsAccepted', 'returners', 'returnersOffered']) {
    optionalNumber(ledger[field], `ledger.${field}`);
  }
  // Added in E5: no Hero ever crossed between Rosters before Rivals had one.
  for (const field of ['heroesTransferredIn', 'heroesPoachedIn', 'heroesPoachedFromUs']) {
    optionalNumber(ledger[field], `ledger.${field}`);
  }
  // Added in E6: no Party ever sent word before Decisions existed, and none turned back.
  for (const field of ['wordsSent', 'turnedBack']) {
    optionalNumber(ledger[field], `ledger.${field}`);
  }
}

/**
 * One past the highest `a<n>` any Applicant in this document carries, so that a save
 * written by hand, by a front end, or by an engine that had lost count can never mint an
 * id somebody is already holding (DL-19 §9).
 */
function countedApplicants(applicants: readonly unknown[]): number {
  let highest = 0;
  for (const entry of applicants) {
    const id = (entry as Record<string, unknown>)['id'];
    const found = typeof id === 'string' ? /^a(\d+)$/.exec(id) : null;
    const number = found === null ? 0 : Number(found[1]);
    if (Number.isFinite(number) && number > highest) highest = number;
  }
  return highest + 1;
}

/**
 * One past the highest `<rivalId>h<n>` anybody in this document carries, wherever they
 * are standing — a Rival's Roster, the player's own, or the Guild's history, because a
 * Transfer brings the id across with the person (E5-S2). The same defence
 * {@link countedApplicants} is, for the same reason.
 */
function countedRivalHeroes(raw: Record<string, unknown>): number {
  const guild = raw['guild'] as { roster?: unknown[]; formerHeroes?: unknown[] } | undefined;
  const rivals = (raw['rivals'] as { roster?: unknown[] }[] | undefined) ?? [];
  const everybody = [
    ...(guild?.roster ?? []),
    ...(guild?.formerHeroes ?? []),
    ...rivals.flatMap((rival) => rival.roster ?? []),
  ];
  let highest = 0;
  for (const entry of everybody) {
    const id = (entry as Record<string, unknown>)['id'];
    const found = typeof id === 'string' ? /^r\d+h(\d+)$/.exec(id) : null;
    const number = found === null ? 0 : Number(found[1]);
    if (Number.isFinite(number) && number > highest) highest = number;
  }
  return highest + 1;
}

/**
 * Fill in the fields a save written by an earlier engine does not carry, so that what
 * `cloneCareer` is handed is a whole world (DL-14). Only ever writes where the document
 * is silent; it never overrides what a save actually says.
 */
function fillFieldsAddedLater(raw: Record<string, unknown>): void {
  const config = raw['config'] as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(defaultConfig)) {
    if (config[key] === undefined) config[key] = fallback;
  }

  const guild = raw['guild'] as { roster: Record<string, unknown>[]; formerHeroes: Record<string, unknown>[] };
  // `regardDecayedOn` takes the Career's current Day, not `joinedOn`: a Hero idle since
  // before E2 existed must not be charged drift for the Days that passed before the rule
  // did (DL-15, correcting DL-14 §6, which had this fill from `joinedOn` and so charged a
  // long-idle Hero a Regard loss at the very next Board refresh). `lastCommittedOn` is
  // still safe to fill from `joinedOn`: the decay clock reads
  // `max(lastCommittedOn, regardDecayedOn)` (regard.ts, `decayRegard`), and
  // `regardDecayedOn` — now the load Day — is never smaller than `joinedOn`, so it is
  // always the one the `max` picks.
  const day = raw['day'] as number;
  // `age` takes the age this Hero would have been given at world generation, derived from
  // the Career's seed and their id rather than drawn from `career.rng` — so the fill is the
  // same number every time the document is loaded and the load advances no generator
  // (E3, DL-16 §1). Nothing about the Days already played is re-run, so a Hero who has
  // been on the Roster for years starts E3 at the age they joined at; ageing takes over
  // from the next year boundary.
  const settings = raw['config'] as unknown as GameConfig;
  const seed = raw['seed'] as string;
  const rivals = (raw['rivals'] as Record<string, unknown>[] | undefined) ?? [];
  // `calibre` (E5) takes the calibre the Stats a person already has would earn, which is
  // the same rule a returner's calibre is read back off (DL-19 §7). Nothing is generated
  // and nothing is drawn, so the fill is the same number every time the document loads.
  for (const hero of [
    ...guild.roster,
    ...guild.formerHeroes,
    ...rivals.flatMap((rival) => (rival['roster'] as Record<string, unknown>[] | undefined) ?? []),
  ]) {
    hero['lastCommittedOn'] ??= hero['joinedOn'];
    hero['regardDecayedOn'] ??= day;
    hero['age'] ??= startingAge(seed, hero['id'] as string, settings);
    hero['calibre'] ??= calibreOfStats(statTotal(hero['stats'] as Stats), settings);
  }

  // Added in E5. A Rival written before they had people is given a neutral opinion of the
  // Guild here and a Roster below, once the whole document is a Career again — so no Rival
  // is soured on the first Day after a load and nothing about the Board changes under the
  // player (DL-15's care about the first Day after loading).
  for (const rival of rivals) {
    rival['regardForGuild'] ??= {
      value: settings.rivalStartingRegard,
      reason: REASON_NOTHING_BETWEEN_YOU,
      nature: 'neutral',
    };
    rival['roster'] ??= [];
  }
  raw['nextRivalHeroNumber'] ??= countedRivalHeroes(raw);

  // Added in E4. A Career written before Applicants existed has nobody waiting, which is
  // a complete world and not a missing one; and the id counter is derived from the ids
  // the document actually carries rather than filled from zero, so an id can never be
  // handed out twice (DL-19 §9).
  raw['applicants'] ??= [];
  raw['nextApplicantNumber'] ??= countedApplicants(raw['applicants'] as unknown[]);

  const ledger = raw['ledger'] as Record<string, unknown>;
  ledger['departures'] ??= 0;
  ledger['heroesInjured'] ??= 0;
  ledger['heroesScarred'] ??= 0;
  ledger['heroesDied'] ??= 0;
  ledger['heroesRetired'] ??= 0;
  ledger['applicantsSeen'] ??= 0;
  ledger['applicantsAccepted'] ??= 0;
  ledger['returners'] ??= 0;
  ledger['returnersOffered'] ??= 0;
  ledger['heroesTransferredIn'] ??= 0;
  ledger['heroesPoachedIn'] ??= 0;
  ledger['heroesPoachedFromUs'] ??= 0;
  ledger['wordsSent'] ??= 0;
  ledger['turnedBack'] ??= 0;

  // Added in E6. A Party already away when a pre-E6 save was written has stopped for no
  // Decision and carries no shift to its Beats, so the first Day after the load is exactly
  // the Day it would have been (DL-15's care, DL-23 §13). Nothing fires at the load itself:
  // a Decision is only ever considered on a Beat Day after the Party's first.
  for (const party of (raw['parties'] as Record<string, unknown>[] | undefined) ?? []) {
    party['decisionUsed'] ??= false;
    party['dcDelta'] ??= 0;
  }

  const ended = raw['ended'] as { reckoning: Record<string, unknown> } | undefined;
  if (ended !== undefined) {
    ended.reckoning['heroesRetired'] ??= 0;
    ended.reckoning['heroesRecruited'] ??= 0;
    ended.reckoning['heroesPoachedFromUs'] ??= 0;
  }
}

/** Write a Career out as JSON. */
export function serialiseCareer(career: Career): string {
  return JSON.stringify(career, null, 2);
}

/**
 * Read a Career back. Refuses anything it cannot trust rather than loading a half-world,
 * and returns a Career holding only the fields the world is made of — a key a front end
 * stored beside its save is dropped here rather than carried a call further (DL-13).
 *
 * @param content when given, a Rival written before Rivals had people is populated here,
 * from a stream derived from the Career's seed and that Rival's id — so the same document
 * always loads to the same Rosters, and a save from E4 gets the Roster a Career on that
 * seed would have had (E5 §5). It is optional because architecture §6 gave this function
 * one argument and every save this engine has ever written still loads with one; a Career
 * loaded without it is populated the first time the engine is handed content, which is the
 * first `advance`, before any Day is stepped.
 * @throws SaveError on malformed JSON, a `formatVersion` this engine does not write, or
 * a document missing a field the world needs.
 */
export function deserialiseCareer(saved: string, content?: Content): Career {
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch (cause) {
    throw new SaveError(
      `this save cannot be loaded: it is not valid JSON (${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }

  const raw = table(parsed, 'the save');
  if (raw['formatVersion'] !== SAVE_FORMAT_VERSION) {
    // A document carrying no `formatVersion` at all said "it is format version undefined",
    // which names a JavaScript value rather than anything the player can act on, and both
    // front ends showed it (E8-S6 housekeeping). Said plainly instead.
    fail(
      raw['formatVersion'] === undefined
        ? `it carries no format version at all, and this engine writes version ${String(SAVE_FORMAT_VERSION)}`
        : `it is format version ${String(raw['formatVersion'])}, and this engine writes version ${String(SAVE_FORMAT_VERSION)}`,
    );
  }
  text(raw['seed'], 'seed');
  checkConfig(raw['config']);
  checkRng(raw['rng']);
  number(raw['day'], 'day');
  checkGuild(raw['guild']);
  list(raw['patrons'], 'patrons').forEach((patron, index) => {
    const entry = table(patron, `patrons[${index}]`);
    text(entry['id'], `patrons[${index}].id`);
    text(entry['name'], `patrons[${index}].name`);
    text(entry['sphere'], `patrons[${index}].sphere`);
    checkRegard(entry['regardForGuild'], `patrons[${index}].regardForGuild`);
  });
  list(raw['board'], 'board').forEach((commission, index) =>
    checkCommission(commission, `board[${index}]`),
  );
  list(raw['parties'], 'parties').forEach((party, index) => checkParty(party, `parties[${index}]`));
  list(raw['rivals'], 'rivals').forEach((rival, index) => {
    const entry = table(rival, `rivals[${index}]`);
    text(entry['id'], `rivals[${index}].id`);
    text(entry['name'], `rivals[${index}].name`);
    number(entry['standing'], `rivals[${index}].standing`);
    // Added in E5. A Rival written before they had people carries neither, and is given a
    // Roster and a neutral opinion of the Guild below; one that carries something that is
    // not a Roster is refused here.
    if (entry['roster'] !== undefined) {
      list(entry['roster'], `rivals[${index}].roster`).forEach((hero, at) =>
        checkHero(hero, `rivals[${index}].roster[${at}]`, 'rival'),
      );
    }
    if (entry['regardForGuild'] !== undefined) {
      checkRegard(entry['regardForGuild'], `rivals[${index}].regardForGuild`);
    }
  });
  // Added in E4. A document that does not carry them at all is filled below; one that
  // carries something that is not a list of Applicants is refused here.
  if (raw['applicants'] !== undefined) {
    list(raw['applicants'], 'applicants').forEach((applicant, index) =>
      checkApplicant(applicant, `applicants[${index}]`),
    );
  }
  optionalNumber(raw['nextApplicantNumber'], 'nextApplicantNumber');
  checkLedger(raw['ledger']);
  list(raw['recentCommissions'], 'recentCommissions').forEach((commission, index) =>
    checkCommission(commission, `recentCommissions[${index}]`),
  );
  if (raw['ended'] !== undefined) {
    const ended = table(raw['ended'], 'ended');
    oneOf(ended['reason'], END_REASONS, 'ended.reason');
    number(ended['onDay'], 'ended.onDay');
    checkReckoning(ended['reckoning'], 'ended.reckoning');
  }

  fillFieldsAddedLater(raw);

  // Copied field by field rather than handed back as parsed, so that anything a front
  // end stored alongside the Career is dropped here, at the boundary and on purpose,
  // instead of surviving until the next call happens to clone it (DL-13, F13).
  const career = cloneCareer(parsed as Career);
  if (content !== undefined) populateRivalRosters(career, content);
  return career;
}
