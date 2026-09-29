// A new game (the CLI's `new`, M7-S3): the Guild's name, a Guild Background or one drawn from the
// seed, the Guildmaster's name, and the seed, a readable one made up unless the player types
// another. The page supplies the seed and the clock; the engine checks the setup and makes the
// world (M7-S2, DL-65; M9-S2, DL-102). A save file can be loaded instead (the CLI's `load`, DL-73),
// or a game saved in this browser, which is how one comes back after the page is closed or reloaded
// (DL-67). With a game in hand, the CLI replaces a save only with `--force`; here the player asked
// for this form, and it says the game in hand goes unless exported, with a way back to it.
//
// The Guildmaster's setup (M9-S7, #30; the CLI's `new` flags, DL-102 item 10) sits behind "Your
// Guildmaster", closed: an optional sex and age, the Traits drawn from the seed or chosen within
// the Trait budget, and the Birthplace, Appearance and Biography, anything left unset drawn from the
// seed. Each Trait says what it does, what it costs and what it excludes, and how it stands against
// those chosen; the budget left moves as the player picks. Every number, bound and judgement comes
// from `state/setup.ts`, the engine's own check (`setupRefusal`) and sum: nothing here computes a
// rule. A setup the engine would refuse cannot be started, and its sentence stands beside the button,
// once a field has been touched; before that, a hint asks for the names (DL-109 item 2, Q22).

import type { DescriptiveAttribute, Sex, TraitKey } from '@heroesim/engine';
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Saves } from '../saves';
import { readableSeed } from '../seed';
import type { GameAction, NewGame as NewGamePlay } from '../state/reducer';
import { guildBackgrounds } from '../state/selectors';
import { setupFormChoices, setupNotice, traitPicksView, type TraitPick } from '../state/setup';
import { LoadSave } from './game-file';
import { Icon } from './icons';
import { SavedGames } from './saved-games';
import { View } from './section';
import { Chip, Disclosure } from './ui';

const backgrounds = guildBackgrounds();
const choices = setupFormChoices();

type Texts = Readonly<Record<DescriptiveAttribute, string>>;

/** The field of a new game that holds each descriptive Attribute. */
const textFields = {
  birthplace: 'guildmasterBirthplace',
  appearance: 'guildmasterAppearance',
  biography: 'guildmasterBiography',
} as const satisfies Record<DescriptiveAttribute, keyof NewGamePlay>;

