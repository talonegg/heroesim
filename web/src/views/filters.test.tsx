import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import type { Facets } from '../state/facets';
import { FilterChips, OneChoice, useFacets } from './ui';

// The page's one filter element and its one-choice switch (v1.1.7-S7, DL-206 items 26 to 29,
// DL-213): "All" pressed when no option is, pressing it clearing them; an option toggling; every
// option pressed reading as "All"; beside each option the count of what it would show with the other
// filters as they are, an option at 0 greyed; each chip a toggle button. The switch is a choice of one.

afterEach(cleanup);

interface Thing {
  name: string;
  colour: 'red' | 'blue' | 'green';
  size: 'small' | 'large';
}

const things: readonly Thing[] = [
  { name: 'Ash', colour: 'red', size: 'small' },
  { name: 'Birch', colour: 'red', size: 'large' },
  { name: 'Cedar', colour: 'blue', size: 'small' },
  { name: 'Damson', colour: 'blue', size: 'small' },
  { name: 'Elm', colour: 'green', size: 'large' },
];

const facets: Facets<Thing, 'colour' | 'size'> = {
  colour: {
    label: 'Show of colour',
    options: [
      { key: 'red', label: 'Red' },
      { key: 'blue', label: 'Blue' },
      { key: 'green', label: 'Green' },
    ],
    of: (thing) => thing.colour,
  },
  size: {
    label: 'Show of size',
    options: [
      { key: 'small', label: 'Small' },
      { key: 'large', label: 'Large' },
    ],
    of: (thing) => thing.size,
  },
};

/** Two filters over the things, and the things they show. */
function Things() {
  const { rows, filters } = useFacets(things, facets);
  return (
    <>
      <FilterChips {...filters.colour} />
      <FilterChips {...filters.size} />
      <ul aria-label="Things">
        {rows.map((thing) => (
          <li key={thing.name}>{thing.name}</li>
        ))}
      </ul>
    </>
  );
}

const group = (name: string): HTMLElement => screen.getByRole('group', { name });
const colours = (): HTMLElement => group('Show of colour');
const sizes = (): HTMLElement => group('Show of size');
const chip = (scope: HTMLElement, name: string): HTMLElement => within(scope).getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) });
const pressed = (scope: HTMLElement): string[] =>
  within(scope)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent ?? '');
const shown = (): string[] => within(screen.getByRole('list', { name: 'Things' })).queryAllByRole('listitem').map((item) => item.textContent ?? '');
/** Each chip's words, its count after its name. */
const words = (scope: HTMLElement): string[] => within(scope).getAllByRole('button').map((button) => button.textContent ?? '');

