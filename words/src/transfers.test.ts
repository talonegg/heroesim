import { describe, expect, test } from 'vitest';
import { transferLockedWords, transferRefusalWords } from './transfers.js';

// v1.1.7-S8 (DL-214): a Transfer's refusals in words, the CLI's and the page's, one place (DL-186
// item 1, DL-197); each front end names the Hero its own way and passes the name in.

const calendar = { turnsPerYear: 1080 };

describe('a Hero a Transfer cannot move yet (DL-69)', () => {
  test('the date they were transferred and the first they may be again, after the name a front end gives', () => {
    expect(transferLockedWords('Bran Tull (hero-000004)', 0, 90, calendar)).toBe(
      'Bran Tull (hero-000004) was transferred on Year 1 Day 1 and cannot be transferred again before Year 1 Day 31.',
    );
    expect(transferLockedWords('Bran Tull', 30, 1110, calendar)).toBe('Bran Tull was transferred on Year 1 Day 11 and cannot be transferred again before Year 2 Day 11.');
  });
});

describe('why a Guild will not deal now', () => {
  test.each([
    ['roster-size', 'its Roster of 3 is too small for its appetite for Transfers'],
    ['wealth', 'it is not rich enough to hire now'],
    ['unknown-disposition', 'its Disposition is not one this content knows'],
    ['answers-offers', 'it answers only Transfer Offers'],
  ] as const)('%s, after "will not part with …" or "will not take …"', (because, words) => {
    expect(transferRefusalWords(because, { rosterIds: ['hero-000001', 'hero-000002', 'hero-000003'] as never })).toBe(words);
  });

  test('a Guild the save has no row of has a Roster of 0', () => {
    expect(transferRefusalWords('roster-size', undefined)).toBe('its Roster of 0 is too small for its appetite for Transfers');
  });
});
