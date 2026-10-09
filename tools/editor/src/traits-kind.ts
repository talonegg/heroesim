// Traits, the editor's first kind (v1.1.4-S12, DL-150 items 7 to 12): two lists, the Guildmaster's in
// `guildmaster-traits.json` and the Hero's in `hero-traits.json`, keyed apart. A Trait's key is fixed
// once made (item 9); its name, effects, excludes and a Guildmaster Trait's cost change. The effects
// offered are each list's known kinds (item 8). An exclusion is held both ways, as the content's
// checks require, so the editor writes it into the other Trait too; a Trait removed is taken out of
// every other Trait's `excludes` (item 10). Its uses are found through the register
// (`content/src/uses/`), and a use is added or taken out there (`assign`, `unassign`, v1.1.4-S13,
// item 13), or changed in place (`update`, v1.1.6-S4, DL-186 item 14), where the register's entry says
// how, and only so.

import { guildmasterTraitEffects, heroTraitEffects, type EffectField } from '@heroesim/content';
import { contentEntries, rulesFor, traitFiles, usesOf, UseRefusal, type ContentEntry, type ContentJson, type TraitList, type TraitUse } from '@heroesim/content/uses';
import { encounterKinds } from '@heroesim/engine/content';
import type { EffectFieldForm, EffectForm, FieldForm, Kind, ListForm, Row, Rule, Use, UseChange, UseKind } from './kind.js';

const lists: Record<TraitList, { title: string }> = {
  guildmaster: { title: 'Guildmaster Traits' },
  hero: { title: 'Hero Traits' },
};

function isList(list: string): list is TraitList {
  return list === 'guildmaster' || list === 'hero';
}

