import { describe, expect, it } from 'vitest';
import { TermIndex } from '../src/core/matcher';
import { termKey } from '../src/core/normalize';
import { tokenize } from '../src/core/tokenize';

const index = (...terms: string[]): TermIndex =>
  new TermIndex(terms.map((term) => ({ term, key: termKey(term) })));
const match = (idx: TermIndex, text: string): Array<[string, string, string]> =>
  idx.matchAll(text, tokenize(text)).map((m) => [m.key, m.text, m.casing]);

describe('TermIndex', () => {
  it('matches plurals and possessives of a defined term', () => {
    const idx = index('Party', 'Business Day');
    expect(
      match(idx, "Each Party shall act within 5 Business Days. The Parties' rights and the Party's duties."),
    ).toEqual([
      ['party', 'Party', 'exact'],
      ['business day', 'Business Days', 'exact'],
      ['party', 'Parties', 'exact'],
      ['party', "Party's", 'exact'],
    ]);
  });

  it('prefers the longest term at a position', () => {
    const idx = index('Party', 'Third Party');
    expect(match(idx, 'a Third Party and each Party')).toEqual([
      ['third party', 'Third Party', 'exact'],
      ['party', 'Party', 'exact'],
    ]);
    expect(match(idx, 'any third party')).toEqual([['third party', 'third party', 'lower']]);
  });

  it('prefers an exact form over a plural fudge when both are defined', () => {
    const idx = index('Term', 'Terms');
    expect(match(idx, 'the Terms and the Term')).toEqual([
      ['terms', 'Terms', 'exact'],
      ['term', 'Term', 'exact'],
    ]);
  });

  it('reports lowercase and all-caps uses', () => {
    const idx = index('Confidential Information');
    expect(
      match(idx, 'the confidential information and CONFIDENTIAL INFORMATION and Confidential information'),
    ).toEqual([
      ['confidential information', 'confidential information', 'lower'],
      ['confidential information', 'CONFIDENTIAL INFORMATION', 'caps'],
      ['confidential information', 'Confidential information', 'lower'],
    ]);
  });

  it('aligns to whole tokens', () => {
    const idx = index('Licensee');
    expect(match(idx, 'the Sub-Licensee and the Licensees')).toEqual([['licensee', 'Licensees', 'exact']]);
  });

  it('needs the words of a term to be next to each other', () => {
    const idx = index('Business Day');
    expect(match(idx, 'Business, Day')).toEqual([]);
    expect(match(idx, 'Business Day')).toEqual([['business day', 'Business Day', 'exact']]);
  });

  it('treats numbers inside a term literally', () => {
    const idx = index('Tier 1 Support');
    expect(match(idx, 'Tier 1 Support but not Tier 2 Support')).toEqual([
      ['tier 1 support', 'Tier 1 Support', 'exact'],
    ]);
  });

  it('matches curly and straight apostrophes alike', () => {
    const idx = index("Seller's Knowledge");
    // Keys drop possessives, so "Seller's Knowledge" and "Sellers Knowledge" are one term.
    expect(match(idx, 'to Seller’s Knowledge')).toEqual([
      ['seller knowledge', 'Seller’s Knowledge', 'exact'],
    ]);
  });

  it('skips list markers', () => {
    const idx = index('A');
    expect(match(idx, '(a) the goods')).toEqual([]);
  });

  it('is empty for an empty index', () => {
    expect(match(index(), 'The Company')).toEqual([]);
  });
});
