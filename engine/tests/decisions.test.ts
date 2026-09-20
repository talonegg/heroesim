/**
 * E6-S1 and the firing half of E6-S2: Decisions are content, they are selected the way
 * Vignettes are, and — the thing the whole epic turns on — deciding whether one fires
 * takes **nothing** from the Career's own generator.
 *
 * Everything here goes through the public surface (`../src/index.js`) and asserts on typed
 * events and state, never on prose.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  ContentError,
  serialiseCareer,
  validateContent,
  type Career,
  type Content,
  type GameEvent,
} from '../src/index.js';
import { fixtureContent } from './fixtures.js';
import {
  ASK_THE_GUIDE,
  decisionContent,
  edit,
  of,
  openRich,
  sendEverybody,
  THE_WATER_IS_UP,
  withDecisions,
} from './e6-fixtures.js';

/** The starter Decision as a raw table, with one field changed or removed. */
function raw(patch: Record<string, unknown>): unknown {
  return { ...ASK_THE_GUIDE, ...patch };
}

function admit(decision: unknown): Content {
  return validateContent({ ...fixtureContent, decisions: [decision] });
}

describe('Decisions are content', () => {
  it('gives Content a decisions list, which a set with none takes as empty', () => {
    expect(fixtureContent.decisions).toEqual([]);
    expect(decisionContent.decisions.map((decision) => decision.id)).toEqual([
      'ask-the-guide',
      'the-water-is-up',
    ]);
  });

  it('carries the conditions, slots and weight a Vignette carries, in the same shape', () => {
    const decision = decisionContent.decisions[0];
    expect(decision?.conditions).toEqual({ minBeat: 2 });
    expect(decision?.slots.hero).toBe('highest:Guile');
    expect(decision?.weight).toBe(3);
  });

  it('refuses a Decision with no turnBack option, naming the field', () => {
    expect(() =>
      admit(raw({ options: ASK_THE_GUIDE.options.filter((option) => option.kind !== 'turnBack') })),
    ).toThrow(/decisions\/ask-the-guide\.toml\.options: a Decision needs an option of kind turnBack/);
  });

  it('refuses a Decision with no default, naming the field', () => {
    expect(() =>
      admit(
        raw({
          options: ASK_THE_GUIDE.options.map((option) => {
            const copy: Record<string, unknown> = { ...option };
            delete copy['default'];
            return copy;
          }),
        }),
      ),
    ).toThrow(/decisions\/ask-the-guide\.toml\.options: .*exactly one option marked default/);
  });

  it('refuses a Decision with more than one default, naming both', () => {
    expect(() =>
      admit(
        raw({
          options: ASK_THE_GUIDE.options.map((option) =>
            option.kind === 'turnBack' ? { ...option, default: true } : option,
          ),
        }),
      ),
    ).toThrow(/"press-on", "turn-back" are/);
  });

  it('refuses a default the Guild might not be able to take', () => {
    // The default is what happens when nobody answers, so it has to be a thing the Guild
    // can always do; one that costs coin would leave a penniless Guild's Party waiting for
    // a question nobody could close (DL-23 §3).
    expect(() =>
      admit(
        raw({
          options: [
            { id: 'pay-up', kind: 'sendCoin', label: 'Pay.', cost: 40, default: true, consequences: [] },
            { id: 'turn-back', kind: 'turnBack', label: 'Home.', consequences: [] },
          ],
        }),
      ),
    ).toThrow(/the default option "pay-up" must be one the Guild can always take/);
  });

  it('refuses a sendCoin option with no cost, naming the field', () => {
    expect(() =>
      admit(
        raw({
          options: [
            { id: 'press-on', kind: 'pressOn', label: 'On.', default: true, consequences: [] },
            { id: 'send-coin', kind: 'sendCoin', label: 'Send.', consequences: [] },
            { id: 'turn-back', kind: 'turnBack', label: 'Home.', consequences: [] },
          ],
        }),
      ),
    ).toThrow(/options\[1\]\.cost: a sendCoin option needs a cost/);
  });

  it('refuses duplicate option ids, naming the id', () => {
    expect(() =>
      admit(
        raw({
          options: [
            { id: 'press-on', kind: 'pressOn', label: 'On.', default: true, consequences: [] },
            { id: 'press-on', kind: 'pressOn', label: 'On again.', consequences: [] },
            { id: 'turn-back', kind: 'turnBack', label: 'Home.', consequences: [] },
          ],
        }),
      ),
    ).toThrow(/option id "press-on" is defined more than once/);
  });

  it('refuses an unknown token in the prompt and in a label alike', () => {
    expect(() => admit(raw({ prompt: '{nobody} asks.' }))).toThrow(
      /decisions\/ask-the-guide\.toml\.prompt: "\{nobody\}" is not a narrative token/,
    );
    expect(() =>
      admit(
        raw({
          options: ASK_THE_GUIDE.options.map((option) =>
            option.id === 'turn-back' ? { ...option, label: 'Home, {nobody}.' } : option,
          ),
        }),
      ),
    ).toThrow(/options\[2\]\.label: "\{nobody\}" is not a narrative token/);
  });

  it('refuses {trait} in a prompt that cannot promise the Hero holds it', () => {
    expect(() => admit(raw({ prompt: '{hero} asks about {trait}.' }))).toThrow(
      /"\{trait\}" needs a with_trait:<Trait> Hero slot/,
    );
  });

  it('refuses an unknown Consequence kind, naming the field', () => {
    expect(() =>
      admit(
        raw({
          options: ASK_THE_GUIDE.options.map((option) =>
            option.id === 'turn-back'
              ? { ...option, consequences: [{ kind: 'reputation', delta: 1 }] }
              : option,
          ),
        }),
      ),
    ).toThrow(/options\[2\]\.consequences\[0\]\.kind: expected one of /);
  });

  it('takes every Consequence kind a Vignette takes, including E5’s rivalRegard and E6’s backing', () => {
    const admitted = admit(
      raw({
        options: ASK_THE_GUIDE.options.map((option) =>
          option.id === 'turn-back'
            ? {
                ...option,
                consequences: [
                  { kind: 'coin', delta: -5 },
                  { kind: 'patronRegard', delta: -1, reason: 'they came home' },
                  { kind: 'heroRegardForGuildmaster', delta: 1, reason: 'you called them home' },
                  { kind: 'trait', trait: 'Bruised', days: 3 },
                  { kind: 'score', delta: -1 },
                  { kind: 'rivalRegard', delta: -1, reason: 'word got about' },
                  { kind: 'backing', delta: -1 },
                ],
              }
            : option,
        ),
      }),
    );
    expect(
      admitted.decisions[0]?.options[2]?.consequences.map((consequence) => consequence.kind),
    ).toEqual([
      'coin',
      'patronRegard',
      'heroRegardForGuildmaster',
      'trait',
      'score',
      'rivalRegard',
      'backing',
    ]);
  });

  it('refuses an id that is not kebab-case, on the Decision and on an option', () => {
    expect(() => admit(raw({ id: 'Ask The Guide' }))).toThrow(ContentError);
    expect(() =>
      admit(
        raw({
          options: ASK_THE_GUIDE.options.map((option) =>
            option.id === 'send-coin' ? { ...option, id: 'send coin' } : option,
          ),
        }),
      ),
    ).toThrow(/an option id is lower case, digits and hyphens/);
  });

  it('refuses a Decision offering only one thing', () => {
    expect(() =>
      admit(raw({ options: [{ id: 'turn-back', kind: 'turnBack', label: 'Home.', default: true, consequences: [] }] })),
    ).toThrow(/a Decision that offers fewer than two things is not a decision/);
  });
});

