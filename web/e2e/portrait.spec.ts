import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectTargets, guildmasterSetup, openView, region, startGame } from './support';

// The Guildmaster's Portrait chosen at setup (DL-125 items 3 and 6), at a phone's 360px, a
// tablet's 820px and a desktop's 1280px. The setup grid (DL-134 item 9, DL-143): one
// sex's thumbnails at a time, reading 250 kB of pictures or less; the choice reached by the keyboard and
// named for a screen reader, each thumbnail a radio button whose label is its picture; and the Portrait
// chosen on the Guildmaster view, loaded. DL-149 items 2 and 4: with "Choose myself" the grid offers no
// draw and reads no picture until a sex is chosen, then that sex's only; with "Choose for me" the
// preview shows the Guildmaster chosen for the player, their Portrait among them.

/** The most the setup grid may read of pictures (DL-134 item 9). */
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

test(`with "Choose myself", the grid reads no picture before a sex is chosen, then that sex's thumbnails, 250 kB or less, reached by the keyboard, each picture named`, async ({ page }) => {
  const read = picturesRead(page);
  await page.goto('/');
  const form = region(page, 'A new game');
  await form.getByRole('textbox', { name: 'Guild name', exact: true }).fill('The Lantern');
  await form.getByRole('textbox', { name: /Guildmaster/ }).fill('Ada Vell');
  await form.getByRole('textbox', { name: 'Seed', exact: true }).fill('e2e-portrait');
  // Closed, the setup reads nothing.
  await page.waitForLoadState('networkidle');
  expect([...read.keys()]).toEqual([]);

  // "Choose for me" shows the Guildmaster chosen for the player, with their Portrait's thumbnail.
  const forMe = await guildmasterSetup(page, 'Choose for me');
  const previewed = forMe.getByTestId('guildmaster-preview').getByTestId('portrait').locator('img[data-picture="picture"]');
  await expect.poll(() => loaded(previewed)).toBe(true);
  await expect.poll(() => read.size).toBe(1);
  const before = new Set(read.keys());

  // "Choose myself": no picture is read until a sex is chosen, and none is offered.
  const setup = await guildmasterSetup(page);
  const portrait = setup.getByRole('group', { name: 'Portrait', exact: true });
  await expect(portrait.getByTestId('portrait-unsexed')).toHaveText('Choose a Sex to see the pictures.');
  await expect(portrait.getByRole('radio')).toHaveCount(0);
  await expect(portrait.locator('img')).toHaveCount(0);
  await expect(portrait.getByRole('group', { name: 'Pictures shown' })).toHaveCount(0);
  // Nothing is asked for, so there is nothing to wait on but time.
  await page.waitForTimeout(500);
  expect([...read.keys()].filter((url) => !before.has(url)), 'pictures read before a sex is chosen').toEqual([]);
  await expectNoHorizontalOverflow(page, 'the setup grid before a sex is chosen');

  // A sex chosen: its pictures only, each named by its place, with no draw among them.
  await setup.getByLabel('Sex', { exact: true }).selectOption('female');
  const radios = portrait.getByRole('radio');
  await expect(radios).toHaveCount(20);
  for (const name of ['Female Portrait 1', 'Female Portrait 20']) await expect(portrait.getByRole('radio', { name, exact: true })).toHaveCount(1);
  await expect(portrait.getByRole('radio', { name: 'Male Portrait 1', exact: true })).toHaveCount(0);
  await expect(portrait.getByRole('radio', { name: /seed|Choose for me/ })).toHaveCount(0);

  // Every thumbnail of the grid, brought into view, loads from its own small file.
  const pictures = portrait.locator('img[data-picture="picture"]');
  await portrait.getByRole('radio', { name: 'Female Portrait 20', exact: true }).locator('xpath=..').scrollIntoViewIfNeeded();
  await expect.poll(async () => (await Promise.all((await pictures.all()).map(loaded))).every(Boolean), { timeout: 15_000 }).toBe(true);
  const sources = await pictures.evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src));
  expect(sources).toHaveLength(20);
  for (const src of sources) expect(src).toMatch(/gm-female-\d\d\.thumb-[\w-]{8}\.webp$/);
  expect(await pictures.first().evaluate((image) => image.getBoundingClientRect().width)).toBeGreaterThan(40);

  // What the grid read: the thumbnails of one sex, never a full picture, within 250 kB.
  await expect.poll(() => sources.every((src) => read.has(src) || before.has(src))).toBe(true);
  const since = [...read.keys()].filter((url) => !before.has(url));
  expect(since.filter((url) => !sources.includes(url)), 'pictures read beyond the grid').toEqual([]);
  const bytes = sources.reduce((sum, src) => sum + (read.get(src) ?? Number.NaN), 0);
  test.info().annotations.push({ type: 'setup grid', description: `${sources.length} pictures, ${(bytes / 1000).toFixed(1)} kB` });
  expect(bytes, `the setup grid read ${bytes} bytes`).toBeLessThanOrEqual(gridLimit);

  await expectNoHorizontalOverflow(page, 'the setup grid');
  await expectTargets(page, 'the setup grid');

  // The keyboard: from the Age field, one Tab reaches the choice, and the arrows move through it.
  await setup.getByLabel('Age', { exact: true }).focus();
  await page.keyboard.press('Tab');
  expect(await focused(page)).toEqual({ name: 'Female Portrait 1', checked: false });
  await page.keyboard.press('Space');
  expect(await focused(page)).toEqual({ name: 'Female Portrait 1', checked: true });
  await page.keyboard.press('ArrowRight');
  expect(await focused(page)).toEqual({ name: 'Female Portrait 2', checked: true });

  // Another sex clears the picture chosen, and shows its own.
  await setup.getByLabel('Sex', { exact: true }).selectOption('male');
  await expect(portrait.getByRole('radio', { name: 'Male Portrait 1', exact: true })).toHaveCount(1);
  await expect(portrait.getByRole('radio', { checked: true })).toHaveCount(0);
  await setup.getByLabel('Age', { exact: true }).selectOption('40');
  await expect(page.getByTestId('setup-hint')).toHaveText("Choose your Guildmaster's Portrait to start.");
  await portrait.getByRole('radio', { name: 'Male Portrait 1', exact: true }).check();
  await expectNoHorizontalOverflow(page, 'a Portrait chosen');

  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-portrait' });
  const guildmaster = await openView(page, 'Guildmaster');
  const picture = guildmaster.getByRole('img', { name: 'Portrait of Ada Vell' });
  await expect(picture).toHaveAttribute('src', /gm-male-01-[\w-]{8}\.webp$/);
  await expect.poll(() => loaded(picture)).toBe(true);
  // Loaded, it stands in the Silhouette's place.
  await expect(guildmaster.getByTestId('portrait').locator('img[data-picture="silhouette"]')).toHaveCount(0);
  await expect(guildmaster).toContainText(/Sex\s*Male/);
  await expectNoHorizontalOverflow(page, "the Guildmaster's Portrait");
});
