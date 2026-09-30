// Every refusal a play can meet, as a sentence (M7-S2, DL-65): one map, keyed by kind, typed so
// that the compiler refuses a kind of `PlayRejection` left out, and tested for completeness against
// the union. The engine refuses with typed data and never with prose (ADR-0003); a front end says
// what it means. The CLI's words are the model (`cli/src/commands/*.ts`), adapted in two ways: a
// Hero, Guild, Quest or Item is named without its id, since the player never types one here, and
// the pointers to a CLI command (`show roster`) are left out.
//
// It reads the engine's values (`dayOf`, `playerGuild`), which only `state/` may import (M7-S2).

import {
  dayOf,
  descriptiveAttributeLabels,
  playerGuild,
  sexes,
  type ContentSet,
  type EndingReason,
  type FacilityKey,
  type GearUnavailability,
  type Guild,
  type TransferRefusalReason,
  type UnmetRequirement,
  type Unavailability,
  type World,
} from '@heroesim/engine';
import type { DocumentPlayKind, GameRefusal, PlayRejection } from './reducer';

// ── Kinds ────────────────────────────────────────────────────────────────────────────────────

/**
 * A kind of refusal: its play and reason (`dispatch hero-unavailable`), or the reason alone for a
 * refusal any play on a game can meet (`game-ended`), whose words do not depend on the play.
 */
export type RejectionKind<Refusal extends PlayRejection = PlayRejection> = Refusal extends GameRefusal
  ? Refusal['reason']
  : `${Refusal['action']} ${Refusal['reason']}`;

/** The reasons any play on a game can meet, keyed so that one added to `GameRefusal` must be listed. */
const anyPlayReasons: Readonly<Record<GameRefusal['reason'], true>> = Object.freeze({
  'no-game': true,
  'no-player-guild': true,
  'game-ended': true,
});

export function rejectionKind(rejection: PlayRejection): RejectionKind {
  const { action, reason } = rejection;
  return (Object.hasOwn(anyPlayReasons, reason) ? reason : `${action} ${reason}`) as RejectionKind;
}

// ── Names ────────────────────────────────────────────────────────────────────────────────────

/** What a sentence reads beyond its rejection: the world it was refused in, when there is one. */
interface Setting {
  world: World | null;
  content: ContentSet;
  /** The player's Guild: whose play it was. */
  player: Guild | undefined;
}

function rowOf<Row>(rows: Readonly<Record<string, Row>> | undefined, id: string): Row | undefined {
  return rows !== undefined && Object.hasOwn(rows, id) ? rows[id] : undefined;
}

/** A content row's name; a key the content does not define is shown as it is (data-model rule 5). */
function nameIn(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  return rowOf(rows, key)?.name ?? key;
}

function heroCalled({ world }: Setting, heroId: string): string {
  return rowOf(world?.heroes, heroId)?.name ?? 'that Hero';
}

function guildCalled({ world }: Setting, guildId: string): string {
  return rowOf(world?.guilds, guildId)?.name ?? 'that Guild';
}

function playerCalled({ player }: Setting): string {
  return player?.name ?? 'your Guild';
}

/** A Quest by its template's name, while the Board holds its row; `that Quest` once it does not. */
function questCalled({ world, content }: Setting, questId: string): string {
  const quest = rowOf(world?.quests, questId);
  return quest === undefined ? 'that Quest' : nameIn(content.questTemplates, quest.templateKey);
}

/** An Item or stack by its definition's name, or `that Item` when the world has no such row. */
function heldCalled({ world, content }: Setting, id: string): string {
  const row = rowOf<{ definitionKey: string }>(world?.items, id) ?? rowOf<{ definitionKey: string }>(world?.stacks, id);
  return row === undefined ? 'that Item' : nameIn(content.items, row.definitionKey);
}

function itemCalled({ content }: Setting, definitionKey: string): string {
  return nameIn(content.items, definitionKey);
}

/** A Hall facility as a sentence names one (`CONTEXT.md`, Hall), and the verb it takes. */
export const facilityNames: Readonly<Record<FacilityKey, string>> = Object.freeze({
  infirmary: 'infirmary',
  trainingYard: 'training yard',
  quarters: 'quarters',
});

export const facilityIs: Readonly<Record<FacilityKey, string>> = Object.freeze({
  infirmary: 'is',
  trainingYard: 'is',
  quarters: 'are',
});

