// "New rules available" (M7-S3 part 2; the CLI's `rebase`, pre-M0 review D1): shown while the rules
// the game plays under, its `meta.config`, are behind this release's `defaultConfig`. A game keeps
// its own rules until the player adopts the new ones, and its History records when
// (`world.rules-adopted`).

import type { GameAction } from '../state/reducer';
import { Section } from './section';

export function RulesNotice({
  notice,
  busy,
  play,
}: {
  notice: { from: number; to: number };
  busy: boolean;
  play: (action: GameAction) => void;
}) {
  return (
    <Section
      id="rules"
      title="New rules available"
      className="notice"
      help={
        'This release’s rules differ from those the game was started with. The game keeps playing under its own until ' +
        'you adopt the new ones, which changes how it plays from then on; its History records when.'
      }
    >
      <p>
        This game plays under configVersion {notice.from}; this release’s rules are configVersion {notice.to}.
      </p>
      <div className="actions">
        <button type="button" className="button--primary" disabled={busy} onClick={() => play({ kind: 'rebase' })}>
          Adopt the new rules
        </button>
      </div>
    </Section>
  );
}
