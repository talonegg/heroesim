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
// The content validator proves that nothing written here passes `descriptiveAttributeMaxLength`,
// taking the Appearance and the Biography to be made as they are below
// (`content/src/validate.ts`'s `longestDescriptions`): a change to how they are joined is a change
// there too.

import type { EngineDeps } from './config.js';
import type {
  AgeBand,
  AppearancePhrases,
  BackgroundKey,
  ContentSet,
  DescriptionSlot,
  Descriptions,
  PortraitKey,
  TraitKey,
} from './content-types.js';
import type { DescriptiveAttribute, Guildmaster, Sex, World } from './document.js';
import { pickOrNone, streamOf, type Stream } from './generators/draw.js';
import { createStreams } from './rng.js';

/** The stream every description is drawn from (ADR-0009 as amended; v1.1.2-S5). */
export const descriptionsStream = 'descriptions';

/**
 * How many of a Guildmaster's Traits their Biography gives a sentence: the first two in their order,
 * as many as a Guildmaster holds by default (`guildmasterTraitsMax`). The content validator repeats it.
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
  /** Their Portrait: a mapped picture's narrative is the Appearance, as written (DL-127 item 4). */
  portraitKey: PortraitKey | null;
}

/** The Appearance's slots in the order they are written, `mark` and `bearing` last, one of the two. */
const writtenSlots = ['build', 'face', 'hair', 'facialHair', 'eyes'] as const satisfies readonly DescriptionSlot[];
const lastSlots = ['mark', 'bearing'] as const satisfies readonly DescriptionSlot[];

/** The band `age` falls in: the last whose `from` it has reached. Content's first band is from 0. */
function bandOf(ageBands: readonly AgeBand[], age: number): string {
  let band = ageBands[0]?.key ?? '';
  for (const each of ageBands) if (age >= each.from) band = each.key;
  return band;
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
 * Appearance is its narrative, as written (DL-127 item 4); otherwise it is drawn whole.
 */
function write(state: Stream, content: Pick<ContentSet, 'descriptions' | 'portraitAppearances'>, facts: DescriptionFacts, given: Partial<GuildmasterDescription> = {}): GuildmasterDescription {
  const { descriptions } = content;
  const band = bandOf(descriptions.ageBands, facts.age);
  const kept = (text: string | undefined): string | null => {
    const trimmed = (text ?? '').trim();
    return trimmed === '' ? null : trimmed;
  };

  const drawnPlace = pickOrNone(state, descriptions.birthplaces) ?? '';
  const birthplace = kept(given.birthplace) ?? drawnPlace;

  const phrases: Partial<AppearancePhrases> = Object.hasOwn(descriptions.appearance[facts.sex], band) ? (descriptions.appearance[facts.sex][band] ?? {}) : {};
  const parts = writtenSlots.map((slot) => pickOrNone(state, phrases[slot] ?? []));
  const lasts = lastSlots.map((slot) => pickOrNone(state, phrases[slot] ?? []));
  const last = pickOrNone(state, lasts);
  const drawnAppearance = [...parts, last].filter((part) => part !== null).join(' ');
  const mapped = facts.portraitKey === null ? undefined : content.portraitAppearances.portraits[facts.portraitKey];
  const appearance = kept(given.appearance) ?? (mapped === undefined ? drawnAppearance : mapped.narrative.trim());

  const { biography: sentences } = descriptions;
  const listed = (lists: Readonly<Record<string, string[]>>, key: string | undefined): readonly string[] =>
    key !== undefined && Object.hasOwn(lists, key) ? (lists[key] ?? []) : [];
  const traitKeys = Array.from({ length: biographyTraitSentences }, (_, index) => facts.traitKeys[index]);
  const drawnBiography = [
    pickOrNone(state, listed(sentences.origins, band)),
    pickOrNone(state, listed(sentences.careers, band)),
    pickOrNone(state, listed(sentences.backgrounds, facts.backgroundKey)),
    ...traitKeys.map((key) => pickOrNone(state, listed(sentences.traits, key))),
    pickOrNone(state, listed(sentences.closings, band)),
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
  const { seed, n, ...facts } = request;
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`"Again" is asked a whole number of times from 0; got ${n}`);
  const name = n === 0 ? descriptionsStream : `${descriptionsStream}-${n}`;
  const state = createStreams(seed, [name])[name] as Stream;
  return write(state, deps.content, facts);
}

/**
 * Writes each of `guildmaster`'s descriptive Attributes left blank (v1.1.2-S5, DL-125 item 6), as
 * they enter play, from the world's `descriptions` stream; a text written is kept. Their Guild's
 * Background is `backgroundKey`. Takes the same fifteen draws whatever it writes, so the Guildmasters
 * described after are described as they would have been. Changes `guildmaster` in place.
 */
export function describeBlanks(world: World, deps: Pick<EngineDeps, 'content'>, guildmaster: Guildmaster, backgroundKey: BackgroundKey): void {
  const written = write(
    streamOf(world, descriptionsStream),
    deps.content,
    {
      sex: guildmaster.sex,
      age: guildmaster.ageAtEntry,
      backgroundKey,
      traitKeys: guildmaster.traits,
      portraitKey: guildmaster.portraitKey,
    },
    { birthplace: guildmaster.birthplace, appearance: guildmaster.appearance, biography: guildmaster.biography },
  );
  Object.assign(guildmaster, written);
}
