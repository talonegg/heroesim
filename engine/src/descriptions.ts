// A Guildmaster described (v1.1.2-S5; DL-125 item 6, DL-126 item 2, DL-127): the Birthplace, the
// Appearance and the Biography written from content's `descriptions`, on request at setup
// (`describeGuildmaster`) and for every blank when a Guildmaster enters play (`describeBlanks`), the
// player's, a founding or replacing Rival's, or a successor's, on the stream `descriptions`. No rule
// reads the texts.
//
// A description takes the same draws whatever it writes: one for the Birthplace, one for each of the
// Appearance's seven slots and one for `mark` or `bearing`, and one for each of the Biography's six
// parts, fifteen in all, each a pick from a list or a spent draw where the list is empty
// (`pickOrNone`). So a text given, a picture mapped or a part with no sentence never moves a later
// draw, and the Guildmasters after it are described as they would have been.
//
// With a picture (v1.1.3-S5, DL-134 item 6), the Biography follows it in the same draws: the origin
// is drawn from its Station's sentences, the career from its Callings' at the band together with its
// hooks, and the closing from its Temper's, each from the band's where its own list is empty. With no
// picture, each is the band's, as before.
//
// The content validator proves that nothing written here passes `descriptiveAttributeMaxLength`,
// taking the Appearance and the Biography to be made as they are below
// (`content/src/kinds/descriptions.ts`'s `longestDescriptions`): a change to how they are joined is a change
// there too.

import type { EngineDeps } from './config.js';
import type {
  AppearancePhrases,
  BackgroundKey,
  ClassKey,
  ContentSet,
  DescriptionSlot,
  Descriptions,
  PortraitKey,
  TraitKey,
} from './content-types.js';
import { rowOf, type DescriptiveAttribute, type Guildmaster, type Hero, type Sex, type World } from './document.js';
import { pickOrNone, streamOf, type Stream } from './generators/draw.js';
import { ageSpanOf, portraitRowOf } from './portraits.js';
import { createStreams } from './rng.js';

/** The stream every description is drawn from (ADR-0009; v1.1.2-S5). */
export const descriptionsStream = 'descriptions';

/**
 * How many of a Guildmaster's Traits their Biography gives a sentence: the first two in their order,
 * as many as a Guildmaster holds by default (`guildmasterTraitsMax`). The content validator reads it.
 */
export const biographyTraitSentences = 2;

/** A Guildmaster's three descriptive Attributes, as written. */
export type GuildmasterDescription = Record<DescriptiveAttribute, string>;

/** What a description is written for: who the Guildmaster is, and their Guild's Background. */
export interface DescriptionFacts {
  sex: Sex;
  /** Whole years, the age they enter play at: it chooses the age band. */
  age: number;
  /** Their Guild's Background: the Biography's sentence for it, if content has one. */
  backgroundKey: BackgroundKey;
  /** Their Traits, in order: the first `biographyTraitSentences` have a sentence each, if content has one. */
  traitKeys: readonly TraitKey[];
  /**
   * Their Portrait: a mapped picture's narrative is the Appearance, as written (DL-127 item 4), and
   * its Station, Callings, hooks and Temper choose the Biography's origin, career and closing
   * (v1.1.3-S5, DL-134 item 6).
   */
  portraitKey: PortraitKey | null;
  /**
   * Whether they succeeded to the Guild's chair rather than founding the Guild (v1.1.2-S6): their
   * Biography then has a successor's sentence in the Background's place, drawn in the same draw.
   */
  successor?: boolean;
}

/** The Appearance's slots in the order they are written, `mark` and `bearing` last, one of the two. */
const writtenSlots = ['build', 'face', 'hair', 'facialHair', 'eyes'] as const satisfies readonly DescriptionSlot[];
const lastSlots = ['mark', 'bearing'] as const satisfies readonly DescriptionSlot[];

/**
 * An Appearance drawn whole from the phrases of `sex` and `band` (v1.1.2-S5): one phrase of each of
 * `build`, `face`, `hair`, `facialHair` (a male's) and `eyes`, then `mark` or `bearing`, joined by
 * spaces. Eight draws whatever the lists hold (`pickOrNone`): one a slot, and one for the last.
 * A Guildmaster's and a Hero's are drawn alike (v1.1.3-S6, DL-135 item 6).
 */
