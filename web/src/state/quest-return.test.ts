// @vitest-environment node
import {
  entriesFor,
  offeredQuests,
  playerGuild,
  unattachedHeroes,
  type EngineEventOf,
  type HeroId,
  type PartyId,
  type WorldDocument,
} from '@heroesim/engine';
import { append, makeId } from '@heroesim/engine/testing';
import { describe, expect, test, vi } from 'vitest';
import { nightOfTurn } from '@heroesim/words';
import { content } from '../content';
import { cameHome, changed, documentOf, partyOut, played, started, withPartyOut, withReturn, withReturns, withWealth, type Written } from './game.test-support';
import { historyFilter } from './history';
import { partOfAReturn } from './history-reader';
import { narrateSegments, narrateText, textOf } from './namer';
import { questReturn, reportSections, returnEntry, returnsIn, type QuestReturn } from './quest-return';
import { readingOf } from './reading';
import { calendarFor } from './reducer';

// A Quest's return read from the History (DL-111 items 2 and 3, DL-112 item 8): by its Party
// and Quest, from the entries that name the Quest (DL-114), and a Level and a dead Hero's gear
// by Hero and night. Each return is played by the engine (`withReturn`, DL-245) with the outcome the
// test chooses; the expectations are the words and numbers the test told and the night's rules give.

// Every narration passes through, counted: the entry reads its Hero lines without the report's.
vi.mock('./namer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./namer')>();
  return { ...actual, narrateSegments: vi.fn(actual.narrateSegments) };
});
// The calendar too, counted: it merges and checks the whole config, so a return reads it once (DL-214).
vi.mock('./reducer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./reducer')>();
  return { ...actual, calendarFor: vi.fn(actual.calendarFor) };
});

const base = withPartyOut(started('quest-return'));

// A Party home from its Quest, one game the tests below read and none plays on or writes to (ADR-0008).
const cameHomeState = cameHome(started('reducer-test'));

/** The return written, read back. */
function read(written: Written): QuestReturn {
  const found = questReturn(documentOf(written.state), { partyId: written.party.partyId, questId: written.party.questId });
  if (found === null) throw new Error('no return read');
  return found;
}

function nameOf(written: Written, heroId: string): string {
  return documentOf(written.state).world.heroes[heroId as never]?.name ?? '';
}

