import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/analyze';
import type { AnalysisOptions, AnalysisResult, FindingKind, ParagraphInput } from '../src/core/types';

type Para = string | ParagraphInput;

const run = (paragraphs: Para[], options?: AnalysisOptions): AnalysisResult =>
  analyze(
    paragraphs.map((p) => (typeof p === 'string' ? { text: p } : p)),
    options,
  );
const terms = (result: AnalysisResult, kind: FindingKind): string[] =>
  result.findings.filter((f) => f.kind === kind).map((f) => f.term);
/** The findings of one kind, after checking there are no findings of any other kind. */
const only = (result: AnalysisResult, kind: FindingKind): string[] => {
  const others = result.findings.filter((f) => f.kind !== kind);
  expect(others.map((f) => `${f.kind}:${f.term}`)).toEqual([]);
  return terms(result, kind);
};

// Five definitions and one sentence that uses all five. Paragraph indexes 0 to 5.
const BASE = [
  '"Agreement" means this agreement.',
  '"Confidential Information" means any information disclosed by one Party to the other Party.',
  '"Party" means a party to this Agreement.',
  '"Purpose" means the evaluation of a possible business relationship.',
  '"Effective Date" means 1 May 2026.',
  'Each Party shall use the Confidential Information only for the Purpose under this Agreement from the Effective Date.',
];

describe('analyze: a clean document', () => {
  it('reports nothing when every term is defined and used', () => {
    const result = run([
      ...BASE,
      'Each Party shall use the Confidential Information only for the Purpose.',
      'This Agreement starts on the Effective Date and binds both Parties.',
    ]);
    expect(result.findings).toEqual([]);
    expect(result.stats).toMatchObject({ paragraphs: 8, terms: 5, ignored: 0 });
    expect(result.terms.map((t) => [t.term, t.uses])).toEqual([
      ['Agreement', 3],
      ['Confidential Information', 2],
      ['Effective Date', 2],
      ['Party', 5],
      ['Purpose', 2],
    ]);
  });

  it('handles empty input and empty paragraphs', () => {
    expect(run([]).findings).toEqual([]);
    expect(run(['', '   ', 'no capitals here at all.']).findings).toEqual([]);
  });
});

