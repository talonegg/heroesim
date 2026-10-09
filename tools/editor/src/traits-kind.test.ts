import { describe, expect, test } from 'vitest';
import { readContentFiles } from './content-files.js';
import { root } from './test-support.js';
import { traitsKind } from './traits-kind.js';

// The forms of a Trait's effects, which the editor's page offers, derive from content's description of
// each effect kind's fields (DL-243): its label, and each field's label, type, choices and whether it
// may be left out. A change to the description is a change to these forms.

describe("the effects' forms", () => {
  test("offer each effect kind as content describes it, each field's choices read from content", () => {
    const content = readContentFiles(root).values;
    const stats = content['stats.json'] as Record<string, { owner: string }>;
    const heroStats = Object.keys(stats).filter((key) => stats[key]?.owner === 'hero');
    const classes = Object.keys(content['classes.json'] as object);

    expect(traitsKind.forms(content).map((form) => [form.list, form.effects])).toEqual([
      [
        'guildmaster',
        [
          {
            kind: 'classStatBonus',
            label: 'A Class Stat bonus',
            fields: [
              { name: 'classKey', label: 'Class', type: 'choice', choices: classes },
              { name: 'statKey', label: 'Stat', type: 'choice', choices: heroStats },
              { name: 'delta', label: 'By', type: 'integer' },
            ],
          },
          { kind: 'guildMoraleShift', label: 'A Morale shift', fields: [{ name: 'delta', label: 'By', type: 'number' }] },
          { kind: 'upkeepFactor', label: 'An Upkeep factor', fields: [{ name: 'factor', label: 'Times', type: 'number' }] },
        ],
      ],
      [
        'hero',
        [
          { kind: 'statModifiers', label: 'Stat changes', fields: [{ name: 'modifiers', label: 'Stats', type: 'stat-changes', choices: heroStats }] },
          {
            kind: 'encounterBonus',
            label: 'An Encounter bonus',
            fields: [
              { name: 'flat', label: 'Bonus', type: 'number' },
              { name: 'kinds', label: 'Encounter kinds', type: 'choices', choices: ['combat', 'travel', 'social', 'arcane', 'stealth', 'lore'], optional: true },
              { name: 'tags', label: 'Encounter tags', type: 'tags', optional: true },
            ],
          },
        ],
      ],
    ]);
    expect(heroStats.length).toBeGreaterThan(0);
    expect(classes).toContain('warrior');
  });
});
