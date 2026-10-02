// The register of a Trait's uses (v1.1.4-S12, DL-150 item 14): every place a Trait's key can stand in
// content, and every rule of the engine and check of the content that reads a Trait. The content
// editor finds a key's uses through it (`tools/editor`), refuses to remove a Trait still used, and,
// where an entry says how, adds and removes a use (S13's `assign` and `unassign`). The drift test
// holds the engine entries to the code: a read of a Trait in `engine/src/` or `content/src/validate.ts`
// that no entry lists fails it. `docs/agents/traits.md`'s generated part is written from it (`doc.ts`),
// and the freshness test holds the two equal.
//
// A content entry works on the content as JSON (`json.ts`), as the files are written: a use is a key
// at a path of a file. An engine entry names the top-level declarations whose code reads a Trait
// (`sources`, which the drift test checks both ways) and those its rule runs through that read none
// themselves (`through`, which the drift test checks are there).

import type { ContentFileName } from '../parse.js';
import {
  at,
  copyOf,
  entriesOf,
  isObject,
  listAt,
  objectAt,
  pathsWhere,
  pathText,
  removeAt,
  setAt,
  UseRefusal,
  type ContentChange,
  type ContentJson,
  type JsonPath,
} from './json.js';

/** The two lists of Traits (DL-150 item 1). */
export type TraitList = 'guildmaster' | 'hero';

/** Each list's file. */
export const traitFiles: Readonly<Record<TraitList, 'guildmaster-traits.json' | 'hero-traits.json'>> = {
  guildmaster: 'guildmaster-traits.json',
  hero: 'hero-traits.json',
};

/** One use of a Trait's key in content: the entry that found it, and where it stands. */
export interface TraitUse {
  entry: string;
  file: ContentFileName;
  path: JsonPath;
  /** The place in words, as a refusal names it: `injuries.json: deep-cut.leavesTrait`. */
  at: string;
}

/** What an `add` is told: the fields its entry's `target` names, each as a string, a number or a path. */
export type UseTarget = Readonly<Record<string, unknown>>;

/** A place in content where a Trait's key stands. */
export interface ContentEntry {
  place: 'content';
  id: string;
  title: string;
  files: readonly ContentFileName[];
  /** Whose keys it holds. */
  lists: readonly TraitList[];
  /** What the key does there: which rule reads it. */
  reads: string;
  /** How a key's uses are found, in words. */
  finds: string;
  /** Whether a use keeps the Trait from being removed; other Traits' `excludes` do not, since the editor strips them (DL-150 item 10). */
  blocksRemoval: boolean;
  find(content: ContentJson, key: string): TraitUse[];
  /** How a use is added, where it is safe: the target's fields, and the change. `null` where it is not. */
  add: { how: string; target: Readonly<Record<string, string>>; apply(content: ContentJson, key: string, target: UseTarget): ContentChange } | null;
  /** How a use is removed, where it is safe. `null` where it is not. */
  remove: { how: string; apply(content: ContentJson, use: TraitUse): ContentChange } | null;
}

/** Top-level declarations of one source file, named from the repository's root. */
export interface SourcePlace {
  file: string;
  names: readonly string[];
}

/** A rule of the engine, or a check of the content, that reads a Trait. */
export interface EngineEntry {
  place: 'engine';
  id: string;
  title: string;
  /** Whose Traits it reads. */
  lists: readonly TraitList[];
  /** The kinds of effect it applies, if any. */
  effectKinds: readonly string[];
  /** The events it emits or names, if any. */
  events: readonly string[];
  /** What it reads, and what it does with it. */
  reads: string;
  /** The declarations whose code reads a Trait: the drift test's list. */
  sources: readonly SourcePlace[];
  /** The declarations the rule runs through that read no Trait themselves. */
  through: readonly SourcePlace[];
}

export type RegisterEntry = ContentEntry | EngineEntry;

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────

function use(entry: string, file: ContentFileName, path: JsonPath): TraitUse {
  return { entry, file, path, at: `${file}: ${pathText(path)}` };
}

/** A target's field, a non-empty string, or a refusal naming it. */
function named(target: UseTarget, field: string): string {
  const value = target[field];
  if (typeof value !== 'string' || value === '') throw new UseRefusal(`the target's ${field} is wanted`);
  return value;
}

