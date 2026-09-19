/**
 * Saves are snapshots of world state, never replayed event logs (ADR-0004). One
 * serialiser; the front ends differ only in where they put the text (DL-02).
 *
 * `deserialiseCareer(serialiseCareer(c))` deep-equals `c` for every reachable Career:
 * all state is plain JSON data and optional fields are omitted rather than set to
 * `undefined`, so nothing is lost on the way through.
 */

import { defaultConfig, type GameConfig } from './config.js';
import { SaveError } from './errors.js';
import type { RngState } from './rng.js';
import type { Career } from './types.js';

/** The `formatVersion` this engine writes and will load. */
export const SAVE_FORMAT_VERSION = 1;

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

function checkRng(value: unknown): RngState {
  const words = list(value, 'rng');
  if (words.length !== 4) fail('rng does not hold four words');
  words.forEach((word, index) => number(word, `rng[${index}]`));
  return value as RngState;
}

function checkConfig(value: unknown): GameConfig {
  const raw = table(value, 'config');
  for (const key of Object.keys(defaultConfig)) {
    number(raw[key], `config.${key}`);
  }
  return value as GameConfig;
}

function checkRegard(value: unknown, where: string): void {
  const raw = table(value, where);
  number(raw['value'], `${where}.value`);
  text(raw['reason'], `${where}.reason`);
  text(raw['nature'], `${where}.nature`);
}

function checkTraits(value: unknown, where: string): void {
  list(value, where).forEach((held, index) => {
    const raw = table(held, `${where}[${index}]`);
    text(raw['name'], `${where}[${index}].name`);
    number(raw['since'], `${where}[${index}].since`);
  });
}

function checkStats(value: unknown, where: string): void {
  const raw = table(value, where);
  for (const stat of ['Might', 'Craft', 'Nerve', 'Guile']) {
    number(raw[stat], `${where}.${stat}`);
  }
}

function checkRegardMap(value: unknown, where: string): void {
  const raw = table(value, where);
  for (const [key, entry] of Object.entries(raw)) checkRegard(entry, `${where}.${key}`);
}

function checkHero(value: unknown, where: string): void {
  const raw = table(value, where);
  text(raw['id'], `${where}.id`);
  text(raw['name'], `${where}.name`);
  text(raw['pronouns'], `${where}.pronouns`);
  checkStats(raw['stats'], `${where}.stats`);
  text(raw['background'], `${where}.background`);
  checkTraits(raw['traits'], `${where}.traits`);
  checkRegard(raw['regardForGuildmaster'], `${where}.regardForGuildmaster`);
  checkRegardMap(raw['regardFor'], `${where}.regardFor`);
  number(raw['joinedOn'], `${where}.joinedOn`);
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
  list(raw['tags'], `${where}.tags`);
  number(raw['postedOn'], `${where}.postedOn`);
  number(raw['expiresOn'], `${where}.expiresOn`);
}

function checkParty(value: unknown, where: string): void {
  const raw = table(value, where);
  text(raw['id'], `${where}.id`);
  text(raw['commissionId'], `${where}.commissionId`);
  checkCommission(raw['commission'], `${where}.commission`);
  list(raw['heroIds'], `${where}.heroIds`);
  number(raw['backing'], `${where}.backing`);
  number(raw['departedOn'], `${where}.departedOn`);
  number(raw['returnsOn'], `${where}.returnsOn`);
  list(raw['beatDays'], `${where}.beatDays`);
  list(raw['beatsResolved'], `${where}.beatsResolved`);
  list(raw['vignettesUsed'], `${where}.vignettesUsed`);
  number(raw['score'], `${where}.score`);
}

function checkGuild(value: unknown): void {
  const guild = table(value, 'guild');
  text(guild['name'], 'guild.name');
  const guildmaster = table(guild['guildmaster'], 'guild.guildmaster');
  text(guildmaster['name'], 'guild.guildmaster.name');
  text(guildmaster['pronouns'], 'guild.guildmaster.pronouns');
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
  list(guild['hall'], 'guild.hall');
}

function checkLedger(value: unknown): void {
  const ledger = table(value, 'ledger');
  number(ledger['commissionsCompleted'], 'ledger.commissionsCompleted');
  number(ledger['commissionsFailed'], 'ledger.commissionsFailed');
  table(ledger['commissionsByPatron'], 'ledger.commissionsByPatron');
  number(ledger['peakCoin'], 'ledger.peakCoin');
  if (typeof ledger['lastUpkeepNegative'] !== 'boolean') {
    fail('ledger.lastUpkeepNegative is missing or is not a boolean');
  }
}

/** Write a Career out as JSON. */
export function serialiseCareer(career: Career): string {
  return JSON.stringify(career, null, 2);
}

/**
 * Read a Career back. Refuses anything it cannot trust rather than loading a half-world.
 *
 * @throws SaveError on malformed JSON, a `formatVersion` this engine does not write, or
 * a document missing a field the world needs.
 */
export function deserialiseCareer(saved: string): Career {
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
    fail(
      `it is format version ${String(raw['formatVersion'])}, and this engine writes version ${String(SAVE_FORMAT_VERSION)}`,
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
  });
  checkLedger(raw['ledger']);
  list(raw['recentCommissions'], 'recentCommissions').forEach((commission, index) =>
    checkCommission(commission, `recentCommissions[${index}]`),
  );
  if (raw['ended'] !== undefined) {
    const ended = table(raw['ended'], 'ended');
    text(ended['reason'], 'ended.reason');
    number(ended['onDay'], 'ended.onDay');
    table(ended['reckoning'], 'ended.reckoning');
  }

  return parsed as Career;
}
