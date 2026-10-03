import { afterEach, describe, expect, test, vi } from 'vitest';
import { guildPartKey, rememberedGuildPart, rememberedList, rememberedView, rememberGuildPart, rememberList, rememberView, viewKey } from './remembered';

// What this browser remembers of the page (M9-S3, DL-103; M9-F2, DL-115): the view open, and the
// Guild's part open. The Hall was a view until M9-F2 and is a part of the Guild since: a browser
// that remembers the Hall view opens the Guild at its Hall (DL-112 item 5).

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
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
