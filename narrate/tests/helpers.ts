/**
 * Shared scaffolding for the narrate suite: the real content off disk, and the automatic
 * policy the engine's own contract suite plays with, so the paragraphs under test come
 * from a Career somebody could actually have played.
 */

import {
  advanceUntilAttention,
  availableHeroes,
  commitParty,
  newCareer,
  proposeParty,
  type Career,
  type Content,
  type GameConfig,
  type Hero,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import { narrateEvents, type Paragraph } from '../src/index.js';

/** The authored content, loaded once. */
export const content: Content = loadContentFromDisk();

/**
 * Send the strongest available Heroes, two at a time, at whatever the Board offers. Like
 * the engine's own policy it asks who would refuse and sends somebody else rather than
 * insisting, so the Regard these paragraphs report moved on its own (E2).
 */
export function playCareer(
  seed: string,
  config?: Partial<GameConfig>,
): { career: Career; paragraphs: Paragraph[] } {
  const opened = newCareer(seed, content, config);
  let career = opened.career;
  const paragraphs: Paragraph[] = [...narrateEvents(opened.events, career, content)];

  const strength = (hero: Hero): number =>
    hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;

  for (let guard = 0; guard < 2000 && career.ended === undefined; guard += 1) {
    for (const commission of [...career.board]) {
      const free = [...availableHeroes(career)].sort((a, b) => strength(b) - strength(a));
      if (free.length < 2) break;
      const refusing = new Set(
        proposeParty(
          career,
          commission.id,
          free.map((hero) => hero.id),
          content,
        ).refusals.map((refusal) => refusal.heroId),
      );
      const party = free
        .filter((hero) => !refusing.has(hero.id))
        .slice(0, 2)
        .map((hero) => hero.id);
      if (party.length === 0) continue;
      const step = commitParty(career, commission.id, party, content);
      career = step.career;
      paragraphs.push(...narrateEvents(step.events, career, content));
    }
    const step = advanceUntilAttention(career, content);
    career = step.career;
    paragraphs.push(...narrateEvents(step.events, career, content));
    if (step.events.length === 0) break;
  }

  return { career, paragraphs };
}
