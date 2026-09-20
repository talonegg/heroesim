/**
 * One fleet in the normal suite that plays a world somebody will actually play.
 *
 * [DL-20](../../docs/planning/00-decision-log.md) §9 recorded the price of the automatic
 * policies deliberately not recruiting, dealing or answering (DL-19 §10): that control is
 * the only un-helped baseline the suite has and it stays exactly as it is — but it means
 * every full Career the contract suite asserts on is a Guild of four that never answers
 * its door, never deals with another Guild and never says a word to a Party that stops to
 * ask. This is the other one: the player the balance pass measured (DL-24 §B1), playing
 * the **authored** content at the shipped defaults.
 *
 * It asserts a **floor well below what is measured**, not the measurement — 85.0% of these
 * Careers reached Retirement when the pass measured them at 120 seeds, and the floor here
 * is 70%. A fleet test that pins its own measurement fails on every future content edit
 * for no reason; one that pins a floor fails when the game stops being playable, which is
 * the thing worth knowing. The exact figures live in DL-24, where a reader can find them.
 *
 * It lives here because `content/tests/` is the one Vitest project where authored content
 * and `node:fs` are allowed together (DL-19 §11).
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  acceptRefusal,
  advanceUntilAttention,
  answerParty,
  availableHeroes,
  commitParty,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  newCareer,
  poachHero,
  proposeParty,
  rivalOffers,
  transferHero,
  wordOffers,
  type Career,
  type Content,
  type GameEvent,
  type Hero,
  type WordOffer,
} from '@heroesim/engine';
import { loadContentFromDisk } from '../src/node.js';

const content: Content = loadContentFromDisk();

/** Careers played. Forty is the floor the pass set; the measurement itself used 120. */
const SEEDS = 40;
/** The Roster the player holds themselves to — DL-20 §3's measured sweet spot. */
const ROSTER_TARGET = 8;

const strength = (hero: Hero): number =>
  hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;

/**
 * What a player who is paying attention says to a Party that has sent word: turn back when
 * the work is going badly and there is enough of it left for that to matter; send coin when
 * the Guild can plainly afford it; otherwise press on. Every number it reads is on the
 * offer or on the Party, so it is a policy a front end could offer as a suggestion.
 */
function sensibleAnswer(career: Career, offer: WordOffer): string | undefined {
  const party = career.parties.find((entry) => entry.id === offer.partyId);
  const open = offer.options.filter((option) => option.affordable);
  const ofKind = (kind: 'pressOn' | 'sendCoin' | 'turnBack') =>
    open.find((option) => option.kind === kind);
  if (party !== undefined) {
    const beatsLeft = party.commission.beatCount - party.beatsResolved.length;
    const back = ofKind('turnBack');
    if (party.score < 0 && beatsLeft >= 2 && back !== undefined) return back.id;
  }
  const paid = ofKind('sendCoin');
  if (paid !== undefined && career.guild.coin >= 3 * (paid.cost ?? 0) + career.config.startingCoin) {
    return paid.id;
  }
  return (ofKind('pressOn') ?? open[0])?.id;
}

