import { describe, expect, it } from 'vitest';
import { findDefinitions, findQuotedSpans, parseTerm } from '../src/core/definitions';
import { tokenize } from '../src/core/tokenize';

const defs = (text: string, singleQuotes = true): Array<[string, string, boolean]> =>
  findDefinitions(text, tokenize(text), singleQuotes).definitions.map((d) => [d.term, d.form, d.weak]);
const quoted = (text: string, singleQuotes = true): string[] =>
  findQuotedSpans(text, singleQuotes).map((q) => q.term);

describe('parseTerm', () => {
  it('accepts the shapes defined terms take', () => {
    for (const t of [
      'Agreement',
      'Confidential Information',
      'Board of Directors',
      'Terms and Conditions',
      "Seller's Knowledge",
      'Tier 1 Support',
      '1445 Affidavit',
      'Non-Disclosure Agreement',
      'U.S. Person',
      'IPR',
      'Change in Control',
    ]) {
      expect(parseTerm(t)?.term, t).toBe(t);
    }
  });

  it('rejects ordinary words and non-terms', () => {
    for (const t of [
      'including',
      'the Company',
      'controlled by',
      'a',
      '2026',
      'Fee (Annual)',
      '',
      'One Two Three Four Five Six Seven Eight Nine',
    ]) {
      expect(parseTerm(t), t).toBeNull();
    }
  });

  it('normalizes spacing and case in the key', () => {
    expect(parseTerm('Effective  Date')).toEqual({ term: 'Effective Date', key: 'effective date' });
  });
});

describe('findQuotedSpans', () => {
  it('reads straight, curly and single quotes', () => {
    expect(quoted('the "Agreement" and the “Effective Date” and the ‘Business Day’')).toEqual([
      'Agreement',
      'Effective Date',
      'Business Day',
    ]);
  });

  it('does not mistake apostrophes for single quotes', () => {
    expect(quoted("the Company's obligations and the Supplier's rights")).toEqual([]);
    expect(quoted("'Seller's Knowledge' means")).toEqual(["Seller's Knowledge"]);
  });

  it('can be told to ignore single quotes', () => {
    expect(quoted("'Business Day' means", false)).toEqual([]);
  });

  it('skips lowercase phrases, long spans and unmatched quotes', () => {
    expect(quoted('the words "include" and "including" shall be')).toEqual([]);
    expect(quoted('“Agreement means the “Master Agreement” dated')).toEqual(['Master Agreement']);
    expect(quoted('"' + 'Long '.repeat(40) + 'Term"')).toEqual([]);
  });

  it('trims punctuation that sits inside the quotes', () => {
    expect(quoted('(the "Company.")')).toEqual(['Company']);
    expect(findQuotedSpans('x (the "Company.")', true)[0]).toMatchObject({ termStart: 8, termEnd: 15 });
  });
});

