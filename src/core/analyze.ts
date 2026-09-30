import type {
  AnalysisOptions,
  AnalysisResult,
  Definition,
  Finding,
  FindingKind,
  Location,
  ParagraphInput,
  TermSummary,
} from './types';
import { adjacent, lineStarts, stripLeadingMarkers, tokenize, type Token } from './tokenize';
import { findDefinitions, type DefinitionMatch } from './definitions';
import { TermIndex, type TermMatch } from './matcher';
import { familyKey, normalizeWord, stripPossessive, termKey } from './normalize';
import {
  ACRONYM_STOP,
  CALENDAR_WORDS,
  CITATION_WORDS,
  CORPORATE_SUFFIXES,
  CROSSREF_SOURCE,
  FUNCTION_WORDS,
  GEO_ACRONYMS,
  HONORIFICS,
  INSTRUMENT_WORDS,
  PLACES,
  ROMAN_NUMERAL_RE,
  RUN_JOINERS,
  STREET_TAILS,
  STRUCTURAL_WORDS,
  TERM_CONNECTORS,
  isPlaceName,
  isPublicBody,
} from './wordlists';

interface Scanned {
  index: number;
  text: string;
  tokens: Token[];
  definitions: DefinitionMatch[];
  /** Heading, all-caps line, short unpunctuated line: uses count, undefined candidates do not. */
  heading: boolean;
  /** A heading style or an all-caps line: its text is a title, so the same phrase elsewhere is not a term. */
  title: boolean;
  /** Token indexes that never take part in undefined-term detection. */
  excluded: Uint8Array;
  /** Every match of a defined term, including the ones inside its own definition. */
  matches: TermMatch[];
  /** Positions of each distinct substring already located in this paragraph, shared by every location. */
  occurrences: Map<string, number[]>;
}

interface Candidate {
  term: string;
  locations: Location[];
}

// Clause 32.8(c) (Payments by the Supplier): the bracketed clause title is excluded.
const TITLE_PAREN_RE = new RegExp(CROSSREF_SOURCE + String.raw`\s*\(([^()\n]{1,80})\)`, 'gu');
const YEAR_RE = /^(?:1[89]|20)\d\d$/;
// 52.203-19, 200.303: the numbers regulations are cited by.
const CITATION_NUMBER_RE = /^\d{1,3}\.\d{2,4}(?:-\d{1,3})?$/;
// After a run-in heading: ": The Contractor shall", ". Any dispute". A lowercase start is a definition.
const HEADING_TAIL_RE = /^[:.]\s*(?!\p{Ll})/u;
const MAX_HEADING_WORDS = 12;
/** Same limit as parseTerm: a longer capitalized run is a title or a list. */
const MAX_CANDIDATE_WORDS = 8;
const CONTEXT_CHARS = 40;
const SENTENCE_LOOKBACK = 25;
export const KIND_ORDER: FindingKind[] = [
  'undefined',
  'unused',
  'duplicate',
  'before-definition',
  'lowercase',
];

