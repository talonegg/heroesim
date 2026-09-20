/**
 * The screens that ask for the second keypress (DL-20 §6, DL-25 §3, DL-26 §3).
 *
 * **Why every one of these exists.** In E5 the Transfer confirmation told the player the
 * **opposite** of what the engine then did: it said "and they consent to it" for every
 * Transfer, including one the Rival had already refused, one line under a list that said
 * "they will not deal with you at all". The verification that caught it forced five tests
 * in; the E7 restructure inlined `moveConfirmLines` into `main.ts`'s loop and left them
 * with no equivalent anywhere — `grep -rn "consent" cli/` found one line of the loop and
 * no test at all. They are back here, over a module that is pure again, together with
 * every other confirmation the loop was writing for itself.
 *
 * The rule each of them is held to: **what a confirmation says comes from the engine's own
 * selector result**, and the clause saying why a move cannot be made is the same function
 * the list above it uses.
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  applicantOffers,
  hallCost,
  HALL_IMPROVEMENTS,
  newCareer,
  rivalOffers,
  serialiseCareer,
  upkeepDue,
  wordOffer,
  type Career,
  type Content,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import { wordProse } from '@heroesim/narrate';
import {
  applicantConfirmLines,
  hallConfirmLines,
  moveConfirmLines,
  quitConfirmLines,
  wordConfirmLines,
} from '../src/confirm.js';
import { rivalLines, whyNotMove } from '../src/views/rivals.js';
import { coin } from '../src/screen.js';
import { helpLines, slotLines } from '../src/main.js';
import { expectFits, flow, partyWaiting, WIDTHS } from './helpers.js';

const content: Content = loadContentFromDisk();
const plain = newCareer('display', content).career;

const LONG = 'Bartholomew Grimsditch-Wetherby of the Nine Fords and the Far Weir';

/** A Career with coin enough that nothing is refused for want of it. */
function wealthy(seed = 'cli-confirm'): Career {
  const career = JSON.parse(serialiseCareer(newCareer(seed, content).career)) as Career;
  career.guild.coin = 10_000;
  return career;
}

function offerFor(career: Career) {
  const offer = rivalOffers(career, 'r1')[0];
  if (offer === undefined) throw new Error('the test expected a Rival Hero');
  return offer;
}

describe('the screen that asks for the second keypress, on a move', () => {
  it('says they consent only when they actually do', () => {
    const career = wealthy();
    const said = flow(moveConfirmLines(career, 'Transfer', offerFor(career), 'Them', 80));
    expect(said).toContain('they consent to it');
    expect(said).toContain('[y] do it');
    expect(said).not.toContain('ask anyway');
  });

  it('never claims consent from a Guild that has refused, and says what will happen', () => {
    const career = wealthy();
    const soured = career.rivals[0];
    if (soured === undefined) throw new Error('the test expected a Rival');
    soured.regardForGuild.value = career.config.transferConsentRegard - 1;
    const said = flow(moveConfirmLines(career, 'Transfer', offerFor(career), 'Them', 80));
    expect(said).not.toContain('they consent to it');
    expect(said).toContain('they will not deal with you at all');
    expect(said).toContain('asking will be refused');
    expect(said).toContain('[y] ask anyway');
  });

  it('says the same of a Poaching that cannot be made', () => {
    const career = wealthy();
    const said = flow(moveConfirmLines(career, 'Poach', offerFor(career), 'Them', 80));
    // What it costs in goodwill is still said first; the refusal follows it.
    expect(said).toContain('of their Regard for you');
    expect(said).toContain('they are content enough where they are');
    expect(said).toContain('[y] ask anyway');
  });

  it('names the Roster cap when that is what stands in the way', () => {
    const career = wealthy();
    const willing = career.rivals[0]?.roster[0];
    if (willing === undefined) throw new Error('the test expected a Rival Hero');
    willing.regardForRival.value = career.config.poachRegardThreshold;
    career.config.rosterCap = career.guild.roster.length;
    const said = flow(moveConfirmLines(career, 'Poach', offerFor(career), 'Them', 80));
    expect(said).toContain('there is no room on your Roster');
    expect(said).toContain('[y] ask anyway');
  });

  it('keeps every line inside every width either way, at the longest names there are', () => {
    const career = wealthy();
    const soured = career.rivals[0];
    if (soured === undefined) throw new Error('the test expected a Rival');
    soured.regardForGuild.value = -5;
    for (const width of WIDTHS) {
      for (const what of ['Transfer', 'Poach'] as const) {
        expectFits(
          moveConfirmLines(career, what, offerFor(career), `${LONG} and Company`, width),
          width,
          `${what} confirmation`,
        );
      }
    }
  });

  it('says it in the very clause the list above it uses', () => {
    // One `whyNot`, shared: the list and the confirmation can never differ about a move.
    const career = wealthy();
    const soured = career.rivals[0];
    if (soured === undefined) throw new Error('the test expected a Rival');
    soured.regardForGuild.value = career.config.transferConsentRegard - 1;
    const offer = offerFor(career);
    const refusal = offer.transferRefusal;
    if (refusal === undefined) throw new Error('the test expected a refusal');
    const clause = whyNotMove(refusal);
    expect(flow(moveConfirmLines(career, 'Transfer', offer, soured.name, 80))).toContain(clause);
    expect(flow(rivalLines(career, 80, content))).toContain(clause);
  });
});

