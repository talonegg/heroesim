import { describe, expect, it } from 'vitest';
import { fillTokens, NarrationError, pronounForms } from '../src/tokens.js';

const VALUES = {
  hero: 'Brenna',
  'hero.they': 'they',
  'hero.them': 'them',
  'hero.their': 'their',
  'hero.is': 'are',
  'hero.has': 'have',
  'hero.moves': 'move',
  patron: 'Reeve Halloran of Lowford',
  sphere: 'the river towns',
};

describe('pronoun forms', () => {
  it('gives she, he and they their own object and possessive forms', () => {
    expect(pronounForms('she')).toMatchObject({ they: 'she', them: 'her', their: 'her' });
    expect(pronounForms('he')).toMatchObject({ they: 'he', them: 'him', their: 'his' });
    expect(pronounForms('they')).toMatchObject({ they: 'they', them: 'them', their: 'their' });
  });

  it('gives "they" the plural verb agreement and the others the singular', () => {
    expect(pronounForms('she')).toMatchObject({ is: 'is', has: 'has', moves: 'moves' });
    expect(pronounForms('he')).toMatchObject({ is: 'is', has: 'has', moves: 'moves' });
    expect(pronounForms('they')).toMatchObject({ is: 'are', has: 'have', moves: 'move' });
  });
});

describe('fillTokens', () => {
  it('fills every token and leaves no brace behind', () => {
    const text = fillTokens(
      '{hero} waits, and by the time {hero.they} {hero.moves} the packs are gone.',
      VALUES,
      'test',
    );
    expect(text).toBe('Brenna waits, and by the time they move the packs are gone.');
    expect(text).not.toContain('{');
  });

  it('capitalises a token that opens the string', () => {
    expect(fillTokens('{hero.they} waited.', VALUES, 'test')).toBe('They waited.');
  });

  it('capitalises a token that opens a sentence after a full stop', () => {
    expect(fillTokens('It was late. {hero.they} waited.', VALUES, 'test')).toBe(
      'It was late. They waited.',
    );
    expect(fillTokens('Was it late? {hero.they} waited.', VALUES, 'test')).toBe(
      'Was it late? They waited.',
    );
  });

  it('capitalises a token that opens a sentence inside quotation marks', () => {
    expect(fillTokens('He said. "{hero.they} waited."', VALUES, 'test')).toBe(
      'He said. "They waited."',
    );
  });

  it('leaves a token alone in the middle of a sentence', () => {
    expect(fillTokens('and {hero.they} waited', VALUES, 'test')).toBe('and they waited');
  });

  it('fills a multi-word value and capitalises only its first letter', () => {
    expect(fillTokens('{sphere} hears of it.', VALUES, 'test')).toBe('The river towns hears of it.');
  });

  it('refuses a token it has no value for, naming where it came from', () => {
    expect(() => fillTokens('{commission} went well.', VALUES, 'vignettes/x.toml')).toThrow(
      NarrationError,
    );
    expect(() => fillTokens('{commission} went well.', VALUES, 'vignettes/x.toml')).toThrow(
      /vignettes\/x\.toml.*\{commission\}/,
    );
  });

  it('refuses an empty value rather than printing a gap', () => {
    expect(() => fillTokens('{trait} showed.', { trait: '' }, 'test')).toThrow(NarrationError);
  });
});
