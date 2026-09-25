// `recruit --hero <heroId>` (M2-S8, DL-27): the player's Guild signs an Unattached Hero for the
// signing fee. The engine's `recruit` decides; this reads the save, names the player's Guild,
// explains a refusal and writes the save back when the World State changed.
//
// It imports main.ts's output helpers, and main.ts imports it to register the command; each reads
// the other only when a command runs, never while the modules load.

import { isId, playerGuild, recruit, type HeroRecruited, type RecruitRejection } from '@heroesim/engine';
import { exitCodes, open, refuse, say, type Context, type Exit } from '../main.js';
import { rowIn } from '../render.js';
import { writeSave } from '../saves.js';

/**
 * Recruits `heroId` for the player's Guild, writes the save, and prints the fee and the new Roster
 * size. A word that is not a Hero id is a bad command line; a Hero the save lacks, one not in the
 * pool, and a fee above the Guild's Wealth are refused, and nothing is written.
 */
export function recruitHero(heroId: string, { io, content, path }: Context): Exit {
  if (!isId('heroes', heroId)) {
    return refuse(io, `"${heroId}" is not a Hero id such as hero-000001.`, exitCodes.usage);
  }
  const opened = open(io, path, content);
  if (opened === undefined) return exitCodes.refused;
  const { document, deps } = opened;
  const guild = playerGuild(document.world);
  if (guild === undefined) return refuse(io, `${path} has no player's Guild.`);
  const hero = rowIn(document.world.heroes, heroId);
  if (hero === undefined) return refuse(io, `${path} has no Hero ${heroId}.`);

  const result = recruit(document, { guildId: guild.id, heroId }, deps);
  if (!result.ok) return refuse(io, refusal(result.rejection, `${hero.name} (${heroId})`, guild.name));

  writeSave(path, result.document);
  const signed = result.document.world.guilds[guild.id] ?? guild;
  const size = signed.rosterIds.length;
  const recruited = result.events.find((event): event is HeroRecruited => event.type === 'hero.recruited');
  return say(io, [
    `Recruited ${hero.name} (${heroId}) for a signing fee of ${recruited?.payload.fee ?? '?'} Wealth.`,
    `${signed.name}'s Roster now holds ${size} ${size === 1 ? 'Hero' : 'Heroes'}; Wealth ${signed.wealth}.`,
  ]);
}

/** Why the engine refused, in a sentence. */
function refusal(rejection: RecruitRejection, who: string, guildName: string): string {
  switch (rejection.reason) {
    case 'hero-not-unattached':
      return `${who} is not in the Unattached pool; show pool lists who is.`;
    case 'insufficient-wealth':
      return `${who}'s signing fee is ${rejection.fee} Wealth; ${guildName} has ${rejection.wealth}.`;
    case 'guild-folded':
      return `${guildName} has folded and signs no one.`;
  }
}
