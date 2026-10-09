// Portraits (v1.1.2-S3; DL-125 items 2 to 4; v1.1.3-S5, DL-134 items 5 and 7, DL-135 items 3 and 4):
// the pictures content lists by role and sex, and the one chosen to fit a person already drawn. A
// Portrait is a key, never a file: the page finds the picture by it in
// `media/portraits/guildmasters/<sex>/` or `media/portraits/heroes/<sex>/` and shows the Silhouette of the sex where it finds none or the key
// is `null`. No rule reads a Portrait or anything of its row: the picture follows the person, and
// never changes them (DL-134 item 1).

import type {
  AgeBand,
  CallingKey,
  ClassKey,
  ContentSet,
  PortraitAppearance,
  PortraitKey,
  PortraitRole,
  StationKey,
  TraitKey,
} from './content-types.js';
import { rowOf, type Hero, type Sex, type World } from './document.js';
import { pickOrNone, sexes, streamOf, type Stream } from './generators/draw.js';

/** The pictures of `role` and `sex` content lists, in its order; none where it lists none. */
export function portraitsOf(content: Pick<ContentSet, 'portraits'>, role: PortraitRole, sex: Sex): readonly PortraitKey[] {
  return content.portraits[role][sex];
}

/** The sex of the picture of `role` keyed `key`; `null` when content lists no such picture of that role. */
export function portraitSexOf(content: Pick<ContentSet, 'portraits'>, role: PortraitRole, key: PortraitKey): Sex | null {
  return sexes.find((sex) => portraitsOf(content, role, sex).includes(key)) ?? null;
}

/** A picture's row, what it shows of the person; `undefined` for a key with none, such as a Patron's picture. */
export function portraitRowOf(content: Pick<ContentSet, 'portraitAppearances'>, key: PortraitKey): PortraitAppearance | undefined {
  const rows = content.portraitAppearances.portraits;
  return rowOf(rows, key);
}

/** The roles a Portrait is chosen for: a Patron's picture has no row yet (DL-135 item 10). */
export type ChosenRole = Exclude<PortraitRole, 'patron'>;

/** The ages of an age band, whole years from `from` to `to`, the last band's to any age. */
export interface AgeSpan {
  key: string;
  from: number;
  to: number;
}

/**
 * The age band `age` falls in, with its ages (v1.1.2-S5's bands, `descriptions.json`'s `ageBands`):
 * the last whose `from` it has reached, to the next band's `from` less one, the last band's to any
 * age. Content's first band is from 0; with no band at all, one of every age.
 */
export function ageSpanOf(ageBands: readonly AgeBand[], age: number): AgeSpan {
  let index = 0;
  ageBands.forEach((band, at) => {
    if (age >= band.from) index = at;
  });
  const band = ageBands[index];
  if (band === undefined) return { key: '', from: 0, to: Number.POSITIVE_INFINITY };
  const after = ageBands[index + 1];
  return { key: band.key, from: band.from, to: after === undefined ? Number.POSITIVE_INFINITY : after.from - 1 };
}

/** Who a Portrait is chosen for: what of a person already drawn the choice reads. */
export interface PortraitPerson {
  sex: Sex;
  /** Whole years, the age they enter play at: its band must be one the picture's `apparentAge` reaches. */
  age: number;
  /** Their Traits: a Guildmaster's for the Callings, and either's for a Feature that shows one. */
  traitKeys: readonly TraitKey[];
  /** A Hero's Class, which must be among the picture's Classes; a Hero with none fits no picture. */
  classKey?: ClassKey;
  /** A Hero's Station, their Background's (DL-135 item 5): a picture of it is preferred, not required. */
  station?: StationKey;
}

/** Whether a picture's row keeps a preference for a person (`choosePortrait`). */
type Preference = (row: PortraitAppearance) => boolean;

/** The Calling rows of `callings` that content defines. */
function callingsOf(content: Pick<ContentSet, 'descriptions'>, callings: readonly CallingKey[]) {
  const defined = content.descriptions.callings;
  return callings.flatMap((key) => (Object.hasOwn(defined, key) && defined[key] !== undefined ? [{ key, ...defined[key] }] : []));
}

/**
 * The preferences in DL-135 item 3's order, those that apply to `role`: the age within `apparentAge`;
 * for a Guildmaster, no Calling that clashes with a Trait, then a Calling that suits one; for a Hero
 * with a Station, a picture of it; then a Feature that shows a Trait the person holds.
 */
