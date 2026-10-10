// Every refusal a play can meet, in one sentence for the CLI and the page alike (DL-240). The engine
// refuses with typed data and never with prose (ADR-0003): an action's `ActionRejection`, a new
// game's `SetupRefusal`. Each front end adds the refusals any play on a game can meet: no player's
// Guild, and the game over. This table words them all once, its names as slots that each front end's
// Namer fills, as the narration's are (DL-186 item 1): the CLI names a Hero or an Item with the id
// its commands take and points to the command or the flag to use; the page names without ids, and
// "that Hero" where the world holds no such row. One map, keyed by every kind, so that `tsc -b`
// refuses a kind the engine adds until it has a sentence; `refusals.test.ts` holds it to the union.
//
// The page's own refusals, no game in hand and a save that does not load, and the CLI's, a save or
// a command line it cannot read, stay with each (`web/src/state/namer.ts`, `cli/src/context.ts`).

import {
  descriptiveAttributeLabels,
  parseId,
  playerGuild,
  traitOf,
  type ActionRejection,
  type Ending,
  type EntityId,
  type Guild,
  type Rejection,
  type SetupRefusal,
  type TransferRefusalReason,
  type UnmetRequirement,
  type World,
} from '@heroesim/engine';
import { sexes, type ContentSet } from '@heroesim/engine/content';
import { gearUnavailableWords, unavailableWords } from './availability.js';
import { dateOfTurn, type Calendar } from './calendar.js';
import { listed, nameIn, rowOf } from './names.js';
import { endingWords, facilityIs, facilityNames, ids, say, type CommandSlot, type NameSlot, type Piece, type QuestSlot, type Sentence } from './narrate.js';

// ── Kinds ────────────────────────────────────────────────────────────────────────────────────

/** A new game's setup refused: the engine's `SetupRefusal`, as a refusal of the play that would make the game. */
export type NewGameRejection = SetupRefusal extends infer Refusal
  ? Refusal extends SetupRefusal
    ? Rejection<'newGame', Refusal['reason']> & Omit<Refusal, 'reason'>
    : never
  : never;

/** A play that needs the player's Guild, on a save that has none. */
export type NoPlayerGuild<Action extends string = string> = Rejection<Action, 'no-player-guild'>;

/** A Turn or an action after the player's game has ended: the world stands (DL-28, DL-53). */
export interface GameEnded<Action extends string = string> extends Rejection<Action, 'game-ended'> {
  ending: Ending;
}

/** Every refusal the table words: the engine's, and the two any play on a game can meet. */
export type Refusal = ActionRejection | NewGameRejection | NoPlayerGuild | GameEnded;

/**
 * A kind of refusal: its play and reason (`dispatch hero-unavailable`), or the reason alone for a
 * refusal any play on a game can meet (`game-ended`), whose words do not depend on the play.
 */
export type RefusalKind<R extends Refusal = Refusal> = R extends NoPlayerGuild | GameEnded ? R['reason'] : `${R['action']} ${R['reason']}`;

/** The reasons any play on a game can meet, keyed so that one added to the table's union must be listed. */
const anyPlayReasons: Readonly<Record<(NoPlayerGuild | GameEnded)['reason'], true>> = Object.freeze({
  'no-player-guild': true,
  'game-ended': true,
});

export function refusalKind(refusal: Refusal): RefusalKind {
  const { action, reason } = refusal;
  return (Object.hasOwn(anyPlayReasons, reason) ? reason : `${action} ${reason}`) as RefusalKind;
}

// ── Names ────────────────────────────────────────────────────────────────────────────────────

/** What a sentence reads beyond its refusal: the world it was refused in, when there is one; content's names; the game's calendar (DL-210). */
export interface RefusalSetting {
  world: World | null;
  content: ContentSet;
  calendar: Calendar;
}