// ── The whole of the RNG discipline (DL-23 §2) ──────────────────────────────

/** Play one Career forward the same way twice, and hand back what it did. */
function played(seed: string, content: Content, config?: Record<string, number>): {
  career: Career;
  events: GameEvent[];
} {
  const opened = openRich(seed, content, config);
  const sent = sendEverybody(opened, content);
  const run = advance(sent.career, 400, content);
  return { career: run.career, events: [...sent.events, ...run.events] };
}

describe('deciding whether a Party stops', () => {
  it('takes not one draw from the Career’s own generator', () => {
    // The proof that a Career in which no Decision fires is what it was before E6: the
    // same seed, once with the machinery present and switched off, once with no Decisions
    // in content at all. Same serialised Career, same events, to the byte (DL-23 §2).
    // The one field the two arms are set up to differ in is normalised away, so that what
    // is compared is the world and not the switch that was thrown to reach it.
    const world = (career: Career): string =>
      serialiseCareer(edit(career, (draft) => (draft.config.decisionChancePerBeat = 0)));
    for (const seed of ['d-stream-1', 'd-stream-2', 'd-stream-3', 'd-stream-4']) {
      const off = played(seed, decisionContent, { decisionChancePerBeat: 0 });
      const none = played(seed, fixtureContent);
      expect(world(off.career), seed).toBe(world(none.career));
      expect(off.events, seed).toEqual(none.events);
      // And the generator itself is where it would have been, word for word.
      expect(off.career.rng, seed).toEqual(none.career.rng);
    }
  });

  it('is unmoved by adding a Decision that cannot fire on this work', () => {
    // The chance is drawn before the candidates are filtered, so widening content changes
    // **which** Decision fires and never **whether** one does.
    for (const seed of ['d-widen-1', 'd-widen-2', 'd-widen-3']) {
      const narrow = played(seed, withDecisions(ASK_THE_GUIDE));
      const wide = played(seed, withDecisions(ASK_THE_GUIDE, THE_WATER_IS_UP));
      const asked = (events: readonly GameEvent[]): number[] =>
        of(events, 'PartyAwaitingWord').map((event) => event.day);
      expect(asked(wide.events), seed).toEqual(asked(narrow.events));
    }
  });

  it('is the same answer for the same Party and Beat however the Career got there', () => {
    // A derived stream keyed on the Party and the Beat, so the answer cannot depend on how
    // many draws the shared generator happened to have taken by then.
    const first = played('d-repeat', decisionContent);
    const second = played('d-repeat', decisionContent);
    expect(serialiseCareer(first.career)).toBe(serialiseCareer(second.career));
    expect(first.events).toEqual(second.events);
  });
});

