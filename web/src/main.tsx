import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <h1>Heroesim</h1>;
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
