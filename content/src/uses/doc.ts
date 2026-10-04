// `docs/agents/traits.md`'s generated part (v1.1.4-S12, DL-150 item 14): the register, written out
// for the Trait skills and the people who read them. The rest of the file, the guardrails, is
// written by hand. `npm run edit -- traits doc` writes this part between the markers, and the
// freshness test fails when the file holds anything else there.

import type { ContentEntry, EngineEntry, RegisterEntry, SourcePlace } from './register.js';
import { contentEntries, engineEntriesOf, register, traitHelpers } from './register.js';

/** The line the generated part begins after. */
export const docBegins = '<!-- The register\'s part begins: written by `npm run edit -- traits doc` from content/src/uses/register.ts. Do not edit it by hand. -->';
/** The line the generated part ends before. */
export const docEnds = "<!-- The register's part ends. -->";

/** A table cell's text: no line breaks, and its bars escaped. */
function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function places(places: readonly SourcePlace[]): string {
  return places.map((place) => `\`${place.file}\`: ${place.names.map((name) => `\`${name}\``).join(', ')}`).join('; ');
}

function contentSection(entry: ContentEntry): string[] {
  return [
    `### \`${entry.id}\`: ${entry.title}`,
    '',
    `- **Where:** ${entry.files.map((file) => `\`content/${file}\``).join(', ')}, holding ${entry.lists.map((list) => (list === 'guildmaster' ? 'Guildmaster' : 'Hero')).join(' and ')} Traits' keys.`,
    `- **What reads it:** ${entry.reads}`,
    `- **Its uses of a key:** ${entry.finds}`,
    `- **Removal:** ${entry.blocksRemoval ? 'a use here refuses the Trait\'s removal, naming it.' : 'the editor takes the key out itself when the Trait is removed.'}`,
    entry.add === null
      ? '- **Adding a use:** the register gives no safe way: give its entry an `add` first.'
      : `- **Adding a use:** ${entry.add.how} The target: ${Object.entries(entry.add.target)
          .map(([field, words]) => `\`${field}\`, ${words}`)
          .join('; ')}. ${assignLine(entry.id, entry.add.target)}`,
    entry.remove === null ? '- **Removing a use:** the register gives no safe way: give its entry a `remove` first.' : `- **Removing a use:** ${entry.remove.how} \`traits unassign <key> ${entry.id} <at>\`, its place as \`traits uses\` gives it.`,
    entry.update === null
      ? '- **Changing a use:** a use here is the key alone: take it out and add another.'
      : `- **Changing a use:** ${entry.update.how} The values: ${Object.entries(entry.update.fields)
          .map(([field, words]) => `\`${field}\`, ${words}`)
          .join('; ')}. ${updateLine(entry.id, entry.update.fields)}`,
    '',
  ];
}

/** The command that adds a use of an entry (v1.1.4-S13), an optional field in brackets. */
function assignLine(id: string, target: Readonly<Record<string, string>>): string {
  const fields = Object.entries(target).map(([field, words]) => (words.startsWith('optional') ? `[${field}=…]` : `${field}=…`));
  return `\`traits assign <key> ${id} ${fields.join(' ')}\`.`;
}

/** The command that changes a use of an entry in place (v1.1.6-S4), an optional value in brackets. */
function updateLine(id: string, fields: Readonly<Record<string, string>>): string {
  const values = Object.entries(fields).map(([field, words]) => (words.startsWith('optional') ? `[${field}=…]` : `${field}=…`));
  return `\`traits update <key> ${id} <at> ${values.join(' ')}\`, its place as \`traits uses\` gives it.`;
}

function engineSection(entry: EngineEntry): string[] {
  return [
    `### \`${entry.id}\`: ${entry.title}`,
    '',
    `- **Reads:** ${entry.reads}`,
    `- **Traits:** ${entry.lists.map((list) => (list === 'guildmaster' ? 'Guildmaster' : 'Hero')).join(' and ')}${entry.effectKinds.length > 0 ? `; effects ${entry.effectKinds.map((kind) => `\`${kind}\``).join(', ')}` : ''}${entry.events.length > 0 ? `; events ${entry.events.map((event) => `\`${event}\``).join(', ')}` : ''}.`,
    `- **Where it reads them:** ${places(entry.sources)}.`,
    ...(entry.through.length > 0 ? [`- **Through:** ${places(entry.through)}.`] : []),
    '',
  ];
}

/** The generated part, the markers included, as the register makes it now; lines end with `\n`. */
export function registerDoc(entries: readonly RegisterEntry[] = register): string {
  const content = contentEntries(entries);
  const engine = engineEntriesOf(entries);
  const lines = [
    docBegins,
    '',
    '## The register',
    '',
    `Every place a Trait is used: ${content.length} in content, where a Trait's key stands, and ${engine.length} rules of the engine and checks of the content that read a Trait. The editor's \`uses\` and \`find\` read the first; the drift test holds the second to the code.`,
    '',
    '| Entry | Where | Holds | Refuses removal | Add | Remove | Update |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...content.map(
      (entry) =>
        `| \`${entry.id}\` | ${cell(entry.files.join(', '))} | ${entry.lists.join(', ')} | ${entry.blocksRemoval ? 'yes' : 'no'} | ${entry.add === null ? 'no' : 'yes'} | ${entry.remove === null ? 'no' : 'yes'} | ${entry.update === null ? 'no' : 'yes'} |`,
    ),
    '',
    '| Rule | Reads | Effects | Events |',
    '| --- | --- | --- | --- |',
    ...engine.map(
      (entry) =>
        `| \`${entry.id}\` | ${entry.lists.join(', ')} | ${entry.effectKinds.map((kind) => `\`${kind}\``).join(', ') || '-'} | ${entry.events.map((event) => `\`${event}\``).join(', ') || '-'} |`,
    ),
    '',
    '## In content',
    '',
    ...content.flatMap(contentSection),
    '## In the engine and the content\'s checks',
    '',
    `The Trait helpers, whose call is a read of a Trait to the drift test: ${places(traitHelpers)}.`,
    '',
    ...engine.flatMap(engineSection),
    docEnds,
  ];
  return `${lines.join('\n')}\n`;
}

/** The generated part of a doc's text, the markers included, with `\n` line ends; `null` where its markers are not both there, in order. */
export function generatedPart(text: string): string | null {
  const lf = text.replace(/\r\n/g, '\n');
  const begin = lf.indexOf(`${docBegins}\n`);
  const end = lf.indexOf(`${docEnds}\n`, begin);
  if (begin < 0 || end < 0) return null;
  return lf.slice(begin, end + docEnds.length + 1);
}

/** A doc's text with its generated part as the register makes it now, keeping the text's line ends; the part is added at the end where it has none. */
export function withGeneratedPart(text: string, entries: readonly RegisterEntry[] = register): string {
  const crlf = text.includes('\r\n');
  const lf = text.replace(/\r\n/g, '\n');
  const part = registerDoc(entries);
  const old = generatedPart(lf);
  const next = old === null ? `${lf.replace(/\n*$/, '\n\n')}${part}` : lf.replace(old, () => part);
  return crlf ? next.replace(/\n/g, '\r\n') : next;
}
