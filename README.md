# Defined Terms Checker

A Word add-in that reads a contract and lists what is wrong with its defined terms: terms used but never
defined, defined but never used, defined twice, used before the parenthetical that defines them, and
written in lowercase. It does not change the document and nothing leaves Word. The analysis runs in the
task pane on the text the Word API hands over.

![The task pane after a check](docs/pane.png)

The rules come from how contracts are actually drafted (Adams' _A Manual of Style for Contract Drafting_,
UK and US precedents) and from the false positives that make tools of this kind tiring to use:
sentence-initial capitals, headings, party names, "Section 3", "the State of Delaware", all-caps clauses.

## What it finds

| Finding                           | What it means                                                                                                                        | In `samples/sample-nda.docx`                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Used but never defined            | A capitalized term with no definition anywhere. A single word needs 2 uses, a phrase 1.                                              | "Project" (3 uses) and "Steering Committee" |
| Defined but never used            | A definition nothing refers to, usually left behind when a clause was deleted or pasted in from another document                     | "Business Day"                              |
| Defined more than once            | 2 full definitions of one term. Cross-references ("has the meaning given in clause 3") and "includes" do not count                   | "Survival Period"                           |
| Used before its inline definition | Used earlier than the parenthetical that defines it                                                                                  | "Compelled Disclosure"                      |
| Lowercase uses                    | The words of a defined term without their capitals. Not reported inside the term's own definition ("Agreement" means this agreement) | "representatives"                           |

Each finding lists its occurrences with a bit of context. Clicking one selects the text in the document. A
term can be put on an ignore list, kept per document.

## Try it

You need Node 20 or newer and Word (Microsoft 365 on Windows or Mac, or Word on the web).

```bash
npm install
npm start
```

`npm start` builds the add-in, serves it from `https://localhost:3000` and sideloads it into desktop Word.
The first run asks to trust a development certificate; that comes from the Office add-in tooling, not from
this project. Open `samples/sample-nda.docx`, go to the Home tab, click **Check Terms**, then **Check
document**. You should see the 6 findings in the table above. `npm run stop` removes the sideloaded add-in.

In Windows PowerShell with script execution disabled, `npm` itself is blocked (`npm.ps1 cannot be loaded`);
use `npm.cmd start`, or run the commands from Command Prompt.

If `npm start` cannot launch Word on your machine, run `npm run dev-server` and sideload `manifest.xml` by
hand: on Windows through a shared-folder catalog, in Word on the web through Add-ins, Upload My Add-in. The
Microsoft docs describe both under "Sideload Office Add-ins for testing".

## How it works

`src/core` is plain TypeScript with no dependency on Office. It takes an array of paragraphs and returns
findings, so the whole of it is tested in Node. `src/office` is the only code that talks to Word: it reads
the paragraphs and selects a location. `src/taskpane` draws the pane.

### Definitions

A definition is a term-shaped phrase (capitalized words, with connectors such as "of" allowed) in one of
these positions:

- `"Business Day" means ...`, also `shall mean`, `refers to`, `is defined as`, and with words in between:
  `"Affiliate", in relation to a person, means ...`
- `"Broker" has the meaning given in clause 11`, a cross-reference. It counts as a definition and never as
  a duplicate.
- `"Business Day": a day on which ...` or `Business Day means ...` at the start of a line, with or without
  quotes, the UK style.
- `Acme Corp. (the "Company")`, `(each a "Party" and together the "Parties")`, `hereinafter referred to
as the "Licensor"`.
- Brackets with no quotes at all: `(the Products)`, `Acme Inc. (Vendor)`, `(each a Party and together the
Parties)`, and an acronym after its long form, `Statement of Work (SOW)`. These are weak: they count as
  definitions, but never towards a duplicate, and a term named only this way is never reported as unused.
- `"Losses" includes ...`, which counts only when there is no fuller definition.

`"Confidential Information" does not include ...` is a carve-out, not a definition. Quoted lowercase words,
as in `the words "include" and "including"`, are never terms. A run-in heading with a colon, `Scope of
Work: The Contractor shall ...`, and a contact line, `Contractor: Acme Ltd`, are not definitions either:
the meaning after a colon starts in lowercase, a heading's sentence does not.

