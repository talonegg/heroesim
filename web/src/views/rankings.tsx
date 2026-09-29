// The Rankings (M7-S3 part 2; the CLI's `show rankings [--by fame|wealth]`, M3-S5, R10): every
// Guild in play in the engine's order, by Fame or by Wealth. A folded Guild is not ranked.
//
// A view of the shell (M9-S3, DL-103), with every Guild and the Patrons as its parts. The Rankings
// and the Guilds are one table (M9-S6, DL-106; the review's B4), whose headings order it: the
// Guilds part. The Patrons are one table beside it (B5). Which Guild's page is open may be the
// shell's, so a Guild's name in the History can open it (M9-S5, DL-105).

import type { GuildId, WorldDocument } from '@heroesim/engine';
import type { GameAction } from '../state/reducer';
import { Guilds } from './guilds';
import { Patrons } from './patrons';
import { View } from './section';

export function Rankings({
  document,
  guildName,
  busy,
  play,
  open,
  onOpen,
}: {
  document: WorldDocument;
  guildName: string;
  busy: boolean;
  play: (action: GameAction) => void;
  /** The Guild whose page is open, the shell's, so a name in the History can open it (M9-S5); its own when not given. */
  open?: GuildId | null;
  onOpen?: (guildId: GuildId | null) => void;
}) {
  return (
    <View id="rankings">
      <Guilds document={document} busy={busy} play={play} {...(open === undefined || onOpen === undefined ? {} : { open, onOpen })} />
      <Patrons document={document} guildName={guildName} />
    </View>
  );
}
