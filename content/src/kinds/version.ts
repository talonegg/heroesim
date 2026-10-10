// The content version (DL-186 item 14; `version.json`), raised whenever the content changes, so a
// document says which content it was created under: `version`, beside its `changelog`, a sentence for
// each raise saying why (`<n> from <what raised it>.`). The tools raise it through
// `@heroesim/content/write`; nothing else writes it.

import { RowReader, type KindReader } from './read.js';

export const versionKind: KindReader<'version', number> = {
  key: 'version',
  file: 'version.json',
  read(json, problems) {
    if (json === undefined) return 0;
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      problems.push('version.json: must be an object of the version and its changelog');
      return 0;
    }
    const top = new RowReader('version.json', [], json as Record<string, unknown>, problems);
    const version = top.integer('version');
    if (Number.isInteger((json as Record<string, unknown>).version) && version < 1) {
      problems.push(`version.json: version is ${version}; expected a whole number of at least 1`);
    }
    top.strings('changelog');
    top.refuseUnknown('the content version');
    return version;
  },
  holds: [],
};