describe('questReturn', () => {
  test('a strong success with a Level: the Quest, its Patron, the Party and the band; the reward; each Hero’s XP, and the Level by Hero and night', () => {
    const written = withReturn(base, {
      band: 'strong',
      wealth: 180,
      fame: 4,
      xp: 60,
      encounters: [{ outcome: 'success' }, { outcome: 'success' }],
      levels: [{ hero: 0, level: 2 }],
      morale: [{ hero: 0, cause: 'strong-success', before: 60, after: 65, bandAfter: 'steady' }],
    });
    const { party } = written;
    const report = read(written);
    const document = documentOf(written.state);

    expect(report.quest).toBe(content.questTemplates[party.templateKey]?.name);
    expect(report.patron).toEqual({ patronId: party.patronId, name: document.world.patrons[party.patronId]?.name });
    expect(report.band).toBe('strong');
    expect(report.bandWords).toBe('Strong success');
    expect(report.heroes.map((hero) => hero.heroId)).toEqual(party.heroIds);
    expect(report.when).toMatch(/^Year \d+ Day \d+, night$/);
    expect(report.reward).toEqual({ wealth: 180, fame: 4, xp: 60 });

    const [first, ...rest] = report.outcomes;
    expect(first?.heroId).toBe(party.heroIds[0]);
    expect(first?.name).toBe(nameOf(written, party.heroIds[0] as string));
    expect(first?.xp).toBe(60);
    expect(first?.levels).toEqual([2]);
    expect(first?.words).toEqual(['gained 60 XP', 'reached Level 2', 'Morale went from 60 to 65, steady']);
    for (const other of rest) expect(other.levels).toEqual([]);
  });

  test('a Level is matched by Hero and night (DL-112 item 2): a Party’s Hero’s on the night of the return is its; a Hero’s at home that night, and the Party’s Hero’s on another night, are not', () => {
    const document = base.document as WorldDocument;
    const guild = playerGuild(document.world);
    const home = guild?.rosterIds.find((heroId) => !Object.values(document.world.parties).some((party) => party.heroIds.includes(heroId)));
    if (home === undefined) throw new Error('no Hero at home');
    const written = withReturn(base, { band: 'success', xp: 30, levels: [{ hero: home, level: 3 }] });
    // The same Hero of the Party levels on the next night, as training at the Hall may bring them.
    const later = changed(written.state, (next) => {
      const heroId = written.party.heroIds[0] as HeroId;
      const levelled = { heroId, guildId: guild?.id, level: 2, statDeltas: {}, pointsLost: 0 };
      append(next.history, { turn: written.turn + 3, type: 'hero.levelled', participants: [heroId, guild?.id as never], labels: {}, milestone: true, payload: levelled });
    });

    for (const outcome of read({ ...written, state: later }).outcomes) expect(outcome.levels, outcome.name).toEqual([]);
    expect(read(written).outcomes.map((outcome) => outcome.heroId)).not.toContain(home);
  });

  test('a failure with an Injury: the Encounters in the History’s words, the Injury with the night it heals, and the Morale the return moved', () => {
    const turn = (base.document as WorldDocument).world.parties[Object.keys((base.document as WorldDocument).world.parties)[0] as never]?.returnsOnTurn ?? 0;
    const heals = turn + 60;
    const written = withReturn(base, {
      band: 'fail',
      fame: -2,
      xp: 10,
      encounters: [
        { encounterKey: 'ambush-on-the-road', outcome: 'success', degree: 'success' },
        { encounterKey: 'ambush-on-the-road', outcome: 'failure', degree: 'failure', injured: [1] },
      ],
      used: [{ definitionKey: 'whetstone', encounterIndex: 1 }],
      injuries: [{ hero: 1, typeKey: 'broken-arm', healsOnTurn: heals }],
      morale: [
        { hero: 0, cause: 'encounters', before: 50, after: 44, bandAfter: 'steady' },
        { hero: 1, cause: 'encounters', before: 52, after: 46, bandAfter: 'steady' },
      ],
    });
    const report = read(written);
    const [first, second] = written.party.heroIds.map((heroId) => nameOf(written, heroId));

    expect(report.band).toBe('fail');
    expect(report.bandWords).toBe('Failure');
    expect(report.reward).toEqual({ wealth: 0, fame: -2, xp: 10 });
    // Each at its Degree, decided by the Encounter's first Check, as withReturn writes it (DL-152, DL-247).
    const decider = content.encounters['ambush-on-the-road']?.checks[0]?.name;
    expect(report.encounters.map((encounter) => [encounter.outcome, encounter.degree, encounter.sentence, encounter.used.map((used) => used.sentence)])).toEqual([
      ['success', 'success', `The Lantern's Party came through Ambush on the road (Encounter 1), a Success, decided by ${decider}.`, []],
      [
        'failure',
        'failure',
        `The Lantern's Party failed at Ambush on the road (Encounter 2), a Failure, decided by ${decider}: ${second} was injured.`,
        ["The Lantern's Party used one Whetstone on Encounter 2: +2 to its Check."],
      ],
    ]);
    expect(report.used).toEqual([]);
    const [one, two] = report.outcomes;
    expect(one?.words).toEqual(['gained 10 XP', 'Morale went from 50 to 44, steady']);
    expect(one?.injury).toBeNull();
    expect(two?.injury).toEqual({ name: 'Broken arm', heals: nightOfTurn(heals, documentOf(written.state).meta.config) });
    expect(two?.words).toEqual(['gained 10 XP', 'Morale went from 52 to 46, steady', `injured: Broken arm, healing on ${nightOfTurn(heals, documentOf(written.state).meta.config)}`]);
    expect(first).not.toBe('');
  });

  test('a Death with its gear returned: the Hero who died, no XP, and their gear back to the Guild that night; the others’ Morale and Regard with each other', () => {
    const written = withReturn(base, {
      band: 'fail',
      fame: -3,
      xp: 5,
      encounters: [{ encounterKey: 'ambush-on-the-road', outcome: 'failure', died: [0] }],
      deaths: [0],
      morale: [{ hero: 1, cause: 'roster-death', before: 50, after: 40, bandAfter: 'steady' }],
      heroRegard: [{ hero: 1, mate: 2, bandBefore: 'neutral', bandAfter: 'warm' }],
      gear: [
        { hero: 0, definitionKey: 'short-sword', slot: 'weapon' },
        { hero: 0, definitionKey: 'padded-jack', slot: 'armour' },
      ],
    });
    const [dead, other, third] = read(written).outcomes;
    const mate = nameOf(written, written.party.heroIds[2] as string);

    expect(dead?.died).toBe(true);
    expect(dead?.xp).toBeNull();
    expect(dead?.gear).toEqual(['Short sword', 'Padded jack']);
    expect(dead?.words).toEqual(['died on the Quest', 'their Gear went back to The Lantern: Short sword and Padded jack']);
    expect(other?.died).toBe(false);
    expect(other?.gear).toEqual([]);
    expect(other?.regard).toEqual([{ heroId: written.party.heroIds[2], name: mate, bandBefore: 'neutral', bandAfter: 'warm' }]);
    expect(other?.words).toEqual(['gained 5 XP', 'Morale went from 50 to 40, steady', `Regard for ${mate} rose from neutral to warm`]);
    expect(third?.regard).toEqual([]);
  });

  test('what a Death cost the Heroes at home: one line, the Guild mourning the dead, and whose Morale fell by how much (DL-120 item 7)', () => {
    const document = base.document as WorldDocument;
    const guild = playerGuild(document.world);
    if (guild === undefined) throw new Error("no player's Guild");
    const party = Object.values(document.world.parties).flatMap((each) => each.heroIds);
    const home = guild.rosterIds.filter((heroId) => !party.includes(heroId));
    expect(home.length).toBeGreaterThan(0);
    const written = withReturn(base, {
      band: 'fail',
      encounters: [{ outcome: 'failure', died: [0] }],
      deaths: [0],
      morale: [
        // A Party mate's grief is in their own line, not at home's.
        { hero: 1, cause: 'roster-death', before: 50, after: 40, bandAfter: 'steady' },
        ...home.map((heroId) => ({ hero: heroId, cause: 'roster-death' as const, before: 40, after: 30, bandAfter: 'low' as const })),
      ],
    });
    const dead = nameOf(written, written.party.heroIds[0] as string);
    const report = read(written);
    const heroes = `${home.length} ${home.length === 1 ? 'Hero' : 'Heroes'}`;

    expect(report.home).toEqual({
      sentence: `At home: the Guild mourned ${dead}. Morale fell for ${heroes} (${home.length === 1 ? '−10' : '−10 each'}).`,
      heroesWords: `${heroes} at home`,
      heroes: home.map((heroId) => ({ heroId, name: nameOf(written, heroId), words: 'Morale went from 40 to 30, low' })),
    });
    expect(report.outcomes[1]?.words).toContain('Morale went from 50 to 40, steady');
    // The line follows the Heroes' outcomes, in their section.
    expect(reportSections(report).find((section) => section.kind === 'heroes')).toMatchObject({ home: report.home });
  });

  test('the Heroes at home: two Deaths cost each twice, a fall that differs is given as a span, and a return with no Death has no line', () => {
    // A second Hero at home, signed before the Party comes home.
    const [signing] = unattachedHeroes((base.document as WorldDocument).world);
    if (signing === undefined) throw new Error('no one in the pool');
    const more = played(withWealth(base, 5_000), { kind: 'recruit', heroId: signing.id });
    const document = more.document as WorldDocument;
    const guild = playerGuild(document.world);
    if (guild === undefined) throw new Error("no player's Guild");
    const party = Object.values(document.world.parties).flatMap((each) => each.heroIds);
    const [one, two] = guild.rosterIds.filter((heroId) => !party.includes(heroId));
    if (one === undefined || two === undefined) throw new Error('fewer than two Heroes at home');
    const written = withReturn(more, {
      band: 'fail',
      encounters: [{ outcome: 'failure', died: [0, 1] }],
      deaths: [0, 1],
      morale: [
        { hero: one, cause: 'roster-death', before: 40, after: 30, bandAfter: 'low' },
        { hero: two, cause: 'roster-death', before: 2, after: 0, bandAfter: 'wretched' },
        { hero: one, cause: 'roster-death', before: 30, after: 20, bandAfter: 'low' },
        { hero: two, cause: 'roster-death', before: 0, after: 0, bandAfter: 'wretched' },
      ],
    });
    const [first, second] = written.party.heroIds.map((heroId) => nameOf(written, heroId));

    expect(read(written).home?.sentence).toBe(`At home: the Guild mourned ${first} and ${second}. Morale fell for 2 Heroes (−2 to −20).`);
    expect(read(written).home?.heroes.map((hero) => hero.words)).toEqual(['Morale went from 40 to 20, low', 'Morale went from 2 to 0, wretched']);
    expect(read(withReturn(base, { band: 'success', wealth: 10, xp: 5 })).home).toBeNull();
  });

  test('a Hero away with another Party when the Death came is not at home: their grief is left out of the line (code review)', () => {
    const document = base.document as WorldDocument;
    const guild = playerGuild(document.world);
    if (guild === undefined) throw new Error("no player's Guild");
    const party = Object.values(document.world.parties).flatMap((each) => each.heroIds);
    const [away] = guild.rosterIds.filter((heroId) => !party.includes(heroId));
    if (away === undefined) throw new Error('no Hero at home');
    // Sent on another Quest before the Party comes home, and not back by then.
    const sent = changed(base, (changing) =>
      append(changing.history, {
        turn: changing.world.turn,
        type: 'quest.taken',
        participants: [makeId('quests', 9_001), makeId('parties', 9_001), away, guild.id],
        labels: {},
        milestone: false,
        payload: { questId: makeId('quests', 9_001), partyId: makeId('parties', 9_001), guildId: guild.id, heroIds: [away], returnsOnTurn: 99_999 },
      }),
    );
    const written = withReturn(sent, {
      band: 'fail',
      encounters: [{ outcome: 'failure', died: [0] }],
      deaths: [0],
      morale: [{ hero: away, cause: 'roster-death', before: 40, after: 30, bandAfter: 'low' }],
    });
    const dead = nameOf(written, written.party.heroIds[0] as string);

    expect(read(written).home).toEqual({ sentence: `At home: the Guild mourned ${dead}.`, heroesWords: '0 Heroes at home', heroes: [] });
  });

  test('a Loot: each Item found, by name and quantity, among the rewards', () => {
    const written = withReturn(base, { band: 'success', wealth: 120, fame: 2, xp: 40, loot: [{ definitionKey: 'whetstone', quantity: 3 }] });
    const one = withReturn(base, { band: 'success', wealth: 120, fame: 2, xp: 40, loot: [{ definitionKey: 'short-sword', quantity: 1 }] });

    expect(read(written).loot).toEqual(['3 × Whetstone']);
    expect(read(one).loot).toEqual(['Short sword']);
    expect(read(withReturn(base, { band: 'success' })).loot).toEqual([]);
  });

  test('two Parties home the same night for the same Patron: each has its own Regard line, the band it moved into or the band now', () => {
    // Two Quests of one Patron on the Board, made one length, each taken the same morning by two of the
    // Roster, so both Parties come home the same night and the engine plays both outcomes on it (DL-250).
    const drawn = started('two-home');
    const document = documentOf(drawn);
    const guild = playerGuild(document.world);
    if (guild === undefined) throw new Error("no player's Guild");
    const open = offeredQuests(document.world).filter(({ requirements }) => requirements.classKey === undefined && requirements.skillKey === undefined && requirements.partySizeMin <= 2);
    const pair = open.flatMap((quest) => open.filter((other) => other.id > quest.id && other.patronId === quest.patronId).map((other) => [quest, other]))[0];
    if (pair === undefined) throw new Error('no two Quests of one Patron on the Board');
    // As long as each other whatever Days their Tiers drew (DL-262).
    const game = changed(drawn, (next) => {
      const [one, other] = pair.map((quest) => next.world.quests[quest.id]);
      if (one === undefined || other === undefined) throw new Error('no Quests');
      other.durationTurns = one.durationTurns;
    });
    const sent = pair.reduce((state, quest, at) => played(state, { kind: 'dispatch', questId: quest.id, heroIds: guild.rosterIds.slice(2 * at, 2 * at + 2) }), game);
    if (sent.rejection !== null) throw new Error(`dispatch refused: ${sent.rejection.reason}`);
    const [firstId, secondId] = Object.keys(documentOf(sent).world.parties) as [PartyId, PartyId];
    const [first, second] = withReturns(sent, [
      { party: firstId, band: 'strong', wealth: 200, xp: 50, patronRegard: { bandBefore: 'neutral', bandAfter: 'warm' } },
      { party: secondId, band: 'success', wealth: 90, xp: 30 },
    ]);
    if (first === undefined || second === undefined) throw new Error('two returns');
    // The night's outcomes as the engine writes them, in Party id order.
    const night = documentOf(second.state).history.entries.filter((entry) => entry.turn === first.turn && entry.type === 'quest.resolved');
    expect(night.map((entry) => entry.participants[1])).toEqual([firstId, secondId]);
    // The Patron's Regard for the Guild now, a value in the warm band (`regardBands`: warm from 4, close from 12).
    const now = changed(second.state, (next) => {
      const patron = next.world.patrons[first.party.patronId];
      if (patron === undefined) throw new Error('no Patron');
      patron.regard[guild.id] = { value: 6, since: second.turn, reason: 'quest-success' };
    });
    const patron = document.world.patrons[first.party.patronId]?.name;

    const one = read({ ...first, state: now });
    const two = read({ ...second, state: now });
    expect(one.patronRegard).toEqual({
      patronId: first.party.patronId,
      name: patron,
      moved: { bandBefore: 'neutral', bandAfter: 'warm' },
      band: 'warm',
      sentence: `${patron}'s Regard for The Lantern rose from neutral to warm with this Quest.`,
    });
    expect(two.patronRegard).toEqual({
      patronId: first.party.patronId,
      name: patron,
      moved: null,
      band: 'warm',
      sentence: `${patron}'s Regard for The Lantern did not move into a new band with this Quest: it is warm now.`,
    });
    expect(two.heroes.map((hero) => hero.heroId)).toEqual(second.party.heroIds);
  });

  test('a return the engine played: every part is its History’s, read by the Quest', () => {
    const home = cameHomeState;
    const document = home.document as WorldDocument;
    const outcome = home.log.find((event): event is EngineEventOf<'quest.resolved'> => event.type === 'quest.resolved' && event.participants.includes(playerGuild(document.world)?.id as never));
    if (outcome === undefined) throw new Error('no return in the last play');
    const { questId, partyId, heroIds, xpPerHero, wealthDelta, fameDelta, deaths } = outcome.payload;
    const report = questReturn(document, { questId, partyId });
    const ofQuest = entriesFor(document.history, questId);

    expect(report?.reward).toEqual({ wealth: wealthDelta, fame: fameDelta, xp: xpPerHero });
    expect(report?.encounters).toHaveLength(ofQuest.filter((entry) => entry.type === 'quest.encounter').length);
    expect(report?.encounters.length).toBeGreaterThan(0);
    expect(report?.outcomes.map((each) => each.heroId)).toEqual(heroIds);
    for (const each of report?.outcomes ?? []) {
      const injured = ofQuest.find((entry) => entry.type === 'hero.injured' && (entry as EngineEventOf<'hero.injured'>).payload.heroId === each.heroId);
      expect(each.injury === null, each.name).toBe(injured === undefined);
      expect(each.xp).toBe(deaths.includes(each.heroId) ? null : xpPerHero);
      const moved = ofQuest.filter((entry) => entry.type === 'hero.morale-changed' && (entry as EngineEventOf<'hero.morale-changed'>).payload.heroId === each.heroId);
      expect(each.morale === null).toBe(moved.length === 0);
    }
    expect(report?.patronRegard?.band).toMatch(/^(hostile|cool|neutral|warm|close)$/);
    // Nothing is found for a Party that did not come home on the Quest.
    expect(questReturn(document, { questId, partyId: makeId('parties', 999) })).toBeNull();
  });
});