describe('analyze: used but never defined', () => {
  it('reports a capitalized word used more than once with no definition', () => {
    const result = run([
      ...BASE,
      'The Supplier shall deliver the goods to the Party.',
      'If the Supplier is late, the Supplier pays a penalty.',
    ]);
    expect(only(result, 'undefined')).toEqual(['Supplier']);
    expect(result.findings[0].locations).toHaveLength(3);
    expect(result.findings[0].locations[0]).toMatchObject({ paragraph: 6, text: 'Supplier', ordinal: 0 });
    expect(result.findings[0].message).toBe('Used 3 times as a capitalized term but never defined.');
  });

  it('needs two uses for a single word but one for a phrase', () => {
    const result = run([...BASE, 'The Party shall pay Wilmington the Termination Fee.']);
    expect(only(result, 'undefined')).toEqual(['Termination Fee']);
  });

  it('drops the sentence-opening word unless it is capitalized mid-sentence elsewhere', () => {
    const result = run([...BASE, 'The Termination Fee is due. Each Party pays the Termination Fee.']);
    expect(only(result, 'undefined')).toEqual(['Termination Fee']);
    const kept = run([
      ...BASE,
      'Confidential Materials shall be returned. The Party keeps no Confidential Materials.',
    ]);
    expect(only(kept, 'undefined')).toEqual(['Confidential Materials']);
  });

  it('reports a longer phrase built around a defined term', () => {
    const result = run([
      '"Services" means the services in Schedule 1.',
      'The Support Services are part of the Services and the Services are billed monthly.',
    ]);
    expect(only(result, 'undefined')).toEqual(['Support Services']);
    expect(result.terms[0].uses).toBe(3);
  });

  it('joins words with "of" but not with "and"', () => {
    const result = run([
      '"Company" means Acme Limited.',
      'The Board of Directors of the Company meets monthly. The Board of Directors decides.',
      'The Buyer and Seller shall each sign. The Buyer pays and Seller delivers.',
    ]);
    expect(only(result, 'undefined')).toEqual(['Board of Directors', 'Buyer', 'Seller']);
  });

  it('keeps a number inside a phrase but not after a cross-reference word', () => {
    const result = run([
      'The Tier 2 Support is provided under Section 3 Supplier terms. Tier 2 Support is limited.',
    ]);
    expect(only(result, 'undefined')).toEqual(['Tier 2 Support']);
  });

  it('ignores headings, all-caps lines and short titles', () => {
    const result = run([
      { text: 'Confidential Information', heading: true },
      'IN NO EVENT SHALL THE SUPPLIER BE LIABLE FOR CONSEQUENTIAL LOSS.',
      'Schedule of Fees',
      'Termination Fee',
      'Termination Fee',
      'THIS AGREEMENT is made on 1 May 2026 between the parties named below.',
    ]);
    expect(result.findings).toEqual([]);
  });

  it('ignores cross-references, places, statutes, company names and honorifics', () => {
    const result = run([
      'See Section 3.1, Schedule 2, Exhibit A and this Clause. The Companies Act 2006 and the Data Protection Regulations apply.',
      'Governed by the laws of the State of Delaware and the Courts of England. Acme Holdings Inc. and Beta GmbH agree. Mr Smith signs.',
      'Section 3.1, Schedule 2 and Exhibit A are repeated here, as is the State of Delaware and Acme Holdings Inc. and Mr Smith.',
      'Payments are due under Clause 32.8(c) (Payments by the Supplier) and Clause 32.8(c) (Payments by the Supplier).',
    ]);
    expect(result.findings).toEqual([]);
  });

  it('reports a phrase after a statute once the sentence ends', () => {
    const result = run(['The Companies Act 2006 applies. The Board of Directors meets monthly.']);
    expect(only(result, 'undefined')).toEqual(['Board of Directors']);
  });

  it('reports an undefined acronym but not common ones', () => {
    const result = run([
      'The SOW lists the work. Each SOW is signed. The price is in USD and the company is an LLC in the USA.',
      'Prices in USD are exclusive of VAT, and the LLC in the USA pays.',
    ]);
    expect(only(result, 'undefined')).toEqual(['SOW']);
  });

  it('does not count a quoted title or a quoted mention', () => {
    const result = run([
      ...BASE,
      'The document titled "Master Services Agreement" is separate. The "Master Services Agreement" governs pricing.',
    ]);
    expect(result.findings).toEqual([]);
  });
});

describe('analyze: defined but never used', () => {
  it('reports a definition with no use', () => {
    const result = run([...BASE, '"Business Day" means a day when banks are open.']);
    expect(only(result, 'unused')).toEqual(['Business Day']);
    expect(result.findings[0].locations[0]).toMatchObject({ paragraph: 6, text: 'Business Day' });
    expect(result.findings[0].message).toBe('Defined in paragraph 7 but never used.');
  });

  it('credits the singular when only the plural is used, and the other way round', () => {
    const result = run([
      'Acme and Beta (each a "Party" and together the "Parties") agree.',
      'The Parties shall cooperate. The Parties may terminate.',
    ]);
    expect(result.findings).toEqual([]);
    const reverse = run([
      '"Business Days" means days when banks are open.',
      'Notice is due within 5 Business Day periods, and again within 3 Business Days.',
    ]);
    expect(reverse.findings).toEqual([]);
  });

  it('does not count the term inside its own definition as a use', () => {
    const result = run([
      '"Affiliate" means an Affiliate of a Party.',
      '"Party" means a party. A Party may assign.',
    ]);
    expect(only(result, 'unused')).toEqual(['Affiliate']);
  });

  it('keeps the definition sentence open across an abbreviation', () => {
    const result = run([
      '"Dollars" means U.S. dollars.',
      '"Affiliate" means, as to Acme Inc., any Affiliate of Acme Inc. controlled by it.',
      'All Dollars are paid on the Effective Date.',
      '"Effective Date" means 1 May 2026.',
    ]);
    expect(only(result, 'unused')).toEqual(['Affiliate']);
  });
});

