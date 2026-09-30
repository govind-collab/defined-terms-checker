# Design notes

## The shape

Three layers, one direction of dependency:

```
src/taskpane   DOM, state, rendering            depends on core + office
src/office     Word.run, search, select, storage depends on core types only
src/core       pure functions: paragraphs in, findings out   no Office anywhere
```

The core holds the rules, and its tests run in Node in about a second. The Office layer reads the paragraphs,
selects a finding, reports the API version and maps Office errors, and the ignore list lives beside it in
`storage.ts`. The pane is plain DOM code with a small `el()` helper and no framework.

Data flow for one check:

```
Word.run  ->  paragraphs (text, style)  ->  clean text per paragraph
          ->  analyze(paragraphs, options)
                tokenize            words, offsets, sentence starts, list markers
                findDefinitions     quoted and unquoted definition shapes
                TermIndex.matchAll  uses of every defined term
                collectCandidates   capitalized phrases that are not defined terms
                findings            5 kinds, each with locations
          ->  pane renders; a click calls selectLocation(location)
```

## Read-only, on purpose

Litera Contract Companion underlines issues in the text and Deal Proof has a "Clean" command to remove its
marks. With track changes on, every mark is a formatting change in the redline the other side gets, and a
missed one stays in the signed copy.

So this add-in selects text and writes nothing. The ignore list follows the same rule: `Office.context.document.settings`
would be the idiomatic place, but settings are saved into the `.docx`, so the list lives in the task pane's
`localStorage` under the document URL instead. An unsaved document has no URL and keeps its list for the
session only.

The manifest still asks for `ReadWriteDocument`. Microsoft's permissions page is explicit: "If your add-in
uses the application-specific APIs, declare the read/write document permission in the manifest. This
requirement applies even when your code only reads data."

## What counts as a definition

Contracts mark a defined term with quotes, bold, capitals, or some mix, and the meaning follows one of a
few patterns. The API hands over plain text, so quotes and capitals are the signals; bold is not visible
without a second, much heavier round trip for run formatting.

A term-shaped phrase (`parseTerm`) is 1 to 8 words, each capitalized, a number, or a connector such as
"of" between capitalized words. This is what keeps `the words "include" and "including"` from becoming 2
phantom terms, which is the most common false positive in real interpretation clauses.

The shapes, in the order they are tested:

| Shape     | Example                                                           | Notes                                                                                    |
| --------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| reference | `"Broker" has the meaning set forth in Section 11.1`              | Points at another definition. Counts as defined, never towards a duplicate.              |
| means     | `"Affiliate", in relation to a person, shall collectively mean`   | Up to 80 characters of aside and an adverb are allowed between the term and the trigger. |
| carve-out | `"Confidential Information" does not include ...`                 | Not a definition at all, whatever position it sits in.                                   |
| includes  | `"Losses" includes reasonable legal fees`                         | Enlarging rather than exhaustive. Weak: counts only if nothing fuller exists.            |
| list      | `"Business Day": a day on which ...` at the start of a line       | Also `Working Day means ...` and `Charges: the charges ...` with no quotes, the UK form. |
| inline    | `Acme Corp. (the "Company")`, `referred to as the "Parties"`      | Inside brackets or after a lead-in phrase.                                               |
| brackets  | `(the Products)`, `Acme Inc. (Vendor)`, `Statement of Work (SOW)` | No quotes at all. Weak: defined, but never a duplicate and never reported unused.        |

`"X" and "Y" mean` defines both. Inside brackets, the text before the quote
decides: `(the`, `(each a`, `(collectively,` say definition; `(as defined in the`, `(including the`,
`(within the meaning of the` say reference. The capitalized phrase in front of a bracketed definition is
the thing being named, so `Statement of Work ("SOW")` also records "Statement of Work" (weak) instead of
reporting it as undefined. Party names and places are left out of that.

Brackets without quotes are read word by word: lead-ins ("each", "together", "referred to as"), articles,
separators (",", "and", "or") and capitalized phrases are allowed, and any other word turns the bracket
into an aside ("(subject to the Conditions)", "(see Section 3)") that defines nothing. An all-caps content
is an acronym and counts only when its letters are the initials of the phrase before the bracket: `United
States Agency for International Development (USAID)` defines both, `the services (ABC)` defines neither.

The unquoted colon form needs care, because `Note: see below`, `Date: 1 May 2026`, `Contractor: Acme Ltd`
and the run-in heading `Scope of Work: The Contractor shall ...` all look like `Charges: the charges set
out in Schedule 2`. The meaning after a colon starts in lowercase (or with a number), a heading's sentence
and a contact line start with a capital; the term is at most 4 words; and a one-word term must not be a
function word, a cross-reference word, a form label or an all-caps token ("URL:"), with at least 3 words of
meaning after it.

## Matching uses

