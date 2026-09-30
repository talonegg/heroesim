import { describe, expect, test } from 'vitest';
import { createWorld, previewGuildmaster, type WorldSetup } from './create.js';
import { makeId, type Guild, type Guildmaster, type WorldDocument } from './document.js';
import { testDeps, withoutPortraits } from './world.test-support.js';

// The preview of the player's Guildmaster (v1.1.2-S4, DL-125 item 6): the sex, age, Traits and
// Portrait "Start the game" makes, and the Guild's Background (v1.1.2-S5), from the same function `createWorld` calls, so the two cannot
// disagree. Proved over many seeds and every way of choosing, since a preview that drifted from the
// world would name a Guildmaster the player never gets.

const deps = testDeps();
const playerId = makeId('guilds', 1);

const bare: WorldSetup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'harness' };

function guildmasterOf(document: WorldDocument): Guildmaster {
  const guild = document.world.guilds[playerId] as Guild;
  return document.world.guildmasters[guild.guildmasterId] as Guildmaster;
}

/** What `createWorld` made of the Guildmaster, in the preview's shape, less what was drawn, which is the setup's. */
function made(seed: string, setup: WorldSetup, withDeps = deps) {
  const { document } = createWorld(seed, setup, withDeps);
  const guildmaster = guildmasterOf(document);
  const backgroundKey = (document.world.guilds[playerId] as Guild).backgroundKey;
  return {
    sex: guildmaster.sex,
    age: guildmaster.ageAtEntry,
    traitKeys: guildmaster.traits,
    portraitKey: guildmaster.portraitKey,
    backgroundKey,
    description: { birthplace: guildmaster.birthplace, appearance: guildmaster.appearance, biography: guildmaster.biography },
  };
}

/** The preview less `drawn`, to hold against `made`. */
function previewed(setup: WorldSetup, seed: string, withDeps = deps) {
  const preview = previewGuildmaster(setup, seed, withDeps);
  if (preview === null) return null;
  const { drawn: _drawn, ...rest } = preview;
  return rest;
}

const seeds = Array.from({ length: 120 }, (_, n) => `preview-${n}`);

describe('previewGuildmaster', () => {
  test.each<[string, Partial<WorldSetup>]>([
    ['everything drawn', {}],
    ['a Background chosen', { backgroundKey: 'old-charter' }],
    ['the sex chosen', { guildmasterSex: 'female' }],
    ['the age chosen', { guildmasterAge: 33 }],
    ['no Trait chosen', { guildmasterTraitKeys: [] }],
    ['the Traits chosen', { guildmasterTraitKeys: ['miser', 'old-soldier'] }],
    ['a Portrait chosen, and with it the sex', { guildmasterPortraitKey: 'gm-male-02' }],
    ['the sex and a Portrait of it chosen', { guildmasterSex: 'female', guildmasterPortraitKey: 'gm-female-02' }],
    ['every part chosen', { guildmasterSex: 'male', guildmasterAge: 50, guildmasterTraitKeys: [], guildmasterPortraitKey: 'gm-male-01' }],
  ])('names what createWorld makes, over %i seeds, with %s', (_, chosen) => {
    for (const seed of seeds) {
      const setup = { ...bare, ...chosen };
      expect(previewed(setup, seed), seed).toEqual(made(seed, setup));
    }
  });

  test('names the Silhouette, `null`, where the sex has no picture', () => {
    const none = testDeps({}, withoutPortraits());
    for (const seed of seeds.slice(0, 20)) {
      expect(previewGuildmaster(bare, seed, none)?.portraitKey).toBeNull();
      expect(previewed(bare, seed, none)).toEqual(made(seed, bare, none));
    }
  });

  test('draws every sex, age band and Portrait over the seeds, so the agreement above is no accident of one', () => {
    const previews = seeds.map((seed) => previewGuildmaster(bare, seed, deps));
    expect(new Set(previews.map((preview) => preview?.sex))).toEqual(new Set(['female', 'male']));
    expect(new Set(previews.map((preview) => preview?.portraitKey)).size).toBe(5);
    expect(new Set(previews.map((preview) => preview?.age)).size).toBeGreaterThan(10);
    expect(new Set(previews.map((preview) => preview?.traitKeys.join(','))).size).toBeGreaterThan(3);
  });

  test("reads neither name, which the player's Guild never draws: blank or not, the preview is the same", () => {
    for (const seed of seeds.slice(0, 20)) {
      expect(previewGuildmaster({ ...bare, guildName: '', guildmasterName: ' ' }, seed, deps)).toEqual(previewGuildmaster(bare, seed, deps));
      expect(previewed({ ...bare, guildName: '', guildmasterName: ' ' }, seed)).toEqual(made(seed, bare));
    }
  });

  // v1.1.2-S6 (the review's I): which parts the seed draws is the engine's to say, a Portrait chosen
  // choosing the sex with it, so a front end does not repeat the rule.
  test.each<[string, Partial<WorldSetup>, { sex: boolean; age: boolean; traits: boolean; portrait: boolean }]>([
    ['everything drawn', {}, { sex: true, age: true, traits: true, portrait: true }],
    ['the sex chosen', { guildmasterSex: 'male' }, { sex: false, age: true, traits: true, portrait: true }],
    ['a Portrait chosen, and with it the sex', { guildmasterPortraitKey: 'gm-female-01' }, { sex: false, age: true, traits: true, portrait: false }],
    ['the age and no Trait chosen', { guildmasterAge: 40, guildmasterTraitKeys: [] }, { sex: true, age: false, traits: false, portrait: true }],
    ['every part chosen', { guildmasterSex: 'male', guildmasterAge: 50, guildmasterTraitKeys: ['miser'], guildmasterPortraitKey: 'gm-male-01' }, { sex: false, age: false, traits: false, portrait: false }],
  ])('says which parts the seed draws, with %s', (_, chosen, drawn) => {
    expect(previewGuildmaster({ ...bare, ...chosen }, 'drawn-seed', deps)?.drawn).toEqual(drawn);
  });

  test('writes the three texts "Start the game" writes for those left blank, and keeps those given (v1.1.2-S6)', () => {
    const given = { ...bare, guildmasterBirthplace: '  Kingsbridge  ', guildmasterBiography: 'Kept the toll bridge.' };
    for (const seed of seeds.slice(0, 20)) {
      expect(previewGuildmaster(given, seed, deps)?.description).toEqual(made(seed, given).description);
      expect(previewGuildmaster(given, seed, deps)?.description).toMatchObject({ birthplace: 'Kingsbridge', biography: 'Kept the toll bridge.' });
    }
  });

  test('is `null` for a setup "Start the game" would refuse for anything but a name', () => {
    expect(previewGuildmaster({ ...bare, guildmasterAge: 12 }, 'seed', deps)).toBeNull();
    expect(previewGuildmaster({ ...bare, guildmasterSex: 'female', guildmasterPortraitKey: 'gm-male-01' }, 'seed', deps)).toBeNull();
    expect(previewGuildmaster({ ...bare, guildmasterPortraitKey: 'gm-male-99' }, 'seed', deps)).toBeNull();
  });

  test('changes nothing and is the same for the same seed', () => {
    const setup = { ...bare, guildmasterTraitKeys: ['old-soldier'] };
    const frozen = Object.freeze({ ...setup, guildmasterTraitKeys: Object.freeze([...setup.guildmasterTraitKeys]) });
    expect(previewGuildmaster(frozen, 'again', deps)).toEqual(previewGuildmaster(frozen, 'again', deps));
  });
});
