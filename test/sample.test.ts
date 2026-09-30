import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/analyze';
import { parseFixture } from './fixtures/parse';

const paragraphs = parseFixture(readFileSync(join(__dirname, 'fixtures', 'sample-nda.txt'), 'utf8'));

describe('the sample agreement', () => {
  const result = analyze(paragraphs);
  const byKind = (kind: string): string[] =>
    result.findings.filter((f) => f.kind === kind).map((f) => f.term);

  it('finds the 6 planted problems and nothing else', () => {
    expect(result.findings.map((f) => `${f.kind}: ${f.term}`)).toEqual([
      'undefined: Project',
      'undefined: Steering Committee',
      'unused: Business Day',
      'duplicate: Survival Period',
      'before-definition: Compelled Disclosure',
      'lowercase: Representatives',
    ]);
  });

  it('counts the uses of the undefined term', () => {
    const project = result.findings.find((f) => f.term === 'Project');
    expect(project?.locations).toHaveLength(3);
    expect(byKind('undefined')).toEqual(['Project', 'Steering Committee']);
  });

  it('reads all 15 defined terms', () => {
    expect(result.terms.map((t) => t.term)).toEqual([
      'Acme',
      'Affiliate',
      'Agreement',
      'Beta',
      'Business Day',
      'Compelled Disclosure',
      'Confidential Information',
      'Discloser',
      'Effective Date',
      'Parties',
      'Party',
      'Purpose',
      'Recipient',
      'Representatives',
      'Survival Period',
    ]);
    expect(result.stats).toMatchObject({ paragraphs: paragraphs.length, terms: 15, ignored: 0 });
  });

  it('is quiet once the planted terms are ignored', () => {
    const ignored = analyze(paragraphs, {
      ignore: [
        'Project',
        'Steering Committee',
        'Business Day',
        'Survival Period',
        'Compelled Disclosure',
        'Representatives',
      ],
    });
    expect(ignored.findings).toEqual([]);
    expect(ignored.stats.ignored).toBe(6);
  });
});
