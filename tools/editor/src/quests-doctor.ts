// `quests doctor` (DL-257 item 8, DL-267): the Quest templates and Encounters held to what a Quest
// plays (DL-262), beside the content's checks, and the pending edits held to both. Every Beat's pool
// may draw its Encounter whatever the Beats before it drew; every Tier a template offers plays as many
// Beats as it has, one at least; every Encounter is drawn by the pool of some Beat a Tier plays, or is
// a Finale, so that some Quest meets it; and every Finale is placed: an Encounter, with its line, named
// by no pool, played last. It notes, without failing, a Beat no Tier of its template plays. Like every
// command it first puts back the files of a "Finish" cut off, and says so; while one runs it says
// that, and checks no edit. The skills run it before and after they act, and each story that touches
// the engine or the content's checks at its close.

import { placeOf } from '@heroesim/content';
import type { ContentJson } from '@heroesim/content/uses';
import { contentChecks } from '@heroesim/content/write';
import { shortBeats, tierLadder } from '@heroesim/engine/content';
import { readContentFiles } from './content-files.js';
import { Busy } from './finish-journal.js';
import { QuestsEditor } from './quests-editor.js';
import { beatsOf, finalesOf, playedBeats, poolDraws, questSources, rowsOf, tiersOf } from './quests-kind.js';

/** One of the doctor's checks: whether it passed, what it counted, and each problem. */
export interface QuestCheck {
  ok: boolean;
  count: number;
  problems: string[];
}

/** The doctor's checks of what a Quest plays, on one state of the content. */
export interface QuestChecks {
  templates: number;
  pools: QuestCheck;
  tiers: QuestCheck;
  drawn: QuestCheck;
  finales: QuestCheck;
  /** A Beat no Tier of its template plays: noted, not failed. */
  notes: string[];
}

export interface QuestsDoctor {
  ok: boolean;
  content: { ok: boolean; problems: string[] };
  quests: QuestChecks;
  pending: { ok: boolean; edits: number; problems: string[] };
  finish: { running: boolean; recovered: string[] };
}

const check = (count: number, problems: string[]): QuestCheck => ({ ok: problems.length === 0, count, problems });
const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

/** The doctor's checks of the Quest templates and Encounters in `content`, each row read as far as it is of its shape: the content's checks name the rest. */
export function questChecks(content: ContentJson): QuestChecks {
  const templates = rowsOf(content, 'quests');
  const encounters = rowsOf(content, 'encounters');
  const finales = finalesOf(content);
  const at = (key: string, path: (string | number)[] = []): string => placeOf(questSources.quests, [key, ...path]);

  const pools: string[] = [];
  const tiers: string[] = [];
  const finaleProblems: string[] = [];
  const notes: string[] = [];
  const drawnAnywhere = new Set<string>();
  let beatCount = 0;
  let tierCount = 0;
  for (const [key, row] of templates) {
    const beats = beatsOf(row);
    beatCount += beats.length;
    const draws = beats.map((beat) => poolDraws(content, beat.pool, finales));
    for (const each of draws.slice(0, playedBeats(row))) for (const encounter of each) drawnAnywhere.add(encounter);
    for (const { beat, size, needs } of shortBeats(draws)) {
      pools.push(`${at(key, ['beats', beat, 'pool'])} may draw ${plural(size, 'Encounter')}, none a Finale; it needs ${needs}${needs > 1 ? ', one for each Beat before it sharing its pool, and one more' : ''}`);
    }

    const { tierMin, tierMax } = row;
    if (!(Number.isSafeInteger(tierMin) && Number.isSafeInteger(tierMax) && (tierMin as number) >= 1 && (tierMin as number) <= (tierMax as number) && (tierMax as number) <= tierLadder.length)) {
      tiers.push(`${at(key)}: Tiers ${String(tierMin)} to ${String(tierMax)} are not Tiers of the ladder's 1 to ${tierLadder.length}, the lower first`);
    }
    const offered = tiersOf(row);
    tierCount += offered.length;
    const finale = typeof row.finale === 'string' ? row.finale : null;
    const most = beats.length + (finale === null ? 0 : 1);
    for (const tier of offered) {
      if (!(tier.figures.beats >= 1)) tiers.push(`${at(key)}: Tier ${tier.tier} plays ${String(tier.figures.beats)} Beats; a Quest plays one at least`);
      else if (tier.figures.beats > most) tiers.push(`${at(key)}: Tier ${tier.tier} plays ${tier.figures.beats} Beats, more than its ${plural(beats.length, 'Beat')}${finale === null ? '' : ' and its Finale'}`);
    }
    const played = playedBeats(row);
    if (offered.length > 0 && played < beats.length) {
      const unplayed = played === beats.length - 1 ? `beats.${played} is` : `beats.${played} to beats.${beats.length - 1} are`;
      const first = offered[0]?.tier ?? 0;
      const last = offered.at(-1)?.tier ?? 0;
      const tiersWord = first === last ? `Tier ${first} draws` : `Tiers ${first} to ${last} draw`;
      notes.push(`${at(key)}: ${unplayed} played at no Tier it offers (${tiersWord} ${plural(played, 'Beat')} at most)`);
    }

    if ((row.finale === undefined) !== (row.finaleLine === undefined)) finaleProblems.push(`${at(key)}: finale and finaleLine are given together or not at all`);
    if (finale !== null && !encounters.some(([encounter]) => encounter === finale)) finaleProblems.push(`${at(key, ['finale'])}: "${finale}" is not an Encounter`);
    if (finale !== null && typeof row.finaleLine === 'string' && row.finaleLine.trim() === '') finaleProblems.push(`${at(key, ['finaleLine'])} is empty`);
    beats.forEach((beat, index) =>
      (beat.pool.encounters ?? []).forEach((named, place) => {
        if (finales.has(named)) finaleProblems.push(`${at(key, ['beats', index, 'pool', 'encounters', place])}: "${named}" is a Finale, played last, which no Beat draws`);
      }),
    );
  }

  const drawn = encounters.flatMap(([key]) =>
    finales.has(key) || drawnAnywhere.has(key) ? [] : [`${placeOf(questSources.encounters, [key])}: no Beat a Tier plays may draw it, and it is no Finale, so no Quest meets it`],
  );
  return {
    templates: templates.length,
    pools: check(beatCount, pools),
    tiers: check(tierCount, tiers),
    drawn: check(encounters.length, drawn),
    finales: check(finales.size, finaleProblems),
    notes,
  };
}

