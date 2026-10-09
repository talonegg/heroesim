import { loadContent } from '@heroesim/content/node';
import {
  configVersion,
  createWorld,
  defaultConfig,
  playerGuild,
  type Guild,
  type Hero,
  type World,
} from '@heroesim/engine';
import { makeId } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { sentenceText, type Namer, type Slot } from './narrate.js';
import { endedSentence, refusalKind, refusalKinds, refusalSentence, requirementWords, type Refusal, type RefusalKind, type RefusalSetting } from './refusals.js';

// The refusals' table (DL-240): one sentence for every refusal a play can meet, its names as slots.
// The samples' type is the table's, so a refusal kind the engine adds fails `npm run typecheck` here
// as it does in the table. Each sentence is read through a Namer of the test's own, which writes
// each slot as what it holds, so the table's words and slots are pinned apart from either front
// end's names; `cli/src/namer.test.ts` and `web/src/state/namer.test.ts` hold the CLI's and the page's.

type Samples = { [R in Refusal as RefusalKind<R>]: R };

const content = loadContent();
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
const partyId = makeId('parties', 1);
const ending = { turn: 540, reason: 'bankruptcy' } as const;
const lock = { heroId, transferredOnTurn: 30, untilTurn: 300 };
const fee = { guildId, fee: 180, wealth: 40 };

