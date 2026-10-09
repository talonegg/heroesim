import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { chooseGuildmaster, expectNoHorizontalOverflow, expectTargets, guildmasterSetup, openView, region, startGame } from './support';

/**
 * Every picture's narrative, read from content as it stands, so that the spec holds whatever the
 * owner's pictures' words become (an analysis run may change them).
 */
const narratives: string[] = Object.values(
  (JSON.parse(readFileSync(new URL('../../content/portrait-appearances.json', import.meta.url), 'utf8')) as { portraits: Record<string, { narrative: string }> })
    .portraits,
).map((row) => row.narrative);

// The Guildmaster described at setup (DL-125 item 6), at a phone's 360px, a tablet's 820px
// and a desktop's 1280px: "Write them for me" and "Again" fill the Birthplace, Appearance and
// Biography from the engine's content, reached by the keyboard; the fields stay the player's to edit;
// and what they hold at "Start the game" is what the Guildmaster view shows. Since DL-149 they are
// "Choose myself"'s, written once the sex, the age and a picture are chosen.

test('"Write them for me" and "Again" fill the three texts by the keyboard, and what the fields hold at the start is the Guildmaster view\'s', async ({ page }) => {
  await page.goto('/');
  const form = region(page, 'A new game');
  await form.getByRole('textbox', { name: 'Seed', exact: true }).fill('e2e-described');
  const setup = await guildmasterSetup(page);
  await expect(setup.getByRole('button', { name: 'Write them for me', exact: true })).toBeDisabled();
  await chooseGuildmaster(setup, { sex: 'female', age: '34', picture: 'Female Portrait 2' });
  const birthplace = setup.getByRole('textbox', { name: 'Birthplace', exact: true });
  const appearance = setup.getByRole('textbox', { name: 'Appearance', exact: true });
  const biography = setup.getByRole('textbox', { name: 'Biography', exact: true });
  await expect(birthplace).toHaveValue('');
  await expect(setup.getByRole('button', { name: 'Again', exact: true })).toHaveCount(0);

  // By the keyboard: the button takes the focus and Enter writes.
  await setup.getByRole('button', { name: 'Write them for me', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(setup.getByTestId('written-for')).toHaveText('Written for a female Guildmaster of 34. Change them as you like.');
  for (const field of [birthplace, appearance, biography]) await expect(field).not.toHaveValue('');
  const first = { birthplace: await birthplace.inputValue(), biography: await biography.inputValue() };
  // The Portrait chosen is the owner's, so the Appearance is its narrative, whatever its words.
  expect(narratives).toContain(await appearance.inputValue());
  await expectNoHorizontalOverflow(page, 'the texts written');
  await expectTargets(page, 'the texts written');

  // "Again" writes them anew.
  const again = setup.getByRole('button', { name: 'Again', exact: true });
  await again.click();
  await again.click();
  const second = { birthplace: await birthplace.inputValue(), biography: await biography.inputValue() };
  expect(second).not.toEqual(first);

  // Another sex, age and picture are written for, and the fields stay editable.
  await chooseGuildmaster(setup, { sex: 'male', age: '47', picture: 'Male Portrait 3' });
  await setup.getByRole('button', { name: 'Write them for me', exact: true }).click();
  await expect(setup.getByTestId('written-for')).toHaveText('Written for a male Guildmaster of 47. Change them as you like.');
  const looks = await appearance.inputValue();
  expect(looks).not.toBe('');
  await biography.fill('Kept the toll bridge at Wyndham for twenty years.');
  const kept = await birthplace.inputValue();

  await startGame(page, { guild: 'The Lantern', master: 'Ada Vell', seed: 'e2e-described' });
  const guildmaster = await openView(page, 'Guildmaster');
  await expect(guildmaster).toContainText(kept);
  await expect(guildmaster).toContainText('Kept the toll bridge at Wyndham for twenty years.');
  await expect(guildmaster).toContainText(looks);
  await expectNoHorizontalOverflow(page, "the Guildmaster's texts");
});
