// The review page of v1.1.4-S9's drafts (DL-148 item 30, DL-162): one self-contained HTML page the
// owner reads and comments on before the content is written (S10). It gives each Encounter in words,
// each Check worded as the front ends word what a Check reads ("Wits of the Hero with the lowest
// Dexterity", this package's `queryWords`), its pass formula, its consequences by Degree and the
// calibration's rates; every new name (Encounters, Checks, Items, Traits, Synergies and tags); the
// Stats harm reads; and the coverage grid.
//
// It is made from the drafts with the core content beside them, the calibration's data
// (`docs/quests/calibration.json`, which `npm run harness -- calibrate` writes) and the drafts' notes
// (`docs/quests/drafts/notes.json`: a sentence for each new thing, written for the owner). It lives
// with the words, where the harness and the tools may read it (v1.1.6-S12, DL-186 item 1); the CLI's
// `quest-review.ts` reads the files and writes `docs/quests/v1.1.4-review.html`. Run it with
// `npm run quest-review`; S10 runs it again after the owner's answers.
//
// A page, not a rule: it reads content and the calibration, and draws and changes nothing.

import { describeQuery, type QuestBand } from '@heroesim/engine';
import {
  degrees,
  encounterKinds,
  type Consequence,
  type ContentSet,
  type Degree,
  type Encounter,
  type EncounterKind,
  type PassFormula,
  type QuestTemplate,
  type SetQuery,
  type StatKey,
} from '@heroesim/engine/content';
import { coinWords } from './coins.js';
import { modifierWords, traitEffectWords } from './effects.js';
import { capitalised, listed, nameIn } from './names.js';
import { queryWords } from './query.js';

/** One cell of the calibration: each Degree's rate at a Level, a Party size and a difficulty. */
export interface ReviewCell {
  level: number;
  size: number;
  difficulty: number;
  degrees: Record<Degree, number>;
}

/** What the page reads of the calibration's data (harness/src/calibrate.ts's `Calibration`). */
export interface ReviewCalibration {
  settings: { levels: number[]; sizes: number[]; difficulties: number[]; parties: number; questsPerTemplate: number; roster: number; spotSeeds: number; spotSamples: number };
  encounters: { key: string; cells: ReviewCell[]; checks: { key: string; adds: StatKey[]; cells: ReviewCell[] }[] }[];
  templates: {
    key: string;
    rows: { level: number; third: string; difficulty: [number, number]; best: { quests: number; bands: Record<QuestBand, number>; size: number; traitsDrawn: number } }[];
  }[];
  coverage: { statKey: StatKey; name: string; byKind: Record<EncounterKind, string[]>; checks: number; kinds: number; met: boolean }[];
  spot: { compared: number; widest: { gap: number; errors: number } };
}

/** The drafts' notes: a sentence for each new thing, for the owner, and the sweep's numbers. */
export interface ReviewNotes {
  /** A paragraph of what the drafts do, at the top. */
  summary?: string[];
  /** What a short sweep with the drafts played, a paragraph each. */
  play?: string[];
  encounters?: Record<string, string>;
  templates?: Record<string, string>;
  items?: Record<string, string>;
  traits?: Record<string, string>;
  synergies?: Record<string, string>;
  tags?: Record<string, string>;
  /** The calls made where the plan was silent, for the owner, a sentence each. */
  calls?: string[];
}

export interface ReviewInput {
  /** The content with the drafts in place. */
  content: ContentSet;
  /** The core content, to tell what is new. */
  core: ContentSet;
  calibration: ReviewCalibration;
  notes: ReviewNotes;
  /** When the page was made, as the page says. */
  made: string;
}

/** Text made safe for HTML. */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const pct = (chance: number): string => `${Math.round(chance * 100)}%`;
/** `+2`, `−1`: the review's own minus sign, U+2212, where the words' `signed` writes a hyphen. */
const minusSigned = (n: number): string => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
const stats = (content: ContentSet, keys: readonly StatKey[]): string => keys.map((key) => nameIn(content.stats, key)).join(' and ');

/** A Quest template's or an Encounter's tags, a fragment that stands on its own: "Tags Road, Wild", or "No tags". */
function tagWords(tags: readonly string[]): string {
  return tags.length === 0 ? 'No tags' : `Tags ${tags.map(capitalised).join(', ')}`;
}

