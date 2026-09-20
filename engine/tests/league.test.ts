/**
 * E5-S6: the League.
 *
 * A pure view of something already modelled — every Guild ordered by Standing, and
 * nothing else. It is never a currency of its own: nothing writes a League position, and
 * the last block here proves there is no field anywhere in the world for one to be
 * written to (CONTEXT · League).
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  availableHeroes,
  league,
  newCareer,
  proposeParty,
  serialiseCareer,
  standing,
  type Career,
  type GameConfig,
} from '../src/index.js';
import { deepFreeze, fixtureContent, patronsThinking } from './fixtures.js';

const content = fixtureContent;

/** A Career whose Rivals sit at named Standings, so the ordering can be read off. */
function standingsOf(career: Career, values: readonly number[]): Career {
  return {
    ...career,
    rivals: career.rivals.map((rival, index) => ({ ...rival, standing: values[index] ?? 0 })),
  };
}

describe('the League as a view', () => {
  const career = newCareer('e5-league', content).career;

  it('is a snapshot of every Guild in the world, the player’s among them', () => {
    expect(league(career)).toMatchInlineSnapshot(`
      [
        {
          "guildId": "r1",
          "isPlayer": false,
          "name": "The Iron Weir Guild",
          "rosterSize": 6,
          "standing": 5,
        },
        {
          "guildId": "r3",
          "isPlayer": false,
          "name": "The Northgate Guild",
          "rosterSize": 5,
          "standing": 3,
        },
        {
          "guildId": "player",
          "isPlayer": true,
          "name": "The Lowford Guild",
          "rosterSize": 4,
          "standing": 2,
        },
        {
          "guildId": "r2",
          "isPlayer": false,
          "name": "The Tallow Guild",
          "rosterSize": 8,
          "standing": 2,
        },
        {
          "guildId": "r4",
          "isPlayer": false,
          "name": "The Sixpenny Guild",
          "rosterSize": 7,
          "standing": 0,
        },
      ]
    `);
  });

  it('takes no generator, emits no event and writes nothing', () => {
    const frozen = deepFreeze(newCareer('e5-league-pure', content).career);
    const before = serialiseCareer(career);
    expect(() => league(frozen)).not.toThrow();
    expect(serialiseCareer(career)).toBe(before);

    /**
     * Finding F8, closed (DL-22). This used to assert `league(career)` equals
     * `league(career)`, which is true of every function there has ever been. What it meant
     * to say is that the League is a view of Standing and of nothing else: reading it
     * again after a call that must not touch Standing gives the same rows, and reading it
     * after a Patron's Regard moves gives different ones — because Standing is the mean of
     * exactly that (CONTEXT · Standing).
     */
    const rows = league(career);
    const free = availableHeroes(career);
    expect(free.length).toBeGreaterThan(0);
    // A call that reads the whole world and must not touch Standing leaves the rows alone.
    expect(
      proposeParty(career, career.board[0]?.id ?? '', [free[0]?.id ?? ''], content).backing,
    ).toBeTypeOf('number');
    expect(league(career)).toEqual(rows);

    const admired = patronsThinking(career, 5);
    expect(league(admired)).not.toEqual(rows);
    expect(league(admired).find((row) => row.isPlayer)?.standing).toBe(standing(admired));
    expect(league(admired).find((row) => row.isPlayer)?.standing).not.toBe(
      rows.find((row) => row.isPlayer)?.standing,
    );
  });

  it('reads the player’s Standing as derived and a Rival’s as stored', () => {
    const rich = patronsThinking(career, 4);
    const rows = league(rich);
    const mine = rows.find((row) => row.isPlayer);
    expect(mine?.standing).toBe(standing(rich));
    expect(mine?.standing).toBe(40);
    for (const rival of rich.rivals) {
      expect(rows.find((row) => row.guildId === rival.id)?.standing, rival.id).toBe(rival.standing);
    }
  });

  it('orders by Standing descending, and ties by name', () => {
    const tied = standingsOf(patronsThinking(career, 0), [5, 5, 5, 5]);
    const rows = league(tied);
    expect(rows.map((row) => row.standing)).toEqual([5, 5, 5, 5, 0]);
    const names = rows.slice(0, 4).map((row) => row.name);
    expect(names).toEqual([...names].sort((one, other) => one.localeCompare(other)));
  });

  it('marks your row and does not special-case it in the ordering', () => {
    // At the bottom of the League, the player's Guild is at the bottom of the League.
    const bottom = standingsOf(patronsThinking(career, -5), [10, 20, 30, 40]);
    const rows = league(bottom);
    expect(rows.map((row) => row.guildId)).toEqual(['r4', 'r3', 'r2', 'r1', 'player']);
    expect(rows.filter((row) => row.isPlayer)).toHaveLength(1);
    expect(rows[rows.length - 1]?.isPlayer).toBe(true);

    // And at the top of it, at the top.
    const top = standingsOf(patronsThinking(career, 5), [10, 20, 30, 40]);
    expect(league(top)[0]?.isPlayer).toBe(true);
  });

  it('carries the size of each Roster, so the row says more than a bare number', () => {
    const played = advance(career, 200, content).career;
    const rows = league(played);
    expect(rows.find((row) => row.isPlayer)?.rosterSize).toBe(played.guild.roster.length);
    for (const rival of played.rivals) {
      expect(rows.find((row) => row.guildId === rival.id)?.rosterSize, rival.id).toBe(
        rival.roster.length,
      );
    }
  });

  it('holds one row per Guild, and no more', () => {
    const rows = league(career);
    expect(rows).toHaveLength(career.rivals.length + 1);
    expect(new Set(rows.map((row) => row.guildId)).size).toBe(rows.length);
  });
});

