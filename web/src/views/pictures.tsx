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
//
// A Portrait's thumbnail (v1.1.2-S4) is a Guildmaster picture as the new-game form offers it: the
// label of its radio button, which a screen reader names by the picture it is ("Female Portrait 1").

import type { GuildId, ItemDefinitionKey, Sex } from '@heroesim/engine';
import { useCallback, useState } from 'react';
import { media, type Pictured, type PortraitRole } from '../media';

/** Where a place's picture is: none to show, loading over its Silhouette, shown, or failed. */
type PictureState = 'none' | 'loading' | 'loaded' | 'failed';

/** What `usePicture` gives a place: the state, what its `<img>` reports, and a ref for the `<img>`. */
interface Shown {
  state: PictureState;
  loaded: () => void;
  failed: () => void;
  /** Settles a picture the browser already holds, as its `<img>` mounts. */
  mounted: (img: HTMLImageElement | null) => void;
}

/**
 * The state of `picture`, and what its `<img>` reports. A new picture starts loading again: what
 * was settled is kept with the URL it was settled for. A picture the browser already holds, as a
 * Portrait seen before is when its view opens again, is complete as its `<img>` mounts, and is
 * settled then, before the page is painted, so its Silhouette does not show for a frame
 * (v1.1.2-S2's verification, DL-131).
 */
function usePicture(picture: string | null): Shown {
  const [settled, setSettled] = useState<{ src: string; loaded: boolean } | null>(null);
  const state: PictureState =
    picture === null ? 'none' : settled === null || settled.src !== picture ? 'loading' : settled.loaded ? 'loaded' : 'failed';
  const loading = state === 'loading';
  // A state set in a ref's callback is applied before the browser paints, as a layout effect's is.
  const mounted = useCallback(
    (img: HTMLImageElement | null) => {
      if (loading && picture !== null && img !== null && img.complete && img.naturalWidth > 0) setSettled({ src: picture, loaded: true });
    },
    [loading, picture],
  );
  return {
    state,
    loaded: () => {
      if (picture !== null) setSettled({ src: picture, loaded: true });
    },
    failed: () => {
      if (picture !== null) setSettled({ src: picture, loaded: false });
    },
    mounted,
  };
}

/** A place's Silhouette, and its picture over it once it loads; the Silhouette again if it fails. */
function Layers({ pictured, alt, shown }: { pictured: Pictured; alt: string; shown: Shown }) {
  const { state, loaded, failed, mounted } = shown;
  return (
    <>
      {state === 'loaded' ? null : <img className="picture__silhouette" src={pictured.silhouette} alt="" data-picture="silhouette" />}
      {pictured.picture === null || state === 'failed' ? null : (
        <img
          className={state === 'loaded' ? 'picture__image' : 'picture__image is-loading'}
          ref={mounted}
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

/**
 * A Guildmaster picture as the new-game form offers it (v1.1.2-S4, DL-125 item 3): the picture of
 * `portraitKey` among the Guildmaster pictures of `sex`, over its Silhouette, and `label`, which a
 * screen reader reads in its place, so a radio button it stands in takes `label` as its name whether
 * the picture loads or fails. Not a figure: it stands inside a label.
 */
export function PortraitThumbnail({ sex, portraitKey, label }: { sex: Sex; portraitKey: string; label: string }) {
  const pictured = media.portrait('guildmaster', sex, portraitKey);
  const shown = usePicture(pictured.picture);
  return (
    <>
      <span className="portrait portrait--thumbnail" aria-hidden="true" data-testid="portrait-thumbnail">
        <Layers pictured={pictured} alt="" shown={shown} />
      </span>
      <span className="visually-hidden">{label}</span>
    </>
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
