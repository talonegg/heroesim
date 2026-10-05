import { act, cleanup, renderHook } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { preferences, rememberedGuildPart, rememberedList, rememberedPreference, rememberList, rememberPreference, useRemembered } from './remembered';

const viewKey = preferences.view.key;
const guildPartKey = preferences.guildPart.key;
const rememberedView = () => rememberedPreference(preferences.view);
const rememberView = (view: Parameters<typeof rememberPreference<typeof preferences.view>>[1]) => rememberPreference(preferences.view, view);
const rememberGuildPart = (part: Parameters<typeof rememberPreference<typeof preferences.guildPart>>[1]) => rememberPreference(preferences.guildPart, part);

// What this browser remembers of the page (M9-S3, DL-103; M9-F2, DL-115): the view open, and the
// Guild's part open. The Hall was a view until M9-F2 and is a part of the Guild since: a browser
// that remembers the Hall view opens the Guild at its Hall (DL-112 item 5).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('the view and the Guild part remembered (M9-F2)', () => {
  test('a view kept is the view opened; nothing kept, or a view the page does not know, opens the Guild at its Home', () => {
    expect(rememberedView()).toBe('guild');
    expect(rememberedGuildPart()).toBe('home');

    rememberView('market');
    expect(rememberedView()).toBe('market');
    rememberView('guildmaster');
    expect(rememberedView()).toBe('guildmaster');

    localStorage.setItem(viewKey, 'the-cellar');
    localStorage.setItem(guildPartKey, 'the-cellar');
    expect(rememberedView()).toBe('guild');
    expect(rememberedGuildPart()).toBe('home');
  });

  test('the Guild part kept is the part opened', () => {
    rememberGuildPart('hall');
    expect(rememberedGuildPart()).toBe('hall');
    rememberGuildPart('home');
    expect(rememberedGuildPart()).toBe('home');
  });

  test('a view remembered as "hall", from before M9-F2, opens the Guild at its Hall part', () => {
    localStorage.setItem(viewKey, 'hall');
    localStorage.setItem(guildPartKey, 'home');

    expect(rememberedView()).toBe('guild');
    expect(rememberedGuildPart()).toBe('hall');
  });

  test('a browser that refuses storage opens the Guild at its Home', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    rememberGuildPart('hall');
    expect(rememberedView()).toBe('guild');
    expect(rememberedGuildPart()).toBe('home');
  });
});

describe("a list remembered, as the Roster's hidden columns are (v1.1.5-S12, DL-169 item 11)", () => {
  const choices = ['class', 'level', 'strength'] as const;

  test('a list kept is the list read, in the order of the choices, leaving out what the page does not know', () => {
    expect(rememberedList('heroesim.test', choices)).toBeNull();
    rememberList('heroesim.test', ['strength', 'class']);
    expect(localStorage.getItem('heroesim.test')).toBe('strength,class');
    expect(rememberedList('heroesim.test', choices)).toEqual(['class', 'strength']);
    localStorage.setItem('heroesim.test', 'level,the-cellar');
    expect(rememberedList('heroesim.test', choices)).toEqual(['level']);
    rememberList('heroesim.test', []);
    expect(rememberedList('heroesim.test', choices)).toEqual([]);
  });

  test('a browser that refuses storage reads nothing kept, and keeps nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    rememberList('heroesim.test', ['class']);
    expect(rememberedList('heroesim.test', choices)).toBeNull();
  });
});

/** Every storage access refused, as a private window or blocked site data does. */
function refuseStorage(): void {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  });
}