const samples: Samples = {
  'no-player-guild': { action: 'buy', reason: 'no-player-guild' },
  'game-ended': { action: 'dispatch', reason: 'game-ended', ending },

  'newGame guild-name-blank': { action: 'newGame', reason: 'guild-name-blank' },
  'newGame guildmaster-name-blank': { action: 'newGame', reason: 'guildmaster-name-blank' },
  'newGame unknown-background': { action: 'newGame', reason: 'unknown-background', backgroundKey: 'no-such-background' },
  'newGame unknown-sex': { action: 'newGame', reason: 'unknown-sex', sex: 'other' },
  'newGame age-out-of-range': { action: 'newGame', reason: 'age-out-of-range', age: 51, min: 21, max: 50 },
  'newGame stats-incomplete': { action: 'newGame', reason: 'stats-incomplete', missing: ['coaching', 'judgement'] },
  'newGame stat-out-of-range': { action: 'newGame', reason: 'stat-out-of-range', statKey: 'negotiation', value: 16, min: 5, max: 15 },
  'newGame stats-over-points': { action: 'newGame', reason: 'stats-over-points', spent: 55, points: 50 },
  'newGame unknown-trait': { action: 'newGame', reason: 'unknown-trait', traitKey: 'brave' },
  'newGame repeated-trait': { action: 'newGame', reason: 'repeated-trait', traitKey: 'miser' },
  'newGame too-many-traits': { action: 'newGame', reason: 'too-many-traits', count: 3, max: 2 },
  'newGame excluded-pair': { action: 'newGame', reason: 'excluded-pair', traitKey: 'miser', otherKey: 'well-liked' },
  'newGame over-budget': { action: 'newGame', reason: 'over-budget', cost: 2, budget: 1 },
  'newGame text-too-long': { action: 'newGame', reason: 'text-too-long', attribute: 'appearance', length: 281, max: 280 },
  'newGame unknown-portrait': { action: 'newGame', reason: 'unknown-portrait', portraitKey: 'gm-male-09' },
  'newGame portrait-of-another-sex': { action: 'newGame', reason: 'portrait-of-another-sex', portraitKey: 'gm-male-01', sex: 'female', portraitSex: 'male' },

  'rebase already-current': { action: 'rebase', reason: 'already-current', configVersion },

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
    ],
  },
  'dispatch not-consumable': { action: 'dispatch', reason: 'not-consumable', definitionKey: 'arming-sword' },
  'dispatch not-held-by-guild': { action: 'dispatch', reason: 'not-held-by-guild', guildId, definitionKey: 'whetstone' },
  'dispatch insufficient-quantity': { action: 'dispatch', reason: 'insufficient-quantity', guildId, definitionKey: 'whetstone', held: 1, requested: 3 },

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
  'equip wrong-slot': { action: 'equip', reason: 'wrong-slot', definitionKey: 'arming-sword', slot: 'armour', gearSlot: 'weapon', heroSlots: ['weapon', 'armour'] },
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
  'transferIn hero-in-party': { action: 'transferIn', reason: 'hero-in-party', heroId, partyId },
  'transferIn recently-transferred': { action: 'transferIn', reason: 'recently-transferred', ...lock },
  'transferIn transfer-refused': { action: 'transferIn', reason: 'transfer-refused', guildId: rival.id, heroId: rivalHero.id, side: 'out', because: 'roster-size' },
  'transferIn insufficient-wealth': { action: 'transferIn', reason: 'insufficient-wealth', ...fee },
  'transferOut guild-folded': { action: 'transferOut', reason: 'guild-folded', guildId: rival.id },
  'transferOut same-guild': { action: 'transferOut', reason: 'same-guild', guildId },
  'transferOut hero-not-on-roster': { action: 'transferOut', reason: 'hero-not-on-roster', heroId: rivalHero.id },
  'transferOut hero-in-party': { action: 'transferOut', reason: 'hero-in-party', heroId, partyId },
  'transferOut recently-transferred': { action: 'transferOut', reason: 'recently-transferred', ...lock },
  'transferOut transfer-refused': { action: 'transferOut', reason: 'transfer-refused', guildId: rival.id, heroId, side: 'in', because: 'wealth' },
  'transferOut insufficient-wealth': { action: 'transferOut', reason: 'insufficient-wealth', ...fee, guildId: rival.id },
  'offerTransfer guild-folded': { action: 'offerTransfer', reason: 'guild-folded', guildId: rival.id },
  'offerTransfer hero-not-on-roster': { action: 'offerTransfer', reason: 'hero-not-on-roster', heroId },
  'offerTransfer same-guild': { action: 'offerTransfer', reason: 'same-guild', guildId },
  'offerTransfer hero-in-party': { action: 'offerTransfer', reason: 'hero-in-party', heroId, partyId },
  'offerTransfer recently-transferred': { action: 'offerTransfer', reason: 'recently-transferred', ...lock },
  'offerTransfer no-offer-needed': { action: 'offerTransfer', reason: 'no-offer-needed', guildId: rival.id },
  'offerTransfer offer-pending': { action: 'offerTransfer', reason: 'offer-pending', offerId },
  'offerTransfer insufficient-wealth': { action: 'offerTransfer', reason: 'insufficient-wealth', ...fee },
  'acceptTransfer guild-folded': { action: 'acceptTransfer', reason: 'guild-folded', guildId: rival.id },
  'acceptTransfer offer-not-found': { action: 'acceptTransfer', reason: 'offer-not-found', offerId },
  'acceptTransfer hero-in-party': { action: 'acceptTransfer', reason: 'hero-in-party', heroId, partyId },
  'acceptTransfer insufficient-wealth': { action: 'acceptTransfer', reason: 'insufficient-wealth', ...fee, guildId: rival.id },
  'declineTransfer guild-folded': { action: 'declineTransfer', reason: 'guild-folded', guildId: rival.id },
  'declineTransfer offer-not-found': { action: 'declineTransfer', reason: 'offer-not-found', offerId },
};

const kinds = Object.keys(samples) as RefusalKind[];

/** The test's Namer: each slot as what it holds, `<kind:id|label>`. */
const shown: Namer<string> = (slot: Slot): string => {
  switch (slot.kind) {
    case 'hero':
    case 'name':
      return `<${slot.kind}:${slot.id}${slot.label === undefined ? '' : `|${slot.label}`}>`;
    case 'quest':
      return `<quest:${slot.id}${slot.template === undefined ? '' : `|${slot.template}`}>`;
    case 'ids':
      return `<ids:${slot.ids.join(', ')}>`;
    case 'command':
      return `<command:${slot.command}>`;
    case 'date':
      return `<date:${slot.turn}|${slot.date}>`;
    case 'entry':
      return `<entry:${slot.field}${slot.key === undefined ? '' : `:${slot.key}`}=${JSON.stringify(slot.value)}>`;
    case 'party':
    case 'offer':
    case 'parties':
      return `<${slot.kind}:unexpected>`;
  }
};

