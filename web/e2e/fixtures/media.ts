// The `file://` spec's catalogue of pictures (e2e/file.spec.ts, v1.1.2-S2): the page's own,
// `src/media.ts`, with the pictures under `e2e/fixtures/media/` added, laid out as `media/` is. Only
// `vite build --mode file-spec` reads it, in place of `src/media.ts` (vite.config.ts), so the spec
// sees a hashed picture load from `file://` before the owner's pictures come (v1.1.2-S4). No other
// build does, and the pictures never ship.
//
// The one picture is a Unique Item's, `items/barrow-kings-blade.webp`: 64 × 64, drawn in Chromium,
// a graphite stroke on the cream. An Item's picture is the one a new game can show before a
// Guildmaster has a Portrait's key (v1.1.2-S3).

import { mediaCatalogue, mediaFiles, mediaPathOf, type MediaCatalogue } from '../../src/media';

export * from '../../src/media';

const fixtures = import.meta.glob<string>('./media/**/*.webp', { eager: true, query: '?url', import: 'default' });

/** `media/` and the test's pictures, as the page's catalogue. */
export const media: MediaCatalogue = mediaCatalogue({
  ...mediaFiles,
  ...Object.fromEntries(Object.entries(fixtures).map(([key, url]) => [mediaPathOf(key), url])),
});
