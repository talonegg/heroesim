import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectTargets, guildmasterSetup, openView, region, startGame } from './support';

// The Guildmaster's Portrait chosen at setup (v1.1.2-S4, DL-125 items 3 and 6), at a phone's 360px, a
// tablet's 820px and a desktop's 1280px. Since v1.1.3-S7 the setup grid (DL-134 item 9, DL-143): one
// sex's thumbnails at a time, reading 250 kB of pictures or less as it opens; the choice reached by the
// keyboard and named for a screen reader, each thumbnail a radio button whose label is its picture;
// "Drawn from the seed" showing the picture the seed chooses; the engine's note beside a picture chosen
// that does not fit, never a refusal; and the Portrait chosen, or the one the preview named, on the
// Guildmaster view, loaded.

/** The most the setup grid may read of pictures as it opens (DL-134 item 9). */
const gridLimit = 250_000;

/** Whether the `<img>` has loaded what it shows: complete, with a width of its own. */
async function loaded(image: Locator): Promise<boolean> {
  return image.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0);
}

/** The accessible name of the element that has the keyboard, and whether it is checked. */
async function focused(page: Page): Promise<{ name: string; checked: boolean | null }> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLInputElement | null;
    const label = element?.closest('label');
    return { name: (label?.textContent ?? '').trim(), checked: element?.type === 'radio' ? element.checked : null };
  });
}

/** Every picture the page has read so far, by its address, with its size in bytes. */
function picturesRead(page: Page): Map<string, number> {
  const read = new Map<string, number>();
  page.on('response', async (response) => {
    if (!/\.webp$/.test(new URL(response.url()).pathname)) return;
    read.set(response.url(), Number(response.headers()['content-length'] ?? 0));
    const body = await response.body().catch(() => null);
    if (body !== null) read.set(response.url(), body.length);
  });
  return read;
}

/** The sex the grid shows, by the button pressed while the sex is drawn: `Female` or `Male`. */
async function shownSex(portrait: Locator): Promise<'Female' | 'Male'> {
  const pressed = await portrait.getByRole('group', { name: 'Pictures shown' }).locator('button[aria-pressed="true"]').textContent();
  if (pressed !== 'Female' && pressed !== 'Male') throw new Error(`no sex shown: ${pressed}`);
  return pressed;
}

