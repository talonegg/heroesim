import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { changed, started, withPartyOut, withReturn, type ReturnTold, type Written } from '../state/game.test-support';
import { questReturn, type QuestReturn } from '../state/quest-return';
import { QuestReport } from './quest-report';

// The Quest report (M9-F5, DL-111 item 3, DL-112 item 8): a list of typed sections, in order, each
// drawn only when it has something to say; the Patron's Regard for the Guild, the band this Quest
// moved it into or its band now.

afterEach(cleanup);

const base = withPartyOut(started('quest-report'));

function reportOf(written: Written): QuestReturn {
  const document = written.state.document;
  if (document === null) throw new Error('no game in hand');
  const report = questReturn(document, { partyId: written.party.partyId, questId: written.party.questId });
  if (report === null) throw new Error('no return');
  return report;
}

function drawn(told: ReturnTold): { report: QuestReturn; region: HTMLElement } {
  const report = reportOf(withReturn(base, told));
  render(<QuestReport report={report} />);
  return { report, region: screen.getByRole('region', { name: `Quest report: ${report.quest}` }) };
}

/** The section headings under the report's title, in the order drawn. */
function sectionHeadings(region: HTMLElement): string[] {
  return within(region)
    .getAllByRole('heading', { level: 4 })
    .map((heading) => heading.textContent ?? '');
}