function preferencesFor(content: Pick<ContentSet, 'descriptions' | 'portraitAppearances'>, role: ChosenRole, person: PortraitPerson): Preference[] {
  const holds = (keys: readonly TraitKey[]): boolean => keys.some((key) => person.traitKeys.includes(key));
  const features = content.portraitAppearances.features;
  const preferences: Preference[] = [({ apparentAge: [from, to] }) => person.age >= from && person.age <= to];
  if (role === 'guildmaster') {
    preferences.push(
      (row) => callingsOf(content, row.callings ?? []).every((calling) => !holds(calling.clashes)),
      (row) => callingsOf(content, row.callings ?? []).some((calling) => holds(calling.suits)),
    );
  }
  const { station } = person;
  if (role === 'hero' && station !== undefined) preferences.push((row) => row.station === station);
  preferences.push((row) => row.features.some((key) => Object.hasOwn(features, key) && holds(features[key]?.shows ?? [])));
  return preferences;
}

/**
 * The Portrait of a person already drawn (v1.1.3-S5; DL-134 item 5, DL-135 items 3 and 4), one
 * function for both roles:
 * 1. It keeps the pictures of `role` and the person's sex whose `apparentAge` reaches the band their
 *    age falls in (`ageSpanOf`), and for a Hero those whose Classes hold theirs. These must match.
 * 2. It removes those `inUse`. A Guildmaster never shares a picture, so with every fitting picture in
 *    use they have none; a Hero may repeat once every fitting picture is in use.
 * 3. It narrows by the preferences, in order (`preferencesFor`), each kept only while it leaves one
 *    or more, so a preference never empties the list.
 * 4. It takes one draw from `state`, whatever is left, none included (`pickOrNone`).
 *
 * `null`, the Silhouette of the sex, where no picture meets what must match, and for a Guildmaster
 * where every one that does is in use. A picture with no row fits no one. Exactly one draw from
 * `state` whatever is listed, chosen or left, so the pictures content holds never move a later draw
 * of the stream (`gm-portraits` for a Guildmaster, `hero-portraits` for a Hero, DL-142).
 */
export function choosePortrait(
  state: Stream,
  content: Pick<ContentSet, 'portraits' | 'portraitAppearances' | 'descriptions'>,
  role: ChosenRole,
  person: PortraitPerson,
  inUse: ReadonlySet<PortraitKey>,
): PortraitKey | null {
  const band = ageSpanOf(content.descriptions.ageBands, person.age);
  const rowOf = (key: PortraitKey): PortraitAppearance => portraitRowOf(content, key) as PortraitAppearance;
  const fitting = portraitsOf(content, role, person.sex).filter((key) => {
    const row = portraitRowOf(content, key);
    if (row === undefined) return false;
    const [from, to] = row.apparentAge;
    if (to < band.from || from > band.to) return false;
    return role !== 'hero' || (person.classKey !== undefined && (row.classes ?? []).includes(person.classKey));
  });
  const free = fitting.filter((key) => !inUse.has(key));
  let candidates = free.length > 0 || role === 'guildmaster' ? free : fitting;
  for (const prefer of preferencesFor(content, role, person)) {
    const kept = candidates.filter((key) => prefer(rowOf(key)));
    if (kept.length > 0) candidates = kept;
  }
  return pickOrNone(state, candidates);
}

/**
 * The pictures in use by Guildmasters (v1.1.3-S5, DL-135 item 4, DL-144 item 1): every living
 * Guildmaster's, retired or in office. The World State records no Guildmaster's death: a Guildmaster's
 * row is kept for good, a retired one's with `retiredOnTurn`, and a folded Guild's Guildmaster keeps
 * theirs. So every Guildmaster in the world is living, and holds their picture for good. A retiring
 * Guildmaster's is in use while their successor is chosen, as it is after.
 */
export function guildmasterPortraitsInUse(world: Pick<World, 'guildmasters'>): Set<PortraitKey> {
  const inUse = new Set<PortraitKey>();
  for (const guildmaster of Object.values(world.guildmasters)) {
    if (guildmaster.portraitKey !== null) inUse.add(guildmaster.portraitKey);
  }
  return inUse;
}

/**
 * The age a Guildmaster enters play at with a picture the player chose and the age left blank
 * (v1.1.3-S5, DL-134 item 7): `drawn`, drawn from `min` to `max`, moved arithmetically into the
 * picture's `apparentAge` held within those bounds, keeping its place in the range, with no further
 * draw. Where the picture's ages lie wholly outside the bounds, the bound nearest them.
 */
export function ageIntoPortrait(drawn: number, apparentAge: readonly [number, number], min: number, max: number): number {
  const [from, to] = apparentAge;
  const low = Math.max(from, min);
  const high = Math.min(to, max);
  if (low > high) return from > max ? max : min;
  const place = Math.min(Math.max(drawn, min), max) - min;
  return low + Math.floor((place * (high - low + 1)) / (max - min + 1));
}

/** A Calling of a picture that clashes with a Trait its Guildmaster holds (DL-134 item 4). */
export interface CallingClash {
  callingKey: CallingKey;
  traitKey: TraitKey;
}