/** Content's name for `key` in `rows`. */
function named(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  const row = rows[key];
  if (row === undefined) throw new Error(`the content has no ${key}`);
  return row.name;
}

const setting: RefusalSetting = { world, content, calendar: defaultConfig };
const said = (refusal: Refusal, where = setting): string => sentenceText(refusalSentence(refusal, where), shown);

const lantern = `<name:${player.id}|The Lantern>`;
const other = `<name:${rival.id}|${rival.name}>`;
const brenna = `<hero:${heroId}|${hero.name}>`;
const stranger = `<hero:${rivalHero.id}|${rivalHero.name}>`;
const board = `<quest:${quest.id}|${named(content.questTemplates, quest.templateKey)}>`;
const held = `${named(content.items, stack.definitionKey)}<ids:${stack.id}>`;
const whetstone = named(content.items, 'whetstone');
const sword = named(content.items, 'arming-sword');
const inParty = `${brenna} is away with a Party<ids:${partyId}>; a Hero is transferred only from the Hall.`;
const locked = `${brenna} was transferred on Year 1 Day 11 and cannot be transferred again before Year 1 Day 101.`;
const backgrounds = Object.values(content.backgrounds)
  .filter((row) => row.owner === 'guild')
  .map((row) => `${row.name}<ids:${row.key}>`)
  .join(', ');

