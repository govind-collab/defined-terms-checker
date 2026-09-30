import { describe, expect, it } from 'vitest';
import { stripLeadingMarkers, tokenize } from '../src/core/tokenize';
import { normalizeWord, singular, termKey, familyKey } from '../src/core/normalize';

const texts = (s: string): string[] => tokenize(s).map((t) => t.text);
const starts = (s: string): string[] =>
  tokenize(s)
    .filter((t) => t.sentenceStart)
    .map((t) => t.text);

describe('tokenize', () => {
  it('splits words and keeps offsets', () => {
    const tokens = tokenize('The Company shall pay.');
    expect(tokens.map((t) => t.text)).toEqual(['The', 'Company', 'shall', 'pay']);
    expect(tokens[1]).toMatchObject({ start: 4, end: 11, capital: true, caps: false });
  });

  it('keeps possessives, hyphens and dotted abbreviations inside a word', () => {
    expect(texts("Seller's Sub-Licensee in the U.S. market")).toEqual([
      "Seller's",
      'Sub-Licensee',
      'in',
      'the',
      'U.S',
      'market',
    ]);
    expect(texts('Seller’s rights')).toEqual(['Seller’s', 'rights']);
  });

  it('keeps an ampersand as a word', () => {
    expect(texts('Terms & Conditions')).toEqual(['Terms', '&', 'Conditions']);
  });

  it('leaves a trailing plural apostrophe out of the word', () => {
    expect(texts("the Parties' rights")).toEqual(['the', 'Parties', 'rights']);
  });

  it('does not start a sentence at a period before a lowercase word', () => {
    expect(starts('Payment is in U.S. dollars. Acme Inc. controls it, e.g. wholly.')).toEqual([
      'Payment',
      'Acme',
    ]);
  });

  it('marks the first word of each sentence', () => {
    expect(starts('The Company pays. Then the Supplier delivers! Does it? Yes: it does.')).toEqual([
      'The',
      'Then',
      'Does',
      'Yes',
      'it',
    ]);
  });

  it('treats a manual line break as a sentence boundary', () => {
    expect(starts('first line\vSecond line')).toEqual(['first', 'Second']);
  });

  it('recognises list markers at the start of a line and inline', () => {
    const tokens = tokenize('1.1 (a) The Supplier shall; and (b) The Customer shall.');
    const markers = tokens.filter((t) => t.marker).map((t) => t.text);
    expect(markers).toEqual(['1.1', 'a', 'b']);
    expect(starts('1.1 (a) The Supplier shall; and (b) The Customer shall.')).toEqual(['The', 'The']);
  });

  it('does not read "A Party" or a year as a list marker', () => {
    expect(tokenize('A Party may terminate.').filter((t) => t.marker)).toHaveLength(0);
    expect(tokenize('2026 was the year.').filter((t) => t.marker)).toHaveLength(0);
    expect(tokenize('clause 2(a) applies').filter((t) => t.marker)).toHaveLength(0);
  });

  it('flags capitals and all-caps words', () => {
    const [inWord, no, event, a, iphone] = tokenize('IN NO EVENT A iPhone');
    expect(inWord).toMatchObject({ capital: true, caps: true });
    expect(no).toMatchObject({ capital: true, caps: true });
    expect(event).toMatchObject({ capital: true, caps: true });
    expect(a).toMatchObject({ capital: true, caps: false });
    expect(iphone).toMatchObject({ capital: false, caps: false });
  });

  it('handles accented letters', () => {
    expect(texts('Société Générale à Paris')).toEqual(['Société', 'Générale', 'à', 'Paris']);
    expect(tokenize('Émile')[0].capital).toBe(true);
  });

  it('keeps combining marks and invisible format characters inside a word', () => {
    expect(texts('Cafe\u0301 Non\u00adDisclosure Zero\u200bWidth')).toEqual([
      'Cafe\u0301',
      'Non\u00adDisclosure',
      'Zero\u200bWidth',
    ]);
    expect(normalizeWord('Cafe\u0301')).toBe('café');
    expect(normalizeWord('Non\u00adDisclosure')).toBe('nondisclosure');
    expect(normalizeWord('Zero\u200bWidth')).toBe('zerowidth');
  });

  it('returns nothing for empty or punctuation-only text', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(' ... ')).toEqual([]);
  });
});

describe('stripLeadingMarkers', () => {
  it('removes one or more markers', () => {
    expect(stripLeadingMarkers('1.1 (a) "Agreement"')).toBe('"Agreement"');
    expect(stripLeadingMarkers('(iv) text')).toBe('text');
    expect(stripLeadingMarkers('• text')).toBe('text');
    expect(stripLeadingMarkers('A Party')).toBe('A Party');
  });
});

describe('normalize', () => {
  it('normalizes case, quotes and possessives', () => {
    expect(normalizeWord("Company's")).toBe('company');
    expect(normalizeWord('Company’s')).toBe('company');
    expect(normalizeWord("Parties'")).toBe('parties');
  });

  it('singularizes the common plural shapes and leaves the rest alone', () => {
    expect(singular('parties')).toBe('party');
    expect(singular('losses')).toBe('loss');
    expect(singular('taxes')).toBe('tax');
    expect(singular('statuses')).toBe('status');
    expect(singular('services')).toBe('service');
    expect(singular('days')).toBe('day');
    expect(singular('business')).toBe('business');
    expect(singular('basis')).toBe('basis');
    expect(singular('bus')).toBe('bus');
  });

  it('builds keys and families', () => {
    expect(termKey('Business  Day')).toBe('business day');
    expect(familyKey('business days')).toBe('business day');
    expect(familyKey(termKey('Parties'))).toBe(familyKey(termKey('Party')));
  });
});
