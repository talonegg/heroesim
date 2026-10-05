// The CLI's words for what the engine reports (M2-S11, DL-33): a typed event in, one short line
// out, and a stop reason in, one line out. The CLI's own rendering, not the engine's: the engine
// emits data (ADR-0003), and M7's web front end narrates it in its own words.
//
// Names come from each event's labels, written when it happened, so a Hero or Quest whose row has
// since gone still reads; content keys become content's display names. Each switch covers every
// type, so the compiler refuses an event type or stop reason added without a line. A module's own
// event, which the engine does not type, gets one generic line for any type, whatever its payload:
// the module, its type and who it concerns (M8-S2, M8-S4, DL-77, DL-79).

import {
  compareByCodeUnit,
  dayOf,
  encounterDegree,
  encounterForm,
  isId,
  isModuleEvent,
  regardBandNames,
  type ContentSet,
  type Degree,
  type FormDecided,
  type EndingReason,
  type EngineDeps,
  type EngineEvent,
  type EntityId,
  type GearMove,
  type GearReturnCause,
  type HeroRegardCause,
  type ModuleEvent,
  type PatronRegardCause,
  type QuestBand,
  type RegardBand,
  type StopReason,
  type TransferOfferEndCause,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { nameIn } from '@heroesim/words';
import { facilityIs, facilityNames, renderCountdown, renderTime, rowIn, table } from './render.js';

/** The labels an event carries, by participant: an engine's event's or a module's. */
type Labelled = Pick<TurnEvent, 'labels'>;

/** A participant by the label the event carries, or its id when it has none. */
function called(event: Labelled, id: EntityId): string {
  return event.labels[id] ?? id;
}

/** A Hero by label and id, `Brenna Ashcombe (hero-000003)`: the id is what the commands take. */
function hero(event: Labelled, id: EntityId): string {
  const label = event.labels[id];
  return label === undefined ? id : `${label} (${id})`;
}

/** `+120`, `-2`, `0`. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function night(turn: number): string {
  return `the night of Day ${dayOf(turn)}`;
}

const bandWords: Readonly<Record<QuestBand, string>> = { fail: 'failed', success: 'succeeded', strong: 'succeeded strongly' };

/** A Degree, a glossary term in each (v1.1.4-S2, `CONTEXT.md` Degree). */
const degreeWords: Readonly<Record<Degree, string>> = { triumph: 'Triumph', success: 'Success', setback: 'Setback', failure: 'Failure' };

/** The Encounter's one sentence when form decided a Check's Degree (v1.1.4-S3, `encounterForm`), for the Party, naming no Hero. */
const formWords: Readonly<Record<FormDecided, string>> = { lowered: 'Low spirits told against them.', raised: 'Their high spirits carried them through.' };

/** What befell a Guild at its ending, after its name. */
const endingWords: Readonly<Record<EndingReason, string>> = {
  retirement: 'lost its Guildmaster to Retirement',
  bankruptcy: 'went bankrupt',
  'roster-wiped': 'had its Roster wiped out',
};

/** What moved a Patron's Regard, after the band it reached. */
const patronRegardWords: Readonly<Record<PatronRegardCause, string>> = {
  'quest-success': 'after a Quest of theirs succeeded',
  'quest-failure': 'after a Quest of theirs failed',
  'offer-expired': 'when an Offer of theirs went untaken',
  recovery: 'as time passed',
  module: 'through a Module',
};

/** What moved a Hero's Regard for another Hero, after the band it reached (M4-S4). */
const heroRegardWords: Readonly<Record<HeroRegardCause, string>> = {
  'shared-quest': 'after a Quest together',
  decay: 'as time passed apart',
  module: 'through a Module',
};

/** Why gear went back to a Guild (M5-S2), after the Hero it came from. */
const gearReturnWords: Readonly<Record<GearReturnCause, string>> = {
  died: ', who died',
  retired: ', who retired',
  'guild-folded': ' as the Guild folded',
  transferred: ', who was transferred',
};

/** What became of a Transfer Offer that went unanswered (M6-S2), after the offer. */
const offerEndWords: Readonly<Record<TransferOfferEndCause, string>> = {
  expired: 'expired unanswered',
  'hero-left': 'lapsed: the Hero left that Roster',
  'guild-folded': 'lapsed as a Guild folded',
};

/** An Item of gear that moved, by content's name and the id a command takes: `Arming sword (stack-000004)`. */
function gearMoved(move: GearMove, content: ContentSet): string {
  return `${nameIn(content.items, move.definitionKey)} (${move.itemId ?? move.stackId ?? ''})`;
}

/** `rose from neutral to warm`, `fell from cool to hostile`: a Regard band crossed, never a number (M4-S5). */
function crossed(before: RegardBand, after: RegardBand): string {
  const way = regardBandNames.indexOf(after) > regardBandNames.indexOf(before) ? 'rose' : 'fell';
  return `${way} from ${before} to ${after}`;
}

/**
 * Items as a line names them (M5-S4): `Whetstone`, `3 × Whetstone`, and a unique Item with its id,
 * `Barrow King's blade (item-000002)`, which the commands take.
 */
function items(content: ContentSet, definitionKey: string, quantity: number, itemIds: readonly string[]): string {
  const name = nameIn(content.items, definitionKey);
  const counted = quantity === 1 ? name : `${quantity} × ${name}`;
  return itemIds.length === 0 ? counted : `${counted} (${itemIds.join(', ')})`;
}

/**
 * One line for `event`, in the CLI's words. A module's own event is not the engine's to word, nor
 * the CLI's: its line is `narrateModuleEvent`'s, for any type.
 */
export function narrate(event: TurnEvent, content: ContentSet): string {
  if (isModuleEvent(event)) return narrateModuleEvent(event);
  return narrateEngineEvent(event, content);
}

/**
 * A module's own event, of a type the CLI has no words for and a payload it never reads (M8-S4,
 * DL-79): the module, named by its type's namespace (`probe.fired` is the probe's, DL-77), the type,
 * and the entities it concerns by their labels, a Hero with the id the commands take. `The probe
 * module recorded probe.fired for Una Greave (hero-000023), Ranulf Tarrant and The Hollin Guild.`
 * A type outside any namespace, which no module's `emit` makes, is still worded, from "A module".
 */
function narrateModuleEvent(event: ModuleEvent): string {
  const dot = event.type.indexOf('.');
  const who = dot > 0 ? `The ${event.type.slice(0, dot)} module` : 'A module';
  const named = event.participants.map((id) => (isId('heroes', id) ? hero(event, id) : called(event, id)));
  return `${who} recorded ${event.type}${named.length === 0 ? '' : ` for ${listed(named)}`}.`;
}

function narrateEngineEvent(event: EngineEvent, content: ContentSet): string {
  switch (event.type) {
    case 'world.created':
      return `The world was made from seed ${event.payload.seed}.`;
    case 'guild.founded':
      return `${called(event, event.payload.guildId)} was founded.`;
    case 'guildmaster.generated':
      return `${called(event, event.payload.guildmasterId)} leads ${called(event, event.payload.guildId)}.`;
    case 'hero.generated': {
      const { heroId, guildId, classKey } = event.payload;
      const where = guildId === null ? 'the Unattached pool' : called(event, guildId);
      return `${hero(event, heroId)}, ${nameIn(content.classes, classKey)}, joined ${where}.`;
    }
    case 'patron.generated':
      return `${called(event, event.payload.patronId)} of the ${nameIn(content.spheres, event.payload.sphereKey)} became a Patron.`;
    case 'world.rules-adopted':
      return `The rules moved from configVersion ${event.payload.oldConfigVersion} to ${event.payload.newConfigVersion}.`;
    case 'guild.upkeep-paid':
      return `${called(event, event.payload.guildId)} paid ${event.payload.amount} Upkeep, leaving ${event.payload.wealthAfter} Wealth.`;
    case 'guild.below-floor': {
      // M9-S1: the night Bankruptcy falls on, as the countdown gives it (DL-95), from the event alone.
      const { guildId, wealth, floor, dueDay } = event.payload;
      return (
        `${called(event, guildId)}'s Wealth, ${wealth}, fell below the Bankruptcy floor of ${floor}: Bankruptcy on the night of ` +
        `Day ${dueDay} unless it is back to ${floor} or more on a night by then.`
      );
    }
    case 'guild.floor-recovered': {
      const { guildId, wealth, floor, belowFloorSince } = event.payload;
      return (
        `${called(event, guildId)}'s Wealth, ${wealth}, is back to the Bankruptcy floor of ${floor} or more, after falling below it ` +
        `on Day ${dayOf(belowFloorSince)}: no Bankruptcy is due.`
      );
    }
    case 'hero.recruited':
      return `${called(event, event.payload.guildId)} signed ${hero(event, event.payload.heroId)} for ${event.payload.fee} Wealth.`;
    case 'hero.left-pool':
      return `${hero(event, event.payload.heroId)} left the Unattached pool.`;
    case 'quest.offered': {
      const { patronId, templateKey, questId } = event.payload;
      return `${called(event, patronId)} offered ${nameIn(content.questTemplates, templateKey)} (${questId}).`;
    }
    case 'quest.expired': {
      const { patronId, templateKey, questId } = event.payload;
      return `${called(event, patronId)}'s ${nameIn(content.questTemplates, templateKey)} (${questId}) expired untaken.`;
    }
    case 'quest.taken': {
      // What the Party carries (M5-S3), when it carries anything; an entry from before M5-S3 has none.
      const { guildId, partyId, questId, returnsOnTurn, consumables = [] } = event.payload;
      const carrying = consumables.map(({ definitionKey, quantity }) => `${nameIn(content.items, definitionKey)} ×${quantity}`);
      const carried = carrying.length === 0 ? '' : `, carrying ${listed(carrying)}`;
      return `${called(event, guildId)} sent ${partyId} on ${questId}, back on ${night(returnsOnTurn)}${carried}.`;
    }
    case 'quest.encounter': {
      // The roll and target are the engine's; the CLI says only how it went and what it cost, and
      // which Encounter it was, counted from 1 as a consumable's line counts them (item.expended).
      // Its Degree, and the Check that decided it when there are several or it is named otherwise
      // than its Encounter (v1.1.4-S2, DL-152); an entry written before then reads as its outcome, a
      // Success or a Failure. When form decided a Check's Degree, one sentence more, for the Party,
      // naming no Hero (v1.1.4-S3, DL-148 item 12).
      const { partyId, index, encounterKey, outcome, injured, died, decidedBy, checks = [] } = event.payload;
      const went = outcome === 'success' ? 'came through' : 'failed at';
      const hurt = [
        ...injured.map((id) => `${hero(event, id)} was injured`),
        ...died.map((id) => `${hero(event, id)} was killed`),
      ];
      const which = `${nameIn(content.encounters, encounterKey)} (Encounter ${index + 1})`;
      const encounterName = nameIn(content.encounters, encounterKey);
      const decider = rowIn(content.encounters, encounterKey)?.checks.find((it) => it.key === decidedBy)?.name ?? decidedBy;
      const by = decider !== undefined && (checks.length > 1 || decider !== encounterName) ? `, decided by ${decider}` : '';
      const form = encounterForm(event.payload);
      const told = form === undefined ? '' : ` ${formWords[form]}`;
      return `${partyId} ${went} ${which}, a ${degreeWords[encounterDegree(event.payload)]}${by}${hurt.length === 0 ? '' : `: ${listed(hurt)}`}.${told}`;
    }
    case 'quest.resolved': {
      const { guildId, partyId, questId, templateKey, band, wealthDelta, fameDelta, synergyKeys = [] } = event.payload;
      // The Synergies that applied (M4-S3), when any did; an entry from before M4-S3 has none.
      const synergies = synergyKeys.length === 0 ? '' : ` Synergies: ${synergyKeys.map((key) => nameIn(content.synergies, key)).join(', ')}.`;
      return (
        `${called(event, guildId)}'s ${partyId} came home from ${nameIn(content.questTemplates, templateKey)} ` +
        `(${questId}) and ${bandWords[band]}: Wealth ${signed(wealthDelta)}, Fame ${signed(fameDelta)}.${synergies}`
      );
    }
    case 'quest.loot': {
      // A unique Item by name and id, a common one by name, quantity and the stack it joined (M5-S5).
      const { guildId, questId, definitionKey, quantity, itemId, stackId } = event.payload;
      const item = nameIn(content.items, definitionKey);
      const what = itemId === null ? `${items(content, definitionKey, quantity, [])} (${stackId ?? 'no stack'})` : `${item} (${itemId})`;
      return `${called(event, guildId)} found Loot on ${questId}: ${what}.`;
    }
    case 'hero.injured': {
      const { heroId, typeKey, healsOnTurn } = event.payload;
      return `${hero(event, heroId)} was injured (${nameIn(content.injuries, typeKey)}), healing on ${night(healsOnTurn)}.`;
    }
    case 'hero.died':
      return `${hero(event, event.payload.heroId)} died on ${event.payload.questId}.`;
    case 'hero.xp-gained':
      return `${hero(event, event.payload.heroId)} gained ${event.payload.amount} XP.`;
    case 'hero.morale-changed': {
      const { heroId, before, after, bandAfter } = event.payload;
      return `${hero(event, heroId)}'s Morale went from ${before} to ${after}, ${bandAfter}.`;
    }
    case 'hero.healed': {
      const { heroId, typeKey, traitKey } = event.payload;
      const left = traitKey === null ? '' : `, left ${nameIn(content.heroTraits, traitKey)}`;
      return `${hero(event, heroId)} recovered from ${nameIn(content.injuries, typeKey)}${left}.`;
    }
    case 'hero.trait-gained': {
      // v1.1.4-S7: an earned Trait (DL-148 item 25), named with the Encounter that gave it.
      const { heroId, traitKey, questId, encounterKey } = event.payload;
      return `${hero(event, heroId)} earned the Trait ${nameIn(content.heroTraits, traitKey)} on ${questId}, at ${nameIn(content.encounters, encounterKey)}.`;
    }
    case 'hero.trait-lost': {
      // v1.1.4-S7: a Trait an Injury left replaced one it conflicts with (DL-150 item 5).
      const { heroId, traitKey, replacedBy } = event.payload;
      return `${hero(event, heroId)} lost the Trait ${nameIn(content.heroTraits, traitKey)}, replaced by ${nameIn(content.heroTraits, replacedBy)}.`;
    }
    case 'hero.retired':
      return `${hero(event, event.payload.heroId)} retired from ${called(event, event.payload.guildId)} at ${event.payload.age}.`;
    case 'hero.declined': {
      const { heroId, statKey, delta, age } = event.payload;
      return `${hero(event, heroId)}, at ${age}, lost ${-delta} ${nameIn(content.stats, statKey)} to age.`;
    }
    case 'game.ended':
      return `The game ended: ${called(event, event.payload.guildId)} ${endingWords[event.payload.reason]}.`;
    case 'guild.folded':
      return `${called(event, event.payload.guildId)} ${endingWords[event.payload.reason]} and folded.`;
    case 'guildmaster.succeeded': {
      // M9-S2: a Rival's Guildmaster's Retirement, met by Succession (DL-100 item 3).
      const { guildId, guildmasterId, successorId, age } = event.payload;
      return `${called(event, guildmasterId)} retired at ${age} as Guildmaster of ${called(event, guildId)}, and ${called(event, successorId)} succeeded them.`;
    }
    case 'hero.left-guild':
      return `${hero(event, event.payload.heroId)} left ${called(event, event.payload.guildId)} for the Unattached pool.`;
    case 'guild.improved': {
      const { guildId, facility, grade, improvementKey, cost } = event.payload;
      return (
        `${called(event, guildId)} built ${nameIn(content.improvements, improvementKey)} for ${cost} Wealth: ` +
        `its ${facilityNames[facility]} ${facilityIs[facility]} now grade ${grade}.`
      );
    }
    case 'hero.levelled': {
      // The Stats that rose, never the points Potential took: Potential is shown only as a hint.
      const { heroId, level, statDeltas } = event.payload;
      const rose = Object.entries(statDeltas)
        .sort(([a], [b]) => compareByCodeUnit(a, b))
        .map(([statKey, delta]) => `${nameIn(content.stats, statKey)} ${signed(delta)}`);
      return `${hero(event, heroId)} reached Level ${level}${rose.length === 0 ? '' : `: ${rose.join(', ')}`}.`;
    }
    case 'patron.regard-changed': {
      const { patronId, guildId, cause, bandBefore, bandAfter } = event.payload;
      return (
        `${called(event, patronId)}'s Regard for ${called(event, guildId)} ${crossed(bandBefore, bandAfter)} ` +
        `${patronRegardWords[cause]}.`
      );
    }
    case 'guildmaster.regard-changed': {
      const { guildmasterId, entityId, bandBefore, bandAfter } = event.payload;
      return `${called(event, guildmasterId)}'s Regard for ${called(event, entityId)} ${crossed(bandBefore, bandAfter)}.`;
    }
    case 'hero.regard-changed': {
      const { heroId, entityId, cause, bandBefore, bandAfter } = event.payload;
      return (
        `${hero(event, heroId)}'s Regard for ${hero(event, entityId)} ${crossed(bandBefore, bandAfter)} ` +
        `${heroRegardWords[cause]}.`
      );
    }
    case 'item.equipped': {
      const { guildId, heroId, slot } = event.payload;
      return `${called(event, guildId)} put ${gearMoved(event.payload, content)} in ${hero(event, heroId)}'s ${slot} slot.`;
    }
    case 'item.unequipped': {
      const { guildId, heroId, slot } = event.payload;
      return `${called(event, guildId)} took ${gearMoved(event.payload, content)} from ${hero(event, heroId)}'s ${slot} slot.`;
    }
    case 'item.returned': {
      const { guildId, heroId, cause } = event.payload;
      return (
        `${gearMoved(event.payload, content)} went back to ${called(event, guildId)} from ${hero(event, heroId)}` +
        `${gearReturnWords[cause]}.`
      );
    }
    case 'item.bought': {
      const { guildId, definitionKey, quantity, cost, itemIds } = event.payload;
      return `${called(event, guildId)} bought ${items(content, definitionKey, quantity, itemIds)} at the Market for ${cost} Wealth.`;
    }
    case 'item.sold': {
      const { guildId, definitionKey, quantity, proceeds, itemIds, cause } = event.payload;
      const what = items(content, definitionKey, quantity, itemIds);
      return cause === 'fold'
        ? `${called(event, guildId)}'s ${what} went to the Market for ${proceeds} Wealth as the Guild folded.`
        : `${called(event, guildId)} sold ${what} at the Market for ${proceeds} Wealth.`;
    }
    case 'hero.transferred': {
      // M6-S2: who moved, from whom to whom, for how much, and the offer accepted, if one was.
      const { heroId, fromGuildId, toGuildId, fee, offerId } = event.payload;
      const accepted = offerId === null ? '' : `, accepting ${offerId}`;
      return `${called(event, toGuildId)} took ${hero(event, heroId)} from ${called(event, fromGuildId)} for ${fee} Wealth${accepted}.`;
    }
    case 'guild.transfer-offered': {
      const { offerId, fromGuildId, toGuildId, heroId, fee, expiresOnTurn } = event.payload;
      return (
        `${called(event, toGuildId)} offered ${called(event, fromGuildId)} ${fee} Wealth for ${hero(event, heroId)} ` +
        `(${offerId}), until ${night(expiresOnTurn)}.`
      );
    }
    case 'guild.transfer-offer-declined': {
      const { offerId, fromGuildId, toGuildId, heroId } = event.payload;
      return `${called(event, fromGuildId)} declined ${called(event, toGuildId)}'s offer for ${hero(event, heroId)} (${offerId}).`;
    }
    case 'guild.transfer-offer-expired': {
      const { offerId, toGuildId, heroId, cause } = event.payload;
      return `${called(event, toGuildId)}'s offer for ${hero(event, heroId)} (${offerId}) ${offerEndWords[cause]}.`;
    }
    case 'guild.wealth-changed': {
      // M8-S2: a module's `adjustWealth` effect.
      const { guildId, before, after } = event.payload;
      return `${called(event, guildId)}'s Wealth went from ${before} to ${after}.`;
    }
    case 'item.expended': {
      // The roll is the engine's; the CLI says which Encounter, counted from 1, and what it did (M5-S3).
      const { payload } = event;
      const used = `${called(event, payload.guildId)}'s ${payload.partyId} used one ${nameIn(content.items, payload.definitionKey)}`;
      switch (payload.effect) {
        case 'bonus':
          return `${used} on Encounter ${payload.encounterIndex + 1}: ${signed(payload.flat)} to its Check.`;
        case 'reroll':
          return `${used} to try Encounter ${payload.encounterIndex + 1} again.`;
        case 'heal':
          return `${used} on ${hero(event, payload.heroId)}: their Injury heals ${payload.days} ${payload.days === 1 ? 'Day' : 'Days'} sooner.`;
      }
    }
  }
}

/** A list of ids as the CLI prints one: `a`, `a and b`, `a, b and c`. */
function listed(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/**
 * Why a fast forward stopped, in one line. `document` is where it stopped; `maxTurns` the cap it
 * played under.
 */
export function narrateStop(stop: StopReason, document: WorldDocument, maxTurns: number): string {
  const { world } = document;
  switch (stop.kind) {
    case 'ended':
      return 'Stopped: the game is over.';
    case 'party-returned': {
      const guild = rowIn(world.guilds, stop.guildId)?.name ?? stop.guildId;
      const parties = stop.partyIds.length === 1 ? 'Party' : 'Parties';
      return `Stopped: ${guild}'s ${parties} came home: ${listed(stop.partyIds)}.`;
    }
    case 'below-floor': {
      // M9-S1: the countdown's line follows with the floor and the rest (renderAdvance).
      const guild = rowIn(world.guilds, stop.guildId)?.name ?? stop.guildId;
      return `Stopped: ${guild} fell below the Bankruptcy floor: Bankruptcy on the night of Day ${stop.dueDay} unless its Wealth recovers by then.`;
    }
    case 'decision-needed': {
      const guild = rowIn(world.guilds, stop.guildId)?.name ?? stop.guildId;
      return `Stopped: a decision is needed: ${guild} has no Party out, and could send one on ${listed(stop.questIds)} (show board).`;
    }
    case 'quest-staffable': {
      // M9-S1: `--until staffable`, whether or not a Party is out.
      const guild = rowIn(world.guilds, stop.guildId)?.name ?? stop.guildId;
      return `Stopped: a Quest to staff: ${guild}'s Heroes at home could go on ${listed(stop.questIds)} (show board).`;
    }
    case 'transfer-offer': {
      // M6-S2: each offer that arrived, as `show offers` lists it, and the two commands that answer it.
      const offers = stop.offerIds.map((offerId) => {
        const offer = rowIn(world.offers, offerId);
        if (offer === undefined) return offerId;
        const bidder = rowIn(world.guilds, offer.toGuildId)?.name ?? offer.toGuildId;
        const wanted = rowIn(world.heroes, offer.heroId)?.name ?? offer.heroId;
        return `${bidder} offers ${offer.fee} Wealth for ${wanted} (${offer.heroId}) until ${night(offer.expiresOnTurn)} (${offerId})`;
      });
      return `Stopped: a Transfer Offer: ${listed(offers)}. Answer with accept --offer <id> or decline --offer <id> (show offers).`;
    }
    case 'module':
      // M8-S2: an installed module's hook asked for the stop.
      return `Stopped: the ${stop.moduleId} module asked to stop.`;
    case 'max-turns':
      return `Stopped: played the most Turns allowed, ${maxTurns}.`;
    case 'pool-refreshed': {
      const heroes = stop.heroIds.map((id) => {
        const row = rowIn(world.heroes, id);
        return row === undefined ? id : `${row.name} (${id})`;
      });
      return `Stopped: new in the Unattached pool: ${listed(heroes)} (show pool).`;
    }
  }
}

// ── Advancing ────────────────────────────────────────────────────────────────────────────────

/**
 * `advance`: how many Turns were played, where time stands now, why a fast forward stopped when it
 * was one (`stop`), the Bankruptcy countdown while the player's Guild is below the floor
 * (`renderCountdown`, DL-95), whether the game has ended, and each event of the Turns played,
 * oldest first, one line each in the CLI's words.
 */
export function renderAdvance(
  played: number,
  events: readonly TurnEvent[],
  document: WorldDocument,
  deps: EngineDeps,
  stop?: string,
): string[] {
  const { turn, ended } = document.world;
  return [
    `Played ${played} ${played === 1 ? 'Turn' : 'Turns'}. Now ${renderTime(turn, deps.config)}.`,
    ...(stop === undefined ? [] : [stop]),
    ...renderCountdown(document, deps),
    ...(ended === null ? [] : [`The game ended on Turn ${ended.turn}: ${ended.reason}.`]),
    '',
    ...(events.length === 0
      ? ['No events.']
      : [
          `Events: ${events.length}, oldest first`,
          '',
          ...table(
            [{ heading: 'Turn', align: 'right' }, { heading: 'What happened' }],
            events.map((event) => [String(event.turn), narrate(event, deps.content)]),
          ),
        ]),
  ];
}
