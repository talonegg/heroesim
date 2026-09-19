import { describe, expect, it } from 'vitest';
import { advance, advanceUntilAttention, commitParty } from '../src/career.js';
import { SaveError } from '../src/errors.js';
import { deserialiseCareer, serialiseCareer, SAVE_FORMAT_VERSION } from '../src/save.js';
import type { Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { autoPlay, fixtureContent } from './fixtures.js';

function roundTrip(career: Career): Career {
  return deserialiseCareer(serialiseCareer(career));
}

/** A Career taken down several different decision paths, for the round-trip corpus. */
function along(seed: string): Career[] {
  const stops: Career[] = [];
  let career = newCareer(seed, fixtureContent, { careerYears: 1, daysPerYear: 90 }).career;
  stops.push(career);
  for (let round = 0; round < 8 && career.ended === undefined; round += 1) {
    const free = career.guild.roster.map((hero) => hero.id);
    const commission = career.board[round % Math.max(1, career.board.length)];
    if (commission !== undefined && free.length > 0 && career.parties.length === 0) {
      career = commitParty(career, commission.id, free.slice(0, 2), fixtureContent).career;
      stops.push(career);
    }
    career = advanceUntilAttention(career, fixtureContent).career;
    stops.push(career);
  }
  stops.push(autoPlay(career, fixtureContent));
  return stops;
}

describe('saving and loading', () => {
  it('writes JSON a person could read', () => {
    const text = serialiseCareer(newCareer('readable', fixtureContent).career);
    expect(text.startsWith('{\n')).toBe(true);
    expect(JSON.parse(text)).toHaveProperty('formatVersion', SAVE_FORMAT_VERSION);
  });

  it('comes back deep-equal from every seed and every decision path', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      for (const career of along(`save-${seed}`)) {
        expect(roundTrip(career)).toEqual(career);
        expect(serialiseCareer(roundTrip(career))).toBe(serialiseCareer(career));
      }
    }
  });

  it('comes back deep-equal from a Career that has ended', () => {
    const ended = advance(
      newCareer('ended', fixtureContent, { careerYears: 1, daysPerYear: 10 }).career,
      30,
      fixtureContent,
    ).career;
    expect(ended.ended).toBeDefined();
    expect(roundTrip(ended)).toEqual(ended);
  });

  it('carries Injuries with their span, and Parties with their work', () => {
    const career = newCareer('carried', fixtureContent, { commissionSpanMin: 8, commissionSpanMax: 8 }).career;
    const commission = career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const sent = commitParty(career, commission.id, [career.guild.roster.slice(0, 3)[0]?.id ?? ''], fixtureContent)
      .career;
    const midway = advance(sent, 4, fixtureContent).career;
    expect(midway.parties).toHaveLength(1);
    expect(roundTrip(midway)).toEqual(midway);
    expect(roundTrip(midway).parties[0]?.commission).toEqual(midway.parties[0]?.commission);
  });

  it('resumes on exactly the same path it would have taken unsaved', () => {
    const midway = advance(newCareer('resume', fixtureContent).career, 37, fixtureContent).career;
    const straightOn = advance(midway, 200, fixtureContent);
    const afterLoad = advance(roundTrip(midway), 200, fixtureContent);
    expect(afterLoad.events).toEqual(straightOn.events);
    expect(afterLoad.career).toEqual(straightOn.career);
  });
});

describe('a save that cannot be trusted', () => {
  const good = newCareer('refusals', fixtureContent).career;

  it('is refused when it is not JSON at all', () => {
    expect(() => deserialiseCareer('not a save')).toThrow(SaveError);
    expect(() => deserialiseCareer('')).toThrow(SaveError);
    expect(() => deserialiseCareer('{ "formatVersion": 1,')).toThrow(/not valid JSON/);
  });

  it('is refused when it is JSON but not a Career', () => {
    expect(() => deserialiseCareer('[]')).toThrow(SaveError);
    expect(() => deserialiseCareer('null')).toThrow(SaveError);
    expect(() => deserialiseCareer('42')).toThrow(SaveError);
  });

  it('is refused when the format version is not the one this engine writes', () => {
    const wrong = JSON.parse(serialiseCareer(good)) as Record<string, unknown>;
    wrong['formatVersion'] = 2;
    expect(() => deserialiseCareer(JSON.stringify(wrong))).toThrow(SaveError);
    expect(() => deserialiseCareer(JSON.stringify(wrong))).toThrow(/format version 2/);

    delete wrong['formatVersion'];
    expect(() => deserialiseCareer(JSON.stringify(wrong))).toThrow(SaveError);
  });

  it('is refused when a field the world needs is missing, and says which', () => {
    const cases: [string, (save: Record<string, unknown>) => void][] = [
      ['seed', (save) => delete save['seed']],
      ['day', (save) => delete save['day']],
      ['rng', (save) => delete save['rng']],
      ['guild', (save) => delete save['guild']],
      ['patrons', (save) => delete save['patrons']],
      ['board', (save) => delete save['board']],
      ['parties', (save) => delete save['parties']],
      ['rivals', (save) => delete save['rivals']],
      ['ledger', (save) => delete save['ledger']],
      ['recentCommissions', (save) => delete save['recentCommissions']],
      ['config', (save) => delete save['config']],
    ];
    for (const [field, break_] of cases) {
      const save = JSON.parse(serialiseCareer(good)) as Record<string, unknown>;
      break_(save);
      expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(SaveError);
      expect(() => deserialiseCareer(JSON.stringify(save))).toThrow(new RegExp(field));
    }
  });

  it('is refused when a nested field is the wrong shape', () => {
    const missingStat = JSON.parse(serialiseCareer(good)) as Record<string, unknown>;
    const guild = missingStat['guild'] as { roster: { stats: Record<string, unknown> }[] };
    delete guild.roster[0]?.stats['Nerve'];
    expect(() => deserialiseCareer(JSON.stringify(missingStat))).toThrow(/roster\[0\].stats.Nerve/);

    const shortRng = JSON.parse(serialiseCareer(good)) as Record<string, unknown>;
    shortRng['rng'] = [1, 2, 3];
    expect(() => deserialiseCareer(JSON.stringify(shortRng))).toThrow(/four words/);

    const thinConfig = JSON.parse(serialiseCareer(good)) as Record<string, unknown>;
    delete (thinConfig['config'] as Record<string, unknown>)['upkeepPerHero'];
    expect(() => deserialiseCareer(JSON.stringify(thinConfig))).toThrow(/config.upkeepPerHero/);
  });
});
