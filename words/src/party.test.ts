import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import type { ConsumableReach } from '@heroesim/engine';
import { formEffectWords, reliefWords } from './party.js';

// DL-289: the words about a proposed Party that the page's builder and the CLI's `preview` share: its
// form line (one table, in place of the two copies the page and the CLI each held) and what relieves
// the hurt.

const content = loadContent();

const heal = (name: string, quantity: number): Pick<ConsumableReach, 'quantity' | 'consumable'> => ({
  quantity,
  consumable: { kind: 'consumable', name, effect: { kind: 'heal', days: 5 } } as unknown as ConsumableReach['consumable'],
});
const bonus = (name: string): Pick<ConsumableReach, 'quantity' | 'consumable'> => ({
  quantity: 1,
  consumable: { kind: 'consumable', name, effect: { kind: 'bonus', kinds: ['combat'], amount: 2 } } as unknown as ConsumableReach['consumable'],
});

describe("a Party's form line", () => {
  test('says each effect once, for the page and the CLI alike', () => {
    expect(formEffectWords).toEqual({
      raises: 'Raises the odds',
      none: 'Makes no difference',
      'lowers-a-little': 'Lowers the odds a little',
      'lowers-badly': 'Lowers the odds badly',
    });
  });
});

describe('what relieves the hurt', () => {
  const warrior = { name: 'Brenna Ashcombe', classKey: 'warrior' };
  const healer = { name: 'Odo Thistle', classKey: 'healer' };
  const otherHealer = { name: 'Wynn Marsh', classKey: 'healer' };

  test('names a Healer in the Party and the heal Items carried', () => {
    expect(reliefWords([warrior, healer], [heal('Healing draught', 2)], content)).toEqual([
      'Healer in the Party: Odo Thistle, who eases the hurt of the others.',
      'Heal Items carried: Healing draught ×2, spent at an Injury taken on the Quest.',
    ]);
  });

  test('says so when there is no Healer and no heal Item', () => {
    expect(reliefWords([warrior], [], content)).toEqual(['Healer in the Party: none.', 'Heal Items carried: none.']);
  });

  test('lists several Healers and several heal Items, and leaves a bonus out', () => {
    expect(reliefWords([healer, warrior, otherHealer], [heal('Healing draught', 1), bonus('Whetstone'), heal("Physician's kit", 1)], content)).toEqual([
      'Healer in the Party: Odo Thistle and Wynn Marsh, who ease the hurt of the others.',
      "Heal Items carried: Healing draught ×1 and Physician's kit ×1, spent at an Injury taken on the Quest.",
    ]);
  });

  test('a consumable that is no heal, or a key content lacks, relieves nothing', () => {
    expect(reliefWords([warrior], [bonus('Whetstone'), { quantity: 1, consumable: undefined }], content)).toEqual(['Healer in the Party: none.', 'Heal Items carried: none.']);
  });

  test('names no Healer line where content marks no Class as relieving the hurt', () => {
    const unmarked = { ...content, classes: Object.fromEntries(Object.entries(content.classes).map(([key, row]) => [key, { ...row, relievesHurt: false }])) };

    expect(reliefWords([healer], [heal('Healing draught', 1)], unmarked)).toEqual(['Heal Items carried: Healing draught ×1, spent at an Injury taken on the Quest.']);
  });

  test('names a Class content marks, whatever its name', () => {
    const marked = { ...content, classes: { ...content.classes, warrior: { ...content.classes.warrior!, relievesHurt: true } } };

    expect(reliefWords([warrior], [], marked)).toEqual(['Warrior or Healer in the Party: Brenna Ashcombe, who eases the hurt of the others.', 'Heal Items carried: none.']);
  });
});