/** Every sample's sentence, its words and its slots, in the world it was refused in. */
const exactly: Record<RefusalKind, string> = {
  'no-player-guild': "The save has no player's Guild.",
  'game-ended': `The game ended on <date:540|Year 1 Day 181>: ${lantern} went bankrupt. Nothing more can be done in it.`,

  'newGame guild-name-blank': 'The Guild needs a name<command:name-guild>.',
  'newGame guildmaster-name-blank': 'The Guildmaster needs a name<command:name-guildmaster>.',
  'newGame unknown-background': `No Guild Background is called "no-such-background". Choose one of: ${backgrounds}.`,
  'newGame unknown-sex': `A Guildmaster's Sex is female or male; <entry:sex="other"> is not.`,
  'newGame age-out-of-range': 'A Guildmaster starts aged 21 to 50, in whole Years; <entry:age=51> is not.',
  'newGame stats-incomplete': 'Every Guildmaster Stat is chosen, or none; Coaching and Judgement are not.',
  'newGame stat-out-of-range': "A Guildmaster's Negotiation is 5 to 15 when chosen, in whole numbers; <entry:stats:negotiation=16> is not.",
  'newGame stats-over-points': 'Those Stats spend 55 points, and the Stat points are 50: lower one to raise another.',
  'newGame unknown-trait': 'No Guildmaster Trait is called "brave".',
  'newGame repeated-trait': `${named(content.guildmasterTraits, 'miser')} is chosen twice.`,
  'newGame too-many-traits': 'A Guildmaster holds at most 2 Traits; 3 are chosen.',
  'newGame excluded-pair': `${named(content.guildmasterTraits, 'miser')} and ${named(content.guildmasterTraits, 'well-liked')} exclude each other: a Guildmaster holds one or the other.`,
  'newGame over-budget': 'Those Traits cost 2 points and the budget is 1: a buff costs points and a penalty refunds them.',
  'newGame text-too-long': 'The Appearance is 281 characters long; it holds at most 280.',
  'newGame unknown-portrait': 'No Guildmaster Portrait is called "gm-male-09".',
  'newGame portrait-of-another-sex': "That Portrait is of a male Guildmaster, and your Guildmaster's Sex is female<command:portrait-sex>.",

  'rebase already-current': `This game already plays under this release's rules, configVersion ${configVersion}.`,

  'dispatch guild-folded': `${lantern} has folded and sends no one.`,
  'dispatch quest-not-offered': `${board} is not on the Board: it has been taken or has expired, or was never offered.`,
  'dispatch hero-not-on-roster': `${stranger} is not on the Roster of ${lantern}.`,
  'dispatch hero-unavailable': `${brenna} is injured and cannot go.`,
  'dispatch requirement-unmet': `${board} needs a Party of 2 to 4 Heroes (1 named) and a ${named(content.classes, 'healer')} in the Party.`,
  'dispatch not-consumable': `${sword} is Gear, not a Consumable: a Party carries Consumables only.`,
  'dispatch not-held-by-guild': `${lantern} holds no ${whetstone} to carry.`,
  'dispatch insufficient-quantity': `${lantern} holds 1 of ${whetstone}, not the 3 asked.`,

  'recruit guild-folded': `${lantern} has folded and signs no one.`,
  'recruit hero-not-unattached': `${brenna} is not in the Unattached pool<command:pool-holds>.`,
  'recruit signing-refused': `${brenna} will not sign for a Guild with less than 40 Fame; ${lantern} has 10, 30 short.`,
  'recruit insufficient-wealth': `The signing fee is 900 Wealth; ${lantern} has 500.`,

  'build guild-folded': `${lantern} has folded and builds nothing.`,
  'build max-grade': `${lantern}'s quarters are at grade 3, the highest there is.`,
  'build insufficient-wealth': `The next grade of ${lantern}'s training yard costs 800 Wealth; ${lantern} has 500.`,

  'equip guild-folded': `${lantern} has folded and equips no one.`,
  'equip hero-not-on-roster': `${stranger} is not on ${lantern}'s Roster<command:show-roster>.`,
  'equip hero-unavailable': `${brenna} is away on a Quest, and their Gear is with them.`,
  'equip not-held-by-guild': `${lantern} does not hold ${held}<command:roster-holds>.`,
  'equip not-gear': `${whetstone} is not Gear, and is carried in no slot.`,
  'equip wrong-slot': `${sword} goes in the weapon slot, not the armour slot.`,
  'equip slot-occupied': `${brenna}'s weapon slot holds ${held}: unequip it first.`,
  'unequip guild-folded': `${lantern} has folded and unequips no one.`,
  'unequip hero-not-on-roster': `${stranger} is not on ${lantern}'s Roster<command:show-roster>.`,
  'unequip hero-unavailable': `${brenna} is dead.`,
  'unequip slot-empty': `${brenna}'s trinket slot is empty.`,

  'buy guild-folded': `${lantern} has folded and buys nothing.`,
  'buy not-in-market': `The Market has no ${named(content.items, 'runed-circlet')} for sale<command:show-market>.`,
  'buy insufficient-quantity': `The Market has 1 ${whetstone}; 5 cannot be bought.`,
  'buy insufficient-wealth': `That costs 600 Wealth; ${lantern} has 500.`,
  'sell guild-folded': `${lantern} has folded and sells nothing.`,
  'sell not-held-by-guild': `${lantern} holds no ${held} to sell<command:market-holds>.`,
  'sell equipped': `${brenna} carries ${held} as their weapon; unequip it first.`,
  'sell unknown-item': 'The Market cannot price a-lost-relic: the content does not define it.',
  'sell insufficient-quantity': `That stack of ${held} holds 2; 4 cannot be sold from it.`,

  'transferIn guild-folded': `${other} has folded and deals no more.`,
  'transferIn hero-not-on-roster': `${brenna} is on no other Guild's Roster<command:show-rosters>.`,
  'transferIn same-guild': `That Hero is already on ${lantern}'s Roster.`,
  'transferIn hero-in-party': inParty,
  'transferIn recently-transferred': locked,
  'transferIn transfer-refused': `${other} will not part with ${stranger}: its Roster of ${rival.rosterIds.length} is too small for its appetite for Transfers.`,
  'transferIn insufficient-wealth': `The fee is 180 Wealth; ${lantern} has 40.`,
  'transferOut guild-folded': `${other} has folded and deals no more.`,
  'transferOut same-guild': `${lantern} cannot transfer a Hero to itself.`,
  'transferOut hero-not-on-roster': `${stranger} is not on ${lantern}'s Roster<command:show-roster>.`,
  'transferOut hero-in-party': inParty,
  'transferOut recently-transferred': locked,
  'transferOut transfer-refused': `${other} will not take ${brenna}: it is not rich enough to hire now.`,
  'transferOut insufficient-wealth': `The fee is 180 Wealth; ${other} has 40.`,
  'offerTransfer guild-folded': `${other} has folded and deals no more.`,
  'offerTransfer hero-not-on-roster': `${brenna} is on no other Guild's Roster<command:show-rosters>.`,
  'offerTransfer same-guild': `That Hero is already on ${lantern}'s Roster.`,
  'offerTransfer hero-in-party': inParty,
  'offerTransfer recently-transferred': locked,
  'offerTransfer no-offer-needed': `${other} answers a Transfer at once, so no Offer is needed: ask to take the Hero in.`,
  'offerTransfer offer-pending': `${lantern}'s Offer<ids:${offerId}> for that Hero already waits for an answer.`,
  'offerTransfer insufficient-wealth': `The fee is 180 Wealth; ${lantern} has 40.`,
  'acceptTransfer guild-folded': `${other} has folded and deals no more.`,
  'acceptTransfer offer-not-found': `No such Transfer Offer<ids:${offerId}> stands for ${lantern}'s Heroes<command:show-offers>.`,
  'acceptTransfer hero-in-party': inParty,
  'acceptTransfer insufficient-wealth': `The fee is 180 Wealth; ${other} has 40.`,
  'declineTransfer guild-folded': `${other} has folded and deals no more.`,
  'declineTransfer offer-not-found': `No such Transfer Offer<ids:${offerId}> stands for ${lantern}'s Heroes<command:show-offers>.`,
};

