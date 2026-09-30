// The page's pictures (v1.1.2-S2; DL-125 items 2, 7 and 8): a person's Portrait, a Guild's Banner
// and a Unique Item's picture. Each shows its Silhouette, which the script holds, until its picture
// loads, and again when the picture fails, so a place is never empty and the page never breaks
// (the epic's §4: a browser that refuses a picture over `file://`). Each finds what it shows in
// `media.ts` by what it stands for, never by a file a view names.
//
// A Portrait is a figure three wide by four high, its picture's alt text "Portrait of {name}"; a
// Silhouette says nothing the name beside it does not, so its alt text is empty and the figure is
// hidden from screen readers while it shows one. A Banner and an Item's picture always stand beside
// the name they picture, so both are hidden from screen readers.

import type { GuildId, ItemDefinitionKey, Sex } from '@heroesim/engine';
import { useState } from 'react';
import { media, type Pictured, type PortraitRole } from '../media';

/** Where a place's picture is: none to show, loading over its Silhouette, shown, or failed. */
type PictureState = 'none' | 'loading' | 'loaded' | 'failed';

/**
 * The state of `picture`, and what its `<img>` reports. A new picture starts loading again: what
 * was settled is kept with the URL it was settled for.
 */
function usePicture(picture: string | null): { state: PictureState; loaded: () => void; failed: () => void } {
  const [settled, setSettled] = useState<{ src: string; loaded: boolean } | null>(null);
  const state: PictureState =
    picture === null ? 'none' : settled === null || settled.src !== picture ? 'loading' : settled.loaded ? 'loaded' : 'failed';
  return {
    state,
    loaded: () => {
      if (picture !== null) setSettled({ src: picture, loaded: true });
    },
    failed: () => {
      if (picture !== null) setSettled({ src: picture, loaded: false });
    },
  };
}

/** A place's Silhouette, and its picture over it once it loads; the Silhouette again if it fails. */
function Layers({ pictured, alt, shown }: { pictured: Pictured; alt: string; shown: ReturnType<typeof usePicture> }) {
  const { state, loaded, failed } = shown;
  return (
    <>
      {state === 'loaded' ? null : <img className="picture__silhouette" src={pictured.silhouette} alt="" data-picture="silhouette" />}
      {pictured.picture === null || state === 'failed' ? null : (
        <img
          className={state === 'loaded' ? 'picture__image' : 'picture__image is-loading'}
          src={pictured.picture}
          alt={alt}
          data-picture="picture"
          onLoad={loaded}
          onError={failed}
        />
      )}
    </>
  );
}

/**
 * A person's Portrait (DL-125 item 2): the picture `portraitKey` names among their role's pictures
 * of their sex, or the Silhouette of their sex. `null` is the Silhouette, as every Rival's
 * Guildmaster, Hero and Patron has for now.
 */
export function Portrait({ role, sex, portraitKey, name }: { role: PortraitRole; sex: Sex; portraitKey: string | null; name: string }) {
  const pictured = media.portrait(role, sex, portraitKey);
  const shown = usePicture(pictured.picture);
  // Hidden from screen readers while only the Silhouette stands in it.
  const silent = shown.state === 'none' || shown.state === 'failed';
  return (
    <figure className="portrait" aria-hidden={silent ? true : undefined} data-testid="portrait">
      <Layers pictured={pictured} alt={`Portrait of ${name}`} shown={shown} />
    </figure>
  );
}

/** A Guild's Banner beside its name in a title (DL-125 item 7), the larger on its own page. */
export function GuildBanner({ guild, large = false }: { guild: GuildId; large?: boolean }) {
  const pictured = media.banner(guild);
  const shown = usePicture(pictured.picture);
  return (
    <span className={large ? 'guild-banner guild-banner--large' : 'guild-banner'} aria-hidden="true" data-testid="guild-banner">
      <Layers pictured={pictured} alt="" shown={shown} />
    </span>
  );
}

/** A Unique Item's picture, a small square before its name (DL-125 item 8). */
export function ItemPicture({ definitionKey }: { definitionKey: ItemDefinitionKey }) {
  const pictured = media.item(definitionKey);
  const shown = usePicture(pictured.picture);
  return (
    <span className="item-picture" aria-hidden="true" data-testid="item-picture">
      <Layers pictured={pictured} alt="" shown={shown} />
    </span>
  );
}