describe('analyze: defined more than once', () => {
  it('reports two strong definitions of one term', () => {
    const result = run([
      '"Confidential Information" means information marked confidential.',
      'The receiving party keeps the confidential material (the "Confidential Information") secret.',
      'Confidential Information must be returned.',
    ]);
    expect(only(result, 'duplicate')).toEqual(['Confidential Information']);
    expect(result.findings[0].locations.map((l) => l.paragraph)).toEqual([0, 1]);
    expect(result.findings[0].message).toBe('Defined 2 times, in paragraphs 1, 2.');
  });

  it('treats a quoted phrase with a missing capital as a lowercase use, not a second definition', () => {
    const result = run([
      '"Confidential Information" means information marked confidential.',
      'The receiving party keeps the "Confidential information" secret.',
    ]);
    expect(only(result, 'lowercase')).toEqual(['Confidential Information']);
  });

  it('does not count a cross-reference, an "includes" or an unquoted parenthetical as a duplicate', () => {
    const result = run([
      'Acme Corp. (the "Company") sells goods (the Products).',
      '"Company" has the meaning given in the preamble.',
      '"Losses" means all losses. "Losses" includes legal fees.',
      'The Company pays the Losses for the Products.',
    ]);
    expect(result.findings).toEqual([]);
  });
});

describe('analyze: used before its inline definition', () => {
  it('reports a use before a parenthetical definition', () => {
    const result = run([
      { text: 'Recipient Obligations', heading: true },
      'The Recipient shall keep the information secret.',
      'Acme (the "Recipient") receives information from Beta (the "Discloser").',
      'The Discloser may audit the Recipient.',
    ]);
    expect(only(result, 'before-definition')).toEqual(['Recipient']);
    expect(result.findings[0].locations).toEqual([expect.objectContaining({ paragraph: 1 })]);
    expect(result.findings[0].message).toBe('Used 1 time before its definition in paragraph 3.');
  });

  it('does not report a use before a weak long-form definition', () => {
    const result = run([
      'The Contractor prepares a Statement of Work for each project.',
      'Work is described in the Statement of Work ("SOW"). The SOW is signed by both sides.',
    ]);
    expect(result.findings).toEqual([]);
  });

  it('stays quiet when the term also has a definitions-section entry', () => {
    const result = run([
      'The Recipient shall keep the information secret.',
      '"Recipient" has the meaning given in clause 5.',
      'Acme (the "Recipient") receives information.',
    ]);
    expect(result.findings).toEqual([]);
  });
});

describe('analyze: lowercase uses', () => {
  it('reports a lowercase use of a defined term', () => {
    const result = run([...BASE, 'The confidential information shall be returned to the Party.']);
    expect(only(result, 'lowercase')).toEqual(['Confidential Information']);
    expect(result.findings[0].locations[0]).toMatchObject({ text: 'confidential information', paragraph: 6 });
    expect(result.findings[0].message).toBe(
      'Written in lowercase 1 time; the defined term is "Confidential Information".',
    );
  });

  it('matches the longest defined term first', () => {
    const result = run([
      '"Party" means a party to this agreement. "Third Party" means anyone else.',
      'A Party may not disclose to any third party, and a Third Party has no rights.',
    ]);
    expect(only(result, 'lowercase')).toEqual(['Third Party']);
  });

  it("allows the lowercase word inside the term's own definition and in all-caps text", () => {
    const result = run([
      '"Agreement" means this agreement between the parties.',
      'THIS AGREEMENT IS GOVERNED BY ENGLISH LAW. The Agreement is binding.',
    ]);
    expect(result.findings).toEqual([]);
  });

  it('can be switched off', () => {
    const result = run([...BASE, 'The confidential information is returned to the Party.'], {
      checkLowercase: false,
    });
    expect(result.findings).toEqual([]);
  });
});

describe('analyze: options', () => {
  it('ignores a term and its plural across every finding', () => {
    const paragraphs = [
      ...BASE,
      'The Supplier and the Suppliers shall deliver to the Party. The Supplier is paid and the Suppliers are paid.',
    ];
    const before = run(paragraphs);
    expect(only(before, 'undefined')).toEqual(['Supplier']);
    expect(before.findings[0].locations).toHaveLength(4);
    const result = run(paragraphs, { ignore: ['supplier'] });
    expect(result.findings).toEqual([]);
    expect(result.stats.ignored).toBe(1);
  });

  it('can leave single quotes alone', () => {
    const paragraphs = ["'Business Day' means a day.", 'Notice is due within 5 Business Days.'];
    expect(run(paragraphs).findings).toEqual([]);
    const result = run(paragraphs, { singleQuotes: false });
    expect(only(result, 'undefined')).toEqual(['Business Day']);
    expect(result.findings[0].locations).toHaveLength(2);
  });
});