/**
 * The Callings of the picture keyed `portraitKey` that clash with `traitKeys`, each with the Trait,
 * in the picture's order and then the Calling's; none for `null` or a picture with no row.
 */
export function callingClashes(
  content: Pick<ContentSet, 'portraitAppearances' | 'descriptions'>,
  portraitKey: PortraitKey | null,
  traitKeys: readonly TraitKey[],
): CallingClash[] {
  const row = portraitKey === null ? undefined : portraitRowOf(content, portraitKey);
  return callingsOf(content, row?.callings ?? []).flatMap((calling) =>
    calling.clashes.filter((traitKey) => traitKeys.includes(traitKey)).map((traitKey) => ({ callingKey: calling.key, traitKey })),
  );
}

/**
 * What a front end notes beside a Portrait that does not fit its Guildmaster (v1.1.3-S5, DL-134 item
 * 7), never a refusal: the picture looks older or younger than their age, or one of its Callings
 * clashes with one of their Traits.
 */
export type PortraitNote =
  | { kind: 'age'; portraitKey: PortraitKey; age: number; apparentAge: [from: number, to: number]; looks: 'older' | 'younger' }
  | ({ kind: 'calling-clash'; portraitKey: PortraitKey } & CallingClash);

/** The notes for a Guildmaster of `age` holding `traitKeys` with the picture `portraitKey`: none for `null` or a picture with no row. */
export function portraitNotes(
  content: Pick<ContentSet, 'portraitAppearances' | 'descriptions'>,
  portraitKey: PortraitKey | null,
  age: number,
  traitKeys: readonly TraitKey[],
): PortraitNote[] {
  const row = portraitKey === null ? undefined : portraitRowOf(content, portraitKey);
  if (portraitKey === null || row === undefined) return [];
  const [from, to] = row.apparentAge;
  const notes: PortraitNote[] = [];
  if (age < from || age > to) notes.push({ kind: 'age', portraitKey, age, apparentAge: [from, to], looks: age < from ? 'older' : 'younger' });
  for (const clash of callingClashes(content, portraitKey, traitKeys)) notes.push({ kind: 'calling-clash', portraitKey, ...clash });
  return notes;
}

/** The stream every Hero's Portrait is drawn from (ADR-0009; v1.1.3-S6). */
export const heroPortraitsStream = 'hero-portraits';

/**
 * The pictures in use by Heroes (v1.1.3-S6, DL-135 item 4): every Hero's on a Roster or in the
 * Unattached pool. A dead or retired Hero's, and one who has left the pool, are free again.
 */
export function heroPortraitsInUse(world: Pick<World, 'guilds' | 'heroes'>): Set<PortraitKey> {
  const inUse = new Set<PortraitKey>();
  const add = (hero: Hero | undefined): void => {
    if (hero?.portraitKey !== null && hero?.portraitKey !== undefined) inUse.add(hero.portraitKey);
  };
  for (const guild of Object.values(world.guilds)) {
    for (const heroId of guild.rosterIds) add(rowOf(world.heroes, heroId));
  }
  for (const hero of Object.values(world.heroes)) if (hero.unattachedSince !== null) add(hero);
  return inUse;
}

/**
 * Gives `hero`, as they are generated, their Portrait (v1.1.3-S6; DL-134 item 5, DL-135 items 3 to 5),
 * in exactly one draw from `hero-portraits`, whatever content lists: one chosen to fit them
 * (`choosePortrait`), whose Classes hold theirs, preferring one of their Background's Station and
 * one no Hero on a Roster or in the pool has (`heroPortraitsInUse`), a picture repeating once every
 * one that fits is in use; or `null`, the Silhouette, where none fits, as for every Hero while content
 * lists no Hero picture. Changes `hero` in place, before their texts are written, since the texts
 * follow the picture. `hero` is in the world or not; their own Portrait is `null` until now, so they
 * never count as in use.
 */
export function giveHeroPortrait(world: World, content: Pick<ContentSet, 'portraits' | 'portraitAppearances' | 'descriptions' | 'backgrounds'>, hero: Hero): void {
  const background = rowOf(content.backgrounds, hero.backgroundKey);
  const person: PortraitPerson = {
    sex: hero.sex,
    age: hero.ageAtEntry,
    traitKeys: hero.traits,
    classKey: hero.classKey,
    ...(background?.station === undefined ? {} : { station: background.station }),
  };
  // Only a Hero with a picture of their sex and Class needs the set, which reads every Hero: with none,
  // the one draw is spent whatever is in use.
  const ofClass = portraitsOf(content, 'hero', hero.sex).some((key) => (portraitRowOf(content, key)?.classes ?? []).includes(hero.classKey));
  const inUse = ofClass ? heroPortraitsInUse(world) : new Set<PortraitKey>();
  hero.portraitKey = choosePortrait(streamOf(world, heroPortraitsStream), content, 'hero', person, inUse);
}