/** A Hero, labelled with the name the world holds, or with none. */
function hero({ world }: RefusalSetting, id: EntityId): NameSlot {
  return { kind: 'hero', table: 'heroes', id, label: rowOf(world?.heroes, id)?.name };
}

/** A Guild, labelled with the name the world holds, or with none. */
function guild({ world }: RefusalSetting, id: EntityId): NameSlot {
  return { kind: 'name', table: 'guilds', id, label: rowOf(world?.guilds, id)?.name };
}

/** The player's Guild, whose play it was; "your Guild" with no world to name it from. */
function player(setting: RefusalSetting): Piece {
  const mine = setting.world === null ? undefined : playerGuild(setting.world);
  return mine === undefined ? 'your Guild' : guild(setting, mine.id);
}

/** A Quest by its template's name while the Board holds its row; by its id alone once it does not. */
function quest({ world, content }: RefusalSetting, id: EntityId): QuestSlot {
  const row = rowOf(world?.quests, id);
  return { kind: 'quest', id: id as QuestSlot['id'], template: row === undefined ? undefined : nameIn(content.questTemplates, row.templateKey) };
}

/** An Item or a stack by its definition's name and its id, `Whetstone (stack-000004)` in the CLI; its id alone, unlabelled, when the world has no such row. */
function held({ world, content }: RefusalSetting, id: string): Piece {
  const row = rowOf<{ definitionKey: string }>(world?.items, id) ?? rowOf<{ definitionKey: string }>(world?.stacks, id);
  if (row === undefined) return { kind: 'name', table: parseId(id)?.table ?? null, id: id as EntityId, label: undefined };
  return say`${nameIn(content.items, row.definitionKey)}${ids(id)}`;
}

function command(name: CommandSlot['command']): CommandSlot {
  return { kind: 'command', command: name };
}

/**
 * A requirement a Party misses, in words: `a Party of 2 to 4 Heroes (1 named)`, `a Healer in the
 * Party`, `a Hero with Lockpicking in the Party`. A dispatch's refusal and the CLI's preview say it.
 */
export function requirementWords(unmet: UnmetRequirement, content: ContentSet): string {
  switch (unmet.requirement) {
    case 'party-size':
      return `a Party of ${unmet.partySizeMin} to ${unmet.partySizeMax} Heroes (${unmet.size} named)`;
    case 'class':
      return `a ${nameIn(content.classes, unmet.classKey)} in the Party`;
    case 'skill':
      return `a Hero with ${nameIn(content.skills, unmet.skillKey)} in the Party`;
  }
}

/** Why a Guild will not deal now (DL-214), after "will not part with …" or "will not take …"; `guild` the Guild's row, if the world holds it. */
function transferRefusalWords(because: TransferRefusalReason, guild: Pick<Guild, 'rosterIds'> | undefined): string {
  switch (because) {
    case 'roster-size':
      return `its Roster of ${guild?.rosterIds.length ?? 0} is too small for its appetite for Transfers`;
    case 'wealth':
      return 'it is not rich enough to hire now';
    case 'unknown-disposition':
      return 'its Disposition is not one this content knows';
    case 'answers-offers':
      return 'it answers only Transfer Offers';
  }
}

/** A Guild that will not deal now: it will not part with a Hero asked of it, or take one sent to it. */
function refused({ guildId, heroId, side, because }: Extract<ActionRejection, { reason: 'transfer-refused' }>, setting: RefusalSetting): Sentence {
  const way = side === 'out' ? 'part with' : 'take';
  return say`${guild(setting, guildId)} will not ${way} ${hero(setting, heroId)}: ${transferRefusalWords(because, rowOf(setting.world?.guilds, guildId))}.`;
}

/** A Hero a Transfer cannot move yet (DL-69): the date they were transferred, and the first date they may be again. */
function locked(
  { heroId, transferredOnTurn, untilTurn }: Extract<ActionRejection, { reason: 'recently-transferred' }>,
  setting: RefusalSetting,
): Sentence {
  const { calendar } = setting;
  return say`${hero(setting, heroId)} was transferred on ${dateOfTurn(transferredOnTurn, calendar)} and cannot be transferred again before ${dateOfTurn(untilTurn, calendar)}.`;
}

