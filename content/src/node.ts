import { PACKAGE_NAME } from './index.js';

/**
 * Node-only content loader. Placeholder: reads nothing from disk yet.
 * The pure entry point (`.`) stays free of `node:fs` so it can be imported
 * from the browser; this entry point (`./node`) is where that wiring lands.
 */
export function loadContentFromDisk(): { readonly package: string } {
  return { package: PACKAGE_NAME };
}