describe('the report’s sections (DL-112 item 8)', () => {
  test('come as typed sections in the plan’s order: the Quest, the Encounters, the rewards, the Heroes, the Patron', () => {
    const report = read(withReturn(base, { band: 'success', wealth: 100, xp: 20, encounters: [{ outcome: 'success' }], loot: [{ definitionKey: 'whetstone', quantity: 1 }] }));
    const sections = reportSections(report);

    expect(sections.map((section) => section.kind)).toEqual(['quest', 'encounters', 'rewards', 'heroes', 'patron']);
    expect(sections[2]).toEqual({ kind: 'rewards', wealth: 100, fame: 0, xp: 20, loot: ['Whetstone'] });
  });

  test('a section with nothing to say is left out, and the rest keep their order', () => {
    const report = read(withReturn(base, { band: 'success', wealth: 100, xp: 20 }));

    expect(reportSections(report).map((section) => section.kind)).toEqual(['quest', 'rewards', 'heroes', 'patron']);
    expect(reportSections({ ...report, patronRegard: null }).map((section) => section.kind)).toEqual(['quest', 'rewards', 'heroes']);
  });
});

describe('the return’s entry (DL-111 item 2)', () => {
  test('reads the History’s sentence, cut at the band so it can be bold; a line per Hero, their name one to open', () => {
    const written = withReturn(base, {
      band: 'strong',
      wealth: 180,
      fame: 4,
      xp: 60,
      encounters: [{ outcome: 'success' }],
      levels: [{ hero: 0, level: 2 }],
      loot: [{ definitionKey: 'whetstone', quantity: 2 }],
      morale: partyOut(base).heroIds.map((_, hero) => ({ hero, cause: 'strong-success' as const, before: 60, after: 65, bandAfter: 'steady' as const })),
    });
    const document = documentOf(written.state);
    const key = { partyId: written.party.partyId, questId: written.party.questId };
    const entry = returnEntry(document, key);
    const outcome = document.history.entries.find((each) => each.type === 'quest.resolved' && (each.payload as { partyId: string }).partyId === key.partyId);
    const [first, ...rest] = written.party.heroIds.map((heroId) => nameOf(written, heroId));

    expect(entry?.key).toEqual(key);
    expect(entry?.bandSaid).toBe('succeeded strongly');
    expect(`${textOf(entry?.lead ?? [])}${entry?.bandSaid}${textOf(entry?.rest ?? [])}`).toBe(narrateText(outcome as never, readingOf(document).narration));
    expect(textOf(entry?.rest ?? [])).toBe(': Wealth +180, Fame +4.');
    expect(entry?.heroesWords).toBe(`${written.party.heroIds.length} Heroes`);
    expect(entry?.heroes.map((hero) => hero.sentence)).toEqual([
      `${first}: gained 60 XP; reached Level 2; Morale went from 60 to 65, steady.`,
      ...rest.map((name) => `${name}: gained 60 XP; Morale went from 60 to 65, steady.`),
    ]);
    expect(entry?.heroes[0]?.segments[0]).toEqual({ kind: 'name', text: first, entityId: written.party.heroIds[0], table: 'heroes' });
  });
});