/** A target's path, a list or a dotted string (`checks.0.score.1`), whose number-like steps are indices. */
function targetPath(target: UseTarget, field: string): JsonPath {
  const value = target[field];
  if (Array.isArray(value) && value.every((step) => typeof step === 'string' || typeof step === 'number')) return value as JsonPath;
  if (typeof value === 'string' && value !== '') return value.split('.').map((step) => (/^\d+$/.test(step) ? Number(step) : step));
  throw new UseRefusal(`the target's ${field} is wanted: a path such as checks.0.score.1`);
}

/** Whether a value is a Set Query (v1.1.4-S1): `"party"`, or a `where`, `top` or `bottom`. */
function isSetQuery(value: unknown): boolean {
  return value === 'party' || (Array.isArray(value) && ['where', 'top', 'bottom'].includes(value[0] as string));
}

/** Whether a value is `["has-trait", key]`. */
function hasTrait(key: string): (value: unknown) => boolean {
  return (value) => Array.isArray(value) && value.length === 2 && value[0] === 'has-trait' && value[1] === key;
}

/** The list a Trait's key is in, or a refusal. */
function listOf(content: ContentJson, key: string): TraitList {
  for (const list of ['guildmaster', 'hero'] as const) {
    const rows = content[traitFiles[list]];
    if (isObject(rows) && Object.hasOwn(rows, key)) return list;
  }
  throw new UseRefusal(`"${key}" is not a Trait`);
}

/**
 * The file `file` with `["has-trait", key]` at `path` taken out, where its Query keeps a meaning
 * without it: a `where` it filters is its Set unfiltered; an `and` or an `or` of three or more keeps
 * the rest, and of two becomes the other. Anywhere else it is refused, to be changed by hand.
 */
function withoutHasTrait(content: ContentJson, file: ContentFileName, path: JsonPath): ContentChange {
  const root = copyOf(content, file);
  const parentPath = path.slice(0, -1);
  const index = path.at(-1);
  const parent = at(root, parentPath);
  if (parentPath.length >= 2 && Array.isArray(parent) && typeof index === 'number') {
    const operator = parent[0];
    if (operator === 'where' && index === 2) {
      setAt(root, parentPath, parent[1], file);
      return { [file]: root };
    }
    if ((operator === 'and' || operator === 'or') && index > 0) {
      const rest = parent.filter((_, each) => each !== index);
      if (rest.length >= 3) setAt(root, parentPath, rest, file);
      else setAt(root, parentPath, rest[1], file);
      return { [file]: root };
    }
  }
  throw new UseRefusal(
    `${file}: ${pathText(path)} stands where its Query means something else without it; it is changed by hand, not taken out`,
  );
}

/** The file `file` with the Set Query at `path` filtered to the Heroes holding `key`: `["where", <Set>, ["has-trait", key]]`. */
function filteredByTrait(content: ContentJson, file: ContentFileName, path: JsonPath, key: string): ContentChange {
  const root = copyOf(content, file);
  const set = at(root, path);
  if (!isSetQuery(set)) throw new UseRefusal(`${file}: ${pathText(path)} is not a Set Query ("party", where, top or bottom)`);
  setAt(root, path, ['where', set, ['has-trait', key]], file);
  return { [file]: root };
}

// ── The content ────────────────────────────────────────────────────────────────────────────────

const excludes: ContentEntry = {
  place: 'content',
  id: 'excludes',
  title: "Other Traits' excludes",
  files: ['guildmaster-traits.json', 'hero-traits.json'],
  lists: ['guildmaster', 'hero'],
  reads: 'A Trait of the same list that this one excludes and that excludes it in return (DL-150 items 3 and 5): read by setup, the drawn Guildmaster, the earned Traits and the Injury Traits.',
  finds: "Each other Trait of the key's list whose `excludes` names the key.",
  blocksRemoval: false,
  find(content, key) {
    return (['guildmaster', 'hero'] as const).flatMap((list) =>
      entriesOf(content[traitFiles[list]]).flatMap(([other, row]) => {
        const listed = isObject(row) && Array.isArray(row.excludes) ? row.excludes : [];
        return other === key ? [] : listed.flatMap((each, index) => (each === key ? [use('excludes', traitFiles[list], [other, 'excludes', index])] : []));
      }),
    );
  },
  add: {
    how: "Each Trait's `excludes` names the other, both ways, as the content's checks hold.",
    target: { trait: "the other Trait's key, of the same list" },
    apply(content, key, target) {
      const other = named(target, 'trait');
      const list = listOf(content, key);
      if (listOf(content, other) !== list) throw new UseRefusal(`"${other}" is not of the same list as "${key}"`);
      if (other === key) throw new UseRefusal('a Trait cannot exclude itself');
      const file = traitFiles[list];
      const root = copyOf(content, file);
      for (const [one, two] of [[key, other], [other, key]] as const) {
        const listed = listAt(root, [one, 'excludes'], file);
        if (!listed.includes(two)) listed.push(two);
      }
      return { [file]: root };
    },
  },
  remove: {
    how: 'The key is taken out of that Trait\'s `excludes`, and that Trait out of the key\'s, both ways.',
    apply(content, found) {
      const root = copyOf(content, found.file);
      const other = found.path[0] as string;
      const key = at(root, found.path);
      if (typeof key !== 'string') throw new UseRefusal(`${found.at} is not there`);
      for (const [one, two] of [[other, key], [key, other]] as const) {
        const row = at(root, [one]);
        if (isObject(row) && Array.isArray(row.excludes)) row.excludes = row.excludes.filter((each) => each !== two);
      }
      return { [found.file]: root };
    },
  },
};