Matching is aligned to whole tokens, so "Sub-Licensee" is not a use of "Licensee" and "Tier 2 Support" is
not "Tier 1 Support". Words are compared through `normalizeWord` (case, curly apostrophes, possessives,
trailing periods, accent composition, and invisible format characters such as soft hyphens and zero-width
spaces, which Word and pasted text leave inside words) and, on the last word only, through a small
singularizer applied to both sides, so it only has to map "Parties" and "Party" to the same key and leave
"Business" and "Basis" alone.

At each position the longest term wins, and among terms of the same length an exact form beats a plural
fudge. That is what makes "third party" a lowercase use of "Third Party" rather than of "Party", and what
keeps "Terms" (terms and conditions) apart from "Term" (duration) when both are defined. That holds for
matching. The unused check still treats a singular and its plural as one family, so a "Term" that is defined
but only ever used as "Terms" is not reported.

A term inside the sentence that defines it counts as part of the definition. `"Agreement" means this
agreement` is normal drafting (Weagree's rule against circular definitions says in terms that it does not
apply to the non-capitalised term inside the definition); `"Affiliate" means an Affiliate of a Party`
should still be reported as unused if nothing else refers to it. The window is the
definition's sentence: an indemnity clause that says `(each an "Indemnitee")` and then
uses "Indemnitee" 3 more times in the same paragraph has 3 uses, and a `"Moral Rights" means ...` sentence
that follows the term's first use in the same paragraph does not cancel that use. Singular and plural are
one family for the unused check, so `(each a "Party" and together the "Parties")` followed by uses of
"Parties" alone leaves "Party" off the unused list. Two definitions inside one paragraph count as one
drafting event.

## Undefined terms: precision over recall

This is the one check that guesses at intent. The ContractScrub benchmark (arXiv 2608.20204, August 2026)
reports 0.51 recall on its "undefined capitalized terms" category for its best model, against 0.87 to 0.94
for the same model on the unused, uncapitalized and defined-term categories, and no model it tested passed
0.55 on undefined terms. Products in this space ship an ignore list for the same reason. The rules below drop
a candidate whenever there is doubt.

- A run is consecutive capitalized words separated by whitespace only. "of", "for", "in", "on", "&" and
  numbers join words ("Board of Directors", "Tier 2 Support"); "and" and "or" do not, because "Buyer and
  Seller" is 2 terms far more often than 1.
- A run is split at the defined terms inside it. "Board of Directors of the Company" gives the candidate
  "Board of Directors" and leaves "Company" as a use. "Support Services" with only "Services" defined is
  reported whole, because the longer phrase is the likelier term.
- The first word of a sentence is dropped unless the same word is capitalized somewhere mid-sentence in the
  document. "The Effective Date" becomes "Effective Date"; "Confidential Materials shall ..." survives when
  "Confidential Materials" also appears mid-sentence. Sentence starts include the word after a list marker
  such as "(b)" and after a manual line break.
- Headings, all-caps lines, and lines of up to 12 words with no closing punctuation (titles, table cells,
  signature blocks) never produce candidates. "the Services; and" keeps its status as a list item. Run-in
  headings inside a paragraph are excluded too: the Title Case segment that opens a line and ends in ":"
  or "." before a capital letter, as in "Representations, Warranties and Additional Covenants. Contractor
  represents ..." or "Scope of Work: The Contractor shall ...".
- A possessive ends a phrase. "Contractor's Authorized Representative" reports "Authorized
  Representative", and "the Dependent's guardian" reports "Dependent".
