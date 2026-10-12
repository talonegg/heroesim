import { loadContent } from '@heroesim/content/node';
import {
  advance,
  createWorld,
  defaultConfig,
  dispositionOf,
  upkeep,
  validate,
  type EngineDeps,
  type Guild,
  type World,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { harnessSetup } from './creation.js';

// The core content's Rivals (M6 verification, DL-60): an ordinary test, run by `npm test`, of what the
// core's four Dispositions do under the engine's rules. The engine's own tests read the test content's
// copy of the rows (DL-56); this reads the core's, which a balance pass edits.

const content = loadContent();
/**
 * The config the test relies on, pinned against a balance pass: the need's floor and reserve, and an
 * empty Market, so that no Rival outfits its Heroes before it hires (DL-58's order).
 */
const deps: EngineDeps = { config: { ...defaultConfig, rivalRosterMin: 4, rivalHireReserveUpkeeps: 3, marketSize: 0 }, content };

const rivalsOf = (world: World): Guild[] => Object.values(world.guilds).filter((guild) => dispositionOf(guild) !== null);

describe("the core's Rivals hire back to rivalRosterMin by need (DL-60)", () => {
  test('a Rival of every Disposition, cut to two Heroes with its Wealth under its threshold, recruits back to four within ten Days', () => {
    const topGrade = (facility: string) =>
      Math.max(...Object.values(content.improvements).filter((row) => row.facility === facility).map((row) => row.grade));
    let document = createWorld('core-need', harnessSetup, deps).document;
    expect(rivalsOf(document.world).map((guild) => dispositionOf(guild)).sort()).toEqual(['ambitious', 'miserly', 'reckless', 'steady']);
    for (const rival of rivalsOf(document.world)) {
      // Two Heroes left, the others dead; the Hall at its top, so that no build comes before a hire
      // (DL-58's order); a Wealth under the row's threshold, so that only the need hires.
      for (const heroId of rival.rosterIds.splice(2)) {
        const hero = document.world.heroes[heroId];
        if (hero !== undefined) hero.diedOnTurn = document.world.turn;
      }
      for (const facility of Object.keys(content.facilities)) rival.hall[facility] = topGrade(facility);
      rival.wealth = 1_000;
      const threshold = (content.dispositions[dispositionOf(rival) ?? '']?.recruitThreshold ?? 0) * upkeep(rival, document.world, deps.config, content);
      expect(rival.wealth, dispositionOf(rival) ?? '').toBeLessThan(threshold);
    }
    const recruited = new Map<string, number>();
    const largest = new Map<string, number>();
    while (document.world.turn < 30) {
      const result = advance(document, deps);
      document = result.document;
      for (const event of result.events) {
        if (event.type === 'hero.recruited') recruited.set(event.payload.guildId, (recruited.get(event.payload.guildId) ?? 0) + 1);
      }
      for (const rival of rivalsOf(document.world)) largest.set(rival.id, Math.max(largest.get(rival.id) ?? 0, rival.rosterIds.length));
    }

    for (const rival of rivalsOf(document.world)) {
      const disposition = dispositionOf(rival) ?? '';
      expect(recruited.get(rival.id) ?? 0, disposition).toBeGreaterThan(0);
      expect(largest.get(rival.id), disposition).toBeGreaterThanOrEqual(4);
    }
    const validated = validate(document, deps);
    expect(validated.ok ? validated.warnings : validated.failures).toEqual([]);
  });
});
