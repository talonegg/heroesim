import { probe } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { modulesFromQuery, pageModules } from './modules';

// The page's test-only switch for modules (M8-S4, DL-79): a query parameter, `?modules=probe`, and
// none installed without it.

describe('the modules a page address installs', () => {
  test('none without the parameter, or with it empty', () => {
    expect(modulesFromQuery('')).toEqual([]);
    expect(modulesFromQuery('?seed=demo')).toEqual([]);
    expect(modulesFromQuery('?modules=')).toEqual([]);
  });

  test('the probe, by its id, the one module the page knows', () => {
    expect(Object.keys(pageModules)).toEqual(['probe']);
    expect(modulesFromQuery('?modules=probe')).toEqual([probe]);
    expect(modulesFromQuery('modules=probe')).toEqual([probe]);
    expect(modulesFromQuery('?other=1&modules=%20probe%20')).toEqual([probe]);
  });

  test('each once, in the order named; an id the page does not know installs nothing', () => {
    expect(modulesFromQuery('?modules=probe,probe')).toEqual([probe]);
    expect(modulesFromQuery('?modules=weather,probe')).toEqual([probe]);
    expect(modulesFromQuery('?modules=Probe')).toEqual([]);
    expect(modulesFromQuery('?modules=weather')).toEqual([]);
  });
});