/** A Set Query in words: "the Warriors", "the 3 Heroes with the highest Constitution". */
function setWords(set: SetQuery, content: ContentSet): string {
  const words = queryWords(describeQuery(['count', set]), content);
  if (!words.startsWith('the number of ')) return 'the Party';
  return `the ${words.slice('the number of '.length).replace(/^(the )?1 Hero /, 'Hero ')}`;
}

/** A pass formula in words, each Check by its name: "Steel, and Nerve or Rallying". */
export function passWords(pass: PassFormula, encounter: Encounter, top = true): string {
  if (typeof pass === 'string') return encounter.checks.find((it) => it.key === pass)?.name ?? pass;
  const [operator, ...rest] = pass;
  const words =
    operator === 'at-least'
      ? `at least ${rest[0] as number} of ${listed((rest.slice(1) as PassFormula[]).map((it) => passWords(it, encounter, false)))}`
      : listed((rest as PassFormula[]).map((it) => passWords(it, encounter, false)), operator);
  return top ? words : `(${words})`;
}

/** One consequence in words, as `list` holds it ('triumph' or 'failure' tell a Trait's way). */
export function consequenceWords(it: Consequence, content: ContentSet, list: Degree): string {
  switch (it.kind) {
    case 'xp':
      return `XP ×${it.factor}`;
    case 'wealth':
      return `the reward ×${it.factor}`;
    case 'fame':
      return `Fame ${minusSigned(it.delta)}`;
    case 'regard':
      return `Regard within the Party ${minusSigned(it.delta)}`;
    case 'morale':
      return `Morale ${minusSigned(it.delta)} for each Hero${it.steadiedBy === undefined ? '' : `, less for those of high ${stats(content, it.steadiedBy)}`}`;
    case 'injury': {
      const who = it.count === 1 ? 'one Hero' : `up to ${it.count} Heroes`;
      const reads = [
        it.among === undefined ? '' : `among ${setWords(it.among, content)}`,
        it.exposedBy === undefined ? '' : `likelier on those of low ${stats(content, it.exposedBy)}`,
        it.guardedBy === undefined ? '' : `less likely for those of high ${stats(content, it.guardedBy)}`,
      ].filter((part) => part !== '');
      return `${nameIn(content.injuries, it.typeKey)} to ${who}, ${pct(it.chance)}${it.count === 1 ? '' : ' each'}${reads.length === 0 ? '' : `, ${reads.join(', ')}`}`;
    }
    case 'death': {
      const reads = [
        it.among === undefined ? '' : `among ${setWords(it.among, content)}`,
        it.exposedBy === undefined ? '' : `likelier on those of low ${stats(content, it.exposedBy)}`,
        it.guardedBy === undefined ? '' : `less likely for those of high ${stats(content, it.guardedBy)}`,
      ].filter((part) => part !== '');
      return `a Death, ${pct(it.chance)}${reads.length === 0 ? '' : `, ${reads.join(', ')}`}`;
    }
    case 'trait': {
      const trait = nameIn(content.heroTraits, it.traitKey);
      const among = it.among === undefined ? '' : ` among ${setWords(it.among, content)}`;
      return list === 'triumph'
        ? `the Trait ${trait} to a Hero${among}, ${pct(it.chance)}, kept if the Quest ends a strong success`
        : `the Trait ${trait} to a Hero this Encounter injured${among}, ${pct(it.chance)}`;
    }
  }
}

/** The four Degrees' consequences in words, a missing Triumph or Setback list said as the list it reads. */
function consequenceRows(encounter: Encounter, content: ContentSet): [string, string][] {
  const { success, failure, triumph, setback } = encounter.consequences;
  const words = (list: readonly Consequence[] | undefined, degree: Degree, fallback: string): string =>
    list === undefined ? fallback : list.length === 0 ? 'Nothing more' : capitalised(list.map((it) => consequenceWords(it, content, degree)).join('; '));
  return [
    ['Triumph', words(triumph, 'triumph', 'As a Success')],
    ['Success', words(success, 'success', '')],
    ['Setback', words(setback, 'setback', 'As a Failure')],
    ['Failure', words(failure, 'failure', '')],
  ];
}