- Stop lists remove cross-references ("Section 3", "this Schedule"), place names with their prefixes ("State
  of Delaware", "Courts of England", "England and Wales"), company names by their legal suffix, statutes and
  other instruments by any of their words or a following year ("Companies Act 2006", "Protocol to Prevent,
  Suppress and Punish Trafficking in Persons": every capitalized phrase later in that sentence is part of
  the title), cited clause titles ("FAR 52.203-19 Prohibition on ...", "Section 5 – Tender Package"),
  public bodies and agencies ("Congress", "Comptroller General", "USAID Office of Inspector General"),
  geographic initialisms in front of a phrase ("U.S. Government", "EU Sanctions List"), months and weekdays,
  honorifics, common acronyms compared without their dots ("U.S.", "U.S.A."), street addresses, clause
  titles in brackets after a cross-reference (`Clause 32.8(c) (Payments by the Supplier)`), a defined name
  followed by a place ("Mercy Corps Nigeria"), and the text of any heading or all-caps paragraph, the
  document's own title included, wherever that phrase appears.
- A single word must appear twice, a phrase once. Adams says not to define a term that is used only once,
  and the reverse holds too: a capitalized word used once is usually a name.
- A run longer than 8 words, the same limit a defined term has, is a title or a list and produces nothing.
  This is also what keeps a pathological paragraph (thousands of capitalized words in a row) from taking
  minutes: every per-phrase check is bounded by the longest entry in its word list.

The first run on a real contract, a public 166-paragraph government-funded service agreement, produced 55
undefined-term findings; the rules above brought it to 19, of which "Services", "Vendor", "Parties",
"SOW", "Agreement" and "Donor Terms" are real gaps in that document. The rest of that run's noise
(relatives in a per-diem table, a cover-page label with a value on the same line) is what the ignore list
is for.

What still gets through: committee names, product names, job titles, courts not on the list. Those are
what the ignore list is for, and the pane says so under the heading.

## Word API choices

- 2 round trips to read. One `load` for `text` and `styleBuiltIn` across the whole body, then one batch of
  per-paragraph calls for clean text. `Paragraph.text` is not documented either way on tracked deletions,
  so the clean text is asked for explicitly: `getText()` on WordApi 1.7 leaves out hidden text and tracked
  deletions, `getReviewedText(current)` on 1.4 to 1.6 leaves out deletions, and below that the raw text is
  used and the pane says so. The manifest asks for 1.3 and the rest is feature-detected with
  `isSetSupported`.
- Navigation by paragraph and ordinal. A finding stores the paragraph index, the exact substring and how
  many earlier occurrences of that substring the paragraph has. Selecting it loads the paragraph list
  through one cheap scalar (any loaded property populates `items`), searches inside that paragraph with
  `matchCase`, and takes the n-th hit. Word's search finds non-overlapping occurrences, and so does the
  `indexOf` loop that computed the ordinal, so the two agree. `^` is escaped and strings over 255 characters
  are refused, per the search API's limits.
- Documents change between the check and the click. If the paragraph no longer has that occurrence, the
  add-in searches the whole body. A single hit is selected and reported as moved, otherwise the paragraph
  is selected, and if even that is gone the pane says to run the check again.
- XML add-in-only manifest. The unified manifest now supports Word on Windows, but only on subscription
  builds, and it cannot be sideloaded from a network share. The XML manifest works on subscription Word, on
  perpetual Word 2021 and later, on Mac and on the web, and it is the one a colleague can drop into a shared
  folder.
- `Office.onReady` rather than `Office.initialize`, plus a check that office.js loaded at all and a host
  check, so the pane says something sensible if the CDN was unreachable or it is opened outside Word.
  Office errors are mapped to a short message and the `debugInfo` goes to the console.

## Sentences the rules were tested against

Real drafting, mostly from SEC filings, Law Insider and drafting guides, most of them tests in `test/`:

| Sentence                                                                                        | Expected                                                       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `"Seller's Affiliates" shall collectively mean (i) BP Phase2 LLC and (ii) LH Boulevard LLC`     | defines "Seller's Affiliates"; the LLC names are nothing       |
| `"1445 Affidavit" has the meaning set forth in Section 6.2(b)`                                  | defines, by reference; the term starts with a number           |
| `"Affiliate", in relation to a person, means any entity`                                        | defines, with the aside                                        |
| `The term "control" (including the terms "controlled by" and "controlling") means`              | nothing: lowercase words in quotes                             |
| `Working Day means a day other than a Saturday`                                                 | defines, no quotes                                             |
| `Tier 1 Support means the identification of Issues`                                             | defines "Tier 1 Support"; "Tier 2 Support" is a different term |
| `Allowable Price Adjustment has the meaning given in Clause 32.8(c) (Payments by the Supplier)` | defines; the bracketed clause title is not a term              |
| `each being referred to individually as a "Party" and collectively as the "Parties"`            | defines both, no brackets needed                               |
| `(as defined in the "Master Agreement")`                                                        | nothing: a reference                                           |
| `"Excluded Assets" means the assets in Schedule 4, but does not include the Retained Cash`      | defines; "Retained Cash" is a use                              |
| `A Party may not disclose to any third party, and a Third Party has no rights`                  | one lowercase use of "Third Party", none of "Party"            |
| `IN NO EVENT SHALL SELLER BE LIABLE FOR CONSEQUENTIAL DAMAGES`                                  | nothing                                                        |
| `The Companies Act 2006 applies. The Board of Directors meets monthly.`                         | "Board of Directors" is a candidate; the statute is not        |
| `The Company shall deliver the Products by the Delivery Date`                                   | 3 uses; "The" does not join "Company"                          |
| `Acme Holdings Inc. and Beta GmbH agree. Mr Smith signs.`                                       | nothing                                                        |
| `Name: Jane Doe` / `Date: 1 May 2026 at the offices of Acme`                                    | nothing: labels, not colon definitions                         |

The rest of the suite is in `test/`, and `test/fixtures/sample-nda.txt` is a short agreement with 6 planted
problems that the end-to-end test checks are the only 6 reported.

## What I would add next

- Bold runs. For the few paragraphs that contain `(the X)` without quotes, fetch the paragraph OOXML and
  read the `<w:b/>` runs, so bankers' style definitions become strong instead of weak.
- Headers, footers and footnotes, through the sections API and `footnotes` (WordApi 1.5). Contracts rarely
  define terms there, but they do use them.
- A cross-reference check next to the definitions check: does `clause 4.1` exist, and is it still about
  what the sentence says it is.
- A definitions panel: click a use, see the definition without leaving the page.