describe('FilterChips, the one filter element', () => {
  test('opens with All pressed and every row shown, each option a toggle button with its count', () => {
    render(<Things />);
    expect(words(colours())).toEqual(['All', 'Red 2', 'Blue 2', 'Green 1']);
    expect(pressed(colours())).toEqual(['All']);
    for (const button of within(colours()).getAllByRole('button')) {
      expect(button.getAttribute('aria-pressed')).toMatch(/^(true|false)$/);
      expect(button.getAttribute('type')).toBe('button');
    }
    expect(shown()).toEqual(['Ash', 'Birch', 'Cedar', 'Damson', 'Elm']);
  });

  test('an option pressed shows its rows and lets go of All; a second shows either; pressed again, let go', () => {
    render(<Things />);
    fireEvent.click(chip(colours(), 'Blue'));
    expect(pressed(colours())).toEqual(['Blue 2']);
    expect(shown()).toEqual(['Cedar', 'Damson']);

    fireEvent.click(chip(colours(), 'Green'));
    expect(pressed(colours())).toEqual(['Blue 2', 'Green 1']);
    expect(shown()).toEqual(['Cedar', 'Damson', 'Elm']);

    fireEvent.click(chip(colours(), 'Blue'));
    expect(pressed(colours())).toEqual(['Green 1']);
    expect(shown()).toEqual(['Elm']);

    // The last let go: All again.
    fireEvent.click(chip(colours(), 'Green'));
    expect(pressed(colours())).toEqual(['All']);
    expect(shown()).toHaveLength(5);
  });

  test('All pressed clears every option chosen', () => {
    render(<Things />);
    fireEvent.click(chip(colours(), 'Red'));
    fireEvent.click(chip(colours(), 'Green'));
    fireEvent.click(within(colours()).getByRole('button', { name: 'All' }));
    expect(pressed(colours())).toEqual(['All']);
    expect(shown()).toHaveLength(5);
  });

  test('every option pressed reads as All', () => {
    render(<Things />);
    fireEvent.click(chip(sizes(), 'Small'));
    fireEvent.click(chip(sizes(), 'Large'));
    expect(pressed(sizes())).toEqual(['All']);
    expect(shown()).toHaveLength(5);
    fireEvent.click(chip(colours(), 'Red'));
    fireEvent.click(chip(colours(), 'Blue'));
    fireEvent.click(chip(colours(), 'Green'));
    expect(pressed(colours())).toEqual(['All']);
  });

  test("each option's count is what it would show with the other filters as they are", () => {
    render(<Things />);
    fireEvent.click(chip(sizes(), 'Small'));
    // Colours counted among the small; sizes still all of them, nothing chosen of colour.
    expect(words(colours())).toEqual(['All', 'Red 1', 'Blue 2', 'Green 0']);
    expect(words(sizes())).toEqual(['All', 'Small 3', 'Large 2']);

    fireEvent.click(chip(colours(), 'Red'));
    // A filter's own choice does not narrow its own counts; sizes now among the red.
    expect(words(colours())).toEqual(['All', 'Red 1', 'Blue 2', 'Green 0']);
    expect(words(sizes())).toEqual(['All', 'Small 1', 'Large 1']);
    expect(shown()).toEqual(['Ash']);
  });

  test('an option at 0 is greyed, and still a toggle a player can press, and press again to let go', () => {
    render(<Things />);
    fireEvent.click(chip(sizes(), 'Small'));
    const green = chip(colours(), 'Green');
    expect(green.textContent).toBe('Green 0');
    expect(green.classList.contains('is-empty')).toBe(true);
    expect(chip(colours(), 'Blue').classList.contains('is-empty')).toBe(false);
    expect(within(colours()).getByRole('button', { name: 'All' }).classList.contains('is-empty')).toBe(false);
    expect((green as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(green);
    expect(green.getAttribute('aria-pressed')).toBe('true');
    expect(shown()).toEqual([]);
    fireEvent.click(green);
    expect(shown()).toEqual(['Ash', 'Cedar', 'Damson']);
  });

  test('by keyboard: every chip a button in the Tab order, the keyboard kept on a chip as it is pressed', () => {
    render(<Things />);
    for (const button of within(colours()).getAllByRole('button')) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.hasAttribute('tabindex')).toBe(false);
    }
    const blue = chip(colours(), 'Blue');
    blue.focus();
    // A button's Enter and Space press it as a click does.
    fireEvent.click(blue);
    expect(document.activeElement).toBe(blue);
    expect(chip(colours(), 'Blue')).toBe(blue);
    expect(blue.getAttribute('aria-pressed')).toBe('true');
  });

  test('draws nothing for a filter of one option or none', () => {
    const { container } = render(<FilterChips label="Show of one" options={[{ key: 'one', label: 'One', count: 3 }]} chosen={[]} onChoose={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });
});

/** The switch over three views, and the view chosen. */
function Views() {
  const [view, setView] = useState<'tiles' | 'table' | 'list'>('tiles');
  return (
    <>
      <OneChoice
        label="Show as"
        options={[
          { key: 'tiles', label: 'Tiles' },
          { key: 'table', label: 'Table' },
          { key: 'list', label: 'List' },
        ]}
        chosen={view}
        onChoose={setView}
      />
      <p data-testid="view">{view}</p>
    </>
  );
}

describe('OneChoice, a switch of one choice in the same look', () => {
  const radios = (): HTMLElement[] => within(screen.getByRole('radiogroup', { name: 'Show as' })).getAllByRole('radio');
  const checked = (): string[] => radios().filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.textContent ?? '');

  test('is announced as a choice of one: a radio group, each choice a radio, the one chosen checked', () => {
    render(<Views />);
    expect(radios().map((radio) => radio.textContent)).toEqual(['Tiles', 'Table', 'List']);
    expect(checked()).toEqual(['Tiles']);
    for (const radio of radios()) {
      expect(radio.tagName).toBe('BUTTON');
      expect(radio.className).toBe('filter');
      expect(radio.hasAttribute('aria-pressed')).toBe(false);
    }
  });

  test('a choice pressed is the one chosen, and pressed again stays so', () => {
    render(<Views />);
    fireEvent.click(within(screen.getByRole('radiogroup')).getByRole('radio', { name: 'Table' }));
    expect(checked()).toEqual(['Table']);
    expect(screen.getByTestId('view').textContent).toBe('table');
    fireEvent.click(within(screen.getByRole('radiogroup')).getByRole('radio', { name: 'Table' }));
    expect(checked()).toEqual(['Table']);
  });

  test('by keyboard: the chosen alone in the Tab order; the arrow keys, Home and End choose and take the keyboard', () => {
    render(<Views />);
    expect(radios().map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
    const [tiles] = radios();
    tiles?.focus();

    fireEvent.keyDown(tiles as HTMLElement, { key: 'ArrowRight' });
    expect(checked()).toEqual(['Table']);
    expect(document.activeElement?.textContent).toBe('Table');
    expect(radios().map((radio) => radio.tabIndex)).toEqual([-1, 0, -1]);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(checked()).toEqual(['List']);
    // Past the last, round to the first; and back.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    expect(checked()).toEqual(['Tiles']);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    expect(checked()).toEqual(['List']);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    expect(checked()).toEqual(['Table']);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    expect(checked()).toEqual(['Tiles']);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'End' });
    expect(checked()).toEqual(['List']);
    expect(document.activeElement?.textContent).toBe('List');
    // Any other key leaves it be.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'a' });
    expect(checked()).toEqual(['List']);
  });
});
