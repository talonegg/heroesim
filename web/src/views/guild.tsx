// The home view, Guild (M9-S3, DL-103; the review's A3): a digest of what needs attention this
// Turn. How the game ended, once it has; the rules notice while it stands; the Bankruptcy
// countdown, which the Bankruptcy stop's warning card says in its place (M9-S7); why time stopped, each Quest a decision-needed stop names a button to its Party; the
// Quest report of each Party that came home in the last play (M9-F5, DL-111 item 3, `quest-report.tsx`),
// in the place the "Came home" cards had; the Transfer Offers waiting for an answer; the
// Parties still out and the night each returns; and the Quests on their last Day on the Board.
// Each is drawn only when there is something to say (the review's A5). Every word and number comes
// from a selector (`state/digest.ts`, `state/quest-return.ts`, `stopView`, `headerView`,
// `offersView`): nothing here computes a rule. An older report, opened from its entry in the rail or
// the History, stands in Home's place until it is closed (M9-F5, DL-111 item 3, Q7).
//
// The Guild in parts (DL-111 item 5, DL-112 item 5): tabs under the view's heading, Home,
// the digest above; Hall, its premises with Build (`hall.tsx`); and, by DL-116, Stores,
// everything it owns (`stores.tsx`), and Treasury, its accounts (`treasury.tsx`).
// Which part is open is the shell's, which this browser remembers (`remembered.ts`).

import type { QuestId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { leavingTodayView, partiesOutView } from '../state/digest';
import { questReturn, returnsIn, type QuestReturn, type ReturnKey } from '../state/quest-return';
import type { GameAction, GameState } from '../state/reducer';
import type { HeaderView, StopView } from '../state/selectors';
import { offersView } from '../state/trade-views';
import { Hall } from './hall';
import { Icon } from './icons';
import { QuestReport } from './quest-report';
import { guildParts, titles, View, type GuildPartId, type SectionId } from './section';
import { StopCard } from './stop';
import { Stores } from './stores';
import { Treasury } from './treasury';
import { Banner, Tabs } from './ui';

/** What the Guild view and its Home take. */
interface HomeProps {
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
  /** An older Quest report, opened from its entry, which stands in Home's place (M9-F5); none when not given. */
  report?: ReturnKey | null;
  /** Closes the older report, back to Home. */
  onCloseReport?: () => void;
}

/** The Guild's parts as tabs, each by its title. */
const tabs = guildParts.map((key) => ({ key, label: titles[key] }));

/** The Guild view: its parts as tabs under its heading, the one open under them (M9-F2). */
export function GuildView({
  part: given,
  onPart,
  ...home
}: HomeProps & {
  /** The part open, when the shell keeps it; the view keeps its own, from Home, otherwise. */
  part?: GuildPartId;
  onPart?: (part: GuildPartId) => void;
}) {
  const [own, setOwn] = useState<GuildPartId>('home');
  const part = given ?? own;
  const { document, busy, play, onGo } = home;
  return (
    <View id="guild">
      <Tabs
        label="The Guild’s parts"
        tabs={tabs}
        open={part}
        onOpen={onPart ?? setOwn}
        idOf={(key) => `guild-${key}`}
        describedBy={(key) => `${key}-help`}
      >
        {part === 'home' ? <Home {...home} /> : null}
        {part === 'hall' ? <Hall document={document} busy={busy} play={play} /> : null}
        {part === 'stores' ? <Stores document={document} onGo={onGo} /> : null}
        {part === 'treasury' ? <Treasury document={document} /> : null}
      </Tabs>
    </View>
  );
}

/** The Guild's Home: what needs attention this Turn; or an older Quest report, opened from its entry, until it is closed. */
function Home(props: HomeProps) {
  const { state, document, header, notice, stop, busy, play, onGo, onOpenQuest, onOpenMenu, report = null, onCloseReport } = props;
  const { log } = state;
  // The report of each Party of the player's that came home in the last play, read from the History (M9-F5).
  const reports = useMemo(
    () => returnsIn({ document, log }).flatMap((key) => questReturn(document, key) ?? []),
    [document, log],
  );
  const older = useMemo<QuestReturn | null>(() => (report === null ? null : questReturn(document, report)), [document, report]);
  const offers = useMemo(() => offersView(document)?.offers ?? [], [document]);
  const parties = useMemo(() => partiesOutView(document), [document]);
  const leaving = useMemo(() => leavingTodayView(document), [document]);
  const ended = header.ended !== null;
  const quiet = stop === null && reports.length === 0 && offers.length === 0 && parties.length === 0 && leaving.length === 0;

  if (older !== null) return <QuestReport report={older} {...(onCloseReport === undefined ? {} : { onClose: onCloseReport })} />;

  return (
    <>
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

      {reports.map((each) => (
        <QuestReport key={each.key.partyId} report={each} />
      ))}

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
          {/* Below the floor, the countdown is waiting on the player, and Home says so (M9-F6; the owner's words, DL-120 item 8). */}
          <p>
            {header.countdown === null ? 'Nothing is waiting on you. ' : 'Your Guild is below the Bankruptcy floor: see the steps above. '}Choose a
            Party on the Board, then play the Turns with
            Advance a Turn or Fast forward.
          </p>
          <div className="actions">
            <button type="button" onClick={() => onGo('board')}>
              <Icon name="board" />
              <span>Open the Board</span>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
