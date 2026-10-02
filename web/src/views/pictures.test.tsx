import type { GuildId, Sex, WorldDocument } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { mediaFiles, neutralSilhouette } from '../media';
import { carryingUnique, changed, holding, holdingUnique, started } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { openView, rosterList, section } from './page.test-support';
import { GuildBanner, ItemPicture, Portrait, PortraitThumb, PortraitThumbnail } from './pictures';

// The page's pictures (v1.1.2-S2; DL-125 items 2, 7 and 8): each shows its Silhouette until its
// picture loads, and again when it fails. A Portrait's picture is named "Portrait of {name}", and its
// Silhouette is hidden from screen readers; a Banner and an Item's picture always are.
//
// These read a catalogue with two pictures of their own, so they hold whatever `media/` holds: one of
// the Guildmaster pictures, over the owner's (v1.1.2-S4), and one of a Unique Item, which has none. Then each place a picture goes, in the page: the
// Guild's Banner beside the five titles, a person's Portrait on their details and their History, and
// a Unique Item's picture in the Stores, the Market's Sell and a Hero's Gear and Equip rows.

vi.mock('../media', async (original) => {
  const actual = await original<typeof import('../media')>();
  return {
    ...actual,
    media: actual.mediaCatalogue({
      ...actual.mediaFiles,
      'portraits/guildmasters/female/gm-female-01.webp': 'assets/gm-female-01-test.webp',
      'portraits/guildmasters/female/gm-female-01.thumb.webp': 'assets/gm-female-01.thumb-test.webp',
      'portraits/heroes/male/hero-male-01.thumb.webp': 'assets/hero-male-01.thumb-test.webp',
      'items/barrow-kings-blade.webp': 'assets/barrow-kings-blade-test.webp',
    }),
  };
});

afterEach(cleanup);

/** The `<img>`s a place draws, in order, by what each is. */
function layers(place: HTMLElement): { is: string | null; src: string | null; alt: string | null }[] {
  return [...place.querySelectorAll('img')].map((img) => ({ is: img.dataset.picture ?? null, src: img.getAttribute('src'), alt: img.getAttribute('alt') }));
}

test("a Portrait with no Portrait's key is the Silhouette of the person's sex, 3 × 4, hidden from screen readers", () => {
  render(<Portrait role="hero" sex="male" portraitKey={null} name="Bran Tull" />);
  const figure = screen.getByTestId('portrait');
  expect(figure.tagName).toBe('FIGURE');
  expect(figure.getAttribute('aria-hidden')).toBe('true');
  expect(layers(figure)).toEqual([{ is: 'silhouette', src: mediaFiles['portraits/heroes/male/silhouette.svg'], alt: '' }]);
  expect(screen.queryByRole('img')).toBeNull();
});

test("each role's Silhouette is its own folder's, for each sex", () => {
  for (const [role, folder] of [
    ['guildmaster', 'guildmasters'],
    ['hero', 'heroes'],
    ['patron', 'patrons'],
  ] as const) {
    for (const sex of ['female', 'male'] as const) {
      const { unmount } = render(<Portrait role={role} sex={sex} portraitKey={null} name="Ada Vell" />);
      expect(layers(screen.getByTestId('portrait'))[0]?.src, `${role}, ${sex}`).toBe(mediaFiles[`portraits/${folder}/${sex}/silhouette.svg`]);
      unmount();
    }
  }
});

test('a Portrait with a picture shows the Silhouette until it loads, then the picture, named for the person', () => {
  render(<Portrait role="guildmaster" sex="female" portraitKey="gm-female-01" name="Ada Vell" />);
  const figure = screen.getByTestId('portrait');
  expect(figure.getAttribute('aria-hidden')).toBeNull();
  expect(layers(figure)).toEqual([
    { is: 'silhouette', src: mediaFiles['portraits/guildmasters/female/silhouette.svg'], alt: '' },
    { is: 'picture', src: 'assets/gm-female-01-test.webp', alt: 'Portrait of Ada Vell' },
  ]);
  const picture = screen.getByRole('img', { name: 'Portrait of Ada Vell' });
  expect(picture.classList.contains('is-loading')).toBe(true);

  fireEvent.load(picture);
  expect(layers(figure)).toEqual([{ is: 'picture', src: 'assets/gm-female-01-test.webp', alt: 'Portrait of Ada Vell' }]);
  expect(picture.classList.contains('is-loading')).toBe(false);
});

