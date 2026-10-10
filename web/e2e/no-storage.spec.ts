import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { closeGameMenu, expectNoHorizontalOverflow, playTurns, region, startGame, thisGame } from './support';

// Where the browser keeps nothing for the page (DL-67; the epic's §3 risk): `saves.ts`
// reports the typed failure `unavailable`, the page says so, and the game plays on without saving.
// Once where Chromium itself refuses IndexedDB, a sandboxed frame, whose origin is opaque; and twice
// with the refusals other browsers give stood in for before the page loads: a private window whose
// database will not open (Firefox's), and a browser with no IndexedDB at all. What a game has to
// say of its saves is in the game menu (DL-103).

const unavailable = /^This browser will not keep saves for this page, as in a private window or with site data blocked \(.+\)\. The game plays on; export it to keep it\.$/;

async function playsWithoutSaving(page: Page, scope: Page | FrameLocator): Promise<void> {
  await expect(region(scope, 'A new game').getByTestId('saves-unavailable')).toHaveText(unavailable);
  const form = region(scope, 'A new game');
  await form.getByRole('textbox', { name: 'Guild name', exact: true }).fill('The Lantern');
  await form.getByRole('textbox', { name: /Guildmaster/ }).fill('Ada Vell');
  await form.getByRole('button', { name: 'Start the game' }).click();
  await expect(scope.getByTestId('time')).toHaveText('Year 1 Day 1, morning');
  const game = await thisGame(scope);
  await expect(game.getByTestId('saves-unavailable')).toHaveText(unavailable);
  await expect(game.getByRole('button', { name: 'Save in this browser' })).toHaveCount(0);
  await expect(game.getByRole('button', { name: 'Export this game' })).toBeVisible();
  await closeGameMenu(scope);
  const time = scope.getByTestId('time');
  await scope.getByRole('button', { name: 'Advance a Turn' }).click();
  await expect(time).toHaveText('Year 1 Day 1, afternoon');
  await expect(scope.locator('main')).toHaveAttribute('aria-busy', 'false');
  await expectNoHorizontalOverflow(page, 'saves unavailable');
}

test('in a sandboxed frame, where Chromium refuses IndexedDB itself, the page says so and plays on', async ({ page, baseURL }) => {
  await page.goto('/');
  await page.setContent(
    `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts allow-forms" src="${baseURL}/" ` +
      'style="border:0;display:block;width:100vw;height:100vh"></iframe></body>',
  );
  const frame = page.frameLocator('iframe');

  await playsWithoutSaving(page, frame);
  await expect((await thisGame(frame)).getByTestId('saves-unavailable')).toContainText('SecurityError');
});

const standIns: { name: string; script: string; says: string }[] = [
  {
    name: 'where the database will not open, as in a private window',
    // Firefox's private windows answered `open` with an error event (InvalidStateError).
    script: `IDBFactory.prototype.open = function () {
      const request = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      setTimeout(() => {
        request.error = new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError');
        if (request.onerror) request.onerror(new Event('error'));
      }, 0);
      return request;
    };`,
    says: 'InvalidStateError',
  },
  {
    name: 'with no IndexedDB at all',
    script: `Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true });`,
    says: 'this browser has no IndexedDB',
  },
];

for (const { name, script, says } of standIns) {
  test(`${name}, the page says so and plays on`, async ({ page }) => {
    await page.addInitScript(script);
    await page.goto('/');

    await playsWithoutSaving(page, page);
    await expect((await thisGame(page)).getByTestId('saves-unavailable')).toContainText(says);
  });
}

test('with storage kept, a new game offers saving: the stand-ins above are what took it away', async ({ page }) => {
  await page.goto('/');
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-storage' });
  await expect((await thisGame(page)).getByRole('button', { name: 'Save in this browser' })).toBeVisible();
  await expect(page.getByTestId('saves-unavailable')).toHaveCount(0);
  await closeGameMenu(page);
  await playTurns(page, page.getByRole('button', { name: 'Advance a Turn' }));
});