describe('at most one Decision per Commission', () => {
  it('holds across two hundred seeds, by counting', () => {
    let commissions = 0;
    let words = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const opened = openRich(`d-cap-${String(seed)}`, decisionContent);
      const sent = sendEverybody(opened, decisionContent);
      const run = advance(sent.career, 400, decisionContent);
      const events = [...sent.events, ...run.events];
      const byParty = new Map<string, number>();
      for (const event of of(events, 'PartyAwaitingWord')) {
        byParty.set(event.partyId, (byParty.get(event.partyId) ?? 0) + 1);
      }
      for (const [partyId, count] of byParty) {
        expect(count, `seed ${String(seed)}, Party ${partyId}`).toBe(1);
      }
      commissions += of(events, 'PartyCommitted').length;
      words += byParty.size;
    }
    expect(commissions).toBeGreaterThan(150);
    expect(words).toBeGreaterThan(0);
  }, 120_000);

  it('never considers one before the Commission’s first Beat', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const opened = openRich(`d-first-${String(seed)}`, decisionContent);
      const sent = sendEverybody(opened, decisionContent);
      const run = advance(sent.career, 400, decisionContent);
      for (const event of of(run.events, 'PartyAwaitingWord')) {
        expect(event.beatIndex, `seed ${String(seed)}`).toBeGreaterThanOrEqual(2);
      }
    }
  }, 60_000);
});

