import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { readContentVersion } from '@heroesim/portraits';
import { afterEach, describe, expect, test } from 'vitest';
import { serve, type Served } from './server.js';
import { plantOutcome, readContentJson, scratchRepository, status } from './test-support.js';
import { npmTest, type TestRunner } from './tests-run.js';

// The editor's page (v1.1.4-S12, DL-150 item 7): each of its actions driven through the API it calls,
// on a scratch copy served on a free port, and once through the page itself in Chromium. "Finish" runs
// the scratch copy's planted `npm test`, as the commands' tests do.

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function served(runTests: TestRunner = npmTest): Promise<{ dir: string; page: Served; api: (method: string, path: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }> }> {
  const { dir, remove } = scratchRepository();
  cleanups.push(remove);
  const page = await serve({ root: dir, port: 0, runTests });
  cleanups.push(() => page.close());
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(new URL(path, page.url), {
      method,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: response.status, json: (await response.json()) as Record<string, unknown> };
  };
  return { dir, page, api };
}

type Rows = { rows: { key: string; list: string; row: Record<string, unknown>; uses: { at: string }[]; pending: string | null }[]; pending: unknown[] };

describe('the API', () => {
  test('serves the page, and the table: the forms, every row with its uses, and the pending edits', async () => {
    const { page, api } = await served();
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
    expect((json as unknown as Rows).rows).toHaveLength(10);
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
      'descriptions.json: heroBiography.traits.scarred',
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
    const { api } = await served();
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
    expect(failed).toMatchObject({ state: 'failed', problems: ['FAIL  |content| src/planted.test.ts > a planted test fails', '× a planted test fails'] });
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

  test('refuses a second "Finish" while one runs', async () => {
    let release: () => void = () => {};
    const held: TestRunner = (_root, onLine) =>
      new Promise((resolve) => {
        onLine('Running…');
        release = () => resolve({ ok: true, exitCode: 0, failures: [], tail: [] });
      });
    const { page, api } = await served(held);
    await api('PUT', '/api/traits/thrifty', { cost: 3 });
    expect((await api('POST', '/api/finish')).status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await api('GET', '/api/finish')).json).toMatchObject({ state: 'running', lines: [expect.stringContaining('Running the tests'), 'Running…'] });
    expect((await api('POST', '/api/finish')).status).toBe(409);
    release();
    await page.finishing();
    expect((await api('GET', '/api/finish')).json.state).toBe('passed');
  });
});

function chromiumInstalled(): boolean {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

// One pass through the page itself, at a desktop width: the table, a Trait added through its form,
// a removal refused naming each use, and "Finish". Skipped where Chromium is not installed.
describe.skipIf(!chromiumInstalled())('the page in Chromium', () => {
  test('shows the tables, adds through the form, names the uses of a refused removal, and finishes', async () => {
    const { dir, page } = await served();
    const browser = await chromium.launch();
    cleanups.push(() => browser.close());
    const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    tab.on('dialog', (dialog) => void dialog.accept());
    await tab.goto(page.url);

    await tab.locator('section[data-list=hero] tr[data-key=lame]').waitFor();
    expect(await tab.locator('section[data-list=guildmaster] tbody tr').count()).toBe(6);
    expect(await tab.locator('tr[data-key=thrifty] td').nth(3).innerText()).toBe('Upkeep × 0.9');

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
    expect(await tab.locator('#message li').allInnerTexts()).toEqual(['injuries.json: shattered-knee.leavesTrait', 'descriptions.json: heroBiography.traits.lame']);

    await tab.locator('tr[data-key=brave] button[data-action=change]').click();
    expect(await tab.locator('#form input[name=key]').getAttribute('readonly')).not.toBeNull();
    await tab.getByRole('button', { name: 'Cancel' }).click();

    await tab.getByRole('button', { name: 'Finish' }).click();
    await tab.locator('#finish-state', { hasText: 'Finished: the tests passed.' }).waitFor();
    expect(await tab.locator('#finish-lines').innerText()).toContain('RUN  the planted tests');
    expect(readContentJson<Record<string, unknown>>(dir, 'hero-traits.json').brave).toEqual({ name: 'Brave', excludes: ['scarred'], effects: [{ kind: 'statModifiers', modifiers: { courage: 2 } }] });
    expect(await tab.locator('#pending').innerText()).toBe('No pending edits');
  });
});
