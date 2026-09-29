// The Board with the Party builder (M7-S3; M9-S4, DL-104; the CLI's `show board`, `preview` and
// `dispatch`). Each Quest on offer is a compact card of two lines: its name and Patron, then chips
// for its difficulty, the Days it takes, its reward, its Fame, its Party size, what else it needs
// and the Day it leaves the Board, marked when that is today (the review's B2). Its name unfolds it:
// the Demands as bars of their weights, the Skills that help, the Encounters counted by kind, and
// its difficulty on a meter placed against the Quests on the Board now, display only (C5, C6). The
// player may order the Board by reward, difficulty or the Day each leaves, display only too.
//
// "Choose a Party" opens the builder (DL-99 item 3, the review's C4): each Hero on the Roster as a
// row saying whether they can go, and when not why and until when, their Class and Level, their
// Morale and its band, the effective values of the Stats the Quest demands, and the Skills it names
// that they have. A row opens the Hero's page in place of the Board; "Back to the Party" returns to
// the builder with the Party and the consumables as they were chosen. The requirements are a
// checklist, and dispatch's own verdict (`previewDispatch`, DL-66 item 2) a banner at the foot of the
// form, beside Send, which stays in view while the form scrolls. Once sent, the card becomes a
// "Party out" card naming who went and the night they return (E1). No fit score and no odds.
//
// Every number and judgement comes from a selector (`boardView`, `partyRows`, `consumableChoices`,
// `previewView`, `sentView`): nothing here computes a rule.

import type { EncounterKind, HeroId, ItemDefinitionKey, QuestId, WorldDocument } from '@heroesim/engine';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameAction, GameState } from '../state/reducer';
import {
  boardView,
  consumableChoices,
  partyRows,
  previewView,
  sentView,
  type BoardOrder,
  type PartyRow,
  type QuestCard,
  type SentView,
} from '../state/selectors';
import { HeroPage } from './hero-page';
import { Icon, type IconName } from './icons';
import { View } from './section';
import { Banner, Chip, Stepper, VisuallyHidden, type Tone } from './ui';

/** The orders the player may choose, in the words the control shows. */
const orders: readonly (readonly [BoardOrder, string])[] = [
  ['posted', 'As posted'],
  ['reward', 'Reward, highest first'],
  ['difficulty', 'Difficulty, easiest first'],
  ['leaves', 'Leaving soonest'],
];

/** Each kind of Encounter's icon (M9-S3's set). */
const encounterIcons: Readonly<Record<EncounterKind, IconName>> = {
  combat: 'combat',
  travel: 'travel',
  social: 'social',
  arcane: 'arcane',
  stealth: 'stealth',
};

/** How a Morale band reads beside the Hero: a warning when low, never colour alone (the word is there). */
const moraleTones: Readonly<Record<PartyRow['moraleBand'], Tone>> = {
  wretched: 'bad',
  low: 'warn',
  steady: 'plain',
  high: 'good',
  elated: 'good',
};

/** The Party being chosen for a Quest: who is ticked and how many of each consumable, kept while a Hero's page is open. */
interface Choice {
  questId: QuestId | null;
  heroIds: readonly HeroId[];
  carry: Readonly<Record<ItemDefinitionKey, number>>;
}

const noChoice: Choice = { questId: null, heroIds: [], carry: {} };

