import { KIND_ORDER, analyze } from '../core/analyze';
import type { AnalysisResult, Finding, FindingKind, Location } from '../core/types';
import {
  apiVersion,
  describeError,
  isSupported,
  readDocument,
  selectLocation,
  type DocumentSnapshot,
  type SelectOutcome,
  type TextSource,
} from '../office/document';
import { loadIgnored, saveIgnored } from '../office/storage';

const KIND_LABELS: Record<FindingKind, string> = {
  undefined: 'Used but never defined',
  unused: 'Defined but never used',
  duplicate: 'Defined more than once',
  'before-definition': 'Used before its inline definition',
  lowercase: 'Lowercase uses of a defined term',
};

const KIND_HINTS: Record<FindingKind, string> = {
  undefined:
    'Capitalized like a defined term, with no definition anywhere. A name or a place can get through; use Ignore.',
  unused: 'A definition nothing refers to, often left behind after a clause was deleted.',
  duplicate: 'The same term defined in more than one place. Cross-references and "includes" are not counted.',
  'before-definition': 'Used earlier than the parenthetical that defines it.',
  lowercase:
    "The words of a defined term without their capitals. Inside the term's own definition this is not reported.",
};

const OUTCOME_TEXT: Record<SelectOutcome, string> = {
  selected: '',
  moved: 'That paragraph changed since the check; the one remaining match is selected.',
  paragraph: 'The text is no longer in that paragraph, so the paragraph is selected. Run the check again.',
  stale: 'That text is no longer in the document. Run the check again.',
};

const SOURCE_TEXT: Record<TextSource, string> = {
  getText: 'Hidden text and tracked deletions were left out.',
  reviewed: 'Tracked deletions were left out.',
  plain: 'Raw text; tracked deletions may be included in this version of Word.',
};

interface State {
  snapshot: DocumentSnapshot | null;
  ignored: string[];
  busy: boolean;
}

const state: State = { snapshot: null, ignored: [], busy: false };

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

// office.js comes from Microsoft's CDN. Without this check a failed load leaves a disabled button.
if (typeof Office === 'undefined') {
  setStatus(
    'Office.js did not load, so the pane cannot reach Word. Check the connection and reopen the pane.',
    'error',
  );
} else {
  void Office.onReady((info) => {
    if (info.host !== Office.HostType.Word) {
      setStatus('This add-in runs in Word.', 'error');
      return;
    }
    if (!isSupported()) {
      setStatus('This version of Word does not have the Word API 1.3 the add-in needs.', 'error');
      return;
    }
    state.ignored = loadIgnored();
    byId('version').textContent = `Word API ${apiVersion()}`;
    const check = byId<HTMLButtonElement>('check');
    check.disabled = false;
    check.addEventListener('click', () => void runCheck());
    byId('opt-single').addEventListener('change', reanalyze);
    byId('opt-lower').addEventListener('change', reanalyze);
    renderIgnored();
  });
}

async function runCheck(): Promise<void> {
  if (state.busy) return;
  setBusy(true);
  setStatus('Reading the document…');
  try {
    state.snapshot = await readDocument();
    reanalyze();
    setStatus('');
  } catch (error) {
    setStatus(describeError(error), 'error');
  } finally {
    setBusy(false);
  }
}

function reanalyze(): void {
  if (!state.snapshot) return;
  const result = analyze(state.snapshot.paragraphs, {
    singleQuotes: byId<HTMLInputElement>('opt-single').checked,
    checkLowercase: byId<HTMLInputElement>('opt-lower').checked,
    ignore: state.ignored,
  });
  render(state.snapshot, result);
}

async function goTo(loc: Location): Promise<void> {
  try {
    const outcome = await selectLocation(loc);
    setStatus(OUTCOME_TEXT[outcome], outcome === 'selected' ? undefined : 'warn');
  } catch (error) {
    setStatus(describeError(error), 'error');
  }
}

function setIgnored(terms: string[], message: string, action?: { label: string; run: () => void }): void {
  state.ignored = terms;
  saveIgnored(terms);
  reanalyze();
  renderIgnored();
  setStatus(message, undefined, action);
}