function drawAppearance(state: Stream, descriptions: Descriptions, sex: Sex, band: string): string {
  const phrases: Partial<AppearancePhrases> = Object.hasOwn(descriptions.appearance[sex], band) ? (descriptions.appearance[sex][band] ?? {}) : {};
  const parts = writtenSlots.map((slot) => pickOrNone(state, phrases[slot] ?? []));
  const lasts = lastSlots.map((slot) => pickOrNone(state, phrases[slot] ?? []));
  const last = pickOrNone(state, lasts);
  return [...parts, last].filter((part) => part !== null).join(' ');
}

/** `text` with each slot filled: a pronoun's by `sex`'s word, `{birthplace}` by the Birthplace, its full stop dropped. */
function filled(text: string, descriptions: Descriptions, sex: Sex, birthplace: string): string {
  const place = birthplace.replace(/[.!?]+$/, '');
  return text.replace(/\{([^{}]*)\}/g, (slot, name: string) =>
    name === 'birthplace' ? place : Object.hasOwn(descriptions.pronouns[sex], name) ? (descriptions.pronouns[sex][name] ?? slot) : slot,
  );
}

/**
 * The three texts for `facts`, each drawn from `state` in fifteen draws whatever is kept (above),
 * then `given`'s kept where it is written: a text given is kept, trimmed; a blank one is written. The
 * Biography's `{birthplace}` is the Birthplace kept, given or written. With a mapped picture, the
 * Appearance is its narrative, as written (DL-127 item 4), and the Biography's origin, career and
 * closing are drawn from its Station's, its Callings' at the band with its hooks, and its Temper's
 * sentences, each the band's where its own are none (DL-134 item 6); otherwise the Appearance is drawn
 * whole and those three are the band's.
 */
function write(state: Stream, content: Pick<ContentSet, 'descriptions' | 'portraitAppearances'>, facts: DescriptionFacts, given: Partial<GuildmasterDescription> = {}): GuildmasterDescription {
  const { descriptions } = content;
  const band = ageSpanOf(descriptions.ageBands, facts.age).key;
  const kept = (text: string | undefined): string | null => {
    const trimmed = (text ?? '').trim();
    return trimmed === '' ? null : trimmed;
  };

  const drawnPlace = pickOrNone(state, descriptions.birthplaces) ?? '';
  const birthplace = kept(given.birthplace) ?? drawnPlace;

  const drawnAppearance = drawAppearance(state, descriptions, facts.sex, band);
  const mapped = facts.portraitKey === null ? undefined : portraitRowOf(content, facts.portraitKey);
  const appearance = kept(given.appearance) ?? (mapped === undefined ? drawnAppearance : mapped.narrative.trim());

  const { biography: sentences } = descriptions;
  const listed = <T>(lists: Readonly<Record<string, T>>, key: string | undefined): T | undefined =>
    key !== undefined ? rowOf(lists, key) : undefined;
  /** The picture's own sentences, or the band's where it has none or there is no picture. */
  const ownElseBand = (own: readonly string[] | undefined, byBand: Readonly<Record<string, string[]>>): readonly string[] =>
    own !== undefined && own.length > 0 ? own : (listed(byBand, band) ?? []);
  const origins = ownElseBand(mapped === undefined ? undefined : listed(sentences.stationOrigins, mapped.station), sentences.origins);
  const careers = ownElseBand(
    mapped === undefined
      ? undefined
      : [...(mapped.callings ?? []).flatMap((calling) => listed(listed(sentences.callingCareers, calling) ?? {}, band) ?? []), ...mapped.hooks],
    sentences.careers,
  );
  const closings = ownElseBand(mapped === undefined ? undefined : listed(sentences.temperClosings, mapped.temper), sentences.closings);
  const traitKeys = Array.from({ length: biographyTraitSentences }, (_, index) => facts.traitKeys[index]);
  const drawnBiography = [
    pickOrNone(state, origins),
    pickOrNone(state, careers),
    pickOrNone(state, facts.successor === true ? sentences.successors : (listed(sentences.backgrounds, facts.backgroundKey) ?? [])),
    ...traitKeys.map((key) => pickOrNone(state, listed(sentences.traits, key) ?? [])),
    pickOrNone(state, closings),
  ]
    .filter((sentence) => sentence !== null)
    .map((sentence) => filled(sentence, descriptions, facts.sex, birthplace))
    .join(' ');
  const biography = kept(given.biography) ?? drawnBiography;

  return { birthplace, appearance, biography };
}

