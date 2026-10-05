// `npm run quest-review` (v1.1.4-S9, DL-162): writes the review page of the drafts. The page is the
// words' (`reviewPage` in `@heroesim/words`, since v1.1.6-S12, DL-186 item 1), where the harness and
// the tools may read it; this reads the files it is made from and writes it, on Node.
//
// It reads the drafts (`docs/quests/drafts/`, with the core content beside them, `loadDrafts`), the
// calibration's data (`docs/quests/calibration.json`, which `npm run harness -- calibrate` writes) and
// the drafts' notes (`docs/quests/drafts/notes.json`), and writes `docs/quests/v1.1.4-review.html`.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentDir, loadContent, loadDrafts } from '@heroesim/content/node';
import { reviewPage, type ReviewCalibration, type ReviewNotes } from '@heroesim/words';

/** The repository's root, from the content package's directory. */
const root = join(contentDir, '..');

if (import.meta.main) {
  const quests = join(root, 'docs', 'quests');
  const { content } = loadDrafts(join(quests, 'drafts'));
  const calibration = JSON.parse(readFileSync(join(quests, 'calibration.json'), 'utf8')) as ReviewCalibration;
  const notes = JSON.parse(readFileSync(join(quests, 'drafts', 'notes.json'), 'utf8')) as ReviewNotes;
  const now = new Date();
  const made = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // `npm run quest-review -- --fragment --out <path>` writes the fragment a publisher wraps.
  const args = process.argv.slice(2);
  const fragment = args.includes('--fragment');
  const at = args.indexOf('--out');
  const out = at === -1 ? undefined : args[at + 1];
  const unknown = args.filter((it, index) => it !== '--fragment' && it !== '--out' && !(at !== -1 && index === at + 1));
  if ((at !== -1 && (out === undefined || out.startsWith('--'))) || unknown.length > 0) {
    throw new Error(`Usage: npm run quest-review -- [--fragment] [--out <path>]; not ${JSON.stringify(args)}`);
  }
  const path = out ?? join(quests, 'v1.1.4-review.html');
  writeFileSync(path, reviewPage({ content, core: loadContent(), calibration, notes, made }, { fragment }), 'utf8');
  console.log(`Wrote ${path}`);
}