const injuryLeavesTrait: ContentEntry = {
  place: 'content',
  id: 'injury-leaves-trait',
  title: "An Injury's leavesTrait",
  files: ['injuries.json'],
  lists: ['hero'],
  reads: 'The Hero Trait an Injury leaves as it heals (R16), replacing any it conflicts with (DL-150 item 5): read by the Hero State Engine (`injury-traits`).',
  finds: 'Each Injury whose `leavesTrait` is the key.',
  blocksRemoval: true,
  find(content, key) {
    return entriesOf(content['injuries.json']).flatMap(([injury, row]) =>
      isObject(row) && row.leavesTrait === key ? [use('injury-leaves-trait', 'injuries.json', [injury, 'leavesTrait'])] : [],
    );
  },
  add: {
    how: "The Injury's `leavesTrait` is set to the key; an Injury that leaves another Trait is refused.",
    target: { injury: "the Injury's key" },
    apply(content, key, target) {
      const injury = named(target, 'injury');
      if (listOf(content, key) !== 'hero') throw new UseRefusal(`"${key}" is not a Hero Trait: an Injury leaves a Hero Trait`);
      const root = copyOf(content, 'injuries.json');
      const row = objectAt(root, [injury], 'injuries.json');
      if (row.leavesTrait !== null && row.leavesTrait !== undefined && row.leavesTrait !== key) {
        throw new UseRefusal(`injuries.json: ${injury} leaves "${String(row.leavesTrait)}" already`);
      }
      row.leavesTrait = key;
      return { 'injuries.json': root };
    },
  },
  remove: {
    how: "The Injury's `leavesTrait` is set to `null`: it leaves no Trait.",
    apply(content, found) {
      const root = copyOf(content, 'injuries.json');
      setAt(root, found.path, null, 'injuries.json');
      return { 'injuries.json': root };
    },
  },
};

/** The Degrees whose lists an Encounter's consequences may hold (v1.1.4-S2). */
const outcomeLists = ['triumph', 'success', 'setback', 'failure'] as const;

const encounterTraitConsequence: ContentEntry = {
  place: 'content',
  id: 'encounter-trait',
  title: "An Encounter's trait consequence",
  files: ['encounters.json'],
  lists: ['hero'],
  reads: 'A Trait earned on a Quest (DL-148 item 25): positive in a `triumph` list, granted on a strong success; negative in a `failure` list, on a Hero that Encounter injured. Read by the resolver (`earned-trait`).',
  finds: 'Each `{ "kind": "trait" }` consequence, in any of an Encounter\'s lists, whose `traitKey` is the key.',
  blocksRemoval: true,
  find(content, key) {
    return entriesOf(content['encounters.json']).flatMap(([encounter, row]) =>
      outcomeLists.flatMap((degree) => {
        const list = at(row, ['consequences', degree]);
        return (Array.isArray(list) ? list : []).flatMap((consequence, index) =>
          isObject(consequence) && consequence.kind === 'trait' && consequence.traitKey === key
            ? [use('encounter-trait', 'encounters.json', [encounter, 'consequences', degree, index])]
            : [],
        );
      }),
    );
  },
  add: {
    how:
      'A `{ "kind": "trait", "traitKey", "chance", "among"? }` is added at the end of the Encounter\'s `triumph` or `failure` list. An Encounter with no `triumph` list, whose Triumph reads its `success` list, is given one copied from it first, so a Triumph brings what it brought.',
    target: { encounter: "the Encounter's key", degree: '`triumph` (a positive Trait) or `failure` (a negative one)', chance: 'the chance, above 0 and at most 1', among: 'optional: a Set Query of who may take it' },
    apply(content, key, target) {
      const encounter = named(target, 'encounter');
      const degree = named(target, 'degree');
      if (degree !== 'triumph' && degree !== 'failure') throw new UseRefusal('the target\'s degree is "triumph" or "failure"');
      if (listOf(content, key) !== 'hero') throw new UseRefusal(`"${key}" is not a Hero Trait: an Encounter grants a Hero Trait`);
      const chance = target.chance;
      if (typeof chance !== 'number') throw new UseRefusal("the target's chance is wanted: a number");
      const root = copyOf(content, 'encounters.json');
      const consequences = objectAt(root, [encounter, 'consequences'], 'encounters.json');
      if (degree === 'triumph' && !Array.isArray(consequences.triumph)) consequences.triumph = structuredClone(Array.isArray(consequences.success) ? consequences.success : []);
      const list = listAt(root, [encounter, 'consequences', degree], 'encounters.json');
      list.push({ kind: 'trait', traitKey: key, chance, ...(target.among === undefined ? {} : { among: target.among }) });
      return { 'encounters.json': root };
    },
  },
  remove: {
    how: 'The consequence is taken out of its list.',
    apply(content, found) {
      const root = copyOf(content, 'encounters.json');
      removeAt(root, found.path, 'encounters.json');
      return { 'encounters.json': root };
    },
  },
};

