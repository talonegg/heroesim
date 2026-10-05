// The page's viewing preferences, all in one table (v1.1.6-S15, DL-186 item 25): each a `key` it is
// kept under, its `choices` and the `fallback` the page opens on when nothing is kept, or nothing can
// be. The keys are the ones the page has always used, so a player's stored choices stand. The
// table's entries are read and kept through `useRemembered`, and the saves are not here: they
// stay in `saves.ts`.

import { useCallback, useState } from 'react';
import { rosterColumnGroups, rosterSortChoices, type BoardOrder } from '../state/selectors';
import type { PoolOrder } from '../state/trade-views';
import type { GuildSort } from '../state/world-views';
import { guildParts, viewIds, type GuildPartId, type ViewId } from './section';

/** A preference of one choice among `choices`. */
export interface ChoicePreference<Choice extends string> {
  key: string;
  choices: readonly Choice[];
  fallback: Choice;
}

/** A preference of a list of `choices`, the Roster's hidden columns; the list `fallback` is empty. */
export interface ListPreference<Choice extends string> {
  key: string;
  choices: readonly Choice[];
  fallback: readonly never[];
}

type Preference = ChoicePreference<string> | ListPreference<string>;

/** What a preference keeps: a choice, or for a list preference a list of them. */
export type Kept<Which extends Preference> = Which extends ListPreference<infer Choice> ? Choice[] : Which extends ChoicePreference<infer Choice> ? Choice : never;

const choice = <Choice extends string>(key: string, choices: readonly Choice[], fallback: Choice): ChoicePreference<Choice> => ({ key, choices, fallback });
const list = <Choice extends string>(key: string, choices: readonly Choice[]): ListPreference<Choice> => ({ key, choices, fallback: [] });

const groups = rosterColumnGroups();

/** The nine viewing preferences. */
export const preferences = {
  /** The view open; the Guild's Home view when nothing is kept. */
  view: choice<ViewId>('heroesim.view', viewIds, 'guild'),
  /** The Guild's part open (M9-F2). */
  guildPart: choice<GuildPartId>('heroesim.guildPart', guildParts, 'home'),
  /** The Board's order (DL-109 item 2, Q11). */
  boardOrder: choice<BoardOrder>('heroesim.boardOrder', ['posted', 'reward', 'difficulty', 'leaves'], 'posted'),
  /** The Guilds' table's order. */
  guildsOrder: choice<GuildSort>('heroesim.guildsOrder', ['fame', 'wealth', 'name', 'disposition', 'heroes', 'upkeep'], 'fame'),
  /** The Unattached pool's order. */
  poolOrder: choice<PoolOrder>('heroesim.poolOrder', ['listed', 'class', 'fee'], 'listed'),
  /** How the Roster shows its Heroes (DL-169 item 11). */
  rosterView: choice<'tiles' | 'table'>('heroesim.rosterView', ['tiles', 'table'], 'tiles'),
  /** The Roster's sort, `level:descending`, a sort and its direction. */
  rosterOrder: choice<string>(
    'heroesim.rosterOrder',
    rosterSortChoices().flatMap(({ key }) => [`${key}:ascending`, `${key}:descending`]),
    'default:ascending',
  ),
  /** The Roster's hidden columns, a list. */
  rosterColumns: list<string>(
    'heroesim.rosterColumns',
    groups.flatMap((group) => group.columns.map((column) => column.key)),
  ),
  /** The Roster's open column group on a phone. */
  rosterTab: choice<string>(
    'heroesim.rosterTab',
    groups.map(({ key }) => key),
    'hero',
  ),
};

/** The view kept before M9-F2 that is now a part of the Guild. */
const hallView = 'hall';

/** What this browser keeps of `which`, if it is among its choices; its fallback when not, or when nothing can be read. */
export function rememberedPreference<Which extends Preference>(which: Which): Kept<Which> {
  if (Array.isArray(which.fallback)) return (rememberedList(which.key, which.choices) ?? []) as Kept<Which>;
  return rememberedChoice(which.key, which.choices, which.fallback as string) as Kept<Which>;
}

/** Keeps `kept` as `which`, where the browser lets it. */
export function rememberPreference<Which extends Preference>(which: Which, kept: Kept<Which>): void {
  if (Array.isArray(kept)) rememberList(which.key, kept);
  else rememberChoice(which.key, kept as string);
}

/** The Guild's part this browser last had open, or Home; its Hall when the view kept is the Hall view of before M9-F2. */
export function rememberedGuildPart(): GuildPartId {
  if (rememberedChoice(preferences.view.key, [hallView], null) === hallView) return 'hall';
  return rememberedPreference(preferences.guildPart);
}

/**
 * A preference as state: what this browser keeps of `which` as the page opens, and a setter that
 * sets it and keeps it, where the browser lets it. Nothing is kept until it is set. `read` is for a
 * preference with a reading of its own, as the Guild's part has (`rememberedGuildPart`).
 */
export function useRemembered<Which extends Preference>(which: Which, read: () => Kept<Which> = () => rememberedPreference(which)): [Kept<Which>, (next: Kept<Which>) => void] {
  const [value, setValue] = useState<Kept<Which>>(read);
  const set = useCallback(
    (next: Kept<Which>): void => {
      setValue(next);
      rememberPreference(which, next);
    },
    [which],
  );
  return [value, set];
}

/** What this browser keeps under `key`, if it is one of `choices`; `fallback` when not, or when nothing can be read. */
export function rememberedChoice<Choice extends string, Fallback extends Choice | null>(
  key: string,
  choices: readonly Choice[],
  fallback: Fallback,
): Choice | Fallback {
  try {
    const kept = globalThis.localStorage?.getItem(key);
    return choices.find((choice) => choice === kept) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Keeps `choice` under `key`, where the browser lets it. */
export function rememberChoice(key: string, choice: string): void {
  try {
    globalThis.localStorage?.setItem(key, choice);
  } catch {
    // Nothing kept: the default next time.
  }
}

/**
 * The list this browser keeps under `key`, in the order of `choices`, leaving out what is not one of
 * them; `null` when nothing is kept, or nothing can be read (v1.1.5-S12).
 */
export function rememberedList<Choice extends string>(key: string, choices: readonly Choice[]): Choice[] | null {
  try {
    const kept = globalThis.localStorage?.getItem(key);
    if (kept === null || kept === undefined) return null;
    const listed = kept.split(',');
    return choices.filter((choice) => listed.includes(choice));
  } catch {
    return null;
  }
}

/** Keeps `list` under `key`, where the browser lets it. */
export function rememberList(key: string, list: readonly string[]): void {
  rememberChoice(key, list.join(','));
}
