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
});

describe('what the words name', () => {
  test('a Hero and a Guild by their names, not their ids', () => {
    const sentence = rejectionSentence(samples['dispatch hero-not-on-roster'], world, content);

    expect(sentence).toContain(rivalHero.name);
    expect(sentence).toContain(player.name);
    expect(sentence).not.toContain(rivalHero.id);
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
