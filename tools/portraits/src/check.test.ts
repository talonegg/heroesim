import { appendFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { check } from './check.js';
import { run } from './cli.js';
import { readJson, root, scratchRepository, writeJson } from './test-support.js';

// `check` (v1.1.3-S2): passes on the tree as shipped, and fails on each thing wrong, naming it.

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});
function scratch(): string {
  const { dir, remove } = scratchRepository();
  scratches.push(remove);
  return dir;
}

/** The command line's JSON and exit code for a command. */
async function cli(...argv: string[]): Promise<{ code: number; json: { ok: boolean; failures: { code: string; key?: string; message: string }[] } }> {
  let out = '';
  const code = await run([...argv, '--json'], { out: (text) => (out += text), err: () => undefined });
  return { code, json: JSON.parse(out) };
}

describe('check', () => {
  test('passes on the tree as shipped', async () => {
    const result = check(root);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.live).toBe(40); // gm-female-01..20 and gm-male-01..20, since v1.1.3-S4
    expect(await cli('check')).toMatchObject({ code: 0, json: { ok: true, failures: [] } });
  });

  test('fails on a missing thumbnail, naming it', async () => {
    const dir = scratch();
    rmSync(path.join(dir, 'media/portraits/guildmasters/male/gm-male-01.thumb.webp'));
    const { code, json } = await cli('check', '--root', dir);
    expect(code).toBe(1);
    expect(json.failures).toEqual([
      expect.objectContaining({
        code: 'missing-thumbnail',
        key: 'gm-male-01',
        message: 'gm-male-01 is live in the register, and its thumbnail media/portraits/guildmasters/male/gm-male-01.thumb.webp is missing',
      }),
    ]);
  });

  test('fails on a live key content/portraits.json does not list, naming it', () => {
    const dir = scratch();
    const portraits = readJson<Record<string, Record<string, string[]>>>(dir, 'content/portraits.json');
    portraits.guildmaster = { ...portraits.guildmaster, female: (portraits.guildmaster?.female ?? []).filter((key) => key !== 'gm-female-01') };
    writeJson(dir, 'content/portraits.json', portraits);
    expect(check(dir).failures).toEqual([
      expect.objectContaining({
        code: 'unlisted-key',
        key: 'gm-female-01',
        message: 'gm-female-01 is live in the register, and content/portraits.json does not list it under guildmaster.female',
      }),
    ]);
  });

  test('fails on an oversized picture, naming it and its size', () => {
    const dir = scratch();
    const file = path.join(dir, 'media/portraits/guildmasters/female/gm-female-01.webp');
    const size = readFileSync(file).length;
    appendFileSync(file, Buffer.alloc(120_001 - size));
    expect(check(dir).failures).toEqual([
      expect.objectContaining({
        code: 'oversized',
        key: 'gm-female-01',
        message: 'media/portraits/guildmasters/female/gm-female-01.webp: the picture of gm-female-01 is 120001 bytes, over the 120000 allowed',
      }),
    ]);
  });

  test('fails on a picture with no key, a key listed but not live, a missing row and a missing picture, naming each', () => {
    const dir = scratch();
    const registry = readJson<{ portraits: Record<string, { status: string }> }>(dir, 'media/portraits/registry.json');
    const male = registry.portraits['gm-male-01'];
    if (male === undefined) throw new Error('the register has no gm-male-01');
    male.status = 'retired';
    writeJson(dir, 'media/portraits/registry.json', registry);
    const appearances = readJson<{ portraits: Record<string, unknown> }>(dir, 'content/portrait-appearances.json');
    delete appearances.portraits['gm-female-01'];
    writeJson(dir, 'content/portrait-appearances.json', appearances);
    rmSync(path.join(dir, 'media/portraits/guildmasters/female/gm-female-01.webp'));
    copyFileSync(path.join(dir, 'media/portraits/guildmasters/female/gm-female-01.thumb.webp'), path.join(dir, 'media/portraits/heroes/female/hero-female-01.thumb.webp'));

    const codes = check(dir).failures.map((failure) => `${failure.code} ${failure.key ?? ''} ${failure.file ?? ''}`);
    expect(codes.sort()).toEqual(
      [
        'missing-picture gm-female-01 media/portraits/guildmasters/female/gm-female-01.webp',
        'unregistered-file hero-female-01 media/portraits/heroes/female/hero-female-01.thumb.webp',
        'retired-file gm-male-01 media/portraits/guildmasters/male/gm-male-01.thumb.webp',
        'retired-file gm-male-01 media/portraits/guildmasters/male/gm-male-01.webp',
        'listed-not-live gm-male-01 content/portraits.json',
        'missing-row gm-female-01 content/portrait-appearances.json',
      ].sort(),
    );
  });

  test('fails on a broken register, and says so', async () => {
    const dir = scratch();
    appendFileSync(path.join(dir, 'media/portraits/registry.json'), '}');
    const { code, json } = await cli('check', '--root', dir);
    expect(code).toBe(1);
    expect(json.failures).toEqual([expect.objectContaining({ code: 'register' })]);
  });
});