function ignore(term: string): void {
  if (state.ignored.includes(term)) return;
  setIgnored([...state.ignored, term], `"${term}" is ignored for this document.`, {
    label: 'Undo',
    run: () => restore(term),
  });
}

function restore(term: string): void {
  setIgnored(
    state.ignored.filter((t) => t !== term),
    `"${term}" is back in the results.`,
  );
}

function restoreAll(): void {
  setIgnored([], 'The ignore list for this document is empty again.');
}

function render(snapshot: DocumentSnapshot, result: AnalysisResult): void {
  const summary = byId('summary');
  const findings = byId('findings');
  findings.replaceChildren();

  const { stats } = result;
  const ignoredNote = stats.ignored > 0 ? ` ${stats.ignored} hidden by the ignore list.` : '';
  summary.textContent =
    `${count(stats.paragraphs, 'paragraph')} read, ${count(stats.terms, 'defined term')}, ` +
    `${count(result.findings.length, 'finding')}.` +
    ignoredNote +
    ` ${SOURCE_TEXT[snapshot.textSource]}`;
  summary.hidden = false;

  if (result.findings.length === 0) {
    findings.append(el('p', {}, ['No findings.']));
    return;
  }
  for (const kind of KIND_ORDER) {
    const group = result.findings.filter((f) => f.kind === kind);
    if (group.length === 0) continue;
    findings.append(
      el('h2', {}, [`${KIND_LABELS[kind]} (${group.length})`]),
      el('p', { className: 'kind-hint' }, [KIND_HINTS[kind]]),
      ...group.map(renderFinding),
    );
  }
}

function renderFinding(finding: Finding): HTMLElement {
  const summary = el('summary', {}, [
    el('span', { className: 'term' }, [finding.term]),
    ' ',
    el('span', { className: 'msg' }, [finding.message]),
  ]);
  const occurrences = el(
    'ol',
    { className: 'occurrences' },
    finding.locations.map((loc) => el('li', {}, [renderOccurrence(loc)])),
  );
  // The ignore control sits after the occurrences, so the first click target under a finding is a location.
  const ignoreButton = el('button', { type: 'button', className: 'link' }, [
    `Ignore "${finding.term}" in this document`,
  ]);
  ignoreButton.addEventListener('click', () => ignore(finding.term));
  return el('details', { className: 'finding' }, [
    summary,
    el('div', { className: 'body' }, [occurrences, el('div', { className: 'actions' }, [ignoreButton])]),
  ]);
}

function renderOccurrence(loc: Location): HTMLElement {
  const button = el('button', { type: 'button', className: 'occ', title: 'Select in the document' }, [
    el('span', { className: 'para' }, [`¶ ${loc.paragraph + 1}`]),
    el('span', { className: 'ctx' }, [loc.context]),
  ]);
  button.addEventListener('click', () => void goTo(loc));
  return button;
}

function renderIgnored(): void {
  const section = byId('ignored');
  section.replaceChildren();
  if (state.ignored.length === 0) {
    section.hidden = true;
    return;
  }
  const restoreAllButton = el('button', { type: 'button', className: 'link' }, ['Restore all']);
  restoreAllButton.addEventListener('click', restoreAll);
  section.append(
    el('h2', {}, ['Ignored terms']),
    el(
      'ul',
      { className: 'ignored' },
      state.ignored.map((term) => {
        const button = el('button', { type: 'button', className: 'link' }, ['Restore']);
        button.addEventListener('click', () => restore(term));
        return el('li', {}, [term, ' ', button]);
      }),
    ),
    el('p', { className: 'actions' }, [restoreAllButton]),
  );
  section.hidden = false;
}

function setStatus(text: string, tone?: 'warn' | 'error', action?: { label: string; run: () => void }): void {
  const status = byId('status');
  status.replaceChildren(text);
  status.className = tone ?? '';
  if (action) {
    const button = el('button', { type: 'button', className: 'link' }, [action.label]);
    button.addEventListener('click', action.run);
    status.append(' ', button);
  }
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function setBusy(busy: boolean): void {
  state.busy = busy;
  byId<HTMLButtonElement>('check').disabled = busy;
}
