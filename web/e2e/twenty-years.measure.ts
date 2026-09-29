import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { region, thisGame } from './support';

// The measure (M7-S4's first box, DL-67): a twenty-year save from `npm run harness:sample`
// (harness/samples/twenty-years.json, gitignored, M2-S12) through IndexedDB in a real browser, the
// built page in Playwright's Chromium, driven through its own controls. The round trip is a save
// (serialise, gzip, the write committed) and a load after the page is reloaded (the read, gunzip,
// deserialise, and the game shown). Each is timed in the page, from the button's click to the DOM
// showing it done, `rounds` times. The storage alone (IndexedDB and gzip, no engine) is timed too,
// and the compressed size read from IndexedDB. Run with `npm run measure -w web`. The saves are the
// game menu's (M9-S3, DL-103).

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const samplePath = path.join(repoRoot, 'harness', 'samples', 'twenty-years.json');
const saveName = 'twenty-years';
const rounds = 3;

/** Clicks `selector` in the page and resolves with the milliseconds until `testId`'s text satisfies `done` and the page is idle. */
function clickAndTime(page: Page, selector: string, testId: string, done: { equals?: string; startsWith?: string }): Promise<number> {
  return page.evaluate(
    ({ selector, testId, done }) =>
      new Promise<number>((resolve, reject) => {
        const met = (): boolean => {
          const text = document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '';
          const idle = document.querySelector('main')?.getAttribute('aria-busy') === 'false';
          return idle && (done.equals !== undefined ? text === done.equals : text.startsWith(done.startsWith ?? ''));
        };
        const button = document.querySelector<HTMLButtonElement>(selector);
        if (button === null) {
          reject(new Error(`nothing matches ${selector}`));
          return;
        }
        const start = performance.now();
        const observer = new MutationObserver(() => {
          if (!met()) return;
          observer.disconnect();
          resolve(performance.now() - start);
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
        button.click();
      }),
    { selector, testId, done },
  );
}

/** IndexedDB and gzip alone, on the save kept: read and gunzip it, gzip it again and write it under another name. */
function storageAlone(page: Page, name: string): Promise<{ readMs: number; gunzipMs: number; gzipMs: number; writeMs: number; compressedBytes: number; textBytes: number }> {
  return page.evaluate(async (name) => {
    const requested = <T,>(request: IDBRequest<T>): Promise<T> =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const committed = (transaction: IDBTransaction): Promise<void> =>
      new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    const database = await requested(indexedDB.open('heroesim.saves'));
    let start = performance.now();
    const record = (await requested(database.transaction('saves').objectStore('saves').get(name))) as { data: Blob };
    const bytes = await record.data.arrayBuffer();
    const readMs = performance.now() - start;
    start = performance.now();
    const text = await new Response(new Response(bytes).body?.pipeThrough(new DecompressionStream('gzip'))).text();
    const gunzipMs = performance.now() - start;
    start = performance.now();
    const data = await new Response(new Response(text).body?.pipeThrough(new CompressionStream('gzip'))).blob();
    const gzipMs = performance.now() - start;
    start = performance.now();
    const writing = database.transaction('saves', 'readwrite');
    writing.objectStore('saves').put({ name: `${name}-scratch`, savedAt: '', data });
    await committed(writing);
    const writeMs = performance.now() - start;
    const removing = database.transaction('saves', 'readwrite');
    removing.objectStore('saves').delete(`${name}-scratch`);
    await committed(removing);
    database.close();
    return { readMs, gunzipMs, gzipMs, writeMs, compressedBytes: record.data.size, textBytes: new TextEncoder().encode(text).length };
  }, name);
}

test('a twenty-year save round-trips through IndexedDB: the time and the compressed size', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  if (!existsSync(samplePath)) throw new Error(`No sample at ${samplePath}: run "npm run harness:sample" first`);
  const sampleBytes = statSync(samplePath).size;
  await page.goto('/');

  // In through the file picker, as the CLI's save: timed from the picker's change to the game shown.
  const loadedFromFile = page.evaluate(
    () =>
      new Promise<{ ms: number; time: string }>((resolve) => {
        let start = 0;
        document.addEventListener('change', () => (start = performance.now()), { capture: true, once: true });
        const observer = new MutationObserver(() => {
          const time = document.querySelector('[data-testid="time"]')?.textContent ?? '';
          if (time === '' || document.querySelector('main')?.getAttribute('aria-busy') !== 'false') return;
          observer.disconnect();
          resolve({ ms: performance.now() - start, time });
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      }),
  );
  await region(page, 'A new game').getByLabel('Load a save file').setInputFiles(samplePath);
  const fromFile = await loadedFromFile;
  const turn = fromFile.time;

  const saves: number[] = [];
  const loads: number[] = [];
  for (let round = 0; round < rounds; round += 1) {
    await (await thisGame(page)).getByLabel('Save as').fill(saveName);
    saves.push(await clickAndTime(page, 'form[aria-label="Save in this browser"] button[type="submit"]', 'saves-status', { startsWith: `Saved as “${saveName}”` }));
    await page.reload();
    await expect(page.getByRole('button', { name: `Load ${saveName}` })).toBeVisible();
    loads.push(await clickAndTime(page, `button[aria-label="Load ${saveName}"]`, 'time', { equals: turn }));
  }
  const storage = await storageAlone(page, saveName);

  // The round trip changed nothing: the save kept, exported, is the sample byte for byte.
  const [exported] = await Promise.all([
    page.waitForEvent('download'),
    (await thisGame(page)).getByRole('button', { name: `Export ${saveName}` }).click(),
  ]);
  const exportedPath = testInfo.outputPath(`${saveName}.json`);
  await exported.saveAs(exportedPath);
  const same = readFileSync(exportedPath).equals(readFileSync(samplePath));

  const roundTrips = saves.map((save, index) => save + (loads[index] ?? 0));
  const figures = {
    sample: { path: path.relative(repoRoot, samplePath), bytes: sampleBytes, turn },
    compressedBytes: storage.compressedBytes,
    ratio: Number((sampleBytes / storage.compressedBytes).toFixed(1)),
    loadFromFileMs: Math.round(fromFile.ms),
    saveMs: saves.map(Math.round),
    loadMs: loads.map(Math.round),
    roundTripMs: roundTrips.map(Math.round),
    storageAloneMs: {
      readFromIndexedDb: Math.round(storage.readMs),
      gunzip: Math.round(storage.gunzipMs),
      gzip: Math.round(storage.gzipMs),
      writeToIndexedDb: Math.round(storage.writeMs),
    },
    underOneSecond: roundTrips.every((ms) => ms < 1000),
    exportIsTheSample: same,
    browser: `${page.context().browser()?.browserType().name()} ${page.context().browser()?.version()}`,
  };
  console.log(JSON.stringify(figures, null, 2));
  await testInfo.attach('twenty-years.json', { body: JSON.stringify(figures, null, 2), contentType: 'application/json' });

  expect(storage.textBytes).toBe(sampleBytes);
  expect(same, 'the save kept and exported is the sample, byte for byte').toBe(true);
});
