// `recruit --hero <heroId>` (M2-S8, DL-27): the player's Guild signs an Unattached Hero for the
// signing fee. The engine's `recruit` decides; this reads the save, names the player's Guild, says
// a refusal in the refusals' words (DL-240) and writes the save back when the World State changed.
// It opens the save and says what happened through the commands' shared context, context.ts (DL-234).

import { applyAction, isId, playerGuild, type HeroRecruited } from '@heroesim/engine';
import { coinLetters, rowOf } from '@heroesim/words';
import { exitCodes, open, over, refuse, say, type Context, type Exit } from '../context.js';
import { refusalLine } from '../namer.js';
import { writeSave } from '../saves.js';

/**
 * Recruits `heroId` for the player's Guild, writes the save, and prints the fee and the new Roster
 * size. A word that is not a Hero id is a bad command line; a Hero the save lacks, one not in the
 * pool, one who will not sign for the Guild's Fame (M3-S5) and a fee above the Guild's Wealth are
 * refused, and nothing is written; so is any signing once the game has ended.
 */
export function recruitHero(heroId: string, { io, content, path }: Context): Exit {
  if (!isId('heroes', heroId)) {
    return refuse(io, `"${heroId}" is not a Hero id such as hero-000001.`, exitCodes.usage);
  }
  const opened = open(io, path, content);
  if (opened === undefined) return exitCodes.refused;
  const { document, deps } = opened;
  const ended = over(io, document, deps, 'recruit');
  if (ended !== undefined) return ended;
  const setting = { world: document.world, content: deps.content, calendar: deps.config };
  const guild = playerGuild(document.world);
  if (guild === undefined) return refuse(io, refusalLine({ action: 'recruit', reason: 'no-player-guild' }, setting));
  const hero = rowOf(document.world.heroes, heroId);
  if (hero === undefined) return refuse(io, `${path} has no Hero ${heroId}.`);

  const result = applyAction(document, { kind: 'recruit', guildId: guild.id, heroId, years: 2 }, deps);
  if (!result.ok) return refuse(io, refusalLine(result.rejection, setting));

  writeSave(path, result.document);
  const signed = result.document.world.guilds[guild.id] ?? guild;
  const size = signed.rosterIds.length;
  const recruited = result.events.find((event): event is HeroRecruited => event.type === 'hero.recruited');
  return say(io, [
    `Recruited ${hero.name} (${heroId}) for a signing fee of ${recruited === undefined ? '?' : coinLetters(recruited.payload.fee)}.`,
    `${signed.name}'s Roster now holds ${size} ${size === 1 ? 'Hero' : 'Heroes'}; Wealth ${coinLetters(signed.wealth)}.`,
  ]);
}
