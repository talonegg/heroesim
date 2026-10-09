// A Hero's page (M7-S3; the CLI's `show hero` and `show history <heroId>`; its design DL-106,
// the review's B7): who the Hero is in one line and their State as chips, the Stats as four
// area blocks with what gear lifts and each Stat's Outlook, gear with Equip and Unequip, Skills,
// Relationships on the Roster as bands with the neutral ones folded, then the Hero's Milestones,
// which a Hero's page always shows first, and their History, newest first, a page at a time.
// Potential is never shown (M3-S3): the Outlook is the hint word `heroPage` gives, and its rows
// carry no field that could hold the number. A Transfer out asks first, stating the fee and what it
// costs (E4).
//
// Their History is the History's own page of it (M9-S5, DL-105): grouped by date and time of day,
// folded and marked as the History view shows it, each name opening whom it names.
//
// Given `play`, it offers what can be done with the Hero where they are (M7-S3 part 2, DL-73): on
// the player's Roster, the CLI's `equip`, `unequip` and `transfer --to`; on another Guild's, its
// `transfer --in`; in the Unattached pool, its `recruit`. The fees are the engine's, and a play the
// engine refuses is said as a sentence.
//
// Their Portrait stands beside who they are, the Silhouette of their sex, and a Unique Item's picture
// before its name in their Gear and in the Gear the Guild holds (v1.1.2-S2, DL-125 items 2 and 8).
// Their Appearance and Biography follow, under the Portrait (v1.1.3-S7, DL-135 item 6).

import type { GuildId, HeroId, Unavailability, WorldDocument } from '@heroesim/engine';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameAction } from '../state/reducer';
import { heroPage, type HeroActions, type HeroPageView, type LogLine } from '../state/selectors';
import { EntityHistory } from './history-entries';
import { HeroName, Icon, type IconName } from './icons';
import { ItemPicture, Portrait } from './pictures';
import { Terms } from './section';
import { Chip, Confirm, Folded, moraleTones, regardTones, VisuallyHidden, type Tone } from './ui';

/** The heading levels a Hero's page takes: its name's, and one below for its parts (M9-S3). */
type Levels = 3 | 4;

function Sub({ level, children }: { level: Levels; children: ReactNode }) {
  return level === 3 ? <h4>{children}</h4> : <h5>{children}</h5>;
}

/** Where a Hero is, as an icon beside its words (M9-S6): injured or away is never colour alone. */
const whereIcons: Readonly<Record<Unavailability, IconName>> = {
  injured: 'injury',
  'in-party': 'travel',
  dead: 'alert',
  retired: 'alert',
};

const whereTones: Readonly<Record<Unavailability, Tone>> = {
  injured: 'warn',
  'in-party': 'accent',
  dead: 'bad',
  retired: 'plain',
};