/** A table, wrapped so that it scrolls on its own at a narrow width. */
function table(head: readonly string[], rows: readonly (readonly string[])[], caption = ''): string {
  return [
    '<div class="scroll"><table>',
    caption === '' ? '' : `<caption>${caption}</caption>`,
    `<thead><tr>${head.map((it) => `<th scope="col">${it}</th>`).join('')}</tr></thead>`,
    `<tbody>${rows.map((row) => `<tr>${row.map((it, at) => (at === 0 ? `<th scope="row">${it}</th>` : `<td>${it}</td>`)).join('')}</tr>`).join('')}</tbody>`,
    '</table></div>',
  ].join('');
}

/** A cell of rates: Success or better, with the Triumphs beside it, shaded by the chance. */
function rateCell(cell: ReviewCell | undefined): string {
  if (cell === undefined) return '—';
  const success = cell.degrees.success + cell.degrees.triumph;
  const title = degrees.map((degree) => `${capitalised(degree)} ${pct(cell.degrees[degree])}`).join(', ');
  return `<span class="rate" style="--p:${success.toFixed(2)}" title="${title}">${pct(success)} <small>(${pct(cell.degrees.triumph)})</small></span>`;
}

/** Rates by Level (rows) and difficulty (columns) for Parties of `size`. */
function rateTable(cells: readonly ReviewCell[], settings: ReviewCalibration['settings'], size: number, caption: string): string {
  const at = (level: number, difficulty: number) => cells.find((it) => it.level === level && it.size === size && it.difficulty === difficulty);
  return table(
    ['Party', ...settings.difficulties.map((d) => `Difficulty ${d}`)],
    settings.levels.map((level) => [`Level ${level}`, ...settings.difficulties.map((d) => rateCell(at(level, d)))]),
    caption,
  );
}

/** Rates by Party size (rows) and difficulty (columns) at `level`. */
function sizeTable(cells: readonly ReviewCell[], settings: ReviewCalibration['settings'], level: number, caption: string): string {
  const at = (size: number, difficulty: number) => cells.find((it) => it.level === level && it.size === size && it.difficulty === difficulty);
  return table(
    ['Party', ...settings.difficulties.map((d) => `Difficulty ${d}`)],
    settings.sizes.map((size) => [`${size} ${size === 1 ? 'Hero' : 'Heroes'}`, ...settings.difficulties.map((d) => rateCell(at(size, d)))]),
    caption,
  );
}

const kindNames: Record<EncounterKind, string> = { combat: 'Combat', travel: 'Travel', social: 'Social', arcane: 'Arcane', stealth: 'Stealth', lore: 'Lore' };

/** One Encounter's card. */
function encounterCard(encounter: Encounter, input: ReviewInput, finaleOf: string[]): string {
  const { content, core, calibration, notes } = input;
  const data = calibration.encounters.find((it) => it.key === encounter.key);
  const settings = calibration.settings;
  const mid = settings.levels[Math.floor(settings.levels.length / 2)] ?? 1;
  const state = Object.hasOwn(core.encounters, encounter.key) ? 'Re-authored' : 'New';
  const finale = finaleOf.length === 0 ? '' : ` · the Finale of ${finaleOf.map((key) => esc(nameIn(content.questTemplates, key))).join(', ')}`;
  const checks = encounter.checks
    .map((it) => {
      const reads = capitalised(queryWords(describeQuery(it.score), content));
      const skills = it.skills.length === 0 ? 'no Skill helps' : `${listed(it.skills.map((key) => nameIn(content.skills, key)))} ${it.skills.length === 1 ? 'helps' : 'help'}`;
      const target = `${it.flat === undefined ? '' : `${it.flat} + `}${it.difficultyFactor} × difficulty`;
      const variance = it.variance === undefined ? '' : `, the roll ±${Math.round(it.variance * 100)}%`;
      const rates = data?.checks.find((check) => check.key === it.key)?.cells ?? [];
      return `<li id="chk-${esc(encounter.key)}-${esc(it.key)}"><strong>${esc(it.name)}</strong>: ${esc(reads)}.<br><span class="meta">${esc(capitalised(skills))}; the target ${esc(target)}${esc(variance)}${it.raw === true ? '; raw, its score alone' : ''}.</span>${
        rates.length === 0 ? '' : `<details><summary>${esc(it.name)}'s rates</summary>${rateTable(rates, settings, 3, `Success or better (Triumph) of ${esc(it.name)} alone, Parties of 3 at random`)}</details>`
      }</li>`;
    })
    .join('');
  const pass = encounter.pass === undefined ? '' : `<p><strong>To pass:</strong> ${esc(passWords(encounter.pass, encounter))}.</p>`;
  const rows = consequenceRows(encounter, content).map(([degree, words]) => `<dt>${degree}</dt><dd>${esc(words)}</dd>`).join('');
  return [
    `<section class="card" id="enc-${esc(encounter.key)}">`,
    `<h3>${esc(encounter.name)} <a class="id" href="#enc-${esc(encounter.key)}">#enc-${esc(encounter.key)}</a></h3>`,
    `<p class="meta">${state} · ${kindNames[encounter.kind]}${finale} · ${esc(tagWords(encounter.tags ?? []))}</p>`,
    notes.encounters?.[encounter.key] === undefined ? '' : `<p>${esc(notes.encounters[encounter.key] as string)}</p>`,
    `<h4>Checks</h4><ol class="checks">${checks}</ol>`,
    pass,
    `<h4>Consequences</h4><dl class="degrees">${rows}</dl>`,
    data === undefined
      ? ''
      : `<h4>Rates</h4>${rateTable(data.cells, settings, 3, 'Success or better (Triumph), Parties of 3 at random')}<details><summary>By Party size, at Level ${mid}</summary>${sizeTable(data.cells, settings, mid, `Success or better (Triumph) at Level ${mid}`)}</details>`,
    '</section>',
  ].join('');
}

