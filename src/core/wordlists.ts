// Word lists that keep ordinary capitalized words out of the findings.
// Everything is lowercase; compare against normalizeWord() output.

/** Lowercase words allowed inside a defined term: "Board of Directors", "Terms and Conditions". */
export const TERM_CONNECTORS = new Set([
  'of', 'and', 'or', 'the', 'for', 'in', 'to', 'on', 'at', 'by', 'with', 'from', 'under', 'a',
  'an', 'this', '&', 'de', 'la', 'du', 'von', 'van', 'der',
]);

/**
 * Lowercase words that may join two capitalized words into one undefined candidate.
 * "and" and "or" are left out on purpose: "Buyer and Seller" is two terms far more often than one.
 */
export const RUN_JOINERS = new Set(['of', 'for', 'in', 'on', '&']);

/** Never a defined term on their own, even in quotes: a stray quote mark can wrap "The" or "And". */
export const NEVER_A_TERM = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'and', 'or', 'but', 'nor', 'of', 'in', 'on', 'at',
  'for', 'to', 'by', 'with', 'from', 'as', 'if', 'so', 'not', 'no', 'it', 'its', 'we', 'our', 'us', 'you',
  'your', 'he', 'she', 'his', 'her', 'they', 'their', 'them', 'is', 'are', 'be',
]);

/** Capitalized only because they open a sentence; never a defined term on their own. */
export const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'each', 'every', 'any', 'all', 'no', 'none',
  'some', 'such', 'both', 'either', 'neither', 'in', 'on', 'at', 'for', 'if', 'unless', 'until',
  'where', 'whereas', 'whether', 'when', 'whenever', 'while', 'whilst', 'subject',
  'notwithstanding', 'upon', 'except', 'save', 'provided', 'nothing', 'it', 'its', 'they', 'their',
  'them', 'we', 'our', 'us', 'you', 'your', 'he', 'she', 'his', 'her', 'i', 'as', 'by', 'to',
  'with', 'from', 'under', 'between', 'further', 'however', 'therefore', 'accordingly', 'also',
  'following', 'during', 'after', 'before', 'within', 'without', 'pursuant', 'not', 'there',
  'here', 'hereby', 'hereunder', 'herein', 'hereto', 'hereof', 'thereafter', 'thereof', 'thereto',
  'so', 'then', 'thus', 'yes', 'please', 'see', 'note', 'and', 'or', 'but', 'nor', 'only', 'once',
  'since', 'because', 'although', 'though', 'even', 'being', 'having', 'other', 'another', 'same',
  'first', 'second', 'third', 'last', 'next', 'new', 'one', 'two', 'three', 'per', 'via', 'versus',
  'vs', 'now', 'about', 'above', 'below', 'against', 'among', 'into', 'through', 'over', 'more',
  'less', 'most', 'least', 'many', 'much', 'few', 'several', 'various', 'certain', 'said', 'shall',
  'should', 'will', 'would', 'may', 'might', 'must', 'can', 'could', 'do', 'does', 'did', 'done',
  'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'like', 'who', 'whom', 'whose',
  'which', 'what', 'how', 'why', 'nevertheless', 'otherwise', 'moreover', 'likewise',
  'immediately', 'promptly', 'failing', 'absent', 'regardless', 'irrespective',
]);

/** Form and signature-block labels: "Name:", "Date:", "Address:". Never a colon-form definition. */
export const LABEL_WORDS = new Set([
  'name', 'title', 'date', 'by', 'address', 'email', 'e-mail', 'phone', 'telephone', 'tel', 'fax',
  'attention', 'attn', 'subject', 're', 'cc', 'signature', 'signed', 'witness', 'notes', 'example',
  'examples', 'warning', 'caution', 'important', 'reminder', 'summary', 'comment', 'comments',
  'answer', 'question', 'version', 'status', 'page', 'total', 'amount', 'url', 'website', 'web',
  'link', 'reference', 'ref', 'number', 'no', 'contact', 'contacts', 'location', 'position',
]);

/** What brackets hold when they define nothing: "(Reserved)", "(Optional)", "(Continued)". */
export const PAREN_LABELS = new Set([
  'reserved', 'optional', 'continued', 'confidential', 'draft', 'deleted', 'omitted',
  'intentionally', 'revised', 'amended', 'sample', 'sic', 'emphasis', 'applicable', 'mandatory',
  'tbd', 'tba', 'none', 'attached', 'enclosed', 'copy', 'original', 'duplicate', 'final', 'signed',
  'unsigned', 'redacted', 'illegible', 'blank', 'left', 'right', 'above', 'below',
]);

/** "Clause 32.8(c)", "Section 3": a cross-reference with its number, as a regex source. */
export const CROSSREF_SOURCE = String.raw`\b(?:Clause|Section|Schedule|Paragraph|Part|Article|Annex|Appendix|Exhibit|Recital|Chapter)s?\s+\d[\w.()]*`;