/** What `describeGuildmaster` writes for: a Guildmaster's facts, a seed, and how many times it is asked again. */
export interface DescribeRequest extends DescriptionFacts {
  /** A world's seed: a front end gives the Seed field's, so the texts follow it. */
  seed: string;
  /**
   * How many times "Again" has been asked, a whole number from 0. At 0 the texts are those a new
   * game from `seed` writes for its player's Guildmaster left blank; each `n` after is another.
   */
  n: number;
  /**
   * The texts the player has given, each kept as `createWorld` keeps it (v1.1.2-S6): a Birthplace given
   * is the Birthplace, and the Biography's. A blank one is written. The draws are the same whatever is
   * given.
   */
  given?: Partial<GuildmasterDescription>;
}

/**
 * A Guildmaster's Birthplace, Appearance and Biography written from content (v1.1.2-S5, DL-125
 * item 6), for a front end's "Write them for me" and "Again". Pure: the same for the same inputs.
 *
 * It draws from a stream of its own, seeded by `seed` and `n`: with `n` 0, the stream a world from
 * `seed` begins with as `descriptions`, whose first draws describe the player's Guildmaster; with each
 * `n` after, one seeded by `seed` and the name `descriptions-<n>`, which no world draws from. So the
 * first writing is what "Start the game" would write for the three left blank, and "Again" moves
 * nothing a game draws.
 *
 * Throws on a programming error: an `n` that is not a whole number from 0.
 */
export function describeGuildmaster(request: DescribeRequest, deps: Pick<EngineDeps, 'content'>): GuildmasterDescription {
  const { seed, n, given, ...facts } = request;
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`"Again" is asked a whole number of times from 0; got ${n}`);
  const name = n === 0 ? descriptionsStream : `${descriptionsStream}-${n}`;
  const state = createStreams(seed, [name])[name] as Stream;
  return write(state, deps.content, facts, given);
}

/**
 * Writes each of `guildmaster`'s descriptive Attributes left blank (v1.1.2-S5, DL-125 item 6), as
 * they enter play, from the world's `descriptions` stream; a text written is kept. Their Guild's
 * Background is `backgroundKey`; a successor's Biography has a successor's sentence in its place
 * (`options.successor`, v1.1.2-S6). Takes the same fifteen draws whatever it writes, so the
 * Guildmasters described after are described as they would have been. Changes `guildmaster` in place.
 */
export function describeBlanks(
  world: World,
  deps: Pick<EngineDeps, 'content'>,
  guildmaster: Guildmaster,
  backgroundKey: BackgroundKey,
  options: { successor?: boolean } = {},
): void {
  const written = write(
    streamOf(world, descriptionsStream),
    deps.content,
    {
      sex: guildmaster.sex,
      age: guildmaster.ageAtEntry,
      backgroundKey,
      traitKeys: guildmaster.traits,
      portraitKey: guildmaster.portraitKey,
      successor: options.successor === true,
    },
    { birthplace: guildmaster.birthplace, appearance: guildmaster.appearance, biography: guildmaster.biography },
  );
  Object.assign(guildmaster, written);
}

// ── A Hero described (v1.1.3-S6, DL-135 item 6) ──────────────────────────────────────────────

/** The stream every Hero's Appearance and Biography are drawn from (ADR-0009; v1.1.3-S6). */
export const heroDescriptionsStream = 'hero-descriptions';

/**
 * How many of a Hero's Traits their Biography gives a sentence: the first two in their order, as many
 * as a Guildmaster's (v1.1.3-S1). The content validator reads it.
 */
export const heroBiographyTraitSentences = 2;

/**
 * How many draws `describeHero` takes, whatever it writes: eight for the Appearance (`drawAppearance`)
 * and one for each of the Biography's five parts, the Background's, the Class's, the two Traits' and
 * the closing.
 */
export const heroDescriptionDraws = 8 + 3 + heroBiographyTraitSentences;

/** A Hero's two descriptive Attributes: a Hero has no Birthplace, since their Background says where they are from. */
export type HeroDescription = Pick<Record<DescriptiveAttribute, string>, 'appearance' | 'biography'>;