function inParty({ heroId, partyId }: Extract<ActionRejection, { reason: 'hero-in-party' }>, setting: RefusalSetting): Sentence {
  return say`${hero(setting, heroId)} is away with a Party${ids(partyId)}; a Hero is transferred only from the Hall.`;
}

function notFound({ offerId }: Extract<ActionRejection, { reason: 'offer-not-found' }>, setting: RefusalSetting): Sentence {
  return say`No such Transfer Offer${ids(offerId)} stands for ${player(setting)}'s Heroes${command('show-offers')}.`;
}

/**
 * How the game ended, and when: `The game ended on Year 1 Day 41: The Test went bankrupt.` A refusal
 * made after it opens with it, and the page's header and the CLI's `advance` say it (DL-241).
 */
export function endedSentence(ending: Ending, setting: RefusalSetting): Sentence {
  const date = { kind: 'date', turn: ending.turn, date: dateOfTurn(ending.turn, setting.calendar) } as const;
  return say`The game ended on ${date}: ${player(setting)} ${endingWords[ending.reason]}.`;
}

/** What follows a refusal made once the game has ended: no Turn, or no action. */
function afterTheEnd(action: string): string {
  return action === 'advance' || action === 'fastForward' ? 'No Turn follows.' : 'Nothing more can be done in it.';
}

// ── The table ────────────────────────────────────────────────────────────────────────────────

type Sentences = {
  [R in Refusal as RefusalKind<R>]: (refusal: R, setting: RefusalSetting) => Sentence;
};

