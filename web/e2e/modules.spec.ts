import { expect, test, type Page } from '@playwright/test';
import { debugHistory, groupOf, historyText, playTurns, startGame } from './support';

// The test-only switch for modules (DL-79), in the built page: opened at `?modules=probe`, the
// page says the probe is installed, and a game from seed `modules`, on which the probe's stream first
// draws below its threshold on the eleventh Turn, the night of Year 1 Day 4, shows `probe.fired` in the log
// of that Turn. It is the switch in the built bundle that is shown, at one width; the page without the
// switch is app.test.tsx's.
// What a play did is read in the History, the whole History here, the game menu's debug view, where
// a module's events are (DL-105, DL-117).

/** Starts a game from the firing seed and plays eleven Turns, one at a time. */
async function elevenTurns(page: Page): Promise<void> {
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'modules' });
  const advance = page.getByRole('button', { name: 'Advance a Turn' });
  for (let turn = 1; turn <= 11; turn += 1) await playTurns(page, advance);
  await expect(page.getByTestId('time')).toHaveText('Year 1 Day 4, night');
}

test('?modules=probe installs the probe, and its probe.fired is in the log on a seed known to fire one', { tag: '@one-width' }, async ({ page }) => {
  await page.goto('/?modules=probe');
  await expect(page.getByText('Installed for testing: the probe Module.')).toBeVisible();

  await elevenTurns(page);

  const whole = await debugHistory(page);
  const fired = historyText(whole, /^The probe Module recorded probe\.fired for .+\.$/);
  await expect(fired).toHaveCount(1);
  await expect(groupOf(fired)).toHaveText('Year 1 Day 4, night');
  const wealth = historyText(whole, /^.+'s Wealth went from \d+ to \d+\.$/);
  await expect(wealth).toHaveCount(1);
  await expect(groupOf(wealth)).toHaveText('Year 1 Day 4, night');
});
