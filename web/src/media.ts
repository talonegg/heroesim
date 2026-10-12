// The page's pictures (v1.1.2-S2; DL-125 items 1, 2, 7 and 8): the repository's `media/` folder,
// which the build knows file by file through `import.meta.glob`, as `content.ts` knows `content/`.
//
//   media/portraits/{guildmasters,heroes,patrons}/{female,male}/silhouette.svg, <portraitKey>.webp,
//     <portraitKey>.thumb.webp (its thumbnail, v1.1.3-S2)
//   media/banners/silhouette.svg
//   media/items/silhouette.svg, <definitionKey>.webp
//
// A Silhouette is a few hundred bytes of SVG, inlined into the one script (vite.config.ts), so it is
// always there: it is what a place shows while its picture loads, when it has none and when one
// fails. A picture is a hashed file beside the script in `dist/assets/`, loaded by a relative
// `<img>`, from the page's own origin or its own folder and never another (principle 12 as DL-125
// item 1 reads it). `media.test.ts` holds the folder to its rules.
//
// A place is found by what it shows, never by a file named in a view: a Portrait by the person's
// role, sex and Portrait's key, a Guild Banner by its Guild, a Unique Item's picture by its content
// key (`views/pictures.tsx`).

import type { GuildId, ItemDefinitionKey, PortraitRole, Sex } from '@heroesim/engine';

/**
 * Whose pictures a Portrait is drawn from: each role has its folder, with a folder per sex (DL-125
 * item 2), as `content/portraits.json` lists them by role and sex (v1.1.2-S3).
 */
export type { PortraitRole };

const roleFolders: Readonly<Record<PortraitRole, string>> = Object.freeze({
  guildmaster: 'guildmasters',
  hero: 'heroes',
  patron: 'patrons',
});

/** What a place shows: its Silhouette, which is always there, and its picture, `null` where none exists. */
export interface Pictured {
  silhouette: string;
  picture: string | null;
}

/**
 * Every Silhouette and picture under `media/` as the URL the build gives it, keyed by the path Vite
 * resolved it from (`../../media/items/silhouette.svg`): a Silhouette's is a `data:` URL, a
 * picture's `./assets/<name>-<hash>.webp`. The portrait tool's inbox, `media/inbox/`, is never
 * shipped: an upload, or a trial conversion beside it, waits there to be taken in (v1.1.3-S2).
 */
const shipped = import.meta.glob<string>(
  ['../../media/**/*.{svg,webp}', '!../../media/inbox/**', '!../../media/portraits/heroes/*/*/**'],
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
);

/** A bundler key's path under `media/`, as the folder names it: `items/silhouette.svg`. */
export function mediaPathOf(key: string): string {
  const path = key.replace(/\\/g, '/');
  return path.slice(path.indexOf('media/') + 'media/'.length);
}

/** The shipped files' URLs by their path under `media/`. Exported for a test. */
export const mediaFiles: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(shipped).map(([key, url]) => [mediaPathOf(key), url]),
);

/**
 * The frame of a Portrait's Silhouette with no figure in it, in the Silhouettes' cream (v1.1.2-S6):
 * what a person of a sex the folders do not know shows. The engine refuses such a save
 * (`document-shape`); this is so that a place is still never what breaks the page.
 */
export const neutralSilhouette =
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><rect width="30" height="40" fill="#f3ecdb"/></svg>');

/** What each place shows, found in a catalogue of files. */
export interface MediaCatalogue {
  /**
   * A person's Portrait: the Silhouette of their sex, and the picture their key names, if it exists;
   * the neutral Silhouette and no picture for a sex with no folder of its role's, which no sex of the
   * engine's is (`media.test.ts`).
   */
  portrait(role: PortraitRole, sex: Sex, portraitKey: string | null): Pictured;
  /**
   * A person's thumbnail (v1.1.3-S7, DL-135 item 9): as their Portrait, from `<key>.thumb.webp`, the
   * 160 × 213 picture beside the full one, for a list and the setup grid. A Hero's is found under
   * `portraits/heroes/<sex>/` once Hero pictures exist; until then, as for anyone with no picture, it
   * is the Silhouette.
   */
  portraitThumbnail(role: PortraitRole, sex: Sex, portraitKey: string | null): Pictured;
  /** A Guild's Banner: every Guild shows the Silhouette for now (DL-125 item 7). */
  banner(guild: GuildId): Pictured;
  /** An Item's picture, found by its content key (DL-125 item 8). */
  item(definitionKey: ItemDefinitionKey): Pictured;
}

/** The catalogue of `files`, URLs by their path under `media/`. */
export function mediaCatalogue(files: Readonly<Record<string, string>>): MediaCatalogue {
  const file = (path: string): string | null => (Object.hasOwn(files, path) ? (files[path] ?? null) : null);
  const silhouette = (folder: string): string => {
    const url = file(`${folder}/silhouette.svg`);
    if (url === null) throw new Error(`media/${folder} has no silhouette.svg`);
    return url;
  };
  /** A person's Silhouette, and their picture of `suffix`: `.webp`, or `.thumb.webp` for the thumbnail. */
  const person = (role: PortraitRole, sex: Sex, portraitKey: string | null, suffix: string): Pictured => {
    const folder = `portraits/${roleFolders[role]}/${sex}`;
    if (file(`${folder}/silhouette.svg`) === null) return { silhouette: neutralSilhouette, picture: null };
    return { silhouette: silhouette(folder), picture: portraitKey === null ? null : file(`${folder}/${portraitKey}${suffix}`) };
  };
  return {
    portrait: (role, sex, portraitKey) => person(role, sex, portraitKey, '.webp'),
    portraitThumbnail: (role, sex, portraitKey) => person(role, sex, portraitKey, '.thumb.webp'),
    banner: () => ({ silhouette: silhouette('banners'), picture: null }),
    item: (definitionKey) => ({ silhouette: silhouette('items'), picture: file(`items/${definitionKey}.webp`) }),
  };
}

/** The page's pictures: `media/` as built. */
export const media: MediaCatalogue = mediaCatalogue(mediaFiles);
