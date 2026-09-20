import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectTapTargets,
  showPane,
  startCareer,
  VERIFICATION_DIR,
  WIDTHS,
} from './helpers';

/**
 * E2 in a real browser, on all three device projects: the Party picker names who will not
 * go and why, and insisting takes two deliberate taps — with no horizontal overflow and
 * tap targets of at least 40px while the refusal is on screen.
 *
 * **Reaching a refusing state without a back door.** World generation never starts a Hero
 * below −1, and playing a Career down to −3 in a browser would take minutes and depend on
 * the dice. So the Career is soured the way a player could sour it themselves: the app
 * saves to slot 1, the save document — which is exactly what `serialiseCareer` writes, and
 * which `web/src/state/storage.ts` says a `.career/*.json` file may be pasted into — has
 * one Hero's Regard lowered in it, and the app loads it back through its own slot picker.
 * Nothing test-only exists in the client for this spec to use.
 */

const SEED = 'heroesim-e2e-refusals';
const SLOT_KEY = 'heroesim.career.1';

interface SouredCareer {
  /** The name the picker prints for the Hero whose Regard was lowered. */
  sourName: string;
  /** The name of a Hero who will still go. */
  willingName: string;
  refusalRegardThreshold: number;
  insistenceRegardCost: number;
  departureRegardThreshold: number;
}

/**
 * Start a Career, save it, lower the first Hero's Regard to the refusing line inside the
 * saved document, and load that save back through the app.
 */
async function loadASouredCareer(page: Page): Promise<SouredCareer> {
  await startCareer(page, SEED);

  await page.getByTestId('open-saves').click();
  await page.getByTestId('save-1').click();
  await expect(page.getByTestId('slot-1')).toContainText('Day');
  await page.getByRole('button', { name: 'Close' }).click();

  const saved = await page.evaluate((key) => localStorage.getItem(key), SLOT_KEY);
  expect(saved, 'the app should have written slot 1').not.toBeNull();

  const career = JSON.parse(saved ?? '{}') as {
    config: {
      refusalRegardThreshold: number;
      insistenceRegardCost: number;
      departureRegardThreshold: number;
    };
    guild: {
      roster: {
        name: string;
        regardForGuildmaster: { value: number; reason: string; nature: string };
      }[];
    };
  };
  const sour = career.guild.roster[0];
  const willing = career.guild.roster[1];
  expect(sour, 'the seed should deal a Roster').toBeDefined();
  expect(willing, 'the seed should deal more than one Hero').toBeDefined();
  if (sour === undefined || willing === undefined) throw new Error('no Roster in the save');

  // Only the two fields a soured Regard would really carry: the document stays exactly
  // the shape `deserialiseCareer` requires, which is the point of doing it this way.
  sour.regardForGuildmaster.value = career.config.refusalRegardThreshold;
  sour.regardForGuildmaster.reason = 'you sent them anyway';

  await page.evaluate(
    (written: { key: string; document: string }) => {
      localStorage.setItem(written.key, written.document);
    },
    { key: SLOT_KEY, document: JSON.stringify(career, null, 2) },
  );

  await page.reload();
  await expect(page.getByTestId('begin')).toBeVisible();
  await page.getByTestId('open-saves').click();
  await page.getByTestId('load-1').click();
  await expect(page.getByTestId('guild-name')).toBeVisible();

  return {
    sourName: sour.name,
    willingName: willing.name,
    refusalRegardThreshold: career.config.refusalRegardThreshold,
    insistenceRegardCost: career.config.insistenceRegardCost,
    departureRegardThreshold: career.config.departureRegardThreshold,
  };
}

/** Open the first Commission's Party picker. */
async function openThePicker(page: Page): Promise<void> {
  await showPane(page, 'board');
  await page.getByTestId('commission').first().getByRole('button').click();
  await page.getByTestId('commit-party').waitFor();
}

/** The toggle whose label starts with this Hero's name. */
function toggleFor(page: Page, name: string) {
  return page.getByTestId('party-toggle').filter({ hasText: `${name} · ` });
}

