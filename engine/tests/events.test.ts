/**
 * The event union is the engine's whole output (ADR-0002), so it is worth pinning down.
 * `EVERY_EVENT` is the type test: it will not compile if a member is added to the union
 * without being listed here, or if a name is listed that the union does not carry.
 */

import { describe, expect, it } from 'vitest';
import { advance, commitParty } from '../src/career.js';
import type { GameEvent, GameEventType } from '../src/events.js';
import { newCareer } from '../src/world.js';
import { fixtureContent } from './fixtures.js';

const EVERY_EVENT: Record<GameEventType, true> = {
  CareerStarted: true,
  BoardRefreshed: true,
  CommissionPosted: true,
  CommissionExpired: true,
  CommissionTakenByRival: true,
  PartyCommitted: true,
  BeatResolved: true,
  ConsequenceApplied: true,
  PartyReturned: true,
  CoinChanged: true,
  PatronRegardChanged: true,
  HeroRegardForGuildmasterChanged: true,
  TraitGained: true,
  TraitLifted: true,
  UpkeepOwed: true,
  CareerEnded: true,
};

describe('the event union', () => {
  it('names every member exactly once', () => {
    const names = Object.keys(EVERY_EVENT);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(16);
  });

  it('narrows on `type` to the fields that member carries', () => {
    const event: GameEvent = {
      type: 'BeatResolved',
      day: 4,
      partyId: 'p1.1',
      commissionId: 'c1.1',
      vignetteId: 'the-find',
      beatIndex: 2,
      heroId: 'h1',
      stat: 'Craft',
      roll: 14,
      total: 18,
      dc: 11,
      result: 'critical',
      slots: { heroId: 'h1', patronId: 'pa1', sphereId: 'river' },
    };
    if (event.type !== 'BeatResolved') throw new Error('the union failed to narrow');
    expect(event.beatIndex).toBe(2);
    expect(event.slots.trait).toBeUndefined();
  });

  it('carries a Day on every event a real Career produces', () => {
    const opened = newCareer('events', fixtureContent);
    const commission = opened.career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const sent = commitParty(
      opened.career,
      commission.id,
      opened.career.guild.roster.map((hero) => hero.id),
      fixtureContent,
    );
    const run = advance(sent.career, 100, fixtureContent);

    const produced = [...opened.events, ...sent.events, ...run.events];
    expect(produced.length).toBeGreaterThan(20);
    for (const event of produced) {
      expect(Number.isInteger(event.day)).toBe(true);
      expect(event.day).toBeGreaterThan(0);
      expect(EVERY_EVENT[event.type]).toBe(true);
    }
  });

  it('never carries a Vignette’s narrative, only the id to look it up by', () => {
    const narratives = new Set(
      fixtureContent.vignettes.flatMap((vignette) =>
        Object.values(vignette.outcomes).map((outcome) => outcome.narrative),
      ),
    );
    const opened = newCareer('prose', fixtureContent);
    const commission = opened.career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const sent = commitParty(
      opened.career,
      commission.id,
      opened.career.guild.roster.map((hero) => hero.id),
      fixtureContent,
    );
    const run = advance(sent.career, commission.spanDays, fixtureContent);
    const seen = [...opened.events, ...sent.events, ...run.events];
    expect(seen.filter((event) => event.type === 'BeatResolved').length).toBeGreaterThan(0);
    for (const event of seen) {
      for (const value of JSON.stringify(event).split('"')) {
        expect(narratives.has(value)).toBe(false);
      }
    }
  });
});