function isObject(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The keys of a content file's rows, or none. */
function rowsOf(content: ContentJson, list: TraitList): Record<string, unknown> {
  const rows = content[traitFiles[list]];
  return isObject(rows) ? rows : {};
}

/** The Hero Stats' keys, and the Classes', as content defines them. */
function choicesOf(content: ContentJson): { heroStats: string[]; classes: string[] } {
  const stats = content['stats.json'];
  const heroStats = isObject(stats) ? Object.entries(stats).flatMap(([key, row]) => (isObject(row) && row.owner === 'hero' ? [key] : [])) : [];
  const classes = content['classes.json'];
  return { heroStats, classes: isObject(classes) ? Object.keys(classes) : [] };
}

/**
 * The forms of each list's effects (DL-150 item 8), each derived from content's description of its
 * kind's fields (DL-243), so a kind the engine adds, and content describes, is asked for here.
 */
function effectForms(content: ContentJson): Record<TraitList, EffectForm[]> {
  const { heroStats, classes } = choicesOf(content);
  const field = (name: string, described: EffectField): EffectFieldForm => {
    const { label } = described;
    const optional = described.optional === true ? { optional: true } : {};
    switch (described.type) {
      case 'key':
        return { name, label, type: 'choice', choices: described.of === 'classes' ? classes : heroStats, ...optional };
      case 'stat-changes':
        return { name, label, type: 'stat-changes', choices: heroStats, ...optional };
      case 'encounter-kinds':
        return { name, label, type: 'choices', choices: encounterKinds, ...optional };
      case 'integer':
      case 'number':
      case 'tags':
        return { name, label, type: described.type, ...optional };
    }
  };
  const forms = (kinds: Readonly<Record<string, { label: string; fields: object }>>): EffectForm[] =>
    Object.entries(kinds).map(([kind, { label, fields }]) => ({
      kind,
      label,
      fields: Object.entries(fields as Readonly<Record<string, EffectField>>).map(([name, described]) => field(name, described)),
    }));
  return { guildmaster: forms(guildmasterTraitEffects), hero: forms(heroTraitEffects) };
}

/** The register's content entry `id`, or the problem naming the entries there are. */
function entryOf(id: string): { entry: ContentEntry; problems: [] } | { entry: null; problems: string[] } {
  const entries = contentEntries();
  const entry = entries.find((each) => each.id === id);
  return entry === undefined ? { entry: null, problems: [`"${id}" is not a use the register lists: ${entries.map((each) => each.id).join(', ')}`] } : { entry, problems: [] };
}

/** The content with `change` made, and the use it added, if any; or the register's refusal as a problem. */
function changed(content: ContentJson, change: () => { change: Partial<Record<string, unknown>>; use?: TraitUse }): UseChange {
  try {
    const made = change();
    const added = made.use === undefined ? undefined : { ...made.use, blocksRemoval: contentEntries().find((entry) => entry.id === made.use?.entry)?.blocksRemoval ?? true };
    return { content: { ...content, ...made.change } as ContentJson, problems: [], ...(added === undefined ? {} : { added }) };
  } catch (error) {
    if (error instanceof UseRefusal) return { content: null, problems: [error.message] };
    throw error;
  }
}

const nameField: FieldForm = { name: 'name', label: 'Name', type: 'text', required: true };
const costField: FieldForm = { name: 'cost', label: 'Cost', type: 'integer', required: true };
const excludesField: FieldForm = { name: 'excludes', label: 'Excludes', type: 'keys', required: false };
const effectsField: FieldForm = { name: 'effects', label: 'Effects', type: 'effects', required: false };

/** Each list's fields, in the order its file holds them. */
const fieldsOf: Record<TraitList, FieldForm[]> = {
  guildmaster: [nameField, costField, excludesField, effectsField],
  hero: [nameField, excludesField, effectsField],
};

/** An effect's fields in its form's order, `kind` first; a field its form does not name is kept after, for the content's checks to refuse. */
function orderedEffect(effect: Row, forms: readonly EffectForm[]): Row {
  const form = forms.find((each) => each.kind === effect.kind);
  const order = ['kind', ...(form?.fields.map((field) => field.name) ?? [])];
  const ordered: Row = {};
  for (const name of order) if (Object.hasOwn(effect, name) && effect[name] !== undefined) ordered[name] = effect[name];
  for (const [name, value] of Object.entries(effect)) if (!Object.hasOwn(ordered, name) && value !== undefined) ordered[name] = value;
  return ordered;
}

function signed(value: unknown): string {
  return typeof value === 'number' && value > 0 ? `+${value}` : String(value);
}

/** An effect in a few words, its keys as content writes them. */
export function effectWords(effect: unknown): string {
  if (!isObject(effect)) return JSON.stringify(effect);
  switch (effect.kind) {
    case 'classStatBonus':
      return `${signed(effect.delta)} ${String(effect.statKey)} to each ${String(effect.classKey)}`;
    case 'guildMoraleShift':
      return `${signed(effect.delta)} Morale`;
    case 'upkeepFactor':
      return `Upkeep × ${String(effect.factor)}`;
    case 'statModifiers':
      return isObject(effect.modifiers)
        ? Object.entries(effect.modifiers)
            .map(([stat, delta]) => `${signed(delta)} ${stat}`)
            .join(', ')
        : 'Stat changes';
    case 'encounterBonus': {
      const kinds = Array.isArray(effect.kinds) && effect.kinds.length > 0 ? [`${effect.kinds.join(', ')} Encounters`] : [];
      const tags = Array.isArray(effect.tags) && effect.tags.length > 0 ? [`Encounters tagged ${effect.tags.join(', ')}`] : [];
      return `${signed(effect.flat)} to every Check of ${[...kinds, ...tags].join(' or ')}`;
    }
    default:
      return JSON.stringify(effect);
  }
}

export const traitsKind: Kind & UseKind = {
  name: 'traits',
  title: 'Traits',
  lists: (['guildmaster', 'hero'] as const).map((list) => ({ id: list, title: lists[list].title, file: traitFiles[list] })),

  forms(content): ListForm[] {
    const effects = effectForms(content);
    return (['guildmaster', 'hero'] as const).map((list) => ({ list, title: lists[list].title, fields: fieldsOf[list], effects: effects[list] }));
  },

  rowFrom(list, values, previous) {
    if (!isList(list)) return { row: {}, problems: [`"${list}" is not a list of Traits: guildmaster or hero`] };
    const problems: string[] = [];
    const row: Row = {};
    for (const field of fieldsOf[list]) {
      const given = Object.hasOwn(values, field.name) ? values[field.name] : undefined;
      const value = given === undefined ? previous?.[field.name] : given;
      switch (field.type) {
        case 'text':
          if (typeof value !== 'string' || value.trim() === '') problems.push(`${field.name}: a Trait has a name`);
          else row[field.name] = value.trim();
          break;
        case 'integer':
          if (typeof value !== 'number' || !Number.isInteger(value)) problems.push(`${field.name}: a whole number is wanted`);
          else row[field.name] = value;
          break;
        case 'keys':
          if (value === undefined) row[field.name] = [];
          else if (!Array.isArray(value) || !value.every((each) => typeof each === 'string')) problems.push(`${field.name}: a list of Traits' keys is wanted`);
          else row[field.name] = [...value];
          break;
        case 'effects':
          if (value === undefined) row[field.name] = [];
          else if (!Array.isArray(value) || !value.every(isObject)) problems.push(`${field.name}: a list of effects is wanted, each an object with its kind`);
          else row[field.name] = value;
          break;
      }
    }
    // An unknown field is named, for the content's checks would refuse it with less to go on.
    for (const name of Object.keys(values)) {
      if (!fieldsOf[list].some((field) => field.name === name)) problems.push(`${name}: not a field of a ${list === 'hero' ? 'Hero' : 'Guildmaster'} Trait`);
    }
    return { row, problems };
  },

  put(content, list, key, row) {
    if (!isList(list)) throw new Error(`"${list}" is not a list of Traits`);
    const next: Record<string, unknown> = { ...content };
    const rows = structuredClone(rowsOf(content, list));
    const before = isObject(rows[key]) ? rows[key] : undefined;
    const excludedBefore = Array.isArray(before?.excludes) ? (before.excludes as string[]) : [];
    const excludedAfter = row !== null && Array.isArray(row.excludes) ? (row.excludes as string[]) : [];
    if (row === null) delete rows[key];
    else {
      const forms = effectForms(content)[list];
      rows[key] = { ...row, effects: Array.isArray(row.effects) ? row.effects.map((effect) => (isObject(effect) ? orderedEffect(effect, forms) : effect)) : row.effects };
    }
    // An exclusion held both ways (DL-150 item 3): each Trait newly excluded excludes this one, and each no
    // longer excluded, or every one where this Trait goes, no longer does (item 10).
    for (const [other, otherRow] of Object.entries(rows)) {
      if (other === key || !isObject(otherRow) || !Array.isArray(otherRow.excludes)) continue;
      const theirs = otherRow.excludes as unknown[];
      const listsKey = theirs.includes(key);
      if (row !== null && excludedAfter.includes(other) && !listsKey) otherRow.excludes = [...theirs, key];
      else if ((row === null || (excludedBefore.includes(other) && !excludedAfter.includes(other))) && listsKey) {
        otherRow.excludes = theirs.filter((each) => each !== key);
      }
    }
    next[traitFiles[list]] = rows;
    return next as ContentJson;
  },

  uses(content, key): Use[] {
    const blocking = new Map(contentEntries().map((entry) => [entry.id, entry.blocksRemoval]));
    return usesOf(content, key).map((use) => ({ ...use, blocksRemoval: blocking.get(use.entry) ?? true }));
  },

  rules(list, row): Rule[] {
    if (!isList(list)) return [];
    const kinds = Array.isArray(row.effects) ? row.effects.flatMap((effect) => (isObject(effect) && typeof effect.kind === 'string' ? [effect.kind] : [])) : [];
    return rulesFor(list, kinds).map((entry) => ({ id: entry.id, title: entry.title, reads: entry.reads }));
  },

  words(_list, row) {
    return Array.isArray(row.effects) ? row.effects.map(effectWords) : [];
  },

  useEntries() {
    return contentEntries().map((entry) => ({
      id: entry.id,
      title: entry.title,
      lists: entry.lists,
      add: entry.add === null ? null : { how: entry.add.how, target: entry.add.target },
      remove: entry.remove === null ? null : { how: entry.remove.how },
      update: entry.update === null ? null : { how: entry.update.how, fields: entry.update.fields },
    }));
  },

  assign(content, key, id, target) {
    const { entry, problems } = entryOf(id);
    if (entry === null) return { content: null, problems };
    const add = entry.add;
    if (add === null) return { content: null, problems: [`the register says of ${id} that a use is not added there safely`] };
    // A field the entry does not name is named, for the register would pass it by.
    const unknown = Object.keys(target).filter((field) => !Object.hasOwn(add.target, field));
    if (unknown.length > 0) return { content: null, problems: unknown.map((field) => `${field}: not a field of ${id}'s target, which takes ${Object.keys(add.target).join(', ')}`) };
    return changed(content, () => add.apply(content, key, target));
  },

  unassign(content, key, id, at) {
    const { entry, problems } = entryOf(id);
    if (entry === null) return { content: null, problems };
    const remove = entry.remove;
    if (remove === null) return { content: null, problems: [`the register says of ${id} that a use is not taken out there safely`] };
    const use = entry.find(content, key).find((each) => each.at === at);
    if (use === undefined) return { content: null, problems: [`"${key}" has no use in ${id} at ${at}`] };
    return changed(content, () => ({ change: remove.apply(content, use) }));
  },

  update(content, key, id, at, values) {
    const { entry, problems } = entryOf(id);
    if (entry === null) return { content: null, problems };
    const update = entry.update;
    if (update === null) return { content: null, problems: [`the register says of ${id} that a use there is the key alone: unassign it and assign another`] };
    // A value the entry does not name is named, for the register would pass it by.
    const unknown = Object.keys(values).filter((field) => !Object.hasOwn(update.fields, field));
    if (unknown.length > 0) return { content: null, problems: unknown.map((field) => `${field}: not a value of ${id}'s use, which takes ${Object.keys(update.fields).join(', ')}`) };
    const use = entry.find(content, key).find((each) => each.at === at);
    if (use === undefined) return { content: null, problems: [`"${key}" has no use in ${id} at ${at}`] };
    return changed(content, () => ({ change: update.apply(content, use, values) }));
  },
};