// v1.1.2-S2's verification (DL-131): a view opened again mounts its pictures again, and a picture the
// browser holds is complete as it mounts. It shows at once, with no frame of its Silhouette.
test('a picture the browser already holds shows at once when its place is drawn again, with no Silhouette first', () => {
  const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(480);
  try {
    render(<Portrait role="guildmaster" sex="female" portraitKey="gm-female-01" name="Ada Vell" />);
    const figure = screen.getByTestId('portrait');
    expect(layers(figure)).toEqual([{ is: 'picture', src: 'assets/gm-female-01-test.webp', alt: 'Portrait of Ada Vell' }]);
    expect(screen.getByRole('img', { name: 'Portrait of Ada Vell' }).classList.contains('is-loading')).toBe(false);
  } finally {
    complete.mockRestore();
    width.mockRestore();
  }
  cleanup();

  // Complete but broken (no width), it is left to its error, as any picture loading is.
  render(<Portrait role="guildmaster" sex="female" portraitKey="gm-female-01" name="Ada Vell" />);
  expect(layers(screen.getByTestId('portrait')).map((layer) => layer.is)).toEqual(['silhouette', 'picture']);
});

test("a Portrait's thumbnail on the new-game form: the picture over its Silhouette, hidden, and its name in words", () => {
  render(
    <label>
      <input type="radio" name="portrait" />
      <PortraitThumbnail sex="female" portraitKey="gm-female-01" label="Female Portrait 1" />
    </label>,
  );
  const thumbnail = screen.getByTestId('portrait-thumbnail');
  expect(thumbnail.getAttribute('aria-hidden')).toBe('true');
  // The picture's own thumbnail, never the full picture (v1.1.3-S7).
  expect(layers(thumbnail)).toEqual([
    { is: 'silhouette', src: mediaFiles['portraits/guildmasters/female/silhouette.svg'], alt: '' },
    { is: 'picture', src: 'assets/gm-female-01.thumb-test.webp', alt: '' },
  ]);
  expect(screen.getByRole('radio', { name: 'Female Portrait 1' })).toBeDefined();
  // A picture that fails leaves the Silhouette, and the radio button keeps its name.
  fireEvent.error(thumbnail.querySelector('img[data-picture="picture"]') as HTMLImageElement);
  expect(layers(thumbnail).map((layer) => layer.is)).toEqual(['silhouette']);
  expect(screen.getByRole('radio', { name: 'Female Portrait 1' })).toBeDefined();
});

test('"Drawn from the seed" in the setup grid: the Silhouette with no picture, and its words shown as well as read', () => {
  render(
    <label>
      <input type="radio" name="portrait" />
      <PortraitThumbnail sex="male" portraitKey={null} label="Drawn from the seed" labelShown />
    </label>,
  );
  expect(layers(screen.getByTestId('portrait-thumbnail'))).toEqual([{ is: 'silhouette', src: mediaFiles['portraits/guildmasters/male/silhouette.svg'], alt: '' }]);
  const words = screen.getByText('Drawn from the seed');
  expect(words.classList.contains('visually-hidden')).toBe(false);
  expect(screen.getByRole('radio', { name: 'Drawn from the seed' })).toBeDefined();
});

// v1.1.3-S7 (DL-135 item 9): a person's thumbnail beside their name in a list.
test("a person's thumbnail is their picture's thumbnail over the Silhouette of their sex, hidden from screen readers", () => {
  render(<PortraitThumb role="guildmaster" sex="female" portraitKey="gm-female-01" />);
  const thumb = screen.getByTestId('portrait-thumb');
  expect(thumb.getAttribute('aria-hidden')).toBe('true');
  expect(thumb.classList.contains('portrait-thumb')).toBe(true);
  expect(layers(thumb)).toEqual([
    { is: 'silhouette', src: mediaFiles['portraits/guildmasters/female/silhouette.svg'], alt: '' },
    { is: 'picture', src: 'assets/gm-female-01.thumb-test.webp', alt: '' },
  ]);
  fireEvent.load(thumb.querySelector('img[data-picture="picture"]') as HTMLImageElement);
  expect(layers(thumb)).toEqual([{ is: 'picture', src: 'assets/gm-female-01.thumb-test.webp', alt: '' }]);
});

