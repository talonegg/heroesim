// Games in a given state, for the page's tests (M7-S3 part 2, DL-73). Tests outside `state/` take
// only types from the engine (M7-S2's import check), so the setups that need its values live here:
// a Transfer Offer standing, rules behind this release's, Items held, Wealth, Heroes dead, retired
// and gone from the world (DL-74); the Roster released, and a Party out, for fast forward's steps
// (v1.0.1-S5, DL-96). Never imported by the page, so never bundled.

import {
  addStack,
  append,
  availableHeroes,
  createItem,
  dayOf,
  defaultConfig,
  durationDaysOf,
  estimateQuest,
  isId,
  isMilestone,
  makeId,
  offerTransfer,
  offeredQuests,
  parseId,
  partyFor,
  playerGuild,
  type ConsumableRequest,
  type Degree,
  type EncounterOutcome,
  type FormDecided,
  type EngineEventOf,
  type EngineEventType,
  type EntityId,
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
  type SlotKey,
  type StatKey,
  type WorldDocument,
} from '@heroesim/engine';
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

function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('no game in hand');
  return state.document;
}

function playerOf(document: WorldDocument): Guild {
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error("no player's Guild");
  return guild;
}

/** `state` with its world changed by `change` on a copy: the document the page holds is never written to. */
export function changed(state: GameState, change: (document: WorldDocument, player: Guild) => void): GameState {
  const document = structuredClone(documentOf(state));
  change(document, playerOf(document));
  return { ...state, document };
}

/**
 * `state` with the player's first Hero holding the Hero Trait Lame, and a Trait they gained on a Quest
 * the History names and one they lost to Lame written to the History as `emit` writes them, Milestones
 * both, at the Turn the world stands on (v1.1.4-S7).
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
    append(document.history, { turn, type: 'hero.trait-gained', participants: [hero.id, player.id], labels, milestone: isMilestone('hero.trait-gained', gained), payload: gained });
    const lost = { heroId: hero.id, traitKey: 'scarred', replacedBy: 'lame' };
    append(document.history, { turn, type: 'hero.trait-lost', participants: [hero.id, player.id], labels, milestone: isMilestone('hero.trait-lost', lost), payload: lost });
  });
}

/** The player's Guild holding `quantity` of `definitionKey` besides what it held. */
export function holding(state: GameState, definitionKey: ItemDefinitionKey, quantity: number): GameState {
  return changed(state, (document, player) => addStack(document.world, definitionKey, quantity, { kind: 'guild', id: player.id }));
}

/**
 * The player's Guild holding one unique Item of `definitionKey` besides what it held, as Loot leaves
 * one (M5-S5): an Item of its own, which the CLI names by `--item` (M9-S8).
 */
export function holdingUnique(state: GameState, definitionKey: ItemDefinitionKey): GameState {
  return changed(state, (document, player) => void createItem(document.world, definitionKey, { kind: 'guild', id: player.id }));
}

/** The player's first Hero carrying one `definitionKey` in `slot`, as gear equipped leaves it (M9-F3's Stores). */
export function carrying(state: GameState, definitionKey: ItemDefinitionKey, slot: SlotKey): GameState {
  return changed(state, (document, player) => {
    const [first] = player.rosterIds;
    if (first === undefined) throw new Error('no Hero on the Roster');
    addStack(document.world, definitionKey, 1, { kind: 'hero', id: first, slot });
  });
}

/** The player's first Hero carrying one unique Item of `definitionKey` in `slot`, as one equipped leaves it (v1.1.2-S2). */
export function carryingUnique(state: GameState, definitionKey: ItemDefinitionKey, slot: SlotKey): GameState {
  return changed(state, (document, player) => {
    const [first] = player.rosterIds;
    if (first === undefined) throw new Error('no Hero on the Roster');
    createItem(document.world, definitionKey, { kind: 'hero', id: first, slot });
  });
}

/**
 * The player's Guild with `wealth` Wealth; and, given `belowFloorSince`, below the Bankruptcy floor
 * since that Turn, as a Guild that fell below it before the play to come: its countdown stands, and
 * no new crossing stops a fast forward (M9-S1, DL-101).
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
      Object.assign(document.world.heroes[heroId] as Hero, { guildId: null, unattachedSince: document.world.turn });
    }
    player.rosterIds = [];
    player.wealth = wealth;
  });
}

/**
 * A Party of the player's out on the longest Quest on the Board the Roster can staff, sent by the
 * page's own dispatch: while it is out no decision is needed, so a fast forward stops when it
 * comes home (or for an offer, or at the end). The Party is `partyFor`'s at the player's margin of 1,
 * the fewest the Quest allows (v1.1.4-S6), so that Heroes stay at home to staff what comes next.
 */
