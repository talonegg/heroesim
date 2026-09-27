// The Board with dispatch (M7-S3; the CLI's `show board`, `preview` and `dispatch`): the Quests on
// offer, and for one of them a Party chosen from the Roster with the consumables it carries. What
// the Party would meet is the engine's preview (`previewDispatch`, through `previewView`), shown as
// the choice changes: each requirement met or missed, who cannot go, the Synergies it would have,
// what it would carry, the reward agreed, and dispatch's own verdict. Sending it is a play.

import type { HeroId, ItemDefinitionKey, QuestId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { boardView, consumableChoices, partyChoices, previewView, type QuestCard } from '../state/selectors';

/** Printed under the Board, as the CLI prints it after every dispatch (pre-M0 review D2). */
const rivalsReminder = 'Rivals take Quests from the Board each afternoon: a Quest left on it may be gone by then.';

export function Board({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const cards = useMemo(() => boardView(document), [document]);
  const [open, setOpen] = useState<QuestId | null>(null);
  return (
    <section id="board" className="panel" aria-labelledby="board-heading">
      <h2 id="board-heading" tabIndex={-1}>
        Board
      </h2>
      <p>
        {cards.length === 0 ? 'The Board is empty.' : `${cards.length} ${cards.length === 1 ? 'Quest' : 'Quests'} on offer.`}{' '}
        {rivalsReminder}
      </p>
      <ul className="cards">
        {cards.map((card) => (
          <li key={card.questId}>
            <Quest
              card={card}
              open={open === card.questId}
              onToggle={() => setOpen(open === card.questId ? null : card.questId)}
              document={document}
              busy={busy}
              play={play}
            />
          </li>
        ))}
      </ul>
    </section>
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
    <article className="card" aria-labelledby={headingId}>
      <h3 id={headingId}>{card.name}</h3>
      <p className="subtle">Offered by {card.patron}</p>
      <dl className="terms">
        <Term label="Difficulty" value={card.difficulty} />
        <Term label="Days away" value={card.days} />
        <Term label="Reward" value={`${card.reward} Wealth`} />
        <Term label="Fame" value={card.fame} />
        <Term label="Party" value={card.party} />
        <Term label="Requires" value={card.requires} />
        <Term label="On offer through" value={`Day ${card.lastDay}`} />
        <Term label="Demands" value={card.demands} />
        <Term label="Skills that help" value={card.skillsThatHelp} />
        <Term label="Encounters" value={card.encounters} />
      </dl>
      <div className="actions">
        <button type="button" aria-expanded={open} onClick={onToggle}>
          {open ? 'Close' : 'Choose a Party'}
        </button>
      </div>
      {open ? <Dispatch document={document} questId={card.questId} questName={card.name} busy={busy} play={play} /> : null}
    </article>
  );
}

function Term({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
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
      <fieldset>
        <legend>Consumables</legend>
        {stocks.length === 0 ? <p>The Guild holds no consumables.</p> : null}
        {stocks.map((stock) => (
          <label key={stock.definitionKey} className="field">
            <span>
              {stock.name}, {stock.held} held: {stock.does}
            </span>
            <input
              type="number"
              min={0}
              max={stock.held}
              step={1}
              inputMode="numeric"
              value={carry[stock.definitionKey] ?? 0}
              onChange={(event) => setCarry({ ...carry, [stock.definitionKey]: Number(event.target.value) || 0 })}
            />
          </label>
        ))}
      </fieldset>
      {preview === null ? (
        <p>This Quest is no longer on the Board.</p>
      ) : (
        <div className="preview" aria-label="Preview">
          <h4>Requirements</h4>
          <ul>
            {preview.requirements.map((requirement) => (
              <li key={requirement.words}>
                {requirement.words}: {requirement.met ? 'met' : 'missed'}
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
      <div className="actions">
        <button type="submit" className="button--primary" disabled={busy || preview === null || !preview.verdict.sends}>
          Send the Party
        </button>
      </div>
    </form>
  );
}
