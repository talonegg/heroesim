/**
 * Every view, at every width (E7-S3, E7-S5). Each one is a pure function from a Career
 * and a width to plain text, so each one is snapshot-tested at 40, 60, 80 and 120 columns
 * — the 40-column snapshots are committed, so narrow-terminal breakage is a failing test
 * rather than a discovery on a train.
 *
 * Every width assertion is `expectFits`, which holds both halves of E7-S5's rule at once:
 * no line over the width, and nothing cut short.
 *
 * Most of what is asserted here was asserted in `cli/tests/display.test.ts` before the
 * restructure; it moved with the code it covers rather than being dropped.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  answerParty,
  newCareer,
  retaliationRisks,
  rivalOffers,
  serialiseCareer,
  wordOffer,
  wordOffers,
  type Career,
  type Content,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import { formatDay, wordProse } from '@heroesim/narrate';
import { insistenceLines, refusalLines, selectionLines, ROSTER_LETTERS } from '../src/commit.js';
import { advanceRefusedLines, wordLines } from '../src/word.js';
import { applicantCueLines, applicantLines } from '../src/views/applicants.js';
import { formerLines } from '../src/views/former.js';
import { hallLines } from '../src/views/hall.js';
import { leagueLines } from '../src/views/league.js';
import { patronLines } from '../src/views/patrons.js';
import { rosterLines } from '../src/views/roster.js';
import { rivalLines } from '../src/views/rivals.js';
import { paginate } from '../src/screen.js';
import { expectFits, flow, partyWaiting, severalWaiting, WIDTHS } from './helpers.js';

const content: Content = loadContentFromDisk();
const plain = newCareer('display', content).career;

const LONG = 'Bartholomew Grimsditch-Wetherby of the Nine Fords and the Far Weir';

/** The same Career with every name as long as anything could plausibly be. */
function stretched(career: Career): Career {
  return {
    ...career,
    guild: {
      ...career.guild,
      name: `${LONG} Guild of the Grand and Ancient Company of Hired Swords`,
      roster: career.guild.roster.map((hero) => ({
        ...hero,
        name: LONG,
        traits: [
          { name: `${LONG} the Unlucky`, since: 1 },
          { name: 'Another very long Trait indeed', since: 1 },
        ],
      })),
    },
    patrons: career.patrons.map((patron) => ({ ...patron, name: `${LONG}, Patron` })),
    board: career.board.map((commission) => ({
      ...commission,
      title: `${LONG} and the matter of the missing tithe barge, urgently`,
    })),
  };
}

const wide = stretched(plain);

/** A Career whose Heroes hold the Regard given, and whose Rivals hold theirs. */
function feeling(career: Career, mine: number, theirs: number): Career {
  const copy = JSON.parse(serialiseCareer(career)) as Career;
  for (const hero of copy.guild.roster) {
    hero.regardForGuildmaster = {
      value: mine,
      reason: 'the business at Thurrow',
      nature: 'neutral',
    };
  }
  for (const rival of copy.rivals) {
    rival.regardForGuild = { ...rival.regardForGuild, value: theirs };
  }
  return copy;
}

/** The same Career with a given amount of coin. */
function withCoin(career: Career, amount: number): Career {
  return { ...career, guild: { ...career.guild, coin: amount } };
}

/** Every view, named, over one Career, so that the width sweep can drive them all. */
function everyView(career: Career, width: number): Record<string, string[]> {
  return {
    roster: rosterLines(career, width, content),
    patrons: patronLines(career, width, content),
    league: leagueLines(career, width),
    hall: hallLines(career, width),
    former: formerLines(career, width),
    applicants: applicantLines(career, width, content),
    rivals: rivalLines(career, width, content),
  };
}