describe('the Quest report (M9-F5)', () => {
  test('after the Heroes’ outcomes, one line says what a Death cost the Heroes at home, their names behind a disclosure (M9-F7, DL-120 item 7)', () => {
    const document = base.document;
    if (document === null) throw new Error('no game in hand');
    const party = Object.values(document.world.parties).flatMap((each) => each.heroIds);
    const guild = Object.values(document.world.guilds).find((each) => each.controller.kind === 'player');
    const [home] = guild?.rosterIds.filter((heroId) => !party.includes(heroId)) ?? [];
    if (home === undefined) throw new Error('no Hero at home');
    const { report, region } = drawn({
      band: 'fail',
      encounters: [{ outcome: 'failure', died: [0] }],
      deaths: [0],
      morale: [{ hero: home, cause: 'roster-death', before: 40, after: 36, bandAfter: 'steady' }],
    });
    const heroes = within(region).getByRole('heading', { level: 4, name: 'Heroes' }).parentElement as HTMLElement;
    const [dead] = report.outcomes;
    const name = document.world.heroes[home]?.name ?? '';

    const line = within(heroes).getByText(`At home: the Guild mourned ${dead?.name}. Morale fell for 1 Hero (−4).`);
    // After the Heroes' outcomes.
    const outcomes = heroes.querySelector('.report__heroes') as HTMLElement;
    expect(outcomes.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The names behind a disclosure, closed until opened.
    const disclosure = heroes.querySelector('details') as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(within(disclosure).getByText('1 Hero at home')).toBeDefined();
    fireEvent.click(within(disclosure).getByText('1 Hero at home'));
    expect(within(disclosure).getByRole('listitem').textContent).toBe(`${name}: Morale went from 40 to 36, steady.`);
  });

  test('no line for the Heroes at home when no Hero died (M9-F7)', () => {
    const { region } = drawn({ band: 'success', wealth: 10, xp: 5 });
    expect(within(region).queryByText(/^At home: /)).toBeNull();
    expect(region.querySelector('.report__section details')).toBeNull();
  });

  test('its sections come in order: the Quest with its Patron and band, the Encounters, the rewards, each Hero, the Patron', () => {
    const { report, region } = drawn({
      band: 'strong',
      wealth: 180,
      fame: 4,
      xp: 60,
      encounters: [{ encounterKey: 'ambush-on-the-road', outcome: 'success', degree: 'triumph' }],
      loot: [{ definitionKey: 'whetstone', quantity: 3 }],
      levels: [{ hero: 0, level: 2 }],
    });

    expect(within(region).getByRole('heading', { level: 3 }).textContent).toBe(`Quest report: ${report.quest}`);
    expect(sectionHeadings(region)).toEqual(['Encounters', 'Rewards', 'Heroes', 'The Patron']);
    expect(region.textContent).toContain('Strong success');
    expect(region.textContent).toContain(`Offered by ${report.patron?.name}`);
    // v1.1.4-S2: the Encounter's Degree, in its sentence.
    expect(within(region).getByText("The Lantern's Party came through Ambush on the road (Encounter 1), a Triumph.")).toBeDefined();
    expect(within(region).getByText('Wealth +180')).toBeDefined();
    expect(within(region).getByText('Fame +4')).toBeDefined();
    expect(within(region).getByText('XP +60 each')).toBeDefined();
    expect(within(region).getByText('Loot: 3 × Whetstone')).toBeDefined();
    const [first] = report.outcomes;
    const hero = within(region).getByRole('listitem', { name: first?.name ?? '' });
    expect(within(hero).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Gained 60 XP', 'Reached Level 2']);
  });

  test('a section with nothing to say is not drawn, and leaves no gap: no heading, no empty list', () => {
    const { region } = drawn({ band: 'success', wealth: 90, xp: 20 });

    expect(sectionHeadings(region)).toEqual(['Rewards', 'Heroes', 'The Patron']);
    expect(within(region).getByText('No Loot')).toBeDefined();
    for (const list of Array.from(region.querySelectorAll('ol, ul'))) expect(list.children.length, list.outerHTML).toBeGreaterThan(0);
  });

  test('says the Patron’s Regard for the Guild moved into a new band with this Quest, or gives its band now', () => {
    const { region } = drawn({ band: 'success', patronRegard: { bandBefore: 'neutral', bandAfter: 'warm' } });
    const patron = within(region).getByRole('heading', { level: 4, name: 'The Patron' }).parentElement as HTMLElement;
    expect(patron.textContent).toMatch(/^The Patron.+'s Regard for The Lantern rose from neutral to warm with this Quest\.$/);
    cleanup();

    const written = withReturn(base, { band: 'fail' });
    const cool = changed(written.state, (document, player) => {
      const patron = document.world.patrons[written.party.patronId];
      if (patron !== undefined) patron.regard[player.id] = { value: -12, since: written.turn, reason: 'quest-failure' };
    });
    const report = reportOf({ ...written, state: cool });
    render(<QuestReport report={report} />);
    expect(screen.getByText(`${report.patron?.name}'s Regard for The Lantern did not move into a new band with this Quest: it is cool now.`)).toBeDefined();
  });

  test('an older report has a way to close it', () => {
    const report = reportOf(withReturn(base, { band: 'success' }));
    const onClose = vi.fn();
    render(<QuestReport report={report} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close the report' }));
    expect(onClose).toHaveBeenCalledOnce();
    cleanup();
    render(<QuestReport report={report} />);
    expect(screen.queryByRole('button', { name: 'Close the report' })).toBeNull();
  });

  test('tells two Heroes of one name apart: each is a line of their own (the M9 review)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The Party's first two Heroes given one name: a Hero's name is not unique (`drawPersonName`).
    const named = changed(base, (document) => {
      const party = Object.values(document.world.parties)[0];
      for (const heroId of party?.heroIds.slice(0, 2) ?? []) {
        const hero = document.world.heroes[heroId];
        if (hero !== undefined) hero.name = 'Finn Grimshaw';
      }
    });
    const report = reportOf(withReturn(named, { band: 'fail', deaths: [0], injuries: [{ hero: 1, typeKey: 'bruised-ribs', healsOnTurn: 999 }] }));
    render(<QuestReport report={report} />);

    const heroes = screen.getAllByRole('listitem', { name: 'Finn Grimshaw' });
    expect(heroes).toHaveLength(2);
    expect(heroes[0]?.textContent).toContain('Died on the Quest');
    expect(heroes[1]?.textContent).toContain('Injured: Bruised ribs');
    // React says so when two lines share a key: none do.
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    errors.mockRestore();
  });
});