export function HeroPage({
  document,
  heroId,
  onBack,
  backLabel = 'Back to the Roster',
  play,
  busy = false,
  level = 3,
}: {
  document: WorldDocument;
  heroId: HeroId;
  onBack?: () => void;
  backLabel?: string;
  /** Offers the Hero's actions when given. */
  play?: (action: GameAction) => void;
  busy?: boolean;
  /** The level of the Hero's name: 3 in a view, 4 in a part of one (M9-S3). */
  level?: Levels;
}) {
  const view = useMemo(() => heroPage(document, heroId), [document, heroId]);
  const back =
    onBack === undefined ? null : (
      <div className="actions actions--back">
        <button type="button" className="button--quiet" onClick={onBack}>
          <Icon name="back" />
          <span>{backLabel}</span>
        </button>
      </div>
    );
  const own = play !== undefined && view?.actions?.kind === 'own';
  if (view === null) {
    return (
      <div className="hero-page">
        <p>That Hero is no longer in the world.</p>
        {back}
      </div>
    );
  }
  return (
    <article className="hero-page" aria-labelledby="hero-name">
      {back}
      <header className="hero-page__head person">
        <Portrait role="hero" sex={view.sex} portraitKey={view.portraitKey} name={view.name} />
        <div className="person__about">
          {/* The keyboard may be put on the name when the page opens (the Party builder's drill-down, M9-S4). */}
          {level === 3 ? (
            <h3 id="hero-name" tabIndex={-1}>
              <HeroName icon={view.classIcon} className={view.className} name={view.name} />
            </h3>
          ) : (
            <h4 id="hero-name" tabIndex={-1}>
              <HeroName icon={view.classIcon} className={view.className} name={view.name} />
            </h4>
          )}
          <p className="hero-page__line">{view.line.join(' · ')}</p>
          <State view={view} />
        </div>
      </header>
      {/* Their Appearance and Biography under their Portrait (v1.1.3-S7, DL-135 item 6). */}
      {view.texts.length === 0 ? null : (
        <div className="hero-page__texts" data-testid="hero-texts">
          <Terms pairs={view.texts} />
        </div>
      )}

      {/* In the pool or on a Rival's Roster, what can be done comes first: it is why the page was opened. */}
      {play === undefined || view.actions === null || view.actions.kind === 'own' ? null : (
        <HeroActionsView actions={view.actions} heroId={heroId} name={view.name} busy={busy} play={play} level={level} />
      )}

      <Sub level={level}>Stats</Sub>
      <div className="stat-blocks">
        {view.areas.map((area) => (
          <table key={area.name} className="stat-block">
            <caption>{area.name}</caption>
            <tbody>
              {area.stats.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td className="number stat-block__value">
                    {row.value}
                    {row.lift === null ? null : (
                      <span className={row.lift.up ? 'lift lift--up' : 'lift lift--down'}>
                        {row.lift.words}
                        <VisuallyHidden> on its base of {row.base}</VisuallyHidden>
                      </span>
                    )}
                  </td>
                  <td className="stat-block__outlook">
                    <Chip tone={row.outlook === 'exceptional' ? 'brass' : 'plain'} title="Outlook">
                      <VisuallyHidden>Outlook </VisuallyHidden>
                      {row.outlookWords}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      <Sub level={level}>Gear</Sub>
      <ul className="rows gear" aria-label={`${view.name}'s Gear`}>
        {view.gear.map((gear, index) => (
          <li key={`${gear.slot}-${index}`} className={gear.worn ? 'gear__row' : 'gear__row is-empty'}>
            <span className="gear__slot">{gear.slotName}</span>
            <span className="gear__item">
              {gear.unique && gear.definitionKey !== null ? <ItemPicture definitionKey={gear.definitionKey} /> : null}
              {gear.item}
              {gear.modifies === '' ? null : <span className="subtle"> {gear.modifies}</span>}
            </span>
            {own && gear.worn && play !== undefined ? (
              <button type="button" aria-label={`Unequip ${gear.item}`} disabled={busy} onClick={() => play({ kind: 'unequip', heroId, slot: gear.slot })}>
                Unequip
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {own && play !== undefined && view.actions?.kind === 'own' ? (
        <Equip actions={view.actions} heroId={heroId} busy={busy} play={play} />
      ) : null}

      <Sub level={level}>Skills</Sub>
      {view.skills.length === 0 ? (
        <p className="subtle">None</p>
      ) : (
        <ul className="chips" aria-label={`${view.name}'s Skills`}>
          {view.skills.map((skill) => (
            <li key={skill.name}>
              <Chip>
                {skill.name} {skill.rating}
              </Chip>
            </li>
          ))}
        </ul>
      )}

      {view.relationships === null ? null : (
        <>
          <Sub level={level}>Relationships on the Roster</Sub>
          <Folded
            rows={view.relationships}
            label={`${view.name}'s Relationships`}
            row={(mate) => (
              <>
                <span className="regards__name">{mate.name}</span> <span className="regards__detail">{mate.className}</span>
                <span className="regards__bands">
                  <Chip tone={regardTones[mate.regard]}>Regard {mate.regard}</Chip>
                  <Chip tone={regardTones[mate.relationship]}>Relationship {mate.relationship}</Chip>
                </span>
              </>
            )}
          />
        </>
      )}

      {play === undefined || view.actions?.kind !== 'own' ? null : (
        <HeroActionsView actions={view.actions} heroId={heroId} name={view.name} busy={busy} play={play} level={level} />
      )}

      {/* No Milestone yet, no heading: an empty list is not drawn (M9-S3, the review's A5). */}
      {view.milestones.length === 0 ? null : (
        <>
          <Sub level={level}>Milestones</Sub>
          <Lines lines={view.milestones} empty="" />
        </>
      )}

      <Sub level={level}>History, newest first</Sub>
      <EntityHistory document={document} whose={heroId} level={level === 3 ? 5 : 6} />
    </article>
  );
}

/** The Hero's State as chips: Morale and its band, where they are, an Injury, XP, Traits with what each does (v1.1.4-S7), and the fee to take them in. */
function State({ view }: { view: HeroPageView }) {
  const { morale, where } = view;
  return (
    <ul className="chips hero-page__state" aria-label={`${view.name}'s State`}>
      <li>
        <Chip tone={moraleTones[morale.band]} icon="morale">
          Morale {morale.value}, {morale.band}
        </Chip>
      </li>
      <li>
        {where.why === null ? <Chip icon="hall">{where.words}</Chip> : <Chip tone={whereTones[where.why]} icon={whereIcons[where.why]}>{where.words}</Chip>}
      </li>
      {view.injury === null ? null : (
        <li>
          <Chip tone="warn" icon="injury" title="Injury">
            {view.injury}
          </Chip>
        </li>
      )}
      <li>
        <Chip>XP {view.xp}</Chip>
      </li>
      {view.traits.map((trait) => (
        <li key={trait.name}>
          <Chip tone="accent" title="Trait">
            {trait.name}: {trait.effect}
          </Chip>
        </li>
      ))}
      {view.fee === null ? null : (
        <li>
          <Chip tone="brass" icon="wealth">
            Transfer fee {view.fee}
            <VisuallyHidden> Wealth</VisuallyHidden>
          </Chip>
        </li>
      )}
    </ul>
  );
}

/** Gear the Guild holds, which `equip` can put on the Hero: under their gear (M9-S6). */
function Equip({
  actions,
  heroId,
  busy,
  play,
}: {
  actions: Extract<HeroActions, { kind: 'own' }>;
  heroId: HeroId;
  busy: boolean;
  play: (action: GameAction) => void;
}) {
  if (actions.equip.length === 0) return <p className="subtle">The Guild holds no Gear; the Market sells it.</p>;
  return (
    <>
      <p className="caption">Gear the Guild holds</p>
      <ul className="rows gear" aria-label="Gear the Guild holds">
        {actions.equip.map((gear) => (
          <li key={gear.key} className="gear__row">
            <span className="gear__slot">{gear.kind}</span>
            <span className="gear__item">
              {gear.unique ? <ItemPicture definitionKey={gear.definitionKey} /> : null}
              {gear.name}
              {gear.modifies === '' ? null : <span className="subtle"> {gear.modifies}</span>}
            </span>
            <button type="button" aria-label={`Equip ${gear.name}`} disabled={busy} onClick={() => play({ kind: 'equip', heroId, ...gear.gear })}>
              Equip
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** What can be done with the Hero where they are: the player's own, a Rival's, or one in the pool. */
function HeroActionsView({
  actions,
  heroId,
  name,
  busy,
  play,
  level,
}: {
  actions: HeroActions;
  heroId: HeroId;
  name: string;
  busy: boolean;
  play: (action: GameAction) => void;
  level: Levels;
}) {
  switch (actions.kind) {
    case 'pool':
      return (
        <div className="hero-page__act">
          <p>
            Signing fee {actions.fee} Wealth. Signs for your Guild: {actions.signs}.
          </p>
          <div className="actions">
            {/* Disabled for one who will not sign, the sentence above saying why (DL-109 item 2, Q17). */}
            <button
              type="button"
              className="button--primary"
              aria-label={`Recruit ${name}`}
              disabled={busy || !actions.willSign}
              onClick={() => play({ kind: 'recruit', heroId })}
            >
              Recruit
            </button>
          </div>
        </div>
      );
    case 'rival':
      return (
        <div className="hero-page__act">
          <p>
            Your Guild would pay {actions.guildName} a Transfer fee of {actions.fee} Wealth to take {name} in, if{' '}
            {actions.guildName} is willing to part with them.
          </p>
          <div className="actions">
            <button type="button" aria-label={`Take ${name} in`} disabled={busy} onClick={() => play({ kind: 'transferIn', heroId })}>
              Take in
            </button>
          </div>
        </div>
      );
    case 'own':
      return <Transfer actions={actions} heroId={heroId} name={name} busy={busy} play={play} level={level} />;
  }
}

/**
 * Transfer the Hero out to another Guild in play for the fee it would pay: behind "Transfer…", which
 * opens the confirmation that says the fee and what the Transfer costs (M9-S6, the review's E4).
 */
function Transfer({
  actions,
  heroId,
  name,
  busy,
  play,
  level,
}: {
  actions: Extract<HeroActions, { kind: 'own' }>;
  heroId: HeroId;
  name: string;
  busy: boolean;
  play: (action: GameAction) => void;
  level: Levels;
}) {
  const [asking, setAsking] = useState(false);
  const [to, setTo] = useState<GuildId | ''>('');
  // "Keep them" puts the keyboard back on "Transfer…" once it is drawn again.
  const returning = useRef(false);
  const target = actions.transferTo.find((guild) => guild.guildId === to) ?? actions.transferTo[0];
  return (
    <>
      <Sub level={level}>Transfer</Sub>
      {target === undefined ? (
        <p className="subtle">No other Guild is in play to take {name}.</p>
      ) : asking ? (
        <Confirm
          label={`Transfer ${name}?`}
          confirm={`Transfer to ${target.name}`}
          confirmLabel={`Transfer ${name} to ${target.name}`}
          busy={busy}
          onConfirm={() => play({ kind: 'transferOut', heroId, toGuildId: target.guildId })}
          onKeep={() => {
            returning.current = true;
            setAsking(false);
          }}
        >
          <label className="field">
            <span>Transfer {name} to</span>
            <select value={target.guildId} onChange={(event) => setTo(event.target.value as GuildId)}>
              {actions.transferTo.map((guild) => (
                <option key={guild.guildId} value={guild.guildId}>
                  {guild.name}, for {guild.fee} Wealth
                </option>
              ))}
            </select>
          </label>
          <p aria-live="polite">{target.sentence}</p>
        </Confirm>
      ) : (
        <div className="actions">
          <button
            type="button"
            ref={(button) => {
              if (button !== null && returning.current) {
                returning.current = false;
                button.focus();
              }
            }}
            aria-label={`Transfer ${name}…`}
            disabled={busy}
            onClick={() => setAsking(true)}
          >
            Transfer…
          </button>
        </div>
      )}
    </>
  );
}

/** Lines of the History, each with when it fell. */
export function Lines({ lines, empty }: { lines: readonly LogLine[]; empty: string }) {
  if (lines.length === 0) return empty === '' ? null : <p className="subtle">{empty}</p>;
  return (
    <ol className="lines">
      {lines.map((line) => (
        <li key={line.key} className={line.milestone ? 'milestone' : undefined}>
          <span className="when">{line.when}</span> {line.sentence}
        </li>
      ))}
    </ol>
  );
}
