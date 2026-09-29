// The home view, Guild (M9-S3, DL-103; the review's A3): a digest of what needs attention this
// Turn. How the game ended, once it has; the rules notice while it stands; the Bankruptcy
// countdown, which the Bankruptcy stop's warning card says in its place (M9-S7); why time stopped, each Quest a decision-needed stop names a button to its Party; how
// the Parties that came home in the last play fared; the Transfer Offers waiting for an answer; the
// Parties still out and the night each returns; and the Quests on their last Day on the Board.
// Each is drawn only when there is something to say (the review's A5). Every word and number comes
// from a selector (`state/digest.ts`, `stopView`, `headerView`, `offersView`): nothing here
// computes a rule.

import type { QuestId, WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import { leavingTodayView, outcomesView, partiesOutView, type OutcomeRow } from '../state/digest';
import type { GameAction, GameState } from '../state/reducer';
import type { HeaderView, StopView } from '../state/selectors';
import { offersView } from '../state/trade-views';
import { Icon } from './icons';
import { View, type SectionId } from './section';
import { StopCard } from './stop';
import { Banner, Chip, type Tone } from './ui';

const bandTone: Readonly<Record<OutcomeRow['band'], Tone>> = { fail: 'bad', success: 'good', strong: 'good' };

/** `+302`, `-4`, `0`. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function GuildView({
  state,
  document,
  header,
  notice,
  stop,
  busy,
  play,
  onGo,
  onOpenQuest,
  onOpenMenu,
}: {
  state: GameState;
  document: WorldDocument;
  header: HeaderView;
  notice: { from: number; to: number } | null;
  stop: StopView | null;
  busy: boolean;
  play: (action: GameAction) => void;
  onGo: (target: SectionId) => void;
  onOpenQuest: (questId: QuestId) => void;
  onOpenMenu: () => void;
}) {
  const { log } = state;
  const outcomes = useMemo(() => outcomesView({ document, log }), [document, log]);
  const offers = useMemo(() => offersView(document)?.offers ?? [], [document]);
  const parties = useMemo(() => partiesOutView(document), [document]);
  const leaving = useMemo(() => leavingTodayView(document), [document]);
  const ended = header.ended !== null;
  const quiet = stop === null && outcomes.length === 0 && offers.length === 0 && parties.length === 0 && leaving.length === 0;

  return (
    <View id="guild">
      {header.ended === null ? null : (
        <Banner tone="bad" icon="alert" role="status">
          <p>{header.ended}</p>
        </Banner>
      )}
      {notice === null ? null : (
        <Banner
          tone="accent"
          icon="about"
          actions={
            <>
              <button type="button" className="button--primary" disabled={busy} onClick={() => play({ kind: 'rebase' })}>
                Adopt the new rules
              </button>
              <button type="button" className="button--quiet" onClick={onOpenMenu}>
                More in the game menu
              </button>
            </>
          }
        >
          <p>
            <strong>New rules are available.</strong> This game plays under the rules it began with until you adopt this
            release’s, which changes how it plays from then on.
          </p>
        </Banner>
      )}
      {/* The Bankruptcy stop's card says the same Day, with what can be done: it stands in the banner's place (M9-S7). */}
      {header.countdown === null || stop?.kind === 'below-floor' ? null : (
        <Banner tone="warn" icon="alert">
          <p>{header.countdown}</p>
        </Banner>
      )}

      {stop === null ? null : <StopCard stop={stop} idle={busy || ended} play={play} onGo={onGo} onOpenQuest={onOpenQuest} />}

      {outcomes.length === 0 ? null : (
        <div className="digest">
          <h3>Came home</h3>
          <ul className="cards">
            {outcomes.map((outcome) => (
              <li key={outcome.key} className="card outcome">
                <div className="card__head">
                  <h4>{outcome.quest}</h4>
                  <Chip tone={bandTone[outcome.band]} icon={outcome.band === 'fail' ? 'cross' : 'check'}>
                    {outcome.bandWords}
                  </Chip>
                </div>
                <p className="subtle">
                  {outcome.heroes}, {outcome.when}
                </p>
                <div className="chips">
                  <Chip tone="brass" icon="wealth">
                    Wealth {signed(outcome.wealth)}
                  </Chip>
                  <Chip tone={outcome.fame < 0 ? 'bad' : 'brass'} icon="fame">
                    Fame {signed(outcome.fame)}
                  </Chip>
                  <Chip icon="up">XP +{outcome.xp} each</Chip>
                </div>
                {outcome.injuries.length === 0 && outcome.deaths.length === 0 ? null : (
                  <ul className="marks">
                    {outcome.injuries.map((injury) => (
                      <li key={injury} className="is-hurt">
                        <Icon name="injury" />
                        <span>{injury}</span>
                      </li>
                    ))}
                    {outcome.deaths.map((name) => (
                      <li key={name} className="is-missed">
                        <Icon name="cross" />
                        <span>{name} died on the Quest</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {offers.length === 0 ? null : (
        <div className="digest">
          <h3>Transfer Offers waiting</h3>
          <ul className="rows">
            {offers.map((offer) => (
              <li key={offer.offerId}>
                <span>{offer.sentence}</span>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button type="button" onClick={() => onGo('offers')}>
              <Icon name="roster" />
              <span>Answer on the Roster</span>
            </button>
          </div>
        </div>
      )}

      {parties.length === 0 ? null : (
        <div className="digest">
          <h3>Parties out</h3>
          <ul className="rows">
            {parties.map((party) => (
              <li key={party.partyId}>
                <span>
                  <strong className="quest-name">{party.quest}</strong>
                  <span className="subtle">
                    {' '}
                    · {party.heroes} · back on {party.returns}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {leaving.length === 0 ? null : (
        <div className="digest">
          <h3>Last Day on the Board</h3>
          <ul className="rows">
            {leaving.map((quest) => (
              <li key={quest.questId}>
                <span>
                  <strong className="quest-name">{quest.name}</strong>
                  <span className="subtle">
                    {' '}
                    · {quest.patron} · {quest.reward} Wealth
                  </span>
                </span>
                <button type="button" aria-label={`Choose a Party for ${quest.name}`} onClick={() => onOpenQuest(quest.questId)}>
                  Choose a Party
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {quiet && !ended ? (
        <div className="digest digest--quiet">
          <p>
            Nothing is waiting on you. Choose a Party on the Board, then play the Turns with Advance a Turn or Fast forward.
          </p>
          <div className="actions">
            <button type="button" onClick={() => onGo('board')}>
              <Icon name="board" />
              <span>Open the Board</span>
            </button>
          </div>
        </div>
      ) : null}
    </View>
  );
}
