import { existsSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { chromium, type Page } from '@playwright/test';
import { readContentVersion } from '@heroesim/content/write';
import { afterEach, describe, expect, test } from 'vitest';
import { Editor } from './editor.js';
import { serve, type Served } from './server.js';
import { json, plantOutcome, readContentJson, scratchRepository, status } from './test-support.js';
import { npmTest, type TestRunner } from './tests-run.js';

// The editor's page (v1.1.4-S12, DL-150 item 7): each of its actions driven through the API it calls,
// on a scratch copy served on a free port, and once through the page itself in Chromium. "Finish" runs
// the scratch copy's planted `npm test`, as the commands' tests do.

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function served(runTests: TestRunner = npmTest, options: { engine?: boolean } = {}): Promise<{ dir: string; page: Served; api: (method: string, path: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }> }> {
  const { dir, remove } = scratchRepository(options);
  cleanups.push(remove);
  const page = await serve({ root: dir, port: 0, runTests });
  cleanups.push(() => page.close());
  // As the page calls it: every change in JSON.
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(new URL(path, page.url), {
      method,
      ...(method === 'GET' ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
    });
    return { status: response.status, json: (await response.json()) as Record<string, unknown> };
  };
  return { dir, page, api };
}

type Rows = { rows: { key: string; list: string; row: Record<string, unknown>; uses: { at: string }[]; pending: string | null }[]; pending: unknown[] };

describe('the API', () => {
  test('serves the page, and the table: the forms, every row with its uses, and the pending edits', async () => {
    const { dir, page, api } = await served();
    const html = await (await fetch(page.url)).text();
    expect(html).toContain('<title>Content editor: Traits</title>');
    expect((await fetch(new URL('page.js', page.url))).status).toBe(200);
    expect((await fetch(new URL('../package.json', page.url))).status).toBe(404);

    const { status: code, json } = await api('GET', '/api/traits');
    expect(code).toBe(200);
    const forms = json.forms as { list: string; fields: { name: string }[]; effects: { kind: string }[] }[];
    expect(forms.map((form) => [form.list, form.fields.map((field) => field.name), form.effects.map((effect) => effect.kind)])).toEqual([
      ['guildmaster', ['name', 'cost', 'excludes', 'effects'], ['classStatBonus', 'guildMoraleShift', 'upkeepFactor']],
      ['hero', ['name', 'excludes', 'effects'], ['statModifiers', 'encounterBonus']],
    ]);
    const shipped = ['guildmaster-traits.json', 'hero-traits.json'] as const;
    expect((json as unknown as Rows).rows).toHaveLength(shipped.reduce((sum, file) => sum + Object.keys(readContentJson(dir, file)).length, 0));
    expect((await api('GET', '/api/traits/lame')).json).toMatchObject({ key: 'lame', list: 'hero' });
  });

  test('adds, changes and removes, refusing a removal while used with every use, and finds', async () => {
    const { dir, api } = await served();
    const added = await api('POST', '/api/traits', { list: 'hero', key: 'brave', name: 'Brave', excludes: ['scarred'], effects: [{ kind: 'encounterBonus', flat: 2, kinds: ['combat'] }] });
    expect(added.status).toBe(200);
    expect((added.json as unknown as Rows).pending).toHaveLength(1);
    expect((added.json as unknown as Rows).rows.find((row) => row.key === 'scarred')?.row.excludes).toEqual(['brave']);

    const badKey = await api('POST', '/api/traits', { list: 'hero', key: 'Brave', name: 'Brave' });
    expect(badKey).toMatchObject({ status: 422, json: { ok: false, kind: 'refused' } });
    const noBody = await api('POST', '/api/traits', {});
    expect(noBody.status).toBe(400);

    const changed = await api('PUT', '/api/traits/brave', { name: 'Bold' });
    expect((changed.json as unknown as Rows).rows.find((row) => row.key === 'brave')?.row).toEqual({ name: 'Bold', excludes: ['scarred'], effects: [{ kind: 'encounterBonus', flat: 2, kinds: ['combat'] }] });
    const rekeyed = await api('PUT', '/api/traits/brave', { key: 'bold' });
    expect(rekeyed.status).toBe(422);

    const refused = await api('DELETE', '/api/traits/scarred');
    expect(refused.status).toBe(409);
    expect((refused.json.uses as { at: string }[]).map((use) => use.at)).toEqual([
      'injuries.json: deep-cut.leavesTrait',
      'descriptions.json: heroBiography.traits.scarred.0',
      'descriptions.json: heroBiography.traits.scarred.1',
      'descriptions.json: heroBiography.traits.scarred.2',
      'portrait-appearances.json: features.scar.shows.0',
    ]);
    const removed = await api('DELETE', '/api/traits/brave');
    expect(removed.status).toBe(200);
    expect((removed.json.removed as { stripped: { at: string }[] }).stripped.map((use) => use.at)).toEqual(['hero-traits.json: scarred.excludes.0']);

    const found = await api('GET', '/api/find?text=upkeep');
    expect((found.json.found as { key: string }[]).map((each) => each.key)).toEqual(['thrifty', 'spendthrift']);
    expect(status(dir)).toBe('');
  });

  test('discards, and runs the doctor', async () => {
    const { api } = await served(npmTest, { engine: true });
    await api('PUT', '/api/traits/lame', { name: 'Limping' });
    const discarded = await api('POST', '/api/discard', {});
    expect(discarded.json.discarded).toEqual({ discarded: 1, left: 0 });
    expect((discarded.json as unknown as Rows).pending).toEqual([]);
    expect((await api('GET', '/api/doctor')).json).toMatchObject({ ok: true, drift: { ok: true }, freshness: { ok: true }, content: { ok: true } });
  });

  test('"Finish" shows the run\'s lines and result: put back on a failure, the version raised once on a pass', async () => {
    const { dir, page, api } = await served();
    const version = readContentVersion(dir);
    await api('PUT', '/api/traits/thrifty', { cost: 3 });

    plantOutcome(dir, 'fail');
    expect((await api('POST', '/api/finish')).status).toBe(202);
    await page.finishing();
    const failed = (await api('GET', '/api/finish')).json;
    expect(failed).toMatchObject({ state: 'failed', kind: 'undone', problems: ['FAIL  |content| src/planted.test.ts > a planted test fails', '× a planted test fails'] });
    expect(failed.lines).toEqual(expect.arrayContaining([expect.stringContaining('Running the tests'), ' RUN  the planted tests']));
    expect(status(dir)).toBe('');
    expect(readContentVersion(dir)).toBe(version);

    plantOutcome(dir, 'pass');
    await api('POST', '/api/finish');
    await page.finishing();
    const passed = (await api('GET', '/api/finish')).json;
    expect(passed).toMatchObject({ state: 'passed', result: { edits: 1, changed: ['guildmaster-traits.json'], contentVersion: { from: version, to: version + 1 } } });
    expect(readContentVersion(dir)).toBe(version + 1);
    expect(readContentJson<Record<string, { cost: number }>>(dir, 'guildmaster-traits.json').thrifty?.cost).toBe(3);
    expect((await api('GET', '/api/traits')).json.pending).toEqual([]);
  });

  test('refuses a second "Finish", and every other call, while one runs; and clears only the edits it read', async () => {
    const { runner, release } = heldRunner();
    const { dir, page, api } = await served(runner);
    await api('PUT', '/api/traits/thrifty', { cost: 3 });
    expect((await api('POST', '/api/finish')).status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await api('GET', '/api/finish')).json).toMatchObject({ state: 'running', lines: [expect.stringContaining('Running the tests'), 'Running…'] });
    expect((await api('POST', '/api/finish')).status).toBe(409);

    // Each edit, and each read of the rows, waits for it: one made now would be cleared with the rest.
    for (const [method, path, body] of [
      ['POST', '/api/traits', { list: 'hero', key: 'brave', name: 'Brave' }],
      ['PUT', '/api/traits/lame', { name: 'Limping' }],
      ['DELETE', '/api/traits/scarred', undefined],
      ['POST', '/api/discard', {}],
      ['GET', '/api/traits', undefined],
    ] as const) {
      const refused = await api(method, path, body);
      expect([method, path, refused.status, refused.json.kind]).toEqual([method, path, 409, 'busy']);
    }
    // So does a command line, in another process or this one.
    const cli = await json<{ kind: string; problems: string[] }>(dir, 'traits', 'change', 'lame', '--name', 'Limping');
    expect(cli.code).toBe(1);
    expect(cli.json).toMatchObject({ kind: 'busy', problems: [expect.stringContaining('"Finish" is running'), expect.stringContaining('traits recover --force')] });
    expect((await json<{ finish: { running: boolean }; ok: boolean }>(dir, 'traits', 'doctor')).json).toMatchObject({ ok: false, finish: { running: true } });
    // `pending` and `doc` too (v1.1.4-S14).
    for (const argv of [['pending'], ['doc']]) {
      const refused = await json<{ kind: string }>(dir, 'traits', ...argv);
      expect([argv[0], refused.code, refused.json.kind]).toEqual([argv[0], 1, 'busy']);
    }

    release(true);
    await page.finishing();
    expect((await api('GET', '/api/finish')).json.state).toBe('passed');
    expect(readContentJson<Record<string, { name: string }>>(dir, 'hero-traits.json').lame?.name).toBe('Lame');
    expect((await api('GET', '/api/traits')).json.pending).toEqual([]);
  });

  test('a "Finish" started from the page while another runs is refused as busy, not as a Finish put back (v1.1.4-S14)', async () => {
    const { dir, page, api } = await served();
    await api('PUT', '/api/traits/thrifty', { cost: 3 });
    // Another "Finish", as a command line's, holds the lock.
    const { runner, release } = heldRunner();
    const other = new Editor(dir).finish(runner).catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await api('POST', '/api/finish')).status).toBe(202);
    await page.finishing();
    expect((await api('GET', '/api/finish')).json).toMatchObject({ state: 'failed', kind: 'busy', problems: [expect.stringContaining('"Finish" is running'), expect.stringContaining('names process')] });
    release(false);
    await other;
    expect(status(dir)).toBe('');
  });

  test('answers only its own page: another Host, another Origin, or a change not sent as JSON is refused', async () => {
    const { page, api } = await served();
    const port = new URL(page.url).port;
    const raw = (method: string, path: string, headers: Record<string, string>, body?: string) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const request = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (response) => {
          let text = '';
          response.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
          response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text }));
        });
        request.on('error', reject);
        request.end(body);
      });
    const add = JSON.stringify({ list: 'hero', key: 'brave', name: 'Brave' });

    // A name rebound to this machine (DNS rebinding) reaches nothing, the page included.
    expect((await raw('GET', '/api/traits', { host: `evil.example:${port}` })).status).toBe(403);
    expect((await raw('GET', '/', { host: `evil.example:${port}` })).status).toBe(403);
    // Another site's page may not post, even as JSON.
    const evil = await raw('POST', '/api/traits', { host: `127.0.0.1:${port}`, origin: 'http://evil.example', 'content-type': 'application/json' }, add);
    expect(evil.status).toBe(403);
    expect(JSON.parse(evil.body)).toMatchObject({ ok: false, problems: ['a request from http://evil.example is not the editor\'s page'] });
    // A form's text/plain, which needs no leave to cross origins, is refused.
    expect((await raw('POST', '/api/traits', { host: `127.0.0.1:${port}`, 'content-type': 'text/plain' }, add)).status).toBe(415);
    expect((await raw('POST', '/api/finish', { host: `localhost:${port}` })).status).toBe(415);
    expect((await api('GET', '/api/traits')).json.pending).toEqual([]);

    // Its own page, by either name, may.
    expect((await raw('POST', '/api/traits', { host: `localhost:${port}`, origin: `http://localhost:${port}`, 'content-type': 'application/json' }, add)).status).toBe(200);
    expect((await raw('GET', '/api/traits', { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` })).status).toBe(200);
  });
});

/** A test run that waits until released, passing or failing as it is told. */
function heldRunner(): { runner: TestRunner; release: (ok: boolean) => void } {
  let release: (ok: boolean) => void = () => {};
  const runner: TestRunner = (_root, onLine) =>
    new Promise((resolve) => {
      onLine('Running…');
      release = (ok) => resolve({ ok, exitCode: ok ? 0 : 1, failures: ok ? [] : ['× held'], tail: [] });
    });
  return { runner, release: (ok) => release(ok) };
}

function chromiumInstalled(): boolean {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

// The page itself, at a desktop width, each of its controls driven as the owner drives them (v1.1.4-S12;
// every control since v1.1.4-S14): Find, the forms to add and change, Remove refused and done,
// Discard, Doctor and "Finish", passed, failed and refused while another runs. `assign` and
// `unassign` are the commands' alone, by DL-163 item 6, so the page has no control for them. Skipped
// where Chromium is not installed.
describe.skipIf(!chromiumInstalled())('the page in Chromium', () => {
  async function opened(runTests: TestRunner): Promise<{ dir: string; tab: Page; api: Awaited<ReturnType<typeof served>>['api'] }> {
    const { dir, page, api } = await served(runTests, { engine: true });
    const browser = await chromium.launch();
    cleanups.push(() => browser.close());
    const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    tab.on('dialog', (dialog) => void dialog.accept());
    await tab.goto(page.url);
    await tab.locator('section[data-list=hero] tr[data-key=lame]').waitFor();
    return { dir, tab, api };
  }
  const shown = (tab: Page): Promise<string[]> => tab.locator('tr[data-key]:not(.is-hidden)').evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.key ?? ''));

  test('finds, adds, changes, removes, discards and runs the doctor through its own controls (v1.1.4-S14)', async () => {
    const { tab } = await opened(npmTest);
    expect(await tab.locator('section[data-list=guildmaster] tbody tr').count()).toBe(6);
    expect(await tab.locator('tr[data-key=thrifty] td').nth(3).innerText()).toBe('Upkeep × 0.9');

    // Find hides the rows that do not hold the text, and shows them again when it is cleared.
    await tab.locator('#find').fill('upkeep');
    await tab.locator('tr[data-key=lame]').waitFor({ state: 'hidden' });
    expect(await shown(tab)).toEqual(['thrifty', 'spendthrift']);
    await tab.locator('#find').fill('');
    await tab.locator('tr[data-key=lame]').waitFor({ state: 'visible' });
    expect(await shown(tab)).toHaveLength(16);

    // A Guildmaster Trait with an Upkeep factor, excluding spendthrift, which then excludes it.
    await tab.getByRole('button', { name: 'Add a Guildmaster Trait' }).click();
    await tab.locator('#form input[name=key]').fill('frugal');
    await tab.locator('#form input[name=name]').fill('Frugal');
    await tab.locator('#form input[name=cost]').fill('1');
    await tab.locator('#form [data-name=excludes] input[value=spendthrift]').check();
    await tab.getByRole('button', { name: 'Add an effect' }).click();
    await tab.locator('#effects .effect select[name=kind]').selectOption('upkeepFactor');
    await tab.locator('#effects [data-field=factor] input').fill('0.95');
    await tab.getByRole('button', { name: 'Save as pending' }).click();
    await tab.locator('tr[data-key=frugal]').waitFor();
    expect(await tab.locator('tr[data-key=frugal]').innerText()).toContain('Upkeep × 0.95');
    expect(await tab.locator('tr[data-key=spendthrift] td').nth(4).innerText()).toContain('frugal');
    expect(await tab.locator('#message').innerText()).toBe('Added frugal, pending.');

    // The Change form, saved.
    await tab.locator('tr[data-key=lame] button[data-action=change]').click();
    await tab.locator('#form input[name=name]').fill('Limping');
    await tab.getByRole('button', { name: 'Save as pending' }).click();
    await tab.locator('tr[data-key=lame]', { hasText: 'Limping' }).waitFor();
    expect(await tab.locator('tr[data-key=lame]').innerText()).toContain('Changed, pending');
    expect(await tab.locator('#pending').innerText()).toBe('2 pending edits');

    // An unused Trait removed: taken out of spendthrift's excludes, and its add gone with it.
    await tab.locator('tr[data-key=frugal] button[data-action=remove]').click();
    await tab.locator('#message', { hasText: 'Removed frugal, pending.' }).waitFor();
    expect(await tab.locator('#message li').allInnerTexts()).toEqual(['Taken out of guildmaster-traits.json: spendthrift.excludes.2']);
    expect(await tab.locator('tr[data-key=frugal]').count()).toBe(0);
    expect(await tab.locator('tr[data-key=spendthrift] td').nth(4).innerText()).not.toContain('frugal');
    expect(await tab.locator('#pending').innerText()).toBe('1 pending edit');

    // The doctor, then Discard.
    await tab.getByRole('button', { name: 'Doctor' }).click();
    await tab.locator('#message', { hasText: 'The doctor finds nothing wrong' }).waitFor();
    await tab.getByRole('button', { name: 'Discard the pending edits' }).click();
    await tab.locator('#message', { hasText: 'Discarded 1 pending edit.' }).waitFor();
    expect(await tab.locator('#pending').innerText()).toBe('No pending edits');
    expect(await tab.locator('tr[data-key=lame] td').nth(1).innerText()).toBe('Lame');
    expect(await tab.locator('#discard').isDisabled()).toBe(true);
  });

  test('shows a failed "Finish" put back, and tells a "Finish" running elsewhere from a use or a failure (v1.1.4-S14)', async () => {
    const { runner, release } = heldRunner();
    const { dir, tab, api } = await opened(runner);
    await api('PUT', '/api/traits/thrifty', { cost: 3 });
    await tab.reload();
    await tab.locator('#pending', { hasText: '1 pending edit' }).waitFor();

    // A test fails: every file put back, the edit still pending, the failures shown.
    await tab.getByRole('button', { name: 'Finish' }).click();
    await tab.locator('#finish-state', { hasText: 'The tests are running' }).waitFor();
    release(false);
    await tab.locator('#finish-state', { hasText: 'Not finished: every file is put back, and the edits stay pending.' }).waitFor();
    expect(await tab.locator('#message li').allInnerTexts()).toEqual(['× held']);
    expect(status(dir)).toBe('');
    await tab.locator('#finish:not([disabled])').waitFor();
    expect(await tab.locator('#pending').innerText()).toBe('1 pending edit');

    // Another "Finish", as a command line's, holds the lock: a removal and a Finish are refused as busy.
    const other = heldRunner();
    const finishing = new Editor(dir).finish(other.runner).catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await tab.locator('tr[data-key=lame] button[data-action=remove]').click();
    await tab.locator('#message', { hasText: 'Not removed: "Finish" is running' }).waitFor();
    expect(await tab.locator('#message').innerText()).not.toContain('is used');
    await tab.getByRole('button', { name: 'Finish' }).click();
    await tab.locator('#finish-state', { hasText: 'Not started: another "Finish" is running.' }).waitFor();
    expect(await tab.locator('#message').innerText()).not.toContain('every file is put back');
    other.release(false);
    await finishing;
    expect(status(dir)).toBe('');
  });

  test('shows the tables, adds through the form, names the uses of a refused removal, and finishes', async () => {
    const { runner, release } = heldRunner();
    const { dir, tab } = await opened(runner);

    await tab.getByRole('button', { name: 'Add a Hero Trait' }).click();
    await tab.locator('#form input[name=key]').fill('brave');
    await tab.locator('#form input[name=name]').fill('Brave');
    await tab.locator('#form [data-name=excludes] input[value=scarred]').check();
    await tab.getByRole('button', { name: 'Add an effect' }).click();
    await tab.locator('#effects .effect').getByRole('button', { name: 'Add a Stat change' }).click();
    await tab.locator('#effects .stat-change select').selectOption('courage');
    await tab.locator('#effects .stat-change input').fill('2');
    await tab.getByRole('button', { name: 'Save as pending' }).click();
    await tab.locator('tr[data-key=brave]').waitFor();
    expect(await tab.locator('tr[data-key=brave]').innerText()).toContain('+2 courage');
    expect(await tab.locator('#pending').innerText()).toBe('1 pending edit');

    await tab.locator('tr[data-key=lame] button[data-action=remove]').click();
    await tab.locator('#message li').first().waitFor();
    expect(await tab.locator('#message').innerText()).toContain('Not removed: lame is used.');
    expect(await tab.locator('#message li').allInnerTexts()).toEqual([
      'injuries.json: shattered-knee.leavesTrait',
      ...[0, 1, 2].map((index) => `descriptions.json: heroBiography.traits.lame.${index}`),
    ]);

    await tab.locator('tr[data-key=brave] button[data-action=change]').click();
    expect(await tab.locator('#form input[name=key]').getAttribute('readonly')).not.toBeNull();
    await tab.getByRole('button', { name: 'Cancel' }).click();

    await tab.getByRole('button', { name: 'Finish' }).click();
    // While it runs, every control that changes anything waits.
    await tab.locator('#finish-state', { hasText: 'The tests are running' }).waitFor();
    for (const control of ['#add-hero', '#add-guildmaster', '#discard', '#finish', 'tr[data-key=lame] button[data-action=remove]', 'tr[data-key=brave] button[data-action=change]']) {
      expect([control, await tab.locator(control).isDisabled()]).toEqual([control, true]);
    }
    release(true);
    await tab.locator('#finish-state', { hasText: 'Finished: the tests passed.' }).waitFor();
    expect(await tab.locator('#finish-lines').innerText()).toContain('Running…');
    expect(await tab.locator('#add-hero').isDisabled()).toBe(false);
    expect(readContentJson<Record<string, unknown>>(dir, 'hero-traits.json').brave).toEqual({ name: 'Brave', excludes: ['scarred'], effects: [{ kind: 'statModifiers', modifiers: { courage: 2 } }] });
    expect(await tab.locator('#pending').innerText()).toBe('No pending edits');
  });
});
