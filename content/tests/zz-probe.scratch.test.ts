import { describe, expect, it } from 'vitest';
import {
  advanceUntilAttention,
  availableHeroes,
  commitParty,
  newCareer,
  proposeParty,
  type Career,
  type Content,
  type GameEvent,
  type Hero,
} from '@heroesim/engine';
import { loadContentFromDisk } from '../src/node.js';

const content: Content = loadContentFromDisk();
const strength = (hero: Hero): number =>
  hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;

describe.skipIf(process.env['HEROESIM_PROBE'] === undefined)('probe', () => {
  it('counts Regard movements by reason', () => {
    const byReason = new Map<string, { up: number; down: number }>();
    let years = 0;
    const seeds = 30;
    for (let seed = 0; seed < seeds; seed += 1) {
      let career: Career = newCareer(`balance-${seed}`, content).career;
      const read = (events: readonly GameEvent[]): void => {
        for (const event of events) {
          if (event.type !== 'HeroRegardForGuildmasterChanged') continue;
          const entry = byReason.get(event.reason) ?? { up: 0, down: 0 };
          if (event.delta > 0) entry.up += event.delta;
          if (event.delta < 0) entry.down += event.delta;
          byReason.set(event.reason, entry);
        }
      };
      while (career.ended === undefined) {
        const free = [...availableHeroes(career)].sort((a, b) => strength(b) - strength(a));
        const byFee = [...career.board].sort((a, b) => b.fee - a.fee);
        const used = new Set<string>();
        for (const commission of byFee) {
          const left = free.filter((hero) => !used.has(hero.id));
          if (left.length === 0) break;
          const refusing = new Set(
            proposeParty(career, commission.id, left.map((h) => h.id), content).refusals.map(
              (r) => r.heroId,
            ),
          );
          const party = left.filter((h) => !refusing.has(h.id)).slice(0, 2).map((h) => h.id);
          if (party.length === 0) continue;
          const step = commitParty(career, commission.id, party, content);
          career = step.career;
          read(step.events);
          for (const id of party) used.add(id);
        }
        const step = advanceUntilAttention(career, content);
        career = step.career;
        read(step.events);
      }
      years += (career.ended.onDay - 1) / career.config.daysPerYear;
    }
    const lines = [...byReason.entries()]
      .sort((a, b) => a[1].down - b[1].down)
      .map(([reason, v]) => `${String(v.down).padStart(7)} ${String(v.up).padStart(6)}  ${reason}`);
    // eslint-disable-next-line no-console
    console.log(
      `\nover ${seeds} Careers, ${years.toFixed(1)} Career-years total\n   down     up  reason\n${lines.join('\n')}\n`,
    );
    expect(byReason.size).toBeGreaterThan(0);
  });
});
