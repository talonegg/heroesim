/**
 * Filling a Vignette's slots. The engine emits ids and an outcome and never a sentence
 * (ADR-0002, DL-08); this is where the authored template becomes English.
 *
 * Nothing here reads the clock or the global random: `narrate` is pure, and ESLint says so.
 */

import type { Pronouns } from '@heroesim/engine';

/** A paragraph could not be built: a token had nothing to fill it with, or content is missing. */
export class NarrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrationError';
  }
}

/** The forms a person's pronouns take in a narrative template. */
export interface PronounForms {
  /** Subject: she / he / they. */
  they: string;
  /** Object: her / him / them. */
  them: string;
  /** Possessive: her / his / their. */
  their: string;
  /** Agreement for "to be": is / are. */
  is: string;
  /** Agreement for "to have": has / have. */
  has: string;
  /** Agreement for a plain verb: moves / move. */
  moves: string;
}

const FORMS: Readonly<Record<Pronouns, PronounForms>> = {
  she: { they: 'she', them: 'her', their: 'her', is: 'is', has: 'has', moves: 'moves' },
  he: { they: 'he', them: 'him', their: 'his', is: 'is', has: 'has', moves: 'moves' },
  // Singular "they" takes the plural verb forms.
  they: { they: 'they', them: 'them', their: 'their', is: 'are', has: 'have', moves: 'move' },
};

/** How a person's pronouns read in a template. */
export function pronounForms(pronouns: Pronouns): PronounForms {
  return FORMS[pronouns];
}

const TOKEN = /\{([^{}]*)\}/g;

/** Characters that may sit between a full stop and the first word of the next sentence. */
const SKIPPABLE = new Set([' ', '\n', '\t', '"', '“', '‘', '(', "'"]);

/** Whether the token at `index` is the first word of a sentence, so its value is capitalised. */
function startsSentence(template: string, index: number): boolean {
  for (let position = index - 1; position >= 0; position -= 1) {
    const character = template.charAt(position);
    if (SKIPPABLE.has(character)) continue;
    return character === '.' || character === '!' || character === '?';
  }
  return true;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Replace every `{token}` in a template with its value, capitalising one that opens a
 * sentence.
 *
 * @param where what to name in the error if a token cannot be filled
 * @throws NarrationError when a token has no value, so that no `{` ever reaches a reader
 */
export function fillTokens(
  template: string,
  values: Readonly<Record<string, string | undefined>>,
  where: string,
): string {
  let text = '';
  let copied = 0;
  for (const match of template.matchAll(TOKEN)) {
    const index = match.index;
    const token = match[1] ?? '';
    const value = values[token];
    if (value === undefined || value.length === 0) {
      throw new NarrationError(`${where}: nothing to fill "{${token}}" with`);
    }
    text += template.slice(copied, index);
    text += startsSentence(template, index) ? capitalise(value) : value;
    copied = index + match[0].length;
  }
  text += template.slice(copied);
  if (text.includes('{')) {
    throw new NarrationError(`${where}: a token was left unfilled in "${text}"`);
  }
  return text;
}
