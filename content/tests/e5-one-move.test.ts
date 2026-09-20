import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * E5's definition of done: **every Hero movement — Transfer, Poaching, retaliation, and
 * an offer taken — runs through one internal `moveHero`, so the two directions cannot
 * drift apart.**
 *
 * The behavioural half of that claim is `engine/tests/e5-gate.test.ts`, which plays all
 * four and finds the same six marks left by each. This is the static half, and it is the
 * sharper one: there is exactly **one** place in the whole engine where somebody is put on
 * the player's Roster, and it is `moveHero`. A second `guild.roster.push(` appearing
 * anywhere fails this on sight, which is what a guard against drift has to do.
 *
 * **Why it lives here.** ESLint forbids `node:*`, `fs` and `path` under `engine/**`, tests
 * included, so a scan of the engine's own source cannot sit beside the code it guards —
 * the same reason `e4-standing-callsites.test.ts` is here (DL-19 §11).
 */

const engineSrc = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'engine',
  'src',
);

function engineFiles(): string[] {
  return readdirSync(engineSrc)
    .filter((name) => name.endsWith('.ts'))
    .sort();
}

/** Every line of one engine file that does a thing, trimmed, with its file name. */
function sites(pattern: RegExp): string[] {
  const out: string[] = [];
  for (const file of engineFiles()) {
    const source = readFileSync(path.join(engineSrc, file), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) out.push(`${file}: ${line.trim()}`);
    }
  }
  return out;
}

describe('one place a Roster gains somebody', () => {
  it('puts a person on the player’s Roster in exactly one place in the engine', () => {
    // World generation deals the opening Roster, which is nobody moving anywhere; every
    // other arrival — an offer taken, a Transfer, a Poaching — is `moveHero`.
    expect(sites(/guild\.roster\.push\(/)).toEqual([
      'rival.ts: if (to.kind === \'guild\') draft.guild.roster.push(moved as Hero);',
      'world.ts: career.guild.roster.push(makeHero(seed, index, content, settings, rng, firstNames, epithets));',
    ]);
  });

  it('puts a person on a Rival’s Roster only where a Rival makes or takes one', () => {
    // Three: the move itself, the opening Roster a Rival is generated with, and churn.
    // Generation and churn make somebody from nothing rather than moving them, so they do
    // not go through `moveHero` — and neither of them can ever reach the player's Roster.
    const found = sites(/\broster\.push\(/).filter((line) => !line.includes('guild.roster.push'));
    expect(found).toEqual([
      'rival.ts: rival.roster.push(makeRivalHero(draft, rival, content, rng, taken, names));',
      'rival.ts: else requireRival(draft, to.rivalId).roster.push(moved as RivalHero);',
      'rival.ts: rival.roster.push(hero);',
    ]);
  });

  it('takes a person off a Roster only in `moveHero` and in the rules that end a career', () => {
    // Departure (E2), Death and Retirement (E3) each take somebody off the player's Roster
    // for good; `moveHero` is the only thing that takes somebody off one Roster and puts
    // them on another.
    expect(sites(/guild\.roster = draft\.guild\.roster\.filter/).map((line) => line.split(':')[0]))
      .toEqual(['age.ts', 'harm.ts', 'regard.ts', 'rival.ts']);
  });

  it('exports exactly one poaching predicate, and it takes a Regard and a config', () => {
    const rival = readFileSync(path.join(engineSrc, 'rival.ts'), 'utf8');
    expect(rival).toContain('export function isPoachable(regard: Regard, config: GameConfig)');
    // Nobody compares against `poachRegardThreshold` by hand anywhere else: the predicate
    // is the rule, and both directions ask it (E5-S4).
    const byHand = sites(/poachRegardThreshold/).filter(
      (line) =>
        !line.startsWith('config.ts:') &&
        !line.startsWith('save.ts:') &&
        !line.includes('isPoachable') &&
        // Prose about the rule is not the rule: a doc comment names it in two places.
        !line.includes(': *') &&
        !line.includes('//'),
    );
    expect(byHand).toEqual(['rival.ts: return regard.value <= config.poachRegardThreshold;']);
  });

  it('is not vacuous: the patterns do find what they are looking for', () => {
    expect(sites(/\broster\.push\(/).length).toBeGreaterThan(3);
    expect(sites(/isPoachable/).length).toBeGreaterThan(2);
  });
});
