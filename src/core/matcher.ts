import { adjacent, type Token } from './tokenize';
import { isCapital, normalizeWord, singular } from './normalize';

export interface TermEntry {
  key: string;
  term: string;
}

/** exact: written as defined. lower: at least one word lost its capital. caps: the whole term in capitals. */
export type Casing = 'exact' | 'lower' | 'caps';

export interface TermMatch {
  key: string;
  term: string;
  /** Token indexes covered by the match. */
  first: number;
  last: number;
  start: number;
  end: number;
  text: string;
  casing: Casing;
}

interface Compiled {
  key: string;
  term: string;
  surface: string[];
  words: string[];
}

/**
 * Finds uses of defined terms in a token stream. Matching is aligned to whole tokens, case-insensitive,
 * and tolerant of a plural or possessive on the last word ("Business Days", "Party's"). At any position
 * the longest term wins, and among equal lengths an exact form beats a plural/singular fudge, so
 * "Third Party" is found before "Party" and "Terms" is matched to "Terms" rather than "Term".
 */
export class TermIndex {
  private readonly byFirst = new Map<string, Compiled[]>();

  constructor(entries: Iterable<TermEntry>) {
    for (const e of entries) {
      const surface = e.term.split(' ');
      const c: Compiled = { key: e.key, term: e.term, surface, words: surface.map(normalizeWord) };
      const first = singular(c.words[0]);
      const list = this.byFirst.get(first);
      if (list) list.push(c);
      else this.byFirst.set(first, [c]);
    }
    for (const list of this.byFirst.values()) list.sort((a, b) => b.words.length - a.words.length);
  }

  matchAll(text: string, tokens: Token[]): TermMatch[] {
    const out: TermMatch[] = [];
    for (let i = 0; i < tokens.length;) {
      const m = this.matchAt(text, tokens, i);
      if (m) {
        out.push(m);
        i = m.last + 1;
      } else {
        i++;
      }
    }
    return out;
  }

  private matchAt(text: string, tokens: Token[], i: number): TermMatch | null {
    const first = tokens[i];
    if (first.marker) return null;
    const list = this.byFirst.get(singular(normalizeWord(first.text)));
    if (!list) return null;

    let best: { c: Compiled; stemmed: boolean } | null = null;
    for (const c of list) {
      if (best && c.words.length < best.c.words.length) break;
      const stemmed = fits(text, tokens, i, c);
      if (stemmed === null) continue;
      if (!best || (best.stemmed && !stemmed)) best = { c, stemmed };
    }
    if (!best) return null;

    const last = i + best.c.words.length - 1;
    const start = first.start;
    const end = tokens[last].end;
    return {
      key: best.c.key,
      term: best.c.term,
      first: i,
      last,
      start,
      end,
      text: text.slice(start, end),
      casing: casing(tokens.slice(i, last + 1), best.c),
    };
  }
}

/** null when the term does not sit at position i; otherwise whether the last word needed the plural fudge. */
function fits(text: string, tokens: Token[], i: number, c: Compiled): boolean | null {
  const n = c.words.length;
  if (i + n > tokens.length) return null;
  let stemmed = false;
  for (let j = 0; j < n; j++) {
    const tok = tokens[i + j];
    if (tok.marker || (j > 0 && !adjacent(text, tokens[i + j - 1], tok))) return null;
    const word = normalizeWord(tok.text);
    if (word === c.words[j]) continue;
    if (j === n - 1 && singular(word) === singular(c.words[j])) {
      stemmed = true;
      continue;
    }
    return null;
  }
  return stemmed;
}

function casing(slice: Token[], c: Compiled): Casing {
  if (slice.every((t) => t.caps || !/\p{L}/u.test(t.text))) return 'caps';
  for (let j = 0; j < slice.length; j++) {
    if (isCapital(c.surface[j]) && !isCapital(slice[j].text)) return 'lower';
  }
  return 'exact';
}
