import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { guildPart, openView, startGame, statusBar, thisGame } from './support';

// The page opened from the filesystem shows its pictures (v1.1.2-S2; DL-125 item 1, the epic's gate),
// in a Playwright project of its own. The built page, `dist/index.html`, over file://: its Silhouettes,
// inlined into the one script, load. Then the page built again with a test picture
// (`vite build --mode file-spec`, e2e/fixtures/media.ts): the picture is a hashed file beside the
// script, the bundle gate passes, and over file:// a relative `<img>` the script made loads it. The
// picture is a Unique Item's, shown in the Stores once a save gives the Guild one; the owner's
// Portraits take its place from v1.1.2-S4.

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(webDir, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const gate = path.join(webDir, 'scripts', 'check-bundle.mjs');

/** A hashed picture beside the script: `barrow-kings-blade-CP5EOzYT.webp`. */
const hashedPicture = /^[a-z0-9]+(?:-[a-z0-9]+)*-[\w-]{8}\.webp$/;

/** Whether the `<img>` has loaded what it shows: complete, with a width of its own. */
async function loaded(image: Locator): Promise<boolean> {
  return image.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0);
}

/** Starts a game on the page opened from `url`. */
async function startedFrom(page: Page, url: string): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-file' });
  expect(errors).toEqual([]);
}

test('the built page, opened from the filesystem, loads its Silhouettes from its one script', async ({ page }) => {
  const dist = path.join(webDir, 'dist');
  await startedFrom(page, pathToFileURL(path.join(dist, 'index.html')).href);

  // The Guild's Banner beside its name in the status bar.
  const banner = statusBar(page).getByRole('heading', { level: 1 }).locator('img[data-picture="silhouette"]');
  await expect(banner).toHaveAttribute('src', /^data:image\/svg\+xml,/);
  await expect.poll(() => loaded(banner)).toBe(true);

  // The Guildmaster's Portrait, the Silhouette of their sex.
  const guildmaster = await openView(page, 'Guildmaster');
  const portrait = guildmaster.getByTestId('portrait').locator('img');
  await expect(portrait).toHaveAttribute('src', /^data:image\/svg\+xml,/);
  await expect.poll(() => loaded(portrait)).toBe(true);
  expect(await portrait.evaluate((image) => image.getBoundingClientRect().width)).toBeGreaterThan(0);

  // Beside the one script, the build holds only pictures of `media/`, each a hashed file.
  const beside = readdirSync(path.join(dist, 'assets')).filter((file) => !/^index-[\w-]+\.js$/.test(file));
  expect(beside.filter((file) => !hashedPicture.test(file))).toEqual([]);
});

test.describe('the page built with a test picture', () => {
  let outDir = '';

  test.beforeAll(() => {
    // A production build, as `npm run build` makes, into a folder of its own.
    test.setTimeout(180_000);
    outDir = mkdtempSync(path.join(tmpdir(), 'heroesim-file-spec-'));
    const env = { ...process.env };
    delete env.NODE_ENV;
    const built = spawnSync(process.execPath, [vite, 'build', '--mode', 'file-spec', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: webDir,
      encoding: 'utf8',
      env,
    });
    expect(built.status, `${built.stdout}${built.stderr}`).toBe(0);
  });

  test.afterAll(() => {
    if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
  });

  test('holds the picture as a hashed file beside the one script, and passes the bundle gate', () => {
    const assets = readdirSync(path.join(outDir, 'assets')).sort();
    expect(assets).toHaveLength(2);
    expect(assets.filter((file) => /^index-[\w-]+\.js$/.test(file))).toHaveLength(1);
    expect(assets.filter((file) => /^barrow-kings-blade-[\w-]{8}\.webp$/.test(file))).toHaveLength(1);
    const gated = spawnSync(process.execPath, [gate, outDir], { encoding: 'utf8' });
    expect(gated.stdout).toContain('no network or filesystem reference');
    expect(gated.status).toBe(0);
  });

  test('opened from the filesystem, loads the picture over its Silhouette', async ({ page }, testInfo) => {
    await startedFrom(page, pathToFileURL(path.join(outDir, 'index.html')).href);
    await withTheBlade(page, testInfo);

    const stores = await guildPart(page, 'Stores');
    const row = stores.getByRole('row').filter({ hasText: "The Barrow King's blade" });
    const picture = row.getByTestId('item-picture').locator('img[data-picture="picture"]');
    await expect(picture).toHaveAttribute('src', /^file:\/\/\/.+\/assets\/barrow-kings-blade-[\w-]{8}\.webp$/);
    await expect.poll(() => loaded(picture)).toBe(true);
    // Loaded, it stands in the Silhouette's place.
    await expect(row.getByTestId('item-picture').locator('img[data-picture="silhouette"]')).toHaveCount(0);
  });
});

/** The game in hand exported and loaded back with the Barrow King's blade in its Guild's Holding. */
async function withTheBlade(page: Page, testInfo: TestInfo): Promise<void> {
  const [download] = await Promise.all([page.waitForEvent('download'), (await thisGame(page)).getByRole('button', { name: 'Export this game' }).click()]);
  const exported = testInfo.outputPath('a-new-game.json');
  await download.saveAs(exported);
  const save = JSON.parse(readFileSync(exported, 'utf8')) as {
    world: {
      counters: { items: number };
      guilds: Record<string, { id: string; controller: { kind: string } }>;
      items: Record<string, unknown>;
    };
  };
  const player = Object.values(save.world.guilds).find((guild) => guild.controller.kind === 'player');
  if (player === undefined) throw new Error("the save has no player's Guild");
  const id = `item-${String(save.world.counters.items).padStart(6, '0')}`;
  save.world.items[id] = { id, definitionKey: 'barrow-kings-blade', holder: { kind: 'guild', id: player.id } };
  save.world.counters.items += 1;
  const made = testInfo.outputPath('with-the-blade.json');
  writeFileSync(made, JSON.stringify(save));
  await (await thisGame(page)).getByLabel('Load a save file').setInputFiles(made);
  await expect(page.getByRole('dialog', { name: 'Game' })).toHaveCount(0);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
}
