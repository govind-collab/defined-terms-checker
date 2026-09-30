import { WORD_RE, isCapital, isCaps } from './normalize';

export interface Token {
  text: string;
  start: number;
  end: number;
  /** First word of a sentence, or first word after a list marker or a line break. */
  sentenceStart: boolean;
  /** Part of a list marker such as "1.1", "(a)" or "(iv)". */
  marker: boolean;
  capital: boolean;
  /** Two or more letters, all uppercase. */
  caps: boolean;
}

// "1.", "1.1", "(a)", "a)", "(iv)", "•" at the start of a line, possibly several in a row.
const LINE_MARKER_RE =
  /[ \t\u00a0]*(?:\d{1,3}(?:\.\d{1,3})+\.?|\(?(?:\d{1,3}|[A-Za-z]|[ivxlc]{1,6}|[IVXLC]{1,6})[.)]|[•·◦▪*\-–—])[ \t\u00a0]+/uy;
// "(a)", "(ii)", "(1)" between words.
const INLINE_MARKER_RE = /(^|\s)(\((?:\d{1,3}|[A-Za-z]|[ivxlc]{1,6}|[IVXLC]{1,6})\))(?=\s)/gu;
const LINE_BREAK_RE = /[\n\r\v]/g;
const SENTENCE_BREAK_RE = /[!?:…\n\r\v•]/;

export function lineStarts(text: string): number[] {
  const starts = [0];
  for (const m of text.matchAll(LINE_BREAK_RE)) starts.push(m.index + 1);
  return starts;
}

export function stripLeadingMarkers(s: string): string {
  LINE_MARKER_RE.lastIndex = 0;
  let end = 0;
  while (LINE_MARKER_RE.exec(s) !== null) end = LINE_MARKER_RE.lastIndex;
  return s.slice(end);
}

function markerSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const lineStart of lineStarts(text)) {
    LINE_MARKER_RE.lastIndex = lineStart;
    let m: RegExpExecArray | null;
    while ((m = LINE_MARKER_RE.exec(text)) !== null) spans.push([m.index, LINE_MARKER_RE.lastIndex]);
  }
  for (const m of text.matchAll(INLINE_MARKER_RE)) {
    const start = m.index + m[1].length;
    spans.push([start, start + m[2].length]);
  }
  return spans;
}

export function tokenize(text: string): Token[] {
  const markers = markerSpans(text);
  const tokens: Token[] = [];
  let prevEnd = -1;
  for (const m of text.matchAll(WORD_RE)) {
    const start = m.index;
    const end = start + m[0].length;
    const marker = markers.some(([a, b]) => start >= a && end <= b);
    let sentenceStart = false;
    if (!marker) {
      const gap = text.slice(prevEnd, start);
      // "U.S. dollars", "Acme Inc. controlled by it": a period before a lowercase word ends no sentence
      sentenceStart =
        prevEnd < 0 ||
        markers.some(([a]) => a >= prevEnd && a < start) ||
        SENTENCE_BREAK_RE.test(gap) ||
        (gap.includes('.') && !/^\p{Ll}/u.test(m[0]));
      prevEnd = end;
    }
    tokens.push({
      text: m[0],
      start,
      end,
      sentenceStart,
      marker,
      capital: isCapital(m[0]),
      caps: isCaps(m[0]),
    });
  }
  return tokens;
}

/** True when only whitespace, or an invisible format character, separates two neighbouring tokens. */
export function adjacent(text: string, a: Token, b: Token): boolean {
  return /^[\s\p{Cf}]+$/u.test(text.slice(a.end, b.start));
}