describe('analyze: locations', () => {
  it('numbers repeated text so the Word search can find the right occurrence', () => {
    const result = run([
      '"Party" means a party. "Third Party" means a stranger.',
      'Party and Third Party and Party.',
    ]);
    expect(result.terms.find((t) => t.key === 'party')?.uses).toBe(2);
    expect(result.terms.find((t) => t.key === 'third party')?.uses).toBe(1);
    const lowercase = run(['"Party" means a party.', 'party and Party and party.']);
    const finding = lowercase.findings.find((f) => f.kind === 'lowercase');
    expect(finding?.locations.map((l) => [l.text, l.ordinal])).toEqual([
      ['party', 0],
      ['party', 1],
    ]);
  });

  it('adds a short context around each location', () => {
    const result = run([
      ...BASE,
      'A long sentence about the Supplier that goes on for a while before it ends. The Supplier again.',
    ]);
    const [first] = result.findings[0].locations;
    expect(first.context).toContain('Supplier');
    expect(first.context.startsWith('…')).toBe(false);
    expect(first.context.endsWith('…')).toBe(true);
  });
});

describe('analyze: UK drafting', () => {
  it('reads unquoted definitions and colon-form lists', () => {
    const result = run([
      'Working Day means a day other than a Saturday, Sunday or public holiday in England.',
      'Charges: the charges set out in Schedule 2.',
      'The Supplier shall respond within 2 Working Days and invoice the Charges. The Supplier keeps records.',
    ]);
    expect(only(result, 'undefined')).toEqual(['Supplier']);
  });

  it('does not treat a clause title in brackets as a term', () => {
    const result = run([
      'Allowable Price Adjustment has the meaning given in Clause 32.8(c) (Payments by the Supplier).',
      'The Allowable Price Adjustment is paid under Clause 32.8(c) (Payments by the Supplier).',
    ]);
    expect(result.findings).toEqual([]);
  });
});

