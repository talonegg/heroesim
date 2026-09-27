// A new game (the CLI's `new`, M7-S3): the Guild's name, the Guildmaster's, a Guild Background or
// one drawn from the seed, and the seed, a readable one made up unless the player types another.
// The page supplies the seed and the clock; the reducer checks the names and the engine makes the
// world (M7-S2, DL-65). A save file can be loaded instead (the CLI's `load`, DL-73). With a game in
// hand, the CLI replaces a save only with `--force`; here the player asked for this section, and it
// says the game in hand goes unless exported, with a way back to it.

import { useState, type FormEvent } from 'react';
import { readableSeed } from '../seed';
import type { GameAction } from '../state/reducer';
import { guildBackgrounds } from '../state/selectors';
import { LoadSave } from './game-file';
import { Section } from './section';

const backgrounds = guildBackgrounds();

export function NewGame({ busy, play, onCancel }: { busy: boolean; play: (action: GameAction) => void; onCancel?: () => void }) {
  const [guildName, setGuildName] = useState('');
  const [guildmasterName, setGuildmasterName] = useState('');
  const [backgroundKey, setBackgroundKey] = useState('');
  const [seed, setSeed] = useState(() => readableSeed(Math.random));

  function start(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    play({
      kind: 'newGame',
      seed: seed.trim() === '' ? readableSeed(Math.random) : seed.trim(),
      guildName,
      guildmasterName,
      ...(backgroundKey === '' ? {} : { backgroundKey }),
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <Section
      id="new-game"
      title="A new game"
      help={
        'Found a Guild, name its Guildmaster, and take Quests from the Board. The seed makes the world: the same seed and ' +
        'the same choices make the same game. Or load a save file, the CLI’s or one exported here.'
      }
    >
      {onCancel === undefined ? null : <p className="warning">The game in hand is lost unless you export it first.</p>}
      <form className="form" onSubmit={start}>
        <label className="field">
          <span>Guild name</span>
          <input type="text" name="guildName" value={guildName} onChange={(event) => setGuildName(event.target.value)} required />
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
          <span>Seed</span>
          <input type="text" name="seed" value={seed} onChange={(event) => setSeed(event.target.value)} />
        </label>
        <div className="actions">
          <button type="submit" className="button--primary" disabled={busy}>
            Start the game
          </button>
          {onCancel === undefined ? null : (
            <button type="button" onClick={onCancel}>
              Back to the game in hand
            </button>
          )}
        </div>
      </form>
      <LoadSave busy={busy} play={play} />
    </Section>
  );
}
