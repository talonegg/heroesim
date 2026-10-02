import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { guildmasterSetup, openView, part, rosterList, startGame, statusBar } from './support';

// The page opened from the filesystem shows its pictures (v1.1.2-S2; DL-125 item 1, the epic's gate),
// in a Playwright project of its own: the built page, `dist/index.html`, over file://. Its Silhouettes,
// inlined into the one script, load; and since v1.1.2-S4 the owner's two pictures are hashed files
// beside the script, which the bundle gate passes, and a relative `<img>` the script made loads one,
// on the new-game form and on the Guildmaster view. v1.1.2-S2 built the page again with a test
// picture to see this before any picture existed; the owner's pictures take its place (DL-131). Since
// v1.1.3-S7, a thumbnail in the setup grid, a Hero's small Silhouette on the Roster, and a Rival's
// thumbnail in the Guilds' table and Portrait on their Guild's page, each loading over file://. Since
// v1.1.4-S11 (DL-149), a game started each way: "Choose myself", the grid shown for each sex chosen, and
// "Choose for me", the Guildmaster the preview shows the one the game begins with.

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

  // On the new-game form, with "Choose myself", each sex's pictures offered for the Portrait as thumbnails,
  // from the folder beside the page (v1.1.3-S7: the setup grid shows the sex chosen's).
  const setup = await guildmasterSetup(page);
  const portrait = setup.getByRole('group', { name: 'Portrait', exact: true });
  await expect(portrait.getByTestId('portrait-unsexed')).toBeVisible();
  for (const [sex, word] of [
    ['male', 'Male'],
    ['female', 'Female'],
  ] as const) {
    await setup.getByLabel('Sex', { exact: true }).selectOption(sex);
    const thumbnail = portrait.getByRole('radio', { name: `${word} Portrait 1`, exact: true }).locator('xpath=..').locator('img[data-picture="picture"]');
    await expect(thumbnail).toHaveAttribute('src', new RegExp(`^file:///.+/assets/gm-${sex}-01\\.thumb-[\\w-]{8}\\.webp$`));
    await expect.poll(() => loaded(thumbnail)).toBe(true);
  }
  await portrait.getByRole('radio', { name: 'Female Portrait 1', exact: true }).check();
  await setup.getByLabel('Age', { exact: true }).selectOption('40');
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

  // A Hero's thumbnail on the Roster: the small Silhouette of their sex, from the script.
  const card = (await rosterList(page)).getByRole('listitem').first();
  const small = card.getByTestId('portrait-thumb').locator('img');
  await expect(small).toHaveAttribute('src', /^data:image\/svg\+xml,/);
  await expect.poll(() => loaded(small)).toBe(true);

  // A Rival's Guildmaster with a picture chosen for them (v1.1.3-S5): their thumbnail in the Guilds'
  // table, then their Portrait on their Guild's page, each from beside the page (v1.1.3-S7).
  const guilds = await part(page, 'Guilds');
  const pictured = guilds.locator('[data-testid="guild-row"]:not(.mine)').filter({ has: page.locator('[data-testid="portrait-thumb"] img[data-picture="picture"]') });
  const row = pictured.first();
  await row.scrollIntoViewIfNeeded();
  const thumbnail = row.getByTestId('portrait-thumb').locator('img').last();
  await expect(thumbnail).toHaveAttribute('src', /^file:\/\/\/.+\/assets\/gm-(female|male)-\d\d\.thumb-[\w-]{8}\.webp$/);
  await expect.poll(() => loaded(thumbnail)).toBe(true);
  const name = (await row.locator('button.link').textContent()) ?? '';
  await row.locator('button.link').click();
  const guildPage = guilds.getByRole('article');
  await expect(guildPage.getByRole('heading', { level: 4 })).toHaveText(name);
  // Folded, the Guildmaster's details read nothing; unfolded, their picture loads.
  await guildPage.locator('summary', { hasText: /^Guildmaster: / }).click();
  const rival = guildPage.getByTestId('portrait').locator('img[data-picture]').last();
  await expect(rival).toHaveAttribute('src', /^file:\/\/\/.+\/assets\/gm-(female|male)-\d\d-[\w-]{8}\.webp$/);
  await expect.poll(() => loaded(rival)).toBe(true);
  await expect(guildPage.getByTestId('portrait').locator('img[data-picture="silhouette"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the built page, opened from the filesystem, starts a game with "Choose for me", the Guildmaster its preview shows', async ({ page }) => {
  const errors: string[] = [];
  await opened(page, errors);

  // The Guildmaster chosen for the player, with their Portrait's thumbnail from beside the page.
  const setup = await guildmasterSetup(page, 'Choose for me');
  const preview = setup.getByTestId('guildmaster-preview');
  const form = setup.locator('xpath=ancestor::form');
  let lines: string[] = [];
  for (let n = 1; n < 20; n += 1) {
    await form.getByRole('textbox', { name: 'Seed', exact: true }).fill(`e2e-file-for-me-${n}`);
    lines = await preview.locator('p').allTextContents();
    if (/Portrait \d+$/.test(lines[4] ?? '')) break;
  }
  const seed = await form.getByRole('textbox', { name: 'Seed', exact: true }).inputValue();
  const [, sex = '', age = ''] = /^(Female|Male), (\d+)$/.exec(lines[1] ?? '') ?? [];
  const [, place = ''] = new RegExp(`^Portrait: ${sex} Portrait (\\d+)$`).exec(lines[4] ?? '') ?? [];
  expect(place).toMatch(/^\d+$/);
  const key = `gm-${sex.toLowerCase()}-${place.padStart(2, '0')}`;
  const thumbnail = preview.getByTestId('portrait').locator('img[data-picture="picture"]');
  await expect(thumbnail).toHaveAttribute('src', new RegExp(`^file:///.+/assets/${key}\\.thumb-[\\w-]{8}\\.webp$`));
  await expect.poll(() => loaded(thumbnail)).toBe(true);

  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed });
  const guildmaster = await openView(page, 'Guildmaster');
  await expect(guildmaster).toContainText(new RegExp(`Sex\\s*${sex}`));
  await expect(guildmaster).toContainText(new RegExp(`Age\\s*${age}`));
  const picture = guildmaster.getByRole('img', { name: 'Portrait of Ada Vell' });
  await expect(picture).toHaveAttribute('src', new RegExp(`^file:///.+/assets/${key}-[\\w-]{8}\\.webp$`));
  await expect.poll(() => loaded(picture)).toBe(true);
  expect(errors).toEqual([]);
});
