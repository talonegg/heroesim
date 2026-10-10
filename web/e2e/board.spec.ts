import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSources, isFolder, parseContent } from '@heroesim/content';
import { createWorld, defaultConfig, isDeadly, serialise, turnsPerDay, type ContentSet, type Quest, type WorldDocument } from '@heroesim/engine';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, openView, region } from './support';

// The Board's card and the Party builder in the built page (DL-269), at a phone's width, a
// tablet's and a desktop's. The card leads with the Quest's Tier, Deadly where it can kill (a mark,
// with no figure, DL-257 item 5, Q18 b), its Days and its reward; the builder opens on the Quest's
// narrative, its Beats' lines in order, and says the least Party it takes, with no Death figure.
//
// The game is a new one whose first Board holds a Deadly Quest and one that is not, found seed by seed
// in the saved content, so that the spec holds whatever Quests the content's templates draw; it is
// written as a save and opened with "Load a save file", and each card is held to its Quest's row.

const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-10-11T09:00:00.000Z' };
const contentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'content');

/**
 * The saved content, as the build bundles it: each kind's one file or its folder's rows, by their path in
 * the content directory, parsed and checked (`parseContent`). The spec reads the files itself, as
 * content's Node entry is the CLI's and the harness's (eslint.config.js).
 */
function savedContent(): ContentSet {
  const files: Record<string, string> = {};
  for (const source of contentSources) {
    const names = isFolder(source) ? readdirSync(path.join(contentDir, source)).filter((name) => name.endsWith('.json')) : [''];
    for (const name of names) files[`${source}${name}`] = readFileSync(path.join(contentDir, source, name), 'utf8');
  }
  return parseContent(files);
}

const content = savedContent();

/** The first new game, seed by seed, whose first Board holds a Deadly Quest and one that is not. */
function aBoardWithADeadlyQuest(): WorldDocument {
  const deps = { config: defaultConfig, content };
  for (let index = 0; index < 200; index += 1) {
    const { document } = createWorld(`e2e-board-${index}`, setup, deps);
    const deadly = questsOf(document).map((quest) => isDeadly(quest, content, defaultConfig));
    if (deadly.includes(true) && deadly.includes(false)) return document;
  }
  throw new Error('No seed of 200 gives a first Board with a Deadly Quest and one that is not');
}

/** The Quests on the Board, in its order, which the page shows as posted. */
function questsOf(document: WorldDocument): Quest[] {
  return document.world.board.map((id) => document.world.quests[id] as Quest);
}

/** Opens `document` in the page from the new-game form's "Load a save file", and gives the Board, opened. */
async function opened(page: Page, document: WorldDocument, testInfo: TestInfo): Promise<Locator> {
  const file = testInfo.outputPath('board.json');
  writeFileSync(file, serialise(document));
  await page.goto('/');
  await region(page, 'A new game').getByLabel('Load a save file').setInputFiles(file);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(setup.guildName);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  return openView(page, 'Board');
}

/** `5 Days away`, as the card says a Quest's Days. */
function daysWords(quest: Quest): string {
  const days = quest.durationTurns / turnsPerDay;
  return `${days} ${days === 1 ? 'Day' : 'Days'} away`;
}

test("each card leads with its Quest's Tier, Deadly where it can kill, its Days and its reward", async ({ page }, testInfo) => {
  const document = aBoardWithADeadlyQuest();
  const board = await opened(page, document, testInfo);
  const cards = board.getByRole('article');
  const quests = questsOf(document);
  await expect(cards).toHaveCount(quests.length);

  for (const [index, quest] of quests.entries()) {
    const card = cards.nth(index);
    const name = content.questTemplates[quest.templateKey]?.name ?? '';
    await expect(card.getByRole('heading', { level: 3 })).toHaveText(name);
    const terms = card.getByRole('list', { name: `The terms of ${name}` }).getByRole('listitem');
    const deadly = isDeadly(quest, content, defaultConfig);
    const lead = [`Tier ${quest.tier}`, ...(deadly ? ['Deadly'] : []), daysWords(quest), `${quest.reward} Wealth`];
    expect((await terms.allTextContents()).slice(0, lead.length)).toEqual(lead);
    if (deadly) {
      // A mark, its title what it means, and no figure.
      const mark = card.locator('.chip', { hasText: /^Deadly$/ });
      await expect(mark).toHaveAttribute('title', 'A Hero may die on this Quest');
      await expect(card).not.toContainText('%');
    } else {
      await expect(card).not.toContainText('Deadly');
    }
  }
  await expectNoHorizontalOverflow(page, 'the Board, its cards leading with their Tiers');
});

test("the Party builder opens on the Quest's Beats' lines in order, says the least Party it takes, and gives no Death figure", async ({ page }, testInfo) => {
  const document = aBoardWithADeadlyQuest();
  const board = await opened(page, document, testInfo);
  const quests = questsOf(document);
  // The builder of a Deadly Quest, where a Death figure would be if the page gave one.
  const index = quests.findIndex((quest) => isDeadly(quest, content, defaultConfig));
  const quest = quests[index] as Quest;
  const card = board.getByRole('article').nth(index);

  await card.getByRole('button', { name: 'Choose a Party' }).click();
  const form = card.getByRole('form');
  const beats = form.getByTestId('beats');
  await expect(form.getByRole('heading', { level: 4 }).first()).toHaveText('Beats');
  await expect(beats.getByRole('listitem')).toHaveText(quest.beatLines);
  const least = quest.requirements.partySizeMin;
  const floor = form.locator('.checklist li').first();
  await expect(floor).toHaveText(`A Party of at least ${least} (0 chosen): missed`);

  // Enough Heroes chosen to meet it: the checklist says so, and the chances come, still with no Death figure.
  const boxes = form.getByRole('checkbox', { disabled: false });
  for (let chosen = 0; chosen < least; chosen += 1) await boxes.nth(chosen).check();
  await expect(floor).toHaveText(`A Party of at least ${least} (${least} chosen): met`);
  await expect(form.getByTestId('chances')).toBeVisible();
  await expect(form).not.toContainText(/\bDeath\b|\bdie\b|\bDeadly\b/);
  await expectNoHorizontalOverflow(page, "the Party builder, opened on the Quest's Beats");
});
