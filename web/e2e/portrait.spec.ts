import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectTargets, guildmasterSetup, openView, region, startGame } from './support';

// The Guildmaster's Portrait chosen at setup (v1.1.2-S4, DL-125 items 3 and 6), at a phone's 360px, a
// tablet's 820px and a desktop's 1280px: the choice reached by the keyboard and named for a screen
// reader, each thumbnail a radio button whose label is its picture; what the seed draws shown beside
// it; and the Portrait chosen, or the one the preview named, on the Guildmaster view, loaded.

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

test('the Portrait choice is reached by the keyboard, each picture named for a screen reader, and the one chosen is the Guildmaster view\'s', async ({ page }) => {
  await page.goto('/');
  const setup = await guildmasterSetup(page);
  const portrait = setup.getByRole('group', { name: 'Portrait', exact: true });

  // Named for a screen reader: "Drawn from the seed", then each picture by its sex and place.
  const radios = portrait.getByRole('radio');
  await expect(radios).toHaveCount(3);
  for (const name of ['Drawn from the seed', 'Female Portrait 1', 'Male Portrait 1']) {
    await expect(portrait.getByRole('radio', { name, exact: true })).toHaveCount(1);
  }
  // Each picture is its radio button's label, and loads.
  for (const sex of ['female', 'male']) {
    const picture = portrait.getByRole('radio', { name: `${sex === 'female' ? 'Female' : 'Male'} Portrait 1`, exact: true }).locator('xpath=..').locator('img[data-picture="picture"]');
    await expect(picture).toHaveAttribute('src', new RegExp(`gm-${sex}-01-[\\w-]{8}\\.webp$`));
    await expect.poll(() => loaded(picture)).toBe(true);
    expect(await picture.evaluate((image) => image.getBoundingClientRect().width)).toBeGreaterThan(40);
  }
  await expectNoHorizontalOverflow(page, 'the Portrait choice');
  await expectTargets(page, 'the Portrait choice');

  // The keyboard: from the Age field, one Tab reaches the choice, and the arrows move through it.
  await setup.getByLabel('Age', { exact: true }).focus();
  await page.keyboard.press('Tab');
  expect(await focused(page)).toEqual({ name: 'Drawn from the seed', checked: true });
  await page.keyboard.press('ArrowRight');
  expect(await focused(page)).toEqual({ name: 'Female Portrait 1', checked: true });
  // Choosing a picture chooses its sex, and every picture stays offered to the arrows.
  await expect(setup.getByLabel('Sex', { exact: true })).toHaveValue('female');
  await page.keyboard.press('ArrowRight');
  expect(await focused(page)).toEqual({ name: 'Male Portrait 1', checked: true });
  await expect(setup.getByLabel('Sex', { exact: true })).toHaveValue('male');
  await expect(radios).toHaveCount(3);
  // Round to "Drawn from the seed", which draws the sex again, and back.
  await page.keyboard.press('ArrowRight');
  expect(await focused(page)).toEqual({ name: 'Drawn from the seed', checked: true });
  await expect(setup.getByLabel('Sex', { exact: true })).toHaveValue('');
  await page.keyboard.press('ArrowLeft');
  expect(await focused(page)).toEqual({ name: 'Male Portrait 1', checked: true });
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

test('what the seed draws is shown before the game starts, follows the Seed field, and is the Guildmaster the game begins with', async ({ page }) => {
  await page.goto('/');
  const form = region(page, 'A new game');
  const setup = await guildmasterSetup(page);
  const seed = form.getByRole('textbox', { name: 'Seed', exact: true });
  const preview = setup.getByTestId('guildmaster-preview');

  await seed.fill('e2e-preview-1');
  const first = await preview.textContent();
  let other = first;
  for (let n = 2; n < 12 && other === first; n += 1) {
    await seed.fill(`e2e-preview-${n}`);
    other = await preview.textContent();
  }
  expect(other).not.toBe(first);

  const lines = await preview.locator('p').allTextContents();
  const [, sex = '', age = ''] = /^Drawn: (Female|Male), (\d+)$/.exec(lines[0] ?? '') ?? [];
  expect(lines[2]).toBe(`Drawn Portrait: ${sex} Portrait 1`);
  const drawnPicture = preview.getByTestId('portrait').locator('img[data-picture="picture"]');
  await expect.poll(() => loaded(drawnPicture)).toBe(true);
  await expectNoHorizontalOverflow(page, 'the preview');

  const seedNow = await seed.inputValue();
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: seedNow });
  const guildmaster = await openView(page, 'Guildmaster');
  await expect(guildmaster).toContainText(new RegExp(`Sex\\s*${sex}`));
  await expect(guildmaster).toContainText(new RegExp(`Age\\s*${age}`));
  await expect(guildmaster.getByRole('img', { name: 'Portrait of Ada Vell' })).toHaveAttribute('src', new RegExp(`gm-${sex.toLowerCase()}-01-[\\w-]{8}\\.webp$`));
});