/**
 * The page: a whole document, or with `fragment` (v1.1.4-S9's verification, DL-162) its `<title>`,
 * `<style>` and `<main>` alone, in that order, for a publisher that wraps them in its own document and
 * sets the side gutter on `:root`, so the fragment's style pads only the block ends.
 */
export function reviewPage(input: ReviewInput, { fragment = false }: { fragment?: boolean } = {}): string {
  const { content, core, calibration, notes } = input;
  const settings = calibration.settings;
  const finales = new Map<string, string[]>();
  for (const template of Object.values(content.questTemplates)) {
    if (template.finale !== undefined) finales.set(template.finale, [...(finales.get(template.finale) ?? []), template.key]);
  }
  const encounters = Object.values(content.encounters);
  const drawn = encounters.filter((it) => !finales.has(it.key));
  const isNew = <T>(rows: Readonly<Record<string, T>>, key: string): boolean => !Object.hasOwn(rows, key);
  const newEncounters = encounters.filter((it) => isNew(core.encounters, it.key));
  const newItems = Object.values(content.items).filter((it) => isNew(core.items, it.key));
  const newTraits = Object.values(content.heroTraits).filter((it) => isNew(core.heroTraits, it.key));
  const newSynergies = Object.values(content.synergies).filter((it) => isNew(core.synergies, it.key));
  const coreTags = new Set([...Object.values(core.questTemplates).flatMap((it) => it.tags), ...Object.values(core.encounters).flatMap((it) => it.tags ?? [])]);
  const allTags = [...new Set([...Object.values(content.questTemplates).flatMap((it) => it.tags), ...encounters.flatMap((it) => it.tags ?? [])])].sort();

  const section = (id: string, title: string, body: string) => `<section id="${id}"><h2>${title}</h2>${body}</section>`;
  const link = (prefix: string, key: string, name: string) => `<a href="#${prefix}-${esc(key)}">${esc(name)}</a>`;

  // The Quest target as the estimate sees it, from the templates' best Parties.
  const headline = settings.levels.map((level) => {
    let quests = 0;
    const bands: Record<QuestBand, number> = { fail: 0, success: 0, strong: 0 };
    for (const template of calibration.templates) {
      for (const row of template.rows.filter((it) => it.level === level)) {
        quests += row.best.quests;
        for (const band of ['fail', 'success', 'strong'] as const) bands[band] += row.best.bands[band] * row.best.quests;
      }
    }
    return [`Level ${level}`, `${quests}`, pct(bands.fail / Math.max(1, quests)), pct(bands.success / Math.max(1, quests)), pct(bands.strong / Math.max(1, quests))];
  });

  const names = [
    ['Encounters', newEncounters.map((it) => link('enc', it.key, it.name))],
    ['Checks', encounters.flatMap((it) => it.checks.map((check) => `<a href="#chk-${esc(it.key)}-${esc(check.key)}">${esc(check.name)}</a>`))],
    ['Items', newItems.map((it) => link('item', it.key, it.name))],
    ['Traits', newTraits.map((it) => link('trait', it.key, it.name))],
    ['Synergies', newSynergies.map((it) => link('syn', it.key, it.name))],
    ['Tags', allTags.filter((tag) => !coreTags.has(tag)).map((tag) => link('tag', tag, capitalised(tag)))],
  ] as const;

  const harm = [
    ['Blows (combat Injuries)', 'Dexterity', 'Constitution'],
    ['Falls and traps (travel and stealth Injuries)', 'Perception', 'Dexterity'],
    ['Fever and exposure (Lung fever on the road)', 'Endurance', 'Constitution'],
    ['Magic (arcane Injuries)', 'Resistance', 'Resistance'],
    ['A Death', '—', 'The Stat of the blow: Constitution, Dexterity or Resistance'],
  ];
  const morale = [
    ['Dread (the dead, a power, a lost fight)', 'Courage and Willpower'],
    ['Hardship (the road)', 'Endurance and Willpower'],
    ['Shame (a social Encounter lost)', 'Adaptability'],
    ['A puzzle beaten (lore)', 'Willpower'],
  ];

  /**
   * A template's Beats in order, each by its pool whole (DL-262): its kinds, or "Any", tagged its tags,
   * the alternatives to them the Encounters it names (`inBeatPool`), what the page lists of them.
   */
  const beatPools = (template: QuestTemplate): string[] =>
    template.beats.map(({ pool }) => {
      const criteria = pool.kinds === undefined && pool.tags === undefined ? [] : [`${pool.kinds?.map((kind) => kindNames[kind]).join(' or ') ?? 'Any'}${pool.tags === undefined ? '' : ` tagged ${pool.tags.join(' or ')}`}`];
      return [...criteria, ...(pool.encounters ?? []).map((key) => nameIn(content.encounters, key))].join(' or ');
    });
  const templates = Object.values(content.questTemplates).map((template) => {
    const coreTemplate = core.questTemplates[template.key];
    const changes = [
      coreTemplate !== undefined && coreTemplate.tags.join() !== template.tags.join() ? `tags ${coreTemplate.tags.map(capitalised).join(', ')} → ${template.tags.map(capitalised).join(', ')}` : '',
      coreTemplate !== undefined && beatPools(coreTemplate).join() !== beatPools(template).join() ? `Beats ${beatPools(coreTemplate).join(', ')} → ${beatPools(template).join(', ')}` : '',
      coreTemplate !== undefined && `${coreTemplate.tierMin}–${coreTemplate.tierMax}` !== `${template.tierMin}–${template.tierMax}` ? `Tiers ${coreTemplate.tierMin}–${coreTemplate.tierMax} → ${template.tierMin}–${template.tierMax}` : '',
      template.finale === undefined ? '' : `its Finale ${nameIn(content.encounters, template.finale)}`,
    ].filter((it) => it !== '');
    const rows = (calibration.templates.find((it) => it.key === template.key)?.rows ?? []).map((row) => [
      `Level ${row.level}, ${row.third}`,
      `${row.difficulty[0]}–${row.difficulty[1]}`,
      `${row.best.quests}`,
      pct(row.best.bands.fail),
      pct(row.best.bands.success),
      pct(row.best.bands.strong),
      row.best.size.toFixed(1),
    ]);
    return [
      `<section class="card" id="tpl-${esc(template.key)}">`,
      `<h3>${esc(template.name)} <a class="id" href="#tpl-${esc(template.key)}">#tpl-${esc(template.key)}</a></h3>`,
      `<p class="meta">Tiers ${template.tierMin}–${template.tierMax} · Parties of ${template.partySizeMin} or more · Beats ${esc(beatPools(template).join(', '))} · ${esc(tagWords(template.tags))}</p>`,
      changes.length === 0 ? '<p>Unchanged.</p>' : `<p>Changed: ${esc(changes.join('; '))}.</p>`,
      notes.templates?.[template.key] === undefined ? '' : `<p>${esc(notes.templates[template.key] as string)}</p>`,
      table(['Best Party', 'Difficulty', 'Quests', 'Fail', 'Success', 'Strong', 'Its size'], rows, `The best Party of a Roster of ${settings.roster}, if no one falls`),
      '</section>',
    ].join('');
  });

  const traitUses = (key: string): string[] =>
    encounters.flatMap((encounter) =>
      (['triumph', 'failure'] as const).flatMap((list) =>
        (encounter.consequences[list] ?? []).flatMap((it) => (it.kind === 'trait' && it.traitKey === key ? [`${link('enc', encounter.key, encounter.name)} (${list === 'triumph' ? 'a Triumph' : 'a Failure'}, ${pct(it.chance)})`] : [])),
      ),
    );

  const body = [
    `<header><h1>Quest content review</h1><p class="meta">The drafts of v1.1.4-S9 (DL-162) for the owner's review (DL-148 item 30), made ${esc(input.made)}. Comment on anything by the id beside its heading, such as <code>#enc-ambush-on-the-road</code>.</p></header>`,
    `<nav aria-label="Contents"><ol>${[
      ['summary', 'What is drafted'],
      ['names', 'Every new name'],
      ['target', 'The Quest target'],
      ['coverage', 'The coverage grid'],
      ['harm', 'The Stats harm reads'],
      ...encounterKinds.map((kind) => [`kind-${kind}`, `${kindNames[kind]} Encounters`]),
      ['finales', 'The Finales'],
      ['templates', 'The Quest templates'],
      ['items', 'Items'],
      ['traits', 'Traits'],
      ['synergies', 'Synergies'],
      ['tags', 'Tags'],
      ['calls', 'Calls for the owner'],
    ]
      .map(([id, title]) => `<li><a href="#${id}">${title}</a></li>`)
      .join('')}</ol></nav>`,
    section(
      'summary',
      'What is drafted',
      [
        ...(notes.summary ?? []).map((it) => `<p>${esc(it)}</p>`),
        `<p>${drawn.length} Encounters a Quest draws (${drawn.filter((it) => !isNew(core.encounters, it.key)).length} re-authored, ${drawn.filter((it) => isNew(core.encounters, it.key)).length} new), and ${finales.size} Finales; ${newItems.length} Items, ${newTraits.length} Traits and ${newSynergies.length} Synergies new, and every Synergy written as a Query.</p>`,
        '<p>How to read the rates. Each is the chance estimate\'s, "if no one falls", for Heroes drawn by the game\'s own generators and raised to Level 1, 5 or 10, at steady Morale, with no gear and no Regard between them. An Encounter\'s rates are for Parties drawn at random, so a Check that wants a Hero of a Class is lower where none goes. A cell gives the chance of a Success or better, with the chance of a Triumph in brackets; its colour follows the chance, and its title gives all four Degrees. A target is its flat term, where it has one, plus its factor times the Quest\'s difficulty.</p>',
      ].join(''),
    ),
    section('names', 'Every new name', `<p>Each name is the agent's, for the owner to keep or change (DL-148 item 21).</p><dl class="names">${names.map(([what, list]) => `<dt>${what}</dt><dd>${list.join(', ') || 'None'}</dd>`).join('')}</dl>`),
    section(
      'target',
      'The Quest target',
      [
        `<p>The target (DL-83 item 4): the player's Quests fail 20 to 30% of the time, and are strong successes at most 50%. As the estimate sees it, each template's Quests drawn by the game, ${settings.questsPerTemplate} at each Level, met by the best Party of a Roster of ${settings.roster} Heroes, if no one falls:</p>`,
        table(['Roster', 'Quests', 'Fail', 'Success', 'Strong'], headline),
        `<p>The estimate held to the resolver on ${calibration.spot.compared} chances, the widest ${(calibration.spot.widest.gap * 100).toFixed(1)} points apart (${calibration.spot.widest.errors.toFixed(1)} standard errors).</p>`,
        ...(notes.play ?? []).map((it) => `<p>${esc(it)}</p>`),
      ].join(''),
    ),
    section(
      'coverage',
      'The coverage grid',
      `<p>Each Hero Stat's Checks by kind: the Checks whose score adds the Stat, not those that only choose or filter by it. The gate: every Hero Stat read by at least three Checks across at least two kinds. ${calibration.coverage.filter((it) => it.met).length} of ${calibration.coverage.length} meet it.</p>${table(
        ['Stat', ...encounterKinds.map((kind) => kindNames[kind]), 'Checks', 'Kinds'],
        calibration.coverage.map((it) => [esc(it.name), ...encounterKinds.map((kind) => `${it.byKind[kind].length || ''}`), `${it.checks}`, `${it.kinds}${it.met ? '' : ' (short)'}`]),
      )}`,
    ),
    section(
      'harm',
      'The Stats harm reads',
      `<p>Who harm falls on, and who shrugs it off (DL-148 item 14). An Injury falls likelier on a Hero low in the Stat that exposes them, and lands less often on one high in the Stat that guards them.</p>${table(['Harm', 'Exposed by', 'Guarded by'], harm)}${table(['A Morale loss', 'Steadied by'], morale)}`,
    ),
    ...encounterKinds.map((kind) =>
      section(`kind-${kind}`, `${kindNames[kind]} Encounters`, drawn.filter((it) => it.kind === kind).map((it) => encounterCard(it, input, [])).join('') || '<p>None.</p>'),
    ),
    section('finales', 'The Finales', `<p>Each is a new Encounter, always the last of its template's Quests, and Loot on such a Quest also needs its Triumph (DL-148 items 22 and 23).</p>${encounters.filter((it) => finales.has(it.key)).map((it) => encounterCard(it, input, finales.get(it.key) ?? [])).join('')}`),
    section('templates', 'The Quest templates', templates.join('')),
    section(
      'items',
      'Items',
      `<p>Gear for the Mental and Social Stats (DL-148 item 21).</p>${table(
        ['Item', 'Slot', 'Stats', 'Price', 'Note'],
        newItems.map((it) => [
          `<span id="item-${esc(it.key)}">${esc(it.name)}</span>`,
          it.kind === 'gear' ? capitalised(it.slot) : 'Consumable',
          it.kind === 'gear' ? esc(modifierWords(it, content)) : '',
          it.buyPrice === null ? '—' : coinWords(it.buyPrice),
          esc(notes.items?.[it.key] ?? ''),
        ]),
      )}`,
    ),
    section(
      'traits',
      'Traits',
      `<p>Earned Traits (DL-148 item 25): a positive one is drawn on a Triumph and kept only if the Quest ends a strong success; a negative one falls only on a Hero the same Encounter injured at the Degree Failure (not a Setback).</p>${newTraits
        .map(
          (it) =>
            `<section class="card" id="trait-${esc(it.key)}"><h3>${esc(it.name)} <a class="id" href="#trait-${esc(it.key)}">#trait-${esc(it.key)}</a></h3><p class="meta">${esc(capitalised(traitEffectWords(it.effects, content)))}${it.excludes.length === 0 ? '' : ` · never beside ${esc(listed(it.excludes.map((key) => nameIn(content.heroTraits, key))))}`}</p>${
              notes.traits?.[it.key] === undefined ? '' : `<p>${esc(notes.traits[it.key] as string)}</p>`
            }<p>Earned on ${traitUses(it.key).join(', ') || 'no Encounter'}.</p></section>`,
        )
        .join('')}`,
    ),
    section(
      'synergies',
      'Synergies',
      `<p>Every Synergy's requirements are written as Queries (DL-148 item 20); the new ones read Stats and Levels.</p>${Object.values(content.synergies)
        .map((it) => {
          const requires = it.requires.map(([comparison, left, right]) => `${queryWords(describeQuery(left), content)} is ${{ '>=': 'at least', '>': 'above', '<': 'below', '<=': 'at most', '=': 'exactly' }[comparison]} ${queryWords(describeQuery(right), content)}`);
          const bonus = [it.bonus.flat === undefined ? '' : `+${it.bonus.flat}`, it.bonus.factor === undefined ? '' : `×${it.bonus.factor}`].filter((part) => part !== '').join(' and ');
          const on = it.kinds === undefined ? 'every Encounter' : `${listed(it.kinds.map((kind) => kindNames[kind].toLowerCase()), 'and')} Encounters`;
          return `<section class="card" id="syn-${esc(it.key)}"><h3>${esc(it.name)} <a class="id" href="#syn-${esc(it.key)}">#syn-${esc(it.key)}</a></h3><p class="meta">${isNew(core.synergies, it.key) ? 'New' : 'Rewritten as Queries'} · ${esc(bonus)} on ${esc(on)}</p><p>When ${esc(listed(requires))}.</p>${
            notes.synergies?.[it.key] === undefined ? '' : `<p>${esc(notes.synergies[it.key] as string)}</p>`
          }</section>`;
        })
        .join('')}`,
    ),
    section(
      'tags',
      'Tags',
      `<p>An Encounter is drawn three times as often within its kind for each tag it shares with its template (DL-148 item 22).</p>${table(
        ['Tag', 'Templates', 'Encounters', 'Note'],
        allTags.map((tag) => [
          `<span id="tag-${esc(tag)}">${esc(capitalised(tag))}</span>${coreTags.has(tag) ? '' : ' (new)'}`,
          esc(Object.values(content.questTemplates).filter((it) => it.tags.includes(tag)).map((it) => it.name).join(', ')),
          esc(encounters.filter((it) => (it.tags ?? []).includes(tag)).map((it) => it.name).join(', ')),
          esc(notes.tags?.[tag] ?? ''),
        ]),
      )}`,
    ),
    section('calls', 'Calls for the owner', `<ol>${(notes.calls ?? []).map((it) => `<li>${esc(it)}</li>`).join('')}</ol>`),
  ].join('\n');

  const title = '<title>Quest content review</title>';
  const style = `<style>
:root {
  --bg: #f7f5f0; --fg: #1f1c18; --muted: #6a6359; --card: #ffffff; --line: #e2ddd3; --accent: #7a4416;
  --chip: #efe9de; --rate-low: 8 75% 88%; --rate-high: 140 45% 78%; --link: #7a4416;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #17150f; --fg: #ece6da; --muted: #a59d90; --card: #211e17; --line: #3a352b; --accent: #e0a96d;
    --chip: #2c281f; --link: #e0a96d;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #17150f; --fg: #ece6da; --muted: #a59d90; --card: #211e17; --line: #3a352b; --accent: #e0a96d;
  --chip: #2c281f; --link: #e0a96d;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { background: var(--bg); color: var(--fg); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overflow-wrap: anywhere; }
main { max-width: 64rem; margin-inline: auto; padding-block: 24px 64px; }${fragment ? '' : '\nbody { margin: 0; padding-inline: 16px; }'}
h1 { font-size: 1.9rem; margin: 0 0 0.25rem; }
h2 { font-size: 1.4rem; margin: 2.5rem 0 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--line); }
h3 { font-size: 1.15rem; margin: 0 0 0.25rem; }
h4 { font-size: 0.95rem; margin: 1rem 0 0.35rem; color: var(--muted); }
a { color: var(--link); }
.meta { color: var(--muted); font-size: 0.92rem; margin: 0.15rem 0 0.6rem; }
.id { font: 0.75rem ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); text-decoration: none; margin-left: 0.4rem; white-space: nowrap; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin: 0 0 16px; }
nav ol { columns: 2 14rem; padding-left: 1.2rem; margin: 0; }
ol.checks { padding-left: 1.2rem; margin: 0; }
ol.checks li { margin: 0 0 0.6rem; }
dl.degrees, dl.names { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; margin: 0; }
dl.degrees dt, dl.names dt { font-weight: 600; }
dl.degrees dd, dl.names dd { margin: 0; }
.scroll { overflow-x: auto; margin: 0.5rem 0; max-width: 100%; }
table { border-collapse: collapse; font-size: 0.88rem; min-width: 100%; }
caption { text-align: left; color: var(--muted); font-size: 0.85rem; padding: 0 0 0.3rem; }
th, td { border-bottom: 1px solid var(--line); padding: 0.3rem 0.5rem; text-align: right; white-space: nowrap; }
th[scope="row"], thead th:first-child { text-align: left; }
td:last-child:not(:only-child) { white-space: normal; }
thead th { color: var(--muted); font-weight: 600; }
.rate { display: inline-block; min-width: 4.6rem; padding: 0.05rem 0.35rem; border-radius: 4px;
  background: color-mix(in hsl, hsl(var(--rate-low)) calc((1 - var(--p)) * 100%), hsl(var(--rate-high))); color: #1f1c18; }
.rate small { color: #4a453d; }
details { margin: 0.4rem 0; }
summary { cursor: pointer; color: var(--accent); min-height: 44px; display: flex; align-items: center; }
code { font: 0.85em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--chip); padding: 0.05rem 0.3rem; border-radius: 4px; }
</style>`;
  const main = `<main>\n${body}\n</main>`;
  if (fragment) return `${title}\n${style}\n${main}\n`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${title}
${style}
</head>
<body>
${main}
</body>
</html>
`;
}