/** What a Hero's texts are written from: who the Hero is, and their Portrait. */
export interface HeroFacts {
  sex: Sex;
  /** Whole years, the age they enter play at: it chooses the age band. */
  age: number;
  /** Their Background: the Biography's first sentence, if content has one. */
  backgroundKey: BackgroundKey;
  /** Their Class: the Biography's sentence of it at their band, if content has one. */
  classKey: ClassKey;
  /** Their Traits, in order: the first `heroBiographyTraitSentences` have a sentence each, if content has one. */
  traitKeys: readonly TraitKey[];
  /**
   * Their Portrait: a picture's narrative is the Appearance, as written (DL-127 item 4); its hooks join
   * their Class's sentences, and its Temper chooses the closing (DL-135 item 6).
   */
  portraitKey: PortraitKey | null;
}

/**
 * A Hero's Appearance and Biography, drawn from `state` in `heroDescriptionDraws` (13) draws whatever
 * is written (v1.1.3-S6, DL-135 item 6), so a picture, a Background, Class or Trait with no sentence,
 * the sex or the age never moves a later draw, and the Heroes after are described as they would have
 * been. Pure but for advancing `state`.
 * - *The Appearance* is their picture's narrative, as written, or with no picture drawn whole from the
 *   phrases of their sex and band, as a Guildmaster's is (`drawAppearance`), the draws taken either way.
 * - *The Biography* (the shape `content`'s `longestDescriptions` bounds, v1.1.3-S1): a sentence of their
 *   Background; one of their Class at their band, with a picture its hooks among them; one for each of
 *   their first two Traits; and a closing, with a picture its Temper's, else, or where the Temper has
 *   none, their band's. Those there are, joined by spaces, each pronoun slot the sex's word.
 */
export function describeHero(state: Stream, content: Pick<ContentSet, 'descriptions' | 'portraitAppearances'>, facts: HeroFacts): HeroDescription {
  const { descriptions } = content;
  const band = ageSpanOf(descriptions.ageBands, facts.age).key;
  const drawnAppearance = drawAppearance(state, descriptions, facts.sex, band);
  const pictured = facts.portraitKey === null ? undefined : portraitRowOf(content, facts.portraitKey);
  const appearance = pictured === undefined ? drawnAppearance : pictured.narrative.trim();

  const sentences = descriptions.heroBiography;
  const listed = <T>(lists: Readonly<Record<string, T>>, key: string | undefined): T | undefined =>
    key !== undefined ? rowOf(lists, key) : undefined;
  const classSentences = [...(listed(listed(sentences.classes, facts.classKey) ?? {}, band) ?? []), ...(pictured?.hooks ?? [])];
  const temperClosings = pictured === undefined ? [] : (listed(descriptions.biography.temperClosings, pictured.temper) ?? []);
  const closings = temperClosings.length > 0 ? temperClosings : (listed(sentences.closings, band) ?? []);
  const traitKeys = Array.from({ length: heroBiographyTraitSentences }, (_, index) => facts.traitKeys[index]);
  const biography = [
    pickOrNone(state, listed(sentences.backgrounds, facts.backgroundKey) ?? []),
    pickOrNone(state, classSentences),
    ...traitKeys.map((key) => pickOrNone(state, listed(sentences.traits, key) ?? [])),
    pickOrNone(state, closings),
  ]
    .filter((sentence) => sentence !== null)
    .map((sentence) => filled(sentence, descriptions, facts.sex, ''))
    .join(' ');
  return { appearance, biography };
}

/**
 * Writes `hero`'s Appearance and Biography as they are generated (v1.1.3-S6, DL-135 item 6), from the
 * world's `hero-descriptions` stream, after their Portrait, since the texts follow the picture. A
 * Hero's texts are never given: the player sets up no Hero. Changes `hero` in place.
 */
export function describeNewHero(world: World, deps: Pick<EngineDeps, 'content'>, hero: Hero): void {
  const written = describeHero(streamOf(world, heroDescriptionsStream), deps.content, {
    sex: hero.sex,
    age: hero.ageAtEntry,
    backgroundKey: hero.backgroundKey,
    classKey: hero.classKey,
    traitKeys: hero.traits,
    portraitKey: hero.portraitKey,
  });
  Object.assign(hero, written);
}