describe('the entry reads its Hero lines without building the whole report (DL-120 item 10)', () => {
  test('puts no Encounter or consumable in words, as the report does, and gives the report’s Hero lines', () => {
    const written = withReturn(base, {
      band: 'fail',
      encounters: [{ outcome: 'success' }, { outcome: 'failure', injured: [1] }],
      used: [{ definitionKey: 'healing-draught', heal: 1, days: 2 }],
      injuries: [{ hero: 1, typeKey: 'broken-arm', healsOnTurn: 9999 }],
    });
    const key = { partyId: written.party.partyId, questId: written.party.questId };
    const narrated = vi.mocked(narrateSegments);

    narrated.mockClear();
    const report = questReturn(documentOf(written.state), key);
    expect(narrated.mock.calls.length).toBeGreaterThan(0);

    narrated.mockClear();
    const entry = returnEntry(documentOf(written.state), key);
    expect(narrated.mock.calls).toHaveLength(0);
    expect(entry?.heroes.map((hero) => hero.sentence)).toEqual(report?.outcomes.map((outcome) => `${outcome.name}: ${outcome.words.join('; ')}.`));
  });

  test('reads the calendar once, however many Heroes were injured (DL-214)', () => {
    const written = withReturn(base, {
      band: 'fail',
      encounters: [{ outcome: 'failure', injured: [0, 1] }],
      injuries: [
        { hero: 0, typeKey: 'broken-arm', healsOnTurn: 9999 },
        { hero: 1, typeKey: 'deep-cut', healsOnTurn: 9999 },
      ],
    });
    const key = { partyId: written.party.partyId, questId: written.party.questId };
    const calendars = vi.mocked(calendarFor);

    calendars.mockClear();
    const entry = returnEntry(documentOf(written.state), key);
    expect(entry?.heroes.filter((hero) => hero.sentence.includes('healing on'))).toHaveLength(2);
    expect(calendars).toHaveBeenCalledTimes(1);
  });
});

