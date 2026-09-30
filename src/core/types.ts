/** One paragraph of the document, as the Word API reports it. */
export interface ParagraphInput {
  text: string;
  /** Heading, title or table-of-contents style. */
  heading?: boolean;
}

/** Where something is in the document, in terms the Word search API can find again. */
export interface Location {
  /** Index into the paragraph array that was analyzed. */
  paragraph: number;
  start: number;
  end: number;
  /** The exact substring at [start, end). */
  text: string;
  /** How many earlier occurrences of `text` the same paragraph has. */
  ordinal: number;
  /** A short snippet around the match, for display. */
  context: string;
}

/**
 * How a definition was written.
 *  - list:      the term opens the paragraph or line, as in a definitions list ("Business Day": a day ...)
 *  - means:     "X" means / shall mean / refers to / is defined as ...
 *  - reference: "X" has the meaning given in clause 3 (points somewhere else)
 *  - inline:    Acme Corp. (the "Company"), or "referred to as the "Company""
 *  - includes:  "X" includes ... (enlarging; counts as a definition only when nothing better exists)
 */
export type DefinitionForm = 'list' | 'means' | 'reference' | 'inline' | 'includes';

export interface Definition {
  term: string;
  key: string;
  form: DefinitionForm;
  /** Weak definitions ("includes", unquoted parentheticals) never count towards a duplicate. */
  weak: boolean;
  location: Location;
}

export type FindingKind = 'undefined' | 'unused' | 'duplicate' | 'before-definition' | 'lowercase';

export interface Finding {
  kind: FindingKind;
  /** Display form of the term. */
  term: string;
  key: string;
  message: string;
  locations: Location[];
}

export interface AnalysisOptions {
  /** Treat 'single quoted' phrases as possible defined terms (UK drafting). Default true. */
  singleQuotes?: boolean;
  /** Report lowercase uses of defined terms. Default true. */
  checkLowercase?: boolean;
  /** Terms to leave out of every finding, in any casing. */
  ignore?: string[];
}

export interface TermSummary {
  term: string;
  key: string;
  uses: number;
}

export interface AnalysisResult {
  findings: Finding[];
  terms: TermSummary[];
  stats: {
    paragraphs: number;
    terms: number;
    ignored: number;
  };
}