/** Cross-reference words. "Section 3", "Schedule 2" and "this Clause" are not defined terms. */
export const STRUCTURAL_WORDS = new Set([
  'section', 'sections', 'subsection', 'subsections', 'clause', 'clauses', 'sub-clause',
  'sub-clauses', 'subclause', 'subclauses', 'article', 'articles', 'schedule', 'schedules',
  'exhibit', 'exhibits', 'annex', 'annexes', 'annexure', 'annexures', 'appendix', 'appendices',
  'paragraph', 'paragraphs', 'sub-paragraph', 'sub-paragraphs', 'recital', 'recitals', 'chapter',
  'chapters', 'attachment', 'attachments', 'part', 'parts', 'item', 'items', 'page', 'pages',
  'table', 'tables', 'figure', 'figures', 'rule', 'rules', 'regulation', 'regulations', 'addendum',
  'addenda', 'preamble', 'introduction', 'background',
]);

export const CALENDAR_WORDS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'sunday', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

/**
 * A capitalized phrase with one of these anywhere names a legal instrument: "Protocol to Prevent,
 * Suppress and Punish Trafficking in Persons", "Trafficking Victims Protection Act". "Code" and
 * "Order" are left out because "Code of Conduct" and "Purchase Order" are ordinary defined terms.
 */
export const INSTRUMENT_WORDS = new Set([
  'act', 'acts', 'protocol', 'convention', 'treaty', 'charter', 'declaration', 'statute',
  'statutes', 'regulations', 'regulation', 'directive', 'directives', 'ordinance', 'amendment',
  'constitution', 'rules',
]);

/** Legal-form endings. A multi-word phrase containing one is a party name, not a term. */
export const CORPORATE_SUFFIXES = new Set([
  'inc', 'llc', 'l.l.c', 'ltd', 'limited', 'corp', 'corporation', 'incorporated', 'plc', 'gmbh',
  'ag', 'sa', 's.a', 'nv', 'n.v', 'bv', 'b.v', 'lp', 'l.p', 'llp', 'l.l.p', 'lllp', 'pty', 'pte',
  'co', 'srl', 's.r.l', 'sas', 'sarl', 'oy', 'ab', 'kk', 'k.k', 'se', 'ulc', 'pllc', 'p.c', 'pc',
  'ltda', 'spa', 's.p.a', 'aps', 'a/s', 'ehf', 'sdn', 'bhd', 'dac', 'gp',
]);

export const HONORIFICS = new Set([
  'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'messrs', 'sir', 'dame', 'hon', 'rev', 'lord', 'lady',
  'judge', 'justice',
]);

/** Address endings. "100 Main Street" is a place, not a term. */
export const STREET_TAILS = new Set([
  'street', 'avenue', 'road', 'lane', 'drive', 'boulevard', 'blvd', 'suite', 'floor', 'plaza',
  'square', 'terrace', 'parkway', 'highway', 'building', 'tower', 'crescent', 'gardens', 'park',
]);

/** All-caps tokens that are never defined terms. Compared with the dots removed, so "U.S." is "us". */
export const ACRONYM_STOP = new Set([
  'usa', 'uk', 'us', 'eu', 'un', 'usd', 'eur', 'gbp', 'cad', 'aud', 'inr', 'jpy', 'chf', 'vat',
  'gst', 'irs', 'sec', 'am', 'pm', 'id', 'na', 'ok', 'pdf', 'url', 'http', 'https', 'www', 'it',
  'hr', 'ceo', 'cfo', 'cto', 'coo', 'cio', 'vp', 'svp', 'evp', 'md', 'esq', 'jr', 'sr', 'no',
  'nos', 're', 'cc', 'ps', 'nb', 'ie', 'eg', 'etc', 'tbd', 'tbc', 'llc', 'plc', 'ltd', 'gmbh',
  'inc', 'lp', 'llp', 'dc', 'ny', 'ca', 'tx', 'fl', 'il', 'ma', 'pa', 'nj', 'wa', 'ga', 'nc',
  'va', 'oh', 'mi', 'az', 'co', 'mn', 'wi', 'mo', 'or', 'ct', 'de', 'nv', 'ut', 'sw', 'ne', 'nw',
  'se', 'st', 'ave', 'rd', 'po', 'zip', 'fax', 'tel', 'attn', 'ref', 'usc', 'cfr', 'far', 'dfars',
  'ucc', 'gaap', 'ifrs', 'iso', 'ansi', 'ieee', 'ascii', 'html', 'xml', 'json', 'api', 'sla',
]);

/**
 * Public bodies and well-known agencies, as they appear in government and cross-border contracts.
 * Compared by whole phrase, so "Comptroller General" and "USAID" are skipped but "General" is not.
 */
