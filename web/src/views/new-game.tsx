// A new game (the CLI's `new`, M7-S3): the Guild's name, a Guild Background or one drawn from the
// seed, the Guildmaster's name, and the seed, a readable one made up unless the player types
// another. The page supplies the seed and the clock; the engine checks the setup and makes the
// world (M7-S2, DL-65; M9-S2, DL-102). A save file can be loaded instead (the CLI's `load`, DL-73),
// or a game saved in this browser, which is how one comes back after the page is closed or reloaded
// (DL-67). With a game in hand, the CLI replaces a save only with `--force`; here the player asked
// for this form, and it says the game in hand goes unless exported, with a way back to it.
//
// The Guildmaster's setup (M9-S7, #30; the CLI's `new` flags, DL-102 item 10) sits behind "Your
// Guildmaster", closed: an optional sex and age, a Portrait (v1.1.2-S4), the Traits chosen within the
// Trait budget, and the Birthplace, Appearance and Biography. The sex, the age, the Portrait and the
// Traits are each drawn from the seed when left unset, and the form shows what the seed draws, as it
// follows the Seed field. Each Trait says what it does, what it costs and what it excludes, and how it
// stands against those chosen; the budget left moves as the player picks. Every number, bound,
// judgement, draw and text written comes from `state/setup.ts`, the engine's own check
// (`setupRefusal`), sum, preview (`previewGuildmaster`) and writing (`describeGuildmaster`): nothing
// here computes a rule. A setup the engine would refuse cannot be started, and its sentence stands beside the
// button, once a field has been touched; before that, a hint asks for the names (DL-109 item 2, Q22).
//
// The Portrait (DL-125 item 3): "Drawn from the seed", then a thumbnail of each Guildmaster picture of
// the sex, each a radio button with its picture as its label. Since v1.1.3-S7 it is a grid of one sex's
// thumbnails at a time (DL-134 item 9, DL-143: both sexes' are more than the 250 kB the grid may read):
// the Sex field's, or with the sex drawn the one the seed draws, with Female and Male to show the other.
// Choosing a picture with the sex drawn chooses its sex, which the Sex field shows, until the Portrait is
// drawn again; changing the sex clears a Portrait of another. "Drawn from the seed" shows the picture the
// seed chooses, and the engine's `portraitFit` notes a picture chosen that looks older or younger than the
// age, or whose Calling clashes with a Trait, beside the choice and never as a refusal.
//
// The Birthplace, Appearance and Biography (v1.1.2-S5, DL-125 item 6): "Write them for me" fills the
// three fields for the Guildmaster the form makes, their sex and age chosen or drawn, the Background
// and the Traits, and "Again" writes them anew; the fields stay the player's to edit, and what they
// hold at "Start the game" is what is kept. With the seed blank, the button makes one up first, as the
// click would, and puts it in the Seed field. A field left blank is written by the engine when the
// game starts, as every Guildmaster's is. Since v1.1.2-S6 the buttons write only the fields left blank
// or still as written, keeping the player's words; and a field still as written follows the Guildmaster
// when the sex, the age, the Portrait, the Traits, the Background or the seed changes, so "Start the
// game" never sends texts for another. The Birthplace typed is the Biography's, so a Biography still as
// written follows it too. A field the player changed is kept, and the note says when it was written for
// another Guildmaster (`state/setup.ts`'s `textsView`).

import type { DescriptiveAttribute, PortraitKey, Sex, TraitKey } from '@heroesim/engine';
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Saves } from '../saves';
import { readableSeed } from '../seed';
import type { GameAction, NewGame as NewGamePlay, PlayRejection } from '../state/reducer';
import { guildBackgrounds } from '../state/selectors';
import {
  givenTexts,
  guildmasterPreview,
  guildmasterPreviewView,
  noTexts,
  portraitFitWords,
  portraitGrid,
  portraitPick,
  setupFormChoices,
  setupNotice,
  textsView,
  textsWritten,
  textTyped,
  traitPicksView,
  writtenDescription,
  type PortraitPick,
  type TextsHeld,
  type TraitPick,
} from '../state/setup';
import { LoadSave } from './game-file';
import { Icon } from './icons';
import { Portrait, PortraitThumbnail } from './pictures';
import { SavedGames } from './saved-games';
import { View } from './section';
import { Chip, Disclosure } from './ui';

