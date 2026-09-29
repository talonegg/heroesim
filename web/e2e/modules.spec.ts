import { expect, test, type Page } from '@playwright/test';
import { part, playTurns, startGame } from './support';

// The test-only switch for modules (M8-S4, DL-79), in the built page: opened at `?modules=probe`, the
// page says the probe is installed, and a game from seed `modules`, on which the probe's stream first
// draws below its threshold on the eleventh Turn, the night of Day 3, shows `probe.fired` in the log
// of that Turn. Opened without the switch, the same Turns install and show nothing of a module.
// The log is the History view's (M9-S3, DL-103).

/** Starts a game from the firing seed and plays eleven Turns, one at a time. */
async function elevenTurns(page: Page): Promise<void> {
  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'modules' });
  const advance = page.getByRole('button', { name: 'Advance a Turn' });
  for (let turn = 1; turn <= 11; turn += 1) await playTurns(page, advance);
  await expect(page.getByTestId('time')).toHaveText('Day 3, night, Year 0');
}

test('?modules=probe installs the probe, and its probe.fired is in the log on a seed known to fire one', async ({ page }) => {
  await page.goto('/?modules=probe');
  await expect(page.getByText('Installed for testing: the probe module.')).toBeVisible();

  await elevenTurns(page);

  const log = (await part(page, 'Since your last action')).getByRole('listitem');
  await expect(log.filter({ hasText: /^Day 3, night The probe module recorded probe\.fired for .+\.$/ })).toHaveCount(1);
  await expect(log.filter({ hasText: /^Day 3, night .+'s Wealth went from \d+ to \d+\.$/ })).toHaveCount(1);
});

test('without the switch nothing is installed: no word of a module, and no probe.fired on the same Turns', async ({ page }) => {
  await page.goto('/');
  await elevenTurns(page);

  await expect(page.getByText(/Installed for testing/)).toHaveCount(0);
  await expect((await part(page, 'Since your last action')).getByRole('listitem').filter({ hasText: /probe/ })).toHaveCount(0);
});
