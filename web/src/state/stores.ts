// The Stores (M9-F3, DL-111 item 5, DL-112 item 6, DL-116): everything the player's Guild owns,
// wherever it is. Its Holding; the gear each Hero on its Roster carries, at home or away; and the
// consumables and gear its Parties took. One row an Item or stack in one place, so a stack held in
// two places is two rows. Read only for now (DL-113 item 2): Sell is the Market's, and gear moves on a
// Hero's page.
//
// Nothing here computes a rule (ADR-0007, principle 12): who holds what is the engine's `holdings`
// and `carriedGear`, what a held Item sells for the Market Engine's `sellPrice`, and an Item's kind
// the Market's words (`kindOf`).

import {
  carriedGear,
  compareByCodeUnit,
  holdings,
  itemDefinition,
  playerGuild,
  sellPrice,
  type HeroId,
  type ItemDefinitionKey,
  type PartyId,
  type Stack,
  type UniqueItem,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { capitalised, rowOf } from './names';
import { listed, questNamer, textOf, type Segment } from './narrate';
import { playDeps } from './reducer';
import { kindKeyOf, kindOf, type MarketKind } from './trade-views';

/** Where an Item is: in the Holding, carried by a Hero on the Roster, or with a Party away. */
export type StoresWhere = 'held' | 'carried' | 'party';

const whereOrder: readonly StoresWhere[] = ['held', 'carried', 'party'];

const whereLabels: Readonly<Record<StoresWhere, string>> = Object.freeze({ held: 'Held', carried: 'Carried', party: 'With a Party' });

/** What the Stores shows: one kind or all, and one place or all. */
export interface StoresFilter {
  kind: MarketKind | null;
  where: StoresWhere | null;
}

export interface StoresRow {
  /** The row's unique Item or stack: unique within the Stores. */
  key: string;
  definitionKey: ItemDefinitionKey;
  name: string;
  /** `Armour Gear`, `Consumable`, `Weapon Gear, Unique Item`, as the Market says it. */
  kind: string;
  /** The kind the filter names. */
  kindKey: MarketKind | null;
  where: StoresWhere;
  /** `Held`, `Carried by Bran Tull`, `Carried by Bran Tull, away on The Barrow`, `With the Party on The Barrow`. */
  whereWords: string;
  /** The same, the Hero's name a name that opens their page. */
  whereSegments: Segment[];
  /** The Hero who carries it; `null` for one held or with a Party. */
  heroId: HeroId | null;
  /** The Party that took it; `null` for one held or carried. */
  partyId: PartyId | null;
  /** A stack's quantity, or 1 for a unique Item. */
  quantity: number;
  /** What the Market pays for one held (`sellPrice`); `null` for one carried or away, or one it cannot price. */
  sellsFor: number | null;
}

export interface StoresView {
  guildName: string;
  /** The rows the filter shows: the Holding's, then each Hero's on the Roster in its order, then each Party's. */
  rows: StoresRow[];
  /** Each kind the Guild owns, the gear slots in their order then consumables, with how many rows: the filter's chips. */
  kinds: { key: MarketKind; label: string; count: number }[];
  /** Each place the Guild has Items, with how many rows. */
  wheres: { key: StoresWhere; label: string; count: number }[];
  /** `The Lantern owns 6 Items: 3 held, 2 carried by its Heroes and 1 with its Parties.`, or that it owns nothing. */
  summary: string;
}

/** `1 Item`, `6 Items`. */
function itemsWords(count: number): string {
  return `${count} ${count === 1 ? 'Item' : 'Items'}`;
}

/**
 * The rows of `rows` that `filter` shows: of its kind and in its place, or all. The Stores part reads
 * every row once and shows these, rather than reading the Guild's Items again for each filter (M9-F6).
 */
export function storesRowsShown(rows: readonly StoresRow[], filter: StoresFilter): StoresRow[] {
  return rows.filter((row) => (filter.kind === null || row.kindKey === filter.kind) && (filter.where === null || row.where === filter.where));
}

/**
 * `show roster`'s gear and the Market's Sell together, for the player's Guild (M9-F3): every Item it
 * owns, where it is, of the kind and place asked for or all; `null` in a save with no player's Guild.
 */
export function storesView(document: WorldDocument, filter: StoresFilter): StoresView | null {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return null;
  const deps = playDeps(document);
  const questName = questNamer(document, content);

  const rowFor = (row: UniqueItem | Stack, where: StoresWhere, whereSegments: Segment[], heroId: HeroId | null, partyId: PartyId | null): StoresRow => {
    const definition = itemDefinition(content, row.definitionKey);
    return {
      key: row.id,
      definitionKey: row.definitionKey,
      name: definition?.name ?? row.definitionKey,
      kind: definition === undefined ? '' : kindOf(definition),
      kindKey: definition === undefined ? null : kindKeyOf(definition),
      where,
      whereWords: textOf(whereSegments),
      whereSegments,
      heroId,
      partyId,
      quantity: 'quantity' in row ? row.quantity : 1,
      sellsFor: where === 'held' ? sellPrice(row.definitionKey, deps) : null,
    };
  };

  const home = holdings(world, { kind: 'guild', id: guild.id });
  const held = [...home.stacks, ...home.items].map((row) => rowFor(row, 'held', [{ kind: 'text', text: 'Held' }], null, null));
  const carried = guild.rosterIds.flatMap((heroId) => {
    const hero = rowOf(world.heroes, heroId);
    if (hero === undefined) return [];
    const party = hero.partyId === null ? undefined : rowOf(world.parties, hero.partyId);
    const words: Segment[] = [
      { kind: 'text', text: 'Carried by ' },
      { kind: 'name', text: hero.name, entityId: hero.id, table: 'heroes' },
      ...(party === undefined ? [] : [{ kind: 'text' as const, text: `, away on ${questName(party.questId)}` }]),
    ];
    return carriedGear(world, heroId).map((row) => rowFor(row, 'carried', words, heroId, null));
  });
  const away = Object.values(world.parties)
    .filter((party) => party.guildId === guild.id)
    .sort((a, b) => compareByCodeUnit(a.id, b.id))
    .flatMap((party) => {
      const taken = holdings(world, { kind: 'party', id: party.id });
      const words: Segment[] = [{ kind: 'text', text: `With the Party on ${questName(party.questId)}` }];
      return [...taken.stacks, ...taken.items].map((row) => rowFor(row, 'party', words, null, party.id));
    });
  const owned = [...held, ...carried, ...away];

  const kinds = [...deps.config.gearSlots, 'consumable' as const].flatMap((key) => {
    const count = owned.filter((row) => row.kindKey === key).length;
    return count === 0 ? [] : [{ key, label: capitalised(key), count }];
  });
  const wheres = whereOrder.flatMap((key) => {
    const count = owned.filter((row) => row.where === key).length;
    return count === 0 ? [] : [{ key, label: whereLabels[key], count }];
  });

  const counted = (rows: readonly StoresRow[]) => rows.reduce((sum, row) => sum + row.quantity, 0);
  const total = counted(owned);
  const parts = [
    [counted(held), 'held'],
    [counted(carried), 'carried by its Heroes'],
    [counted(away), 'with its Parties'],
  ] as const;
  const summary =
    total === 0
      ? `${guild.name} owns nothing: no Item is held, carried by a Hero or with a Party.`
      : `${guild.name} owns ${itemsWords(total)}: ${listed(parts.flatMap(([count, words]) => (count === 0 ? [] : [`${count} ${words}`])))}.`;

  return {
    guildName: guild.name,
    rows: storesRowsShown(owned, filter),
    kinds,
    wheres,
    summary,
  };
}
