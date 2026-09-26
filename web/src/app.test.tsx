import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { App } from './app';

afterEach(cleanup);

test('the placeholder app renders with the content set it loaded', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: 'Heroesim' })).toBeDefined();
  expect(screen.getByText(/^Content set core, version \d+, loaded\.$/)).toBeDefined();
});