describe('the confirmation that buys an improvement for the Hall', () => {
  it('names the cost the engine asks and the coin the Guild holds', () => {
    const improvement = HALL_IMPROVEMENTS[0];
    if (improvement === undefined) throw new Error('the game should ship improvements');
    const career = wealthy();
    const said = flow(hallConfirmLines(career, improvement, 80));
    expect(said).toContain(`That costs ${coin(hallCost(improvement, career.config))}`);
    expect(said).toContain('the Guild holds 10,000 coin');
    expect(said).toContain('[y] buy it');
  });

  it('fits every width', () => {
    const improvement = HALL_IMPROVEMENTS[0];
    if (improvement === undefined) throw new Error('the game should ship improvements');
    for (const width of WIDTHS) {
      expectFits(hallConfirmLines(plain, improvement, width), width, 'hall confirmation');
    }
  });
});

describe('the confirmation that takes somebody on at the door', () => {
  const background = content.backgrounds[0];
  if (background === undefined) throw new Error('the content should ship Backgrounds');
  const named = background;

  /** A Career with one person waiting, at the fee and the coin the test wants. */
  function waiting(career: Career, fee: number, coin: number, name = 'Nerys of Wend Water'): Career {
    return {
      ...career,
      guild: { ...career.guild, coin },
      applicants: [
        {
          id: 'a1',
          name,
          pronouns: 'they' as const,
          stats: { Might: 3, Craft: 3, Nerve: 2, Guile: 2 },
          background: named.name,
          traits: named.traits.map((trait) => ({ name: trait, since: career.day })),
          age: 27,
          calibre: 2 as const,
          askingFee: fee,
          arrivedOn: career.day,
          expiresOn: career.day + 12,
        },
      ],
    };
  }

  it('names the fee, the Upkeep their place adds, and the coin in hand', () => {
    const career = waiting(plain, 120, 900);
    const offer = applicantOffers(career)[0];
    if (offer === undefined) throw new Error('the test expected somebody at the door');
    const said = flow(applicantConfirmLines(career, offer, 80));
    expect(said).toContain('Nerys of Wend Water asks 120 coin');
    expect(said).toContain('adds 20 coin to every Upkeep from now on');
    expect(said).toContain('The Guild holds 900 coin');
    expect(said).toContain('[y] take them on');
  });

  it('is the coin the Upkeep then actually rises by', () => {
    // The figure is not a guess: taking them on moves `upkeepDue` by exactly that much.
    const career = waiting(plain, 120, 900);
    const offer = applicantOffers(career)[0];
    if (offer === undefined) throw new Error('the test expected somebody at the door');
    const before = upkeepDue(career);
    const after = upkeepDue(acceptApplicant(career, offer.applicant.id).career);
    const said = flow(applicantConfirmLines(career, offer, 80));
    expect(said).toContain(`adds ${after - before} coin to every Upkeep`);
  });

  it('fits every width, at the longest name anybody could give', () => {
    const career = waiting(plain, 160, 300, LONG);
    const offer = applicantOffers(career)[0];
    if (offer === undefined) throw new Error('the test expected somebody at the door');
    for (const width of WIDTHS) {
      expectFits(applicantConfirmLines(career, offer, width), width, 'applicant confirmation');
    }
  });
});

