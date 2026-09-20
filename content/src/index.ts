/**
 * `@heroesim/content` — TOML text in, typed content out (DL-03). This entry point is
 * pure: it never touches the filesystem, so the browser bundle can import it. The Node
 * entry point (`@heroesim/content/node`) reads the directory for the CLI.
 *
 * The engine owns the shapes and the validation; this package only knows how the files
 * are laid out and how their TOML names map onto those shapes.
 */

import { parse as parseToml } from 'smol-toml';
import { ContentError, validateContent, type Content } from '@heroesim/engine';

export const PACKAGE_NAME = '@heroesim/content';

/** Where each part of the content lives, relative to the content directory. */
export const CONTENT_FILES = {
  traits: 'traits.toml',
  backgrounds: 'backgrounds.toml',
  spheres: 'spheres.toml',
  names: 'names.toml',
  /** One Vignette per file. */
  vignettes: 'vignettes/',
  /** One Decision per file (E6-S1). A content set with none is complete, not broken. */
  decisions: 'decisions/',
} as const;

/** The Vignette condition keys, which are snake_case on disk and camelCase in the contract. */
const CONDITION_KEYS: Readonly<Record<string, string>> = {
  min_beat: 'minBeat',
  max_beat: 'maxBeat',
  spheres: 'spheres',
  requires_trait: 'requiresTrait',
  tags: 'tags',
};

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFile(path: string, text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parseToml(text);
  } catch (cause) {
    throw new ContentError(
      `${path}: not valid TOML (${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }
  if (!isTable(parsed)) throw new ContentError(`${path}: the file is not a table`);
  return parsed;
}

function readRequired(files: Record<string, string>, path: string): Record<string, unknown> {
  const text = files[path];
  if (text === undefined) throw new ContentError(`${path}: the file is missing`);
  return parseFile(path, text);
}

/** Map a Vignette's `[conditions]` table from the snake_case on disk to the contract's names. */
function mapConditions(raw: unknown, path: string): Record<string, unknown> {
  if (raw === undefined) return {};
  if (!isTable(raw)) throw new ContentError(`${path}: [conditions] is not a table`);
  const conditions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapped = CONDITION_KEYS[key];
    if (mapped === undefined) {
      throw new ContentError(
        `${path}: [conditions].${key} is not a condition; expected one of ${Object.keys(CONDITION_KEYS).join(', ')}`,
      );
    }
    conditions[mapped] = value;
  }
  return conditions;
}

/** An option's `requires` keys, snake_case on disk and camelCase in the contract (E6-S1). */
const REQUIRES_KEYS: Readonly<Record<string, string>> = { min_coin: 'minCoin' };

/** An option's `effect` keys, on the same rule. */
const EFFECT_KEYS: Readonly<Record<string, string>> = {
  backing_delta: 'backingDelta',
  dc_delta: 'dcDelta',
  beats_remaining_delta: 'beatsRemainingDelta',
};

/**
 * Rename a small table's keys from the snake_case an author writes to the names the
 * contract uses, refusing anything that is not one of them — the same treatment, and the
 * same kind of named-field error, that a Vignette's `[conditions]` already gets.
 */
function mapKeys(
  raw: unknown,
  keys: Readonly<Record<string, string>>,
  path: string,
  what: string,
): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  if (!isTable(raw)) throw new ContentError(`${path}: ${what} is not a table`);
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const name = keys[key];
    if (name === undefined) {
      throw new ContentError(
        `${path}: ${what}.${key} is not one of ${Object.keys(keys).join(', ')}`,
      );
    }
    mapped[name] = value;
  }
  return mapped;
}

/** One option of a Decision, with its two nested tables renamed. */
function mapOption(raw: unknown, path: string, index: number): Record<string, unknown> {
  if (!isTable(raw)) throw new ContentError(`${path}: [[options]] ${index + 1} is not a table`);
  const option: Record<string, unknown> = { ...raw };
  const where = `[[options]] ${index + 1}`;
  const requires = mapKeys(raw['requires'], REQUIRES_KEYS, path, `${where}.requires`);
  if (requires === undefined) delete option['requires'];
  else option['requires'] = requires;
  const effect = mapKeys(raw['effect'], EFFECT_KEYS, path, `${where}.effect`);
  if (effect === undefined) delete option['effect'];
  else option['effect'] = effect;
  return option;
}

function filesUnder(files: Record<string, string>, directory: string): string[] {
  return Object.keys(files)
    .filter((path) => path.startsWith(directory) && path.endsWith('.toml'))
    .sort();
}

/**
 * Parse the content files and validate them.
 *
 * @param files file text by path relative to the content directory, e.g. `traits.toml`
 * and `vignettes/night-attack.toml`
 * @throws ContentError naming the file and field for anything malformed or missing
 */
export function parseContent(files: Record<string, string>): Content {
  const names = readRequired(files, CONTENT_FILES.names);
  const paths = filesUnder(files, CONTENT_FILES.vignettes);
  if (paths.length === 0) {
    throw new ContentError(`${CONTENT_FILES.vignettes}: no Vignette files were found`);
  }

  const vignettes = paths.map((path) => {
    const text = files[path];
    if (text === undefined) throw new ContentError(`${path}: the file is missing`);
    const raw = parseFile(path, text);
    return { ...raw, conditions: mapConditions(raw['conditions'], path) };
  });

  // A Decision reads the Commission and the Party exactly as a Vignette does, so its
  // `[conditions]` are mapped by the same function; its options carry two small tables of
  // their own (E6-S1). No Decision files at all is a complete content set: a Commission
  // with nothing eligible simply never stops to ask.
  const decisions = filesUnder(files, CONTENT_FILES.decisions).map((path) => {
    const text = files[path];
    if (text === undefined) throw new ContentError(`${path}: the file is missing`);
    const raw = parseFile(path, text);
    const options = Array.isArray(raw['options'])
      ? raw['options'].map((option, index) => mapOption(option, path, index))
      : raw['options'];
    return { ...raw, conditions: mapConditions(raw['conditions'], path), options };
  });

  return validateContent({
    traits: readRequired(files, CONTENT_FILES.traits)['traits'],
    backgrounds: readRequired(files, CONTENT_FILES.backgrounds)['backgrounds'],
    spheres: readRequired(files, CONTENT_FILES.spheres)['spheres'],
    names: {
      heroFirst: names['heroFirst'],
      heroEpithets: names['heroEpithets'],
      guildNames: names['guildNames'],
      rivalNames: names['rivalNames'],
    },
    vignettes,
    decisions,
  });
}
