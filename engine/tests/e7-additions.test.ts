/**
 * The two things E7 adds to the engine, and nothing else (DL-25 §1, §2).
 *
 * `config.startingDebt` is the design's "you start with a going concern … and a debt",
 * built as an opening deduction and nothing more: no state, no event, no draw. It is
 * pinned here at a value its default cannot reproduce, and its **inertness at the
 * default** is pinned beside it, because that is the promise E7 §0 makes.
 *
 * `postingPatrons` is a re-export of a function the Board has asked since E1, so that the
 * Patrons view can say a Patron is posting nothing without deciding for itself where the
 * floor is.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  defaultConfig,
  deserialiseCareer,
  newCareer,
  postingPatrons,
  serialiseCareer,
} from '../src/index.js';
import { fixtureContent as content } from './fixtures.js';

describe('config.startingDebt', () => {
  it('defaults to nothing, so the mechanism is present and off', () => {
    expect(defaultConfig.startingDebt).toBe(0);
  });

  it('opens the Guild short by the debt it inherited', () => {
    const { career } = newCareer('debt', content, { startingDebt: 137 });
    expect(career.guild.coin).toBe(career.config.startingCoin - 137);
    // The peak is a balance the Guild actually held, never one it never saw.
    expect(career.ledger.peakCoin).toBe(career.guild.coin);
  });

  it('is a value the default cannot reproduce', () => {
    const owing = newCareer('debt', content, { startingDebt: 137 }).career;
    const clear = newCareer('debt', content).career;
    expect(owing.guild.coin).not.toBe(clear.guild.coin);
    expect(clear.guild.coin).toBe(clear.config.startingCoin);
  });

  it('can be set deeper than the float, and says so rather than pretending', () => {
    const { career } = newCareer('debt', content, { startingCoin: 100, startingDebt: 400 });
    expect(career.guild.coin).toBe(-300);
  });

  it('is inert at its default: the same seed gives the same Career, byte for byte', () => {
    const named = newCareer('debt-inert', content, { startingDebt: 0 });
    const silent = newCareer('debt-inert', content);
    expect(serialiseCareer(named.career)).toBe(serialiseCareer(silent.career));
    expect(named.events).toEqual(silent.events);

    // And it stays inert once the Days run: no draw is taken for it, so the generator
    // state and every seeded outcome are what they were before the field existed.
    const playedNamed = advance(named.career, 400, content);
    const playedSilent = advance(silent.career, 400, content);
    expect(serialiseCareer(playedNamed.career)).toBe(serialiseCareer(playedSilent.career));
    expect(playedNamed.events).toEqual(playedSilent.events);
  });

  /**
   * "An opening deduction and nothing else" (DL-25 §1) is a claim about a **set** debt, and
   * the inertness test above cannot make it: at the default the two arms are the same
   * config, so it compares a Career with itself. This is the claim: a Guild that owes 137
   * plays exactly as a Guild that was simply given 137 less, for four hundred Days. If the
   * debt were ever read again — an instalment, an interest charge, a Regard penalty — the
   * two would part company.
   */
  it('is an opening deduction and nothing else: a debt of 137 plays as 137 less float', () => {
    const owing = newCareer('debt-deduction', content, { startingDebt: 137 });
    const poorer = newCareer('debt-deduction', content, {
      startingCoin: defaultConfig.startingCoin - 137,
    });
    const playedOwing = advance(owing.career, 400, content);
    const playedPoorer = advance(poorer.career, 400, content);
    // Everything but the config itself, which is the one thing that differs by design.
    const world = (career: unknown): string => {
      const document = JSON.parse(serialiseCareer(career as never)) as Record<string, unknown>;
      delete document['config'];
      return JSON.stringify(document);
    };
    expect(world(playedOwing.career)).toBe(world(playedPoorer.career));
    expect(playedOwing.events).toEqual(playedPoorer.events);
  });

  it('opens a Guild below nothing without ending it before the player has acted', () => {
    // A debt deeper than the float is allowed and says so (the case above). What it must
    // not do is close the Guild on the Day it opens, before a single keypress.
    const { career } = newCareer('debt-underwater', content, {
      startingCoin: 100,
      startingDebt: 400,
    });
    expect(career.guild.coin).toBe(-300);
    expect(career.ended).toBeUndefined();
    // It is the Upkeep that closes it, on the Day the Upkeep falls due, and the reckoning
    // says so — which is sane, and said.
    const later = advance(career, 40, content);
    expect(later.career.ended?.reason).toBe('insolvency');
    expect(later.career.day).toBeGreaterThan(1);
  });

  it('emits no event of its own, even when it is set', () => {
    const { events } = newCareer('debt-quiet', content, { startingDebt: 200 });
    // Exactly the opening events a Career with no debt has: the debt is a balance, not a
    // transaction, so nothing is reported as one.
    expect(events.map((event) => event.type)).toEqual(
      newCareer('debt-quiet', content).events.map((event) => event.type),
    );
  });

  it('takes its default in a save written before it was named', () => {
    const { career } = newCareer('debt-save', content, { startingDebt: 90 });
    const raw = JSON.parse(serialiseCareer(career)) as {
      config: Record<string, unknown>;
    };
    delete raw.config['startingDebt'];
    const loaded = deserialiseCareer(JSON.stringify(raw), content);
    expect(loaded.config.startingDebt).toBe(0);
    // And the coin the Career already holds is untouched by the fill: the debt was taken
    // out of the opening float on the Day the Career began, and is not owed again.
    expect(loaded.guild.coin).toBe(career.guild.coin);
  });

  it('round-trips when it is set', () => {
    const { career } = newCareer('debt-round', content, { startingDebt: 90 });
    expect(deserialiseCareer(serialiseCareer(career), content).config.startingDebt).toBe(90);
  });
});

describe('postingPatrons', () => {
  it('is every Patron whose Regard is above the posting floor', () => {
    const { career } = newCareer('posting', content);
    expect(postingPatrons(career).map((patron) => patron.id)).toEqual(
      career.patrons
        .filter((patron) => patron.regardForGuild.value > career.config.patronPostsAboveRegard)
        .map((patron) => patron.id),
    );
  });

  it('leaves out a Patron at the floor, which is the fact the view needs', () => {
    const { career } = newCareer('posting-floor', content);
    const silent = career.patrons[0];
    if (silent === undefined) throw new Error('no Patrons');
    const soured = {
      ...career,
      patrons: career.patrons.map((patron) =>
        patron.id === silent.id
          ? { ...patron, regardForGuild: { ...patron.regardForGuild, value: -5 } }
          : patron,
      ),
    };
    expect(postingPatrons(soured).map((patron) => patron.id)).not.toContain(silent.id);
    expect(postingPatrons(soured)).toHaveLength(career.patrons.length - 1);
  });

  it('reads and never writes', () => {
    const { career } = newCareer('posting-pure', content);
    const before = serialiseCareer(career);
    postingPatrons(career);
    expect(serialiseCareer(career)).toBe(before);
  });
});