test("a person with no picture has the small Silhouette of their sex; a Hero's thumbnail is found in the Heroes' folder", () => {
  const { unmount } = render(<PortraitThumb role="hero" sex="female" portraitKey={null} />);
  expect(layers(screen.getByTestId('portrait-thumb'))).toEqual([{ is: 'silhouette', src: mediaFiles['portraits/heroes/female/silhouette.svg'], alt: '' }]);
  unmount();
  render(<PortraitThumb role="hero" sex="male" portraitKey="hero-male-01" />);
  expect(layers(screen.getByTestId('portrait-thumb'))[1]).toEqual({ is: 'picture', src: 'assets/hero-male-01.thumb-test.webp', alt: '' });
});

test('a Portrait drawn from its thumbnail, as the setup preview draws it', () => {
  render(<Portrait role="guildmaster" sex="female" portraitKey="gm-female-01" name="Ada Vell" thumbnail />);
  expect(screen.getByRole('img', { name: 'Portrait of Ada Vell' }).getAttribute('src')).toBe('assets/gm-female-01.thumb-test.webp');
});

// v1.1.3-S7 (DL-134 item 9): every picture is read lazily, decoded off the main thread, its size stated.
test('every picture is read lazily and decoded off the main thread, with its width and height', () => {
  render(
    <>
      <Portrait role="guildmaster" sex="female" portraitKey="gm-female-01" name="Ada Vell" />
      <PortraitThumb role="guildmaster" sex="female" portraitKey="gm-female-01" />
      <PortraitThumbnail sex="female" portraitKey="gm-female-01" label="Female Portrait 1" />
      <ItemPicture definitionKey="barrow-kings-blade" />
      <GuildBanner guild={'guild-000001' as GuildId} />
    </>,
  );
  const sizes = (place: string): string[] =>
    [...screen.getByTestId(place).querySelectorAll('img')].map((img) =>
      [img.dataset.picture, img.getAttribute('loading'), img.getAttribute('decoding'), img.getAttribute('width'), img.getAttribute('height')].join(' '),
    );
  expect(sizes('portrait')).toEqual(['silhouette  async 480 640', 'picture lazy async 480 640']);
  expect(sizes('portrait-thumb')).toEqual(['silhouette  async 160 213', 'picture lazy async 160 213']);
  expect(sizes('portrait-thumbnail')).toEqual(['silhouette  async 160 213', 'picture lazy async 160 213']);
  expect(sizes('item-picture')).toEqual(['silhouette  async 20 20', 'picture lazy async 20 20']);
  expect(sizes('guild-banner')).toEqual(['silhouette  async 20 30']);
  // `loading` comes before `src`, so the browser knows it before it starts to read.
  const picture = screen.getByRole('img', { name: 'Portrait of Ada Vell' });
  const names = picture.getAttributeNames();
  expect(names.indexOf('loading')).toBeLessThan(names.indexOf('src'));
});

test('a picture that fails leaves the Silhouette, hidden from screen readers', () => {
  render(<Portrait role="guildmaster" sex="female" portraitKey="gm-female-01" name="Ada Vell" />);
  fireEvent.error(screen.getByRole('img', { name: 'Portrait of Ada Vell' }));
  const figure = screen.getByTestId('portrait');
  expect(figure.getAttribute('aria-hidden')).toBe('true');
  expect(layers(figure)).toEqual([{ is: 'silhouette', src: mediaFiles['portraits/guildmasters/female/silhouette.svg'], alt: '' }]);
});

test("a key that names no picture of the person's role and sex is the Silhouette", () => {
  render(<Portrait role="guildmaster" sex="male" portraitKey="gm-female-01" name="Wat Cole" />);
  expect(layers(screen.getByTestId('portrait'))).toEqual([{ is: 'silhouette', src: mediaFiles['portraits/guildmasters/male/silhouette.svg'], alt: '' }]);
});

