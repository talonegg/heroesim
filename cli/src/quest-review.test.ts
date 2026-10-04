import { join } from 'node:path';
import { contentDir, loadContent, loadDrafts } from '@heroesim/content/node';
import { degrees, encounterKinds, type Encounter } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { consequenceWords, passWords, reviewPage, type ReviewCalibration, type ReviewCell } from './quest-review.js';

// v1.1.4-S9 (DL-162): the review page of the drafts, for the owner (DL-148 item 30), made from the
// drafts, a calibration and the notes. `npm run quest-review` writes docs/quests/v1.1.4-review.html.

const core = loadContent();
const { content } = loadDrafts(join(contentDir, '..', 'docs', 'quests', 'drafts'));
const settings = { levels: [1, 5, 10], sizes: [1, 2, 3], difficulties: [20, 60], parties: 4, questsPerTemplate: 2, roster: 8, spotSeeds: 100, spotSamples: 2 };
const cells = (): ReviewCell[] =>
  settings.levels.flatMap((level) => settings.sizes.flatMap((size) => settings.difficulties.map((difficulty) => ({ level, size, difficulty, degrees: { failure: 0.1, setback: 0.2, success: 0.4, triumph: 0.3 } }))));
const calibration: ReviewCalibration = {
  settings,
  encounters: Object.values(content.encounters).map((it) => ({ key: it.key, cells: cells(), checks: it.checks.map((check) => ({ key: check.key, adds: [], cells: cells() })) })),
  templates: Object.values(content.questTemplates).map((it) => ({
    key: it.key,
    rows: [{ level: 5, third: 'high', difficulty: [it.difficultyMax - 5, it.difficultyMax], best: { quests: 3, bands: { fail: 0.25, success: 0.35, strong: 0.4 }, size: 2.5, traitsDrawn: 0.01 } }],
  })),
  coverage: Object.values(content.stats)
    .filter((it) => it.owner === 'hero')
    .map((it) => ({ statKey: it.key, name: it.name, byKind: Object.fromEntries(encounterKinds.map((kind) => [kind, ['x/y']])) as Record<(typeof encounterKinds)[number], string[]>, checks: 6, kinds: 6, met: true })),
  spot: { compared: 10, widest: { gap: 0.01, errors: 1.2 } },
};
const page = reviewPage({ content, core, calibration, notes: { summary: ['A summary.'], encounters: { 'ambush-on-the-road': 'Bandits break from the trees.' } }, made: '2026-10-03' });

describe('the review page', () => {
  test('keeps the page contract: a short title, the colours as tokens in both schemes, a background, nothing fetched', () => {
    expect(page).toMatch(/^<!doctype html>/);
    expect(page).toContain('<title>Quest content review</title>');
    expect(page).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(page).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
    expect(page).toContain(':root[data-theme="dark"]');
    expect(page).toMatch(/body \{[^}]*background: var\(--bg\)/);
    expect(page).not.toMatch(/<script|<link|@import|https?:\/\/(?!www\.w3\.org)/);
    expect(page).toContain('.scroll { overflow-x: auto;');
  });

  test('gives every Encounter, template, new Item, Trait and Synergy an id to comment on, and every Check by its words', () => {
    for (const key of Object.keys(content.encounters)) expect(page).toContain(`id="enc-${key}"`);
    for (const key of Object.keys(content.questTemplates)) expect(page).toContain(`id="tpl-${key}"`);
    for (const key of Object.keys(content.items).filter((it) => !Object.hasOwn(core.items, it))) expect(page).toContain(`id="item-${key}"`);
    for (const key of Object.keys(content.heroTraits).filter((it) => !Object.hasOwn(core.heroTraits, it))) expect(page).toContain(`id="trait-${key}"`);
    for (const key of Object.keys(content.synergies)) expect(page).toContain(`id="syn-${key}"`);
    // DL-148's example, as the CLI words it.
    expect(page).toContain('<strong>Footing</strong>: Wits of the Hero with the lowest Dexterity.');
    expect(page).toContain('Bandits break from the trees.');
    expect(page).toContain('A summary.');
  });

  test('says each pass formula and each Degree in words', () => {
    const ambush = content.encounters['ambush-on-the-road'] as Encounter;
    expect(passWords(ambush.pass ?? 'steel', ambush)).toBe('Steel and (Nerve or Rallying)');
    const line = content.encounters['hold-the-line'] as Encounter;
    expect(passWords(line.pass ?? 'wall', line)).toBe('at least 2 of Shield wall, Command and Stamina');
    expect(consequenceWords({ kind: 'injury', typeKey: 'deep-cut', chance: 0.2, count: 2, among: ['where', 'party', ['class', 'warrior']], exposedBy: ['dexterity'], guardedBy: ['constitution'] }, content, 'failure')).toBe(
      'Deep cut to up to 2 Heroes, 20% each, among the Warriors, likelier on those of low Dexterity, less likely for those of high Constitution',
    );
    expect(consequenceWords({ kind: 'trait', traitKey: 'battle-tried', chance: 0.05 }, content, 'triumph')).toBe('the Trait Battle-tried to a Hero, 5%, kept if the Quest ends a strong success');
    expect(consequenceWords({ kind: 'morale', delta: -2, steadiedBy: ['courage', 'willpower'] }, content, 'failure')).toBe('Morale −2 for each Hero, less for those of high Courage and Willpower');
    for (const degree of degrees) expect(page).toContain(`<dt>${degree[0]?.toUpperCase()}${degree.slice(1)}</dt>`);
  });

  // The verification (DL-162): the slips the owner would have read.
  test("words a Set of one Hero, a Synergy's requirement and the tags as they read", () => {
    expect(consequenceWords({ kind: 'injury', typeKey: 'deep-cut', chance: 0.2, count: 1, among: ['bottom', 'party', 1, ['stat', 'strength']] }, content, 'failure')).toBe(
      'Deep cut to one Hero, 20%, among the Hero with the lowest Strength',
    );
    expect(page).toContain('When the number of Warriors is at least 1 and the number of Healers is at least 1.');
    expect(page).not.toMatch(/ · tags [a-z]/);
    expect(page).toMatch(/ · Tags [A-Z]/);
  });

  // v1.1.5-S8 (DL-172, DL-168 item 5): a negative earned Trait reads the Degree Failure, not "failed", which takes in a Setback.
  test('says a negative earned Trait falls on the Failure Degree only', () => {
    expect(page).toContain('a negative one falls only on a Hero the same Encounter injured at the Degree Failure (not a Setback)');
    expect(page).not.toMatch(/failed Encounter/i);
  });

  test('with fragment, is the title, the style and the content alone, in that order, padding only the block ends', () => {
    const fragment = reviewPage({ content, core, calibration, notes: {}, made: '2026-10-03' }, { fragment: true });
    expect(fragment).toMatch(/^<title>Quest content review<\/title>\n<style>\n[^]*<\/style>\n<main>\n[^]*<\/main>\n$/);
    expect(fragment).not.toMatch(/<!doctype|<html|<head>|<body|<meta/i);
    expect(fragment).not.toMatch(/(^|\n)(main|body|html|:root) \{[^}]*padding:/);
    expect(fragment).toContain('main { max-width: 64rem; margin-inline: auto; padding-block: 24px 64px; }');
    expect(page).toContain('body { margin: 0; padding-inline: 16px; }');
  });
});
