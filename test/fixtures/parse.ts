import type { ParagraphInput } from '../../src/core/types';

// "# " marks a heading paragraph, "| " a table cell (read like any paragraph), "//" a comment.
export function parseFixture(text: string): ParagraphInput[] {
  const paragraphs: ParagraphInput[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line === '' || line.startsWith('//')) continue;
    if (line.startsWith('# ')) paragraphs.push({ text: line.slice(2), heading: true });
    else if (line.startsWith('| ')) paragraphs.push({ text: line.slice(2) });
    else paragraphs.push({ text: line });
  }
  return paragraphs;
}