export function NewGame({
  saves,
  busy,
  play,
  onCancel,
}: {
  saves: Saves;
  busy: boolean;
  play: (action: GameAction) => void;
  onCancel?: () => void;
}) {
  const [guildName, setGuildName] = useState('');
  const [guildmasterName, setGuildmasterName] = useState('');
  const [backgroundKey, setBackgroundKey] = useState('');
  const [seed, setSeed] = useState(() => readableSeed(Math.random));
  const [sex, setSex] = useState<Sex | ''>('');
  const [age, setAge] = useState('');
  // The Traits drawn from the seed, or chosen: `null` while drawn, and none chosen is a choice.
  const [traitKeys, setTraitKeys] = useState<readonly TraitKey[] | null>(null);
  const [kept, setKept] = useState<readonly TraitKey[]>([]);
  const [texts, setTexts] = useState<Texts>({ birthplace: '', appearance: '', biography: '' });
  // Whether any field has been changed: until then, the form gives a hint, not a refusal.
  const [touched, setTouched] = useState(false);
  const noticeId = useId();

  /** The play the form would make now, less its seed and its clock, which the click supplies. */
  const setup = useMemo(() => {
    const written = Object.fromEntries(
      (Object.keys(textFields) as DescriptiveAttribute[]).filter((key) => texts[key] !== '').map((key) => [textFields[key], texts[key]]),
    );
    return {
      guildName,
      guildmasterName,
      ...(backgroundKey === '' ? {} : { backgroundKey }),
      ...(sex === '' ? {} : { guildmasterSex: sex }),
      ...(age === '' ? {} : { guildmasterAge: Number(age) }),
      ...(traitKeys === null ? {} : { guildmasterTraitKeys: traitKeys }),
      ...written,
    };
  }, [guildName, guildmasterName, backgroundKey, sex, age, traitKeys, texts]);
  const notice = useMemo(() => setupNotice({ kind: 'newGame', seed: '', createdAt: '', ...setup }, touched), [setup, touched]);
  const picks = useMemo(() => (traitKeys === null ? null : traitPicksView(traitKeys)), [traitKeys]);

  function start(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    play({
      kind: 'newGame',
      seed: seed.trim() === '' ? readableSeed(Math.random) : seed.trim(),
      ...setup,
      createdAt: new Date().toISOString(),
    });
  }

  function toggle(key: TraitKey): void {
    if (traitKeys === null) return;
    const next = traitKeys.includes(key) ? traitKeys.filter((each) => each !== key) : [...traitKeys, key];
    setTraitKeys(next);
    setKept(next);
  }

  return (
    <View id="new-game">
      {onCancel === undefined ? null : <p className="warning">The game in hand is lost unless you export it first.</p>}
      <form className="form" onSubmit={start} onChange={() => setTouched(true)}>
        <label className="field">
          <span>Guild name</span>
          <input type="text" name="guildName" value={guildName} onChange={(event) => setGuildName(event.target.value)} required />
        </label>
        <label className="field">
          <span>Background</span>
          <select name="backgroundKey" value={backgroundKey} onChange={(event) => setBackgroundKey(event.target.value)}>
            <option value="">Drawn from the seed</option>
            {backgrounds.map(({ key, name }) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Guildmaster&rsquo;s name</span>
          <input
            type="text"
            name="guildmasterName"
            value={guildmasterName}
            onChange={(event) => setGuildmasterName(event.target.value)}
            required
          />
        </label>

        <Disclosure
          summary={
            <>
              <span className="disclosure__title">Your Guildmaster</span>{' '}
              <span className="disclosure__hint">Sex, age, Traits and a few words about them, or all drawn from the seed</span>
            </>
          }
        >
          <div className="setup">
            <div className="setup__pair">
              <Field label="Sex">
                {(id) => (
                  <select id={id} name="guildmasterSex" value={sex} onChange={(event) => setSex(event.target.value as Sex | '')}>
                    <option value="">Drawn from the seed</option>
                    {choices.sexes.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Age" hint={`Years, ${choices.agesWords}. ${choices.retiresWords}.`}>
                {(id, described) => (
                  <select id={id} name="guildmasterAge" value={age} aria-describedby={described} onChange={(event) => setAge(event.target.value)}>
                    <option value="">Drawn from the seed</option>
                    {choices.ages.map((years) => (
                      <option key={years} value={String(years)}>
                        {years}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <fieldset className="setup__traits">
              <legend>Traits</legend>
              <div className="setup__how">
                <label className="choice">
                  <input type="radio" name="traitsHow" checked={traitKeys === null} onChange={() => setTraitKeys(null)} />
                  <span>Drawn from the seed</span>
                </label>
                <label className="choice">
                  <input type="radio" name="traitsHow" checked={traitKeys !== null} onChange={() => setTraitKeys(kept)} />
                  <span>Choose them</span>
                </label>
              </div>
              {picks === null ? null : (
                <>
                  <p className="note">{choices.traitsWords}</p>
                  <div className="budget" data-testid="trait-budget" aria-live="polite">
                    <Chip tone={picks.budget.over ? 'bad' : 'brass'} icon={picks.budget.over ? 'alert' : 'check'}>
                      {picks.budget.leftWords}
                    </Chip>
                    <span className="subtle">{picks.budget.costWords}</span>
                  </div>
                  <ul className="trait-picks" aria-label="Guildmaster Traits">
                    {picks.traits.map((pick) => (
                      <TraitRow key={pick.key} pick={pick} onToggle={() => toggle(pick.key)} />
                    ))}
                  </ul>
                </>
              )}
            </fieldset>

            {choices.attributes.map(({ attribute, label, boundWords }) => (
              <Field key={attribute} label={label} hint={boundWords}>
                {(id, described) =>
                  attribute === 'birthplace' ? (
                    <input
                      id={id}
                      type="text"
                      name={textFields[attribute]}
                      value={texts[attribute]}
                      aria-describedby={described}
                      onChange={(event) => setTexts({ ...texts, [attribute]: event.target.value })}
                    />
                  ) : (
                    <textarea
                      id={id}
                      name={textFields[attribute]}
                      value={texts[attribute]}
                      rows={attribute === 'biography' ? 4 : 2}
                      aria-describedby={described}
                      onChange={(event) => setTexts({ ...texts, [attribute]: event.target.value })}
                    />
                  )
                }
              </Field>
            ))}
          </div>
        </Disclosure>

        <label className="field">
          <span>Seed</span>
          <input type="text" name="seed" value={seed} onChange={(event) => setSeed(event.target.value)} />
        </label>
        {notice === null ? null : (
          <p
            className={notice.kind === 'hint' ? 'form__hint' : 'form__refusal'}
            id={noticeId}
            data-testid={notice.kind === 'hint' ? 'setup-hint' : 'setup-refusal'}
            aria-live="polite"
          >
            <Icon name={notice.kind === 'hint' ? 'about' : 'alert'} />
            <span>{notice.words}</span>
          </p>
        )}
        <div className="actions">
          <button
            type="submit"
            className="button--primary"
            disabled={busy || notice !== null}
            aria-describedby={notice === null ? undefined : noticeId}
          >
            Start the game
          </button>
          {onCancel === undefined ? null : (
            <button type="button" className="button--quiet" onClick={onCancel}>
              Back to the game in hand
            </button>
          )}
        </div>
      </form>
      <SavedGames saves={saves} document={null} busy={busy} play={play} level={3} />
      <LoadSave saves={saves} busy={busy} play={play} />
    </View>
  );
}

/**
 * A field whose label names its control alone, as a label around a list would not (its options are
 * read into its name), with a hint under it that describes the control.
 */
function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string, described?: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={`${id}-control`}>{label}</label>
      {children(`${id}-control`, hint === undefined ? undefined : `${id}-hint`)}
      {hint === undefined ? null : (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}

/** A Guildmaster Trait: its box and name with its cost, then what it does and excludes, and how it stands. */
function TraitRow({ pick, onToggle }: { pick: TraitPick; onToggle: () => void }) {
  const id = useId();
  return (
    <li className={`trait-pick trait-pick--${pick.standing}`}>
      <label className="choice trait-pick__choice">
        <input type="checkbox" checked={pick.chosen} disabled={!pick.choosable} aria-describedby={`${id}-does ${id}-stands`} onChange={onToggle} />
        <span className="trait-pick__name">{pick.name}</span>{' '}
        <span className="trait-pick__cost">{pick.costWords}</span>
      </label>
      <p className="trait-pick__does" id={`${id}-does`}>
        {pick.effect}
        {pick.excludesWords === null ? null : <span className="subtle"> · {pick.excludesWords}</span>}
      </p>
      <p className="trait-pick__stands" id={`${id}-stands`}>
        {pick.reason === null ? null : (
          <>
            <Icon name={pick.choosable ? 'alert' : 'cross'} />
            <span>{pick.reason}</span>
          </>
        )}
      </p>
    </li>
  );
}
