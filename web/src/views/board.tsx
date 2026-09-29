// The Board with dispatch (M7-S3; the CLI's `show board`, `preview` and `dispatch`): the Quests on
// offer, and for one of them a Party chosen from the Roster with the consumables it carries. What
// the Party would meet is the engine's preview (`previewDispatch`, through `previewView`), shown as
// the choice changes: each requirement met or missed, who cannot go, the Synergies it would have,
// what it would carry, the reward agreed, and dispatch's own verdict. Sending it is a play.
//
// A view of the shell (M9-S3, DL-103). Which Quest's Party is open is the shell's, so the home
// view's Quest buttons open one; the cards' redesign and the Party builder are M9-S4's.

import type { HeroId, ItemDefinitionKey, QuestId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { boardView, consumableChoices, partyChoices, previewView, type QuestCard } from '../state/selectors';
import { Icon } from './icons';
import { View } from './section';
import { Stepper } from './ui';

export function Board({
  document,
  busy,
  play,
  open,
  onOpen,
}: {
  document: WorldDocument;
  busy: boolean;
  play: (action: GameAction) => void;
  /** The Quest whose Party is being chosen, or none. */
  open: QuestId | null;
  onOpen: (questId: QuestId | null) => void;
}) {
  const cards = useMemo(() => boardView(document), [document]);
  return (
    <View id="board">
      <p className="view__lead">{cards.length === 0 ? 'The Board is empty.' : `${cards.length} ${cards.length === 1 ? 'Quest' : 'Quests'} on offer.`}</p>
      <ul className="cards">
        {cards.map((card) => (
          <li key={card.questId}>
            <Quest
              card={card}
              open={open === card.questId}
              onToggle={() => onOpen(open === card.questId ? null : card.questId)}
              document={document}
              busy={busy}
              play={play}
            />
          </li>
        ))}
      </ul>
    </View>
  );
}

function Quest({
  card,
  open,
  onToggle,
  document,
  busy,
  play,
}: {
  card: QuestCard;
  open: boolean;
  onToggle: () => void;
  document: WorldDocument;
  busy: boolean;
  play: (action: GameAction) => void;
}) {
  const headingId = `quest-${card.questId}`;
  return (
    <article className={open ? 'card quest is-open' : 'card quest'} aria-labelledby={headingId}>
      <div className="card__head">
        <h3 id={headingId} tabIndex={-1}>
          {card.name}
        </h3>
        <p className="subtle">Offered by {card.patron}</p>
      </div>
      <dl className="terms">
        <Term label="Difficulty" value={card.difficulty} />
        <Term label="Days away" value={card.days} />
        <Term label="Reward" value={`${card.reward} Wealth`} />
        <Term label="Fame" value={card.fame} />
        <Term label="Party" value={card.party} />
        <Term label="Requires" value={card.requires} />
        <Term label="On offer through" value={`Day ${card.lastDay}`} />
        <Term label="Demands" value={card.demands} wide />
        <Term label="Skills that help" value={card.skillsThatHelp} wide />
        <Term label="Encounters" value={card.encounters} wide />
      </dl>
      <div className="actions">
        <button type="button" className={open ? 'button--quiet' : undefined} aria-expanded={open} onClick={onToggle}>
          {open ? <Icon name="close" /> : <Icon name="roster" />}
          <span>{open ? 'Close' : 'Choose a Party'}</span>
        </button>
      </div>
      {open ? <Dispatch document={document} questId={card.questId} questName={card.name} busy={busy} play={play} /> : null}
    </article>
  );
}

function Term({ label, value, wide = false }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={wide ? 'is-wide' : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Dispatch({
  document,
  questId,
  questName,
  busy,
  play,
}: {
  document: WorldDocument;
  questId: QuestId;
  questName: string;
  busy: boolean;
  play: (action: GameAction) => void;
}) {
  const heroes = useMemo(() => partyChoices(document), [document]);
  const stocks = useMemo(() => consumableChoices(document), [document]);
  const [chosen, setChosen] = useState<readonly HeroId[]>([]);
  const [carry, setCarry] = useState<Readonly<Record<ItemDefinitionKey, number>>>({});

  // Only Heroes who can still go, and no more of a consumable than the Guild holds now.
  const party = chosen.filter((heroId) => heroes.some((hero) => hero.heroId === heroId && hero.unavailable === null));
  const consumables = stocks.flatMap(({ definitionKey, held }) => {
    const quantity = Math.min(Math.max(0, Math.floor(carry[definitionKey] ?? 0)), held);
    return quantity > 0 ? [{ definitionKey, quantity }] : [];
  });
  const preview = previewView(document, questId, party, consumables);

  function toggle(heroId: HeroId, on: boolean): void {
    setChosen(on ? [...chosen.filter((id) => id !== heroId), heroId] : chosen.filter((id) => id !== heroId));
  }

  return (
    <form
      className="dispatch"
      aria-label={`A Party for ${questName}`}
      onSubmit={(event) => {
        event.preventDefault();
        play({ kind: 'dispatch', questId, heroIds: [...party], consumables });
      }}
    >
      <fieldset>
        <legend>Heroes</legend>
        {heroes.length === 0 ? <p>The Roster is empty.</p> : null}
        {heroes.map((hero) => (
          <label key={hero.heroId} className="choice">
            <input
              type="checkbox"
              checked={party.includes(hero.heroId)}
              disabled={hero.unavailable !== null}
              onChange={(event) => toggle(hero.heroId, event.target.checked)}
            />
            <span>
              {hero.name}, {hero.summary}
              {hero.unavailable === null ? '' : `: ${hero.unavailable}`}
            </span>
          </label>
        ))}
      </fieldset>
      {/* No consumables held, no fieldset: an empty list is not drawn (M9-S3, the review's A5). */}
      {stocks.length === 0 ? null : (
        <fieldset>
          <legend>Consumables</legend>
          {stocks.map((stock) => (
            <Stepper
              key={stock.definitionKey}
              label={`${stock.name}, ${stock.held} held: ${stock.does}`}
              value={carry[stock.definitionKey] ?? 0}
              min={0}
              max={stock.held}
              onChange={(value) => setCarry({ ...carry, [stock.definitionKey]: Number.isFinite(value) ? value : 0 })}
            />
          ))}
        </fieldset>
      )}
      {preview === null ? (
        <p>This Quest is no longer on the Board.</p>
      ) : (
        <div className="preview" aria-label="Preview">
          <h4>Requirements</h4>
          <ul className="marks">
            {preview.requirements.map((requirement) => (
              <li key={requirement.words} className={requirement.met ? 'is-met' : 'is-missed'}>
                <Icon name={requirement.met ? 'check' : 'cross'} />
                <span>
                  {requirement.words}: {requirement.met ? 'met' : 'missed'}
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
          <p className={preview.verdict.sends ? 'verdict' : 'verdict verdict--refused'} role="status">
            {preview.verdict.words}
          </p>
        </div>
      )}
      <div className="actions actions--send">
        <button type="submit" className="button--primary" disabled={busy || preview === null || !preview.verdict.sends}>
          Send the Party
        </button>
      </div>
    </form>
  );
}
