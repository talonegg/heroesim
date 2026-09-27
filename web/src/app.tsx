// A placeholder app (M7-S1): it proves the page mounts and the bundled content set loads. It holds
// the game's state through the one reducer (M7-S2), so the engine the reducer calls is bundled and
// the bundle gate covers it; the views that play it arrive in M7-S3.

import { content } from './content';
import { useGame } from './state/reducer';

export function App() {
  const [game] = useGame();
  return (
    <main aria-busy={game.busy}>
      <h1>Heroesim</h1>
      <p>
        Content set {content.id}, version {content.version}, loaded.
      </p>
    </main>
  );
}