describe('the refusals', () => {
  test('the table has a sentence for exactly the kinds the union holds', () => {
    expect([...refusalKinds].sort()).toEqual([...kinds].sort());
  });

  test.each(kinds)('%s is the kind of its sample', (kind) => {
    expect(refusalKind(samples[kind])).toBe(kind);
  });

  test.each(kinds)('%s is its words and its slots', (kind) => {
    expect(said(samples[kind])).toBe(exactly[kind]);
  });
});

describe('what the slots carry', () => {
  test('a name the world does not hold carries no label, and a Quest no template', () => {
    const none = { ...setting, world: null };

    expect(said(samples['dispatch hero-not-on-roster'], none)).toBe(`<hero:${rivalHero.id}> is not on the Roster of <name:${guildId}>.`);
    expect(said(samples['dispatch quest-not-offered'], none)).toBe(`<quest:${quest.id}> is not on the Board: it has been taken or has expired, or was never offered.`);
    expect(said(samples['equip slot-occupied'], none)).toBe(`<hero:${heroId}>'s weapon slot holds <name:${stack.id}>: unequip it first.`);
  });

  test("the player's Guild is \"your Guild\" in words, with no world to name it from", () => {
    expect(said(samples['recruit insufficient-wealth'], { ...setting, world: null })).toBe('The signing fee is 900 Wealth; your Guild has 500.');
  });

  test("an Offer pending names its Hero while the world holds it", () => {
    const offer = { id: offerId, kind: 'transfer', heroId, fromGuildId: player.id, toGuildId: rival.id, fee: 100, offeredOnTurn: 0, expiresOnTurn: 90 };
    const withOffer = { ...setting, world: { ...world, offers: { [offerId]: offer } } as World };

    expect(said(samples['offerTransfer offer-pending'], withOffer)).toBe(`${lantern}'s Offer<ids:${offerId}> for ${brenna} already waits for an answer.`);
  });

  test('an ending refuses a Turn with "No Turn follows", and any other play with "Nothing more can be done in it"', () => {
    expect(said({ action: 'advance', reason: 'game-ended', ending })).toMatch(/went bankrupt\. No Turn follows\.$/);
    expect(said({ action: 'fastForward', reason: 'game-ended', ending })).toMatch(/No Turn follows\.$/);
    expect(said({ action: 'recruit', reason: 'game-ended', ending })).toMatch(/went bankrupt\. Nothing more can be done in it\.$/);
  });

  // DL-241: the page's header and the CLI's advance say how it ended in the refusal's words.
  test('how the game ended is the refusal after it, without what follows', () => {
    expect(sentenceText(endedSentence(ending, setting), shown)).toBe(`The game ended on <date:540|Year 1 Day 181>: ${lantern} went bankrupt.`);
    expect(sentenceText(endedSentence({ turn: 3, reason: 'roster-wiped' }, { ...setting, world: null }), shown)).toBe(
      'The game ended on <date:3|Year 1 Day 2>: your Guild had its Roster wiped out.',
    );
  });

  test('a Hero Trait asked of a Guildmaster is named as the Trait it is', () => {
    expect(said({ action: 'newGame', reason: 'unknown-trait', traitKey: 'scarred' })).toBe(`${named(content.heroTraits, 'scarred')} is not a Guildmaster Trait.`);
  });

  test('a key the content lacks, asked to be carried, is no Item; one Stat missing "is" not', () => {
    expect(said({ action: 'dispatch', reason: 'not-consumable', definitionKey: 'no-such-item' })).toBe('No Item is called "no-such-item".');
    expect(said({ action: 'newGame', reason: 'stats-incomplete', missing: ['judgement'] })).toBe('Every Guildmaster Stat is chosen, or none; Judgement is not.');
  });

  test('Gear of a slot Heroes do not have says so', () => {
    const refusal = { action: 'equip', reason: 'wrong-slot', definitionKey: 'arming-sword', slot: 'weapon', gearSlot: 'weapon', heroSlots: ['armour'] } satisfies Refusal;

    expect(said(refusal)).toBe(`${sword} is weapon Gear, and Heroes have no weapon slot in this game.`);
  });
});

