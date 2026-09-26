// A placeholder app (M7-S1): it proves the page mounts and the bundled content set loads. The
// views and the reducer arrive in M7-S2 and M7-S3.

import { content } from './content';

export function App() {
  return (
    <main>
      <h1>Heroesim</h1>
      <p>
        Content set {content.id}, version {content.version}, loaded.
      </p>
    </main>
  );
}