test('the setup grid shows one sex at a time, reads 250 kB of pictures or less as it opens, and is reached by the keyboard, each picture named', async ({ page }) => {
  const read = picturesRead(page);
  await page.goto('/');
  await region(page, 'A new game').getByRole('textbox', { name: 'Seed', exact: true }).fill('e2e-portrait');
  // Closed, the grid reads nothing.
  await page.waitForLoadState('networkidle');
  expect([...read.keys()]).toEqual([]);

  const setup = await guildmasterSetup(page);
  const portrait = setup.getByRole('group', { name: 'Portrait', exact: true });
  const sex = await shownSex(portrait);
  const other = sex === 'Female' ? 'Male' : 'Female';

  // Named for a screen reader: "Drawn from the seed", then each picture of the sex shown by its place.
  const radios = portrait.getByRole('radio');
  await expect(radios).toHaveCount(21);
  for (const name of ['Drawn from the seed', `${sex} Portrait 1`, `${sex} Portrait 20`]) {
    await expect(portrait.getByRole('radio', { name, exact: true })).toHaveCount(1);
  }
  await expect(portrait.getByRole('radio', { name: `${other} Portrait 1`, exact: true })).toHaveCount(0);

  // Every thumbnail of the grid, brought into view, loads from its own small file.
  const pictures = portrait.locator('img[data-picture="picture"]');
  await portrait.getByRole('radio', { name: `${sex} Portrait 20`, exact: true }).locator('xpath=..').scrollIntoViewIfNeeded();
  await expect.poll(async () => (await Promise.all((await pictures.all()).map(loaded))).every(Boolean), { timeout: 15_000 }).toBe(true);
  expect(await pictures.count()).toBeGreaterThanOrEqual(20);
  for (const src of await pictures.evaluateAll((images) => images.map((image) => image.getAttribute('src') ?? ''))) {
    expect(src).toMatch(new RegExp(`gm-${sex.toLowerCase()}-\\d\\d\\.thumb-[\\w-]{8}\\.webp$`));
  }
  expect(await pictures.first().evaluate((image) => image.getBoundingClientRect().width)).toBeGreaterThan(40);

  // What the grid read: the thumbnails of one sex, never a full picture, within 250 kB.
  await page.waitForLoadState('networkidle');
  const bytes = [...read.values()].reduce((sum, size) => sum + size, 0);
  test.info().annotations.push({ type: 'setup grid', description: `${read.size} pictures, ${(bytes / 1000).toFixed(1)} kB` });
  expect([...read.keys()].filter((url) => !/\.thumb-[\w-]{8}\.webp$/.test(url))).toEqual([]);
  expect(read.size).toBeGreaterThanOrEqual(20);
  expect(bytes, `the setup grid read ${bytes} bytes`).toBeLessThanOrEqual(gridLimit);

  await expectNoHorizontalOverflow(page, 'the setup grid');
  await expectTargets(page, 'the setup grid');

  // The keyboard: from the Age field, one Tab past the two sexes' buttons reaches the choice, and the arrows move through it.
  await setup.getByLabel('Age', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await focused(page)).toEqual({ name: 'Drawn from the seed', checked: true });
  await page.keyboard.press('ArrowRight');
  expect(await focused(page)).toEqual({ name: `${sex} Portrait 1`, checked: true });
  // Choosing a picture chooses its sex.
  await expect(setup.getByLabel('Sex', { exact: true })).toHaveValue(sex.toLowerCase());
  await page.keyboard.press('ArrowLeft');
  expect(await focused(page)).toEqual({ name: 'Drawn from the seed', checked: true });
  await expect(setup.getByLabel('Sex', { exact: true })).toHaveValue('');

  // The other sex's pictures, shown at a press, and one chosen.
  await portrait.getByRole('group', { name: 'Pictures shown' }).getByRole('button', { name: other, exact: true }).click();
  await expect(radios).toHaveCount(21);
  await portrait.getByRole('radio', { name: `${other} Portrait 1`, exact: true }).check();
  await expect(setup.getByLabel('Sex', { exact: true })).toHaveValue(other.toLowerCase());
  await expectNoHorizontalOverflow(page, 'a Portrait chosen');

  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-portrait' });
  const guildmaster = await openView(page, 'Guildmaster');
  const picture = guildmaster.getByRole('img', { name: 'Portrait of Ada Vell' });
  await expect(picture).toHaveAttribute('src', new RegExp(`gm-${other.toLowerCase()}-01-[\\w-]{8}\\.webp$`));
  await expect.poll(() => loaded(picture)).toBe(true);
  // Loaded, it stands in the Silhouette's place.
  await expect(guildmaster.getByTestId('portrait').locator('img[data-picture="silhouette"]')).toHaveCount(0);
  await expect(guildmaster).toContainText(new RegExp(`Sex\\s*${other}`));
  await expectNoHorizontalOverflow(page, "the Guildmaster's Portrait");
});

