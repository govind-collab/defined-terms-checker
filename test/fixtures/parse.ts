import type { ParagraphInput } from '../../src/core/types';

/**
 * Reads a fixture in the small text format used for sample documents:
 *   # Heading text      a heading paragraph
 *   | cell text         a table cell
 *   // comment          ignored
 *   anything else       a body paragraph; blank lines are skipped
 */
export function parseFixture(text: string): ParagraphInput[] {
  const paragraphs: ParagraphInput[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line === '' || line.startsWith('//')) continue;
    if (line.startsWith('# ')) paragraphs.push({ text: line.slice(2), heading: true });
    else if (line.startsWith('| ')) paragraphs.push({ text: line.slice(2), inTable: true });
    else paragraphs.push({ text: line });
  }
  return paragraphs;
}