### Uses

Matching is aligned to whole words and case-insensitive, with a plural or possessive allowed on the last
word. At any position the longest term wins, so "third party" is matched to "Third Party" and not to
"Party". "Party" and "Parties" are one family for the unused check.

### Undefined terms

Runs of capitalized words that are not defined terms, minus the usual noise: the first word of a sentence
unless it is capitalized elsewhere mid-sentence, headings, run-in headings ("Scope of Work: The
Contractor shall ...") and all-caps clauses, "Section 3" and "Schedule 2", place names, company names
ending in Inc. or Limited, statutes and treaties and the long titles that follow them, cited clause titles
("FAR 52.203-19 Prohibition on ..."), public bodies ("Congress", "Comptroller General", "USAID"),
geographic initialisms ("U.S. Government", "EU Sanctions List"), months, honorifics, common acronyms,
street addresses and the document's own title. A possessive ends a phrase, so "Contractor's Authorized
Representative" reports "Authorized Representative". A single word has to appear twice; a phrase once.

### Reading the document

2 round trips: one for the paragraph list, one for clean text. Word with API set 1.7 gives text without
hidden text and tracked deletions; 1.4 to 1.6 gives text with tracked deletions removed; older Word gives
the raw text and the pane says so. Selecting a finding searches inside its paragraph for the n-th occurrence
of the text, so a term that appears twice in one paragraph lands on the right one. If the document changed
since the check, the add-in falls back to a whole-document search and tells you what it did.

The reasons behind these choices, and the sentences the rules were tested against, are in
[docs/design.md](docs/design.md).

## What it does not do

- It does not touch the document. No highlights, no comments, no settings written into the file. A review
  tool that edits the document shows up in the client's redline.
- Body text only. Headers, footers, footnotes, comments and text boxes are not read.
- Bold as a signal. `(the Products)` in bold with no quotes is caught by the unquoted parenthetical rule,
  which is weaker; the formatting itself is not read.
- Languages other than English. German capitalizes every noun, so the undefined-term check is noise there.
- Names it has not heard of. "Steering Committee" is reported as undefined even when it is a real
  committee, and a court or a product name may be too. The ignore list is the answer for those.

## Commands

| Command                      | What it does                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `npm test`                   | 99 tests: tokenizer, definitions, matcher, analyzer, and the sample agreement |
| `npm run lint`               | ESLint (type-aware) and Prettier                                              |
| `npm run typecheck`          | `tsc --noEmit`                                                                |
| `npm run build`              | Production bundle in `dist/`, about 38 KB of JavaScript                       |
| `npm run validate`           | Office manifest validation                                                    |
| `npm start` / `npm run stop` | Sideload into desktop Word / remove it again                                  |

To host the add-in somewhere other than localhost, set `ADDIN_URL` for the build:
`ADDIN_URL=https://example.com/terms/ npm run build` rewrites the URLs in `dist/manifest.xml`.

## Layout

| Path                      | What it is                                                                |
| ------------------------- | ------------------------------------------------------------------------- |
| `src/core/tokenize.ts`    | Words with offsets, sentence starts, list markers                         |
| `src/core/definitions.ts` | The definition shapes above                                               |
| `src/core/matcher.ts`     | Term index: longest match, plurals, possessives, casing                   |
| `src/core/analyze.ts`     | Puts it together and produces the findings                                |
| `src/core/wordlists.ts`   | Connectors, structural words, places, suffixes and the other stop lists   |
| `src/office/document.ts`  | Read paragraphs, select a location, explain an Office error               |
| `src/office/storage.ts`   | The per-document ignore list                                              |
| `src/taskpane/`           | The pane: HTML, CSS and the rendering code                                |
| `test/`                   | Vitest suites and the sample agreement fixture                            |
| `samples/sample-nda.docx` | The fixture as a Word document, with 6 planted problems                   |
| `manifest.xml`            | Add-in manifest (XML, so it sideloads everywhere, shared folder included) |

## License

MIT.
