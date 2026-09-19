/**
 * Authored content, and the validator that admits it. The engine never reads a file: the
 * `content` package turns TOML text into the shapes below and hands them here, and
 * `validateContent` is the single gate that decides whether they are usable (DL-03).
 *
 * Every failure throws a {@link ContentError} naming the file, the id and the field.
 */

import { ContentError } from './errors.js';
import type { BeatResult, Stat } from './types.js';
import { STATS } from './types.js';

/** A named fact about a person that conditionally modifies a Check (ADR-0005). */
export interface TraitDef {
  name: string;
  /** `background` is what someone began with, `injury` lifts, `scar` never does. */
  kind: 'background' | 'disposition' | 'injury' | 'scar';
  summary: string;
  /** Applied when the Beat's Stat matches (if given) and any tag matches (if given). */
  modifiers: TraitModifier[];
  /** The Guildmaster-only contribution to a Party's Backing. Does nothing on a Hero. */
  backing?: number;
}

/** One conditional adjustment a Trait makes to a Check. */
export interface TraitModifier {
  /** Applies only to Checks against this Stat. Absent means any Stat. */
  stat?: Stat;
  /** Applies only when the Vignette carries one of these tags. Absent means any Vignette. */
  tags?: string[];
  /** What it adds to the Check's total. */
  delta: number;
}

/** The Traits a Hero or Guildmaster began with, before the Guild. */
export interface BackgroundDef {
  name: string;
  /** Names of TraitDefs. */
  traits: string[];
  summary: string;
}

/** The world a Patron's work comes from. */
export interface SphereDef {
  id: string;
  name: string;
  /** The Patrons who can be drawn from this Sphere. */
  patronNames: string[];
  /** The Commissions this Sphere posts. */
  commissionTitles: CommissionTitleDef[];
}

/** One Commission a Sphere can post. */
export interface CommissionTitleDef {
  title: string;
  /** The Commission's base DC. */
  difficulty: number;
  /** From the controlled tag set. Vignette selection matches against these. */
  tags: string[];
}

/** The pools names are drawn from. Patron names live on the Sphere they belong to. */
export interface NamePools {
  heroFirst: string[];
  heroEpithets: string[];
  guildNames: string[];
  rivalNames: string[];
}

/** When a Vignette may fire. Every condition given must hold. */
export interface VignetteConditions {
  /** Only from this Beat of the Commission onwards. Beats are numbered from one. */
  minBeat?: number;
  /** Only up to this Beat of the Commission. */
  maxBeat?: number;
  /** Only on Commissions from one of these Spheres, by Sphere id. */
  spheres?: string[];
  /** Only when a member of the Party holds this Trait. */
  requiresTrait?: string;
  /** Only on Commissions carrying one of these tags. */
  tags?: string[];
}

/** How the Vignette's Hero slot is filled from the Party. */
export type HeroSlotRule = 'any' | `with_trait:${string}` | `highest:${Stat}` | `lowest:${Stat}`;

/** What happens on one of the three outcomes. */
export interface VignetteOutcome {
  /** The template the `narrate` package fills. The engine never reads it (ADR-0002). */
  narrative: string;
  consequences: Consequence[];
}

/** An authored template for a Beat (ADR-0008). */
export interface Vignette {
  id: string;
  name: string;
  /** The Stat the Beat's Check is resolved against. */
  stat: Stat;
  /** The Vignette's own DC, before the Commission's difficulty shifts it. */
  difficulty: number;
  /** Relative likelihood of being picked among the candidates. Greater than zero. */
  weight: number;
  /** Tags describing the Beat. Trait modifiers match against these. */
  tags: string[];
  conditions: VignetteConditions;
  slots: { hero: HeroSlotRule };
  outcomes: Record<BeatResult, VignetteOutcome>;
}

/** What a Beat's outcome does to the world. A small closed vocabulary owned by the engine. */
export type Consequence =
  | { kind: 'coin'; delta: number }
  | { kind: 'patronRegard'; delta: number; reason: string }
  | { kind: 'heroRegardForGuildmaster'; delta: number; reason: string }
  | { kind: 'trait'; trait: string; days?: number }
  | { kind: 'score'; delta: number };

/** Everything the engine needs that was authored rather than generated. */
export interface Content {
  traits: TraitDef[];
  backgrounds: BackgroundDef[];
  spheres: SphereDef[];
  names: NamePools;
  vignettes: Vignette[];
}

/** The only tokens a narrative may carry. Anything else is a content error. */
export const NARRATIVE_TOKENS: readonly string[] = [
  'hero',
  'hero.they',
  'hero.them',
  'hero.their',
  'hero.is',
  'hero.has',
  'hero.moves',
  'patron',
  'sphere',
  'guildmaster',
  'commission',
  'trait',
];