describe('nothing in the engine writes a League position', () => {
  it('has no field named position or rank on any state type, over 400 played Days', () => {
    // The guard E5 §5 names for "the League becomes a score": there is no field anywhere
    // in a played Career for a position to be written to. The other half of it — that no
    // state type in `engine/src` *declares* one — is a static scan of the source, and so
    // lives in `content/tests/e5-league-position.test.ts`, because ESLint forbids `fs`
    // under `engine/` including its tests (DL-19 §11).
    //
    // Solvent for the whole 400 Days, and asserted to be. Without the coin this Career
    // went insolvent on Day 70 and the scan walked a world three hundred and thirty Days
    // younger than the one the claim describes (F7, DL-22); Retirement is brought within
    // reach of the people in it for the same reason.
    const played400: Partial<GameConfig> = { startingCoin: 5_000_000, heroRetirementAge: 38 };
    const run = advance(newCareer('e5-no-rank', content, played400).career, 400, content);
    const played = run.career;
    expect(played.ended).toBeUndefined();
    expect(played.day).toBeGreaterThan(400);
    expect(run.events.filter((event) => event.type === 'BoardRefreshed')).toHaveLength(40);
    expect(run.events.some((event) => event.type === 'RivalRosterChanged')).toBe(true);
    expect(run.events.some((event) => event.type === 'HeroRetired')).toBe(true);
    const written = serialiseCareer(played);
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      for (const [key, item] of Object.entries(value)) {
        keys.add(key);
        walk(item);
      }
    };
    walk(JSON.parse(written));
    expect(keys.size).toBeGreaterThan(30);
    for (const forbidden of ['position', 'rank', 'ranking', 'place', 'points']) {
      expect([...keys], forbidden).not.toContain(forbidden);
    }
    // Not vacuous: the scan does reach a Rival, and a Rival's own stored Standing — the
    // one number the League is ordered on — is there to be found.
    expect(keys.has('standing')).toBe(true);
    expect(keys.has('regardForRival')).toBe(true);
  });
});