test('names the Hero who will not go, and puts insisting behind a second tap', async ({ page }) => {
  const world = await loadASouredCareer(page);
  await openThePicker(page);

  // Nothing is said about refusals until the refusing Hero is actually chosen.
  await expect(page.getByTestId('refusals')).toHaveCount(0);
  await toggleFor(page, world.willingName).click();
  await expect(page.getByTestId('refusals')).toHaveCount(0);
  await expect(page.getByTestId('commit-party')).toContainText('Commit');

  // Choosing them names them, gives the reason, and states the price.
  await toggleFor(page, world.sourName).click();
  const refusals = page.getByTestId('refusals');
  await expect(refusals).toBeVisible();
  await expect(refusals.getByTestId('refusal')).toHaveCount(1);
  await expect(refusals.getByTestId('refusal')).toContainText(world.sourName);
  await expect(refusals.getByTestId('refusal')).toContainText(
    String(world.refusalRegardThreshold),
  );
  await expect(page.getByTestId('insist-cost')).toContainText(
    `${String(Math.abs(world.insistenceRegardCost))} Regard`,
  );
  await expect(page.getByTestId('insist-cost')).toContainText(
    String(world.departureRegardThreshold),
  );

  // The first tap arms and sends nobody; the picker is still open.
  const commit = page.getByTestId('commit-party');
  await expect(commit).toContainText('Insist');
  await expect(commit).toHaveAttribute('data-armed', 'no');
  await commit.click();
  await expect(commit).toHaveAttribute('data-armed', 'yes');
  await expect(commit).toBeVisible();
  await expect(page.getByTestId('insist-cost')).toContainText('Tap again');

  // Changing the Party puts it back behind two taps.
  await toggleFor(page, world.willingName).click();
  await expect(commit).toHaveAttribute('data-armed', 'no');
  await toggleFor(page, world.willingName).click();
  await expect(commit).toHaveAttribute('data-armed', 'no');

  // Two taps, and only then does anybody set out.
  await commit.click();
  await expect(commit).toHaveAttribute('data-armed', 'yes');
  await commit.click();
  await expect(page.getByTestId('commit-party')).toHaveCount(0);

  // The engine charged them, and the report says so in the player's own terms.
  await showPane(page, 'report');
  const report = (await page.getByTestId('report-log').textContent()) ?? '';
  expect(report).toContain(`${world.sourName} would not take`);
  expect(report).toContain(`You insisted, and ${world.sourName} goes anyway`);

  await showPane(page, 'roster');
  await expect(page.getByTestId('pane-roster')).toContainText(
    String(world.refusalRegardThreshold - Math.abs(world.insistenceRegardCost)),
  );
});

test('a refusal on screen still fits and can be tapped at every width', async ({ page }, testInfo) => {
  const projectViewport = page.viewportSize();
  const world = await loadASouredCareer(page);
  await openThePicker(page);
  await toggleFor(page, world.sourName).click();
  await expect(page.getByTestId('refusals')).toBeVisible();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: projectViewport?.height ?? 900 });
    await expect(page.getByTestId('refusals')).toBeVisible();
    await expectNoHorizontalOverflow(page, `a refusal at ${String(width)}px`);
    await expectTapTargets(page, `a refusal at ${String(width)}px`);

    // And armed, where the Commit button carries the longest label it ever has.
    await page.getByTestId('commit-party').click();
    await expect(page.getByTestId('commit-party')).toHaveAttribute('data-armed', 'yes');
    await expectNoHorizontalOverflow(page, `an armed refusal at ${String(width)}px`);
    await expectTapTargets(page, `an armed refusal at ${String(width)}px`);
    await toggleFor(page, world.willingName).click();
    await toggleFor(page, world.willingName).click();
    await expect(page.getByTestId('commit-party')).toHaveAttribute('data-armed', 'no');
  }

  if (projectViewport !== null) await page.setViewportSize(projectViewport);
  await expectNoHorizontalOverflow(page, `a refusal at the ${testInfo.project.name} viewport`);
  await expectTapTargets(page, `a refusal at the ${testInfo.project.name} viewport`);
  await page.screenshot({
    path: path.join(VERIFICATION_DIR, testInfo.project.name, 'refusal.png'),
    fullPage: testInfo.project.name === 'desktop',
  });
});