const hasTraitRemoval = {
  how: 'Where it filters a `where`, the `where` becomes its Set unfiltered; in an `and` or `or`, it is taken out (one of two left stands alone). Anywhere else it is refused, to be changed by hand.',
  apply(content: ContentJson, found: TraitUse): ContentChange {
    return withoutHasTrait(content, found.file, found.path);
  },
};

const encounterHasTrait: ContentEntry = {
  place: 'content',
  id: 'encounter-has-trait',
  title: "has-trait in an Encounter's Queries",
  files: ['encounters.json'],
  lists: ['hero'],
  reads: "A `[\"has-trait\", key]` predicate in any Query of an Encounter: a Check's score, a harm's `among`, a trait consequence's `among`. Read by the Query evaluator (`has-trait`).",
  finds: 'Each `["has-trait", key]` anywhere in an Encounter.',
  blocksRemoval: true,
  find(content, key) {
    return entriesOf(content['encounters.json']).flatMap(([encounter, row]) =>
      pathsWhere(row, hasTrait(key), [encounter]).map((path) => use('encounter-has-trait', 'encounters.json', path)),
    );
  },
  add: {
    how: 'The Set Query at the path is filtered to the Heroes holding the key: `["where", <Set>, ["has-trait", key]]`.',
    target: { encounter: "the Encounter's key", path: 'the path, within the Encounter, of a Set Query: `checks.0.score.1`' },
    apply(content, key, target) {
      const encounter = named(target, 'encounter');
      if (listOf(content, key) !== 'hero') throw new UseRefusal(`"${key}" is not a Hero Trait: a Query reads a Hero's Traits`);
      return filteredByTrait(content, 'encounters.json', [encounter, ...targetPath(target, 'path')], key);
    },
  },
  remove: hasTraitRemoval,
};

const synergyHasTrait: ContentEntry = {
  place: 'content',
  id: 'synergy-has-trait',
  title: "has-trait in a Synergy's requires",
  files: ['synergies.json'],
  lists: ['hero'],
  reads: 'A `["has-trait", key]` predicate in a Synergy\'s conditions on the Party (DL-148 item 20). Read by the Query evaluator (`has-trait`).',
  finds: 'Each `["has-trait", key]` anywhere in a Synergy.',
  blocksRemoval: true,
  find(content, key) {
    return entriesOf(content['synergies.json']).flatMap(([synergy, row]) =>
      pathsWhere(row, hasTrait(key), [synergy]).map((path) => use('synergy-has-trait', 'synergies.json', path)),
    );
  },
  add: {
    how: 'With a path, the Set Query there is filtered as an Encounter\'s is. Without one, the condition `[">=", ["count", ["where", "party", ["has-trait", key]]], 1]` is added to `requires`, which must be written as Queries.',
    target: { synergy: "the Synergy's key", path: 'optional: the path, within the Synergy, of a Set Query' },
    apply(content, key, target) {
      const synergy = named(target, 'synergy');
      if (listOf(content, key) !== 'hero') throw new UseRefusal(`"${key}" is not a Hero Trait: a Query reads a Hero's Traits`);
      if (target.path !== undefined) return filteredByTrait(content, 'synergies.json', [synergy, ...targetPath(target, 'path')], key);
      const root = copyOf(content, 'synergies.json');
      const requires = at(root, [synergy, 'requires']);
      if (!Array.isArray(requires)) throw new UseRefusal(`synergies.json: ${synergy}.requires is in the old form; write it as Queries first`);
      requires.push(['>=', ['count', ['where', 'party', ['has-trait', key]]], 1]);
      return { 'synergies.json': root };
    },
  },
  remove: hasTraitRemoval,
};