export function withPartyOut(state: GameState): GameState {
  const document = documentOf(state);
  const available = availableHeroes(document.world, playerOf(document));
  const deps = playDeps(document);
  const fewest = { ...deps, config: { ...deps.config, playerPartyMargin: 1 } };
  const [longest] = offeredQuests(document.world)
    .flatMap((quest) => {
      const heroIds = partyFor(document.world, playerOf(document), quest, available, fewest);
      return heroIds === null ? [] : [{ quest, heroIds }];
    })
    .sort((a, b) => durationDaysOf(b.quest) - durationDaysOf(a.quest));
  if (longest === undefined) throw new Error('no Quest on the Board the Roster can staff');
  const sent = played(state, { kind: 'dispatch', questId: longest.quest.id, heroIds: longest.heroIds });
  if (sent.rejection !== null) throw new Error(`dispatch refused: ${sent.rejection.reason}`);
  return sent;
}

/**
 * S5's estimate for `heroIds` of `state`'s player on `questId`, carrying `carried` (v1.1.4-S6): for a
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
 * What a Party's return did, as `withReturn` writes it. Each Hero is named by their place in the
 * Party, from 0; what is not told did not happen.
 */
export interface ReturnTold {
  /** The Party: the player's one out in the world when not given. */
  party?: ReturningParty;
  /** The night it comes home: the Party's `returnsOnTurn` when not given. */
  turn?: number;
  band: QuestBand;
  wealth?: number;
  fame?: number;
  xp?: number;
  /**
   * The Encounters, each written as before v1.1.4-S2, with no Degree, unless it is told one: then as
   * since, decided by its one Check; form decided it, and so the Encounter, when it is told so (v1.1.4-S3).
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
  used?: readonly ({ definitionKey: ItemDefinitionKey; encounterIndex: number } | { definitionKey: ItemDefinitionKey; heal: number; days: number })[];
  loot?: readonly { definitionKey: ItemDefinitionKey; quantity: number }[];
  injuries?: readonly { hero: number; typeKey: InjuryTypeKey; healsOnTurn: number }[];
  deaths?: readonly number[];
  /** The Traits the Party's Heroes earned, each from an Encounter of the sequence (v1.1.4-S7). */
  traits?: readonly { hero: number; traitKey: string; encounterIndex: number }[];
  /** Morale the return moved, each change as the Hero State Engine records it; a Hero outside the Party by their id. */
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

/** The ids a written return is read by, and the Party it was written for. */
export interface Written {
  state: GameState;
  party: ReturningParty;
  turn: number;
}

/** The player's Party out in the world, as `withReturn` writes a return for it. */
export function partyOut(state: GameState): ReturningParty {
  const document = documentOf(state);
  const player = playerOf(document);
  const party = Object.values(document.world.parties).find((each) => each.guildId === player.id);
  const quest = party === undefined ? undefined : document.world.quests[party.questId];
  if (party === undefined || quest === undefined) throw new Error("no Party of the player's out");
  return { partyId: party.id, questId: quest.id, heroIds: [...party.heroIds], patronId: quest.patronId, templateKey: quest.templateKey };
}

/**
 * `state` with a Party's return written to its History as the Quest Engine writes one
 * (`quests-conclude.ts`), then the night's Levels (`levelUps`) and a dead Hero's gear (`gearReturn`),
 * each entry completed as `emit` completes it: the Turn, the Heroes' Guild appended to the
 * participants, each named row's label, and the Milestone flag. The Party and its Quest then leave
 * the world, the dead leave the Roster, and the world stands at the night of the return. A test's
 * way to a return whose outcome it chooses: the engine's own draws rarely give a Death or a Level.
 */
export function withReturn(state: GameState, told: ReturnTold): Written {
  const party = told.party ?? partyOut(state);
  const turn = told.turn ?? documentOf(state).world.parties[party.partyId]?.returnsOnTurn;
  if (turn === undefined) throw new Error('no night to come home on');
  const next = changed(state, (document, player) => {
    const { world, history } = document;
    const config = { ...defaultConfig, ...document.meta.config };
    const { partyId, questId, heroIds, patronId, templateKey } = party;
    const hero = (at: number | HeroId): HeroId => (typeof at === 'number' ? (heroIds[at] as HeroId) : at);
    const write = <Type extends EngineEventType>(type: Type, participants: readonly EntityId[], payload: EngineEventOf<Type>['payload']): void => {
      const named = [...new Set(participants)];
      for (const id of [...named]) {
        const guildId = isId('heroes', id) ? world.heroes[id]?.guildId : null;
        if (guildId !== null && guildId !== undefined && !named.includes(guildId)) named.push(guildId);
      }
      const labels: Record<EntityId, string> = {};
      for (const id of named) {
        const parsed = parseId(id);
        const rows = parsed === null ? undefined : (world[parsed.table] as Record<string, { name?: unknown }>);
        const name = rows !== undefined && Object.hasOwn(rows, id) ? rows[id]?.name : undefined;
        if (typeof name === 'string') labels[id] = name;
      }
      append(history, { turn, type, participants: named, labels, milestone: isMilestone(type, payload), payload });
    };
    const guildId = player.id;
    const deaths = (told.deaths ?? []).map(hero);
    const survivors = heroIds.filter((id) => !deaths.includes(id));

    (told.encounters ?? []).forEach(({ encounterKey = Object.keys(content.encounters)[0] ?? '', outcome, degree, formDecided, injured = [], died = [] }, index) => {
      const hurt = injured.map(hero);
      const killed = died.map(hero);
      const rolled = { roll: 10, target: 10, margin: 0 };
      write('quest.encounter', [questId, partyId, guildId, ...hurt, ...killed], {
        questId,
        partyId,
        guildId,
        index,
        encounterKey,
        kind: 'combat',
        ...rolled,
        outcome,
        ...(degree === undefined
          ? {}
          : {
              degree,
              decidedBy: encounterKey,
              ...(formDecided === undefined ? {} : { formDecided }),
              checks: [{ key: encounterKey, capability: 10, ...rolled, degree, ...(formDecided === undefined ? {} : { formDecided }) }],
            }),
        injured: hurt,
        died: killed,
      });
    });
    (told.used ?? []).forEach((use, at) => {
      const stackId = makeId('stacks', 9000 + at);
      if ('heal' in use) {
        write('item.expended', [questId, partyId, guildId, hero(use.heal)], { questId, partyId, guildId, stackId, definitionKey: use.definitionKey, effect: 'heal', heroId: hero(use.heal), days: use.days });
      } else {
        write('item.expended', [questId, partyId, guildId], { questId, partyId, guildId, stackId, definitionKey: use.definitionKey, effect: 'bonus', encounterIndex: use.encounterIndex, flat: 2 });
      }
    });
    const encounterCount = told.encounters?.length ?? 0;
    write('quest.resolved', [questId, partyId, ...heroIds, guildId, patronId], {
      questId,
      partyId,
      guildId,
      heroIds: [...heroIds],
      templateKey,
      band: told.band,
      successes: (told.encounters ?? []).filter((each) => each.outcome === 'success').length,
      encounterCount,
      wealthDelta: told.wealth ?? 0,
      fameDelta: told.fame ?? 0,
      xpPerHero: told.xp ?? 0,
      moraleDelta: 0,
      regardDelta: 0,
      injuries: (told.injuries ?? []).map(({ hero: at, typeKey, healsOnTurn }) => ({ heroId: hero(at), typeKey, healDays: dayOf(healsOnTurn) - dayOf(turn) })),
      deaths,
      synergyKeys: [],
    });
    (told.loot ?? []).forEach(({ definitionKey, quantity }, at) => {
      write('quest.loot', [questId, partyId, guildId], { questId, partyId, guildId, lootTableKey: 'lesser-loot', definitionKey, quantity, itemId: null, stackId: makeId('stacks', 9100 + at) });
    });
    for (const { hero: at, typeKey, healsOnTurn } of told.injuries ?? []) {
      write('hero.injured', [hero(at), questId], { heroId: hero(at), questId, typeKey, healsOnTurn });
    }
    for (const heroId of deaths) write('hero.died', [heroId, questId], { heroId, questId });
    for (const { hero: at, traitKey, encounterIndex } of told.traits ?? []) {
      const encounterKey = told.encounters?.[encounterIndex]?.encounterKey ?? Object.keys(content.encounters)[0] ?? '';
      write('hero.trait-gained', [hero(at), questId], { heroId: hero(at), traitKey, questId, encounterIndex, encounterKey });
      world.heroes[hero(at)]?.traits.push(traitKey);
    }
    for (const heroId of survivors) write('hero.xp-gained', [heroId, questId], { heroId, questId, amount: told.xp ?? 0 });
    for (const { hero: at, cause, before, after, bandAfter } of told.morale ?? []) {
      write('hero.morale-changed', [hero(at), questId], { heroId: hero(at), cause, questId, before, after, bandBefore: 'steady', bandAfter });
    }
    if (told.patronRegard !== undefined) {
      const { bandBefore, bandAfter } = told.patronRegard;
      const cause = told.band === 'fail' ? 'quest-failure' : 'quest-success';
      write('patron.regard-changed', [patronId, guildId, questId], {
        patronId,
        guildId,
        cause,
        questId,
        before: config.regardBands[bandBefore],
        after: config.regardBands[bandAfter],
        bandBefore,
        bandAfter,
      });
    }
    for (const { hero: at, mate, bandBefore, bandAfter } of told.heroRegard ?? []) {
      write('hero.regard-changed', [hero(at), hero(mate), questId], {
        heroId: hero(at),
        entityId: hero(mate),
        cause: 'shared-quest',
        questId,
        before: config.regardBands[bandBefore],
        after: config.regardBands[bandAfter],
        bandBefore,
        bandAfter,
      });
    }
    for (const { hero: at, level } of told.levels ?? []) {
      write('hero.levelled', [hero(at)], { heroId: hero(at), guildId, level, statDeltas: {} as Record<StatKey, number>, pointsLost: 0 });
    }
    for (const { hero: at, definitionKey, slot } of told.gear ?? []) {
      write('item.returned', [hero(at), guildId], { heroId: hero(at), guildId, slot, definitionKey, itemId: null, stackId: null, cause: 'died' });
    }

    // What the night leaves in the world: the dead off the Roster, the rest home, the Party and its Quest gone.
    for (const heroId of heroIds) {
      const row = world.heroes[heroId];
      if (row === undefined) continue;
      row.partyId = null;
      if (deaths.includes(heroId)) row.diedOnTurn = turn;
    }
    player.rosterIds = player.rosterIds.filter((id) => !deaths.includes(id));
    delete world.parties[partyId];
    delete world.quests[questId];
    world.turn = turn;
  });
  return { state: next, party, turn };
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
  const offered = offerTransfer(document, { guildId: rival.id, heroId }, { config: { ...defaultConfig, ...document.meta.config }, content });
  if (!offered.ok) throw new Error(`offerTransfer refused: ${offered.rejection.reason}`);
  return { ...rich, document: offered.document };
}

/**
 * `state` with the World History's news to come in its first Days (M9-F4): the first Rival's
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
    for (const heroId of folding.rosterIds) Object.assign(world.heroes[heroId] as Hero, { guildId: null, unattachedSince: world.turn });
    folding.rosterIds = [];
    folding.wealth = 0;
  });
}

/** The game's rules `behind` config versions older than this release's, as a save from an earlier release has. */
export function withOlderRules(state: GameState, behind = 1): GameState {
  const document = documentOf(state);
  const config = { ...document.meta.config, configVersion: defaultConfig.configVersion - behind };
  return { ...state, document: { ...document, meta: { ...document.meta, config } } };
}

/** A Hero by id and name. */
export interface Named {
  id: HeroId;
  name: string;
}

/**
 * `state` with the player's first Hero dead and second retired, each off the Roster as the engine
 * leaves them, and a Hero of the Unattached pool gone from the world, whose History alone remains,
 * as it does for a Hero who left the pool: the Heroes the page opens from no Roster and no pool.
 */
export function withTheGone(state: GameState): { state: GameState; dead: Named; retired: Named; gone: Named } {
  let dead: Named | undefined;
  let retired: Named | undefined;
  let gone: Named | undefined;
  const next = changed(state, (document, player) => {
    const { world } = document;
    const [deadId, retiredId] = player.rosterIds;
    const deadHero = deadId === undefined ? undefined : world.heroes[deadId];
    const retiredHero = retiredId === undefined ? undefined : world.heroes[retiredId];
    const poolHero = Object.values(world.heroes).find((hero) => hero.unattachedSince !== null);
    if (deadHero === undefined || retiredHero === undefined || poolHero === undefined) throw new Error('expected two Heroes and a pool');
    deadHero.diedOnTurn = world.turn;
    retiredHero.retiredOnTurn = world.turn;
    player.rosterIds = player.rosterIds.filter((id) => id !== deadHero.id && id !== retiredHero.id);
    delete world.heroes[poolHero.id];
    dead = { id: deadHero.id, name: deadHero.name };
    retired = { id: retiredHero.id, name: retiredHero.name };
    gone = { id: poolHero.id, name: poolHero.name };
  });
  if (dead === undefined || retired === undefined || gone === undefined) throw new Error('unreachable');
  return { state: next, dead, retired, gone };
}
