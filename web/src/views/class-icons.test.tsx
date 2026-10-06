import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { content } from '../content';
import { started } from '../state/game.test-support';
import { classIcons } from '../state/names';
import { ClassMark } from './icons';
import { rosterList, section } from './page.test-support';

// The Class icon before a Hero's name (v1.1.7-S6, DL-206 items 22 to 24, DL-212): one name element,
// in the five places a Hero is listed with their Class, hidden from assistive technology, its tooltip
// the Class's name, the Class's name kept in words where it stood.

afterEach(cleanup);

const classNames = ['Warrior', 'Rogue', 'Mage', 'Healer'];

/** A drawing's strokes and turns, in order: what tells one drawing from another. */
function strokesOf(scope: Element): (string | null)[] {
  return [...scope.querySelectorAll('path, g')].map((element) => element.getAttribute('d') ?? element.getAttribute('transform'));
}

/** The strokes of the drawing the content gives the Class named `name`: its icon's, or the plain mark's. */
function drawingOf(name: string): (string | null)[] {
  const found = Object.values(content.classes).find((it) => it.name === name);
  if (found === undefined) throw new Error(`no Class named ${name}`);
  const icon = found.icon === undefined ? null : (classIcons as readonly string[]).includes(found.icon) ? (found.icon as (typeof classIcons)[number]) : null;
  const box = document.createElement('div');
  box.innerHTML = renderToStaticMarkup(<ClassMark icon={icon} className={name} />);
  return strokesOf(box);
}

/** The marks inside `scope`. */
function marks(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>('.class-mark')];
}

/** The Classes the marks in `scope` name, in order, each mark hidden from assistive technology and drawing its Class's icon. */
function classesShown(scope: HTMLElement): string[] {
  const shown = marks(scope);
  expect(shown.length).toBeGreaterThan(0);
  return shown.map((mark) => {
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
    expect(mark.querySelectorAll('path').length).toBeGreaterThan(0);
    const title = mark.getAttribute('title') ?? '';
    expect(classNames).toContain(title);
    expect(strokesOf(mark), `the mark of a ${title}`).toEqual(drawingOf(title));
    return title;
  });
}

function first<Item>(items: readonly Item[]): Item {
  const [item] = items;
  if (item === undefined) throw new Error('an empty list');
  return item;
}

describe('the five places a Hero is listed with their Class', () => {
  test("the Roster's tiles: the mark before the name, the Class's name in the line as before", () => {
    render(<App initial={started()} />);
    const cards = within(rosterList()).getAllByRole('listitem');
    expect(cards.length).toBeGreaterThan(2);
    for (const card of cards) {
      const Class = first(classesShown(card));
      expect(card.textContent).toContain(`${Class} · Level`);
      // Before the name, in one element with it, inside the name's button; the mark and the name's
      // first word one unit, which never parts (the owner's (b), DL-212).
      const mark = first(marks(card));
      const name = within(card).getByRole('button');
      expect(mark.closest('button')).toBe(name);
      expect(name.querySelector('.hero-name')?.firstElementChild?.firstElementChild).toBe(mark);
      expect(mark.parentElement?.textContent).toBe(name.textContent?.split(' ')[0]);
      expect(name.textContent).toBe(name.textContent?.trim());
    }
  });

  test("the Roster's table", () => {
    render(<App initial={started()} />);
    fireEvent.click(within(within(section('Roster')).getByRole('group', { name: 'Show the Roster as' })).getByRole('button', { name: 'Table' }));
    const table = within(section('Roster')).getByRole('table', { name: 'Heroes on the Roster' });
    for (const row of within(table).getAllByTestId('roster-row')) {
      const Class = first(classesShown(within(row).getByRole('rowheader')));
      expect(within(row).getByRole('cell', { name: Class })).toBeDefined();
    }
  });

  test('the Unattached pool', () => {
    render(<App initial={started()} />);
    for (const row of within(section('Unattached pool')).getAllByTestId('pool-row')) {
      const Class = first(classesShown(within(row).getByRole('rowheader')));
      expect(within(row).getByRole('cell', { name: Class })).toBeDefined();
    }
  });

  test("the Board's Party builder", () => {
    render(<App initial={started()} />);
    const card = first(within(section('Board')).getAllByRole('article'));
    fireEvent.click(within(card).getByRole('button', { name: 'Choose a Party' }));
    for (const row of within(within(card).getByRole('form')).getAllByTestId('party-row')) {
      const Class = first(classesShown(row));
      expect(row.querySelector('.party-row__class')?.textContent).toMatch(new RegExp(`^${Class}, Level \\d+$`));
      // The name's own element holds the name alone.
      expect(row.querySelector('.party-row__name')?.textContent).not.toMatch(/Warrior|Rogue|Mage|Healer/);
    }
  });

  test("a Hero's page's heading", () => {
    render(<App initial={started()} />);
    fireEvent.click(first(within(rosterList()).getAllByRole('button')));
    const page = within(section('Roster')).getByRole('article');
    const heading = within(page).getByRole('heading', { level: 3 });
    const Class = first(classesShown(heading));
    expect(within(page).getByText(new RegExp(`^${Class} · Level`))).toBeDefined();
    // The heading's own words are the name alone.
    expect(heading.textContent).not.toMatch(/^(Warrior|Rogue|Mage|Healer)/);
  });

  test("a Rival's Roster", () => {
    render(<App initial={started()} />);
    fireEvent.click(within(section('Guilds')).getByRole('button', { name: 'Open The Ashford Guild' }));
    const page = within(section('Guilds')).getByRole('article');
    for (const row of within(page).getAllByTestId('guild-hero')) {
      const Class = first(classesShown(within(row).getByRole('rowheader')));
      expect(within(row).getByRole('cell', { name: Class })).toBeDefined();
    }
  });

  test("a mark is out of the accessibility tree: the Hero's button is named for the Hero alone", () => {
    render(<App initial={started()} />);
    expect(first(within(rosterList()).getAllByRole('button')).textContent).not.toMatch(/Warrior|Rogue|Mage|Healer/);
    for (const name of classNames) {
      for (const found of screen.queryAllByTitle(name)) expect(found.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('the mark in light and dark', () => {
  const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');

  /** Every declaration block whose selector names the mark. */
  const rules = [...css.matchAll(/([^{}]*\.class-mark[^{}]*)\{([^}]*)\}/g)].map((found) => ({ selector: (found[1] ?? '').trim(), body: found[2] ?? '' }));

  test('it has a style, and sets no colour of its own: the strokes are the text colour, whose contrast styles.test.ts holds in both schemes', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const { selector, body } of rules) {
      expect(body, selector).not.toMatch(/(^|[;\s])(color|stroke|fill|opacity)\s*:/);
    }
  });

  test('every drawing strokes with currentColor and fills nothing, with no colour written in it', () => {
    render(<App initial={started()} />);
    rosterList();
    const drawn = [...document.querySelectorAll('.class-mark svg')];
    expect(drawn.length).toBeGreaterThan(0);
    for (const svg of drawn) {
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('fill')).toBe('none');
      expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,6}|rgb|hsl/i);
    }
  });

  test('the four shipped Classes name four different drawings of the set', () => {
    const shipped = Object.values(content.classes);
    expect(shipped.map((it) => it.icon).filter((icon) => icon !== undefined && (classIcons as readonly string[]).includes(icon))).toHaveLength(4);
    expect(new Set(shipped.map((it) => drawingOf(it.name).join())).size).toBe(4);
  });
});
