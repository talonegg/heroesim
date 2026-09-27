// The front end's words for what the engine reports (M7-S3, DL-66): a typed event in, one sentence
// out; a stop reason in, one sentence out. The engine emits data, never prose (ADR-0003), and the
// CLI and the browser each put it in words: "the same engine, the same words", so every sentence
// here is the CLI's (`cli/src/narrate.ts`), adapted as the refusals were (DL-65 item 6):
//
// - a Hero, Guild, Patron or Guildmaster by name alone, never with the id a CLI command takes;
// - a Quest by its template's name, never its id, and a Party as the Guild's Party;
// - an Item by content's name, without the id `equip` and `sell` take;
// - no pointer to a CLI command: where the CLI says `(show board)`, the page puts a button.
//
// Names come from each event's labels, written when it happened, so a Hero whose row has since
// gone still reads. A Quest carries no label, so its name comes from `questName`, which the caller
// reads from the world and the History (`questNamer` below). One map, keyed by every event type,
// so that `tsc -b` refuses a type the engine adds until it has words, and `narrate.test.ts`
// enumerates the union.
//
// It lives in `state/`, beside `rejections.ts`, because it reads engine values (`dayOf`,
// `regardBandNames`, `parseId`), which only `state/` may import (M7-S2).

import {
  compareByCodeUnit,
  dayOf,
  entriesFor,
  parseId,
  regardBandNames,
  type ContentSet,
  type EndingReason,
  type EngineEvent,
  type EngineEventOf,
  type EngineEventType,
  type EntityId,
  type GearMove,
  type GearReturnCause,
  type GuildId,
  type HeroId,
  type HeroRegardCause,
  type PatronRegardCause,
  type QuestBand,
  type QuestId,
  type RegardBand,
  type StopReason,
  type TableName,
  type TransferOfferEndCause,
  type WorldDocument,
} from '@heroesim/engine';
import { facilityIs, facilityNames } from './rejections';

/** What a sentence reads beyond its event: content's names, and a Quest's name by its id. */
export interface Narration {
  content: ContentSet;
  /** A Quest's name: its template's, while the world or its History knows it. */
  questName: (questId: QuestId) => string;
}

// ── Names ────────────────────────────────────────────────────────────────────────────────────

/** A content row's name; a key the content does not define is shown as it is (data-model rule 5). */
function nameIn(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  return Object.hasOwn(rows, key) ? (rows[key]?.name ?? key) : key;
}

/** What an entity with no label is called: `a Hero`, `a Guild`. */
const someone: Readonly<Record<TableName, string>> = Object.freeze({
  guilds: 'a Guild',
  guildmasters: 'a Guildmaster',
  heroes: 'a Hero',
  patrons: 'a Patron',
  quests: 'a Quest',
  parties: 'a Party',
  offers: 'an offer',
  items: 'an Item',
  stacks: 'an Item',
});

/** A participant by the label the event carries, or what it is when it has none. */
function called(event: EngineEvent, id: EntityId): string {
  const label = event.labels[id];
  if (label !== undefined) return label;
  const parsed = parseId(id);
  return parsed === null ? 'someone' : someone[parsed.table];
}

/** `+120`, `-2`, `0`. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function night(turn: number): string {
  return `the night of Day ${dayOf(turn)}`;
}

/** A list as a sentence gives one: `a`, `a and b`, `a, b and c`. */
export function listed(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

const bandWords: Readonly<Record<QuestBand, string>> = { fail: 'failed', success: 'succeeded', strong: 'succeeded strongly' };

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
  'offer-expired': 'when an offer of theirs went untaken',
  recovery: 'as time passed',
};