describe('findDefinitions: definitions-section forms', () => {
  it('finds "means" and its variants', () => {
    expect(defs('"Business Day" means a day other than a Saturday.')).toEqual([
      ['Business Day', 'means', false],
    ]);
    expect(defs('"Fee" shall mean the amount in Schedule 1.')).toEqual([['Fee', 'means', false]]);
    expect(defs('"Affiliate", in relation to a person, means any entity.')).toEqual([
      ['Affiliate', 'means', false],
    ]);
    expect(
      defs('"Seller\'s Affiliates" shall collectively mean (i) BP Phase2 LLC and (ii) LH Boulevard LLC.'),
    ).toEqual([["Seller's Affiliates", 'means', false]]);
    expect(defs('"Services" refers to the services in Schedule 2.')).toEqual([['Services', 'means', false]]);
    expect(defs('"Closing" shall be construed as the completion of the sale.')).toEqual([
      ['Closing', 'means', false],
    ]);
  });

  it('finds definitions by cross-reference', () => {
    expect(defs('"1445 Affidavit" has the meaning set forth in Section 6.2(b).')).toEqual([
      ['1445 Affidavit', 'reference', false],
    ]);
    expect(defs('"Broker" has the meaning set forth in Section 11.1.')).toEqual([
      ['Broker', 'reference', false],
    ]);
    expect(defs('"Company" has the meaning given in the preamble.')).toEqual([
      ['Company', 'reference', false],
    ]);
    expect(defs('"Tax" is as defined in the Tax Deed.')).toEqual([['Tax', 'reference', false]]);
  });

  it('finds the colon and list forms', () => {
    expect(defs('"Business Day": a day other than a Saturday.')).toEqual([['Business Day', 'list', false]]);
    expect(defs('1.1 "Agreement": this agreement.')).toEqual([['Agreement', 'list', false]]);
    expect(defs('(a) "Losses" – all losses.')).toEqual([['Losses', 'list', false]]);
  });

  it('tells a definitions entry from a quoted term that opens a sentence', () => {
    expect(defs('"Business Day" a day other than a Saturday.')).toEqual([['Business Day', 'list', false]]);
    expect(defs('"Business Day"')).toEqual([['Business Day', 'list', false]]);
    expect(defs('"Confidential Information" shall be returned on request.')).toEqual([]);
    expect(defs('"Confidential Information" Recipient shall return it.')).toEqual([]);
    expect(defs('"The "Company" Group" means the group.')).toEqual([]);
  });

  it('handles several terms defined together', () => {
    expect(defs('"Agreement" and "Contract" mean this document.').map((d) => d[0])).toEqual([
      'Agreement',
      'Contract',
    ]);
    expect(defs('"Agreement" (or "Contract") means this document.').map((d) => d[0])).toEqual([
      'Agreement',
      'Contract',
    ]);
  });

  it('treats "includes" as a weak definition and "does not include" as none', () => {
    expect(defs('"Losses" includes reasonable legal fees.')).toEqual([['Losses', 'includes', true]]);
    expect(defs('"Confidential Information" does not include information in the public domain.')).toEqual([]);
    expect(defs('"Confidential Information" shall not include public information.')).toEqual([]);
  });
});

describe('findDefinitions: inline forms', () => {
  it('finds parenthetical definitions', () => {
    expect(defs('Acme Corp. (the "Company") and Beta LLC ("Beta").').map((d) => d[0])).toEqual([
      'Company',
      'Beta',
    ]);
    expect(defs('(each a "Party" and together the "Parties")').map((d) => d[0])).toEqual([
      'Party',
      'Parties',
    ]);
    expect(defs('Acme (hereinafter referred to as the "Licensor")')).toEqual([['Licensor', 'inline', false]]);
    expect(defs('the deliverables (collectively, the "Documents")')).toEqual([
      ['Documents', 'inline', false],
    ]);
    expect(defs('Acme (together with its Affiliates, "Buyer Group")')).toEqual([
      ['Acme', 'inline', true],
      ['Buyer Group', 'inline', false],
    ]);
    expect(defs('on 1 January 2026 (such date, the "Closing Date")')).toEqual([
      ['Closing Date', 'inline', false],
    ]);
  });

  it('finds "referred to as" definitions without parentheses', () => {
    expect(
      defs(
        'Acme and Beta, each being referred to individually as a "Party" and collectively as the "Parties".',
      ).map((d) => d[0]),
    ).toEqual(['Party', 'Parties']);
    expect(defs('Acme Corp., hereinafter "Seller", agrees')).toEqual([['Seller', 'inline', false]]);
  });

  it('does not treat a reference inside parentheses as a definition', () => {
    expect(defs('the fee (as defined in the "Master Agreement")')).toEqual([]);
    expect(defs('the documents (including the "Standard Terms")')).toEqual([]);
    expect(defs('(within the meaning of the "Act")')).toEqual([]);
  });

  it('names the phrase in front of a quoted parenthetical as a weak definition', () => {
    expect(defs('the Statement of Work ("SOW") attached')).toEqual([
      ['Statement of Work', 'inline', true],
      ['SOW', 'inline', false],
    ]);
    // Party names and places are not terms, so they are left out.
    expect(defs('Acme Analytics Inc., a Delaware corporation ("Acme")')).toEqual([['Acme', 'inline', false]]);
  });
});