describe('every view, at 40, 60, 80 and 120 columns', () => {
  for (const width of WIDTHS) {
    it(`renders at ${width} with nothing over the width and nothing cut short`, () => {
      for (const [name, lines] of Object.entries(everyView(plain, width))) {
        expectFits(lines, width, name);
      }
    });

    it(`renders at ${width} with the longest names anybody could give`, () => {
      for (const [name, lines] of Object.entries(everyView(wide, width))) {
        expectFits(lines, width, `${name} (long names)`);
      }
    });

    it(`reads heading, then content, at ${width}`, () => {
      // The order a screen reader speaks it in (E7-S5): the heading is the first line of
      // every view and the actions are printed after it by the loop, never before.
      for (const [name, lines] of Object.entries(everyView(plain, width))) {
        expect(lines[0], name).toMatch(/^[A-Z][A-Z ]+$/);
        expect(lines[1] ?? '', name).not.toMatch(/^\[/);
      }
    });

    it(`is the same text as last time, at ${width}`, () => {
      for (const [name, lines] of Object.entries(everyView(plain, width))) {
        expect(lines.join('\n')).toMatchSnapshot(`${name} at ${width}`);
      }
    });
  }
});

describe('the Roster view', () => {
  const lines = rosterLines(plain, 80, content);

  it('gives every Hero their name, age, Stats, Regard and where they are', () => {
    const first = plain.guild.roster[0];
    if (first === undefined) throw new Error('no Roster');
    const said = flow(lines);
    expect(said).toContain(first.name);
    expect(said).toContain(`, ${first.age},`);
    expect(said).toContain('Might/Craft/Nerve/Guile');
    expect(said).toContain('available');
  });

  it('never shows a bare number for Regard: the reason is beside it', () => {
    const regards = lines.filter((line) => line.includes('Regard for you'));
    expect(regards.length).toBeGreaterThan(0);
    for (const line of regards) expect(line).toMatch(/Regard for you [+-]?\d+:/);
  });

  it('gives each Trait its summary, from content', () => {
    const traitName = plain.guild.roster.flatMap((hero) => hero.traits)[0]?.name;
    if (traitName === undefined) throw new Error('the Roster should carry a Trait');
    const summary = content.traits.find((trait) => trait.name === traitName)?.summary;
    expect(summary).toBeDefined();
    expect(flow(lines)).toContain(summary ?? '');
  });

  it('sorts by where they are and then by name', () => {
    const career = JSON.parse(serialiseCareer(plain)) as Career;
    const [first, second] = career.guild.roster;
    if (first === undefined || second === undefined) throw new Error('no Roster');
    first.traits = [...first.traits, { name: 'Bruised', since: 1, liftsOn: career.day + 10 }];
    const shown = rosterLines(career, 80, content);
    const at = (name: string): number => shown.findIndex((line) => line.includes(name));
    expect(at(second.name)).toBeLessThan(at(first.name));
    expect(flow(shown)).toContain('injured until');
  });

  it('says where an away Hero is, in full and never abbreviated', () => {
    const { career } = partyWaiting('roster-away', content);
    const said = flow(rosterLines(career, 80, content));
    expect(said).toContain('back no sooner than');
    expect(said).toContain('and later the longer they wait');
    expect(said).not.toContain('no sooner,');
  });

  it('marks a Hero another Guild could take, in words, naming the Guilds', () => {
    const career = feeling(plain, plain.config.poachRegardThreshold, -5);
    const said = flow(rosterLines(career, 80, content));
    expect(said).toContain('Another Guild could take them.');
    for (const rival of career.rivals) expect(said).toContain(rival.name);
  });

  it('says so even when nobody is presently minded to try', () => {
    const career = feeling(plain, plain.config.poachRegardThreshold, 0);
    expect(flow(rosterLines(career, 80, content))).toContain(
      'Another Guild could take them, though none is minded to just now.',
    );
  });

  it('says nothing at all about a Roster nobody can take from', () => {
    expect(flow(rosterLines(feeling(plain, 5, -5), 80, content))).not.toContain('could take them');
  });

  it('names one Guild in the singular, and wraps rather than clipping', () => {
    // One Guild minded to try, with a name nobody would give: the sentence says "is"
    // rather than "are", and the name wraps rather than being cut to make a column.
    const career = feeling(plain, plain.config.poachRegardThreshold, 0);
    const first = career.rivals[0];
    if (first === undefined) throw new Error('the test expected a Rival');
    first.regardForGuild = { ...first.regardForGuild, value: -5 };
    first.name = 'The Exceedingly Long Guild of the Marrow Quay Salt Factors and the Far Weir';
    for (const width of WIDTHS) {
      const lines = rosterLines(career, width, content);
      expectFits(lines, width, 'roster (one Guild, long name)');
      expect(flow(lines)).toContain(`${first.name} is minded to.`);
    }
  });

  it('agrees with the engine about who is at risk, on a Roster that is a mixture', () => {
    const career = JSON.parse(serialiseCareer(plain)) as Career;
    for (const rival of career.rivals) rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
    career.guild.roster.forEach((hero, index) => {
      hero.regardForGuildmaster = { value: index - 3, reason: 'x', nature: 'neutral' };
    });
    const risky = new Set(retaliationRisks(career).map((risk) => risk.heroId));
    expect(risky.size).toBeGreaterThan(0);
    expect(risky.size).toBeLessThan(career.guild.roster.length);
    const shown = rosterLines(career, 80, content);
    for (const hero of career.guild.roster) {
      const at = shown.findIndex((line) => line.includes(hero.name));
      const block = shown.slice(at, at + 8).join(' ');
      expect(block.includes('could take them'), hero.id).toBe(risky.has(hero.id));
    }
  });

  it('shows a departed or dead Hero nowhere', () => {
    const career = JSON.parse(serialiseCareer(plain)) as Career;
    const gone = career.guild.roster.pop();
    if (gone === undefined) throw new Error('no Roster');
    gone.exit = { kind: 'departure', onDay: 3, reason: 'you insisted once too often' };
    career.guild.formerHeroes.push(gone);
    expect(flow(rosterLines(career, 80, content))).not.toContain(gone.name);
    expect(flow(formerLines(career, 80))).toContain(gone.name);
  });
});

describe('the former Heroes page', () => {
  it('says so plainly when nobody has left', () => {
    expect(flow(formerLines(plain, 80))).toContain('Nobody has left the Guild yet');
  });

  it('says how each one went, and when', () => {
    const career = JSON.parse(serialiseCareer(plain)) as Career;
    const gone = career.guild.roster.pop();
    if (gone === undefined) throw new Error('no Roster');
    gone.exit = { kind: 'retirement', onDay: 700, reason: 'they reached the end of it' };
    career.guild.formerHeroes.push(gone);
    const said = flow(formerLines(career, 80));
    expect(said).toContain('reached the end of a working life');
    expect(said).toContain(formatDay(700, career));
    expect(said).toContain('they reached the end of it');
  });

  it('does not say the going twice when the engine’s reason is the going', () => {
    // A Retirement's reason on the Career *is* `reached the end of a working life`, so
    // this read "reached the end of a working life, Year 1, Day 700: reached the end of a
    // working life". `narrate`'s `exitReason` drops a reason that adds nothing, in both
    // front ends at once.
    const career = JSON.parse(serialiseCareer(plain)) as Career;
    const gone = career.guild.roster.pop();
    if (gone === undefined) throw new Error('no Roster');
    gone.exit = { kind: 'retirement', onDay: 700, reason: 'reached the end of a working life' };
    career.guild.formerHeroes.push(gone);
    const said = flow(formerLines(career, 80));
    expect(said).toContain(`reached the end of a working life, ${formatDay(700, career)}`);
    expect(said.match(/reached the end of a working life/g)).toHaveLength(1);
    expect(said).not.toContain('working life: reached');
  });
});

describe('the Patrons view', () => {
  it('groups by Sphere and gives each Patron a Regard and the reason it last moved', () => {
    const lines = patronLines(plain, 80, content);
    const said = flow(lines);
    for (const sphere of content.spheres) {
      if (plain.patrons.some((patron) => patron.sphere === sphere.id)) {
        expect(said).toContain(sphere.name);
      }
    }
    for (const patron of plain.patrons) {
      expect(said).toContain(patron.name);
      expect(said).toContain(patron.regardForGuild.reason);
    }
    expect(said).toMatch(/Regard [+-]?\d/);
  });

  it('says what each Patron has on the Board', () => {
    const posted = plain.board[0];
    if (posted === undefined) throw new Error('no Board');
    expect(flow(patronLines(plain, 80, content))).toContain(`On the Board: ${posted.title}`);
  });

  it('says explicitly that a Patron at the floor is posting nothing', () => {
    const career = JSON.parse(serialiseCareer(plain)) as Career;
    const silent = career.patrons[0];
    if (silent === undefined) throw new Error('no Patrons');
    silent.regardForGuild = { ...silent.regardForGuild, value: -5 };
    const said = flow(patronLines(career, 80, content));
    expect(said).toContain('They are posting nothing at all');
  });
});

describe('the League view', () => {
  it('marks your own row and does not move it for being yours', () => {
    const career = JSON.parse(serialiseCareer(plain)) as Career;
    for (const patron of career.patrons) patron.regardForGuild.value = -5;
    career.rivals.forEach((rival, index) => {
      rival.standing = 10 + index;
    });
    const lines = leagueLines(career, 80);
    const rows = lines.filter((line) => line.includes('on the Roster'));
    expect(rows).toHaveLength(career.rivals.length + 1);
    expect(rows.filter((line) => line.trimStart().startsWith('> '))).toHaveLength(1);
    expect(rows[rows.length - 1]?.trimStart().startsWith('> ')).toBe(true);
  });

  it('puts Standing’s derivation in a footer, word for word with the browser', () => {
    expect(flow(leagueLines(plain, 80))).toContain('It is not a score');
    expect(flow(leagueLines(plain, 80))).toContain('the only way to climb is to earn their Regard');
  });
});

describe('the Hall', () => {
  it('offers all three improvements with the cost and the effect, nothing cut', () => {
    const lines = hallLines(withCoin(plain, 1000), 80);
    const said = flow(lines);
    for (const wanted of ['Infirmary', 'Training yard', 'Quarters']) {
      expect(said).toContain(wanted);
    }
    expect(said).toContain(`${plain.config.hallInfirmaryCost} coin`);
    expect(said).toContain('as long');
    expect(said).toContain('Backing for every Party you send');
    expect(said).toContain('idle Days');
    expectFits(lines, 80, 'hall');
  });

  it('says in words whether each can be afforded, and what is already built', () => {
    expect(flow(hallLines(withCoin(plain, 10_000), 80))).toContain('You can afford this.');
    expect(flow(hallLines(withCoin(plain, 0), 80))).toContain('coin short');
    const built: Career = {
      ...withCoin(plain, 10_000),
      guild: { ...plain.guild, coin: 10_000, hall: ['infirmary'] },
    };
    expect(flow(hallLines(built, 80))).toContain('Already built.');
  });
});

describe('the Applicants', () => {
  const background = content.backgrounds[0];
  if (background === undefined) throw new Error('the content should ship Backgrounds');
  const named = background;

  /** A Career with a batch waiting, at whatever names and coin the test wants. */
  function waiting(
    career: Career,
    people: {
      name: string;
      traits: string[];
      calibre: 1 | 2 | 3;
      fee: number;
      formerHeroId?: string;
    }[],
    coin = 500,
  ): Career {
    return {
      ...career,
      guild: { ...career.guild, coin },
      applicants: people.map((person, index) => ({
        id: `a${index + 1}`,
        name: person.name,
        pronouns: 'they' as const,
        stats: { Might: 3, Craft: 3, Nerve: 2, Guile: 2 },
        background: named.name,
        traits: person.traits.map((trait) => ({ name: trait, since: career.day })),
        age: 27,
        calibre: person.calibre,
        askingFee: person.fee,
        arrivedOn: career.day,
        expiresOn: career.day + 12,
        ...(person.formerHeroId === undefined ? {} : { formerHeroId: person.formerHeroId }),
      })),
    };
  }

  const batch = waiting(plain, [
    { name: 'Nerys of Wend Water', traits: background.traits, calibre: 1, fee: 80 },
    { name: 'Corran the Quiet', traits: background.traits, calibre: 2, fee: 120, formerHeroId: 'h1' },
    { name: 'Orla Ratcatcher', traits: background.traits, calibre: 3, fee: 160 },
  ]);

  const opening = background.summary.split(' ').slice(0, 3).join(' ');

  it('puts the Background summary and the Traits first, and the Stats second', () => {
    const lines = applicantLines(batch, 80, content);
    const at = (needle: string): number => lines.findIndex((line) => line.includes(needle));
    expect(at('Nerys of Wend Water')).toBeGreaterThanOrEqual(0);
    expect(at(opening)).toBeGreaterThan(at('Nerys of Wend Water'));
    expect(at('Traits:')).toBeGreaterThan(at(opening));
    expect(at('Might 3')).toBeGreaterThan(at('Traits:'));
    expect(at('Asks 80 coin')).toBeGreaterThan(at('Might 3'));
  });

  it('never prints a calibre, as a number, a star or a grade', () => {
    const said = applicantLines(batch, 80, content).join('\n');
    expect(said.toLowerCase()).not.toContain('calibre');
    expect(said).not.toContain('★');
    expect(said).toContain('Asks 80 coin');
    expect(said).toContain('Asks 160 coin');
  });

  it('marks somebody coming back in words', () => {
    const marked = applicantLines(batch, 80, content).filter((line) => line.includes('Coming back'));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toContain('walked out');
  });

  it('says in a sentence why an offer cannot be taken', () => {
    const poor = flow(
      applicantLines(
        waiting(plain, [{ name: 'Nerys', traits: background.traits, calibre: 3, fee: 160 }], 40),
        80,
        content,
      ),
    );
    expect(poor).toContain('cannot pay');
    expect(poor).toContain('160 coin');
    expect(poor).toContain('120 short');

    const full = flow(
      applicantLines(
        {
          ...waiting(plain, [{ name: 'Nerys', traits: background.traits, calibre: 1, fee: 80 }], 10_000),
          config: { ...plain.config, rosterCap: 4 },
        },
        80,
        content,
      ),
    );
    expect(full).toContain('Roster is full');
    expect(full).toContain('somebody leaves');
  });

  it('says so plainly when nobody is waiting', () => {
    expect(flow(applicantLines(plain, 80, content))).toContain('Nobody is waiting');
  });

  it('cues the main screen when somebody is waiting, and says nothing when nobody is', () => {
    expect(applicantCueLines(plain, 80)).toEqual([]);
    const cue = applicantCueLines(batch, 80);
    expect(flow(cue)).toContain('3 people are waiting');
    expect(flow(cue)).toContain('12 Days');
    expect(flow(cue)).toContain('Press a to meet them.');
    expectFits(cue, 80, 'applicant cue');
  });

  // Two tests rather than one, because they are two branches and they say two different
  // things to the player: a Roster with no room, and a Guild with no coin (finding C2).
  it('says so, and names the Roster cap, when every offer is refused for the same reason', () => {
    const full: Career = { ...batch, config: { ...batch.config, rosterCap: batch.guild.roster.length } };
    const cue = applicantCueLines(full, 80);
    const said = flow(cue);
    expect(said).toContain('3 people are waiting');
    expect(said).toContain('none can be taken on');
    expect(said).toContain(`Roster is full at ${full.config.rosterCap}`);
    // The nag is gone, and the view is still reachable.
    expect(said).not.toContain('Press a to meet them.');
    expect(said).toContain('Press a to see who they are.');
    expectFits(cue, 80, 'applicant cue (full Roster)');
  });

  it('says so, and names the coin, when every offer is refused for want of it', () => {
    const poor = waiting(
      plain,
      [
        { name: 'Nerys', traits: background.traits, calibre: 1, fee: 80 },
        { name: 'Corran', traits: background.traits, calibre: 2, fee: 120 },
      ],
      5,
    );
    const cue = applicantCueLines(poor, 80);
    const said = flow(cue);
    expect(said).toContain('none can be taken on');
    expect(said).toContain('cannot pay any of them yet');
    expect(said).not.toContain('Press a to meet them.');
    expectFits(cue, 80, 'applicant cue (no coin)');
  });

  it('never says "none can be taken on" twice in one cue', () => {
    // The reason used to fall back to the very phrase the cue already carries, so a cue
    // with no single reason true of all of them read "none can be taken on: none can be
    // taken on just now". `narrate`'s `noneCanBeTakenReason` now gives none instead, in
    // both front ends at once, and `narrate/tests/e7-words.test.ts` pins that branch —
    // which `acceptRefusal` cannot itself reach, because every guard above
    // `InsufficientCoin` is Career-wide and refuses everybody with the same code.
    const full: Career = { ...batch, config: { ...batch.config, rosterCap: batch.guild.roster.length } };
    for (const career of [full, batch]) {
      const said = flow(applicantCueLines(career, 80));
      expect(said).not.toContain('none can be taken on just now');
      expect((said.match(/none can be taken on/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it('says the same two facts in one line when the screen has not the rows', () => {
    // The shorter form the main screen falls back to: the count, whether anybody can be
    // taken on, and the key — never a hole where the block was (DL-26 §1).
    const short = applicantCueLines(batch, 80, true);
    expect(short).toHaveLength(1);
    expect(flow(short)).toBe('APPLICANTS 3 people are waiting. Press a.');
    const full: Career = { ...batch, config: { ...batch.config, rosterCap: batch.guild.roster.length } };
    expect(flow(applicantCueLines(full, 80, true))).toContain('none can be taken on');
    for (const width of WIDTHS) {
      expectFits(applicantCueLines(batch, width, true), width, 'applicant cue (short)');
    }
  });

  it('keeps every line inside the width with the longest names anybody could give', () => {
    const absurd = waiting(
      stretched(plain),
      [
        {
          name: LONG,
          traits: [`${LONG} the Unlucky`, 'Another very long Trait indeed'],
          calibre: 3,
          fee: 160,
          formerHeroId: 'h1',
        },
      ],
      3,
    );
    for (const width of WIDTHS) {
      const lines = applicantLines(absurd, width, content);
      expectFits(lines, width, 'applicants (long names)');
      const said = flow(lines);
      expect(said).toContain(background.summary);
      expect(said).toContain('157 short');
      expect(said).toContain('Coming back');
    }
  });
});

describe('the other Guilds', () => {
  /** A Career whose Guilds and people are named as awkwardly as the content allows. */
  function withLongNames(): Career {
    const career = JSON.parse(serialiseCareer(newCareer('cli-rivals', content).career)) as Career;
    career.guild.coin = 10_000;
    for (const [index, rival] of career.rivals.entries()) {
      rival.name = `The Very Long Guild of the Wending Ferrymen of Lowford ${index + 1}`;
      rival.regardForGuild = {
        value: -1,
        reason: 'a long reason that has to survive the wrap, about the business at Thurrow',
        nature: 'neutral',
      };
      for (const hero of rival.roster) {
        hero.name = `${hero.name} of the Long Water Crossing at Ashfall`;
      }
    }
    career.guild.name = 'The Exceedingly Long Guild of the Marrow Quay Salt Factors';
    return career;
  }

  it('says both fees and whether each move is possible now, for everybody', () => {
    const career = withLongNames();
    const said = rivalLines(career, 80, content).join(' ');
    const people = career.rivals.flatMap((rival) => rival.roster);
    expect(people.length).toBeGreaterThan(8);
    expect(said.match(/Transfer for [\d,]+ coin: /g) ?? []).toHaveLength(people.length);
    expect(said.match(/Poach for [\d,]+ coin: /g) ?? []).toHaveLength(people.length);
    expect(said).toContain('they will not deal with you at all');
  });

  it('wraps the reason a move cannot be made rather than cutting it off', () => {
    const career = withLongNames();
    for (const width of WIDTHS) {
      const lines = rivalLines(career, width, content);
      expectFits(lines, width, 'rivals (long names)');
    }
    expect(flow(rivalLines(career, 80, content))).toContain('about the business at Thurrow');
  });

  it('says of a wronged Guild whether they have room to take anybody (finding C7)', () => {
    const career = withLongNames();
    for (const rival of career.rivals) {
      rival.regardForGuild = { ...rival.regardForGuild, value: career.config.souredRivalThreshold };
    }
    const roomy = JSON.parse(serialiseCareer(career)) as Career;
    roomy.config.rivalRosterMax = 20;
    const withRoom = flow(rivalLines(roomy, 80, content));
    expect(withRoom).toContain('You have wronged them');
    expect(withRoom).toContain('They have room to take somebody off your Roster.');

    const full = JSON.parse(serialiseCareer(career)) as Career;
    full.config.rivalRosterMax = 1;
    const noRoom = flow(rivalLines(full, 80, content));
    expect(noRoom).toContain('Their own Roster is full, so they can take nobody off yours just now.');
    expect(noRoom).not.toContain('They have room to take somebody');

    const friendly = withLongNames();
    for (const rival of friendly.rivals) {
      rival.regardForGuild = { ...rival.regardForGuild, value: 0 };
    }
    expect(flow(rivalLines(friendly, 80, content))).not.toContain('You have wronged');
  });

  it('never prints a calibre in the view that shows people', () => {
    const said = rivalLines(withLongNames(), 80, content).join('\n');
    expect(said.toLowerCase()).not.toContain('calibre');
  });
});

describe('putting a Party together', () => {
  const commission = plain.board[0];
  if (commission === undefined) throw new Error('no Board');
  const hero = plain.guild.roster[0];
  const other = plain.guild.roster[1];
  if (hero === undefined || other === undefined) throw new Error('no Roster');

  const overRegard = { heroId: hero.id, reason: 'regard' as const, regardValue: -4 };
  const overTrait = {
    heroId: other.id,
    reason: 'trait' as const,
    trait: 'Godfearing',
    regardValue: 1,
  };

  it('shows the work, its terms and everybody who could go', () => {
    const lines = selectionLines(plain, commission, [hero.id], 80);
    expect(lines[0]).toContain(commission.title);
    expect(flow(lines)).toContain('Beats');
    expect(lines.some((line) => line.trimStart().startsWith('a* '))).toBe(true);
    expectFits(lines, 80, 'commit');
  });

  it('letters the Roster, a to l, in the order the keys take', () => {
    // The Board is numbered and the Roster is lettered, which is what E7-S1's own mock
    // draws; the letters are the ones `parseSelection` reads, in the Roster's own order.
    const lines = selectionLines(plain, commission, [], 80);
    plain.guild.roster.forEach((person, index) => {
      const letter = ROSTER_LETTERS[index] ?? '-';
      const row = lines.find((line) => line.startsWith(`  ${letter}  `));
      expect(row, `no row lettered ${letter}`).toBeDefined();
      expect(row).toContain(person.name);
    });
    expect(lines.some((line) => line.startsWith('  a  '))).toBe(true);
  });

  it('says nothing at all when nobody refuses', () => {
    expect(refusalLines(plain, [], 80, content)).toEqual([]);
    expect(insistenceLines(plain, [], 80)).toEqual([]);
  });

  it('names the Hero and blames the relationship when the reason is Regard', () => {
    const lines = refusalLines(plain, [overRegard], 80, content);
    expect(flow(lines)).toContain('WHO WILL NOT GO');
    expect(flow(lines)).toContain(`${hero.name}: Regard for you stands at -4.`);
    expect(flow(lines)).not.toContain('Godfearing');
  });

  it('quotes the Trait and its summary when the reason is a Trait', () => {
    const summary = content.traits.find((trait) => trait.name === 'Godfearing')?.summary;
    expect(summary).toBeDefined();
    const said = flow(refusalLines(plain, [overTrait], 80, content));
    expect(said).toContain(`${other.name}: Godfearing`);
    expect(said).toContain(summary ?? '');
  });

  it('states the price of insisting and the keypress that accepts it', () => {
    const said = flow(insistenceLines(plain, [overRegard, overTrait], 80));
    expect(said).toContain('2 Heroes will not go');
    expect(said).toContain(`costs each of them ${plain.config.insistenceRegardCost} Regard`);
    expect(said).toContain(`at ${String(plain.config.departureRegardThreshold)} a Hero may walk out`);
    expect(said).toContain('[i] insist and send them');
    expect(flow(insistenceLines(plain, [overRegard], 80))).toContain('One Hero will not go');
  });

  it('fits every width, at the longest names anybody could give', () => {
    const wideCommission = wide.board[0];
    const wideHero = wide.guild.roster[0];
    const wideOther = wide.guild.roster[1];
    if (wideCommission === undefined || wideHero === undefined || wideOther === undefined) {
      throw new Error('no world');
    }
    const refusals = [
      { ...overRegard, heroId: wideHero.id },
      { ...overTrait, heroId: wideOther.id },
    ];
    for (const width of WIDTHS) {
      expectFits(selectionLines(wide, wideCommission, [wideHero.id], width), width, 'commit');
      expectFits(refusalLines(wide, refusals, width, content), width, 'refusals');
      expectFits(insistenceLines(wide, refusals, width), width, 'insistence');
      expect(flow(refusalLines(wide, refusals, width, content))).toContain(
        'Regard for you stands at -4.',
      );
    }
  });
});

describe('a Party waiting on your word', () => {
  const { career, partyId } = partyWaiting('display-word', content);
  const offer = wordOffer(career, partyId, content);
  if (offer === undefined) throw new Error('expected an offer');
  const prose = wordProse(offer, career, content);
  const lines = wordLines(career, 80, content);

  it('says who is waiting, on what, and what they are asking', () => {
    const said = flow(lines);
    expect(said).toContain('WAITING ON YOUR WORD');
    expect(said).toContain(prose.prompt.split(' ').slice(0, 6).join(' '));
  });

  it('numbers every option and prints its words, with the cost where there is one', () => {
    const said = flow(lines);
    offer.options.forEach((option, index) => {
      const opening = prose.labels[option.id]?.split(' ')[0] ?? '';
      expect(said).toContain(`${String(index + 1)} ${opening}`);
      if (option.cost !== undefined) expect(said).toContain(`(${String(option.cost)} coin)`);
    });
  });

  it('marks which option is taken if nobody answers, in words and exactly once', () => {
    expect(lines.join('\n').match(/\[their own judgement\]/g)).toHaveLength(1);
  });

  it('shows the Days waited, the Days left and the coin the Guild holds', () => {
    const said = flow(lines);
    expect(said).toContain('They have waited');
    expect(said).toContain('own judgement in');
    expect(said).toContain('The Guild holds');
  });

  it('greys nothing it does not also say in words', () => {
    const poor = partyWaiting('display-word-poor', content, 10);
    const dear = wordOffer(poor.career, poor.partyId, content)?.options.find(
      (option) => !option.affordable,
    );
    if (dear === undefined) throw new Error('the test expected an option out of reach');
    const said = flow(wordLines(poor.career, 80, content));
    expect(said).toContain(`(${String(dear.cost ?? 0)} coin)`);
    expect(said).toContain('Cannot be sent: the Guild is');
    expect(said).toContain('coin short');
  });

  it('says what turning back would pay, before it is chosen', () => {
    const outcome = offer.options.find((option) => option.kind === 'turnBack')?.outcome;
    if (outcome === undefined) throw new Error('the test expected a turn-back outcome');
    const said = flow(lines);
    expect(said).toContain(`Calling them home pays ${outcome.feePaid} coin`);
    expect(said).toContain(`of the ${outcome.fullFee} the work is worth`);
    expect(said).toContain(`for ${outcome.beatsResolved} of ${outcome.beatCount} Beats done`);
  });

  it('says it of the turn-back option and of neither of the others', () => {
    expect(lines.join('\n').match(/Calling them home pays/g)).toHaveLength(1);
  });

  it('is the coin the Patron then actually pays', () => {
    // The figure is not a forecast the CLI made up: answering with it and letting the
    // Days run brings the Party home on exactly that `feePaid`.
    const turnBack = offer.options.find((option) => option.kind === 'turnBack');
    const outcome = turnBack?.outcome;
    if (turnBack === undefined || outcome === undefined) {
      throw new Error('the test expected a turn-back outcome');
    }
    const answered = answerParty(career, partyId, turnBack.id, content);
    const run = advance(answered.career, 60, content);
    const home = [...answered.events, ...run.events].find(
      (event) => event.type === 'PartyReturned' && event.partyId === partyId,
    );
    expect(home?.type).toBe('PartyReturned');
    if (home?.type === 'PartyReturned') expect(home.feePaid).toBe(outcome.feePaid);
  });

  it('fits every width, wrapped rather than cut', () => {
    for (const width of WIDTHS) {
      expectFits(wordLines(career, width, content), width, 'word');
      expectFits(wordLines(stretched(career), width, content), width, 'word (long names)');
      expect(wordLines(career, width, content).join('\n')).toMatchSnapshot(`word at ${width}`);
    }
  });

  it('says nothing at all when nobody is waiting', () => {
    expect(wordLines(plain, 80, content)).toEqual([]);
  });

  it('goes back to a plain return the moment the Party is answered', () => {
    const answered = answerParty(career, partyId, 'press-on', content).career;
    if (answered.parties.length === 0) return;
    expect(flow(rosterLines(answered, 80, content))).not.toContain('no sooner than');
  });
});

/**
 * Two Parties waiting at once is where the Word view earns its paging, and it is where the
 * pager was silently tearing one of them in half: `wordLines` gave it no blank line to
 * break at, so `paginate` fell back to the row limit and put option 4 at the foot of one
 * page with 5 and 6 on the next. An option a player cannot see beside the others is an
 * option they cannot weigh, and `screen.ts`' own "never split down the middle" promise was
 * being made about a block that had nothing to break at.
 */
describe('two Parties waiting at once, paged', () => {
  const several = severalWaiting('views-two-words', content);

  it('reaches a Career with two Parties waiting', () => {
    expect(wordOffers(several, content).length).toBeGreaterThanOrEqual(2);
  });

  it('never splits one Party across two pages, at any width', () => {
    for (const width of WIDTHS) {
      const offers = wordOffers(several, content);
      const lines = wordLines(several, width, content);
      const pages = paginate(lines).pages;
      const shown = Array.from({ length: pages }, (_, at) => paginate(lines, at + 1).lines);
      let first = 1;
      for (const offer of offers) {
        const numbers = offer.options.map((_, at) => first + at);
        first += offer.options.length;
        const landed = new Set(
          numbers.flatMap((number) =>
            shown
              .map((page, at) =>
                page.some((line) => new RegExp(`^ {2}${number} {2}`).test(line)) ? at + 1 : 0,
              )
              .filter((at) => at > 0),
          ),
        );
        expect(
          landed.size,
          `at ${width}: options ${numbers.join(',')} landed on pages ${[...landed].join(',')}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('separates the Parties with a blank line, which is what the pager breaks at', () => {
    const lines = wordLines(several, 80, content);
    expect(lines.filter((line) => line === '').length).toBe(
      wordOffers(several, content).length - 1,
    );
  });

  it('still fits every width and cuts nothing', () => {
    for (const width of WIDTHS) {
      expectFits(wordLines(several, width, content), width, 'two waiting');
    }
  });
});

describe('refusing to let the Days run', () => {
  const { career } = partyWaiting('display-refuse', content);
  const lines = advanceRefusedLines(career, 80, content);

  it('names the Party, how long they have waited and how long is left', () => {
    const said = flow(lines);
    expect(said).toContain('has been waiting');
    expect(said).toContain('acts on their own judgement in');
  });

  it('says what a second press would do', () => {
    expect(flow(lines)).toContain('press n again to let the Days run');
  });

  it('fits every width', () => {
    for (const width of WIDTHS) {
      expectFits(advanceRefusedLines(career, width, content), width, 'advance refused');
    }
  });
});

describe('the fee a Rival asks is never abbreviated', () => {
  it('prints coin in full wherever it appears', () => {
    const career = JSON.parse(serialiseCareer(newCareer('cli-confirm', content).career)) as Career;
    career.guild.coin = 10_000;
    const offer = rivalOffers(career, 'r1')[0];
    expect(offer).toBeDefined();
    const said = rivalLines(career, 80, content).join('\n');
    expect(said).not.toMatch(/\b\d+(\.\d+)?k\b/);
    expect(said).toContain('10,000 coin in hand');
  });
});

/**
 * A name with no space in it that is longer than the terminal. Breaking a single
 * unbreakable word is the one place a hard break is acceptable, and it is the one case the
 * adversarial names elsewhere never reach — `LONG` has spaces in it, so `wrap` always has
 * somewhere to break. Nothing may run over the width and nothing may be cut short.
 */
describe('a name longer than the terminal with nothing to break at', () => {
  const WORD = 'A'.repeat(93);
  const unbreakable = (career: Career): Career => ({
    ...career,
    guild: {
      ...career.guild,
      name: WORD,
      roster: career.guild.roster.map((hero) => ({ ...hero, name: WORD })),
    },
    patrons: career.patrons.map((patron) => ({ ...patron, name: WORD })),
    board: career.board.map((commission) => ({ ...commission, title: WORD })),
    rivals: career.rivals.map((rival) => ({
      ...rival,
      name: WORD,
      roster: rival.roster.map((hero) => ({ ...hero, name: WORD })),
    })),
  });

  it('is broken rather than allowed to run over, in every view at every width', () => {
    const career = unbreakable(plain);
    for (const width of WIDTHS) {
      for (const [name, lines] of Object.entries(everyView(career, width))) {
        expectFits(lines, width, `${name} (one unbreakable word)`);
      }
      // And the word really is all there: broken, not cut.
      const roster = rosterLines(career, width, content).join('');
      expect(roster.replace(/[^A]/g, '').length, `at ${width}`).toBeGreaterThanOrEqual(WORD.length);
    }
  });
});
