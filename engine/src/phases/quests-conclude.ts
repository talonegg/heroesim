// Night, first: Quests concluding go to the Quest Engine and their outcomes are applied (approach
// §2, M2-S5, DL-29; M4-S2, DL-42). Each Party whose `returnsOnTurn` has come, in id order, is
// resolved by the Quest Engine (quest-engine/resolve.ts) through its Encounter sequence, drawing
// from the `quests` stream (and, for a Quest generated before M4, `encounters`), and its outcome
// applied here: one `quest.encounter` for each Encounter checked, in sequence order, then
// `quest.resolved`; any Loot to the Guild's holding with `quest.loot` (M5-S5, quest-engine/loot.ts,
// DL-52); the Guild's Wealth and Fame move (Fame's floor is the Guild State Engine's, later the same
// night); a Hero injured carries the Injury until its night; a Hero who died leaves
// the Roster and keeps their row (data-model rule 8); each Trait a Hero earned joins their Traits,
// with `hero.trait-gained` (v1.1.4-S7, DL-148 item 25); each Hero who came home gains the XP; Morale
// moves by each Hero's own of the Encounters' Morale (v1.1.4-S4), on a strong success and on a Death in the Roster, each change
// emitting `hero.morale-changed`; the Patron's and the Guildmaster's Regard move, once for the
// resolved Quest (M4-S5, regard.ts, events only on a band crossing); each Hero home alive gains
// Regard for each other, the Encounters' Regard (`outcome.regardDelta`) with it, once for the
// Quest (M4-S4, hero-regard.ts, events only on a band crossing); every event of the XP, Morale and
// Regard the return causes names the Quest, in its payload and as a participant, so the Quest's own
// History holds its whole return (M9-F1, DL-112 item 2); the survivors are free again
// (`partyId: null`); the consumables the Party used are expended, each an `item.expended` after the
// Encounters, and the rest go home to the Guild's holding (M5-S3, DL-50); and the Party and the
// Quest rows go, the History keeping their record. Every Guild alike (ADR-0002 as amended by
// pre-M0 review A1), a folded Guild's Parties excepted, as every per-Guild rule skips a folded Guild.
//
// A Party comes home on a night, so its Heroes are free from that night's end: dispatchable again
// from the next morning (pre-M0 review C4), or by an action taken on the return night itself.

import { compareByCodeUnit, type Guild, type Party, type Quest, type World } from '../document.js';
import type { EngineEvent } from '../events.js';
import { regardOnSharedQuest } from '../hero-regard.js';
import { inflictInjury } from '../injuries.js';
import { changeMorale } from '../morale.js';
import { expendUsed, sendHome } from '../quest-engine/consumables.js';
import { awardLoot } from '../quest-engine/loot.js';
import { resolveQuest, type Resolution } from '../quest-engine/resolve.js';
import { regardOnQuestResolved } from '../regard.js';
import type { PhaseContext, PhaseRun } from './phase.js';

export const questsConclude: PhaseRun = (world, ctx) => {
  const events: EngineEvent[] = [];
  const due = Object.values(world.parties)
    .filter((party) => party.returnsOnTurn <= ctx.turn)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  for (const party of due) {
    const guild = row(world.guilds, party.guildId);
    if (guild.foldedOnTurn !== null) continue;
    const quest = row(world.quests, party.questId);
    const resolution = resolveQuest(world, quest, party, ctx);
    events.push(...conclude(world, ctx, { party, guild, quest, resolution }));
  }
  return events;
};

interface Concluding {
  party: Party;
  guild: Guild;
  quest: Quest;
  resolution: Resolution;
}