/** Why a Hero cannot go on a Quest, after their name (the CLI's `dispatch`). */
const unavailableWords: Readonly<Record<Unavailability, string>> = Object.freeze({
  injured: 'is injured',
  dead: 'is dead',
  retired: 'has retired',
  'in-party': 'is away with a Party',
});

/** Why a Hero's gear cannot be changed, after their name (the CLI's `equip`). */
const gearUnavailableWords: Readonly<Record<GearUnavailability, string>> = Object.freeze({
  dead: 'is dead',
  retired: 'has retired',
  'in-party': 'is away on a Quest, and their Gear is with them',
});

/** What befell a Guild at its ending, after its name (the CLI's `game.ended`). */
export const endingWords: Readonly<Record<EndingReason, string>> = Object.freeze({
  retirement: 'lost its Guildmaster to Retirement',
  bankruptcy: 'went bankrupt',
  'roster-wiped': 'had its Roster wiped out',
});

/** A requirement a Party misses, in words (the CLI's `requirementWords`). */
function requirementWords(unmet: UnmetRequirement, { content }: Setting): string {
  switch (unmet.requirement) {
    case 'party-size':
      return `a Party of ${unmet.partySizeMin} to ${unmet.partySizeMax} Heroes (${unmet.size} named)`;
    case 'class':
      return `a ${nameIn(content.classes, unmet.classKey)} in the Party`;
    case 'skill':
      return `a Hero with ${nameIn(content.skills, unmet.skillKey)} in the Party`;
  }
}

