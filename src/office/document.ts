import type { Location, ParagraphInput } from '../core/types';

export type TextSource = 'getText' | 'reviewed' | 'plain';

export interface DocumentSnapshot {
  paragraphs: ParagraphInput[];
  /** getText (WordApi 1.7) leaves out hidden text and tracked deletions, reviewed (1.4) only deletions. */
  textSource: TextSource;
}

export type SelectOutcome = 'selected' | 'moved' | 'paragraph' | 'stale';

const HEADING_STYLE_RE = /^(?:Heading\d|Title|Subtitle|Toc\d|TocHeading)$/;
const MAX_SEARCH_LENGTH = 255;

export function isSupported(): boolean {
  return Office.context.requirements.isSetSupported('WordApi', '1.3');
}

/** The highest WordApi requirement set this host offers, for the footer. */
export function apiVersion(): string {
  for (const v of ['1.9', '1.8', '1.7', '1.6', '1.5', '1.4', '1.3']) {
    if (Office.context.requirements.isSetSupported('WordApi', v)) return v;
  }
  return 'unknown';
}

function textSource(): TextSource {
  if (Office.context.requirements.isSetSupported('WordApi', '1.7')) return 'getText';
  if (Office.context.requirements.isSetSupported('WordApi', '1.4')) return 'reviewed';
  return 'plain';
}

// 2 round trips: the paragraph list, then clean text, since Paragraph.text may include tracked deletions.
export async function readDocument(): Promise<DocumentSnapshot> {
  return Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load('items/text,items/styleBuiltIn');
    await context.sync();

    const source = textSource();
    const clean: OfficeExtension.ClientResult<string>[] = [];
    if (source !== 'plain') {
      for (const p of paragraphs.items) {
        clean.push(
          source === 'getText'
            ? p.getText({ includeHiddenText: false, includeTextMarkedAsDeleted: false })
            : p.getReviewedText(Word.ChangeTrackingVersion.current),
        );
      }
      await context.sync();
    }

    return {
      paragraphs: paragraphs.items.map((p, i) => ({
        text: clean[i]?.value ?? p.text,
        heading: HEADING_STYLE_RE.test(p.styleBuiltIn),
      })),
      textSource: source,
    };
  });
}

/** Selects one occurrence found by the analysis, coping with a document that changed since then. */
export async function selectLocation(loc: Location): Promise<SelectOutcome> {
  if (loc.text.length === 0 || loc.text.length > MAX_SEARCH_LENGTH) return 'stale';
  const needle = loc.text.replace(/\^/g, '^^');
  return Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    // Loading one small scalar is what materialises items. The text is not needed here.
    paragraphs.load('items/tableNestingLevel');
    await context.sync();

    const paragraph = paragraphs.items[loc.paragraph];
    if (paragraph) {
      const hits = paragraph.search(needle, { matchCase: true });
      hits.load('items');
      await context.sync();
      const hit = hits.items[loc.ordinal];
      if (hit) {
        hit.select(Word.SelectionMode.select);
        await context.sync();
        return 'selected';
      }
    }

    const everywhere = context.document.body.search(needle, { matchCase: true });
    everywhere.load('items');
    await context.sync();
    if (everywhere.items.length === 1) {
      everywhere.items[0].select(Word.SelectionMode.select);
      await context.sync();
      return 'moved';
    }
    if (paragraph) {
      paragraph.select(Word.SelectionMode.select);
      await context.sync();
      return 'paragraph';
    }
    return 'stale';
  });
}

/** A short message for the pane. The full Office error goes to the console. */
export function describeError(error: unknown): string {
  if (error instanceof OfficeExtension.Error) {
    console.error('Office error', error.code, error.message, error.debugInfo);
    switch (error.code) {
      case 'AccessDenied':
        return 'Word did not allow the add-in to read this document.';
      case 'ItemNotFound':
        return 'That part of the document is gone. Run the check again.';
      case 'SearchStringInvalidOrTooLong':
        return 'Word could not search for that text.';
      default:
        return `Word reported an error (${error.code}). Try again.`;
    }
  }
  console.error(error);
  return error instanceof Error ? error.message : 'Something went wrong.';
}