const TRAIT_KINDS = ['background', 'disposition', 'injury', 'scar'] as const;
const BEAT_RESULTS: readonly BeatResult[] = ['failure', 'success', 'critical'];
const CONSEQUENCE_KINDS = [
  'coin',
  'patronRegard',
  'heroRegardForGuildmaster',
  'trait',
  'score',
] as const;

const TOKEN_PATTERN = /\{([^{}]*)\}/g;

function fail(where: string, message: string): never {
  throw new ContentError(`${where}: ${message}`);
}

function readTable(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(where, 'expected a table');
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(where, 'expected an array');
  return value;
}

function readString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(where, 'expected a non-empty string');
  return value;
}

function readNumber(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(where, 'expected a number');
  return value;
}

function readInteger(value: unknown, where: string): number {
  const number = readNumber(value, where);
  if (!Number.isInteger(number)) fail(where, 'expected a whole number');
  return number;
}

function readStringArray(value: unknown, where: string): string[] {
  return readArray(value, where).map((item, index) => readString(item, `${where}[${index}]`));
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  const text = readString(value, where);
  if (!(allowed as readonly string[]).includes(text)) {
    fail(where, `expected one of ${allowed.join(', ')}, not "${text}"`);
  }
  return text as T;
}

function requireUnique(names: readonly string[], where: string, what: string): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) fail(where, `${what} "${name}" is defined more than once`);
    seen.add(name);
  }
}

function readTraitDef(raw: unknown, index: number): TraitDef {
  const where = `traits.toml: traits[${index}]`;
  const table = readTable(raw, where);
  const name = readString(table['name'], `${where}.name`);
  const at = `traits.toml: trait "${name}"`;
  const def: TraitDef = {
    name,
    kind: readEnum(table['kind'], TRAIT_KINDS, `${at}.kind`),
    summary: readString(table['summary'], `${at}.summary`),
    modifiers: readArray(table['modifiers'] ?? [], `${at}.modifiers`).map((entry, position) => {
      const modifierAt = `${at}.modifiers[${position}]`;
      const modifierTable = readTable(entry, modifierAt);
      const modifier: TraitModifier = { delta: readNumber(modifierTable['delta'], `${modifierAt}.delta`) };
      if (modifierTable['stat'] !== undefined) {
        modifier.stat = readEnum(modifierTable['stat'], STATS, `${modifierAt}.stat`);
      }
      if (modifierTable['tags'] !== undefined) {
        modifier.tags = readStringArray(modifierTable['tags'], `${modifierAt}.tags`);
      }
      return modifier;
    }),
  };
  if (table['backing'] !== undefined) {
    def.backing = readNumber(table['backing'], `${at}.backing`);
  }
  return def;
}

function readBackgroundDef(raw: unknown, index: number, traitNames: ReadonlySet<string>): BackgroundDef {
  const where = `backgrounds.toml: backgrounds[${index}]`;
  const table = readTable(raw, where);
  const name = readString(table['name'], `${where}.name`);
  const at = `backgrounds.toml: background "${name}"`;
  const traits = readStringArray(table['traits'], `${at}.traits`);
  traits.forEach((trait, position) => {
    if (!traitNames.has(trait)) {
      fail(`${at}.traits[${position}]`, `no Trait named "${trait}" is defined in traits.toml`);
    }
  });
  return { name, traits, summary: readString(table['summary'], `${at}.summary`) };
}

function readSphereDef(raw: unknown, index: number): SphereDef {
  const where = `spheres.toml: spheres[${index}]`;
  const table = readTable(raw, where);
  const id = readString(table['id'], `${where}.id`);
  const at = `spheres.toml: sphere "${id}"`;
  const patronNames = readStringArray(table['patronNames'], `${at}.patronNames`);
  if (patronNames.length === 0) fail(`${at}.patronNames`, 'a Sphere needs at least one Patron name');
  requireUnique(patronNames, `${at}.patronNames`, 'Patron name');
  const commissionTitles = readArray(table['commissionTitles'], `${at}.commissionTitles`).map(
    (entry, position) => {
      const titleAt = `${at}.commissionTitles[${position}]`;
      const titleTable = readTable(entry, titleAt);
      return {
        title: readString(titleTable['title'], `${titleAt}.title`),
        difficulty: readInteger(titleTable['difficulty'], `${titleAt}.difficulty`),
        tags: readStringArray(titleTable['tags'], `${titleAt}.tags`),
      };
    },
  );
  if (commissionTitles.length === 0) {
    fail(`${at}.commissionTitles`, 'a Sphere needs at least one Commission title');
  }
  return { id, name: readString(table['name'], `${at}.name`), patronNames, commissionTitles };
}