describe('a Trait earned on the Quest (DL-148 items 25 and 27)', () => {
  test("is in the report's line of the Hero who earned it, and a Milestone that stands beside the return in the player's Guild's History", () => {
    const written = withReturn(base, {
      band: 'fail',
      encounters: [{ outcome: 'failure', injured: [1] }],
      injuries: [{ hero: 1, typeKey: 'deep-cut', healsOnTurn: 9999 }],
      traits: [{ hero: 1, traitKey: 'one-eyed', encounterIndex: 0 }],
    });
    const [first, second] = read(written).outcomes;
    expect(second?.trait).toBe(content.heroTraits['one-eyed']?.name);
    expect(second?.words).toContain(`earned the Trait ${content.heroTraits['one-eyed']?.name}`);
    expect(first?.trait).toBeNull();

    const after = documentOf(written.state);
    const guild = playerGuild(after.world);
    if (guild === undefined) throw new Error("no player's Guild");
    const night = after.history.entries.filter((entry) => entry.turn === written.turn && historyFilter(after, guild.id)(entry));
    expect(night.map((entry) => entry.type)).toEqual(['quest.resolved', 'hero.injured', 'hero.trait-gained']);
    expect(night.at(-1)?.milestone).toBe(true);
  });
});

describe('the player’s Guild’s History gathers a return’s parts under its entry (DL-113 item 1; DL-120 item 6)', () => {
  test('its Encounters, consumables, the dead’s gear, and its Heroes’ Levels that night; not a Level at home that night, nor the Loot; its Injuries and Deaths stand out beside it', () => {
    const document = base.document as WorldDocument;
    const guild = playerGuild(document.world);
    if (guild === undefined) throw new Error("no player's Guild");
    const home = guild.rosterIds.find((heroId) => !Object.values(document.world.parties).some((party) => party.heroIds.includes(heroId)));
    if (home === undefined) throw new Error('no Hero at home');
    const written = withReturn(base, {
      band: 'fail',
      encounters: [{ outcome: 'failure', injured: [1], died: [0] }],
      used: [{ definitionKey: 'healing-draught', heal: 1, days: 2 }],
      injuries: [{ hero: 1, typeKey: 'broken-arm', healsOnTurn: 9999 }],
      deaths: [0],
      loot: [{ definitionKey: 'whetstone', quantity: 1 }],
      levels: [
        { hero: 1, level: 2 },
        { hero: home, level: 4 },
      ],
      gear: [{ hero: 0, definitionKey: 'short-sword', slot: 'weapon' }],
    });
    const after = documentOf(written.state);
    const shows = historyFilter(after, guild.id);
    const night = after.history.entries.filter((entry) => entry.turn === written.turn);
    const shown = night.filter(shows).map((entry) => (entry.type === 'hero.levelled' ? `${entry.type} ${(entry.payload as { heroId: string }).heroId}` : entry.type));

    // The Injury and the Death stand out as entries of their own, next after the return and its Loot (DL-120 item 6).
    expect(shown).toEqual(['quest.resolved', 'quest.loot', 'hero.injured', 'hero.died', `hero.levelled ${home}`]);
    expect(night.filter((entry) => partOfAReturn(after.history, entry)).map((entry) => entry.type).sort()).toEqual(
      ['hero.levelled', 'item.expended', 'item.returned', 'quest.encounter'].sort(),
    );
  });
});