export function Board({
  state,
  document,
  busy,
  play,
  open,
  onOpen,
  order,
  onOrder,
  onGuild,
}: {
  state: GameState;
  document: WorldDocument;
  busy: boolean;
  play: (action: GameAction) => void;
  /** The Quest whose Party is being chosen, or none: the shell's, so the home view's Quest buttons open one. */
  open: QuestId | null;
  onOpen: (questId: QuestId | null) => void;
  order: BoardOrder;
  onOrder: (order: BoardOrder) => void;
  /** Opens the home view, where the Parties out are listed. */
  onGuild: () => void;
}) {
  const cards = useMemo(() => boardView(document, order), [document, order]);
  const sent = useMemo(() => sentView(state), [state]);
  const [unfolded, setUnfolded] = useState<ReadonlySet<QuestId>>(() => new Set());
  const [choice, setChoice] = useState<Choice>(noChoice);
  // A Hero's page opened from the builder of the Quest open, in place of the Board.
  const [viewing, setViewing] = useState<{ heroId: HeroId; questId: QuestId } | null>(null);
  // Where the Quest sent last stood on the Board as it was shown, so its "Party out" card takes its place.
  const [sentAt, setSentAt] = useState<{ questId: QuestId; index: number } | null>(null);
  // Where the keyboard goes next, and what is scrolled into view with it: the view's top for a Hero's
  // page, so its "Back to the Party" shows; the middle of the screen for a row, clear of the sticky foot.
  const [focus, setFocus] = useState<{ id: string; show: 'view' | 'it' } | null>(null);

  // A choice is for one Quest: another Quest's builder starts empty.
  const current = choice.questId === open ? choice : { ...noChoice, questId: open };

  useEffect(() => {
    if (focus === null) return;
    const target = globalThis.document.getElementById(focus.id);
    if (focus.show === 'view') globalThis.document.getElementById('board')?.scrollIntoView?.({ block: 'start' });
    else target?.scrollIntoView?.({ block: 'center' });
    target?.focus({ preventScroll: true });
  }, [focus]);

  if (viewing !== null && viewing.questId === open) {
    const { heroId } = viewing;
    const quest = cards.find((card) => card.questId === open);
    return (
      <View id="board">
        {quest === undefined ? null : (
          <p className="view__lead">
            Choosing a Party for <strong className="quest-name">{quest.name}</strong>: {current.heroIds.length} chosen.
          </p>
        )}
        <HeroPage
          key={heroId}
          document={document}
          heroId={heroId}
          backLabel="Back to the Party"
          onBack={() => {
            setViewing(null);
            setFocus({ id: openerId(heroId), show: 'it' });
          }}
          play={play}
          busy={busy}
        />
      </View>
    );
  }

  function unfold(questId: QuestId): void {
    const next = new Set(unfolded);
    if (open === questId || next.has(questId)) {
      next.delete(questId);
      if (open === questId) onOpen(null);
    } else next.add(questId);
    setUnfolded(next);
  }

  const shown: ({ kind: 'quest'; card: QuestCard } | { kind: 'sent'; sent: SentView })[] = cards.map((card) => ({ kind: 'quest', card }));
  if (sent !== null && sentAt !== null && sent.questId === sentAt.questId && !cards.some((card) => card.questId === sent.questId)) {
    shown.splice(Math.min(sentAt.index, shown.length), 0, { kind: 'sent', sent });
  }

  return (
    <View id="board">
      <div className="board__bar">
        <p className="view__lead">{cards.length === 0 ? 'The Board is empty.' : `${cards.length} ${cards.length === 1 ? 'Quest' : 'Quests'} on offer.`}</p>
        {cards.length < 2 ? null : (
          <label className="field field--inline">
            <span>Order</span>
            <select value={order} onChange={(event) => onOrder(event.target.value as BoardOrder)}>
              {orders.map(([value, words]) => (
                <option key={value} value={value}>
                  {words}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <ul className="cards quests">
        {shown.map((item) =>
          item.kind === 'sent' ? (
            <li key={`sent-${item.sent.questId}`}>
              <SentCard sent={item.sent} onGuild={onGuild} />
            </li>
          ) : (
            <li key={item.card.questId}>
              <Quest
                card={item.card}
                unfolded={unfolded.has(item.card.questId) || open === item.card.questId}
                open={open === item.card.questId}
                onUnfold={() => unfold(item.card.questId)}
                onChoose={() => {
                  setUnfolded(new Set(unfolded).add(item.card.questId));
                  onOpen(open === item.card.questId ? null : item.card.questId);
                }}
              >
                {open === item.card.questId ? (
                  <Builder
                    document={document}
                    card={item.card}
                    choice={current}
                    onChoice={setChoice}
                    busy={busy}
                    onHero={(heroId) => {
                      setViewing({ heroId, questId: item.card.questId });
                      setFocus({ id: 'hero-name', show: 'view' });
                    }}
                    onSend={(heroIds, consumables) => {
                      setSentAt({ questId: item.card.questId, index: cards.findIndex((card) => card.questId === item.card.questId) });
                      play({ kind: 'dispatch', questId: item.card.questId, heroIds: [...heroIds], consumables });
                    }}
                  />
                ) : null}
              </Quest>
            </li>
          ),
        )}
      </ul>
    </View>
  );
}

/** The id of the button on a Hero's row that opens their page: the keyboard returns to it. */
function openerId(heroId: HeroId): string {
  return `open-${heroId}`;
}

function sentHeadingId(questId: QuestId): string {
  return `sent-${questId}`;
}

function Quest({
  card,
  unfolded,
  open,
  onUnfold,
  onChoose,
  children,
}: {
  card: QuestCard;
  unfolded: boolean;
  open: boolean;
  onUnfold: () => void;
  onChoose: () => void;
  children: ReactNode;
}) {
  const headingId = `quest-${card.questId}`;
  const detailsId = `quest-${card.questId}-details`;
  return (
    <article className={open ? 'card quest is-open' : unfolded ? 'card quest is-unfolded' : 'card quest'} aria-labelledby={headingId}>
      <div className="quest__summary">
        <div className="quest__line">
          <h3 id={headingId} tabIndex={-1} className="quest__name">
            <button type="button" className="quest__toggle" aria-expanded={unfolded} aria-controls={detailsId} onClick={onUnfold}>
              <Icon name="chevron" className="quest__mark" />
              <span>{card.name}</span>
            </button>
          </h3>
          <p className="quest__patron">
            <span aria-hidden="true">· </span>
            {card.patron}
          </p>
        </div>
        <ul className="chips quest__chips" aria-label={`The terms of ${card.name}`}>
          <li>
            <Chip>Difficulty {card.difficulty}</Chip>
          </li>
          <li>
            <Chip>
              {card.days} {card.days === 1 ? 'Day' : 'Days'} away
            </Chip>
          </li>
          <li>
            <Chip tone="brass" icon="wealth">
              {card.reward}
              <VisuallyHidden> Wealth</VisuallyHidden>
            </Chip>
          </li>
          <li>
            <Chip tone="brass" icon="fame">
              ±{card.fame}
              <VisuallyHidden> Fame</VisuallyHidden>
            </Chip>
          </li>
          <li>
            <Chip icon="roster">{card.party}</Chip>
          </li>
          {card.needs.map((need) => (
            <li key={need}>
              <Chip tone="accent">Needs {need}</Chip>
            </li>
          ))}
          <li>
            {card.leavesToday ? (
              <Chip tone="warn" icon="alert">
                Leaves today
              </Chip>
            ) : (
              <Chip>Until Day {card.lastDay}</Chip>
            )}
          </li>
        </ul>
        <button type="button" className={open ? 'button--quiet quest__choose' : 'quest__choose'} aria-expanded={open} onClick={onChoose}>
          {open ? <Icon name="close" /> : <Icon name="roster" />}
          <span>{open ? 'Close' : 'Choose a Party'}</span>
        </button>
      </div>
      {unfolded ? <Details card={card} id={detailsId} /> : null}
      {children}
    </article>
  );
}

/** What unfolds under a card: the Demands, the Skills that help, the Encounters and the difficulty on its meter. */
function Details({ card, id }: { card: QuestCard; id: string }) {
  const { meter } = card;
  return (
    <div className="quest__details" id={id}>
      <div className="quest__detail">
        <h4>Demands</h4>
        <ul className="demands">
          {card.demands.map((demand) => (
            <li key={demand.stat}>
              <span className="demand__stat">{demand.stat}</span>
              <span className="demand__bar" aria-hidden="true">
                <span style={{ width: `${demand.percent}%` }} />
              </span>
              <span className="demand__share">{demand.percent}%</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="quest__detail">
        <h4>Skills that help</h4>
        {card.skills.length === 0 ? (
          <p className="subtle">None</p>
        ) : (
          <ul className="chips">
            {card.skills.map((skill) => (
              <li key={skill}>
                <Chip>{skill}</Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="quest__detail">
        <h4>Encounters</h4>
        {card.encounters.length === 0 ? (
          <p className="subtle">Drawn on the way</p>
        ) : (
          <ul className="chips">
            {card.encounters.map((encounter) => (
              <li key={encounter.words}>
                <Chip {...(encounter.kind === null ? {} : { icon: encounterIcons[encounter.kind] })}>{encounter.words}</Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="quest__detail">
        <h4>Difficulty</h4>
        <div className="meter" role="img" aria-label={`Difficulty ${card.difficulty}: ${card.hardness}, from ${meter.lowest} to ${meter.highest}`}>
          <span className="meter__track">
            {meter.others.map((at, index) => (
              <span key={index} className="meter__tick" style={{ left: `${at * 100}%` }} />
            ))}
            <span className="meter__mark" style={{ left: `${meter.at * 100}%` }} />
          </span>
          <span className="meter__ends" aria-hidden="true">
            <span>{meter.lowest}</span>
            <span>{meter.highest}</span>
          </span>
        </div>
        <p className="meter__words">
          <strong>{card.difficulty}</strong>, {card.hardness}.
        </p>
      </div>
    </div>
  );
}

/** The Party builder for one Quest: the Heroes as rows, the consumables, the checklist, the verdict and Send. */
function Builder({
  document,
  card,
  choice,
  onChoice,
  busy,
  onHero,
  onSend,
}: {
  document: WorldDocument;
  card: QuestCard;
  choice: Choice;
  onChoice: (choice: Choice) => void;
  busy: boolean;
  onHero: (heroId: HeroId) => void;
  onSend: (heroIds: readonly HeroId[], consumables: { definitionKey: ItemDefinitionKey; quantity: number }[]) => void;
}) {
  const { questId } = card;
  const rows = useMemo(() => partyRows(document, questId) ?? [], [document, questId]);
  const stocks = useMemo(() => consumableChoices(document), [document]);

  // Only Heroes who can still go, and no more of a consumable than the Guild holds now.
  const party = choice.heroIds.filter((heroId) => rows.some((row) => row.heroId === heroId && row.why === null));
  const consumables = stocks.flatMap(({ definitionKey, held }) => {
    const quantity = Math.min(Math.max(0, Math.floor(choice.carry[definitionKey] ?? 0)), held);
    return quantity > 0 ? [{ definitionKey, quantity }] : [];
  });
  const preview = previewView(document, questId, party, consumables);

  function toggle(heroId: HeroId, on: boolean): void {
    const others = choice.heroIds.filter((id) => id !== heroId);
    onChoice({ ...choice, questId, heroIds: on ? [...others, heroId] : others });
  }

  return (
    <form
      className="dispatch"
      aria-label={`A Party for ${card.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSend(party, consumables);
      }}
    >
      <fieldset className="party">
        <legend>Heroes</legend>
        {rows.length === 0 ? <p>The Roster is empty.</p> : null}
        <ul className="party__rows">
          {rows.map((row) => (
            <HeroRow key={row.heroId} row={row} chosen={party.includes(row.heroId)} onToggle={(on) => toggle(row.heroId, on)} onOpen={() => onHero(row.heroId)} />
          ))}
        </ul>
      </fieldset>
      {/* No consumables held, no fieldset: an empty list is not drawn (M9-S3, the review's A5). */}
      {stocks.length === 0 ? null : (
        <fieldset>
          <legend>Consumables</legend>
          {stocks.map((stock) => (
            <Stepper
              key={stock.definitionKey}
              label={`${stock.name}, ${stock.held} held: ${stock.does}`}
              value={choice.carry[stock.definitionKey] ?? 0}
              min={0}
              max={stock.held}
              onChange={(value) =>
                onChoice({ ...choice, questId, carry: { ...choice.carry, [stock.definitionKey]: Number.isFinite(value) ? value : 0 } })
              }
            />
          ))}
        </fieldset>
      )}
      {preview === null ? (
        <p>This Quest is no longer on the Board.</p>
      ) : (
        <div className="preview" aria-label="Preview">
          <h4>Requirements</h4>
          <ul className="marks checklist">
            {preview.requirements.map((requirement) => (
              <li key={requirement.words} className={requirement.met ? 'is-met' : 'is-missed'}>
                <Icon name={requirement.met ? 'check' : 'cross'} />
                <span>
                  {requirement.words}: <strong>{requirement.met ? 'met' : 'missed'}</strong>
                </span>
              </li>
            ))}
          </ul>
          {preview.problems.length === 0 ? null : (
            <>
              <h4>Heroes</h4>
              <ul>
                {preview.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </>
          )}
          <h4>Synergies</h4>
          <ul>
            {preview.synergies.map((synergy) => (
              <li key={synergy}>{synergy}</li>
            ))}
          </ul>
          <h4>Consumables</h4>
          <ul>
            {preview.consumables.map((consumable) => (
              <li key={consumable}>{consumable}</li>
            ))}
          </ul>
          <p>{preview.reward}</p>
        </div>
      )}
      {/* Send stays in view at the foot of the form while it scrolls, with dispatch's verdict beside it. */}
      <div className="dispatch__foot">
        {preview === null ? null : (
          <Banner tone={preview.verdict.sends ? 'good' : 'bad'} icon={preview.verdict.sends ? 'check' : 'cross'} role="status" testId="verdict">
            <p>{preview.verdict.words}</p>
          </Banner>
        )}
        <button type="submit" className="button--primary" disabled={busy || preview === null || !preview.verdict.sends}>
          Send the Party
        </button>
      </div>
    </form>
  );
}

/** A Hero on the Roster as the builder shows them: the checkbox, who they are, and what bears on this Quest. */
function HeroRow({ row, chosen, onToggle, onOpen }: { row: PartyRow; chosen: boolean; onToggle: (on: boolean) => void; onOpen: () => void }) {
  const away = row.why !== null;
  return (
    <li className={away ? 'party-row is-away' : 'party-row'} data-testid="party-row">
      <label className="party-row__pick">
        <input type="checkbox" checked={chosen} disabled={away} onChange={(event) => onToggle(event.target.checked)} />
        <span className="party-row__who">
          <span className="party-row__name">{row.name}</span>{' '}
          <span className="party-row__class">
            {row.className}, Level {row.level}
          </span>
        </span>
      </label>
      <button type="button" id={openerId(row.heroId)} className="button--quiet party-row__open" aria-label={`Open ${row.name}'s page`} onClick={onOpen}>
        <span>Open</span>
        <Icon name="go" />
      </button>
      <div className="party-row__facts">
        {row.unavailable === null ? null : (
          <Chip tone="warn" icon={row.why === 'injured' ? 'injury' : row.why === 'in-party' ? 'travel' : 'alert'}>
            {capitalised(row.unavailable)}
          </Chip>
        )}
        <Chip tone={moraleTones[row.moraleBand]} icon="morale">
          Morale {row.morale}, {row.moraleBand}
        </Chip>
        {row.skills.map((skill) => (
          <Chip key={skill.name} tone="accent">
            {skill.name} {skill.rating}
          </Chip>
        ))}
      </div>
      <dl className="party-row__stats" aria-label={`${row.name}'s Stats this Quest demands`}>
        {row.stats.map((stat) => (
          <div key={stat.name}>
            <dt>{stat.name}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

/**
 * The card a Quest becomes once its Party is sent, where the Quest's card stood: who went and the
 * night they return (the review's E1). The keyboard comes to it, as the form it replaces has gone.
 */
function SentCard({ sent, onGuild }: { sent: SentView; onGuild: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.scrollIntoView?.({ block: 'center' });
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <article className="card sent" aria-labelledby={sentHeadingId(sent.questId)} data-testid="sent">
      <div className="card__head">
        <h3 id={sentHeadingId(sent.questId)} ref={heading} tabIndex={-1} className="quest-name">
          {sent.quest}
        </h3>
        <Chip tone="good" icon="check">
          Party out
        </Chip>
      </div>
      <p>
        Sent: {sent.heroes}. Back on {sent.returns}.
      </p>
      <div className="actions">
        <button type="button" className="button--quiet" onClick={onGuild}>
          <Icon name="guild" />
          <span>See the Parties out</span>
        </button>
      </div>
    </article>
  );
}

function capitalised(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}
