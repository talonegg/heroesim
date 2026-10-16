// Games in a given state, for the page's tests (DL-73). Tests outside `state/` take
// only types from the engine, so the setups that need its values live here:
// a Transfer Offer standing, rules behind this release's, Items held, Wealth, Heroes dead and
// retired (DL-74); the Roster released, and a Party out, for fast forward's steps (DL-96); and the
// helpers the state tests share. Never imported by the page, so never bundled.

import {
  addStack,
  advance,
  applyAction,
  availableHeroes,
  bestParties,
  configVersion,
  createWorld,
  dayOf,
  defaultConfig,
  durationDaysOf,
  estimateQuest,
  holdings,
  isMilestone,
  moraleBand,
  offeredQuests,
  playerGuild,
  serialise,
  type ConsumableRequest,
  type ConsumableUse,
  type Degree,
  type EncounterOutcome,
  type EncounterResult,
  type EngineEvent,
  type FormDecided,
  type Guild,
  type Hero,
  type HeroId,
  type InjuryTypeKey,
  type ItemDefinitionKey,
  type MoraleBand,
  type PartyId,
  type PatronId,
  type Quest,
  type QuestBand,
  type QuestEstimate,
  type QuestId,
  type QuestTemplateKey,
  type RegardBand,
  type Resolution,
  type SlotKey,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { append, createItem, playReturnNight, xpForLevel } from '@heroesim/engine/testing';
import { expect } from 'vitest';
import { content } from '../content';
import { gameReducer, initialGameState, playDeps, type GameState, type Play } from './reducer';

/** Plays `action` as the page does, accepted then settled, a fast forward step by step, outside React. */
export function played(state: GameState, action: Play): GameState {
  let next = gameReducer(state, action);
  while (next.pending !== null) next = gameReducer(next, { kind: 'settle' });
  return next;
}

/** A new game of The Lantern, led by Ada Vell, from `seed`. */
export function started(seed = 'app-test'): GameState {
  return played(initialGameState, {
    kind: 'newGame',
    seed,
    guildName: 'The Lantern',
    guildmasterName: 'Ada Vell',
    createdAt: '2026-09-27T09:00:00.000Z',
  });
}

/** The game in hand's document; a test with no game in hand fails here. */
export function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('no game in hand');
  return state.document;
}

/** The band `morale` is in under `document`'s config (a view's test takes no values from the engine). */
export function moraleBandIn(document: WorldDocument, morale: number): MoraleBand {
  return moraleBand(morale, document.meta.config);
}

/** The player's Guild in `document`. */
export function playerOf(document: WorldDocument): Guild {
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error("no player's Guild");
  return guild;
}

/** An entity id, which a sentence the player reads never shows: the player types none (DL-65 item 6). */
export const anId = /\b(guild|guildmaster|hero|patron|quest|party|offer|item|stack)-\d{6}\b/i;

