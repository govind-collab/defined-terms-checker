import type { DefinitionForm } from './types';
import { WORD_RE, isCapital, isCaps, isWordChar, normalizeWord, termKey } from './normalize';
import {
  CALENDAR_WORDS,
  CORPORATE_SUFFIXES,
  CROSSREF_SOURCE,
  FUNCTION_WORDS,
  INSTRUMENT_WORDS,
  LABEL_WORDS,
  NEVER_A_TERM,
  PAREN_LABELS,
  STRUCTURAL_WORDS,
  TERM_CONNECTORS,
  isPlaceName,
} from './wordlists';
import { adjacent, lineStarts, stripLeadingMarkers, type Token } from './tokenize';

/** A quoted, term-shaped phrase: "Confidential Information". Not every one is a definition. */
export interface QuotedSpan {
  /** Span including the quote characters. */
  start: number;
  end: number;
  /** Span of the term text inside the quotes. */
  termStart: number;
  termEnd: number;
  term: string;
  key: string;
}

export interface DefinitionMatch {
  term: string;
  key: string;
  form: DefinitionForm;
  /** Weak definitions count only when nothing stronger exists, never as a duplicate, never as unused. */
  weak: boolean;
  /** Span of the term text. */
  start: number;
  end: number;
}

export interface ParagraphDefinitions {
  definitions: DefinitionMatch[];
  /** Every term-shaped quoted phrase, definition or not. */
  quoted: QuotedSpan[];
}

interface Classified {
  form: DefinitionForm;
  weak: boolean;
  /** Offset of the opening bracket when the definition sits inside one. */
  open?: number;
}

