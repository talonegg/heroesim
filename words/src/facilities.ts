// A Facility in words (DL-294 item 3, DL-297): its name, the verb its name takes and what it does, each
// read from content's row and its effects, so that a Facility content adds needs no words of its own.
// What an effect does is the engine's rule (`hallEffect`); these are the words both front ends put it in.

import { facilityEffectKinds, type ContentSet, type FacilityEffectKind } from '@heroesim/engine/content';
import { listed, nameIn, rowOf } from './names.js';

/** What each effect does, as a sentence says it after a Facility's name: with a singular name, and with a plural. */
export const facilityEffectWords: Readonly<Record<FacilityEffectKind, { one: string; many: string }>> = Object.freeze({
  healFactor: { one: 'shortens the Days an Injury takes to heal', many: 'shorten the Days an Injury takes to heal' },
  trainingXp: {
    one: 'gives every Hero on the Roster who is home and unhurt XP each night',
    many: 'give every Hero on the Roster who is home and unhurt XP each night',
  },
  moraleBaseline: { one: 'raises the Morale the Roster settles toward', many: 'raise the Morale the Roster settles toward' },
  fatigueFall: { one: 'lowers the Fatigue of every Hero at home each night', many: 'lower the Fatigue of every Hero at home each night' },
});

/** A Facility as a sentence names it, in lower case (`training yard`); a key content does not define, as it is (rule 5). */
export function facilityName(content: Pick<ContentSet, 'facilities'>, key: string): string {
  return nameIn(content.facilities, key);
}

/** The verb a Facility's name takes in a sentence: the infirmary is, the quarters are. */
export function facilityIs(content: Pick<ContentSet, 'facilities'>, key: string): 'is' | 'are' {
  return rowOf(content.facilities, key)?.plural === true ? 'are' : 'is';
}

/**
 * What a Facility does, after its name: each of its effects' words, in the order of the kinds, its
 * verbs agreeing with its name ("raise the Morale the Roster settles toward and lower the Fatigue of
 * every Hero at home each night"); nothing for a key content does not define.
 */
export function facilityDoes(content: Pick<ContentSet, 'facilities'>, key: string): string {
  const facility = rowOf(content.facilities, key);
  if (facility === undefined) return '';
  const form = facility.plural ? 'many' : 'one';
  return listed(facilityEffectKinds.filter((kind) => Object.hasOwn(facility.effects, kind)).map((kind) => facilityEffectWords[kind][form]));
}