const backgrounds = guildBackgrounds();
const choices = setupFormChoices();

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
  rejection = null,
}: {
  saves: Saves;
  busy: boolean;
  play: (action: GameAction) => void;
  onCancel?: () => void;
  /** The last play refused, for the saves listed to say why one did not load beside it (v1.1.2-S3). */
  rejection?: PlayRejection | null;
}) {
  const [guildName, setGuildName] = useState('');
  const [guildmasterName, setGuildmasterName] = useState('');
  const [backgroundKey, setBackgroundKey] = useState('');
  const [seed, setSeed] = useState(() => readableSeed(Math.random));
  const [sex, setSex] = useState<Sex | ''>('');
  // A Guildmaster picture of the sex, or `''` while drawn from the seed.
  const [portraitKey, setPortraitKey] = useState<PortraitKey | ''>('');
  // Whether the sex is the Portrait's, chosen with it while the sex was drawn, rather than the Sex field's own.
  const [sexOfPortrait, setSexOfPortrait] = useState(false);
  // The sex whose pictures the player asked to see while the sex is drawn, or `null` (v1.1.3-S7).
  const [lookAt, setLookAt] = useState<Sex | null>(null);
  const [age, setAge] = useState('');
  // The Traits drawn from the seed, or chosen: `null` while drawn, and none chosen is a choice.
  const [traitKeys, setTraitKeys] = useState<readonly TraitKey[] | null>(null);
  const [kept, setKept] = useState<readonly TraitKey[]>([]);
  // How many times the texts have been written, and those the player typed (v1.1.2-S6).
  const [held, setHeld] = useState<TextsHeld>(noTexts);
  // Whether any field has been changed: until then, the form gives a hint, not a refusal.
  const [touched, setTouched] = useState(false);
  const noticeId = useId();

  // The engine's Guildmaster for the facts chosen and the seed, asked once for the preview and the texts
  // (v1.1.2-S6). It reads neither name nor any text, so typing them asks nothing again.
  const facts = useMemo(
    () => ({
      guildName: '',
      guildmasterName: '',
      ...(backgroundKey === '' ? {} : { backgroundKey }),
      ...(sex === '' ? {} : { guildmasterSex: sex }),
      ...(portraitKey === '' ? {} : { guildmasterPortraitKey: portraitKey }),
      ...(age === '' ? {} : { guildmasterAge: Number(age) }),
      ...(traitKeys === null ? {} : { guildmasterTraitKeys: traitKeys }),
    }),
    [backgroundKey, sex, portraitKey, age, traitKeys],
  );
  const previewed = useMemo(() => guildmasterPreview(facts, seed), [facts, seed]);
  // What the seed draws, in words, and whether there is a Guildmaster to write for.
  const preview = useMemo(() => guildmasterPreviewView(previewed, seed), [previewed, seed]);
  const writable = previewed !== null;
  // The texts written for that Guildmaster, and what the three fields show and send.
  // The Birthplace typed is the Biography's too (v1.1.2-S6), so a Biography still as written follows it.
  const place = givenTexts(held).birthplace;
  const written = useMemo(
    () => (held.n === null ? null : writtenDescription(previewed, seed, held.n, place === undefined ? {} : { birthplace: place })),
    [previewed, seed, held.n, place],
  );
  const texts = useMemo(() => textsView(held, written), [held, written]);

  /** The play the form would make now, less its seed and its clock, which the click supplies. */
  const setup = useMemo(() => {
    const given = Object.fromEntries(
      (Object.keys(textFields) as DescriptiveAttribute[]).filter((key) => texts.values[key] !== '').map((key) => [textFields[key], texts.values[key]]),
    );
    return {
      guildName,
      guildmasterName,
      ...(backgroundKey === '' ? {} : { backgroundKey }),
      ...(sex === '' ? {} : { guildmasterSex: sex }),
      ...(portraitKey === '' ? {} : { guildmasterPortraitKey: portraitKey }),
      ...(age === '' ? {} : { guildmasterAge: Number(age) }),
      ...(traitKeys === null ? {} : { guildmasterTraitKeys: traitKeys }),
      ...given,
    };
  }, [guildName, guildmasterName, backgroundKey, sex, portraitKey, age, traitKeys, texts]);
  const notice = useMemo(() => setupNotice({ kind: 'newGame', seed: '', createdAt: '', ...setup }, touched), [setup, touched]);
  const picks = useMemo(() => (traitKeys === null ? null : traitPicksView(traitKeys)), [traitKeys]);
  // The setup grid (v1.1.3-S7): one sex's pictures at a time, "Drawn from the seed" showing the seed's,
  // and the engine's notes on a picture chosen. Neither name nor any text is read, so typing asks nothing.
  const fieldSex = sex === '' || sexOfPortrait ? null : sex;
  const grid = useMemo(() => portraitGrid(facts, seed, { fieldSex, lookAt }), [facts, seed, fieldSex, lookAt]);
  const fitNotes = useMemo(() => portraitFitWords(facts, seed), [facts, seed]);

  function start(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    play({
      kind: 'newGame',
      seed: seed.trim() === '' ? readableSeed(Math.random) : seed.trim(),
      ...setup,
      createdAt: new Date().toISOString(),
    });
  }

  /** A sex chosen, or drawn: a Portrait of another sex, or any with the sex drawn, is cleared. */
  function chooseSex(next: Sex | ''): void {
    setSex(next);
    setSexOfPortrait(false);
    setLookAt(null);
    if (portraitKey !== '' && portraitPick(portraitKey)?.sex !== next) setPortraitKey('');
  }

  /**
   * A picture chosen. With the sex drawn it chooses its sex (DL-130 item 5), which the Sex field then
   * shows, while the other sex's pictures can still be shown and chosen.
   */
  function choosePortrait(pick: PortraitPick): void {
    setPortraitKey(pick.key);
    if (sex === '' || sexOfPortrait) {
      setSex(pick.sex);
      setSexOfPortrait(true);
    }
  }

  /** The Portrait drawn from the seed again; a sex that was only the Portrait's is drawn again with it. */
  function drawPortrait(): void {
    setPortraitKey('');
    if (sexOfPortrait) {
      setSex('');
      setSexOfPortrait(false);
    }
  }

  /**
   * The fields left blank or still as written, written for the Guildmaster the form makes (v1.1.2-S5,
   * v1.1.2-S6): `n` 0 for "Write them for me", one more for each "Again"; the player's words are kept.
   * With the seed blank, one is made up first and shown in its field.
   */
  function write(n: number): void {
    if (seed.trim() === '') setSeed(readableSeed(Math.random));
    setHeld(textsWritten(held, n));
  }

  /** A field typed in: the player's words, or the writing again when typed back to it (v1.1.2-S6). */
  function type(attribute: DescriptiveAttribute, text: string): void {
    setHeld(textTyped(held, attribute, text, written));
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
              <span className="disclosure__hint">Sex, Age, Portrait and Traits, or drawn from the seed, and a few words about them</span>
            </>
          }
        >
          <div className="setup">
            <div className="setup__pair">
              <Field label="Sex">
                {(id) => (
                  <select id={id} name="guildmasterSex" value={sex} onChange={(event) => chooseSex(event.target.value as Sex | '')}>
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

            {/* A polite live region that is always there, so the preview is heard when it first comes
                as well as when it changes (v1.1.2-S6). */}
            <div aria-live="polite" data-testid="guildmaster-preview-live">
              {preview === null ? null : preview.kind === 'unseeded' ? (
                <p className="note setup-preview" data-testid="guildmaster-preview">
                  {preview.words}
                </p>
              ) : (
                <div className="setup-preview" data-testid="guildmaster-preview">
                  {preview.portrait === null ? null : (
                    <Portrait
                      role="guildmaster"
                      sex={preview.portrait.sex}
                      portraitKey={preview.portrait.portraitKey}
                      name={guildmasterName.trim() === '' ? 'your Guildmaster' : guildmasterName.trim()}
                      thumbnail
                    />
                  )}
                  <div className="setup-preview__words">
                    {preview.drawnWords === null ? null : <p>{preview.drawnWords}</p>}
                    {preview.traitsWords === null ? null : <p>{preview.traitsWords}</p>}
                    {preview.portrait === null ? null : <p>{preview.portrait.words}</p>}
                  </div>
                </div>
              )}
            </div>

            <fieldset className="setup__portraits">
              <legend>Portrait</legend>
              {grid.sexes === null ? null : (
                <div className="portrait-sexes" role="group" aria-label="Pictures shown">
                  {grid.sexes.map((each) => (
                    <button
                      key={each.sex}
                      type="button"
                      className="button--quiet"
                      aria-pressed={each.shown}
                      onClick={() => setLookAt(each.sex)}
                    >
                      {each.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="portrait-picks">
                <label className="choice portrait-pick portrait-pick--drawn">
                  <input type="radio" name="guildmasterPortrait" value="" checked={portraitKey === ''} onChange={drawPortrait} />
                  <PortraitThumbnail
                    sex={grid.drawn?.sex ?? grid.sex}
                    portraitKey={grid.drawn?.portraitKey ?? null}
                    label="Drawn from the seed"
                    labelShown
                  />
                </label>
                {[...(grid.chosen === null ? [] : [grid.chosen]), ...grid.pictures].map((pick) => (
                  <label key={pick.key} className="choice portrait-pick">
                    <input
                      type="radio"
                      name="guildmasterPortrait"
                      value={pick.key}
                      checked={portraitKey === pick.key}
                      onChange={() => choosePortrait(pick)}
                    />
                    <PortraitThumbnail sex={pick.sex} portraitKey={pick.key} label={pick.label} />
                  </label>
                ))}
              </div>
              {/* The engine's notes on the picture chosen, beside it and never a refusal (DL-134 item 7). */}
              <div aria-live="polite" data-testid="portrait-notes-live">
                {fitNotes.length === 0 ? null : (
                  <ul className="portrait-notes" data-testid="portrait-notes">
                    {fitNotes.map((words) => (
                      <li key={words} className="note">
                        <Icon name="about" />
                        <span>{words}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </fieldset>

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

            <div className="setup__write">
              <p className="note">A few words about your Guildmaster. Any left blank are written when the game starts.</p>
              <div className="actions">
                <button type="button" disabled={!writable} onClick={() => write(0)}>
                  Write them for me
                </button>
                {held.n === null ? null : (
                  <button type="button" className="button--quiet" disabled={!writable} onClick={() => write((held.n ?? 0) + 1)}>
                    Again
                  </button>
                )}
              </div>
              <p className="note" data-testid="written-for" aria-live="polite">
                {texts.words}
              </p>
            </div>

            {choices.attributes.map(({ attribute, label, boundWords }) => (
              <Field key={attribute} label={label} hint={boundWords}>
                {(id, described) =>
                  attribute === 'birthplace' ? (
                    <input
                      id={id}
                      type="text"
                      name={textFields[attribute]}
                      value={texts.values[attribute]}
                      aria-describedby={described}
                      onChange={(event) => type(attribute, event.target.value)}
                    />
                  ) : (
                    <textarea
                      id={id}
                      name={textFields[attribute]}
                      value={texts.values[attribute]}
                      rows={attribute === 'biography' ? 7 : 4}
                      aria-describedby={described}
                      onChange={(event) => type(attribute, event.target.value)}
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
      <SavedGames saves={saves} document={null} busy={busy} play={play} rejection={rejection} level={3} />
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