const DOUBLE_OPEN = new Set(['"', '“', '„', '«', '‟']);
const DOUBLE_CLOSE = new Set(['"', '”', '“', '»', '‟']);
const SINGLE_OPEN = new Set(["'", '‘']);
const SINGLE_CLOSE = new Set(["'", '’']);
const MAX_QUOTED_CHARS = 120;
const MAX_TERM_WORDS = 8;
const TERM_WORD_RE =
  /^(?:[\p{L}\p{N}][\p{L}\p{N}\p{M}\p{Cf}]*(?:['’.-][\p{L}\p{N}][\p{L}\p{N}\p{M}\p{Cf}]*)*|&)$/u;

// What may sit between the term and its trigger: ", in relation to a person," and "shall collectively".
const LEAD = String.raw`^(?:\s*,[^,.;:\n]{0,80},)?\s*(?:(?:shall|will|may)\s+)?(?:(?:collectively|individually|respectively|each|together|generally|hereinafter|herein)\s+)?`;
const REFERENCE_RE = new RegExp(
  LEAD +
    String.raw`(?:(?:has|have|bears?)\s+the\s+(?:respective\s+)?(?:same\s+)?meanings?\s+(?:given|set\s+(?:out|forth)|ascribed|assigned|specified|defined|provided|attributed|stated|as\s+(?:defined|set|given))|(?:is|are|be)\s+(?:as\s+)?defined\s+in|(?:has|have)\s+the\s+same\s+meanings?\s+as)\b`,
  'iu',
);
const MEANS_RE = new RegExp(
  LEAD +
    String.raw`(?:means?|refers?\s+to|(?:has|have)\s+the\s+(?:following\s+)?meanings?|(?:is|are)\s+defined\s+as|be\s+construed\s+(?:as|to\s+mean)|denotes?|signif(?:y|ies)|(?:is|are)\s+a\s+reference\s+to)\b`,
  'iu',
);
const INCLUDES_RE = new RegExp(LEAD + String.raw`includes?\b`, 'iu');
const NEGATIVE_RE = /^\s*(?:(?:does|do|shall|will|may)\s+not\b|excludes?\b|(?:is|are)\s+not\b)/iu;
// "Business Day": a day ... / Business Day – a day ...
const COLON_RE = /^[ \t\u00a0]*(?::|[–—]|-(?=\s))/u;
// "Confidential Information" shall be returned ...: a quoted term opening an ordinary sentence.
const SENTENCE_VERB_RE =
  /^(?:shall|will|must|may|might|can|could|should|would|is|are|was|were|be|been|has|have|had|does|do|did|applies|apply|remains?|constitutes?)\b/iu;
// "X", "Y" and "Z" mean ... / "X" (or "Xs") means ...
const CHAIN_RE =
  /^(?:\s*\(?\s*,?\s*(?:and\/or|and|or)?\s*(?:["“„«‟][^"“”„«»‟\n\r\v]{1,120}?["”“»‟]|['‘][^'‘’\n\r\v]{1,120}?['’])\s*\)?)+/u;
// ... each being referred to individually as a "Party" / hereinafter "Licensor" / called the "Fee"
const INLINE_LEAD_RE =
  /(?:referred\s+to(?:\s+herein)?(?:\s+(?:individually|collectively|jointly|severally|together))?\s+as|hereinafter(?:\s+referred\s+to\s+as)?|hereafter(?:\s+referred\s+to\s+as)?|known\s+as|called|defined\s+as|designated\s+as|named\s+as|(?:individually|collectively|jointly|severally|together)(?:\s+as)?|each(?:\s+of\s+them)?)\s+(?:(?:the|a|an|this)\s+)?$/iu;
// Inside "(...)", words before the quote that make it a reference.
const PAREN_NEGATIVE_RE =
  /\b(?:defin\w*|see|including|includes|excluding|other\s+than|except|pursuant|meaning|referred\s+to\s+in|under|within|e\.g|cf|such\s+as)\b/iu;
// Inside "(...)", what may sit right before the quote: "(the", "(each a", "(collectively,", "(".
const PAREN_POSITIVE_RE =
  /(?:^|[\s,;:([§])(?:the|a|an|as|each|this|such|and|or|hereinafter|hereafter|called|collectively|individually|together|jointly|severally|being|namely|herein)\s*$|[,;:§]\s*$|^\s*$/iu;

// (the Products), (Vendor), Statement of Work (SOW): weak, because the same brackets also hold asides.
const BRACKET_RE = /[([]([^()[\]"“”„«»'‘’\n\r\v]{1,100})[)\]]/gu;
const ACRONYM_RE = /^[A-Z][A-Z0-9.&-]{1,11}$/;
const BRACKET_WORD_RE = /[^\s,;/]+|[,;/]/gu;
// A bracket right after a cross-reference holds a clause title: Clause 32.8(c) (Payments by the Supplier).
const CROSSREF_BEFORE_RE = new RegExp(CROSSREF_SOURCE + String.raw`\s*$`, 'u');
const PIECE_SEPARATORS = new Set([',', ';', '/', 'and', 'or']);
const PIECE_LEAD_INS = new Set([
  'each',
  'together',
  'collectively',
  'individually',
  'jointly',
  'severally',
  'hereinafter',
  'hereafter',
  'as',
  'referred',
  'to',
  'called',
  'known',
  'being',
  'namely',
  'herein',
  'such',
]);
const PIECE_ARTICLES = new Set(['the', 'a', 'an', 'this']);
const PIECE_CONNECTORS = new Set(['of', 'for', 'in', 'on', '&', 'the']);

// "Confidential Information", "Board of Directors", "Seller's Knowledge", "Tier 1 Support", "1445 Affidavit".
export function parseTerm(raw: string): { term: string; key: string } | null {
  const words = raw.trim().split(/\s+/);
  if (words[0] === '' || words.length > MAX_TERM_WORDS) return null;
  let capitals = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/\.$/, ''); // "U.S." and "Inc." keep their last period in the term text
    if (!TERM_WORD_RE.test(w)) return null;
    if (isCapital(w)) capitals++;
    else if (/^\p{N}/u.test(w)) continue;
    else if (i > 0 && i < words.length - 1 && TERM_CONNECTORS.has(w.toLowerCase())) continue;
    else return null;
  }
  if (capitals === 0 || !(isCapital(words[0]) || /^\p{N}/u.test(words[0]))) return null;
  // A stray quote mark can wrap "The" or "And".
  if (words.length === 1 && NEVER_A_TERM.has(words[0].replace(/\.$/, '').toLowerCase())) return null;
  const term = words.join(' ');
  return { term, key: termKey(term) };
}

export function findQuotedSpans(text: string, singleQuotes: boolean): QuotedSpan[] {
  const spans: QuotedSpan[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    let closers: Set<string>;
    if (DOUBLE_OPEN.has(ch)) closers = DOUBLE_CLOSE;
    else if (singleQuotes && SINGLE_OPEN.has(ch) && !isWordChar(text[i - 1])) closers = SINGLE_CLOSE;
    else continue;
    const close = findCloser(text, i, closers);
    if (close < 0) continue;
    const span = toSpan(text, i, close);
    if (span) {
      spans.push(span);
      i = close;
    }
  }
  return spans;
}

function findCloser(text: string, open: number, closers: Set<string>): number {
  const single = closers === SINGLE_CLOSE;
  const limit = Math.min(text.length, open + MAX_QUOTED_CHARS + 2);
  for (let j = open + 1; j < limit; j++) {
    const c = text[j];
    if (c === '\n' || c === '\r' || c === '\v') return -1;
    if (!closers.has(c)) {
      if (!single && DOUBLE_OPEN.has(c)) return -1;
      continue;
    }
    // An apostrophe followed by a letter is part of the word: 'Seller's Knowledge'.
    if (single && isWordChar(text[j + 1])) continue;
    return j;
  }
  return -1;
}

function toSpan(text: string, open: number, close: number): QuotedSpan | null {
  const inner = text.slice(open + 1, close);
  const lead = inner.length - inner.replace(/^[\s.,;:]+/, '').length;
  const trail = inner.length - inner.replace(/[\s.,;:]+$/, '').length;
  const termStart = open + 1 + lead;
  const termEnd = close - trail;
  if (termEnd <= termStart) return null;
  const parsed = parseTerm(text.slice(termStart, termEnd));
  return parsed ? { start: open, end: close + 1, termStart, termEnd, ...parsed } : null;
}

function openParenBefore(text: string, from: number, lineStart: number): number {
  let depth = 0;
  for (let i = from - 1; i >= lineStart; i--) {
    const c = text[i];
    if (c === ')' || c === ']') depth++;
    else if (c === '(' || c === '[') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function classifyQuoted(
  text: string,
  span: QuotedSpan,
  spans: QuotedSpan[],
  lineStart: number,
): Classified | null {
  const after = text.slice(span.end);
  const chain = CHAIN_RE.exec(after);
  const rest = chain ? after.slice(chain[0].length) : after;
  if (REFERENCE_RE.test(rest)) return { form: 'reference', weak: false };
  if (MEANS_RE.test(rest)) return { form: 'means', weak: false };
  // "Confidential Information" does not include ...: a carve-out, whatever position it sits in.
  if (NEGATIVE_RE.test(rest)) return null;
  if (INCLUDES_RE.test(rest)) return { form: 'includes', weak: true };

  const before = text.slice(lineStart, span.start);
  // "Business Day": a day ... at the start of a line is a definitions entry unless a sentence follows.
  if (stripLeadingMarkers(before).trim() === '')
    return listMeaning(rest) ? { form: 'list', weak: false } : null;
  if (INLINE_LEAD_RE.test(before)) return { form: 'inline', weak: false };

  const open = openParenBefore(text, span.start, lineStart);
  if (open >= 0) {
    let inner = text.slice(open + 1, span.start);
    // Blank out earlier quoted terms in the same parentheses: (each a "Party" and together the "Parties").
    for (const other of [...spans].reverse()) {
      if (other.start > open && other.end <= span.start) {
        inner = inner.slice(0, other.start - open - 1) + '§' + inner.slice(other.end - open - 1);
      }
    }
    if (!PAREN_NEGATIVE_RE.test(inner) && PAREN_POSITIVE_RE.test(inner)) {
      return { form: 'inline', weak: false, open };
    }
  }
  return null;
}

/** "Working Day means ..." / "Tier 1 Support: ..." with no quotes at all, at the start of a line. */
function unquotedLineInitial(
  text: string,
  tokens: Token[],
  quoted: QuotedSpan[],
  lineStart: number,
  lineEnd: number,
): DefinitionMatch | null {
  const firstIndex = tokens.findIndex((t) => t.start >= lineStart && t.start < lineEnd && !t.marker);
  if (firstIndex < 0) return null;
  const first = tokens[firstIndex];
  if (quoted.some((q) => first.start >= q.start && first.start < q.end)) return null;
  if (stripLeadingMarkers(text.slice(lineStart, first.start)).trim() !== '') return null;

  const phrase: Token[] = [];
  for (let i = firstIndex; i < tokens.length && phrase.length < MAX_TERM_WORDS; i++) {
    const t = tokens[i];
    if (t.marker || (phrase.length > 0 && !adjacent(text, phrase[phrase.length - 1], t))) break;
    if (t.capital || (phrase.length > 0 && /^\p{N}/u.test(t.text))) {
      phrase.push(t);
      continue;
    }
    const next = tokens[i + 1];
    if (
      phrase.length > 0 &&
      TERM_CONNECTORS.has(t.text.toLowerCase()) &&
      next !== undefined &&
      next.capital &&
      adjacent(text, t, next)
    ) {
      phrase.push(t);
      continue;
    }
    break;
  }
  while (phrase.length > 0 && FUNCTION_WORDS.has(phrase[0].text.toLowerCase())) phrase.shift();
  while (phrase.length > 0 && TERM_CONNECTORS.has(phrase[phrase.length - 1].text.toLowerCase())) {
    phrase.pop();
  }
  if (phrase.length === 0) return null;

  const start = phrase[0].start;
  const end = phrase[phrase.length - 1].end;
  const parsed = parseTerm(text.slice(start, end));
  if (!parsed) return null;
  const after = text.slice(end);
  let form: DefinitionForm | null = null;
  if (REFERENCE_RE.test(after)) form = 'reference';
  else if (MEANS_RE.test(after)) form = 'means';
  else if (COLON_RE.test(after) && colonDefinition(phrase, after)) form = 'list';
  return form ? { ...parsed, form, weak: false, start, end } : null;
}

// "Charges: the charges ..." defines. "Scope of Work: The Contractor ..." and "Note: see below" do not.
function colonDefinition(phrase: Token[], after: string): boolean {
  if (phrase.length > 4) return false;
  const body = after.replace(COLON_RE, '').trimStart();
  if (body === '' || /^\p{Lu}/u.test(body)) return false;
  if (phrase.length >= 2) return true;
  const word = phrase[0].text;
  const lower = word.toLowerCase();
  if (isCaps(word) || FUNCTION_WORDS.has(lower) || STRUCTURAL_WORDS.has(lower) || LABEL_WORDS.has(lower))
    return false;
  return (body.match(WORD_RE) ?? []).length >= 3;
}

// A colon, a dash, nothing (a table cell) or a lowercase non-verb. A capital or a verb opens a sentence.
function listMeaning(rest: string): boolean {
  if (COLON_RE.test(rest)) return true;
  const body = rest.trimStart();
  if (body === '') return true;
  if (/^\p{Lu}/u.test(body)) return false;
  return !SENTENCE_VERB_RE.test(body);
}

// "Vendor" and "Closing Date" pass. "Reserved", "Exhibit A", "Oregon", "Acme Inc." and "Companies Act" do not.
function plausibleUnquotedTerm(term: string): boolean {
  const lowers = term.split(' ').map(normalizeWord);
  const first = lowers[0];
  if ((lowers.length === 1 && first.length < 3) || CALENDAR_WORDS.has(first)) return false;
  if (FUNCTION_WORDS.has(first) || STRUCTURAL_WORDS.has(first) || LABEL_WORDS.has(first)) return false;
  if (PAREN_LABELS.has(first)) return false;
  if (lowers.some((w) => CORPORATE_SUFFIXES.has(w) || INSTRUMENT_WORDS.has(w))) return false;
  return !isPlaceName(lowers);
}

/** The capitalized phrase that ends right in front of an opening bracket: "Statement of Work" in "Statement of Work (SOW)". */
function runBefore(text: string, tokens: Token[], open: number): Token[] {
  let last = -1;
  for (let k = 0; k < tokens.length && tokens[k].end <= open; k++) last = k;
  if (last < 0 || !/^\s*$/.test(text.slice(tokens[last].end, open))) return [];
  const run = [tokens[last]];
  for (let k = last - 1; k >= 0 && run.length < MAX_TERM_WORDS; k--) {
    const t = tokens[k];
    if (t.marker || !adjacent(text, t, run[0])) break;
    if (t.capital || /^\p{N}/u.test(t.text) || TERM_CONNECTORS.has(t.text.toLowerCase())) run.unshift(t);
    else break;
  }
  while (run.length > 0 && !run[0].capital) run.shift();
  return run;
}

function weakInline(text: string, start: number, end: number): DefinitionMatch | null {
  const parsed = parseTerm(text.slice(start, end));
  if (!parsed || !plausibleUnquotedTerm(parsed.term)) return null;
  return { ...parsed, form: 'inline', weak: true, start, end };
}

/** Statement of Work (SOW): the acronym, and the long form in front of it, when the initials agree. */
function acronymIntroduction(
  text: string,
  tokens: Token[],
  open: number,
  acronym: string,
  start: number,
): DefinitionMatch[] {
  const letters = acronym.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters.length < 2) return [];
  const run = runBefore(text, tokens, open);
  const initials = (ts: Token[]): string => ts.map((t) => t.text[0].toUpperCase()).join('');
  for (let i = run.length - 1; i >= 0; i--) {
    const slice = run.slice(i);
    if (!slice[0].capital) continue;
    if (initials(slice.filter((t) => t.capital)) !== letters && initials(slice) !== letters) continue;
    const out: DefinitionMatch[] = [
      {
        term: acronym,
        key: termKey(acronym),
        form: 'inline',
        weak: true,
        start,
        end: start + acronym.length,
      },
    ];
    const longForm = weakInline(text, slice[0].start, slice[slice.length - 1].end);
    if (longForm) out.push(longForm);
    return out;
  }
  return [];
}

// "(the Products)", "(each a Party and together the Parties)". Any other kind of word makes the bracket an aside.
function bracketPieces(text: string, content: string, base: number): DefinitionMatch[] {
  const words = [...content.matchAll(BRACKET_WORD_RE)];
  const out: DefinitionMatch[] = [];
  let i = 0;
  while (i < words.length) {
    while (
      i < words.length &&
      (PIECE_SEPARATORS.has(words[i][0]) || PIECE_LEAD_INS.has(words[i][0].toLowerCase()))
    )
      i++;
    if (i >= words.length) break;
    if (PIECE_ARTICLES.has(words[i][0].toLowerCase())) i++;
    const first = i;
    while (i < words.length) {
      const w = words[i][0];
      const next = words[i + 1];
      // "(3 Siblings or 2 Siblings and 1 Parent)": a leading number is a count.
      if (isCapital(w) || (i > first && /^\p{N}/u.test(w))) i++;
      else if (i > first && PIECE_CONNECTORS.has(w.toLowerCase()) && next !== undefined && isCapital(next[0]))
        i++;
      else break;
    }
    if (i === first) return [];
    const start = base + words[first].index;
    const end = base + words[i - 1].index + words[i - 1][0].length;
    const piece = weakInline(text, start, end);
    if (piece) out.push(piece);
  }
  return out;
}

function unquotedBrackets(text: string, tokens: Token[]): DefinitionMatch[] {
  const out: DefinitionMatch[] = [];
  for (const m of text.matchAll(BRACKET_RE)) {
    const open = m.index;
    if (CROSSREF_BEFORE_RE.test(text.slice(0, open))) continue;
    const content = m[1];
    const trimmed = content.trim();
    const contentStart = open + 1 + content.indexOf(trimmed);
    if (ACRONYM_RE.test(trimmed)) out.push(...acronymIntroduction(text, tokens, open, trimmed, contentStart));
    else out.push(...bracketPieces(text, content, open + 1));
  }
  return out;
}

export function findDefinitions(text: string, tokens: Token[], singleQuotes: boolean): ParagraphDefinitions {
  const quoted = findQuotedSpans(text, singleQuotes);
  const starts = lineStarts(text);
  const lineStartFor = (pos: number): number => {
    let s = 0;
    for (const ls of starts) if (ls <= pos) s = ls;
    return s;
  };

  const definitions: DefinitionMatch[] = [];
  for (const span of quoted) {
    const found = classifyQuoted(text, span, quoted, lineStartFor(span.start));
    if (!found) continue;
    definitions.push({
      term: span.term,
      key: span.key,
      form: found.form,
      weak: found.weak,
      start: span.termStart,
      end: span.termEnd,
    });
    if (found.open === undefined) continue;
    // Statement of Work ("SOW"): the phrase in front of the bracket is the thing being named.
    const run = runBefore(text, tokens, found.open);
    const longForm = run.length > 0 ? weakInline(text, run[0].start, run[run.length - 1].end) : null;
    if (longForm) definitions.push(longForm);
  }
  for (let i = 0; i < starts.length; i++) {
    const lineEnd = i + 1 < starts.length ? starts[i + 1] : text.length;
    const d = unquotedLineInitial(text, tokens, quoted, starts[i], lineEnd);
    if (d) definitions.push(d);
  }
  for (const d of unquotedBrackets(text, tokens)) definitions.push(d);
  definitions.sort((a, b) => a.start - b.start);
  return { definitions, quoted };
}