export const PUBLIC_BODIES = new Set([
  'congress', 'parliament', 'senate', 'house of representatives', 'treasury', 'comptroller general',
  'attorney general', 'secretary of state', 'inspector general', 'contracting officer',
  'federal government', 'federal reserve', 'internal revenue service',
  'securities and exchange commission', 'department of state', 'department of defense',
  'department of defence', 'department of justice', 'department of labor',
  'department of the treasury', 'department of commerce', 'department of homeland security',
  'department of health and human services', 'department of energy', 'department of education',
  'department of transportation', 'general services administration',
  'government accountability office', 'small business administration',
  'office of management and budget', 'office of foreign assets control',
  'united states agency for international development', 'european commission',
  'european parliament', 'european council', 'council of the european union', 'united nations',
  'united nations security council', 'world bank', 'international monetary fund',
  'world health organization', 'world trade organization', 'supreme court', 'high court',
  'court of appeals', 'court of appeal', 'district court', 'crown court', 'companies house',
  'information commissioner', 'financial conduct authority', 'prudential regulation authority',
  'usaid', 'ofac', 'gao', 'gsa', 'sba', 'omb', 'fda', 'epa', 'dod', 'doj', 'dol', 'dhs', 'hhs',
  'doe', 'faa', 'fcc', 'ftc', 'fbi', 'nasa', 'nih', 'nsf', 'osha', 'hud', 'cms', 'cdc', 'oecd',
  'wto', 'imf', 'who', 'nato', 'unicef', 'undp', 'ico', 'fca', 'pra', 'hmrc', 'us government',
  'united states government', 'government of the united states', 'federal acquisition regulation',
  'code of federal regulations', 'united states code', 'specially designated nationals',
  'blocked persons list', 'specially designated nationals and blocked persons list',
  'sanctions list', 'consolidated list', 'entity list', 'denied persons list',
  'foreign terrorist organization', 'foreign terrorist organizations', 'security council',
  'general assembly', 'european union', 'african union', 'world food programme',
  'international committee of the red cross', 'red cross', 'red crescent',
  'international centre for dispute resolution', 'international chamber of commerce',
  'london court of international arbitration', 'american arbitration association',
  'permanent court of arbitration', 'international court of justice', 'icc', 'lcia', 'aaa', 'icdr',
  'uncitral', 'icsid', 'jams',
]);

/** Political and geographic initialisms. "US Government", "EU Sanctions List" and "UN Security Council" are names. */
export const GEO_ACRONYMS = new Set(['us', 'usa', 'uk', 'eu', 'un', 'uae', 'prc', 'gcc', 'au', 'oecd']);

/** Words that cite a regulation; the capitalized clause title after them is not a term. */
export const CITATION_WORDS = new Set(['far', 'dfars', 'cfr', 'usc', 'aidar', 'ar', 'fam', 'ads']);

const US_STATES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware',
  'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky',
  'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico',
  'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia',
  'puerto rico', 'guam',
];

const COUNTRIES = [
  'united states', 'united states of america', 'america', 'united kingdom', 'great britain',
  'britain', 'england', 'wales', 'scotland', 'northern ireland', 'ireland', 'canada', 'australia',
  'new zealand', 'india', 'singapore', 'hong kong', 'china', 'japan', 'korea', 'south korea',
  'germany', 'france', 'spain', 'italy', 'netherlands', 'belgium', 'luxembourg', 'switzerland',
  'austria', 'sweden', 'norway', 'denmark', 'finland', 'poland', 'portugal', 'greece', 'israel',
  'united arab emirates', 'dubai', 'saudi arabia', 'south africa', 'brazil', 'mexico', 'argentina',
  'chile', 'europe', 'european union', 'asia', 'africa', 'cayman islands', 'bermuda', 'jersey',
  'guernsey', 'isle of man', 'british virgin islands', 'philippines', 'indonesia', 'malaysia',
  'thailand', 'vietnam', 'taiwan', 'turkey', 'egypt', 'nigeria', 'kenya', 'pakistan', 'bangladesh',
  'ukraine', 'russia', 'colombia', 'peru', 'ghana', 'ethiopia', 'tanzania', 'uganda', 'afghanistan',
  'iraq', 'jordan', 'lebanon', 'haiti', 'guatemala', 'honduras', 'nepal', 'sri lanka', 'cambodia',
];