describe('a Transfer refused or locked (DL-69, DL-214)', () => {
  test.each([
    ['roster-size', `its Roster of ${rival.rosterIds.length} is too small for its appetite for Transfers`],
    ['wealth', 'it is not rich enough to hire now'],
    ['unknown-disposition', 'its Disposition is not one this content knows'],
    ['answers-offers', 'it answers only Transfer Offers'],
  ] as const)('a Guild that will not deal because of %s says why', (because, why) => {
    expect(said({ ...samples['transferIn transfer-refused'], because })).toBe(`${other} will not part with ${stranger}: ${why}.`);
  });

  test('a Guild the world has no row of has a Roster of 0', () => {
    expect(said(samples['transferIn transfer-refused'], { ...setting, world: null })).toBe(
      `<name:${rival.id}> will not part with <hero:${rivalHero.id}>: its Roster of 0 is too small for its appetite for Transfers.`,
    );
  });

  test('a lock that runs into the next Year names its date there', () => {
    expect(said({ ...samples['transferOut recently-transferred'], transferredOnTurn: 30, untilTurn: 1110 })).toBe(
      `${brenna} was transferred on Year 1 Day 11 and cannot be transferred again before Year 2 Day 11.`,
    );
  });
});

describe('a requirement a Party misses, in one wording for the refusal and the preview', () => {
  test.each([
    [{ requirement: 'party-size', size: 5, partySizeMin: 2, partySizeMax: 4 } as const, 'a Party of 2 to 4 Heroes (5 named)'],
    [{ requirement: 'class', classKey: 'healer' } as const, `a ${named(content.classes, 'healer')} in the Party`],
    [{ requirement: 'skill', skillKey: 'lockpicking' } as const, `a Hero with ${named(content.skills, 'lockpicking')} in the Party`],
    [{ requirement: 'class', classKey: 'no-such-class' } as const, 'a no-such-class in the Party'],
  ])('%j', (unmet, words) => {
    expect(requirementWords(unmet, content)).toBe(words);
  });
});