export function analyze(paragraphs: ParagraphInput[], options: AnalysisOptions = {}): AnalysisResult {
  const singleQuotes = options.singleQuotes ?? true;
  const checkLowercase = options.checkLowercase ?? true;
  const ignored = new Set((options.ignore ?? []).map((t) => familyKey(termKey(t))));

  const scanned = paragraphs.map((p, index) => scanParagraph(p, index, singleQuotes));
  const terms = collectDefinitions(scanned);
  const { uses, lowercase, familyUses } = matchUses(scanned, terms);

  const midCaps = new Set<string>();
  for (const s of scanned) {
    if (s.heading) continue;
    s.tokens.forEach((t, i) => {
      if (t.capital && !t.sentenceStart && !t.marker && !s.excluded[i]) midCaps.add(stripPossessive(t.text));
    });
  }
  // "This Master Services Agreement (the "Agreement")": the document title is not an undefined term.
  const titles = new Set(
    scanned
      .filter((s) => s.title)
      .map((s) => familyKey(termKey(stripLeadingMarkers(s.text).replace(/["“”„«»'‘’]/g, ''))))
      .filter((k) => k !== ''),
  );
  const candidates = new Map<string, Candidate>();
  for (const s of scanned) if (!s.heading) collectCandidates(s, midCaps, titles, candidates);

  const findings: Finding[] = [];
  for (const [key, c] of candidates) {
    // A single capitalized word seen once is more often a name than a missing definition.
    if (!key.includes(' ') && c.locations.length < 2) continue;
    findings.push({
      kind: 'undefined',
      term: c.term,
      key,
      message: `Used ${times(c.locations.length)} as a capitalized term but never defined.`,
      locations: c.locations,
    });
  }
  for (const [key, e] of terms) {
    const defs = e.definitions;
    // Weak definitions (brackets without quotes, "includes") are too uncertain to call a term unused.
    if (defs.some((d) => !d.weak) && (familyUses.get(familyKey(key)) ?? 0) === 0) {
      findings.push({
        kind: 'unused',
        term: e.term,
        key,
        message: `Defined in paragraph ${para(defs[0].location)} but never used.`,
        locations: defs.map((d) => d.location),
      });
    }
    // A cross-reference adds no definition, and 2 definitions in 1 paragraph are 1 drafting event.
    const strong = defs.filter((d) => !d.weak && d.form !== 'reference');
    const firstPerParagraph = strong.filter(
      (d, i) => i === 0 || d.location.paragraph !== strong[i - 1].location.paragraph,
    );
    if (firstPerParagraph.length >= 2) {
      findings.push({
        kind: 'duplicate',
        term: e.term,
        key,
        message: `Defined ${firstPerParagraph.length} times, in paragraphs ${firstPerParagraph.map((d) => para(d.location)).join(', ')}.`,
        locations: firstPerParagraph.map((d) => d.location),
      });
    }
    // Only earlier paragraphs count: "Acme Analytics Inc. ... ("Acme")" names the party before its short form.
    if (defs.every((d) => d.form === 'inline' && !d.weak)) {
      const first = defs.map((d) => d.location).sort(byPosition)[0];
      const early = (uses.get(key) ?? []).filter(
        (u) => u.paragraph < first.paragraph && !scanned[u.paragraph].heading,
      );
      if (early.length > 0) {
        findings.push({
          kind: 'before-definition',
          term: e.term,
          key,
          message: `Used ${times(early.length)} before its definition in paragraph ${para(first)}.`,
          locations: early,
        });
      }
    }
    const lows = lowercase.get(key);
    if (checkLowercase && lows && lows.length > 0) {
      findings.push({
        kind: 'lowercase',
        term: e.term,
        key,
        message: `Written in lowercase ${times(lows.length)}; the defined term is "${e.term}".`,
        locations: lows,
      });
    }
  }

  const kept = findings.filter((f) => !ignored.has(familyKey(f.key))).sort(compareFindings);
  const summaries: TermSummary[] = [...terms]
    .map(([key, e]) => ({ term: e.term, key, uses: uses.get(key)?.length ?? 0 }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    findings: kept,
    terms: summaries,
    stats: { paragraphs: paragraphs.length, terms: terms.size, ignored: findings.length - kept.length },
  };
}

interface TermEntry {
  term: string;
  definitions: Definition[];
}

function collectDefinitions(scanned: Scanned[]): Map<string, TermEntry> {
  const terms = new Map<string, TermEntry>();
  for (const s of scanned) {
    for (const d of s.definitions) {
      const entry = terms.get(d.key) ?? { term: d.term, definitions: [] };
      entry.definitions.push({
        term: d.term,
        key: d.key,
        form: d.form,
        weak: d.weak,
        location: locate(s, d.start, d.end),
      });
      terms.set(d.key, entry);
    }
  }
  return terms;
}

interface Uses {
  uses: Map<string, Location[]>;
  lowercase: Map<string, Location[]>;
  familyUses: Map<string, number>;
}

function matchUses(scanned: Scanned[], terms: Map<string, TermEntry>): Uses {
  const index = new TermIndex([...terms].map(([key, e]) => ({ key, term: e.term })));
  const uses = new Map<string, Location[]>();
  const lowercase = new Map<string, Location[]>();
  const familyUses = new Map<string, number>();
  for (const s of scanned) {
    s.matches = index.matchAll(s.text, s.tokens);
    // Matches inside a definitions entry's own sentence ("Agreement" means this agreement) are not uses.
    const entries = s.definitions
      .filter((d) => d.form !== 'inline')
      .map((d) => ({ key: d.key, start: d.start, end: sentenceEndAfter(s, d.end) }));
    const inOwnDefinition = (m: TermMatch): boolean =>
      entries.some((e) => e.key === m.key && m.start >= e.start && m.start < e.end) ||
      s.definitions.some((d) => d.key === m.key && m.start < d.end && m.end > d.start);
    for (const m of s.matches) {
      if (inOwnDefinition(m)) continue;
      const loc = locate(s, m.start, m.end);
      push(uses, m.key, loc);
      const family = familyKey(m.key);
      familyUses.set(family, (familyUses.get(family) ?? 0) + 1);
      // A 1-letter term ("A" means Schedule A) would flag every article, so the lowercase check skips it.
      if (m.casing === 'lower' && !s.heading && m.term.length > 1) push(lowercase, m.key, loc);
    }
  }
  return { uses, lowercase, familyUses };
}

function scanParagraph(p: ParagraphInput, index: number, singleQuotes: boolean): Scanned {
  const text = p.text;
  const tokens = tokenize(text);
  const { definitions, quoted } = findDefinitions(text, tokens, singleQuotes);
  const spans: Array<[number, number]> = [
    ...quoted.map((q): [number, number] => [q.start, q.end]),
    ...definitions.map((d): [number, number] => [d.start, d.end]),
  ];
  for (const m of text.matchAll(TITLE_PAREN_RE)) {
    const start = m.index + m[0].length - m[1].length - 1;
    spans.push([start, start + m[1].length]);
  }
  for (const span of runInHeadingSpans(text, tokens)) spans.push(span);
  const excluded = new Uint8Array(tokens.length);
  tokens.forEach((t, i) => {
    if (t.marker || spans.some(([a, b]) => t.start >= a && t.end <= b)) excluded[i] = 1;
  });
  return {
    index,
    text,
    tokens,
    definitions,
    heading: headingLike(p, tokens, definitions.length > 0),
    title: p.heading === true || isAllCaps(tokens),
    excluded,
    matches: [],
    occurrences: new Map(),
  };
}

function isAllCaps(tokens: Token[]): boolean {
  const lettered = tokens.filter((t) => !t.marker && /\p{L}/u.test(t.text));
  return lettered.length > 0 && lettered.every((t) => t.caps || t.text.length === 1);
}

function headingLike(p: ParagraphInput, tokens: Token[], hasDefinition: boolean): boolean {
  if (p.heading) return true;
  const words = tokens.filter((t) => !t.marker);
  if (words.length === 0) return true;
  if (isAllCaps(tokens)) return true;
  if (hasDefinition) return false;
  // Short and unpunctuated reads as a title or a table cell. "the Services; and" is a list item.
  const trimmed = p.text.trim().replace(/\s+(?:and|or)$/iu, '');
  return words.length <= MAX_HEADING_WORDS && !/[.;:!?,]$/.test(trimmed);
}

// "Scope of Work: The Contractor shall ...": a Title Case line opener ending in ":" or "." before a capital.
function runInHeadingSpans(text: string, tokens: Token[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let first = 0;
  for (const start of lineStarts(text)) {
    while (first < tokens.length && (tokens[first].start < start || tokens[first].marker)) first++;
    if (first >= tokens.length) break;
    if (!tokens[first].capital) continue;
    let last = first;
    for (let k = first + 1; k < tokens.length && k - first < MAX_HEADING_WORDS; k++) {
      const t = tokens[k];
      if (t.marker || !/^[\s,]+$/.test(text.slice(tokens[k - 1].end, t.start))) break;
      if (t.capital || TERM_CONNECTORS.has(t.text.toLowerCase())) last = k;
      else break;
    }
    while (last > first && !tokens[last].capital) last--;
    if (HEADING_TAIL_RE.test(text.slice(tokens[last].end)))
      spans.push([tokens[first].start, tokens[last].end]);
  }
  return spans;
}

// Ends at the next sentence start after ".", "!", "?" or a line break. A colon or a list marker continues it.
function sentenceEndAfter(s: Scanned, pos: number): number {
  const { tokens, text } = s;
  for (let k = 1; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.start < pos || !t.sentenceStart) continue;
    if (/[.!?\n\r\v•]/.test(text.slice(tokens[k - 1].end, t.start))) return t.start;
  }
  return text.length;
}

function collectCandidates(
  s: Scanned,
  midCaps: Set<string>,
  titles: Set<string>,
  out: Map<string, Candidate>,
): void {
  const { text, tokens, excluded } = s;
  const covered = new Uint8Array(tokens.length);
  for (const m of s.matches) for (let i = m.first; i <= m.last; i++) covered[i] = 1;
  const titleList = [...titles];

  const usable = (i: number): boolean => i < tokens.length && !excluded[i] && tokens[i].capital;
  // "Board of Directors", "Tier 2 Support". A number after a cross-reference word ("Section 3") does not join.
  const joiner = (i: number): boolean =>
    !excluded[i] &&
    (RUN_JOINERS.has(tokens[i].text.toLowerCase()) ||
      (/^\p{N}+$/u.test(tokens[i].text) && !STRUCTURAL_WORDS.has(normalizeWord(tokens[i - 1].text)))) &&
    usable(i + 1) &&
    adjacent(text, tokens[i], tokens[i + 1]);

  const emit = (ids: number[]): void => {
    let phrase = ids;
    const first = tokens[phrase[0]];
    // "The Effective Date": a sentence-opening word is dropped unless it is capitalized elsewhere mid-sentence.
    if (first.sentenceStart && !midCaps.has(stripPossessive(first.text))) {
      phrase = phrase.slice(1);
      while (phrase.length > 0 && !tokens[phrase[0]].capital) phrase = phrase.slice(1);
    }
    if (phrase.length === 0 || phrase.length > MAX_CANDIDATE_WORDS || phrase.every((k) => covered[k])) return;

    const last = phrase[phrase.length - 1];
    const next = tokens[last + 1];
    if (crossRefTitle(text, tokens, phrase[0])) return;

    const words = phrase.map((k) => tokens[k].text);
    const lowers = words.map(normalizeWord);
    const capitals = phrase.filter((k) => tokens[k].capital);
    if (words.length > 1 && lowers.some((w) => CORPORATE_SUFFIXES.has(w))) return;
    if (HONORIFICS.has(lowers[0])) return;
    // "Section 3", "Exhibit A", "this Schedule": cross-references.
    if (STRUCTURAL_WORDS.has(lowers[0]) && words.length <= 2) return;
    if (lowers.some((w) => INSTRUMENT_WORDS.has(w))) return;
    if (next !== undefined && YEAR_RE.test(next.text) && adjacent(text, tokens[last], next)) return;
    if (instrumentEarlier(tokens, phrase[0]) || citationBefore(tokens, phrase[0])) return;
    if (isPlaceName(lowers) || isPublicBody(lowers)) return;
    // "100 Main Street": an address.
    if (words.length > 1 && STREET_TAILS.has(lowers[lowers.length - 1])) return;
    // "Mercy Corps Nigeria": a defined name plus a place.
    const uncovered = phrase.filter((k) => !covered[k]);
    if (uncovered.length < phrase.length && uncovered.every((k) => PLACES.has(normalizeWord(tokens[k].text))))
      return;
    const key = familyKey(lowers.join(' '));
    if (titles.has(key) || (words.length > 1 && titleList.some((t) => t.startsWith(key + ' ')))) return;
    if (capitals.length >= 2 && capitals.every((k) => tokens[k].caps)) return;
    if (capitals.length === 1) {
      const k = capitals[0];
      const w = lowers[0];
      const bare = w.replace(/\./g, '');
      if (w.length < 3 || FUNCTION_WORDS.has(w) || CALENDAR_WORDS.has(w) || ROMAN_NUMERAL_RE.test(words[0]))
        return;
      if (
        tokens[k].caps &&
        (ACRONYM_STOP.has(bare) || GEO_ACRONYMS.has(bare) || tokens[k - 1]?.caps || tokens[k + 1]?.caps)
      ) {
        return;
      }
    }

    const display = words.map((w, i) => (i === words.length - 1 ? stripPossessive(w) : w)).join(' ');
    const entry = out.get(key) ?? { term: display, locations: [] };
    entry.locations.push(locate(s, tokens[phrase[0]].start, tokens[last].end));
    out.set(key, entry);
  };

  let i = 0;
  while (i < tokens.length) {
    if (!usable(i)) {
      i++;
      continue;
    }
    const run = [i];
    let j = i + 1;
    while (
      j < tokens.length &&
      !possessive(text, tokens[run[run.length - 1]]) &&
      adjacent(text, tokens[j - 1], tokens[j])
    ) {
      if (usable(j)) {
        run.push(j);
        j++;
      } else if (joiner(j)) {
        run.push(j, j + 1);
        j += 2;
      } else {
        break;
      }
    }
    i = j;
    for (const phrase of splitRun(run, tokens, covered)) emit(phrase);
  }
}

// "Contractor's Authorized Representative": the possessive ends one phrase and the term is what follows.
function possessive(text: string, t: Token): boolean {
  return /['’]s$/u.test(t.text) || /['’]/.test(text[t.end] ?? '');
}

// "the Protocol to Prevent, Suppress and Punish Trafficking in Persons": one instrument name, many capitals.
function instrumentEarlier(tokens: Token[], i: number): boolean {
  for (let k = i - 1, n = 0; k >= 0 && n < SENTENCE_LOOKBACK; k--, n++) {
    if (INSTRUMENT_WORDS.has(normalizeWord(tokens[k].text))) return true;
    if (tokens[k].sentenceStart) break;
  }
  return false;
}

// FAR 52.203-19 Prohibition on Requiring Certain Internal Confidentiality Agreements: a cited clause title.
function citationBefore(tokens: Token[], i: number): boolean {
  return tokens
    .slice(Math.max(0, i - 3), i)
    .some(
      (t) => CITATION_WORDS.has(normalizeWord(t.text).replace(/\./g, '')) || CITATION_NUMBER_RE.test(t.text),
    );
}

// "Section 5 – Tender Package": the title that follows a cross-reference.
function crossRefTitle(text: string, tokens: Token[], i: number): boolean {
  const num = tokens[i - 1];
  const word = tokens[i - 2];
  return (
    num !== undefined &&
    word !== undefined &&
    /^\p{N}/u.test(num.text) &&
    STRUCTURAL_WORDS.has(normalizeWord(word.text)) &&
    /^[\s–—:,-]+$/.test(text.slice(num.end, tokens[i].start))
  );
}

// "Board of Directors of the Company" -> "Board of Directors", with "Company" a use. "Support Services" stays whole.
function splitRun(run: number[], tokens: Token[], covered: Uint8Array): number[][] {
  const segments: number[][] = [[]];
  const joiners: number[] = [];
  for (const i of run) {
    if (tokens[i].capital) segments[segments.length - 1].push(i);
    else {
      joiners.push(i);
      segments.push([]);
    }
  }
  const phrases: number[][] = [];
  let current: number[] = [];
  segments.forEach((seg, k) => {
    const coveredCount = seg.filter((i) => covered[i]).length;
    if (coveredCount === seg.length) {
      if (current.length > 0) phrases.push(current);
      current = [];
    } else if (coveredCount === 0) {
      if (current.length > 0) current.push(joiners[k - 1]);
      for (const k of seg) current.push(k);
    } else {
      if (current.length > 0) phrases.push(current);
      phrases.push(seg);
      current = [];
    }
  });
  if (current.length > 0) phrases.push(current);
  return phrases;
}

function locate(s: Scanned, start: number, end: number): Location {
  const text = s.text.slice(start, end);
  // Non-overlapping positions, counted the way Word's search counts them, so the ordinal picks the right hit.
  let positions = s.occurrences.get(text);
  if (!positions) {
    positions = [];
    if (text.length > 0) {
      for (let k = s.text.indexOf(text); k >= 0; k = s.text.indexOf(text, k + text.length)) positions.push(k);
    }
    s.occurrences.set(text, positions);
  }
  let lo = 0;
  let hi = positions.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (positions[mid] < start) lo = mid + 1;
    else hi = mid;
  }
  const ordinal = lo;
  const a = Math.max(0, start - CONTEXT_CHARS);
  const b = Math.min(s.text.length, end + CONTEXT_CHARS);
  const context =
    (a > 0 ? '…' : '') + s.text.slice(a, b).replace(/\s+/g, ' ') + (b < s.text.length ? '…' : '');
  return { paragraph: s.index, start, end, text, ordinal, context };
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function byPosition(a: Location, b: Location): number {
  return a.paragraph - b.paragraph || a.start - b.start;
}

function compareFindings(a: Finding, b: Finding): number {
  const kind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (kind !== 0) return kind;
  if (a.kind === 'undefined' || a.kind === 'lowercase') {
    const count = b.locations.length - a.locations.length;
    if (count !== 0) return count;
  }
  return a.key.localeCompare(b.key);
}

function times(n: number): string {
  return `${n} time${n === 1 ? '' : 's'}`;
}

function para(loc: Location): number {
  return loc.paragraph + 1;
}