const CITIES = [
  'london', 'new york city', 'manhattan', 'brooklyn', 'wilmington', 'chicago', 'san francisco',
  'los angeles', 'boston', 'houston', 'dallas', 'austin', 'miami', 'atlanta', 'seattle', 'denver',
  'toronto', 'vancouver', 'sydney', 'melbourne', 'paris', 'berlin', 'frankfurt', 'munich',
  'amsterdam', 'zurich', 'geneva', 'dublin', 'edinburgh', 'manchester', 'birmingham', 'mumbai',
  'bangalore', 'bengaluru', 'delhi', 'new delhi', 'tokyo', 'shanghai', 'beijing', 'tel aviv',
  'durham', 'raleigh', 'charlotte', 'philadelphia', 'phoenix', 'san diego', 'san jose',
  'columbus', 'portland', 'salem', 'eugene', 'sacramento', 'oakland', 'las vegas', 'reno', 'tucson',
  'albuquerque', 'santa fe', 'salt lake city', 'boise', 'helena', 'cheyenne', 'bismarck', 'pierre',
  'lincoln', 'omaha', 'topeka', 'kansas city', 'oklahoma city', 'tulsa', 'little rock',
  'baton rouge', 'new orleans', 'jackson', 'montgomery', 'tallahassee', 'orlando', 'tampa',
  'jacksonville', 'gainesville', 'nashville', 'memphis', 'louisville', 'frankfort', 'indianapolis',
  'detroit', 'lansing', 'milwaukee', 'madison', 'minneapolis', 'saint paul', 'st. paul',
  'des moines', 'st. louis', 'saint louis', 'springfield', 'cleveland', 'cincinnati', 'pittsburgh',
  'harrisburg', 'baltimore', 'annapolis', 'richmond', 'norfolk', 'charleston', 'columbia',
  'savannah', 'hartford', 'providence', 'albany', 'buffalo', 'trenton', 'newark', 'concord',
  'augusta', 'montpelier', 'burlington', 'anchorage', 'juneau', 'honolulu', 'dover', 'san antonio',
  'el paso', 'fort worth', 'arlington', 'alexandria', 'bethesda', 'mclean', 'reston',
  'silver spring', 'fairfax', 'cambridge', 'oxford', 'leeds', 'glasgow', 'belfast', 'cardiff',
  'bristol', 'ottawa', 'montreal', 'calgary', 'brussels', 'vienna', 'madrid', 'barcelona', 'rome',
  'milan', 'lisbon', 'stockholm', 'oslo', 'copenhagen', 'helsinki', 'warsaw', 'prague', 'budapest',
  'athens', 'istanbul', 'cairo', 'nairobi', 'lagos', 'johannesburg', 'cape town', 'karachi',
  'lahore', 'dhaka', 'colombo', 'kathmandu', 'jakarta', 'manila', 'bangkok', 'hanoi', 'seoul',
  'taipei', 'kuala lumpur', 'riyadh', 'doha', 'abu dhabi', 'mexico city', 'bogota', 'lima',
  'santiago', 'buenos aires', 'sao paulo', 'rio de janeiro', 'kyiv', 'moscow',
];

/** Place names in lowercase, single and multi-word. */
export const PLACES = new Set([...US_STATES, ...COUNTRIES, ...CITIES]);

/** Words that may sit in front of a place name: "State of Delaware", "Courts of England". */
export const PLACE_PREFIXES = new Set([
  'state', 'commonwealth', 'city', 'county', 'district', 'republic', 'kingdom', 'province',
  'territory', 'borough', 'courts', 'court', 'laws', 'law', 'bank', 'port', 'university',
  'federal', 'people', 'peoples', 'government',
]);

export const ROMAN_NUMERAL_RE = /^M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;

// The longest entries, so the two loops below never walk a long phrase word by word.
const MAX_PLACE_WORDS = Math.max(...[...PLACES].map((p) => p.split(' ').length));
const MAX_BODY_WORDS = Math.max(...[...PUBLIC_BODIES].map((p) => p.split(' ').length));

/** "Delaware", "State of New York", "Courts of England": a place name, with or without a prefix. */
export function isPlaceName(lowers: string[]): boolean {
  for (let k = Math.min(lowers.length, MAX_PLACE_WORDS); k >= 1; k--) {
    if (!PLACES.has(lowers.slice(-k).join(' '))) continue;
    // "England and Wales", "State of New York": whatever sits in front is a prefix word or another place.
    const head = lowers.slice(0, -k).filter((w) => !RUN_JOINERS.has(w) && w !== 'the' && w !== 'and');
    return head.every((w) => PLACE_PREFIXES.has(w) || PLACES.has(w));
  }
  return false;
}

/** "Congress", "Comptroller General", "USAID Office of Inspector General", "EU Sanctions List". */
export function isPublicBody(lowers: string[]): boolean {
  const bare = lowers.map((w) => w.replace(/\./g, ''));
  for (let k = 1; k <= Math.min(bare.length, MAX_BODY_WORDS); k++) {
    if (PUBLIC_BODIES.has(bare.slice(0, k).join(' ')) || PUBLIC_BODIES.has(bare.slice(-k).join(' ')))
      return true;
  }
  return bare.length > 1 && GEO_ACRONYMS.has(bare[0]);
}
