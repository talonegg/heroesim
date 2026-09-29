import { afterEach, describe, expect, test, vi } from 'vitest';
import { guildPartKey, rememberedGuildPart, rememberedView, rememberGuildPart, rememberView, viewKey } from './remembered';

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