const sentences: Sentences = {
  // Any play on a game.
  'no-player-guild': () => say`The save has no player's Guild.`,
  'game-ended': ({ action, ending }, setting) => say`${endedSentence(ending, setting)} ${afterTheEnd(action)}`,

  // A new game's setup (DL-102): the page's form and the CLI's flags, the flag a slot.
  'newGame guild-name-blank': () => say`The Guild needs a name${command('name-guild')}.`,
  'newGame guildmaster-name-blank': () => say`The Guildmaster needs a name${command('name-guildmaster')}.`,
  'newGame unknown-background': ({ backgroundKey }, { content }) => {
    const choices = Object.values(content.backgrounds)
      .filter((row) => row.owner === 'guild')
      .map((row) => say`${row.name}${ids(row.key)}`)
      .flatMap((choice, index) => (index === 0 ? choice : say`, ${choice}`));
    return say`No Guild Background is called "${backgroundKey}". Choose one of: ${choices}.`;
  },
  'newGame unknown-sex': ({ sex }) => say`A Guildmaster's Sex is ${sexes.join(' or ')}; ${{ kind: 'entry', field: 'sex', value: sex }} is not.`,
  'newGame age-out-of-range': ({ age, min, max }) =>
    say`A Guildmaster starts aged ${min} to ${max}, in whole Years; ${{ kind: 'entry', field: 'age', value: age }} is not.`,
  'newGame stats-incomplete': ({ missing }, { content }) =>
    say`Every Guildmaster Stat is chosen, or none; ${listed(missing.map((key) => nameIn(content.stats, key)))} ${missing.length === 1 ? 'is' : 'are'} not.`,
  'newGame stat-out-of-range': ({ statKey, value, min, max }, { content }) =>
    say`A Guildmaster's ${nameIn(content.stats, statKey)} is ${min} to ${max} when chosen, in whole numbers; ${{ kind: 'entry', field: 'stats', value, key: statKey }} is not.`,
  'newGame stats-over-points': ({ spent, points }) => say`Those Stats spend ${spent} points, and the Stat points are ${points}: lower one to raise another.`,
  'newGame unknown-trait': ({ traitKey }, { content }) => {
    // A Hero Trait is of the other list, named as it is.
    const trait = traitOf(content, traitKey);
    return trait === undefined ? say`No Guildmaster Trait is called "${traitKey}".` : say`${trait.name} is not a Guildmaster Trait.`;
  },
  'newGame repeated-trait': ({ traitKey }, { content }) => say`${nameIn(content.guildmasterTraits, traitKey)} is chosen twice.`,
  'newGame too-many-traits': ({ count, max }) => say`A Guildmaster holds at most ${max} Traits; ${count} are chosen.`,
  'newGame excluded-pair': ({ traitKey, otherKey }, { content }) =>
    say`${nameIn(content.guildmasterTraits, traitKey)} and ${nameIn(content.guildmasterTraits, otherKey)} exclude each other: a Guildmaster holds one or the other.`,
  'newGame over-budget': ({ cost, budget }) => say`Those Traits cost ${cost} points and the budget is ${budget}: a buff costs points and a penalty refunds them.`,
  'newGame text-too-long': ({ attribute, length, max }) =>
    say`The ${descriptiveAttributeLabels[attribute]} is ${length} characters long; it holds at most ${max}.`,
  'newGame unknown-portrait': ({ portraitKey }) => say`No Guildmaster Portrait is called "${portraitKey}".`,
  'newGame portrait-of-another-sex': ({ sex, portraitSex }) =>
    say`That Portrait is of a ${portraitSex} Guildmaster, and your Guildmaster's Sex is ${sex}${command('portrait-sex')}.`,

  // rebase (DL-205).
  'rebase already-current': ({ configVersion }) => say`This game already plays under this release's rules, configVersion ${configVersion}.`,

  // dispatch.
  'dispatch guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and sends no one.`,
  'dispatch quest-not-offered': ({ questId }, setting) =>
    say`${quest(setting, questId)} is not on the Board: it has been taken or has expired, or was never offered.`,
  'dispatch fame-below-minimum': ({ questId, guildId, tier, fameMinimum, fame }, setting) =>
    say`${quest(setting, questId)} is a Tier ${tier} Quest, open to a Guild of ${fameMinimum} Fame or more; ${guild(setting, guildId)} has ${fame}, ${fameMinimum - fame} short.`,
  'dispatch hero-not-on-roster': ({ heroId, guildId }, setting) => say`${hero(setting, heroId)} is not on the Roster of ${guild(setting, guildId)}.`,
  'dispatch hero-unavailable': ({ heroId, because }, setting) => say`${hero(setting, heroId)} ${unavailableWords[because]} and cannot go.`,
  'dispatch requirement-unmet': ({ questId, unmet }, setting) =>
    say`${quest(setting, questId)} needs ${unmet.map((each) => requirementWords(each, setting.content)).join(' and ')}.`,
  'dispatch not-consumable': ({ definitionKey }, { content }) =>
    rowOf(content.items, definitionKey) === undefined
      ? say`No Item is called "${definitionKey}".`
      : say`${nameIn(content.items, definitionKey)} is Gear, not a Consumable: a Party carries Consumables only.`,
  'dispatch not-held-by-guild': ({ guildId, definitionKey }, setting) =>
    say`${guild(setting, guildId)} holds no ${nameIn(setting.content.items, definitionKey)} to carry.`,
  'dispatch insufficient-quantity': ({ guildId, definitionKey, held: count, requested }, setting) =>
    say`${guild(setting, guildId)} holds ${count} of ${nameIn(setting.content.items, definitionKey)}, not the ${requested} asked.`,

  // recruit.
  'recruit guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and signs no one.`,
  'recruit hero-not-unattached': ({ heroId }, setting) => say`${hero(setting, heroId)} is not in the Unattached pool${command('pool-holds')}.`,
  'recruit signing-refused': ({ heroId, fameRequired, fame, shortfall }, setting) =>
    say`${hero(setting, heroId)} will not sign for a Guild with less than ${fameRequired} Fame; ${player(setting)} has ${fame}, ${shortfall} short.`,
  'recruit insufficient-wealth': ({ fee, wealth }, setting) => say`The signing fee is ${fee} Wealth; ${player(setting)} has ${wealth}.`,

  // build.
  'build guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and builds nothing.`,
  'build max-grade': ({ facility, grade }, setting) =>
    say`${player(setting)}'s ${facilityNames[facility]} ${facilityIs[facility]} at grade ${grade}, the highest there is.`,
  'build insufficient-wealth': ({ facility, cost, wealth }, setting) =>
    say`The next grade of ${player(setting)}'s ${facilityNames[facility]} costs ${cost} Wealth; ${player(setting)} has ${wealth}.`,

  // equip and unequip.
  'equip guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and equips no one.`,
  'equip hero-not-on-roster': ({ heroId, guildId }, setting) =>
    say`${hero(setting, heroId)} is not on ${guild(setting, guildId)}'s Roster${command('show-roster')}.`,
  'equip hero-unavailable': ({ heroId, because }, setting) => say`${hero(setting, heroId)} ${gearUnavailableWords[because]}.`,
  'equip not-held-by-guild': ({ itemId, stackId }, setting) =>
    say`${player(setting)} does not hold ${held(setting, itemId ?? stackId ?? '')}${command('roster-holds')}.`,
  'equip not-gear': ({ definitionKey }, { content }) => say`${nameIn(content.items, definitionKey)} is not Gear, and is carried in no slot.`,
  'equip wrong-slot': ({ definitionKey, slot, gearSlot }, { content }) =>
    slot === gearSlot
      ? say`${nameIn(content.items, definitionKey)} is ${gearSlot} Gear, and Heroes have no ${gearSlot} slot in this game.`
      : say`${nameIn(content.items, definitionKey)} goes in the ${gearSlot} slot, not the ${slot} slot.`,
  'equip slot-occupied': ({ heroId, slot, occupant }, setting) =>
    say`${hero(setting, heroId)}'s ${slot} slot holds ${held(setting, occupant)}: unequip it first.`,
  'unequip guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and unequips no one.`,
  'unequip hero-not-on-roster': ({ heroId, guildId }, setting) =>
    say`${hero(setting, heroId)} is not on ${guild(setting, guildId)}'s Roster${command('show-roster')}.`,
  'unequip hero-unavailable': ({ heroId, because }, setting) => say`${hero(setting, heroId)} ${gearUnavailableWords[because]}.`,
  'unequip slot-empty': ({ heroId, slot }, setting) => say`${hero(setting, heroId)}'s ${slot} slot is empty.`,

  // buy and sell.
  'buy guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and buys nothing.`,
  'buy not-in-market': ({ definitionKey }, { content }) => say`The Market has no ${nameIn(content.items, definitionKey)} for sale${command('show-market')}.`,
  'buy insufficient-quantity': ({ definitionKey, quantity, available }, { content }) =>
    say`The Market has ${available} ${nameIn(content.items, definitionKey)}; ${quantity} cannot be bought.`,
  'buy insufficient-wealth': ({ cost, wealth }, setting) => say`That costs ${cost} Wealth; ${player(setting)} has ${wealth}.`,
  'sell guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and sells nothing.`,
  'sell not-held-by-guild': ({ id }, setting) => say`${player(setting)} holds no ${held(setting, id)} to sell${command('market-holds')}.`,
  'sell equipped': ({ id, heroId, slot }, setting) => say`${hero(setting, heroId)} carries ${held(setting, id)} as their ${slot}; unequip it first.`,
  'sell unknown-item': ({ definitionKey }, { content }) => say`The Market cannot price ${nameIn(content.items, definitionKey)}: the content does not define it.`,
  'sell insufficient-quantity': ({ stackId, quantity, available }, setting) =>
    say`That stack of ${held(setting, stackId)} holds ${available}; ${quantity} cannot be sold from it.`,

  // The five Transfer actions (DL-57).
  'transferIn guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and deals no more.`,
  'transferIn hero-not-on-roster': ({ heroId }, setting) => say`${hero(setting, heroId)} is on no other Guild's Roster${command('show-rosters')}.`,
  'transferIn same-guild': (_, setting) => say`That Hero is already on ${player(setting)}'s Roster.`,
  'transferIn hero-in-party': inParty,
  'transferIn recently-transferred': locked,
  'transferIn transfer-refused': refused,
  'transferIn insufficient-wealth': ({ guildId, fee, wealth }, setting) => say`The fee is ${fee} Wealth; ${guild(setting, guildId)} has ${wealth}.`,

  'transferOut guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and deals no more.`,
  'transferOut same-guild': (_, setting) => say`${player(setting)} cannot transfer a Hero to itself.`,
  'transferOut hero-not-on-roster': ({ heroId }, setting) =>
    say`${hero(setting, heroId)} is not on ${player(setting)}'s Roster${command('show-roster')}.`,
  'transferOut hero-in-party': inParty,
  'transferOut recently-transferred': locked,
  'transferOut transfer-refused': refused,
  'transferOut insufficient-wealth': ({ guildId, fee, wealth }, setting) => say`The fee is ${fee} Wealth; ${guild(setting, guildId)} has ${wealth}.`,

  'offerTransfer guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and deals no more.`,
  'offerTransfer hero-not-on-roster': ({ heroId }, setting) => say`${hero(setting, heroId)} is on no other Guild's Roster${command('show-rosters')}.`,
  'offerTransfer same-guild': (_, setting) => say`That Hero is already on ${player(setting)}'s Roster.`,
  'offerTransfer hero-in-party': inParty,
  'offerTransfer recently-transferred': locked,
  'offerTransfer no-offer-needed': ({ guildId }, setting) =>
    say`${guild(setting, guildId)} answers a Transfer at once, so no Offer is needed: ask to take the Hero in.`,
  'offerTransfer offer-pending': ({ offerId }, setting) => {
    const offer = rowOf(setting.world?.offers, offerId);
    return say`${player(setting)}'s Offer${ids(offerId)} for ${offer === undefined ? 'that Hero' : hero(setting, offer.heroId)} already waits for an answer.`;
  },
  'offerTransfer insufficient-wealth': ({ guildId, fee, wealth }, setting) => say`The fee is ${fee} Wealth; ${guild(setting, guildId)} has ${wealth}.`,

  'acceptTransfer guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and deals no more.`,
  'acceptTransfer offer-not-found': notFound,
  'acceptTransfer hero-in-party': inParty,
  'acceptTransfer insufficient-wealth': ({ guildId, fee, wealth }, setting) => say`The fee is ${fee} Wealth; ${guild(setting, guildId)} has ${wealth}.`,
  'declineTransfer guild-folded': ({ guildId }, setting) => say`${guild(setting, guildId)} has folded and deals no more.`,
  'declineTransfer offer-not-found': notFound,
};

/** Every kind the table has a sentence for: the test holds it to the union. */
export const refusalKinds = Object.freeze(Object.keys(sentences)) as readonly RefusalKind[];

/**
 * `refusal` as a sentence, its names as slots for a front end's Namer to fill (DL-240): a Hero, a
 * Guild or a Quest labelled with the name `setting.world` holds, or unlabelled where it holds none,
 * and its dates by the game's calendar (DL-210).
 */
export function refusalSentence(refusal: Refusal, setting: RefusalSetting): Sentence {
  const words = sentences[refusalKind(refusal)] as (refusal: Refusal, setting: RefusalSetting) => Sentence;
  return words(refusal, setting);
}