/** Where a list's Biography sentences by Trait stand in `descriptions.json`. */
const biographyPlace: Readonly<Record<TraitList, JsonPath>> = { guildmaster: ['biography', 'traits'], hero: ['heroBiography', 'traits'] };

const biographySentences: ContentEntry = {
  place: 'content',
  id: 'biography-sentences',
  title: 'Biography sentences by Trait',
  files: ['descriptions.json'],
  lists: ['guildmaster', 'hero'],
  reads: "The sentences a Biography draws for a Trait held: a Guildmaster's under `biography.traits`, a Hero's under `heroBiography.traits` (v1.1.3-S1). Read by the Biography (`biography-and-portrait`).",
  finds: "The key's list of sentences under `biography.traits` or `heroBiography.traits`.",
  blocksRemoval: true,
  find(content, key) {
    return (['guildmaster', 'hero'] as const).flatMap((list) =>
      Array.isArray(at(content['descriptions.json'], [...biographyPlace[list], key])) ? [use('biography-sentences', 'descriptions.json', [...biographyPlace[list], key])] : [],
    );
  },
  add: {
    how: "The sentence is added at the end of the key's list, under its own list's place, which is made where there is none.",
    target: { sentence: 'the sentence, with the slots a Biography fills: `{He}`, `{his}`' },
    apply(content, key, target) {
      const sentence = named(target, 'sentence');
      const place = biographyPlace[listOf(content, key)];
      const root = copyOf(content, 'descriptions.json');
      const byTrait = objectAt(root, place, 'descriptions.json');
      const sentences = Array.isArray(byTrait[key]) ? byTrait[key] : (byTrait[key] = []);
      if (sentences.includes(sentence)) throw new UseRefusal(`descriptions.json: ${pathText([...place, key])} holds that sentence already`);
      sentences.push(sentence);
      return { 'descriptions.json': root };
    },
  },
  remove: {
    how: "The key's list of sentences is taken out, every sentence in it.",
    apply(content, found) {
      const root = copyOf(content, 'descriptions.json');
      removeAt(root, found.path, 'descriptions.json');
      return { 'descriptions.json': root };
    },
  },
};

const portraitCallings: ContentEntry = {
  place: 'content',
  id: 'portrait-callings',
  title: "A Calling's suits and clashes",
  files: ['descriptions.json'],
  lists: ['guildmaster'],
  reads: "A Guildmaster Trait a picture's Calling suits or clashes with (v1.1.3-S1, DL-134 item 4). Read by the Portrait choice (`biography-and-portrait`).",
  finds: 'Each Calling whose `suits` or `clashes` names the key.',
  blocksRemoval: true,
  find(content, key) {
    return entriesOf(at(content['descriptions.json'], ['callings'])).flatMap(([calling, row]) =>
      (['suits', 'clashes'] as const).flatMap((side) => {
        const listed = at(row, [side]);
        return (Array.isArray(listed) ? listed : []).flatMap((each, index) => (each === key ? [use('portrait-callings', 'descriptions.json', ['callings', calling, side, index])] : []));
      }),
    );
  },
  add: {
    how: "The key is added at the end of the Calling's `suits` or `clashes`; one already in the other is refused.",
    target: { calling: "the Calling's key", side: '`suits` or `clashes`' },
    apply(content, key, target) {
      const calling = named(target, 'calling');
      const side = named(target, 'side');
      if (side !== 'suits' && side !== 'clashes') throw new UseRefusal('the target\'s side is "suits" or "clashes"');
      if (listOf(content, key) !== 'guildmaster') throw new UseRefusal(`"${key}" is not a Guildmaster Trait: a Calling suits or clashes with a Guildmaster Trait`);
      const root = copyOf(content, 'descriptions.json');
      const row = objectAt(root, ['callings', calling], 'descriptions.json');
      const other = side === 'suits' ? 'clashes' : 'suits';
      if (Array.isArray(row[other]) && row[other].includes(key)) throw new UseRefusal(`descriptions.json: callings.${calling}.${other} names "${key}" already`);
      const listed = Array.isArray(row[side]) ? row[side] : (row[side] = []);
      if (!listed.includes(key)) listed.push(key);
      return { 'descriptions.json': root };
    },
  },
  remove: {
    how: 'The key is taken out of that list.',
    apply(content, found) {
      const root = copyOf(content, 'descriptions.json');
      removeAt(root, found.path, 'descriptions.json');
      return { 'descriptions.json': root };
    },
  },
};

