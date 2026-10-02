// v1.1.4-S11 (DL-149): "Choose myself" sets every attribute of the player's Guildmaster, and what is
// chosen replaces what is drawn after the draw, so the world a seed makes is otherwise the one "Choose
// for me" makes: the creation hashes, but for the player's Guildmaster, are equal. Held over 60
// seeds by creation.test.ts (`npm test`) and over HEROESIM_SEEDS, 1,000 by default, by
// create.harness.test.ts (`npm run harness`), the sweep it took eight seconds alone and forty under
// the whole suite's load (DL-164).

import { createHash } from 'node:crypto';
import { createWorld, playerGuild, serialise, type EngineDeps, type Guild, type Guildmaster, type WorldDocument, type WorldSetup } from '@heroesim/engine';
import { expect } from 'vitest';
import { harnessSetup } from './creation.js';

/** `document` with every Guildmaster's Portrait, Appearance and Biography set aside (v1.1.3-S5). */
export function picturesAside(document: WorldDocument): WorldDocument {
  const copy = structuredClone(document);
  for (const guildmaster of Object.values(copy.world.guildmasters)) Object.assign(guildmaster, { portraitKey: null, appearance: '', biography: '' });
  return copy;
}

const hashed = (document: WorldDocument): string => createHash('sha256').update(serialise(document)).digest('hex');

/** The parts of a world a Guildmaster chosen at setup leaves as they were, each hashed. */
function parts(document: WorldDocument): Record<string, string> {
  const { world } = picturesAside(document);
  const player = playerGuild(world) as Guild;
  const rest = (table: 'guilds' | 'guildmasters' | 'heroes' | 'quests' | 'patrons' | 'stacks') =>
    Object.values(world[table]).filter((row) => row.id !== player.guildmasterId);
  return Object.fromEntries(
    (['guilds', 'guildmasters', 'heroes', 'quests', 'patrons', 'stacks'] as const).map((table) => [
      table,
      createHash('sha256').update(JSON.stringify(rest(table))).digest('hex'),
    ]),
  );
}

/**
 * Creates each of `seeds` with every attribute of the player's Guildmaster chosen, the choices dealt
 * round the seeds, and with none, and expects the two worlds equal but for that Guildmaster and the
 * Guildmasters' pictures and texts, and every stream where it was. Gives how many worlds a Rival's
 * picture moved in: one fits them among those not in use (v1.1.3-S5), so the player's may move one.
 */
export function expectChosenAsNone(seeds: readonly string[], deps: EngineDeps): { rivalPictureMoved: number } {
  const portraits = deps.content.portraits.guildmaster;
  let rivalPictureMoved = 0;
  seeds.forEach((seed, n) => {
    const sex = n % 2 === 0 ? 'female' : 'male';
    const chosen: WorldSetup = {
      ...harnessSetup,
      guildmasterSex: sex,
      guildmasterAge: 21 + (n % 30),
      guildmasterPortraitKey: portraits[sex][n % portraits[sex].length] ?? '',
      guildmasterStats: { inspiration: 10, influence: 15, negotiation: 15, coaching: 5, judgement: 5 },
      guildmasterTraitKeys: n % 3 === 0 ? [] : ['old-soldier', 'mistrusts-magic'],
      guildmasterBirthplace: 'Harrowgate',
      guildmasterAppearance: 'Grey at the temples.',
      guildmasterBiography: 'Kept the toll bridge at Wyndham.',
    };
    const none = createWorld(seed, harnessSetup, deps).document;
    const every = createWorld(seed, chosen, deps).document;
    expect(parts(every), seed).toEqual(parts(none));
    expect(every.world.rng, seed).toEqual(none.world.rng);
    // The whole world, the player's Guildmaster and every Guildmaster's picture and its texts set aside.
    const player = playerGuild(none.world) as Guild;
    every.world.guildmasters[player.guildmasterId] = structuredClone(none.world.guildmasters[player.guildmasterId] as Guildmaster);
    expect(hashed(picturesAside(every)), seed).toBe(hashed(picturesAside(none)));
    if (hashed(every) !== hashed(none)) rivalPictureMoved += 1;
  });
  return { rivalPictureMoved };
}