/** Applies the resolution's outcome to the world and returns its events, in the order they happened. */
function conclude(world: World, ctx: PhaseContext, { party, guild, quest, resolution }: Concluding): EngineEvent[] {
  const { config, emit, turn } = ctx;
  const { outcome } = resolution;
  const heroes = party.heroIds.map((heroId) => row(world.heroes, heroId));
  // Emitted first, while the Quest and the Party are still rows to label: each Encounter in order,
  // naming the Heroes it hurt, then each consumable used, expended from its stack (M5-S3), then the
  // Quest.
  const events: EngineEvent[] = [
    ...resolution.encounters.map((result) =>
      emit({
        type: 'quest.encounter',
        participants: [quest.id, party.id, guild.id, ...result.injured, ...result.died],
        payload: { questId: quest.id, partyId: party.id, guildId: guild.id, ...result },
      }),
    ),
    ...expendUsed(world, emit, { party, quest }, resolution.consumables),
    emit({
      type: 'quest.resolved',
      participants: [quest.id, party.id, ...party.heroIds, guild.id, quest.patronId],
      payload: {
        questId: quest.id,
        partyId: party.id,
        guildId: guild.id,
        heroIds: [...party.heroIds],
        templateKey: quest.templateKey,
        ...outcome,
      },
    }),
  ];

  events.push(...awardLoot(world, emit, { quest, party, guild }, resolution.loot)); // M5-S5: Loot to the Guild (DL-52)
  guild.wealth += outcome.wealthDelta;
  guild.fame += outcome.fameDelta;

  for (const { heroId, typeKey, healDays } of outcome.injuries) {
    const healsOnTurn = inflictInjury(row(world.heroes, heroId), typeKey, healDays, turn);
    events.push(
      emit({ type: 'hero.injured', participants: [heroId, quest.id], payload: { heroId, questId: quest.id, typeKey, healsOnTurn } }),
    );
  }

  for (const heroId of outcome.deaths) {
    const hero = row(world.heroes, heroId);
    hero.diedOnTurn = turn;
    hero.partyId = null;
    guild.rosterIds = guild.rosterIds.filter((id) => id !== heroId);
    events.push(emit({ type: 'hero.died', participants: [heroId, quest.id], payload: { heroId, questId: quest.id } }));
  }

  // v1.1.4-S7: the Traits the Heroes earned, a Milestone each; the resolver drew them only for those who may take them.
  for (const { heroId, traitKey, encounterIndex, encounterKey } of resolution.traits) {
    row(world.heroes, heroId).traits.push(traitKey);
    events.push(
      emit({
        type: 'hero.trait-gained',
        participants: [heroId, quest.id],
        payload: { heroId, traitKey, questId: quest.id, encounterIndex, encounterKey },
      }),
    );
  }

  const survivors = heroes.filter((hero) => hero.diedOnTurn === null);
  for (const hero of survivors) {
    hero.xp += outcome.xpPerHero;
    events.push(
      emit({
        type: 'hero.xp-gained',
        participants: [hero.id, quest.id],
        payload: { heroId: hero.id, questId: quest.id, amount: outcome.xpPerHero },
      }),
    );
  }

  // v1.1.4-S4: each Hero's own Morale from the Encounters, a loss `steadiedBy` their Stats less for some.
  for (const hero of survivors) {
    const delta = Object.hasOwn(outcome.moraleByHero, hero.id) ? (outcome.moraleByHero[hero.id] ?? 0) : 0;
    if (delta !== 0) events.push(changeMorale(hero, delta, 'encounters', config, emit, quest.id));
  }
  if (outcome.band === 'strong') {
    for (const hero of survivors) {
      events.push(changeMorale(hero, config.moraleOnStrongSuccess, 'strong-success', config, emit, quest.id));
    }
  }
  // Each Death costs every Hero left on the Roster, those away on other Quests included.
  for (let death = 0; death < outcome.deaths.length; death += 1) {
    for (const heroId of guild.rosterIds) {
      const mate = row(world.heroes, heroId);
      if (mate.diedOnTurn !== null || mate.retiredOnTurn !== null) continue;
      events.push(changeMorale(mate, config.moraleOnRosterDeath, 'roster-death', config, emit, quest.id));
    }
  }

  // Regard the outcome moves: the Patron's for the Guild, the Guildmaster's for the Patron and for
  // each Hero home on the Roster (M4-S5, regard.ts).
  const home = survivors.filter((hero) => guild.rosterIds.includes(hero.id)).map((hero) => hero.id);
  const resolved = { questId: quest.id, patronId: quest.patronId, guild, heroIds: home, succeeded: outcome.band !== 'fail' };
  events.push(...regardOnQuestResolved(world, ctx, resolved));
  // Regard between the Heroes who came home alive, each for each other, once for the Quest, the
  // Encounters' Regard in the same change; the dead take no part (M4-S4, hero-regard.ts, DL-46).
  events.push(
    ...regardOnSharedQuest(survivors, ctx, { questId: quest.id, succeeded: outcome.band !== 'fail', regardDelta: outcome.regardDelta }),
  );

  for (const hero of survivors) hero.partyId = null;
  // M5-S3: what the Party carried and did not use goes home to the Guild's holding.
  sendHome(world, party);
  delete world.parties[party.id];
  delete world.quests[quest.id];
  return events;
}

/** The row `id` names in `rows`, which must be there: a Party's Guild, Quest and Heroes always are. */
function row<Row>(rows: Readonly<Record<string, Row>>, id: string): Row {
  const found = Object.hasOwn(rows, id) ? rows[id] : undefined;
  if (found === undefined) throw new RangeError(`${id} is not in the world`);
  return found;
}