const portraitFeatures: ContentEntry = {
  place: 'content',
  id: 'portrait-features',
  title: "A Feature's shows",
  files: ['portrait-appearances.json'],
  lists: ['hero'],
  reads: "A Hero Trait a picture's Feature shows, a scar Scarred (v1.1.3-S1): a Hero holding it is given a picture with it. Read by the Portrait choice (`biography-and-portrait`).",
  finds: 'Each Feature whose `shows` names the key.',
  blocksRemoval: true,
  find(content, key) {
    return entriesOf(at(content['portrait-appearances.json'], ['features'])).flatMap(([feature, row]) => {
      const listed = at(row, ['shows']);
      return (Array.isArray(listed) ? listed : []).flatMap((each, index) => (each === key ? [use('portrait-features', 'portrait-appearances.json', ['features', feature, 'shows', index])] : []));
    });
  },
  add: {
    how: "The key is added at the end of the Feature's `shows`, which is made where there is none.",
    target: { feature: "the Feature's key" },
    apply(content, key, target) {
      const feature = named(target, 'feature');
      if (listOf(content, key) !== 'hero') throw new UseRefusal(`"${key}" is not a Hero Trait: a Feature shows a Hero Trait`);
      const root = copyOf(content, 'portrait-appearances.json');
      const row = objectAt(root, ['features', feature], 'portrait-appearances.json');
      const listed = Array.isArray(row.shows) ? row.shows : (row.shows = []);
      if (!listed.includes(key)) listed.push(key);
      return { 'portrait-appearances.json': root };
    },
  },
  remove: {
    how: "The key is taken out of the Feature's `shows`, and `shows` with it once empty.",
    apply(content, found) {
      const root = copyOf(content, 'portrait-appearances.json');
      removeAt(root, found.path, 'portrait-appearances.json');
      const row = at(root, found.path.slice(0, -2));
      if (isObject(row) && Array.isArray(row.shows) && row.shows.length === 0) delete row.shows;
      return { 'portrait-appearances.json': root };
    },
  },
};

// ── The engine, and the content's checks ─────────────────────────────────────────────────────

const engine = (entry: Omit<EngineEntry, 'place' | 'effectKinds' | 'events' | 'through'> & Partial<Pick<EngineEntry, 'effectKinds' | 'events' | 'through'>>): EngineEntry => ({
  place: 'engine',
  effectKinds: [],
  events: [],
  through: [],
  ...entry,
});