/** What a line of narration in the page must be: one line, a full stop, no id, nothing left unfilled. */
export function expectASentence(line: string): void {
  expect(line).toMatch(/^[A-Z0-9].*\.$/);
  expect(line).not.toContain('\n');
  expect(line).not.toMatch(/undefined|null|NaN|\[object/);
  expect(line).not.toMatch(anId);
}

/** The new game's setup the page's tests found: The Lantern, led by Ada Vell. */
export const newGameSetup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' };

/** A new game's document from `seed`, as the engine creates it under the default rules and the page's content. */
export function newDocument(seed: string): WorldDocument {
  return createWorld(seed, newGameSetup, { config: defaultConfig, content }).document;
}

/**
 * The default rules with every Tier unlocked from Level 0, which a game carries as its rules: so that a
 * new game's first Board may draw each Tier a template offers, its longer and harder Quests among them,
 * whatever Tiers the opening's best fours unlock (DL-271, DL-273), as the e2e's Board does (DL-272).
 */
export const everyTierOpen = { ...defaultConfig, tiers: defaultConfig.tiers.map((tier) => ({ ...tier, unlockLevel: 0 })) };

/** A new game of The Lantern, led by Ada Vell, from `seed`, as `started` gives, under rules opening every Tier: loaded as its save. */
export function startedWithEveryTier(seed: string): GameState {
  const { document } = createWorld(seed, newGameSetup, { config: everyTierOpen, content });
  return played(initialGameState, { kind: 'load', text: serialise(document) });
}

/** A new game from `seed` played `turns` Turns by the engine's `advance`, and the events of the last of them. */
export function playedDocument(seed: string, turns: number): { document: WorldDocument; log: TurnEvent[] } {
  const deps = { config: defaultConfig, content };
  let document = newDocument(seed);
  let log: TurnEvent[] = [];
  for (let turn = 0; turn < turns; turn += 1) {
    const result = advance(document, deps);
    document = result.document;
    log = result.events;
  }
  return { document, log };
}

/** `state` with its world changed by `change` on a copy: the document the page holds is never written to. */
export function changed(state: GameState, change: (document: WorldDocument, player: Guild) => void): GameState {
  const document = structuredClone(documentOf(state));
  change(document, playerOf(document));
  return { ...state, document };
}

/**
 * `state` with the player's first Hero holding the Hero Trait Lame, and a Trait they gained on a Quest
 * the History names and one they lost to Lame written to the History as the engine writes them, Milestones
 * both, at the Turn the world stands on: the gain as `quests-conclude.ts` emits it, naming the
 * Hero and the Quest, the loss as `hero-state.ts` does, naming the Hero; `emit` appends the Hero's Guild
 * to each.
 */
export function withTraitNews(state: GameState): GameState {
  return changed(state, (document, player) => {
    const hero = document.world.heroes[player.rosterIds[0] as HeroId];
    if (hero === undefined) throw new Error('an empty Roster');
    hero.traits = ['lame'];
    const offered = document.history.entries.find((entry) => entry.type === 'quest.offered');
    const questId = (offered?.payload as { questId: QuestId } | undefined)?.questId ?? ('quest-000001' as QuestId);
    const labels = { [hero.id]: hero.name, [player.id]: player.name };
    const turn = document.world.turn;
    const gained = { heroId: hero.id, traitKey: 'scarred', questId, encounterIndex: 0, encounterKey: 'ambush-on-the-road' };
    append(document.history, { turn, type: 'hero.trait-gained', participants: [hero.id, questId, player.id], labels, milestone: isMilestone('hero.trait-gained', gained), payload: gained });
    const lost = { heroId: hero.id, traitKey: 'scarred', replacedBy: 'lame' };
    append(document.history, { turn, type: 'hero.trait-lost', participants: [hero.id, player.id], labels, milestone: isMilestone('hero.trait-lost', lost), payload: lost });
  });
}

/** The player's Guild holding `quantity` of `definitionKey` besides what it held. */
export function holding(state: GameState, definitionKey: ItemDefinitionKey, quantity: number): GameState {
  return changed(state, (document, player) => addStack(document.world, definitionKey, quantity, { kind: 'guild', id: player.id }));
}

/** The Market selling `stock` alone, each Item by its quantity, in place of what it had for sale. */
export function selling(state: GameState, stock: Readonly<Record<string, number>>): GameState {
  return changed(state, (document) => {
    for (const stack of holdings(document.world, { kind: 'market' }).stacks) delete document.world.stacks[stack.id];
    for (const [key, quantity] of Object.entries(stock)) addStack(document.world, key as ItemDefinitionKey, quantity, { kind: 'market' });
  });
}

/**
 * `state` with `purchases` Whetstones bought at the Market one at a time, then `sales` of them sold one at
 * a time, each a row of the player's ledger, a purchase an expense and a sale an income: the rows a
 * ledger pages by, with no Turn played. The Guild is given the Wealth to buy them.
 */
export function withTrades(state: GameState, purchases: number, sales = 0): GameState {
  const taken = (at: GameState, action: Play): GameState => {
    const after = played(at, action);
    if (after.rejection !== null) throw new Error(`${action.kind} refused: ${after.rejection.reason}`);
    return after;
  };
  let next = selling(withWealth(state, 100_000), { whetstone: purchases });
  for (let bought = 0; bought < purchases; bought += 1) next = taken(next, { kind: 'buy', definitionKey: 'whetstone', quantity: 1 });
  for (let sold = 0; sold < sales; sold += 1) {
    const document = documentOf(next);
    const [stack] = holdings(document.world, { kind: 'guild', id: playerOf(document).id }).stacks.filter((each) => each.definitionKey === 'whetstone');
    if (stack === undefined) throw new Error('no Whetstone to sell');
    next = taken(next, { kind: 'sell', stackId: stack.id, quantity: 1 });
  }
  return next;
}

/**
 * The player's Guild holding one unique Item of `definitionKey` besides what it held, as Loot leaves
 * one: an Item of its own, which the CLI names by `--item`.
 */
export function holdingUnique(state: GameState, definitionKey: ItemDefinitionKey): GameState {
  return changed(state, (document, player) => void createItem(document.world, definitionKey, { kind: 'guild', id: player.id }));
}

/** The player's first Hero carrying one `definitionKey` in `slot`, as gear equipped leaves it. */
export function carrying(state: GameState, definitionKey: ItemDefinitionKey, slot: SlotKey): GameState {
  return changed(state, (document, player) => {
    const [first] = player.rosterIds;
    if (first === undefined) throw new Error('no Hero on the Roster');
    addStack(document.world, definitionKey, 1, { kind: 'hero', id: first, slot });
  });
}

/**
 * The player's first Hero carrying one unique Item of `definitionKey` in `slot`, as one equipped leaves it;
 * or the Hero `at` that place in the order they joined.
 */
export function carryingUnique(state: GameState, definitionKey: ItemDefinitionKey, slot: SlotKey, at = 0): GameState {
  return changed(state, (document, player) => {
    const hero = player.rosterIds[at];
    if (hero === undefined) throw new Error(`no Hero at ${at} on the Roster`);
    createItem(document.world, definitionKey, { kind: 'hero', id: hero, slot });
  });
}

/**
 * The player's Guild with `wealth` Wealth; and, given `belowFloorSince`, below the Bankruptcy floor
 * since that Turn, as a Guild that fell below it before the play to come: its countdown stands, and
 * no new crossing stops a fast forward (DL-101).
 */
export function withWealth(state: GameState, wealth: number, belowFloorSince?: number): GameState {
  return changed(state, (_, player) => {
    player.wealth = wealth;
    if (belowFloorSince !== undefined) player.belowFloorSince = belowFloorSince;
  });
}

/**
 * The player's Roster released to the Unattached pool, as a fold releases a Rival's (DL-28), and
 * `wealth` to spare: no Party of theirs comes home, no decision is needed and no offer made for a
 * Hero of theirs, so a fast forward plays its whole cap unless the pool, a module or the end stops it.
 */
export function withRosterReleased(state: GameState, wealth = 1_000_000): GameState {
  return changed(state, (document, player) => {
    for (const heroId of player.rosterIds) {
      Object.assign(document.world.heroes[heroId] as Hero, { guildId: null, unattachedSince: document.world.turn, contract: null });
    }
    player.rosterIds = [];
    player.wealth = wealth;
  });
}

/**
 * A Party of the player's out on the longest Quest on the Board the Roster can staff, sent by the
 * page's own dispatch: while it is out no decision is needed, so a fast forward stops when it
 * comes home (or for an offer, or at the end). The Party is the Best Party at the player's margin of 1,
 * the fewest the Quest allows, so that Heroes stay at home to staff what comes next: at least
 * `atHome` of them, for a test that needs a Party of them, two or more (DL-266).
 */
export function withPartyOut(state: GameState, atHome = 0): GameState {
  const document = documentOf(state);
  const available = availableHeroes(document.world, playerOf(document));
  const deps = playDeps(document);
  const fewest = { ...deps, config: { ...deps.config, playerPartyMargin: 1 } };
  const [longest] = offeredQuests(document.world)
    .flatMap((quest) => {
      const heroIds = bestParties(document.world, playerOf(document), fewest).party(quest, available)?.heroIds ?? null;
      return heroIds === null || available.length - heroIds.length < atHome ? [] : [{ quest, heroIds }];
    })
    .sort((a, b) => durationDaysOf(b.quest) - durationDaysOf(a.quest));
  if (longest === undefined) throw new Error('no Quest on the Board the Roster can staff');
  const sent = played(state, { kind: 'dispatch', questId: longest.quest.id, heroIds: longest.heroIds });
  if (sent.rejection !== null) throw new Error(`dispatch refused: ${sent.rejection.reason}`);
  return sent;
}

/**
 * What `make` gives for the first of the seeds `seed`, `seed-1`, `seed-2`, … that meets `meets`: so that
 * a test states the condition its game must meet and finds a game meeting it, as the e2e's Board does,
 * resting on no Quest or Encounter as shipped (DL-272). Throws naming `condition` when none of `tries`
 * seeds meets it.
 */
export function firstSeedWhere<Made>(seed: string, make: (seed: string) => Made, meets: (made: Made) => boolean, condition: string, tries = 40): Made {
  for (let at = 0; at < tries; at += 1) {
    const made = make(at === 0 ? seed : `${seed}-${at}`);
    if (meets(made)) return made;
  }
  throw new Error(`No seed of ${tries} from ${seed} gives ${condition}`);
}

/** The Turns from `state`'s Turn to the night the player's one Party out comes home. */
export function turnsUntilHome(state: GameState): number {
  const document = documentOf(state);
  const parties = Object.values(document.world.parties).filter((party) => party.guildId === playerOf(document).id);
  const [party] = parties;
  if (party === undefined || parties.length > 1) throw new Error(`expected one Party of the player's out, not ${parties.length}`);
  return party.returnsOnTurn - document.world.turn;
}

/**
 * `withPartyOut` on the first game from `seed`, every Tier open, whose Party comes home partway through a
 * fast forward's second or third step of `step` Turns: after the first step, before the third ends, and
 * not at a step's end (DL-96, DL-272, DL-273).
 */
export function withPartyHomeInALaterStep(seed: string, step: number): GameState {
  return firstSeedWhere(
    seed,
    (each) => withPartyOut(startedWithEveryTier(each)),
    (state) => {
      const turns = turnsUntilHome(state);
      return turns > step && turns < 3 * step && turns % step !== 0;
    },
    'a Party home partway through the second or third step',
  );
}

/**
 * S5's estimate for `heroIds` of `state`'s player on `questId`, carrying `carried`: for a
 * view's test to hold the page's chances to, since a view imports no engine value.
 */
export function estimateOf(state: GameState, questId: QuestId, heroIds: readonly HeroId[], carried: ConsumableRequest[] = []): QuestEstimate | null {
  const document = documentOf(state);
  const quest = document.world.quests[questId] as Quest;
  return estimateQuest(document.world, quest, heroIds.map((id) => document.world.heroes[id] as Hero), playDeps(document), carried);
}

/** `state` once a Party of the player's has come home: `withPartyOut`, then fast forward until it stops for it. */
export function cameHome(state: GameState): GameState {
  let next = withPartyOut(state);
  for (let tries = 0; tries < 5 && next.stoppedBecause?.kind !== 'party-returned'; tries += 1) {
    next = played(next, { kind: 'fastForward', until: [] });
  }
  if (next.stoppedBecause?.kind !== 'party-returned') throw new Error('no Party of the player came home');
  return next;
}

/** A Party a return is written for: its ids, its Heroes in its order, its Patron and its Quest's template. */
export interface ReturningParty {
  partyId: PartyId;
  questId: QuestId;
  heroIds: readonly HeroId[];
  patronId: PatronId;
  templateKey: QuestTemplateKey;
}

/**
 * What a Party's return did, for the engine to play (`withReturn`). Each Hero is named by their place
 * in the Party, from 0; what is not told and the night's rules do not give did not happen.
 */
export interface ReturnTold {
  /** The Party, out in the world and home on its own night: the player's one out when not given. */
  party?: PartyId;
  band: QuestBand;
  wealth?: number;
  fame?: number;
  xp?: number;
  /**
   * The Encounters, each decided by its Encounter's first Check, at the Degree it is told or, told none, a
   * Success or a Failure as its outcome (DL-152, DL-247); form decided it, and so the Encounter, when it is told so.
   */
  encounters?: readonly {
    encounterKey?: string;
    outcome: EncounterOutcome;
    degree?: Degree;
    formDecided?: FormDecided;
    injured?: readonly number[];
    died?: readonly number[];
  }[];
  /** Consumables used, each a bonus to an Encounter's Check, or a heal of a Hero's Injury. */
  used?: readonly ({ definitionKey: ItemDefinitionKey; encounterIndex: number } | { definitionKey: ItemDefinitionKey; heal: number; days: number; encounterIndex: number })[];
  /** The Loot the return leaves: one at most, as the Quest Engine draws. */
  loot?: readonly { definitionKey: ItemDefinitionKey; quantity: number }[];
  injuries?: readonly { hero: number; typeKey: InjuryTypeKey; healsOnTurn: number }[];
  deaths?: readonly number[];
  /** The Traits the Party's Heroes earned, each from an Encounter of the sequence. */
  traits?: readonly { hero: number; traitKey: string; encounterIndex: number }[];
  /**
   * Morale the return moves, each change as the Hero State Engine records it; a Hero outside the Party by
   * their id. The first told of a Hero is their Morale before the return, and the Encounters' changes are
   * the resolution's; a strong success's and a Death's are the engine's rules', and each told must be one
   * the engine writes.
   */
  morale?: readonly { hero: number | HeroId; cause: 'encounters' | 'strong-success' | 'roster-death'; before: number; after: number; bandAfter: MoraleBand }[];
  /** The Patron's Regard for the Guild crossing into a new band on the return. */
  patronRegard?: { bandBefore: RegardBand; bandAfter: RegardBand };
  /** A Hero's Regard for a Party mate crossing into a new band. */
  heroRegard?: readonly { hero: number; mate: number; bandBefore: RegardBand; bandAfter: RegardBand }[];
  /** Levels gained on the night (`levelUps`, straight after the return). */
  levels?: readonly { hero: number | HeroId; level: number }[];
  /** A dead Hero's gear back to the Guild on the night (`gearReturn`). */
  gear?: readonly { hero: number; definitionKey: ItemDefinitionKey; slot: SlotKey }[];
}

/** The ids a played return is read by, and the Party it was played for. */
export interface Written {
  state: GameState;
  party: ReturningParty;
  turn: number;
}

/** A Party out in the world, as `withReturn` plays a return for it: `partyId`'s, or the player's one out when not given. */
export function partyOut(state: GameState, partyId?: PartyId): ReturningParty {
  const document = documentOf(state);
  const player = playerOf(document);
  const party = partyId === undefined ? Object.values(document.world.parties).find((each) => each.guildId === player.id) : document.world.parties[partyId];
  const quest = party === undefined ? undefined : document.world.quests[party.questId];
  if (party === undefined || quest === undefined) throw new Error(partyId === undefined ? "no Party of the player's out" : `no Party ${partyId} out`);
  return { partyId: party.id, questId: quest.id, heroIds: [...party.heroIds], patronId: quest.patronId, templateKey: quest.templateKey };
}

/**
 * `state` with a Party's return played by the engine on its night (DL-245): `told` is the Quest
 * Engine's resolution, which the engine's own draws rarely give when a test needs a Death or a Level,
 * and the engine applies it as `questsConclude` does, then plays the night's Levels and the dead's gear
 * back (`playReturnNight`), every entry the engine's. The world is first set so the night's rules
 * give what `told` says: each Hero's Morale before it, a told Level's XP, the dead's gear carried, the
 * consumables in the Party's packs and a Regard just short of the told band. The Party and its Quest
 * then leave the world, the dead leave the Roster, and the world stands at the night of the return.
 */
export function withReturn(state: GameState, told: ReturnTold): Written {
  return withReturns(state, [told])[0] as Written;
}

/**
 * `state` with several Parties' returns played by the engine on their one night, each as `withReturn`
 * plays one: the outcomes applied in Party id order, then the night's Levels and gear once, as the engine
 * plays a night (DL-250). Each return is read by its own `Written`, all of one state.
 */
export function withReturns(state: GameState, tolds: readonly ReturnTold[]): Written[] {
  const parties = tolds.map((told) => partyOut(state, told.party));
  const turn = documentOf(state).world.parties[(parties[0] as ReturningParty).partyId]?.returnsOnTurn;
  if (turn === undefined) throw new Error('no night to come home on');
  let prepared = state;
  const returns = tolds.map((told, at) => {
    const party = parties[at] as ReturningParty;
    const ready = preparedFor(prepared, told, party);
    prepared = ready.state;
    return { partyId: party.partyId, resolution: resolutionOf(told, party, turn, ready.uses) };
  });
  const document = documentOf(prepared);
  const night = playReturnNight(document, returns, playDeps(document), turn);
  tolds.forEach((told, at) => checkMorale(told, parties[at] as ReturningParty, night.events));
  return parties.map((party) => ({ state: { ...prepared, document: night.document }, party, turn }));
}

/** A told Hero by their place in the Party, or by their id. */
function heroOf(party: ReturningParty): (at: number | HeroId) => HeroId {
  return (at) => (typeof at === 'number' ? (party.heroIds[at] as HeroId) : at);
}

/** `state` set so the night's rules give what `told` says of `party`'s return, and the consumables its Party used. */
function preparedFor(state: GameState, told: ReturnTold, party: ReturningParty): { state: GameState; uses: ConsumableUse[] } {
  const { partyId, heroIds, patronId } = party;
  const hero = heroOf(party);
  const deaths = (told.deaths ?? []).map(hero);
  const uses: ConsumableUse[] = [];
  const prepared = changed(state, (document, player) => {
    const { world } = document;
    const config = { ...defaultConfig, ...document.meta.config };
    // Each Hero's Morale as the night finds it: the first change told of them starts from it.
    for (const { hero: at, before } of [...(told.morale ?? [])].reverse()) Object.assign(world.heroes[hero(at)] as Hero, { morale: before });
    // A told Level is reached tonight: the Level before it, and the XP that reaches it with the Quest's.
    for (const { hero: at, level } of told.levels ?? []) {
      const row = world.heroes[hero(at)] as Hero;
      const gained = heroIds.includes(row.id) && !deaths.includes(row.id) ? (told.xp ?? 0) : 0;
      row.level = level - 1;
      row.xp = Math.max(0, xpForLevel(level, config) - gained);
    }
    // The dead carry the told gear, and only it.
    for (const heroId of deaths) {
      for (const row of [...Object.values(world.items), ...Object.values(world.stacks)]) {
        if (row.holder.kind === 'hero' && row.holder.id === heroId) row.holder = { kind: 'guild', id: player.id };
      }
    }
    for (const { hero: at, definitionKey, slot } of told.gear ?? []) {
      const holder = { kind: 'hero', id: hero(at), slot } as const;
      if (content.items[definitionKey]?.unique === true) createItem(world, definitionKey, holder);
      else addStack(world, definitionKey, 1, holder);
    }
    // The consumables used, each in the Party's packs.
    for (const use of told.used ?? []) {
      const stackId = addStack(world, use.definitionKey, 1, { kind: 'party', id: partyId });
      uses.push('heal' in use ? { stackId, definitionKey: use.definitionKey, effect: 'heal', heroId: hero(use.heal), days: use.days, encounterIndex: use.encounterIndex } : { stackId, definitionKey: use.definitionKey, effect: 'bonus', encounterIndex: use.encounterIndex, flat: 2 });
    }
    // A told crossing of Regard: the value just short of the band it moves into, or the floor of the band it leaves.
    const shortOf = (before: RegardBand, after: RegardBand): number =>
      config.regardBands[after] > config.regardBands[before] ? config.regardBands[after] - 0.01 : config.regardBands[before];
    if (told.patronRegard !== undefined) {
      const patron = world.patrons[patronId];
      if (patron !== undefined) patron.regard[player.id] = { value: shortOf(told.patronRegard.bandBefore, told.patronRegard.bandAfter), since: 0, reason: 'test' };
    }
    for (const { hero: at, mate, bandBefore, bandAfter } of told.heroRegard ?? []) {
      (world.heroes[hero(at)] as Hero).regard[hero(mate)] = { value: shortOf(bandBefore, bandAfter), since: 0, reason: 'test' };
    }
  });
  return { state: prepared, uses };
}

/** The Quest Engine's resolution `told` gives of `party`'s return on the night `turn`, with the consumables it used. */
function resolutionOf(told: ReturnTold, party: ReturningParty, turn: number, uses: readonly ConsumableUse[]): Resolution {
  const { heroIds } = party;
  const hero = heroOf(party);
  const deaths = (told.deaths ?? []).map(hero);
  const encounterKeyOf = (key: string | undefined): string => key ?? Object.keys(content.encounters)[0] ?? '';
  const encounters = (told.encounters ?? []).map(({ encounterKey, outcome, degree = outcome, formDecided, injured = [], died = [] }, index): EncounterResult => {
    const key = encounterKeyOf(encounterKey);
    const rolled = { roll: 10, target: 10, margin: 0 };
    // Decided by the Encounter's first Check, as the resolver names it.
    const decidedBy = content.encounters[key]?.checks[0]?.key ?? key;
    const formed = formDecided === undefined ? {} : { formDecided };
    const checks = [{ key: decidedBy, capability: 10, ...rolled, degree, ...formed }];
    return { index, encounterKey: key, kind: 'combat', ...rolled, outcome, degree, decidedBy, ...formed, checks, injured: injured.map(hero), died: died.map(hero) };
  });
  const survivors = heroIds.filter((heroId) => !deaths.includes(heroId));
  const moraleByHero: Record<HeroId, number> = {};
  for (const { hero: at, cause, before, after } of told.morale ?? []) {
    if (cause === 'encounters') moraleByHero[hero(at)] = (moraleByHero[hero(at)] ?? 0) + after - before;
  }
  const [loot, ...more] = told.loot ?? [];
  if (more.length > 0) throw new Error('a Quest draws one Loot');
  return {
    outcome: {
      band: told.band,
      successes: (told.encounters ?? []).filter((each) => each.outcome === 'success').length,
      encounterCount: told.encounters?.length ?? 0,
      wealthDelta: told.wealth ?? 0,
      fameDelta: told.fame ?? 0,
      xpPerHero: told.xp ?? 0,
      moraleDelta: 0,
      moraleByHero: Object.fromEntries(survivors.filter((heroId) => moraleByHero[heroId] !== undefined).map((heroId) => [heroId, moraleByHero[heroId]])) as Record<HeroId, number>,
      regardDelta: 0,
      injuries: (told.injuries ?? []).map(({ hero: at, typeKey, healsOnTurn }) => ({ heroId: hero(at), typeKey, healDays: dayOf(healsOnTurn) - dayOf(turn) })),
      deaths,
      synergyKeys: [],
    },
    encounters,
    traits: (told.traits ?? []).map(({ hero: at, traitKey, encounterIndex }) => ({ heroId: hero(at), traitKey, encounterIndex, encounterKey: encounterKeyOf(told.encounters?.[encounterIndex]?.encounterKey) })),
    consumables: [...uses],
    loot: loot === undefined ? null : { lootTableKey: 'lesser-loot', definitionKey: loot.definitionKey, quantity: loot.quantity, unique: content.items[loot.definitionKey]?.unique === true },
  };
}

/** Each Morale change told of `party`'s return is one the engine wrote, so a test tells only a return the rules give. */
function checkMorale(told: ReturnTold, party: ReturningParty, events: readonly EngineEvent[]): void {
  const hero = heroOf(party);
  for (const { hero: at, cause, before, after, bandAfter } of told.morale ?? []) {
    const wrote = events.some(
      (event) =>
        event.type === 'hero.morale-changed' &&
        event.payload.heroId === hero(at) &&
        event.payload.cause === cause &&
        event.payload.before === before &&
        event.payload.after === after &&
        event.payload.bandAfter === bandAfter,
    );
    if (!wrote) throw new Error(`the engine wrote no ${cause} Morale change of ${hero(at)} from ${before} to ${after}, ${bandAfter}`);
  }
}

/** Every Rival rich enough to hire: whether one takes a Hero is then its Roster's and its Disposition's to say. */
export function withRichRivals(state: GameState): GameState {
  return changed(state, (document, player) => {
    for (const guild of Object.values(document.world.guilds)) if (guild.id !== player.id) guild.wealth = 100_000;
  });
}

/**
 * A Transfer Offer from the first Rival for the player's first Hero, made by the engine's own
 * `offerTransfer` (the Transfer Generator makes them at night, too rarely for a test to wait on);
 * the Rival is given the Wealth to make it.
 */
export function withOffer(state: GameState): GameState {
  const rich = withRichRivals(state);
  const document = documentOf(rich);
  const player = playerOf(document);
  const rival = Object.values(document.world.guilds).find((guild) => guild.id !== player.id);
  const heroId = player.rosterIds[0];
  if (rival === undefined || heroId === undefined) throw new Error('no Rival or Hero');
  const offered = applyAction(document, { kind: 'offerTransfer', guildId: rival.id, heroId, years: 2 }, { config: { ...defaultConfig, ...document.meta.config }, content });
  if (!offered.ok) throw new Error(`offerTransfer refused: ${offered.rejection.reason}`);
  return { ...rich, document: offered.document };
}

/**
 * `state` with the World History's news to come in its first Days: the first Rival's
 * Guildmaster at the age a Guildmaster retires, read from the game's rules, so the first night meets
 * it with Succession; and the second Rival's Roster released to the Unattached pool with no Wealth,
 * so that night it folds, its Roster wiped, and a new Rival is founded in its place later.
 */
export function withWorldNews(state: GameState): GameState {
  return changed(state, (document) => {
    const { world } = document;
    const [succeeding, folding] = Object.values(world.guilds).filter((guild) => guild.controller.kind === 'rival');
    if (succeeding === undefined || folding === undefined) throw new Error('expected two Rivals');
    const retiring = world.guildmasters[succeeding.guildmasterId];
    if (retiring === undefined) throw new Error('no Guildmaster');
    retiring.ageAtEntry = { ...defaultConfig, ...document.meta.config }.guildmasterRetirementAge;
    for (const heroId of folding.rosterIds) Object.assign(world.heroes[heroId] as Hero, { guildId: null, unattachedSince: world.turn, contract: null });
    folding.rosterIds = [];
    folding.wealth = 0;
  });
}

/** The game's rules `behind` config versions older than this release's, as a save from an earlier release has. */
export function withOlderRules(state: GameState, behind = 1): GameState {
  const document = documentOf(state);
  return { ...state, document: { ...document, meta: { ...document.meta, configVersion: configVersion - behind } } };
}

/** A Hero by id and name. */
export interface Named {
  id: HeroId;
  name: string;
}

/**
 * `state` with the player's first Hero dead and second retired, each off the Roster as the engine
 * leaves them: the Heroes the page opens from no Roster and no pool. A Hero gone from the world is
 * none a current game holds: the engine deletes only a Hero no entry names (DL-211).
 */
export function withTheGone(state: GameState): { state: GameState; dead: Named; retired: Named } {
  let dead: Named | undefined;
  let retired: Named | undefined;
  const next = changed(state, (document, player) => {
    const { world } = document;
    const [deadId, retiredId] = player.rosterIds;
    const deadHero = deadId === undefined ? undefined : world.heroes[deadId];
    const retiredHero = retiredId === undefined ? undefined : world.heroes[retiredId];
    if (deadHero === undefined || retiredHero === undefined) throw new Error('expected two Heroes');
    deadHero.diedOnTurn = world.turn;
    retiredHero.retiredOnTurn = world.turn;
    player.rosterIds = player.rosterIds.filter((id) => id !== deadHero.id && id !== retiredHero.id);
    dead = { id: deadHero.id, name: deadHero.name };
    retired = { id: retiredHero.id, name: retiredHero.name };
  });
  if (dead === undefined || retired === undefined) throw new Error('unreachable');
  return { state: next, dead, retired };
}
