import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { guildmasterSetup, openView, part, startGame, statusBar } from './support';

// The page opened from the filesystem shows its pictures (v1.1.2-S2; DL-125 item 1, the epic's gate),
// in a Playwright project of its own: the built page, `dist/index.html`, over file://. Its Silhouettes,
// inlined into the one script, load; and since v1.1.2-S4 the owner's two pictures are hashed files
// beside the script, which the bundle gate passes, and a relative `<img>` the script made loads one,
// on the new-game form and on the Guildmaster view. v1.1.2-S2 built the page again with a test
// picture to see this before any picture existed; the owner's pictures take its place (DL-131).

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(webDir, 'dist');
const gate = path.join(webDir, 'scripts', 'check-bundle.mjs');

/** Whether the `<img>` has loaded what it shows: complete, with a width of its own. */
async function loaded(image: Locator): Promise<boolean> {
  return image.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0);
}

/** The built page opened from the filesystem, logging any error it throws into `errors`. */
async function opened(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(dist, 'index.html')).href);
}

test("holds the owner's two pictures as hashed files beside the one script, and passes the bundle gate", () => {
  const assets = readdirSync(path.join(dist, 'assets')).sort();
  const scripts = assets.filter((file) => /^index-[\w-]+\.js$/.test(file));
  expect(scripts).toHaveLength(1);
  expect(assets.filter((file) => /^gm-female-01-[\w-]{8}\.webp$/.test(file))).toHaveLength(1);
  expect(assets.filter((file) => /^gm-male-01-[\w-]{8}\.webp$/.test(file))).toHaveLength(1);
  // Whatever pictures come later, everything beside the script is a hashed picture (v1.1.2-S6).
  expect(assets.filter((file) => !scripts.includes(file) && !/-[\w-]{8}\.webp$/.test(file))).toEqual([]);
  const gated = spawnSync(process.execPath, [gate, dist], { encoding: 'utf8' });
  expect(gated.stdout).toContain('no network or filesystem reference');
  expect(gated.status).toBe(0);
});

test("the built page, opened from the filesystem, loads its Silhouettes from its one script and the owner's pictures from beside it", async ({ page }) => {
  const errors: string[] = [];
  await opened(page, errors);

  // On the new-game form, each picture offered for the Portrait, from the folder beside the page.
  const setup = await guildmasterSetup(page);
  const portrait = setup.getByRole('group', { name: 'Portrait', exact: true });
  for (const name of ['Female Portrait 1', 'Male Portrait 1']) {
    const thumbnail = portrait.getByRole('radio', { name, exact: true }).locator('xpath=..').locator('img[data-picture="picture"]');
    await expect(thumbnail).toHaveAttribute('src', /^file:\/\/\/.+\/assets\/gm-(female|male)-01-[\w-]{8}\.webp$/);
    await expect.poll(() => loaded(thumbnail)).toBe(true);
  }
  await portrait.getByRole('radio', { name: 'Female Portrait 1', exact: true }).check();
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-file' });

  // The Guild's Banner beside its name in the status bar: a Silhouette.
  const banner = statusBar(page).getByRole('heading', { level: 1 }).locator('img[data-picture="silhouette"]');
  await expect(banner).toHaveAttribute('src', /^data:image\/svg\+xml,/);
  await expect.poll(() => loaded(banner)).toBe(true);

  // The Guildmaster's Portrait, the owner's picture chosen; loaded, it stands in the Silhouette's place.
  const guildmaster = await openView(page, 'Guildmaster');
  const picture = guildmaster.getByRole('img', { name: 'Portrait of Ada Vell' });
  await expect(picture).toHaveAttribute('src', /^file:\/\/\/.+\/assets\/gm-female-01-[\w-]{8}\.webp$/);
  await expect.poll(() => loaded(picture)).toBe(true);
  expect(await picture.evaluate((image) => image.getBoundingClientRect().width)).toBeGreaterThan(0);
  await expect(guildmaster.getByTestId('portrait').locator('img[data-picture="silhouette"]')).toHaveCount(0);

  // A Rival's Guildmaster: the Silhouette of their sex, from the script.
  const guilds = await part(page, 'Guilds');
  await guilds.locator('[data-testid="guild-row"]:not(.mine)').first().locator('button.link').click();
  const rival = guilds.getByRole('article').getByTestId('portrait').locator('img');
  await expect(rival).toHaveAttribute('src', /^data:image\/svg\+xml,/);
  await expect.poll(() => loaded(rival)).toBe(true);
  expect(errors).toEqual([]);
});
