import {
  createWorld,
  dayOf,
  defaultConfig,
  makeId,
  playerGuild,
  type Guild,
  type Hero,
  type World,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import type { PlayRejection } from './reducer';
import { rejectionKind, rejectionKinds, rejectionSentence, type RejectionKind } from './rejections';

// Every refusal a play can meet renders as a sentence (M7-S2's second box). The samples table's
// type is derived from the union: it needs one sample of every kind of `PlayRejection`, the
// engine's `ActionRejection` and the front end's own, and refuses a kind that is not one, so a kind
// the engine adds fails `npm run typecheck` here, as it does in the map, until both say it.

type Samples = { [Refusal in PlayRejection as RejectionKind<Refusal>]: Refusal };

const { document } = createWorld(
  'rejection-words',
  { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' },
  { config: defaultConfig, content },
);
const world: World = document.world;
const player = playerGuild(world) as Guild;
const rival = Object.values(world.guilds).find((guild) => guild.id !== player.id) as Guild;
const hero = world.heroes[player.rosterIds[0] as Hero['id']] as Hero;
const rivalHero = world.heroes[rival.rosterIds[0] as Hero['id']] as Hero;
const quest = Object.values(world.quests)[0];
if (quest === undefined) throw new Error('the world has no Quest on its Board');
const stack = Object.values(world.stacks)[0];
if (stack === undefined) throw new Error('the world has no stack in its Market');

const guildId = player.id;
const heroId = hero.id;
const offerId = makeId('offers', 1);
const ending = { turn: 540, reason: 'bankruptcy' } as const;
const heroInParty = { heroId, partyId: makeId('parties', 1) };
const lock = { heroId, transferredOnTurn: 30, untilTurn: 300 };
const fee = { guildId, fee: 180, wealth: 40 };

const samples: Samples = {
  'no-game': { action: 'advance', reason: 'no-game' },
  'no-player-guild': { action: 'buy', reason: 'no-player-guild' },
  'game-ended': { action: 'dispatch', reason: 'game-ended', ending },

  'newGame guild-name-blank': { action: 'newGame', reason: 'guild-name-blank' },
  'newGame guildmaster-name-blank': { action: 'newGame', reason: 'guildmaster-name-blank' },
  'newGame unknown-background': { action: 'newGame', reason: 'unknown-background', backgroundKey: 'no-such-background' },
  // The Guildmaster's setup (M9-S2): the engine's setupRefusal, as the page's own.
  'newGame unknown-sex': { action: 'newGame', reason: 'unknown-sex', sex: 'other' },
  'newGame age-out-of-range': { action: 'newGame', reason: 'age-out-of-range', age: 50, min: 30, max: 45 },
  'newGame unknown-trait': { action: 'newGame', reason: 'unknown-trait', traitKey: 'scarred' },
  'newGame repeated-trait': { action: 'newGame', reason: 'repeated-trait', traitKey: 'miser' },
  'newGame too-many-traits': { action: 'newGame', reason: 'too-many-traits', count: 3, max: 2 },
  'newGame excluded-pair': { action: 'newGame', reason: 'excluded-pair', traitKey: 'miser', otherKey: 'well-liked' },
  'newGame over-budget': { action: 'newGame', reason: 'over-budget', cost: 2, budget: 1 },
  'newGame text-too-long': { action: 'newGame', reason: 'text-too-long', attribute: 'appearance', length: 281, max: 280 },
  'load malformed-json': { action: 'load', reason: 'malformed-json', message: 'The save is not JSON: Unexpected token' },
  'load not-a-document': { action: 'load', reason: 'not-a-document', message: 'The save has no whole-number meta.version' },
  'load unsupported-version': { action: 'load', reason: 'unsupported-version', message: 'The save is schema version 9' },
  'load invalid': { action: 'load', reason: 'invalid', message: 'The save fails the validator (shape): meta.seed' },

  'rebase already-current': { action: 'rebase', reason: 'already-current', configVersion: defaultConfig.configVersion },

  'dispatch guild-folded': { action: 'dispatch', reason: 'guild-folded', guildId },
  'dispatch quest-not-offered': { action: 'dispatch', reason: 'quest-not-offered', questId: quest.id },
  'dispatch hero-not-on-roster': { action: 'dispatch', reason: 'hero-not-on-roster', heroId: rivalHero.id, guildId },
  'dispatch hero-unavailable': { action: 'dispatch', reason: 'hero-unavailable', heroId, because: 'injured' },
  'dispatch requirement-unmet': {
    action: 'dispatch',
    reason: 'requirement-unmet',
    questId: quest.id,
    unmet: [
      { requirement: 'party-size', size: 1, partySizeMin: 2, partySizeMax: 4 },
      { requirement: 'class', classKey: 'healer' },
      { requirement: 'skill', skillKey: 'lockpicking' },
    ],
  },
  'dispatch not-consumable': { action: 'dispatch', reason: 'not-consumable', definitionKey: 'arming-sword' },
  'dispatch not-held-by-guild': { action: 'dispatch', reason: 'not-held-by-guild', guildId, definitionKey: 'whetstone' },
  'dispatch insufficient-quantity': {
    action: 'dispatch',
    reason: 'insufficient-quantity',
    guildId,
    definitionKey: 'whetstone',
    held: 1,
    requested: 3,
  },

  'recruit guild-folded': { action: 'recruit', reason: 'guild-folded', guildId },
  'recruit hero-not-unattached': { action: 'recruit', reason: 'hero-not-unattached', heroId },
  'recruit signing-refused': { action: 'recruit', reason: 'signing-refused', heroId, fameRequired: 40, fame: 10, shortfall: 30 },
  'recruit insufficient-wealth': { action: 'recruit', reason: 'insufficient-wealth', fee: 900, wealth: 500 },

  'build guild-folded': { action: 'build', reason: 'guild-folded', guildId },
  'build max-grade': { action: 'build', reason: 'max-grade', facility: 'quarters', grade: 3 },
  'build insufficient-wealth': { action: 'build', reason: 'insufficient-wealth', facility: 'trainingYard', cost: 800, wealth: 500 },

  'equip guild-folded': { action: 'equip', reason: 'guild-folded', guildId },
  'equip hero-not-on-roster': { action: 'equip', reason: 'hero-not-on-roster', heroId: rivalHero.id, guildId },
  'equip hero-unavailable': { action: 'equip', reason: 'hero-unavailable', heroId, because: 'in-party' },
  'equip not-held-by-guild': { action: 'equip', reason: 'not-held-by-guild', itemId: null, stackId: stack.id },
  'equip not-gear': { action: 'equip', reason: 'not-gear', definitionKey: 'whetstone' },
  'equip wrong-slot': {
    action: 'equip',
    reason: 'wrong-slot',
    definitionKey: 'arming-sword',
    slot: 'armour',
    gearSlot: 'weapon',
    heroSlots: ['weapon', 'armour', 'trinket'],
  },
  'equip slot-occupied': { action: 'equip', reason: 'slot-occupied', heroId, slot: 'weapon', occupant: stack.id },
  'unequip guild-folded': { action: 'unequip', reason: 'guild-folded', guildId },
  'unequip hero-not-on-roster': { action: 'unequip', reason: 'hero-not-on-roster', heroId: rivalHero.id, guildId },
  'unequip hero-unavailable': { action: 'unequip', reason: 'hero-unavailable', heroId, because: 'dead' },
  'unequip slot-empty': { action: 'unequip', reason: 'slot-empty', heroId, slot: 'trinket' },

  'buy guild-folded': { action: 'buy', reason: 'guild-folded', guildId },
  'buy not-in-market': { action: 'buy', reason: 'not-in-market', definitionKey: 'runed-circlet' },
  'buy insufficient-quantity': { action: 'buy', reason: 'insufficient-quantity', definitionKey: 'whetstone', quantity: 5, available: 1 },
  'buy insufficient-wealth': { action: 'buy', reason: 'insufficient-wealth', cost: 600, wealth: 500 },
  'sell guild-folded': { action: 'sell', reason: 'guild-folded', guildId },
  'sell not-held-by-guild': { action: 'sell', reason: 'not-held-by-guild', id: stack.id },
  'sell equipped': { action: 'sell', reason: 'equipped', id: stack.id, heroId, slot: 'weapon' },
  'sell unknown-item': { action: 'sell', reason: 'unknown-item', definitionKey: 'a-lost-relic' },
  'sell insufficient-quantity': { action: 'sell', reason: 'insufficient-quantity', stackId: stack.id, quantity: 4, available: 2 },

  'transferIn guild-folded': { action: 'transferIn', reason: 'guild-folded', guildId: rival.id },
  'transferIn hero-not-on-roster': { action: 'transferIn', reason: 'hero-not-on-roster', heroId },
  'transferIn same-guild': { action: 'transferIn', reason: 'same-guild', guildId },
  'transferIn hero-in-party': { action: 'transferIn', reason: 'hero-in-party', ...heroInParty },
  'transferIn recently-transferred': { action: 'transferIn', reason: 'recently-transferred', ...lock },
  'transferIn transfer-refused': {
    action: 'transferIn',
    reason: 'transfer-refused',
    guildId: rival.id,
    heroId: rivalHero.id,
    side: 'out',
    because: 'roster-size',
  },
  'transferIn insufficient-wealth': { action: 'transferIn', reason: 'insufficient-wealth', ...fee },
  'transferOut guild-folded': { action: 'transferOut', reason: 'guild-folded', guildId: rival.id },
  'transferOut same-guild': { action: 'transferOut', reason: 'same-guild', guildId },
  'transferOut hero-not-on-roster': { action: 'transferOut', reason: 'hero-not-on-roster', heroId: rivalHero.id },
  'transferOut hero-in-party': { action: 'transferOut', reason: 'hero-in-party', ...heroInParty },
  'transferOut recently-transferred': { action: 'transferOut', reason: 'recently-transferred', ...lock },
  'transferOut transfer-refused': {
    action: 'transferOut',
    reason: 'transfer-refused',
    guildId: rival.id,
    heroId,
    side: 'in',
    because: 'wealth',
  },
  'transferOut insufficient-wealth': { action: 'transferOut', reason: 'insufficient-wealth', ...fee, guildId: rival.id },
  'offerTransfer guild-folded': { action: 'offerTransfer', reason: 'guild-folded', guildId: rival.id },
  'offerTransfer hero-not-on-roster': { action: 'offerTransfer', reason: 'hero-not-on-roster', heroId },
  'offerTransfer same-guild': { action: 'offerTransfer', reason: 'same-guild', guildId },
  'offerTransfer hero-in-party': { action: 'offerTransfer', reason: 'hero-in-party', ...heroInParty },
  'offerTransfer recently-transferred': { action: 'offerTransfer', reason: 'recently-transferred', ...lock },
  'offerTransfer no-offer-needed': { action: 'offerTransfer', reason: 'no-offer-needed', guildId: rival.id },
  'offerTransfer offer-pending': { action: 'offerTransfer', reason: 'offer-pending', offerId },
  'offerTransfer insufficient-wealth': { action: 'offerTransfer', reason: 'insufficient-wealth', ...fee },
  'acceptTransfer guild-folded': { action: 'acceptTransfer', reason: 'guild-folded', guildId: rival.id },
  'acceptTransfer offer-not-found': { action: 'acceptTransfer', reason: 'offer-not-found', offerId },
  'acceptTransfer hero-in-party': { action: 'acceptTransfer', reason: 'hero-in-party', ...heroInParty },
  'acceptTransfer insufficient-wealth': { action: 'acceptTransfer', reason: 'insufficient-wealth', ...fee, guildId: rival.id },
  'declineTransfer guild-folded': { action: 'declineTransfer', reason: 'guild-folded', guildId: rival.id },
  'declineTransfer offer-not-found': { action: 'declineTransfer', reason: 'offer-not-found', offerId },
};

const kinds = Object.keys(samples) as RejectionKind[];

/** Content's name for `key` in `rows`, as the sentence reads it. */
function named(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  const row = rows[key];
  if (row === undefined) throw new Error(`the content has no ${key}`);
  return row.name;
}

const questName = named(content.questTemplates, quest.templateKey);
const stackName = named(content.items, stack.definitionKey);
const whetstone = named(content.items, 'whetstone');
const sword = named(content.items, 'arming-sword');
const inParty = `${hero.name} is away with a Party; a Hero is transferred only from the Hall.`;
const locked = `${hero.name} was transferred on Day ${dayOf(30)} and cannot be transferred again before Day ${dayOf(300)}.`;
const guildBackgrounds = Object.values(content.backgrounds)
  .filter((row) => row.owner === 'guild')
  .map((row) => row.name)
  .join(', ');

/**
 * Every sample's sentence in the world it was refused in, word for word: the CLI's words
 * (`cli/src/commands/*.ts`) less its ids and pointers (DL-65 item 6). Pinned whole, so a sentence
 * with two numbers swapped, the wrong slot or grade, or one word for another, fails (M7
 * verification, DL-74).
 */
const exactly: Record<RejectionKind, string> = {
  'no-game': 'No game is in hand: start a new game or load a save.',
  'no-player-guild': "The save has no player's Guild.",
  'game-ended': `The game ended on Day ${dayOf(ending.turn)}: The Lantern went bankrupt. Nothing more can be done in it.`,

  'newGame guild-name-blank': 'The Guild needs a name.',
  'newGame guildmaster-name-blank': 'The Guildmaster needs a name.',
  'newGame unknown-background': `No Guild Background is called "no-such-background". Choose one of: ${guildBackgrounds}.`,
  'newGame unknown-sex': `A Guildmaster's sex is female or male; "other" is not.`,
  'newGame age-out-of-range': 'A Guildmaster starts aged 30 to 45, in whole years; 50 is not.',
  'newGame unknown-trait': `${named(content.traits, 'scarred')} is not a Guildmaster Trait.`,
  'newGame repeated-trait': `${named(content.traits, 'miser')} is chosen twice.`,
  'newGame too-many-traits': 'A Guildmaster holds at most 2 Traits; 3 are chosen.',
  'newGame excluded-pair': `${named(content.traits, 'miser')} and ${named(content.traits, 'well-liked')} exclude each other: a Guildmaster holds one or the other.`,
  'newGame over-budget': 'Those Traits cost 2 points and the budget is 1: a buff costs points and a penalty refunds them.',
  'newGame text-too-long': 'The Appearance is 281 characters long; it holds at most 280.',
  'load malformed-json': 'Cannot load the save: The save is not JSON: Unexpected token.',
  'load not-a-document': 'Cannot load the save: The save has no whole-number meta.version.',
  'load unsupported-version': 'Cannot load the save: The save is schema version 9.',
  'load invalid': 'Cannot load the save: The save fails the validator (shape): meta.seed.',

  'rebase already-current': `This game already plays under this release's rules, configVersion ${defaultConfig.configVersion}.`,

  'dispatch guild-folded': 'The Lantern has folded and sends no one.',
  'dispatch quest-not-offered': `${questName} is not on the Board: it has been taken or has expired, or was never offered.`,
  'dispatch hero-not-on-roster': `${rivalHero.name} is not on the Roster of The Lantern.`,
  'dispatch hero-unavailable': `${hero.name} is injured and cannot go.`,
  'dispatch requirement-unmet':
    `${questName} needs a Party of 2 to 4 Heroes (1 named) and a ${named(content.classes, 'healer')} in the Party ` +
    `and a Hero with ${named(content.skills, 'lockpicking')} in the Party.`,
  'dispatch not-consumable': `${sword} is gear, not a consumable: a Party carries consumables only.`,
  'dispatch not-held-by-guild': `The Lantern holds no ${whetstone} to carry.`,
  'dispatch insufficient-quantity': `The Lantern holds 1 of ${whetstone}, not the 3 asked.`,

  'recruit guild-folded': 'The Lantern has folded and signs no one.',
  'recruit hero-not-unattached': `${hero.name} is not in the Unattached pool.`,
  'recruit signing-refused': `${hero.name} will not sign for a Guild with less than 40 Fame; The Lantern has 10, 30 short.`,
  'recruit insufficient-wealth': 'The signing fee is 900 Wealth; The Lantern has 500.',

  'build guild-folded': 'The Lantern has folded and builds nothing.',
  'build max-grade': "The Lantern's quarters are at grade 3, the highest there is.",
  'build insufficient-wealth': "The next grade of The Lantern's training yard costs 800 Wealth; The Lantern has 500.",

  'equip guild-folded': 'The Lantern has folded and equips no one.',
  'equip hero-not-on-roster': `${rivalHero.name} is not on The Lantern's Roster.`,
  'equip hero-unavailable': `${hero.name} is away on a Quest, and their gear is with them.`,
  'equip not-held-by-guild': `The Lantern does not hold ${stackName}.`,
  'equip not-gear': `${whetstone} is not gear, and is carried in no slot.`,
  'equip wrong-slot': `${sword} goes in the weapon slot, not the armour slot.`,
  'equip slot-occupied': `${hero.name}'s weapon slot holds ${stackName}: unequip it first.`,
  'unequip guild-folded': 'The Lantern has folded and unequips no one.',
  'unequip hero-not-on-roster': `${rivalHero.name} is not on The Lantern's Roster.`,
  'unequip hero-unavailable': `${hero.name} is dead.`,
  'unequip slot-empty': `${hero.name}'s trinket slot is empty.`,

  'buy guild-folded': 'The Lantern has folded and buys nothing.',
  'buy not-in-market': `The Market has no ${named(content.items, 'runed-circlet')} for sale.`,
  'buy insufficient-quantity': `The Market has 1 ${whetstone}; 5 cannot be bought.`,
  'buy insufficient-wealth': 'That costs 600 Wealth; The Lantern has 500.',
  'sell guild-folded': 'The Lantern has folded and sells nothing.',
  'sell not-held-by-guild': `The Lantern holds no ${stackName} to sell.`,
  'sell equipped': `${hero.name} carries ${stackName} as their weapon; unequip it first.`,
  'sell unknown-item': 'The Market cannot price a-lost-relic: the content does not define it.',
  'sell insufficient-quantity': `That stack of ${stackName} holds 2; 4 cannot be sold from it.`,

  'transferIn guild-folded': `${rival.name} has folded and deals no more.`,
  'transferIn hero-not-on-roster': `${hero.name} is on no other Guild's Roster.`,
  'transferIn same-guild': "That Hero is already on The Lantern's Roster.",
  'transferIn hero-in-party': inParty,
  'transferIn recently-transferred': locked,
  'transferIn transfer-refused': `${rival.name} will not part with ${rivalHero.name}: its Roster of ${rival.rosterIds.length} is too small for its appetite for Transfers.`,
  'transferIn insufficient-wealth': 'The fee is 180 Wealth; The Lantern has 40.',
  'transferOut guild-folded': `${rival.name} has folded and deals no more.`,
  'transferOut same-guild': 'The Lantern cannot transfer a Hero to itself.',
  'transferOut hero-not-on-roster': `${rivalHero.name} is not on The Lantern's Roster.`,
  'transferOut hero-in-party': inParty,
  'transferOut recently-transferred': locked,
  'transferOut transfer-refused': `${rival.name} will not take ${hero.name}: it is not rich enough to hire now.`,
  'transferOut insufficient-wealth': `The fee is 180 Wealth; ${rival.name} has 40.`,
  'offerTransfer guild-folded': `${rival.name} has folded and deals no more.`,
  'offerTransfer hero-not-on-roster': `${hero.name} is on no other Guild's Roster.`,
  'offerTransfer same-guild': "That Hero is already on The Lantern's Roster.",
  'offerTransfer hero-in-party': inParty,
  'offerTransfer recently-transferred': locked,
  'offerTransfer no-offer-needed': `${rival.name} answers a Transfer at once, so no offer is needed: ask to take the Hero in.`,
  'offerTransfer offer-pending': "The Lantern's offer for that Hero already waits for an answer.",
  'offerTransfer insufficient-wealth': 'The fee is 180 Wealth; The Lantern has 40.',
  'acceptTransfer guild-folded': `${rival.name} has folded and deals no more.`,
  'acceptTransfer offer-not-found': "No such Transfer Offer stands for The Lantern's Heroes.",
  'acceptTransfer hero-in-party': inParty,
  'acceptTransfer insufficient-wealth': `The fee is 180 Wealth; ${rival.name} has 40.`,
  'declineTransfer guild-folded': `${rival.name} has folded and deals no more.`,
  'declineTransfer offer-not-found': "No such Transfer Offer stands for The Lantern's Heroes.",
};

/** An entity id, which a refusal never shows: the player types none (DL-65 item 6). */
const anId = /\b(guild|guildmaster|hero|patron|quest|party|offer|item|stack)-\d{6}\b/i;

/** A sentence: something said, from a capital or a quotation, to a full stop, with no hole left in it. */
function expectASentence(sentence: string): void {
  expect(sentence).toMatch(/^[A-Z"].*\S\.$/s);
  expect(sentence).not.toMatch(/undefined|null|NaN|\[object|\$\{/);
}

describe('the words for every refusal', () => {
  test('the map has words for exactly the kinds the union holds', () => {
    expect([...rejectionKinds].sort()).toEqual([...kinds].sort());
  });

  test.each(kinds)('%s is the kind of its sample', (kind) => {
    expect(rejectionKind(samples[kind])).toBe(kind);
  });

  test.each(kinds)('%s renders as a sentence in the world it was refused in', (kind) => {
    expectASentence(rejectionSentence(samples[kind], world, content));
  });

  test.each(kinds)('%s renders as a sentence with no world to name from', (kind) => {
    expectASentence(rejectionSentence(samples[kind], null, content));
  });

  test.each(kinds)('%s says exactly what the CLI says, less its ids and pointers', (kind) => {
    expect(rejectionSentence(samples[kind], world, content)).toBe(exactly[kind]);
  });

  test.each(kinds)('%s shows no id, with a world or without one: a name the world does not hold is "that Hero" or the like', (kind) => {
    expect(rejectionSentence(samples[kind], world, content)).not.toMatch(anId);
    expect(rejectionSentence(samples[kind], null, content)).not.toMatch(anId);
  });
});

describe('with no world to name from', () => {
  test('a Hero, a Guild, a Quest, an Item and the player are what they are, never an id', () => {
    const words = (kind: RejectionKind): string => rejectionSentence(samples[kind], null, content);

    expect(words('dispatch hero-not-on-roster')).toBe('That Hero is not on the Roster of that Guild.');
    expect(words('dispatch quest-not-offered')).toBe('That Quest is not on the Board: it has been taken or has expired, or was never offered.');
    expect(words('equip slot-occupied')).toBe("That Hero's weapon slot holds that Item: unequip it first.");
    expect(words('recruit insufficient-wealth')).toBe('The signing fee is 900 Wealth; your Guild has 500.');
  });
});

describe('what the words name', () => {
  test('a Hero and a Guild by their names, not their ids', () => {
    const sentence = rejectionSentence(samples['dispatch hero-not-on-roster'], world, content);

    expect(sentence).toContain(rivalHero.name);
    expect(sentence).toContain(player.name);
    expect(sentence).not.toContain(rivalHero.id);
  });

  test('a Trait content lacks by the key chosen (M9-S2)', () => {
    expect(rejectionSentence({ action: 'newGame', reason: 'unknown-trait', traitKey: 'brave' }, null, content)).toBe(
      'No Guildmaster Trait is called "brave".',
    );
  });

  test('a Quest by its template, and Items by their content names', () => {
    const template = content.questTemplates[quest.templateKey];

    expect(rejectionSentence(samples['dispatch quest-not-offered'], world, content)).toContain(template?.name);
    expect(rejectionSentence(samples['buy not-in-market'], world, content)).toContain(content.items['runed-circlet']?.name);
  });

  test('a Transfer refused by the side the other Guild was asked to take', () => {
    const partWith = rejectionSentence(samples['transferIn transfer-refused'], world, content);
    const take = rejectionSentence(samples['transferOut transfer-refused'], world, content);

    expect(partWith).toContain(`${rival.name} will not part with ${rivalHero.name}`);
    expect(take).toContain(`${rival.name} will not take ${hero.name}`);
  });

  test('an ending refuses a Turn and an action in the words the CLI adds to each', () => {
    const turn = rejectionSentence({ action: 'advance', reason: 'game-ended', ending }, world, content);
    const action = rejectionSentence({ action: 'recruit', reason: 'game-ended', ending }, world, content);

    expect(turn).toMatch(/No Turn follows\.$/);
    expect(action).toMatch(/Nothing more can be done in it\.$/);
    expect(action).toContain(`${player.name} went bankrupt`);
    // The page names Days, never Turn numbers: the Day the header gives for the same ending.
    expect(action).toMatch(new RegExp(`^The game ended on Day ${dayOf(ending.turn)}: `));
  });
});