function readNamePools(raw: unknown): NamePools {
  const at = 'names.toml';
  const table = readTable(raw, at);
  const pools: NamePools = {
    heroFirst: readStringArray(table['heroFirst'], `${at}.heroFirst`),
    heroEpithets: readStringArray(table['heroEpithets'], `${at}.heroEpithets`),
    guildNames: readStringArray(table['guildNames'], `${at}.guildNames`),
    rivalNames: readStringArray(table['rivalNames'], `${at}.rivalNames`),
  };
  for (const [key, values] of Object.entries(pools)) {
    if (values.length === 0) fail(`${at}.${key}`, 'the pool is empty');
  }
  return pools;
}

function readConsequence(raw: unknown, where: string, traitNames: ReadonlySet<string>): Consequence {
  const table = readTable(raw, where);
  const kind = readEnum(table['kind'], CONSEQUENCE_KINDS, `${where}.kind`);
  switch (kind) {
    case 'coin':
      return { kind: 'coin', delta: readNumber(table['delta'], `${where}.delta`) };
    case 'score':
      return { kind: 'score', delta: readNumber(table['delta'], `${where}.delta`) };
    case 'patronRegard':
      return {
        kind: 'patronRegard',
        delta: readNumber(table['delta'], `${where}.delta`),
        reason: readString(table['reason'], `${where}.reason`),
      };
    case 'heroRegardForGuildmaster':
      return {
        kind: 'heroRegardForGuildmaster',
        delta: readNumber(table['delta'], `${where}.delta`),
        reason: readString(table['reason'], `${where}.reason`),
      };
    default: {
      const trait = readString(table['trait'], `${where}.trait`);
      if (!traitNames.has(trait)) {
        fail(`${where}.trait`, `no Trait named "${trait}" is defined in traits.toml`);
      }
      const consequence: Consequence = { kind: 'trait', trait };
      if (table['days'] !== undefined) {
        consequence.days = readInteger(table['days'], `${where}.days`);
      }
      return consequence;
    }
  }
}

function readConditions(
  raw: unknown,
  at: string,
  sphereIds: ReadonlySet<string>,
  traitNames: ReadonlySet<string>,
): VignetteConditions {
  const table = readTable(raw ?? {}, `${at}.conditions`);
  const conditions: VignetteConditions = {};
  if (table['minBeat'] !== undefined) {
    conditions.minBeat = readInteger(table['minBeat'], `${at}.conditions.minBeat`);
  }
  if (table['maxBeat'] !== undefined) {
    conditions.maxBeat = readInteger(table['maxBeat'], `${at}.conditions.maxBeat`);
  }
  if (table['spheres'] !== undefined) {
    const spheres = readStringArray(table['spheres'], `${at}.conditions.spheres`);
    spheres.forEach((sphere, index) => {
      if (!sphereIds.has(sphere)) {
        fail(`${at}.conditions.spheres[${index}]`, `no Sphere with id "${sphere}" is defined in spheres.toml`);
      }
    });
    conditions.spheres = spheres;
  }
  if (table['requiresTrait'] !== undefined) {
    const trait = readString(table['requiresTrait'], `${at}.conditions.requiresTrait`);
    if (!traitNames.has(trait)) {
      fail(`${at}.conditions.requiresTrait`, `no Trait named "${trait}" is defined in traits.toml`);
    }
    conditions.requiresTrait = trait;
  }
  if (table['tags'] !== undefined) {
    conditions.tags = readStringArray(table['tags'], `${at}.conditions.tags`);
  }
  return conditions;
}

function readHeroSlotRule(raw: unknown, at: string, traitNames: ReadonlySet<string>): HeroSlotRule {
  const where = `${at}.slots.hero`;
  const rule = readString(raw, where);
  if (rule === 'any') return 'any';
  if (rule.startsWith('with_trait:')) {
    const trait = rule.slice('with_trait:'.length);
    if (!traitNames.has(trait)) {
      fail(where, `no Trait named "${trait}" is defined in traits.toml`);
    }
    return rule as HeroSlotRule;
  }
  for (const prefix of ['highest:', 'lowest:'] as const) {
    if (rule.startsWith(prefix)) {
      const stat = rule.slice(prefix.length);
      if (!(STATS as readonly string[]).includes(stat)) {
        fail(where, `"${stat}" is not one of ${STATS.join(', ')}`);
      }
      return rule as HeroSlotRule;
    }
  }
  fail(where, `expected "any", "with_trait:<Trait>", "highest:<Stat>" or "lowest:<Stat>", not "${rule}"`);
}

function checkNarrativeTokens(narrative: string, where: string, traitAllowed: boolean): void {
  for (const match of narrative.matchAll(TOKEN_PATTERN)) {
    const token = match[1] ?? '';
    if (!NARRATIVE_TOKENS.includes(token)) {
      fail(where, `"{${token}}" is not a narrative token; expected one of ${NARRATIVE_TOKENS.join(', ')}`);
    }
    if (token === 'trait' && !traitAllowed) {
      fail(
        where,
        '"{trait}" needs a with_trait:<Trait> Hero slot and a conditions.requiresTrait ' +
          'naming the same Trait; without both, the Hero the slot resolves to may not hold it',
      );
    }
  }
}