// From a public government-funded service contract that produced 55 "never defined" findings on the first run.
describe('analyze: lessons from a real contract', () => {
  it('counts uses that follow an inline definition in the same paragraph', () => {
    const result = run([
      'The Contractor shall indemnify Mercy Corps and its officers (each an "Indemnitee") against all claims. Each Indemnitee shall notify the Contractor, and no Indemnitee may settle a claim without consent.',
      '"Contractor" means Acme Nigeria Limited. "Mercy Corps" means the buyer.',
    ]);
    expect(result.findings).toEqual([]);
    expect(result.terms.find((t) => t.key === 'indemnitee')?.uses).toBe(2);
  });

  it('accepts terms introduced in brackets without quotes', () => {
    const result = run([
      'Acme Inc. (Vendor) shall perform the work in the Statement of Work (SOW) for the United States Agency for International Development (USAID).',
      'The Vendor shall follow the SOW. USAID may audit the Vendor, and the SOW governs.',
      'Acme and Beta (each a Party and together the Parties) agree that the Parties are bound.',
    ]);
    expect(result.findings).toEqual([]);
  });

  it('does not report a term that only a weak definition names as unused', () => {
    const result = run(['Acme sells goods (the Products) to Beta.', '"Beta" means Beta Labs Limited.']);
    expect(result.findings).toEqual([]);
  });

  it('skips run-in headings, public bodies, geographic initialisms and cited clause titles', () => {
    const result = run([
      '"Contractor" means Acme Nigeria Limited.',
      'Scope of Work: The Contractor shall provide the deliverables described below.',
      'Dispute Resolution. Any dispute shall be settled by the International Centre for Dispute Resolution.',
      'Funds come from the U.S. Government and Congress, audited by the Comptroller General and the USAID Office of Inspector General.',
      'The U.S. Government, the Comptroller General and the EU Sanctions List are mentioned again, as is the UN Security Council.',
      'The Contractor complies with FAR 52.203-19 Prohibition on Requiring Certain Internal Confidentiality Agreements.',
      'The Protocol to Prevent, Suppress and Punish Trafficking in Persons, Especially Women and Children, applies, as does the Convention against Transnational Organized Crime.',
      'The Protocol to Prevent, Suppress and Punish Trafficking in Persons, Especially Women and Children, is repeated, and so is the Convention against Transnational Organized Crime.',
    ]);
    expect(terms(result, 'undefined')).toEqual([]);
  });

  it('ends a phrase at a possessive and shows the term without it', () => {
    const result = run([
      '"Contractor" means Acme Nigeria Limited.',
      "The Contractor's Authorized Representative signs. The Authorized Representative may delegate to the Dependent's guardian or the Dependent's parent.",
    ]);
    expect(only(result, 'undefined')).toEqual(['Authorized Representative', 'Dependent']);
  });

  it('skips a defined name followed by a place', () => {
    const result = run(['"Mercy Corps" means the buyer.', 'Mercy Corps Nigeria and Mercy Corps agree.']);
    expect(result.findings).toEqual([]);
  });

  it('treats two definitions inside one paragraph as one', () => {
    const result = run([
      'The Contractor names its key staff ("Key Personnel"). "Key Personnel" means the people listed in Schedule 3.',
      'Key Personnel may not be replaced without consent.',
    ]);
    expect(result.findings).toEqual([]);
    const contact = run([
      'Acme Corp. (the "Contractor") agrees.',
      'Contractor: Acme Corp., 100 Main Street, Wilmington',
      'The Contractor shall perform.',
    ]);
    expect(contact.findings).toEqual([]);
    const twice = run([
      'The parties agree an amount (the "Fee"). "Fee" means the amount in Schedule 1.',
      '"Fee" means the total amount. The Fee is due on signing.',
    ]);
    expect(only(twice, 'duplicate')).toEqual(['Fee']);
    expect(twice.findings[0].locations.map((l) => [l.paragraph, l.start])).toEqual([
      [0, 34],
      [1, 1],
    ]);
  });

  it('does not report "U.S." as an undefined term', () => {
    const result = run([
      'The U.S. Government pays in U.S. dollars. U.S. law applies to the U.S.A. and the U.S.',
    ]);
    expect(result.findings).toEqual([]);
  });
});

describe('analyze: edge cases', () => {
  it('stays fast and quiet on a paragraph of 110,000 capitalized words', () => {
    const started = Date.now();
    const result = run([...BASE, 'Contractor '.repeat(110000).trim()]);
    expect(Date.now() - started).toBeLessThan(10000);
    expect(result.findings).toEqual([]);
  });

  it('stays fast when one paragraph uses a term 32,000 times', () => {
    const started = Date.now();
    const result = run([...BASE, 'The Party agrees. '.repeat(32000).trim()]);
    expect(Date.now() - started).toBeLessThan(10000);
    const before = run(BASE).terms.find((t) => t.key === 'party')?.uses ?? 0;
    expect(result.terms.find((t) => t.key === 'party')?.uses).toBe(before + 32000);
  });

  it('does not report lowercase uses of a 1-letter term', () => {
    const result = run([
      ...BASE,
      '"A" means Schedule A to this Agreement.',
      'Each Party pays a fee and a charge.',
    ]);
    expect(result.findings).toEqual([]);
  });

  it('reads a term through a decomposed accent, a zero-width space and a soft hyphen', () => {
    const result = run([
      ...BASE,
      '"Cafe\u0301 Group" means the group of companies headed by the Party.',
      '"Non\u00adDisclosure Period" means 2 years from the Effective Date.',
      'The Café Group keeps the Confidential\u200b Information secret for the Non\u00adDisclosure Period.',
    ]);
    expect(result.findings).toEqual([]);
    expect(result.terms.map((t) => [t.term, t.uses])).toContainEqual(['Cafe\u0301 Group', 1]);
    expect(result.terms.map((t) => [t.term, t.uses])).toContainEqual(['Non\u00adDisclosure Period', 1]);
  });
});
