import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// The built page mounts and loads its content set, served and from the filesystem (M7-S1).

const builtPage = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.html'),
).href;

async function expectThePlaceholder(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Heroesim' })).toBeVisible();
  await expect(page.getByText(/^Content set core, version \d+, loaded\.$/)).toBeVisible();
}

test('the built page renders when served', async ({ page }) => {
  await page.goto('/');
  await expectThePlaceholder(page);
});

test('the built page renders when opened from the filesystem', async ({ page }) => {
  await page.goto(builtPage);
  await expectThePlaceholder(page);
});