describe('the confirmation that answers a waiting Party with coin', () => {
  const { career, partyId } = partyWaiting('confirm-word', content);
  const offer = wordOffer(career, partyId, content);
  if (offer === undefined) throw new Error('the test expected an offer');
  const prose = wordProse(offer, career, content);

  it('names the option in the words content authored, and never its identifier', () => {
    for (const option of offer.options) {
      const label = prose.labels[option.id];
      if (label === undefined) throw new Error('every option is given words');
      const said = flow(wordConfirmLines(option, label, 80));
      expect(said).toContain(label);
      // "Sending word costs 60 coin: send-coin" is what this test exists to forbid.
      expect(said).not.toContain(option.id);
    }
  });

  it('takes the cost off the offer the engine gave', () => {
    const paid = offer.options.find((option) => (option.cost ?? 0) > 0);
    if (paid === undefined) throw new Error('the test expected an option that costs coin');
    const said = flow(wordConfirmLines(paid, prose.labels[paid.id] ?? '', 80));
    expect(said).toContain(`Sending word costs ${paid.cost ?? 0} coin`);
    expect(said).toContain('[y] do it');
  });

  it('fits every width', () => {
    const option = offer.options[0];
    if (option === undefined) throw new Error('the test expected an option');
    for (const width of WIDTHS) {
      expectFits(
        wordConfirmLines(option, prose.labels[option.id] ?? '', width),
        width,
        'word confirmation',
      );
    }
  });
});

describe('the confirmation that writes a named slot on the way out', () => {
  it('names the slot and says the autosave is already written', () => {
    const said = flow(quitConfirmLines('one', 80));
    expect(said).toContain('Save to slot "one" as well?');
    expect(said).toContain('The autosave is already written.');
    expect(said).toContain('[y] write it too');
  });

  it('fits every width, at a slot name nobody would choose', () => {
    for (const width of WIDTHS) {
      expectFits(quitConfirmLines(LONG, width), width, 'quit confirmation');
    }
  });
});

describe('the help and the save listing', () => {
  it('fit every width, at the longest Guild name anybody could give', () => {
    for (const width of WIDTHS) {
      expectFits(helpLines(width), width, 'help');
      expectFits(
        slotLines(
          [
            {
              name: 'autosave',
              header: {
                guildName: `${LONG} Guild and Company`,
                day: 1234,
                year: 4,
                rosterSize: 9,
                seed: LONG,
                ended: false,
              },
              savedOn: '2026-09-20T09:00:00.000Z',
            },
            { name: 'broken', problem: 'the file is not readable' },
          ],
          width,
        ),
        width,
        'slot listing',
      );
    }
  });

  it('says a slot with nothing in it is empty rather than leaving a gap', () => {
    const said = flow(slotLines([], 80));
    expect(said).toContain('autosave: empty');
    expect(said).toContain('one: empty');
  });

  it('names the key that reads a waiting Party in full', () => {
    expect(flow(helpLines(80))).toContain('w: what every waiting Party asks, in full');
  });
});

