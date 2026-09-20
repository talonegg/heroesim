/**
 * The reachable-state sweep (E7-S1, E7-S5): every view, including the main screen,
 * rendered over seeded **played** Careers at 40, 60, 80 and 120 columns, with every line
 * measured and nothing allowed to be cut short.
 *
 * Two things make this more than a smoke test. The content is the authored content with
 * **adversarially long** Guild, Hero, Patron, Sphere and Commission names injected
 * through it, so the widths are tested against the worst case rather than the one the
 * generator happens to produce. And the sweep **asserts it actually saw** each of the
 * states the acceptance box names — an awaiting Party, an injured Hero, a Hero another
 * Guild could take, a wronged Rival, Applicants none of whom can be taken on, a Patron at
 * the posting floor, an ended Career — so it cannot pass vacuously. A "200 Careers × 400
 * Days" fleet in E5 turned out to be insolvent by Day 70 and exercised nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  advanceUntilAttention,
  answerParty,
  applicantOffers,
  availableHeroes,
  awaitingParties,
  commitParty,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  injuredHeroes,
  newCareer,
  poachHero,
  postingPatrons,
  retaliationRisks,
  rivalOffers,
  wordOffers,
  type Career,
  type Content,
  type GameConfig,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import { mainScreen } from '../src/layout.js';
import { applicantLines } from '../src/views/applicants.js';
import { formerLines } from '../src/views/former.js';
import { hallLines } from '../src/views/hall.js';
import { leagueLines } from '../src/views/league.js';
import { patronLines } from '../src/views/patrons.js';
import { rosterLines } from '../src/views/roster.js';
import { rivalLines } from '../src/views/rivals.js';
import { wordLines, wordSummaryLines } from '../src/word.js';
import { paginate, toAscii } from '../src/screen.js';
import { expectFits, WIDTHS } from './helpers.js';

const authored: Content = loadContentFromDisk();

/** A long phrase to hang on the front of every name the world generates. */
const LONG = 'Bartholomew Grimsditch-Wetherby of the Nine Fords and the Far Weir';

/**
 * The authored content with every free-form name made as long as anything could plausibly
 * be. Trait and Background **names** are left alone because other content refers to them
 * by name; everything a view prints of the world's own making is stretched.
 */
const stretched: Content = {
  ...authored,
  names: {
    heroFirst: authored.names.heroFirst.map((name) => `${name} ${LONG}`),
    heroEpithets: authored.names.heroEpithets.map((name) => `${name} of the Long Water Crossing`),
    guildNames: authored.names.guildNames.map((name) => `${name} ${LONG} and Company`),
    rivalNames: authored.names.rivalNames.map((name) => `${name} ${LONG} and Company`),
  },
  spheres: authored.spheres.map((sphere) => ({
    ...sphere,
    name: `${sphere.name}, which is to say ${LONG}`,
    patronNames: sphere.patronNames.map((name) => `${name}, ${LONG}, Patron`),
    commissionTitles: sphere.commissionTitles.map((entry) => ({
      ...entry,
      title: `${entry.title}, and the matter of ${LONG}, urgently`,
    })),
  })),
};

/** Every state the acceptance box names, counted so that nothing passes vacuously. */
interface Seen {
  awaitingParty: number;
  injuredHero: number;
  takeableHero: number;
  wrongedRival: number;
  applicantsNoneTakeable: number;
  patronAtTheFloor: number;
  endedCareer: number;
  formerHero: number;
  hallBought: number;
}

function note(seen: Seen, career: Career, content: Content): void {
  if (awaitingParties(career).length > 0) seen.awaitingParty += 1;
  if (injuredHeroes(career).length > 0) seen.injuredHero += 1;
  if (retaliationRisks(career).length > 0) seen.takeableHero += 1;
  if (career.rivals.some((rival) => rival.regardForGuild.value <= career.config.souredRivalThreshold)) {
    seen.wrongedRival += 1;
  }
  const offers = applicantOffers(career);
  if (offers.length > 0 && offers.every((offer) => offer.refusal !== undefined)) {
    seen.applicantsNoneTakeable += 1;
  }
  if (postingPatrons(career).length < career.patrons.length) seen.patronAtTheFloor += 1;
  if (career.ended !== undefined) seen.endedCareer += 1;
  if (career.guild.formerHeroes.length > 0) seen.formerHero += 1;
  if (career.guild.hall.length > 0) seen.hallBought += 1;
  void content;
}

/** Every view over one Career, so the sweep can drive them all at every width. */
function everyView(career: Career, width: number, content: Content): string[][] {
  return [
    mainScreen(career, width, content, ['Year 1, Day 1 · something happened worth noting']),
    rosterLines(career, width, content),
    patronLines(career, width, content),
    leagueLines(career, width),
    hallLines(career, width),
    formerLines(career, width),
    applicantLines(career, width, content),
    rivalLines(career, width, content),
    wordLines(career, width, content),
    // The form the main screen falls back to when it has not the rows for the prompts
    // whole (DL-26 §2): it is a block a player reads, so it is measured like any other.
    wordSummaryLines(career, width, content),
  ];
}