describe('the table of the nine viewing preferences (v1.1.6-S15, DL-186 item 25)', () => {
  const table = Object.entries(preferences);

  test('is nine, each under a key of its own, prefixed "heroesim."', () => {
    expect(table).toHaveLength(9);
    const keys = table.map(([, { key }]) => key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^heroesim\.[A-Za-z]+$/);
  });

  test("keeps the keys a player's browser already holds", () => {
    expect(table.map(([, { key }]) => key).sort()).toEqual(
      ['view', 'guildPart', 'boardOrder', 'guildsOrder', 'poolOrder', 'rosterView', 'rosterOrder', 'rosterColumns', 'rosterTab'].map((name) => `heroesim.${name}`).sort(),
    );
  });

  test("each has choices, and a fallback that is one of them (a list's, empty)", () => {
    for (const [name, { choices, fallback }] of table) {
      expect(choices.length, name).toBeGreaterThan(0);
      if (Array.isArray(fallback)) expect(fallback, name).toEqual([]);
      else expect(choices, name).toContain(fallback);
    }
  });

  test('a stored value outside the choices falls back, and one inside is read', () => {
    for (const [name, which] of table) {
      localStorage.setItem(which.key, 'by-moonlight');
      const fallback = Array.isArray(which.fallback) ? [] : which.fallback;
      expect(rememberedPreference(which as never), name).toEqual(fallback);
      const [first = ''] = which.choices;
      localStorage.setItem(which.key, first);
      expect(rememberedPreference(which as never), name).toEqual(Array.isArray(which.fallback) ? [first] : first);
    }
  });

  test('storage refused leaves every default, and keeping one does not throw', () => {
    refuseStorage();
    for (const [name, which] of table) {
      expect(rememberedPreference(which as never), name).toEqual(which.fallback);
      expect(() => rememberPreference(which as never, which.choices[0] as never), name).not.toThrow();
    }
  });
});

describe('useRemembered', () => {
  test('opens on what is kept, and keeps what is in force: the fallback it opens on, and what is set', () => {
    expect(renderHook(() => useRemembered(preferences.poolOrder)).result.current[0]).toBe('listed');
    expect(localStorage.getItem(preferences.poolOrder.key)).toBe('listed');

    localStorage.setItem(preferences.poolOrder.key, 'fee');
    const { result } = renderHook(() => useRemembered(preferences.poolOrder));
    expect(result.current[0]).toBe('fee');
    act(() => result.current[1]('class'));
    expect(result.current[0]).toBe('class');
    expect(localStorage.getItem(preferences.poolOrder.key)).toBe('class');
  });

  test('keeps nothing while rendering: a set made in a render, as Guild › Home is opened, is kept once the render is committed', () => {
    let rendering = false;
    const keptWhileRendering: boolean[] = [];
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      keptWhileRendering.push(rendering);
      setItem.call(this, key, value);
    });
    const { result } = renderHook(() => {
      rendering = true;
      const [view, setView] = useRemembered(preferences.view);
      if (view !== 'market') setView('market');
      useLayoutEffect(() => {
        rendering = false;
      });
      return view;
    });
    expect(result.current).toBe('market');
    expect(localStorage.getItem(preferences.view.key)).toBe('market');
    expect(keptWhileRendering.length).toBeGreaterThan(0);
    expect(keptWhileRendering).not.toContain(true);
  });

  test('where `localStorage` itself cannot be reached, every preference opens on its default and a set still changes the page', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    expect(() => globalThis.localStorage).toThrow();
    for (const [name, which] of Object.entries(preferences)) {
      const { result } = renderHook(() => useRemembered(which as never));
      expect(result.current[0], name).toEqual(which.fallback);
      const next = Array.isArray(which.fallback) ? which.choices.slice(0, 1) : which.choices.at(-1);
      act(() => (result.current[1] as (next: unknown) => void)(next));
      expect(result.current[0], name).toEqual(next);
    }
  });

  test('a list is kept as the list', () => {
    const { result } = renderHook(() => useRemembered(preferences.rosterColumns));
    expect(result.current[0]).toEqual([]);
    const [first = '', second = ''] = preferences.rosterColumns.choices;
    act(() => result.current[1]([first, second]));
    expect(localStorage.getItem(preferences.rosterColumns.key)).toBe(`${first},${second}`);
  });

  test('the Guild part reads the Hall view kept before M9-F2', () => {
    localStorage.setItem(viewKey, 'hall');
    const { result } = renderHook(() => useRemembered(preferences.guildPart, rememberedGuildPart));
    expect(result.current[0]).toBe('hall');
  });

  test('storage refused, it opens on the default and a set still changes the page', () => {
    refuseStorage();
    const { result } = renderHook(() => useRemembered(preferences.view));
    expect(result.current[0]).toBe('guild');
    act(() => result.current[1]('market'));
    expect(result.current[0]).toBe('market');
  });
});