/** Each problem of `checks`. */
function problemsOf(checks: QuestChecks): string[] {
  return [checks.pools, checks.tiers, checks.drawn, checks.finales].flatMap((each) => each.problems);
}

export function questsDoctor(root: string): QuestsDoctor {
  const editor = new QuestsEditor(root);
  let finish: QuestsDoctor['finish'];
  let pending: QuestsDoctor['pending'];
  try {
    finish = { running: false, recovered: editor.recover() };
    let edits = 0;
    try {
      edits = editor.edits().length;
    } catch {
      // Named among the problems below.
    }
    const problems = editor.pendingProblems();
    // The pending edits held to the doctor's checks too, where they apply and pass the content's.
    const held = problems.length === 0 && edits > 0 ? problemsOf(questChecks(editor.working())) : [];
    pending = { ok: problems.length === 0 && held.length === 0, edits, problems: [...problems, ...held] };
  } catch (error) {
    if (!(error instanceof Busy)) throw error;
    finish = { running: true, recovered: [] };
    pending = { ok: false, edits: 0, problems: [...error.problems] };
  }
  const content = contentChecks(root);
  const quests = questChecks(readContentFiles(root).values);
  return { ok: content.ok && problemsOf(quests).length === 0 && pending.ok, content, quests, pending, finish };
}

/** The doctor's report in lines for a person. */
export function questsDoctorText(report: QuestsDoctor): string[] {
  const line = (ok: boolean, passed: string, failed: string, problems: readonly string[]): string[] => (ok ? [`✓ ${passed}`] : [`✗ ${failed}`, ...problems.map((problem) => `    ${problem}`)]);
  const { quests } = report;
  const templates = plural(quests.templates, 'Quest template');
  return [
    ...(report.finish.recovered.length > 0 ? [`! A "Finish" was cut off: ${report.finish.recovered.length} files are put back as they were`] : []),
    ...line(report.content.ok, 'The content passes its checks', 'The content fails its checks', report.content.problems),
    ...line(quests.pools.ok, `Every Beat's pool may draw its Encounter: ${plural(quests.pools.count, 'Beat')} of ${templates}`, "A Beat's pool is too small", quests.pools.problems),
    ...line(quests.tiers.ok, `Every Tier offered plays its Beats: ${plural(quests.tiers.count, 'Tier')} of ${templates}`, 'A Tier offered cannot play its Beats', quests.tiers.problems),
    ...line(quests.drawn.ok, `Every Encounter is drawn by a Beat a Tier plays or is a Finale: ${plural(quests.drawn.count, 'Encounter')}`, 'An Encounter no Quest meets', quests.drawn.problems),
    ...line(quests.finales.ok, `The Finales are placed: ${quests.finales.count}, each an Encounter with its line, named by no pool, played last`, 'A Finale is not placed', quests.finales.problems),
    ...quests.notes.map((note) => `! ${note}`),
    ...line(
      report.pending.ok,
      report.pending.edits === 0 ? 'No pending edits' : `${plural(report.pending.edits, 'pending edit')}, passing the content's checks and these`,
      report.finish.running ? '"Finish" is running' : 'The pending edits fail',
      report.pending.problems,
    ),
  ];
}