const NAMES = [
  'main screen',
  'roster',
  'patrons',
  'league',
  'hall',
  'former',
  'applicants',
  'rivals',
  'word',
  'word summary',
];

/**
 * Every identifier the content and the engine actually use, so that a line can be checked
 * against the real id sets rather than against a guess at what one looks like. A Hero's
 * name, a Commission's title and a slot's name are the player's own words and are not
 * here; a Decision's `send-coin`, a Sphere's `river-towns` and a Vignette's id are.
 *
 * This exists because the paid-Decision confirmation printed "Sending word costs 60 coin:
 * send-coin" one line under the authored label for the same option, and nothing caught it
 * (DL-26 §3). No sentence names an identifier, a type or a function (E7-S5).
 */
function identifiers(content: Content): string[] {
  const out = new Set<string>();
  const add = (id: string | undefined): void => {
    // Only ids that are unmistakably identifiers: kebab-case or camelCase, and long
    // enough that a real word could never be mistaken for one.
    if (id === undefined || id.length < 5) return;
    if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(id) || /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(id)) out.add(id);
  };
  for (const decision of content.decisions) {
    add(decision.id);
    for (const option of decision.options) add(option.id);
  }
  for (const vignette of content.vignettes) add(vignette.id);
  // A Trait's name, a Background's name and a Commission's title are **not** here: they
  // are authored words the player is meant to read, not identifiers.
  for (const sphere of content.spheres) add(sphere.id);
  return [...out];
}