/** One Career, played to its end by the sensible player. */
function play(seed: string): { career: Career; events: GameEvent[] } {
  const opened = newCareer(seed, content);
  let career = opened.career;
  const events: GameEvent[] = [...opened.events];
  let guard = 0;

  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error(`the sensible player never finished "${seed}"`);
    const take = (step: { career: Career; events: GameEvent[] }): void => {
      career = step.career;
      events.push(...step.events);
    };

    // Answer first: the Days will not run past a waiting Party for free, and every answer
    // moves the coin the next Party's options are weighed against (DL-23 §8).
    for (let asking = 0; asking < 16; asking += 1) {
      const offer = wordOffers(career, content)[0];
      if (offer === undefined) break;
      const chosen = sensibleAnswer(career, offer);
      if (chosen === undefined) break;
      take(answerParty(career, offer.partyId, chosen, content));
    }

    // Answer the door up to the target, keeping a full `startingCoin` of runway back.
    for (const applicant of [...career.applicants]) {
      if (career.guild.roster.length >= ROSTER_TARGET) break;
      if (acceptRefusal(career, applicant.id) !== undefined) continue;
      const shortHanded = career.guild.roster.length < career.config.rosterFloor;
      if (!shortHanded && career.guild.coin < applicant.askingFee + career.config.startingCoin) {
        continue;
      }
      take(acceptApplicant(career, applicant.id));
    }

    // Deal with the other Guilds: at most one Transfer and one Poaching a year, cheapest
    // first, and never with the last of the coin.
    const year = Math.floor((career.day - 1) / career.config.daysPerYear);
    for (const rival of career.rivals) {
      if (career.guild.roster.length >= ROSTER_TARGET) break;
      const offers = rivalOffers(career, rival.id);
      const takeable = offers
        .filter((offer) => offer.poachRefusal === undefined)
        .sort((one, other) => one.poachFee - other.poachFee)[0];
      if (
        takeable !== undefined &&
        career.guild.coin >= takeable.poachFee + career.config.startingCoin
      ) {
        take(poachHero(career, rival.id, takeable.hero.id));
        continue;
      }
      const buyable = offers
        .filter((offer) => offer.transferRefusal === undefined)
        .sort((one, other) => one.transferFee - other.transferFee)[0];
      if (
        year >= 0 &&
        buyable !== undefined &&
        career.guild.coin >= buyable.transferFee + career.config.startingCoin
      ) {
        take(transferHero(career, rival.id, buyable.hero.id));
      }
    }

    for (const improvement of HALL_IMPROVEMENTS) {
      if (career.guild.hall.includes(improvement)) continue;
      if (career.guild.coin < hallCost(improvement, career.config) + career.config.startingCoin) {
        continue;
      }
      take(improveHall(career, improvement));
    }

    // The best Heroes to the best-paying work, two at a time, never insisting.
    const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
    const used = new Set<string>();
    for (const commission of [...career.board].sort((one, other) => other.fee - one.fee)) {
      const left = free.filter((hero) => !used.has(hero.id));
      if (left.length === 0) break;
      const refusing = new Set(
        proposeParty(
          career,
          commission.id,
          left.map((hero) => hero.id),
          content,
        ).refusals.map((refusal) => refusal.heroId),
      );
      const party = left
        .filter((hero) => !refusing.has(hero.id))
        .slice(0, 2)
        .map((hero) => hero.id);
      if (party.length === 0) continue;
      take(commitParty(career, commission.id, party, content));
      for (const id of party) used.add(id);
    }

    take(advanceUntilAttention(career, content));
  }
  return { career, events };
}

describe('forty Careers played the way somebody would play them', () => {
  it(
    'reaches an ending every time, and holds every structural invariant on the way',
    () => {
      let retired = 0;
      let committed = 0;
      let words = 0;

      for (let seed = 0; seed < SEEDS; seed += 1) {
        const where = `sensible-${String(seed)}`;
        const { career, events } = play(where);

        // Every Career ends, one way or the other.
        expect(career.ended, where).toBeDefined();
        if (career.ended?.reason === 'retirement') retired += 1;

        // Whole-Career coin accounting: every coin that moved is an event that says so.
        const moved = events.reduce(
          (total, event) => (event.type === 'CoinChanged' ? total + event.delta : total),
          0,
        );
        expect(career.config.startingCoin + moved, `${where}: coin`).toBe(career.guild.coin);

        // At most one Decision per Commission, which E6 §0 calls a rule and not a hope.
        const asked = new Map<string, number>();
        for (const event of events) {
          if (event.type !== 'PartyAwaitingWord') continue;
          asked.set(event.partyId, (asked.get(event.partyId) ?? 0) + 1);
        }
        for (const [partyId, count] of asked) expect(count, `${where}: ${partyId}`).toBe(1);
        words += asked.size;
        committed += events.filter((event) => event.type === 'PartyCommitted').length;

        // Nobody is on two Rosters, and nobody is out with two Parties at once.
        const employed = [
          ...career.guild.roster.map((hero) => hero.id),
          ...career.rivals.flatMap((rival) => rival.roster.map((hero) => hero.id)),
        ];
        expect(new Set(employed).size, `${where}: two Rosters`).toBe(employed.length);
        const away = career.parties.flatMap((party) => party.heroIds);
        expect(new Set(away).size, `${where}: two Parties`).toBe(away.length);
        for (const id of away) {
          expect(career.guild.roster.some((hero) => hero.id === id), `${where}: ${id}`).toBe(true);
        }
      }

      // A floor, comfortably below the 85.0% the balance pass measured at 120 seeds
      // (DL-24 §B4). What this catches is the game ceasing to be playable, not the
      // ordinary drift of a content edit.
      expect(retired / SEEDS, 'reached Retirement').toBeGreaterThanOrEqual(0.7);

      // And rarity is a rule (E6 §0, DL-24 §B2): one Commission in about five stops, and
      // this is the shipped default measured on the shipped content rather than asserted
      // of a fixture world. The band is the one the pass adopted.
      const perCommission = words / committed;
      expect(perCommission, 'Decisions per Commission').toBeGreaterThanOrEqual(0.15);
      expect(perCommission, 'Decisions per Commission').toBeLessThanOrEqual(0.25);
    },
    120_000,
  );
});