/** Why a Guild will not deal now, after "will not part with …" or "will not take …" (the CLI's `transfer`). */
function refusalWords(because: TransferRefusalReason, guild: Guild | undefined): string {
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
function refusedWords(
  { guildId, heroId, side, because }: Extract<PlayRejection, { reason: 'transfer-refused' }>,
  setting: Setting,
): string {
  const way = side === 'out' ? 'part with' : 'take';
  const guild = rowOf(setting.world?.guilds, guildId);
  return `${guildCalled(setting, guildId)} will not ${way} ${heroCalled(setting, heroId)}: ${refusalWords(because, guild)}.`;
}

/** What the CLI adds after a refusal made once the game has ended: no Turn, or no action. */
function afterTheEnd(action: DocumentPlayKind): string {
  return action === 'advance' || action === 'fastForward' ? 'No Turn follows.' : 'Nothing more can be done in it.';
}

// ── The map ──────────────────────────────────────────────────────────────────────────────────

type Sentences = {
  [Refusal in PlayRejection as RejectionKind<Refusal>]: (rejection: Refusal, setting: Setting) => string;
};

const sentences: Sentences = {
  // A play on a game, whichever it is.
  'no-game': () => 'No game is in hand: start a new game or load a save.',
  'no-player-guild': () => "The save has no player's Guild.",
  // The CLI's words, with the Day for its Turn: the page names Days, as its header does for the same ending.
  'game-ended': ({ action, ending }, setting) =>
    `The game ended on Day ${dayOf(ending.turn)}: ${playerCalled(setting)} ${endingWords[ending.reason]}. ${afterTheEnd(action)}`,

  // newGame and load (the CLI's `new` and `load`).
  'newGame guild-name-blank': () => 'The Guild needs a name.',
  'newGame guildmaster-name-blank': () => 'The Guildmaster needs a name.',
  'newGame unknown-background': ({ backgroundKey }, { content }) => {
    const choices = Object.values(content.backgrounds)
      .filter((row) => row.owner === 'guild')
      .map((row) => row.name)
      .join(', ');
    return `No Guild Background is called "${backgroundKey}". Choose one of: ${choices}.`;
  },
  // The Guildmaster's setup (M9-S2): the CLI's `new` words, less its flags.
  'newGame unknown-sex': ({ sex }) => `A Guildmaster's Sex is ${sexes.join(' or ')}; "${sex}" is not.`,
  'newGame age-out-of-range': ({ age, min, max }) => `A Guildmaster starts aged ${min} to ${max}, in whole Years; ${age} is not.`,
  'newGame unknown-trait': ({ traitKey }, { content }) =>
    rowOf(content.traits, traitKey) === undefined
      ? `No Guildmaster Trait is called "${traitKey}".`
      : `${nameIn(content.traits, traitKey)} is not a Guildmaster Trait.`,
  'newGame repeated-trait': ({ traitKey }, { content }) => `${nameIn(content.traits, traitKey)} is chosen twice.`,
  'newGame too-many-traits': ({ count, max }) => `A Guildmaster holds at most ${max} Traits; ${count} are chosen.`,
  'newGame excluded-pair': ({ traitKey, otherKey }, { content }) =>
    `${nameIn(content.traits, traitKey)} and ${nameIn(content.traits, otherKey)} exclude each other: a Guildmaster holds one or the other.`,
  'newGame over-budget': ({ cost, budget }) =>
    `Those Traits cost ${cost} points and the budget is ${budget}: a buff costs points and a penalty refunds them.`,
  'newGame text-too-long': ({ attribute, length, max }) =>
    `The ${descriptiveAttributeLabels[attribute]} is ${length} characters long; it holds at most ${max}.`,
  // The Portrait (v1.1.2-S3): the CLI's words, less its flags and the pictures it lists.
  'newGame unknown-portrait': ({ portraitKey }) => `No Guildmaster Portrait is called "${portraitKey}".`,
  'newGame portrait-of-another-sex': ({ sex, portraitSex }) =>
    `That Portrait is of a ${portraitSex} Guildmaster, and your Guildmaster's Sex is ${sex}.`,
  'load malformed-json': ({ message }) => `Cannot load the save: ${message}.`,
  'load not-a-document': ({ message }) => `Cannot load the save: ${message}.`,
  // A save of an older schema, as v1.1.1 wrote it, in the owner's words (v1.1.2-S3, DL-125 item 10.2).
  'load unsupported-version': ({ documentVersion, schemaVersion, message }) =>
    documentVersion < schemaVersion ? 'This game was saved by an older Heroesim and cannot be loaded.' : `Cannot load the save: ${message}.`,
  'load invalid': ({ message }) => `Cannot load the save: ${message}.`,

  // rebase (the CLI's `rebase`).
  'rebase already-current': ({ configVersion }) =>
    `This game already plays under this release's rules, configVersion ${configVersion}.`,

  // dispatch.
  'dispatch guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and sends no one.`,
  'dispatch quest-not-offered': ({ questId }, setting) =>
    `${questCalled(setting, questId)} is not on the Board: it has been taken or has expired, or was never offered.`,
  'dispatch hero-not-on-roster': ({ heroId, guildId }, setting) =>
    `${heroCalled(setting, heroId)} is not on the Roster of ${guildCalled(setting, guildId)}.`,
  'dispatch hero-unavailable': ({ heroId, because }, setting) =>
    `${heroCalled(setting, heroId)} ${unavailableWords[because]} and cannot go.`,
  'dispatch requirement-unmet': ({ questId, unmet }, setting) =>
    `${questCalled(setting, questId)} needs ${unmet.map((each) => requirementWords(each, setting)).join(' and ')}.`,
  'dispatch not-consumable': ({ definitionKey }, setting) =>
    rowOf(setting.content.items, definitionKey) === undefined
      ? `No Item is called "${definitionKey}".`
      : `${itemCalled(setting, definitionKey)} is Gear, not a Consumable: a Party carries Consumables only.`,
  'dispatch not-held-by-guild': ({ guildId, definitionKey }, setting) =>
    `${guildCalled(setting, guildId)} holds no ${itemCalled(setting, definitionKey)} to carry.`,
  'dispatch insufficient-quantity': ({ guildId, definitionKey, held, requested }, setting) =>
    `${guildCalled(setting, guildId)} holds ${held} of ${itemCalled(setting, definitionKey)}, not the ${requested} asked.`,

  // recruit.
  'recruit guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and signs no one.`,
  'recruit hero-not-unattached': ({ heroId }, setting) => `${heroCalled(setting, heroId)} is not in the Unattached pool.`,
  'recruit signing-refused': ({ heroId, fameRequired, fame, shortfall }, setting) =>
    `${heroCalled(setting, heroId)} will not sign for a Guild with less than ${fameRequired} Fame; ` +
    `${playerCalled(setting)} has ${fame}, ${shortfall} short.`,
  'recruit insufficient-wealth': ({ fee, wealth }, setting) =>
    `The signing fee is ${fee} Wealth; ${playerCalled(setting)} has ${wealth}.`,

  // build.
  'build guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and builds nothing.`,
  'build max-grade': ({ facility, grade }, setting) =>
    `${playerCalled(setting)}'s ${facilityNames[facility]} ${facilityIs[facility]} at grade ${grade}, the highest there is.`,
  'build insufficient-wealth': ({ facility, cost, wealth }, setting) =>
    `The next grade of ${playerCalled(setting)}'s ${facilityNames[facility]} costs ${cost} Wealth; ` +
    `${playerCalled(setting)} has ${wealth}.`,

  // equip and unequip.
  'equip guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and equips no one.`,
  'equip hero-not-on-roster': ({ heroId, guildId }, setting) =>
    `${heroCalled(setting, heroId)} is not on ${guildCalled(setting, guildId)}'s Roster.`,
  'equip hero-unavailable': ({ heroId, because }, setting) =>
    `${heroCalled(setting, heroId)} ${gearUnavailableWords[because]}.`,
  'equip not-held-by-guild': ({ itemId, stackId }, setting) =>
    `${playerCalled(setting)} does not hold ${heldCalled(setting, itemId ?? stackId ?? '')}.`,
  'equip not-gear': ({ definitionKey }, setting) =>
    `${itemCalled(setting, definitionKey)} is not Gear, and is carried in no slot.`,
  'equip wrong-slot': ({ definitionKey, slot, gearSlot }, setting) =>
    slot === gearSlot
      ? `${itemCalled(setting, definitionKey)} is ${gearSlot} Gear, and Heroes have no ${gearSlot} slot in this game.`
      : `${itemCalled(setting, definitionKey)} goes in the ${gearSlot} slot, not the ${slot} slot.`,
  'equip slot-occupied': ({ heroId, slot, occupant }, setting) =>
    `${heroCalled(setting, heroId)}'s ${slot} slot holds ${heldCalled(setting, occupant)}: unequip it first.`,
  'unequip guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and unequips no one.`,
  'unequip hero-not-on-roster': ({ heroId, guildId }, setting) =>
    `${heroCalled(setting, heroId)} is not on ${guildCalled(setting, guildId)}'s Roster.`,
  'unequip hero-unavailable': ({ heroId, because }, setting) =>
    `${heroCalled(setting, heroId)} ${gearUnavailableWords[because]}.`,
  'unequip slot-empty': ({ heroId, slot }, setting) => `${heroCalled(setting, heroId)}'s ${slot} slot is empty.`,

  // buy and sell.
  'buy guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and buys nothing.`,
  'buy not-in-market': ({ definitionKey }, setting) => `The Market has no ${itemCalled(setting, definitionKey)} for sale.`,
  'buy insufficient-quantity': ({ definitionKey, quantity, available }, setting) =>
    `The Market has ${available} ${itemCalled(setting, definitionKey)}; ${quantity} cannot be bought.`,
  'buy insufficient-wealth': ({ cost, wealth }, setting) => `That costs ${cost} Wealth; ${playerCalled(setting)} has ${wealth}.`,
  'sell guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and sells nothing.`,
  'sell not-held-by-guild': ({ id }, setting) => `${playerCalled(setting)} holds no ${heldCalled(setting, id)} to sell.`,
  'sell equipped': ({ id, heroId, slot }, setting) =>
    `${heroCalled(setting, heroId)} carries ${heldCalled(setting, id)} as their ${slot}; unequip it first.`,
  'sell unknown-item': ({ definitionKey }, setting) =>
    `The Market cannot price ${itemCalled(setting, definitionKey)}: the content does not define it.`,
  'sell insufficient-quantity': ({ stackId, quantity, available }, setting) =>
    `That stack of ${heldCalled(setting, stackId)} holds ${available}; ${quantity} cannot be sold from it.`,

  // The five Transfer actions (the CLI's `transfer`, `accept` and `decline`; M6-S2).
  'transferIn guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and deals no more.`,
  'transferIn hero-not-on-roster': ({ heroId }, setting) => `${heroCalled(setting, heroId)} is on no other Guild's Roster.`,
  'transferIn same-guild': (_, setting) => `That Hero is already on ${playerCalled(setting)}'s Roster.`,
  'transferIn hero-in-party': ({ heroId }, setting) =>
    `${heroCalled(setting, heroId)} is away with a Party; a Hero is transferred only from the Hall.`,
  'transferIn recently-transferred': ({ heroId, transferredOnTurn, untilTurn }, setting) =>
    `${heroCalled(setting, heroId)} was transferred on Day ${dayOf(transferredOnTurn)} and cannot be transferred again before Day ${dayOf(untilTurn)}.`,
  'transferIn transfer-refused': (rejection, setting) => refusedWords(rejection, setting),
  'transferIn insufficient-wealth': ({ guildId, fee, wealth }, setting) =>
    `The fee is ${fee} Wealth; ${guildCalled(setting, guildId)} has ${wealth}.`,

  'transferOut guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and deals no more.`,
  'transferOut same-guild': (_, setting) => `${playerCalled(setting)} cannot transfer a Hero to itself.`,
  'transferOut hero-not-on-roster': ({ heroId }, setting) =>
    `${heroCalled(setting, heroId)} is not on ${playerCalled(setting)}'s Roster.`,
  'transferOut hero-in-party': ({ heroId }, setting) =>
    `${heroCalled(setting, heroId)} is away with a Party; a Hero is transferred only from the Hall.`,
  'transferOut recently-transferred': ({ heroId, transferredOnTurn, untilTurn }, setting) =>
    `${heroCalled(setting, heroId)} was transferred on Day ${dayOf(transferredOnTurn)} and cannot be transferred again before Day ${dayOf(untilTurn)}.`,
  'transferOut transfer-refused': (rejection, setting) => refusedWords(rejection, setting),
  'transferOut insufficient-wealth': ({ guildId, fee, wealth }, setting) =>
    `The fee is ${fee} Wealth; ${guildCalled(setting, guildId)} has ${wealth}.`,

  'offerTransfer guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and deals no more.`,
  'offerTransfer hero-not-on-roster': ({ heroId }, setting) => `${heroCalled(setting, heroId)} is on no other Guild's Roster.`,
  'offerTransfer same-guild': (_, setting) => `That Hero is already on ${playerCalled(setting)}'s Roster.`,
  'offerTransfer hero-in-party': ({ heroId }, setting) =>
    `${heroCalled(setting, heroId)} is away with a Party; a Hero is transferred only from the Hall.`,
  'offerTransfer recently-transferred': ({ heroId, transferredOnTurn, untilTurn }, setting) =>
    `${heroCalled(setting, heroId)} was transferred on Day ${dayOf(transferredOnTurn)} and cannot be transferred again before Day ${dayOf(untilTurn)}.`,
  'offerTransfer no-offer-needed': ({ guildId }, setting) =>
    `${guildCalled(setting, guildId)} answers a Transfer at once, so no Offer is needed: ask to take the Hero in.`,
  'offerTransfer offer-pending': ({ offerId }, setting) => {
    const offer = rowOf(setting.world?.offers, offerId);
    const hero = offer === undefined ? 'that Hero' : heroCalled(setting, offer.heroId);
    return `${playerCalled(setting)}'s Offer for ${hero} already waits for an answer.`;
  },
  'offerTransfer insufficient-wealth': ({ guildId, fee, wealth }, setting) =>
    `The fee is ${fee} Wealth; ${guildCalled(setting, guildId)} has ${wealth}.`,

  'acceptTransfer guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and deals no more.`,
  'acceptTransfer offer-not-found': (_, setting) => `No such Transfer Offer stands for ${playerCalled(setting)}'s Heroes.`,
  'acceptTransfer hero-in-party': ({ heroId }, setting) =>
    `${heroCalled(setting, heroId)} is away with a Party; a Hero is transferred only from the Hall.`,
  'acceptTransfer insufficient-wealth': ({ guildId, fee, wealth }, setting) =>
    `The fee is ${fee} Wealth; ${guildCalled(setting, guildId)} has ${wealth}.`,
  'declineTransfer guild-folded': ({ guildId }, setting) => `${guildCalled(setting, guildId)} has folded and deals no more.`,
  'declineTransfer offer-not-found': (_, setting) => `No such Transfer Offer stands for ${playerCalled(setting)}'s Heroes.`,
};

/** Every kind the map has words for: the test holds it to the union. */
export const rejectionKinds = Object.freeze(Object.keys(sentences)) as readonly RejectionKind[];

/**
 * `rejection` as a sentence, naming what `world` holds: the world the play was refused in, the
 * state's `document.world`, or `null` when there is no game. A name the world does not hold reads
 * `that Hero`, `that Guild`, and so on, capitalised when it opens the sentence.
 */
export function rejectionSentence(rejection: PlayRejection, world: World | null, content: ContentSet): string {
  const words = sentences[rejectionKind(rejection)] as (rejection: PlayRejection, setting: Setting) => string;
  const sentence = words(rejection, { world, content, player: world === null ? undefined : playerGuild(world) });
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * The save of this browser whose load `rejection` refused, by its name (v1.1.2-S3): the page says why
 * beside that save, in the list the player chose it from. `null` for any other refusal, and for a
 * file loaded from the player's disk.
 */
export function refusedSave(rejection: PlayRejection | null): string | null {
  return rejection !== null && rejection.action === 'load' && 'from' in rejection ? (rejection.from ?? null) : null;
}