const engineEntries: readonly EngineEntry[] = [
  engine({
    id: 'trait-lists',
    title: "The two lists, and a key's Trait",
    lists: ['guildmaster', 'hero'],
    reads: 'A Trait by its key, in either list or in its own (rule 5: a key no list defines bears on nothing); the Guildmaster Traits in order, for setup and the draw.',
    sources: [
      { file: 'engine/src/traits.ts', names: ['traitOf', 'heroTraitOf', 'heroTraitEffects', 'excludedPair'] },
      { file: 'engine/src/guildmaster.ts', names: ['guildmasterTraitsOf'] },
    ],
    through: [{ file: 'engine/src/traits.ts', names: ['excludeEachOther'] }],
  }),
  engine({
    id: 'effective-stats',
    title: "A Hero Trait's Stat changes, in effectiveStats",
    lists: ['hero'],
    effectKinds: ['statModifiers'],
    reads: "The sum of the `statModifiers` of the Hero Traits a Hero holds, added to the base beside the Guildmaster's Class bonus and gear, so it shows wherever a Stat shows: every Check, Query, harm share, the estimate and a Hero's page (DL-148 item 24).",
    sources: [
      { file: 'engine/src/traits.ts', names: ['traitStatModifiers'] },
      { file: 'engine/src/selectors.ts', names: ['effectiveStats'] },
    ],
  }),
  engine({
    id: 'encounter-bonus',
    title: "The Check's Encounter bonus",
    lists: ['hero'],
    effectKinds: ['encounterBonus'],
    reads: "The `flat` of each `encounterBonus` of a Hero Trait any Hero still in the sequence holds, once for the Party, on an Encounter of its `kinds` or `tags`, added to every Check's capability but a raw one's (DL-148 item 26).",
    sources: [
      { file: 'engine/src/traits.ts', names: ['traitEncounterBonus'] },
      { file: 'engine/src/quest-engine/check.ts', names: ['capability'] },
    ],
  }),
  engine({
    id: 'guildmaster-effects',
    title: "The Guildmaster's Trait readers",
    lists: ['guildmaster'],
    effectKinds: ['classStatBonus', 'guildMoraleShift', 'upkeepFactor'],
    reads: "Each effect of the Guildmaster's Traits: a Class Stat bonus in `effectiveStats`, a Morale shift in the Morale baseline, an Upkeep factor in Upkeep (DL-43, DL-150 item 8).",
    sources: [
      { file: 'engine/src/guildmaster.ts', names: ['traitEffects', 'traitMoraleShift', 'traitUpkeepFactor', 'traitStatBonuses'] },
      { file: 'engine/src/morale.ts', names: ['moraleBaselineFor'] },
      { file: 'engine/src/selectors.ts', names: ['upkeepParts', 'effectiveStats'] },
    ],
  }),
  engine({
    id: 'guildmaster-setup',
    title: "Setup's Trait budget, and the drawn Guildmaster's Traits",
    lists: ['guildmaster'],
    reads: "A Guildmaster Trait's `cost` against `guildmasterTraitBudget`, at most `guildmasterTraitsMax` of them, no two of which exclude each other: refused at setup (`setupRefusal`), drawn whole for a Rival and for \"Choose for me\" (DL-102, DL-110).",
    sources: [
      { file: 'engine/src/create.ts', names: ['guildmasterTraitCost', 'setupRefusal', 'previewGuildmaster'] },
      { file: 'engine/src/generators/guilds.ts', names: ['drawTraits', 'legalTraitSets'] },
    ],
  }),
  engine({
    id: 'injury-traits',
    title: "The Hero State Engine's Injury Traits",
    lists: ['hero'],
    events: ['hero.trait-lost'],
    reads: "An Injury's `leavesTrait`, given as it heals, replacing each Trait held that it excludes or that excludes it, each with `hero.trait-lost` (R16, DL-150 item 5).",
    sources: [
      { file: 'engine/src/phases/hero-state.ts', names: ['heal'] },
      { file: 'engine/src/traits.ts', names: ['replacedBy'] },
    ],
  }),
  engine({
    id: 'earned-trait',
    title: 'The earned-Trait consequence',
    lists: ['hero'],
    events: ['hero.trait-gained'],
    reads: "A `trait` consequence: drawn on a Triumph and granted on a strong success, or falling on a Hero the Encounter injured on a Failure; never one held, one in conflict, or a second on a Quest. Granted at the Quest's end with `hero.trait-gained` (DL-148 item 25).",
    sources: [
      { file: 'engine/src/quest-engine/resolve.ts', names: ['apply', 'earn'] },
      { file: 'engine/src/phases/quests-conclude.ts', names: ['conclude'] },
      { file: 'engine/src/traits.ts', names: ['mayEarn'] },
    ],
  }),
  engine({
    id: 'trait-events',
    title: 'hero.trait-gained and hero.trait-lost',
    lists: ['hero'],
    events: ['hero.trait-gained', 'hero.trait-lost'],
    reads: 'The two Trait events, both Milestones (DL-148 item 27, DL-150 item 5), emitted by `earned-trait` and `injury-traits`; the front ends word them.',
    sources: [
      { file: 'engine/src/events.ts', names: ['milestoneTypes'] },
      { file: 'engine/src/phases/hero-state.ts', names: ['heal'] },
      { file: 'engine/src/phases/quests-conclude.ts', names: ['conclude'] },
    ],
  }),
  engine({
    id: 'has-trait',
    title: 'has-trait in a Query',
    lists: ['hero'],
    reads: 'The `["has-trait", key]` predicate: whether the current Hero holds a Hero Trait content defines (v1.1.4-S1), and its account for the Board.',
    sources: [
      { file: 'engine/src/quest-engine/query.ts', names: ['is'] },
      { file: 'engine/src/quest-engine/describe.ts', names: ['predAccount'] },
    ],
  }),
  engine({
    id: 'biography-and-portrait',
    title: 'The Biography and the Portrait choice',
    lists: ['guildmaster', 'hero'],
    reads: "A person's Traits: a Biography draws a sentence for each Trait held, and a picture is chosen whose Calling suits their Guildmaster Traits and clashes with none, or whose Features show their Hero Traits (v1.1.3-S1).",
    sources: [
      { file: 'engine/src/descriptions.ts', names: ['write', 'describeBlanks', 'describeHero', 'describeNewHero'] },
      { file: 'engine/src/portraits.ts', names: ['giveHeroPortrait'] },
      { file: 'engine/src/generators/guilds.ts', names: ['givePortrait'] },
      { file: 'engine/src/create.ts', names: ['previewGuildmaster'] },
    ],
    through: [{ file: 'engine/src/portraits.ts', names: ['preferencesFor', 'callingsOf', 'callingClashes'] }],
  }),
  engine({
    id: 'document-validator',
    title: "The document validator's Traits",
    lists: ['guildmaster', 'hero'],
    reads: "A person's Traits in a saved document: a key their list does not define (`unknown-trait`), and two of which one excludes the other (`excluded-traits`), each a warning.",
    sources: [{ file: 'engine/src/validate.ts', names: ['unknownTrait', 'excludedTraits'] }],
  }),
  engine({
    id: 'content-checks',
    title: "The content's checks",
    lists: ['guildmaster', 'hero'],
    effectKinds: ['classStatBonus', 'guildMoraleShift', 'upkeepFactor', 'statModifiers', 'encounterBonus'],
    reads: "Every Trait and every use of one in content (`validateContent`): a key in one list only, exclusions held both ways, each effect's values, and each key a use names defined in its list. The editor checks each pending edit with them.",
    sources: [
      {
        file: 'content/src/validate.ts',
        names: [
          'validateContent',
          'checkPortraitAppearances',
          'longestDescriptions',
          'checkDescriptions',
          'checkEncounters',
          'checkConsequence',
          'checkTraits',
          'operators',
          'queryKeys',
          'queryArgument',
        ],
      },
    ],
  }),
];