describe('returnsIn', () => {
  test("gives the player's Parties home in the last play, in the order they came home; no Rival's, and none when none came home", () => {
    const home = cameHomeState;
    const document = home.document as WorldDocument;
    const guildId = playerGuild(document.world)?.id;
    const outcomes = home.log.filter((event): event is EngineEventOf<'quest.resolved'> => event.type === 'quest.resolved');
    const mine = outcomes.filter((event) => event.payload.guildId === guildId).map(({ payload }) => ({ partyId: payload.partyId, questId: payload.questId }));

    expect(mine.length).toBeGreaterThan(0);
    expect(outcomes.length).toBeGreaterThan(mine.length);
    expect(returnsIn(home)).toEqual(mine);
    expect(returnsIn(base)).toEqual([]);
    expect(returnsIn({ ...home, log: [] })).toEqual([]);
    expect(returnsIn({ document: null, log: home.log })).toEqual([]);
  });
});

describe('withReturn tells only a return the rules give (DL-245 item 3)', () => {
  test('refuses a Morale change told that the engine does not write, and a second Loot', () => {
    // A Death's grief is the rules' −10, not −4; a strong success's +5 is not a success's.
    const grief = { hero: 1, cause: 'roster-death', before: 50, after: 46, bandAfter: 'steady' } as const;
    expect(() => withReturn(base, { band: 'fail', encounters: [{ outcome: 'failure', died: [0] }], deaths: [0], morale: [grief] })).toThrow('the engine wrote no roster-death Morale change');
    const cheer = { hero: 0, cause: 'strong-success', before: 60, after: 65, bandAfter: 'steady' } as const;
    expect(() => withReturn(base, { band: 'success', morale: [cheer] })).toThrow('the engine wrote no strong-success Morale change');
    expect(() => withReturn(base, { band: 'strong', morale: [cheer] })).not.toThrow();
    const two = [{ definitionKey: 'whetstone', quantity: 1 }, { definitionKey: 'short-sword', quantity: 1 }] as const;
    expect(() => withReturn(base, { band: 'success', loot: two })).toThrow('a Quest draws one Loot');
  });
});