/** What moved a Hero's Regard for another Hero, after the band it reached (M4-S4). */
const heroRegardWords: Readonly<Record<HeroRegardCause, string>> = {
  'shared-quest': 'after a Quest together',
  decay: 'as time passed apart',
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

/** `rose from neutral to warm`, `fell from cool to hostile`: a Regard band crossed, never a number (M4-S5). */
function crossed(before: RegardBand, after: RegardBand): string {
  const way = regardBandNames.indexOf(after) > regardBandNames.indexOf(before) ? 'rose' : 'fell';
  return `${way} from ${before} to ${after}`;
}

/** Items as a sentence names them (M5-S4): `Whetstone`, `3 × Whetstone`. */
function items(content: ContentSet, definitionKey: string, quantity: number): string {
  const name = nameIn(content.items, definitionKey);
  return quantity === 1 ? name : `${quantity} × ${name}`;
}

function gear(move: GearMove, content: ContentSet): string {
  return nameIn(content.items, move.definitionKey);
}

// ── The map ──────────────────────────────────────────────────────────────────────────────────

type Sentences = { [Type in EngineEventType]: (event: EngineEventOf<Type>, narration: Narration) => string };

const sentences: Sentences = {
  'world.created': (event) => `The world was made from seed ${event.payload.seed}.`,
  'guild.founded': (event) => `${called(event, event.payload.guildId)} was founded.`,
  'guildmaster.generated': (event) =>
    `${called(event, event.payload.guildmasterId)} leads ${called(event, event.payload.guildId)}.`,
  'hero.generated': (event, { content }) => {
    const { heroId, guildId, classKey } = event.payload;
    const where = guildId === null ? 'the Unattached pool' : called(event, guildId);
    return `${called(event, heroId)}, ${nameIn(content.classes, classKey)}, joined ${where}.`;
  },
  'patron.generated': (event, { content }) =>
    `${called(event, event.payload.patronId)} of the ${nameIn(content.spheres, event.payload.sphereKey)} became a Patron.`,
  'world.rules-adopted': (event) =>
    `The rules moved from configVersion ${event.payload.oldConfigVersion} to ${event.payload.newConfigVersion}.`,
  'guild.upkeep-paid': (event) =>
    `${called(event, event.payload.guildId)} paid ${event.payload.amount} Upkeep, leaving ${event.payload.wealthAfter} Wealth.`,
  'hero.recruited': (event) =>
    `${called(event, event.payload.guildId)} signed ${called(event, event.payload.heroId)} for ${event.payload.fee} Wealth.`,
  'hero.left-pool': (event) => `${called(event, event.payload.heroId)} left the Unattached pool.`,
  'quest.offered': (event, { content }) =>
    `${called(event, event.payload.patronId)} offered ${nameIn(content.questTemplates, event.payload.templateKey)}.`,
  'quest.expired': (event, { content }) =>
    `${called(event, event.payload.patronId)}'s ${nameIn(content.questTemplates, event.payload.templateKey)} expired untaken.`,
  'quest.taken': (event, { content, questName }) => {
    // What the Party carries (M5-S3), when it carries anything; an entry from before M5-S3 has none.
    const { guildId, questId, heroIds, returnsOnTurn, consumables = [] } = event.payload;
    const carrying = consumables.map(({ definitionKey, quantity }) => `${nameIn(content.items, definitionKey)} ×${quantity}`);
    const carried = carrying.length === 0 ? '' : `, carrying ${listed(carrying)}`;
    const party = listed(heroIds.map((id) => called(event, id)));
    return `${called(event, guildId)} sent ${party} on ${questName(questId)}, back on ${night(returnsOnTurn)}${carried}.`;
  },
  'quest.encounter': (event, { content }) => {
    // The roll and target are the engine's; the page says only how it went and what it cost, and
    // which Encounter it was, counted from 1.
    const { guildId, index, encounterKey, outcome, injured, died } = event.payload;
    const went = outcome === 'success' ? 'came through' : 'failed at';
    const hurt = [
      ...injured.map((id) => `${called(event, id)} was injured`),
      ...died.map((id) => `${called(event, id)} was killed`),
    ];
    const which = `${nameIn(content.encounters, encounterKey)} (Encounter ${index + 1})`;
    return `${called(event, guildId)}'s Party ${went} ${which}${hurt.length === 0 ? '' : `: ${listed(hurt)}`}.`;
  },
  'quest.resolved': (event, { content }) => {
    const { guildId, templateKey, band, wealthDelta, fameDelta, synergyKeys = [] } = event.payload;
    // The Synergies that applied (M4-S3), when any did; an entry from before M4-S3 has none.
    const synergies = synergyKeys.length === 0 ? '' : ` Synergies: ${synergyKeys.map((key) => nameIn(content.synergies, key)).join(', ')}.`;
    return (
      `${called(event, guildId)}'s Party came home from ${nameIn(content.questTemplates, templateKey)} ` +
      `and ${bandWords[band]}: Wealth ${signed(wealthDelta)}, Fame ${signed(fameDelta)}.${synergies}`
    );
  },
  'quest.loot': (event, { content, questName }) => {
    const { guildId, questId, definitionKey, quantity } = event.payload;
    return `${called(event, guildId)} found Loot on ${questName(questId)}: ${items(content, definitionKey, quantity)}.`;
  },
  'hero.injured': (event, { content }) => {
    const { heroId, typeKey, healsOnTurn } = event.payload;
    return `${called(event, heroId)} was injured (${nameIn(content.injuries, typeKey)}), healing on ${night(healsOnTurn)}.`;
  },
  'hero.died': (event, { questName }) => `${called(event, event.payload.heroId)} died on ${questName(event.payload.questId)}.`,
  'hero.xp-gained': (event) => `${called(event, event.payload.heroId)} gained ${event.payload.amount} XP.`,
  'hero.morale-changed': (event) => {
    const { heroId, before, after, bandAfter } = event.payload;
    return `${called(event, heroId)}'s Morale went from ${before} to ${after}, ${bandAfter}.`;
  },
  'hero.healed': (event, { content }) => {
    const { heroId, typeKey, traitKey } = event.payload;
    const left = traitKey === null ? '' : `, left ${nameIn(content.traits, traitKey)}`;
    return `${called(event, heroId)} recovered from ${nameIn(content.injuries, typeKey)}${left}.`;
  },
  'hero.retired': (event) =>
    `${called(event, event.payload.heroId)} retired from ${called(event, event.payload.guildId)} at ${event.payload.age}.`,
  'hero.declined': (event, { content }) => {
    const { heroId, statKey, delta, age } = event.payload;
    return `${called(event, heroId)}, at ${age}, lost ${-delta} ${nameIn(content.stats, statKey)} to age.`;
  },
  'game.ended': (event) => `The game ended: ${called(event, event.payload.guildId)} ${endingWords[event.payload.reason]}.`,
  'guild.folded': (event) => `${called(event, event.payload.guildId)} ${endingWords[event.payload.reason]} and folded.`,
  'hero.left-guild': (event) =>
    `${called(event, event.payload.heroId)} left ${called(event, event.payload.guildId)} for the Unattached pool.`,
  'guild.improved': (event, { content }) => {
    const { guildId, facility, grade, improvementKey, cost } = event.payload;
    return (
      `${called(event, guildId)} built ${nameIn(content.improvements, improvementKey)} for ${cost} Wealth: ` +
      `its ${facilityNames[facility]} ${facilityIs[facility]} now grade ${grade}.`
    );
  },
  'hero.levelled': (event, { content }) => {
    // The Stats that rose, never the points Potential took: Potential is shown only as a hint.
    const { heroId, level, statDeltas } = event.payload;
    const rose = Object.entries(statDeltas)
      .sort(([a], [b]) => compareByCodeUnit(a, b))
      .map(([statKey, delta]) => `${nameIn(content.stats, statKey)} ${signed(delta)}`);
    return `${called(event, heroId)} reached Level ${level}${rose.length === 0 ? '' : `: ${rose.join(', ')}`}.`;
  },
  'patron.regard-changed': (event) => {
    const { patronId, guildId, cause, bandBefore, bandAfter } = event.payload;
    return `${called(event, patronId)}'s Regard for ${called(event, guildId)} ${crossed(bandBefore, bandAfter)} ${patronRegardWords[cause]}.`;
  },
  'guildmaster.regard-changed': (event) => {
    const { guildmasterId, entityId, bandBefore, bandAfter } = event.payload;
    return `${called(event, guildmasterId)}'s Regard for ${called(event, entityId)} ${crossed(bandBefore, bandAfter)}.`;
  },
  'hero.regard-changed': (event) => {
    const { heroId, entityId, cause, bandBefore, bandAfter } = event.payload;
    return `${called(event, heroId)}'s Regard for ${called(event, entityId)} ${crossed(bandBefore, bandAfter)} ${heroRegardWords[cause]}.`;
  },
  'item.equipped': (event, { content }) => {
    const { guildId, heroId, slot } = event.payload;
    return `${called(event, guildId)} put ${gear(event.payload, content)} in ${called(event, heroId)}'s ${slot} slot.`;
  },
  'item.unequipped': (event, { content }) => {
    const { guildId, heroId, slot } = event.payload;
    return `${called(event, guildId)} took ${gear(event.payload, content)} from ${called(event, heroId)}'s ${slot} slot.`;
  },
  'item.returned': (event, { content }) => {
    const { guildId, heroId, cause } = event.payload;
    return `${gear(event.payload, content)} went back to ${called(event, guildId)} from ${called(event, heroId)}${gearReturnWords[cause]}.`;
  },
  'item.bought': (event, { content }) => {
    const { guildId, definitionKey, quantity, cost } = event.payload;
    return `${called(event, guildId)} bought ${items(content, definitionKey, quantity)} at the Market for ${cost} Wealth.`;
  },
  'item.sold': (event, { content }) => {
    const { guildId, definitionKey, quantity, proceeds, cause } = event.payload;
    const what = items(content, definitionKey, quantity);
    return cause === 'fold'
      ? `${called(event, guildId)}'s ${what} went to the Market for ${proceeds} Wealth as the Guild folded.`
      : `${called(event, guildId)} sold ${what} at the Market for ${proceeds} Wealth.`;
  },
  'hero.transferred': (event) => {
    // M6-S2: who moved, from whom to whom, for how much, and whether an offer was accepted.
    const { heroId, fromGuildId, toGuildId, fee, offerId } = event.payload;
    const accepted = offerId === null ? '' : ', accepting its Transfer Offer';
    return `${called(event, toGuildId)} took ${called(event, heroId)} from ${called(event, fromGuildId)} for ${fee} Wealth${accepted}.`;
  },
  'guild.transfer-offered': (event) => {
    const { fromGuildId, toGuildId, heroId, fee, expiresOnTurn } = event.payload;
    return `${called(event, toGuildId)} offered ${called(event, fromGuildId)} ${fee} Wealth for ${called(event, heroId)}, until ${night(expiresOnTurn)}.`;
  },
  'guild.transfer-offer-declined': (event) => {
    const { fromGuildId, toGuildId, heroId } = event.payload;
    return `${called(event, fromGuildId)} declined ${called(event, toGuildId)}'s offer for ${called(event, heroId)}.`;
  },
  'guild.transfer-offer-expired': (event) => {
    const { toGuildId, heroId, cause } = event.payload;
    return `${called(event, toGuildId)}'s offer for ${called(event, heroId)} ${offerEndWords[cause]}.`;
  },
  'item.expended': (event, { content }) => {
    // The roll is the engine's; the page says which Encounter, counted from 1, and what it did (M5-S3).
    const { payload } = event;
    const used = `${called(event, payload.guildId)}'s Party used one ${nameIn(content.items, payload.definitionKey)}`;
    switch (payload.effect) {
      case 'bonus':
        return `${used} on Encounter ${payload.encounterIndex + 1}: ${signed(payload.flat)} to its Check.`;
      case 'reroll':
        return `${used} to try Encounter ${payload.encounterIndex + 1} again.`;
      case 'heal':
        return `${used} on ${called(event, payload.heroId)}: their Injury heals ${payload.days} ${payload.days === 1 ? 'Day' : 'Days'} sooner.`;
    }
  },
};

/** Every event type the map has words for: the test holds it to the union. */
export const narratedTypes = Object.freeze(Object.keys(sentences)) as readonly EngineEventType[];

/** `event` as one sentence, in the CLI's words, capitalised when it opens with `a Hero` or the like. */
export function narrate(event: EngineEvent, narration: Narration): string {
  const words = sentences[event.type] as (event: EngineEvent, narration: Narration) => string;
  const sentence = words(event, narration);
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

// ── Quests by name ───────────────────────────────────────────────────────────────────────────

/**
 * A Quest's name from `document`: its template's, from its row while the world holds one, else
 * from the History, whose `quest.offered` names the template of every Quest ever posted, and whose
 * `quest.resolved` and `quest.expired` do too once the row is gone. `a Quest` for an id neither
 * knows.
 */
export function questNamer(document: WorldDocument, content: ContentSet): (questId: QuestId) => string {
  const { world, history } = document;
  return (questId) => {
    const row = Object.hasOwn(world.quests, questId) ? world.quests[questId] : undefined;
    const templateKey =
      row?.templateKey ??
      entriesFor(history, questId)
        .map((entry) => (entry.payload as { templateKey?: unknown }).templateKey)
        .find((key): key is string => typeof key === 'string');
    return templateKey === undefined ? 'a Quest' : nameIn(content.questTemplates, templateKey);
  };
}

/** The narration for `document`: its content's names and its Quests' names. */
export function narrationFor(document: WorldDocument, content: ContentSet): Narration {
  return { content, questName: questNamer(document, content) };
}

// ── Why time stopped ─────────────────────────────────────────────────────────────────────────

/**
 * Why an advance or a fast forward stopped, in one sentence (the CLI's `narrateStop`). `document` is
 * where it stopped; `maxTurns` the cap it played under. Where the CLI points to a command, the page
 * gives a button (`stopActions` in `selectors.ts`).
 */
export function narrateStop(stop: StopReason, document: WorldDocument, maxTurns: number, narration: Narration): string {
  const { world } = document;
  const guildName = (guildId: GuildId): string => (Object.hasOwn(world.guilds, guildId) ? world.guilds[guildId]?.name : undefined) ?? 'a Guild';
  const heroName = (heroId: HeroId): string => (Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId]?.name : undefined) ?? 'a Hero';
  switch (stop.kind) {
    case 'ended':
      return 'Stopped: the game is over.';
    case 'party-returned': {
      const parties = stop.partyIds.length === 1 ? 'Party' : `${stop.partyIds.length} Parties`;
      return `Stopped: ${guildName(stop.guildId)}'s ${parties} came home.`;
    }
    case 'decision-needed':
      return (
        `Stopped: a decision is needed: ${guildName(stop.guildId)} has no Party out, and could send one on ` +
        `${listed(stop.questIds.map((questId) => narration.questName(questId)))}.`
      );
    case 'transfer-offer': {
      // M6-S2: each offer that arrived, and who made it.
      const offers = stop.offerIds.map((offerId) => {
        const offer = Object.hasOwn(world.offers, offerId) ? world.offers[offerId] : undefined;
        if (offer === undefined) return 'an offer since withdrawn';
        return `${guildName(offer.toGuildId)} offers ${offer.fee} Wealth for ${heroName(offer.heroId)} until ${night(offer.expiresOnTurn)}`;
      });
      return `Stopped: a Transfer Offer: ${listed(offers)}.`;
    }
    case 'max-turns':
      return `Stopped: played the most Turns allowed, ${maxTurns}.`;
    case 'pool-refreshed':
      return `Stopped: new in the Unattached pool: ${listed(stop.heroIds.map(heroName))}.`;
  }
}