/** One expression over every identifier, so a line is checked in one pass rather than N. */
const NAMES_NOTHING_MAY_PRINT = new RegExp(
  identifiers(authored)
    .concat(identifiers(stretched))
    .map((id) => id.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'))
    .join('|'),
);

/** Render one state at every width and measure every line, paged and in ASCII too. */
function measure(career: Career, content: Content): void {
  for (const width of WIDTHS) {
    everyView(career, width, content).forEach((lines, at) => {
      const where = `${NAMES[at] ?? 'view'} (${career.seed} day ${career.day})`;
      expectFits(lines, width, where);
      // What a player actually sees: one page of it, and the ASCII fallback applied at
      // the output boundary, neither of which may push a line over the width either.
      const page = paginate(lines);
      expectFits(page.lines, width, `${where} paged`);
      expectFits(page.lines.map(toAscii), width, `${where} in ASCII`);
      // And no line of it names an identifier the engine or the content owns (E7-S5).
      for (const line of lines) {
        const named = NAMES_NOTHING_MAY_PRINT.exec(line);
        if (named !== null) {
          expect(named[0], `${where} at ${width}: names an identifier: "${line}"`).toBe('');
        }
      }
    });
  }
}

/**
 * A player who recruits, buys the Hall, deals with the other Guilds and answers some
 * words while letting others time out — and a reckless one who sends a single Hero at the
 * hardest work on the Board, never recruits and poaches whoever will come. Between them
 * they reach every state the acceptance box names.
 */
type Arm = 'careful' | 'reckless';

function playAndSample(
  seed: string,
  arm: Arm,
  content: Content,
  config: Partial<GameConfig>,
  samples: number,
  toTheEnd: boolean,
  each: (career: Career) => void,
): void {
  let career = newCareer(seed, content, config).career;
  let taken = 0;
  let answered = 0;
  for (let step = 0; step < 200; step += 1) {
    if (career.ended !== undefined) break;
    if (!toTheEnd && taken >= samples) break;

    // Answer some words and leave others to time out, so both states are reached.
    for (const offer of wordOffers(career, content)) {
      answered += 1;
      if (answered % 3 === 0) continue;
      const option =
        offer.options.find((entry) => entry.affordable && entry.kind === 'pressOn') ??
        offer.options.find((entry) => entry.affordable);
      if (option !== undefined) {
        try {
          career = answerParty(career, offer.partyId, option.id, content).career;
        } catch {
          /* the world moved under the policy; the next step reads it again */
        }
      }
    }

    // Take work.
    const free = availableHeroes(career);
    const board = arm === 'careful' ? career.board : [...career.board].sort((a, b) => b.difficulty - a.difficulty);
    for (const [at, commission] of board.entries()) {
      const party =
        arm === 'careful'
          ? free.slice(at * 2, at * 2 + 2).map((hero) => hero.id)
          : free.slice(at, at + 1).map((hero) => hero.id);
      if (party.length === 0) break;
      try {
        career = commitParty(career, commission.id, party, content, { insist: true }).career;
      } catch {
        /* away, injured, refused or gone: the policy simply tries the next one */
      }
    }

    if (arm === 'careful') {
      // Recruit to the cap, which is what makes "nobody at the door can be taken on" a
      // state a player actually meets.
      for (const offer of applicantOffers(career)) {
        if (offer.refusal !== undefined) continue;
        try {
          career = acceptApplicant(career, offer.applicant.id).career;
        } catch {
          /* the coin moved */
        }
      }
      for (const improvement of HALL_IMPROVEMENTS) {
        if (career.guild.hall.includes(improvement)) continue;
        if (career.guild.coin < hallCost(improvement, career.config) + 200) continue;
        try {
          career = improveHall(career, improvement).career;
        } catch {
          /* somebody else's problem */
        }
      }
    } else {
      // Poaching is what wrongs another Guild, which is a state of its own.
      for (const rival of career.rivals) {
        const takeable = rivalOffers(career, rival.id).find(
          (offer) => offer.poachRefusal === undefined,
        );
        if (takeable === undefined) continue;
        try {
          career = poachHero(career, rival.id, takeable.hero.id).career;
        } catch {
          /* no room, no coin, or they changed their mind */
        }
        break;
      }
    }

    if (taken < samples) {
      each(career);
      taken += 1;
    }
    career = advanceUntilAttention(career, content).career;
  }
  // The state a Career ends in is one of the states a view has to render.
  each(career);
}

describe('every view over a fleet of played Careers', () => {
  it(
    'renders at 40, 60, 80 and 120 columns with nothing over the width and nothing cut short',
    () => {
      const seen: Seen = {
        awaitingParty: 0,
        injuredHero: 0,
        takeableHero: 0,
        wrongedRival: 0,
        applicantsNoneTakeable: 0,
        patronAtTheFloor: 0,
        endedCareer: 0,
        formerHero: 0,
        hallBought: 0,
      };
      let states = 0;

      for (let index = 0; index < 200; index += 1) {
        const arm: Arm = index % 2 === 0 ? 'careful' : 'reckless';
        // Every fourth Career runs on a short calendar, so the fleet reaches Retirement
        // as well as insolvency; and a lower starting float on the reckless arm reaches
        // an ending sooner.
        const config: Partial<GameConfig> =
          index % 4 === 3
            ? { careerYears: 1, startingCoin: 900 }
            : index % 4 === 1
              ? // A Guild already at its cap, which is the state in which everybody at
                // the door is refused — the thing the Applicant cue exists to say.
                { startingCoin: 300, rosterCap: 4 }
              : arm === 'reckless'
                ? { startingCoin: 300 }
                : { startingCoin: 1200 };
        playAndSample(`sweep-${index}`, arm, stretched, config, 2, index % 4 === 3, (career) => {
          states += 1;
          note(seen, career, stretched);
          measure(career, stretched);
        });
      }

      expect(states).toBeGreaterThan(300);
      // Nothing here is allowed to be zero: a sweep that saw none of the interesting
      // states has measured a screen nobody will ever look at.
      for (const [state, count] of Object.entries(seen)) {
        expect(count, `the sweep never saw: ${state}`).toBeGreaterThan(0);
      }
      // What it actually covered, measured 2026-09-20 over 600 states from 200 Careers:
      // an awaiting Party 30, an injured Hero 194, a Hero another Guild could take 52, a
      // wronged Rival 150, a door nobody can be taken from 60, a Patron at the posting
      // floor 13, an ended Career 50, a former Hero 6, a Hall bought 300. The floors
      // below are well under those, so ordinary drift does not fail the suite, but a
      // state going out of reach altogether does.
      expect(seen.awaitingParty).toBeGreaterThanOrEqual(5);
      expect(seen.injuredHero).toBeGreaterThanOrEqual(20);
      expect(seen.takeableHero).toBeGreaterThanOrEqual(5);
      expect(seen.wrongedRival).toBeGreaterThanOrEqual(20);
      expect(seen.applicantsNoneTakeable).toBeGreaterThanOrEqual(5);
      expect(seen.patronAtTheFloor).toBeGreaterThanOrEqual(2);
      expect(seen.endedCareer).toBeGreaterThanOrEqual(10);
    },
    120_000,
  );
});

describe('the identifiers nothing the player reads may name', () => {
  it('is a real set, and would catch the one that got through', () => {
    // Without this the identifier assertion above could pass by having nothing to find.
    const ids = identifiers(authored);
    expect(ids.length).toBeGreaterThan(5);
    expect(ids).toContain('send-coin');
    expect(NAMES_NOTHING_MAY_PRINT.test('Sending word costs 60 coin: send-coin')).toBe(true);
    // And the authored words for that very option are not mistaken for it.
    expect(
      NAMES_NOTHING_MAY_PRINT.test(
        'Send sixty coin ahead for fresh beasts, a night under a roof and somebody to carry.',
      ),
    ).toBe(false);
  });
});

describe('the states the sweep is about', () => {
  it('are the ones E7-S1 and E7-S5 name', () => {
    // Kept as a list rather than a comment so that dropping one is a failing test.
    expect(Object.keys({
      awaitingParty: 0,
      injuredHero: 0,
      takeableHero: 0,
      wrongedRival: 0,
      applicantsNoneTakeable: 0,
      patronAtTheFloor: 0,
      endedCareer: 0,
      formerHero: 0,
      hallBought: 0,
    } satisfies Seen)).toHaveLength(9);
  });
});