// v1.1.2-S6 (the review's A): the engine refuses a sex that is none of its own, but a place is never
// what breaks the page: a person of no sex the folders know shows the frame with no figure.
test("a person of a sex the folders do not know shows the neutral Silhouette, and the page does not break", () => {
  render(<Portrait role="guildmaster" sex={'other' as Sex} portraitKey="gm-female-01" name="Ada Vell" />);
  const figure = screen.getByTestId('portrait');
  expect(figure.getAttribute('aria-hidden')).toBe('true');
  expect(layers(figure)).toEqual([{ is: 'silhouette', src: neutralSilhouette, alt: '' }]);
});

test('a Guild Banner is the Silhouette for every Guild, hidden from screen readers', () => {
  render(<GuildBanner guild={'guild-000001' as GuildId} />);
  const banner = screen.getByTestId('guild-banner');
  expect(banner.getAttribute('aria-hidden')).toBe('true');
  expect(banner.classList.contains('guild-banner--large')).toBe(false);
  expect(layers(banner)).toEqual([{ is: 'silhouette', src: mediaFiles['banners/silhouette.svg'], alt: '' }]);
});

test("a Guild page's Banner is the larger", () => {
  render(<GuildBanner guild={'guild-000002' as GuildId} large />);
  expect(screen.getByTestId('guild-banner').classList.contains('guild-banner--large')).toBe(true);
});

test("a Unique Item's picture, found by its content key, over the chest's Silhouette; hidden from screen readers", () => {
  render(<ItemPicture definitionKey="barrow-kings-blade" />);
  const place = screen.getByTestId('item-picture');
  expect(place.getAttribute('aria-hidden')).toBe('true');
  expect(layers(place)).toEqual([
    { is: 'silhouette', src: mediaFiles['items/silhouette.svg'], alt: '' },
    { is: 'picture', src: 'assets/barrow-kings-blade-test.webp', alt: '' },
  ]);
  fireEvent.load(place.querySelector('img[data-picture="picture"]') as HTMLImageElement);
  expect(layers(place)).toEqual([{ is: 'picture', src: 'assets/barrow-kings-blade-test.webp', alt: '' }]);
});

test('a Unique Item with no picture is the chest', () => {
  render(<ItemPicture definitionKey="mantle-of-the-fells" />);
  expect(layers(screen.getByTestId('item-picture'))).toEqual([{ is: 'silhouette', src: mediaFiles['items/silhouette.svg'], alt: '' }]);
});

// ── Where each picture goes (DL-125 items 2, 7 and 8) ───────────────────────────────────────

function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('no game in hand');
  return state.document;
}

/**
 * The player's Guildmaster, of `sex`, and with `portraitKey` as a save of schema 5 holds it (v1.1.2-S3):
 * `null`, the Silhouette, unless given, where a new game draws one of the owner's pictures (v1.1.2-S4).
 */
function withGuildmaster(state: GameState, sex: Sex, portraitKey: string | null = null): GameState {
  return changed(state, (document, player) => {
    const guildmaster = document.world.guildmasters[player.guildmasterId];
    if (guildmaster === undefined) throw new Error('no Guildmaster');
    guildmaster.sex = sex;
    guildmaster.portraitKey = portraitKey;
  });
}

/** A Silhouette's layer, by its path under `media/`. */
function silhouette(path: string): { is: string; src: string | null; alt: string } {
  return { is: 'silhouette', src: mediaFiles[path] ?? null, alt: '' };
}

const bannerSilhouette = silhouette('banners/silhouette.svg');
const bladePicture = { is: 'picture', src: 'assets/barrow-kings-blade-test.webp', alt: '' };

