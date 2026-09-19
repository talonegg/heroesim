import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME as ENGINE_PACKAGE_NAME } from '@heroesim/engine';
import { PACKAGE_NAME } from '../src/index.js';

describe('@heroesim/narrate', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@heroesim/narrate');
  });

  it('resolves @heroesim/engine from source across the workspace', () => {
    expect(ENGINE_PACKAGE_NAME).toBe('@heroesim/engine');
  });
});
