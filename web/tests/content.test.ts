import { describe, expect, it } from 'vitest';
import { loadContentFromDisk } from '@heroesim/content/node';
import { content, contentFiles, contentPathOf } from '../src/content';

/**
 * The browser gets its content from the bundler and the CLI gets it from disk. They must
 * be the same content, or the two front ends are not playing the same game (E8-S1).
 */
describe('bundled content', () => {
  it('normalises a bundler key to a path relative to the content directory', () => {
    expect(contentPathOf('../../content/traits.toml')).toBe('traits.toml');
    expect(contentPathOf('/content/vignettes/night-attack.toml')).toBe(
      'vignettes/night-attack.toml',
    );
    expect(contentPathOf('C:\\JHH\\source\\heroesim\\content\\names.toml')).toBe('names.toml');
  });

  it('bundles every content file', () => {
    expect(Object.keys(contentFiles)).toEqual(
      expect.arrayContaining(['traits.toml', 'backgrounds.toml', 'spheres.toml', 'names.toml']),
    );
    expect(
      Object.keys(contentFiles).filter((path) => path.startsWith('vignettes/')).length,
    ).toBeGreaterThan(0);
  });

  it('is deep-equal to the content the Node entry reads from disk', () => {
    expect(content).toEqual(loadContentFromDisk());
  });

  it('comes back validated, so it is not validated twice', () => {
    expect(content.vignettes.length).toBeGreaterThan(0);
    expect(content.traits.length).toBeGreaterThan(0);
    for (const vignette of content.vignettes) {
      expect(vignette.outcomes.success.narrative.length).toBeGreaterThan(0);
    }
  });
});