describe('where each picture goes (DL-125 items 2, 7 and 8)', () => {
  test("the status bar's Guild name and the rail's heading have the Guild's Banner beside the name", () => {
    render(<App initial={started()} />);
    const title = screen.getByRole('heading', { level: 1, name: 'The Lantern' });
    expect(layers(within(title).getByTestId('guild-banner'))).toEqual([bannerSilhouette]);
    const rail = screen.getByRole('complementary', { name: 'Latest for The Lantern' });
    const heading = within(rail).getByRole('heading', { level: 2, name: 'Latest for The Lantern' });
    expect(layers(within(heading).getByTestId('guild-banner'))).toEqual([bannerSilhouette]);
  });

  test("the Guildmaster view: the Silhouette of their sex beside who they are, and the Banner beside the Guild's name", () => {
    for (const sex of ['female', 'male'] as const) {
      render(<App initial={withGuildmaster(started(), sex)} />);
      const view = section('Guildmaster');
      const portrait = within(view).getByTestId('portrait');
      expect(portrait.getAttribute('aria-hidden')).toBe('true');
      expect(layers(portrait)).toEqual([silhouette(`portraits/guildmasters/${sex}/silhouette.svg`)]);
      const heading = within(view).getByRole('heading', { level: 3, name: 'Ada Vell, Guildmaster of The Lantern' });
      expect(layers(within(heading).getByTestId('guild-banner'))).toEqual([bannerSilhouette]);
      cleanup();
    }
  });

  test("the Guildmaster view with a Portrait's key, as a save of schema 5 holds it: the picture, named for them", () => {
    render(<App initial={withGuildmaster(started(), 'female', 'gm-female-01')} />);
    const picture = within(section('Guildmaster')).getByRole('img', { name: 'Portrait of Ada Vell' });
    expect(picture.getAttribute('src')).toBe('assets/gm-female-01-test.webp');
  });

  test("a Guild's page: its largest Banner beside its heading, and its Guildmaster's Portrait and Banner", () => {
    const state = started();
    render(<App initial={state} />);
    const guilds = section('Guilds');
    const open = within(guilds)
      .getAllByRole('button', { name: /^Open / })
      .find((each) => each.getAttribute('aria-label') !== 'Open The Lantern');
    fireEvent.click(open as HTMLElement);
    const page = within(guilds).getByRole('article');
    const heading = within(page).getByRole('heading', { level: 4 });
    const banner = within(heading).getByTestId('guild-banner');
    expect(banner.classList.contains('guild-banner--large')).toBe(true);
    expect(layers(banner)).toEqual([bannerSilhouette]);

    const { world } = documentOf(state);
    const rival = Object.values(world.guilds).find((guild) => guild.name === heading.textContent);
    const guildmaster = rival === undefined ? undefined : world.guildmasters[rival.guildmasterId];
    if (rival === undefined || guildmaster === undefined) throw new Error('no Rival Guildmaster');
    // A Rival's Portrait is chosen to fit them as they enter play (v1.1.3-S5): this one's, gm-male-15.
    expect(guildmaster.portraitKey).toBe('gm-male-15');
    expect(layers(within(page).getByTestId('portrait'))).toEqual([
      silhouette(`portraits/guildmasters/${guildmaster.sex}/silhouette.svg`),
      { is: 'picture', src: mediaFiles[`portraits/guildmasters/${guildmaster.sex}/gm-male-15.webp`], alt: `Portrait of ${guildmaster.name}` },
    ]);
    const theirs = within(page).getByRole('heading', { level: 5, name: `${guildmaster.name}, Guildmaster of ${rival.name}` });
    expect(layers(within(theirs).getByTestId('guild-banner'))).toEqual([bannerSilhouette]);
  });

  test("a Hero's page: the Silhouette of their sex, and a Unique Item's picture in their Gear and in the Gear the Guild holds", () => {
    const state = holdingUnique(holding(carryingUnique(started(), 'barrow-kings-blade', 'weapon'), 'arming-sword', 1), 'lantern-of-stannary');
    const { world } = documentOf(state);
    render(<App initial={state} />);
    const [first] = within(rosterList()).getAllByRole('button');
    fireEvent.click(first as HTMLElement);
    const page = within(section('Roster')).getByRole('article');
    const name = within(page).getByRole('heading', { level: 3 }).textContent ?? '';
    const hero = Object.values(world.heroes).find((each) => each.name === name);
    if (hero === undefined) throw new Error('no Hero');

    const portrait = within(page).getByTestId('portrait');
    expect(portrait.getAttribute('aria-hidden')).toBe('true');
    expect(layers(portrait)).toEqual([silhouette(`portraits/heroes/${hero.sex}/silhouette.svg`)]);

    // Their Gear: the blade's picture before its name, and none in an empty slot.
    const gear = within(page).getByRole('list', { name: `${name}'s Gear` });
    const pictured = within(gear).getAllByTestId('item-picture');
    expect(pictured).toHaveLength(1);
    expect(pictured[0]?.closest('li')?.textContent).toMatch(/The Barrow King's blade/);
    expect(layers(pictured[0] as HTMLElement)).toEqual([silhouette('items/silhouette.svg'), bladePicture]);

    // The Gear the Guild holds: the lantern, which has no picture, is the chest; the arming sword, common, has none.
    const held = within(page).getByRole('list', { name: 'Gear the Guild holds' });
    const chest = within(held).getAllByTestId('item-picture');
    expect(chest).toHaveLength(1);
    expect(chest[0]?.closest('li')?.textContent).toMatch(/The Lantern of Stannary/);
    expect(layers(chest[0] as HTMLElement)).toEqual([silhouette('items/silhouette.svg')]);
  });

  test("the History: the Banner beside a Guild's title, a Guildmaster's Portrait, a Patron's Portrait by their sex, and neither for the World", () => {
    const state = withGuildmaster(started(), 'male');
    render(<App initial={state} />);
    const history = openView('History');
    const title = (): HTMLElement => within(section('History')).getByRole('heading', { level: 3 });
    expect(title().textContent).toBe('The History of The Lantern');
    expect(layers(within(title()).getByTestId('guild-banner'))).toEqual([bannerSilhouette]);
    expect(within(history).queryByTestId('portrait')).toBeNull();

    fireEvent.click(within(section('Guildmaster')).getByRole('button', { name: 'Read the History of Ada Vell' }));
    expect(title().textContent).toBe('The History of Ada Vell');
    expect(within(title()).queryByTestId('guild-banner')).toBeNull();
    expect(layers(within(section('History')).getByTestId('portrait'))).toEqual([silhouette('portraits/guildmasters/male/silhouette.svg')]);

    // A Patron's, by the sex their name came with (v1.1.2-S3): the Silhouette, since no Patron has a picture.
    const fold = within(section('Patrons')).queryByRole('button', { name: /^\d+ neutral$/ });
    if (fold !== null) fireEvent.click(fold);
    const [patron] = within(section('Patrons')).getAllByRole('button', { name: /^Read the History of / });
    fireEvent.click(patron as HTMLElement);
    const patronName = (patron?.getAttribute('aria-label') ?? patron?.textContent ?? '').replace(/^Read the History of /, '');
    const read = Object.values(documentOf(state).world.patrons).find((each) => each.name === patronName);
    if (read?.sex === undefined || read.sex === null) throw new Error(`no Patron ${patronName} with a sex`);
    expect(title().textContent).toBe(`The History of ${patronName}`);
    const portrait = within(section('History')).getByTestId('portrait');
    expect(portrait.getAttribute('aria-hidden')).toBe('true');
    expect(layers(portrait)).toEqual([silhouette(`portraits/patrons/${read.sex}/silhouette.svg`)]);
    expect(within(title()).queryByTestId('guild-banner')).toBeNull();

    fireEvent.click(within(section('History')).getByRole('button', { name: 'The World History' }));
    expect(title().textContent).toBe('The World History');
    expect(within(section('History')).queryByTestId('portrait')).toBeNull();
    expect(within(title()).queryByTestId('guild-banner')).toBeNull();
  });

  // v1.1.3-S7 (DL-135 item 9): a thumbnail beside each name in the Roster, the pool and the Guilds' table.
  test("the Roster, the Unattached pool and the Guilds' table: each person's thumbnail beside their name", () => {
    const state = started();
    const { world } = documentOf(state);
    render(<App initial={state} />);
    const heroOf = (name: string) => Object.values(world.heroes).find((hero) => hero.name === name);
    const expectThumb = (thumb: HTMLElement | undefined, role: string, sex: string | undefined, key: string | null | undefined, where: string): void => {
      const folder = role === 'hero' ? 'heroes' : 'guildmasters';
      const pictured = key === null || key === undefined ? [] : [{ is: 'picture', src: mediaFiles[`portraits/${folder}/${sex}/${key}.thumb.webp`] ?? null, alt: '' }];
      expect(thumb, where).toBeDefined();
      expect(layers(thumb as HTMLElement), where).toEqual([silhouette(`portraits/${folder}/${sex}/silhouette.svg`), ...pictured]);
    };

    // Each Hero card on the Roster: the small Silhouette of their sex, since no Hero has a picture.
    const cards = within(rosterList()).getAllByRole('listitem');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const name = within(card).getByRole('button').textContent ?? '';
      const hero = heroOf(name);
      expectThumb(within(card).getByTestId('portrait-thumb'), 'hero', hero?.sex, hero?.portraitKey, name);
    }

    // Each Hero in the pool, in their row's heading cell, before their name.
    const rows = within(section('Unattached pool')).getAllByTestId('pool-row');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const header = within(row).getByRole('rowheader');
      const name = within(header).getByRole('button').textContent ?? '';
      const hero = heroOf(name);
      expectThumb(within(header).getByTestId('portrait-thumb'), 'hero', hero?.sex, hero?.portraitKey, name);
    }

    // Each Guild's row, its Guildmaster's thumbnail beside its name: the picture chosen for them, or their Silhouette.
    const guildRows = within(section('Guilds')).getAllByTestId('guild-row');
    expect(guildRows).toHaveLength(Object.values(world.guilds).filter((guild) => guild.foldedOnTurn === null).length);
    let pictured = 0;
    for (const row of guildRows) {
      const header = within(row).getByRole('rowheader');
      const guild = Object.values(world.guilds).find((each) => each.name === within(header).getByRole('button').textContent);
      const guildmaster = guild === undefined ? undefined : world.guildmasters[guild.guildmasterId];
      if (guildmaster?.portraitKey !== null) pictured += 1;
      expectThumb(within(header).getByTestId('portrait-thumb'), 'guildmaster', guildmaster?.sex, guildmaster?.portraitKey, guild?.name ?? '');
    }
    expect(pictured).toBeGreaterThan(0);
  });

  test("a Hero's page: their Appearance and Biography under their Portrait", () => {
    const state = started();
    const { world } = documentOf(state);
    render(<App initial={state} />);
    const [first] = within(rosterList()).getAllByRole('button');
    fireEvent.click(first as HTMLElement);
    const page = within(section('Roster')).getByRole('article');
    const hero = Object.values(world.heroes).find((each) => each.name === within(page).getByRole('heading', { level: 3 }).textContent);
    if (hero === undefined) throw new Error('no Hero');
    expect(hero.appearance).not.toBe('');
    expect(hero.biography).not.toBe('');

    const texts = within(page).getByTestId('hero-texts');
    const terms = [...texts.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(terms).toEqual([
      ['Appearance', hero.appearance],
      ['Biography', hero.biography],
    ]);
    // Under the Portrait: after the head that holds it, before the Stats.
    const head = within(page).getByTestId('portrait').closest('header');
    expect(head?.nextElementSibling).toBe(texts);
  });

  test("the Stores and the Market's Sell: a Unique Item's picture before its name, and none before a common Item's", () => {
    render(<App initial={holdingUnique(holding(started(), 'whetstone', 2), 'barrow-kings-blade')} />);
    for (const place of ['Stores', 'Sell']) {
      const rows = within(section(place)).getAllByRole('row').slice(1);
      const blade = rows.find((row) => /The Barrow King's blade/.test(row.textContent ?? ''));
      const whetstone = rows.find((row) => /Whetstone/.test(row.textContent ?? ''));
      if (blade === undefined || whetstone === undefined) throw new Error(`${place} lacks a row`);
      expect(layers(within(blade).getByTestId('item-picture')), place).toEqual([silhouette('items/silhouette.svg'), bladePicture]);
      // In the row's heading cell, before the name.
      expect(within(blade).getByRole('rowheader').firstElementChild?.getAttribute('data-testid'), place).toBe('item-picture');
      expect(within(whetstone).queryByTestId('item-picture'), place).toBeNull();
    }
  });
});