/**
 * The engine's Trait helpers: the declarations whose job is to read a Trait. A call or other
 * reference of one is a read of a Trait for the drift test, as the lists and kinds themselves are
 * (the verification of v1.1.4-S12), so a rule that reads a Trait only through a helper is listed too.
 * The rules that call those rules in turn (every caller of `effectiveStats`, say) are not: they read
 * Stats, not Traits.
 */
export const traitHelpers: readonly SourcePlace[] = [
  {
    file: 'engine/src/traits.ts',
    names: ['traitOf', 'excludeEachOther', 'excludedPair', 'heroTraitOf', 'heroTraitEffects', 'traitStatModifiers', 'traitEncounterBonus', 'mayEarn', 'replacedBy'],
  },
  { file: 'engine/src/guildmaster.ts', names: ['guildmasterTraitsOf', 'traitEffects', 'traitMoraleShift', 'traitUpkeepFactor', 'traitStatBonuses'] },
  { file: 'engine/src/create.ts', names: ['guildmasterTraitCost'] },
];

/** Every place a Trait is used, in content and in the engine (DL-150 item 14). */
export const register: readonly RegisterEntry[] = [
  excludes,
  injuryLeavesTrait,
  encounterTraitConsequence,
  encounterHasTrait,
  synergyHasTrait,
  biographySentences,
  portraitCallings,
  portraitFeatures,
  ...engineEntries,
];

/** The register's content entries. */
export function contentEntries(entries: readonly RegisterEntry[] = register): ContentEntry[] {
  return entries.filter((entry): entry is ContentEntry => entry.place === 'content');
}

/** The register's engine entries. */
export function engineEntriesOf(entries: readonly RegisterEntry[] = register): EngineEntry[] {
  return entries.filter((entry): entry is EngineEntry => entry.place === 'engine');
}

/** Every use of `key` in `content`, entry by entry in the register's order. */
export function usesOf(content: ContentJson, key: string, entries: readonly RegisterEntry[] = register): TraitUse[] {
  return contentEntries(entries).flatMap((entry) => entry.find(content, key));
}

/** The engine entries that read a Trait of `list` whose effects are of `kinds`: its list's readers that read every Trait of it, or one of those kinds. */
export function rulesFor(list: TraitList, kinds: readonly string[], entries: readonly RegisterEntry[] = register): EngineEntry[] {
  return engineEntriesOf(entries).filter((entry) => entry.lists.includes(list) && (entry.effectKinds.length === 0 || entry.effectKinds.some((kind) => kinds.includes(kind))));
}