describe('the two brakes are config fields, and both work', () => {
  it('stops nothing at decisionChancePerBeat 0', () => {
    const opened = openRich('d-off-chance', decisionContent, { decisionChancePerBeat: 0 });
    const run = advance(sendEverybody(opened, decisionContent).career, 400, decisionContent);
    expect(of(run.events, 'PartyAwaitingWord')).toEqual([]);
  });

  it('stops nothing at decisionsPerCommission 0, which the default cannot reproduce', () => {
    // The cap is held against the strongest thing that could get past it: a chance of one,
    // so every Beat Day after the first would stop the Commission if anything could. The
    // counter-case varies the cap and **nothing else**, which is what makes this a test of
    // the cap rather than of whichever balance number `decisionChancePerBeat` happens to
    // hold — it used to lean on the shipped default stopping this one seed, and stopped
    // being true the moment the balance pass lowered it (DL-24 §B2).
    const always = { decisionChancePerBeat: 1 };
    const opened = openRich('d-off-cap', decisionContent, { ...always, decisionsPerCommission: 0 });
    const run = advance(sendEverybody(opened, decisionContent).career, 400, decisionContent);
    expect(of(run.events, 'PartyAwaitingWord')).toEqual([]);
    const on = openRich('d-off-cap', decisionContent, { ...always, decisionsPerCommission: 1 });
    const alive = advance(sendEverybody(on, decisionContent).career, 400, decisionContent);
    expect(of(alive.events, 'PartyAwaitingWord').length).toBeGreaterThan(0);
  });

  it('stops something at every Beat when the chance is one', () => {
    const opened = openRich('d-always', decisionContent, { decisionChancePerBeat: 1 });
    const run = advance(sendEverybody(opened, decisionContent).career, 20, decisionContent);
    const asked = of(run.events, 'PartyAwaitingWord');
    expect(asked.length).toBe(1);
    expect(asked[0]?.beatIndex).toBe(2);
  });
});

describe('selection mirrors Vignette selection', () => {
  it('leaves a Commission whose tags nothing matches alone, rather than throwing', () => {
    // A Beat must be filled and so falls back on the relaxed pass; a Decision need not be,
    // so a Commission with no eligible Decision simply never stops (E6-S2).
    const onlyWater = withDecisions(THE_WATER_IS_UP);
    let stoppedOnDryWork = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const opened = openRich(`d-tags-${String(seed)}`, onlyWater, { decisionChancePerBeat: 1 });
      const sent = sendEverybody(opened, onlyWater);
      const party = sent.career.parties[0];
      const run = advance(sent.career, 40, onlyWater);
      const asked = of(run.events, 'PartyAwaitingWord');
      if (party?.commission.tags.includes('water') === true) {
        expect(asked.length, `seed ${String(seed)}`).toBe(1);
      } else {
        expect(asked.length, `seed ${String(seed)}`).toBe(0);
        stoppedOnDryWork += asked.length;
      }
    }
    expect(stoppedOnDryWork).toBe(0);
  }, 60_000);

  it('fills the Hero slot by the rule the Decision names', () => {
    const opened = openRich('d-slot', decisionContent, { decisionChancePerBeat: 1 });
    const sent = sendEverybody(opened, decisionContent);
    const run = advance(sent.career, 40, decisionContent);
    const asked = of(run.events, 'PartyAwaitingWord')[0];
    if (asked === undefined) throw new Error('the test expected a Party to send word');
    const party = sent.career.parties[0];
    const members = (party?.heroIds ?? []).map(
      (id) => sent.career.guild.roster.find((hero) => hero.id === id),
    );
    const best = Math.max(...members.map((hero) => hero?.stats.Guile ?? 0));
    const chosen = members.find((hero) => hero?.id === asked.slots.heroId);
    expect(asked.decisionId).toBe('ask-the-guide');
    expect(chosen?.stats.Guile).toBe(best);
  });
});
