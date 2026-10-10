import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * The content's JSON bundled as data, without the indentation and line breaks it is written with
 * (DL-134 item 9, DL-143): `src/content.ts` takes each file as text, which Vite would bundle as
 * written, about 24 kB of whitespace in an 800 kB script. Only the files of `dir` and of its folders
 * (DL-260) taken `?raw` are read here, and each is parsed, so a file that is not JSON fails the build.
 * What `parseContent` makes of the text is the same either way (`src/content.test.ts`). The content
 * version's file, `dir`'s own `version.json` and no folder's row of that name, is bundled with its
 * changelog empty (DL-186 item 14): the changelog is for the people who read the file, some 5 kB the
 * page never shows.
 */
export function compactContent(dir: string): Plugin {
  const contentDir = path.resolve(dir);
  return {
    name: 'heroesim:compact-content',
    enforce: 'pre',
    async load(id) {
      const [file = '', query] = id.split('?');
      const folder = path.dirname(path.resolve(file));
      if (query !== 'raw' || path.extname(file) !== '.json' || (folder !== contentDir && path.dirname(folder) !== contentDir)) return null;
      const written = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
      const bundled = path.resolve(file) === path.join(contentDir, 'version.json') ? { ...written, changelog: [] } : written;
      return `export default ${JSON.stringify(JSON.stringify(bundled))};`;
    },
  };
}