describe('findDefinitions: brackets without quotes', () => {
  it('reads "(the Products)", "(Vendor)" and lists of them as weak definitions', () => {
    expect(defs('Acme sells goods (the Products) to Beta.')).toEqual([['Products', 'inline', true]]);
    expect(defs('Acme Inc. (Vendor) shall deliver.')).toEqual([['Vendor', 'inline', true]]);
    expect(defs('the parties (the Supplier or the Customer)')).toEqual([
      ['Supplier', 'inline', true],
      ['Customer', 'inline', true],
    ]);
    expect(defs('Acme and Beta (each a Party and together the Parties) agree.')).toEqual([
      ['Party', 'inline', true],
      ['Parties', 'inline', true],
    ]);
  });

  it('reads an acronym after its long form', () => {
    expect(defs('the Statement of Work (SOW) attached')).toEqual([
      ['Statement of Work', 'inline', true],
      ['SOW', 'inline', true],
    ]);
    expect(defs('funded by the United States Agency for International Development (USAID).')).toEqual([
      ['United States Agency for International Development', 'inline', true],
      ['USAID', 'inline', true],
    ]);
    expect(defs('the Office of Foreign Assets Control (OFAC)').map((d) => d[0])).toEqual([
      'Office of Foreign Assets Control',
      'OFAC',
    ]);
    expect(defs('the services (ABC) listed')).toEqual([]);
  });

  it('leaves labels, cross-references, places and asides alone', () => {
    for (const text of [
      '3.4 (Reserved)',
      'see the pricing (Exhibit A) attached',
      'Portland (Oregon)',
      'the fee (see Section 3)',
      'the goods (subject to the Conditions)',
      'the documents (including the Standard Terms)',
      'Clause 32.8(c) (Payments by the Supplier)',
      'the notice (Attachment 2)',
      '(a) the first item',
    ]) {
      expect(defs(text), text).toEqual([]);
    }
  });
});

describe('findDefinitions: unquoted UK style', () => {
  it('finds a capitalized phrase followed by means at the start of a line', () => {
    expect(defs('Working Day means a day other than a Saturday.')).toEqual([['Working Day', 'means', false]]);
    expect(defs('Tier 1 Support means the identification of Issues.')).toEqual([
      ['Tier 1 Support', 'means', false],
    ]);
    expect(
      defs('Allowable Price Adjustment has the meaning given in Clause 32.8(c) (Payments by the Supplier)'),
    ).toEqual([['Allowable Price Adjustment', 'reference', false]]);
    expect(defs('Working Day: any day other than a Saturday.')).toEqual([['Working Day', 'list', false]]);
    expect(defs('Charges: the charges set out in Schedule 2.')).toEqual([['Charges', 'list', false]]);
    expect(defs('Purpose: evaluation of the Products.')).toEqual([['Purpose', 'list', false]]);
  });

  it('does not read ordinary sentences as definitions', () => {
    expect(defs('This means that the Supplier must deliver.')).toEqual([]);
    expect(defs('Note: the following applies.')).toEqual([]);
    expect(defs('Date: 1 May 2026 at the offices of Acme.')).toEqual([]);
    expect(defs('The Supplier shall deliver the Products.')).toEqual([]);
  });

  it('tells a colon definition from a run-in heading, a contact line and a label', () => {
    expect(defs('Effective Date: 1 May 2026')).toEqual([['Effective Date', 'list', false]]);
    expect(defs('Scope of Work: The Contractor shall deliver the Services.')).toEqual([]);
    expect(defs('Contractor: Acme Nigeria Limited')).toEqual([]);
    expect(defs('Key Personnel: The Contractor names the following people.')).toEqual([]);
    expect(defs('URL: https://example.com/terms/2026')).toEqual([]);
    expect(defs('Authorized Representatives and Contact Information: the people named below.')).toEqual([]);
  });

  it('finds one definition per line inside a paragraph with line breaks', () => {
    expect(defs('Working Day means a day.\vBusiness Hours means 9 to 5.').map((d) => d[0])).toEqual([
      'Working Day',
      'Business Hours',
    ]);
  });
});

describe('findDefinitions: things that are not definitions', () => {
  it('ignores quoted lowercase words in interpretation clauses', () => {
    expect(
      defs(
        'the words "include", "includes" and "including" shall be deemed to be followed by "without limitation"',
      ),
    ).toEqual([]);
    expect(
      defs(
        'The term "control" (including the terms "controlled by" and "controlling") means the possession of power.',
      ),
    ).toEqual([]);
  });

  it('records a quoted mention without making it a definition', () => {
    const text = 'the agreement titled "Master Services Agreement" dated 1 May 2026';
    const result = findDefinitions(text, tokenize(text), true);
    expect(result.definitions).toEqual([]);
    expect(result.quoted.map((q) => q.term)).toEqual(['Master Services Agreement']);
  });
});