test('a Portrait chosen that does not fit the age chosen is noted beside the choice, and the game still starts', async ({ page }) => {
  await page.goto('/');
  const form = region(page, 'A new game');
  await form.getByRole('textbox', { name: 'Guild name', exact: true }).fill('The Lantern');
  await form.getByRole('textbox', { name: /Guildmaster/ }).fill('Ada Vell');
  const setup = await guildmasterSetup(page);
  await setup.getByLabel('Sex', { exact: true }).selectOption('female');
  await setup.getByLabel('Age', { exact: true }).selectOption('21');
  const portrait = setup.getByRole('group', { name: 'Portrait', exact: true });
  const notes = portrait.getByTestId('portrait-notes');

  // The first picture that looks older than 21.
  let chosen = 0;
  for (let n = 1; n <= 20 && chosen === 0; n += 1) {
    await portrait.getByRole('radio', { name: `Female Portrait ${n}`, exact: true }).check();
    if ((await notes.count()) > 0) chosen = n;
  }
  expect(chosen).toBeGreaterThan(0);
  await expect(notes).toHaveText(/^This Portrait looks \d+ to \d+: older than your Guildmaster's 21\.$/);
  await expect(portrait.getByTestId('portrait-notes-live')).toHaveAttribute('aria-live', 'polite');
  await expectNoHorizontalOverflow(page, 'a note beside the Portrait');
  await expectTargets(page, 'a note beside the Portrait');

  // Never a refusal: the game starts with the picture and the age.
  await expect(page.getByTestId('setup-refusal')).toHaveCount(0);
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-portrait-note' });
  const guildmaster = await openView(page, 'Guildmaster');
  await expect(guildmaster.getByRole('img', { name: 'Portrait of Ada Vell' })).toHaveAttribute(
    'src',
    new RegExp(`gm-female-${String(chosen).padStart(2, '0')}-[\\w-]{8}\\.webp$`),
  );
  await expect(guildmaster).toContainText(/Age\s*21/);
});

test('what the seed draws is shown before the game starts, follows the Seed field, and is the Guildmaster the game begins with', async ({ page }) => {
  await page.goto('/');
  const form = region(page, 'A new game');
  const setup = await guildmasterSetup(page);
  const seed = form.getByRole('textbox', { name: 'Seed', exact: true });
  const preview = setup.getByTestId('guildmaster-preview');

  // A seed that draws a picture, not the Silhouette.
  let lines: string[] = [];
  for (let n = 1; n < 20; n += 1) {
    await seed.fill(`e2e-preview-${n}`);
    lines = await preview.locator('p').allTextContents();
    if (/Portrait \d+$/.test(lines[2] ?? '')) break;
  }
  const [, sex = '', age = ''] = /^Drawn: (Female|Male), (\d+)$/.exec(lines[0] ?? '') ?? [];
  const [, place = ''] = new RegExp(`^Drawn Portrait: ${sex} Portrait (\\d+)$`).exec(lines[2] ?? '') ?? [];
  expect(place).toMatch(/^\d+$/);
  const key = `gm-${sex.toLowerCase()}-${place.padStart(2, '0')}`;
  // The preview and "Drawn from the seed" show the picture the seed chooses, from its thumbnail.
  const drawnPicture = preview.getByTestId('portrait').locator('img[data-picture="picture"]');
  await expect(drawnPicture).toHaveAttribute('src', new RegExp(`${key}\\.thumb-[\\w-]{8}\\.webp$`));
  await expect.poll(() => loaded(drawnPicture)).toBe(true);
  const drawnOption = setup.getByRole('radio', { name: 'Drawn from the seed', exact: true }).locator('xpath=..').locator('img[data-picture="picture"]');
  await expect(drawnOption).toHaveAttribute('src', new RegExp(`${key}\\.thumb-[\\w-]{8}\\.webp$`));
  await expectNoHorizontalOverflow(page, 'the preview');

  const seedNow = await seed.inputValue();
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: seedNow });
  const guildmaster = await openView(page, 'Guildmaster');
  await expect(guildmaster).toContainText(new RegExp(`Sex\\s*${sex}`));
  await expect(guildmaster).toContainText(new RegExp(`Age\\s*${age}`));
  await expect(guildmaster.getByRole('img', { name: 'Portrait of Ada Vell' })).toHaveAttribute('src', new RegExp(`${key}-[\\w-]{8}\\.webp$`));
});