function readVignette(
  raw: unknown,
  index: number,
  sphereIds: ReadonlySet<string>,
  traitNames: ReadonlySet<string>,
): Vignette {
  const table = readTable(raw, `vignettes[${index}]`);
  const idValue = table['id'];
  const at =
    typeof idValue === 'string' && idValue.length > 0
      ? `vignettes/${idValue}.toml`
      : `vignettes[${index}]`;
  const id = readString(idValue, `${at}.id`);
  const conditions = readConditions(table['conditions'], at, sphereIds, traitNames);
  const slotRule = readHeroSlotRule(readTable(table['slots'], `${at}.slots`)['hero'], at, traitNames);
  // `{trait}` names the Trait the Beat turns on, and narration has nothing but the slot
  // to fill it from. `with_trait:X` falls back to any member of the Party when nobody
  // holds X, and a `requiresTrait` only promises that *somebody* in the Party holds it —
  // so neither alone keeps the promise the prose makes. Both together do: the condition
  // guarantees a holder exists and the slot guarantees the Beat goes to one (DL-13, F11).
  const traitAllowed =
    conditions.requiresTrait !== undefined && slotRule === `with_trait:${conditions.requiresTrait}`;

  const weight = readNumber(table['weight'], `${at}.weight`);
  if (weight <= 0) fail(`${at}.weight`, 'a weight must be greater than zero');

  const outcomesTable = readTable(table['outcomes'], `${at}.outcomes`);
  const outcomes = {} as Record<BeatResult, VignetteOutcome>;
  for (const result of BEAT_RESULTS) {
    const outcomeAt = `${at}.outcomes.${result}`;
    const outcomeTable = readTable(outcomesTable[result], outcomeAt);
    const narrative = readString(outcomeTable['narrative'], `${outcomeAt}.narrative`);
    checkNarrativeTokens(narrative, `${outcomeAt}.narrative`, traitAllowed);
    outcomes[result] = {
      narrative,
      consequences: readArray(outcomeTable['consequences'] ?? [], `${outcomeAt}.consequences`).map(
        (entry, position) => readConsequence(entry, `${outcomeAt}.consequences[${position}]`, traitNames),
      ),
    };
  }

  return {
    id,
    name: readString(table['name'], `${at}.name`),
    stat: readEnum(table['stat'], STATS, `${at}.stat`),
    difficulty: readInteger(table['difficulty'], `${at}.difficulty`),
    weight,
    tags: readStringArray(table['tags'] ?? [], `${at}.tags`),
    conditions,
    slots: { hero: slotRule },
    outcomes,
  };
}

/**
 * Admit parsed content, or refuse it with a {@link ContentError} naming the file and
 * field. Returns a clean copy: unknown keys are dropped and optional keys are omitted
 * rather than set to `undefined`.
 */
export function validateContent(raw: unknown): Content {
  const table = readTable(raw, 'content');

  const traits = readArray(table['traits'], 'traits.toml: traits').map(readTraitDef);
  if (traits.length === 0) fail('traits.toml: traits', 'no Traits are defined');
  requireUnique(
    traits.map((trait) => trait.name),
    'traits.toml: traits',
    'Trait',
  );
  const traitNames = new Set(traits.map((trait) => trait.name));

  const backgrounds = readArray(table['backgrounds'], 'backgrounds.toml: backgrounds').map(
    (entry, index) => readBackgroundDef(entry, index, traitNames),
  );
  if (backgrounds.length === 0) fail('backgrounds.toml: backgrounds', 'no Backgrounds are defined');
  requireUnique(
    backgrounds.map((background) => background.name),
    'backgrounds.toml: backgrounds',
    'Background',
  );

  const spheres = readArray(table['spheres'], 'spheres.toml: spheres').map(readSphereDef);
  if (spheres.length === 0) fail('spheres.toml: spheres', 'no Spheres are defined');
  requireUnique(
    spheres.map((sphere) => sphere.id),
    'spheres.toml: spheres',
    'Sphere id',
  );
  const sphereIds = new Set(spheres.map((sphere) => sphere.id));

  const names = readNamePools(table['names']);

  const vignettes = readArray(table['vignettes'], 'vignettes').map((entry, index) =>
    readVignette(entry, index, sphereIds, traitNames),
  );
  if (vignettes.length === 0) fail('vignettes', 'no Vignettes are defined');
  requireUnique(
    vignettes.map((vignette) => vignette.id),
    'vignettes',
    'Vignette id',
  );

  return { traits, backgrounds, spheres, names, vignettes };
}
