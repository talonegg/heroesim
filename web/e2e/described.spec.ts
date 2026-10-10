import { expect, test } from '@playwright/test';
import { chooseGuildmaster, expectNoHorizontalOverflow, expectTargets, guildmasterSetup, region } from './support';

// The Guildmaster described at setup (DL-125 item 6), at a phone's 360px, a tablet's 820px and a
// desktop's 1280px: "Write them for me" and "Again" are buttons the keyboard reaches and presses, and
// the texts they write fit the page. What the texts are, and that they are kept, is the new-game
// view's own tests.

test('"Write them for me" and "Again" are pressed by the keyboard, and the texts they write fit the page', async ({ page }) => {
  await page.goto('/');
  const form = region(page, 'A new game');
  await form.getByRole('textbox', { name: 'Seed', exact: true }).fill('e2e-described');
  const setup = await guildmasterSetup(page);
  await chooseGuildmaster(setup, { sex: 'female', age: '34', picture: 'Female Portrait 2' });
  const birthplace = setup.getByRole('textbox', { name: 'Birthplace', exact: true });
  await expect(birthplace).toHaveValue('');

  // By the keyboard: the button takes the focus and Enter writes.
  await setup.getByRole('button', { name: 'Write them for me', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(birthplace).not.toHaveValue('');
  await expectNoHorizontalOverflow(page, 'the texts written');
  await expectTargets(page, 'the texts written');

  // "Again" is pressed the same way: it writes into a field the player emptied.
  await birthplace.fill('');
  await setup.getByRole('button', { name: 'Again', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(birthplace).not.toHaveValue('');
  await expectNoHorizontalOverflow(page, 'the texts written again');
  await expectTargets(page, 'the texts written again');
});
