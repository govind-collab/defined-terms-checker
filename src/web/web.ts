import { KIND_ORDER, analyze } from '../core/analyze';
import type { Finding, Location } from '../core/types';
import { parseFixture } from '../../test/fixtures/parse';
import { KIND_HINTS, KIND_LABELS, byId, count, el } from '../taskpane/ui';

const text = byId<HTMLTextAreaElement>('text');
// Where each paragraph starts in the textarea, so an occurrence can be selected there.
let offsets: number[] = [];

byId('check').addEventListener('click', check);
byId('opt-single').addEventListener('change', check);
byId('opt-lower').addEventListener('change', check);
void loadSample();

async function loadSample(): Promise<void> {
  const sample = await (await fetch('sample-nda.txt')).text();
  text.value = parseFixture(sample)
    .map((p) => p.text)
    .join('\n');
  check();
}

function check(): void {
  const paragraphs: { text: string }[] = [];
  offsets = [];
  let offset = 0;
  for (const line of text.value.split('\n')) {
    if (line.trim() !== '') {
      paragraphs.push({ text: line });
      offsets.push(offset);
    }
    offset += line.length + 1;
  }
  const result = analyze(paragraphs, {
    singleQuotes: byId<HTMLInputElement>('opt-single').checked,
    checkLowercase: byId<HTMLInputElement>('opt-lower').checked,
  });

  const summary = byId('summary');
  summary.textContent =
    `${count(result.stats.paragraphs, 'paragraph')} read, ${count(result.stats.terms, 'defined term')}, ` +
    `${count(result.findings.length, 'finding')}.`;
  summary.hidden = false;

  const findings = byId('findings');
  findings.replaceChildren();
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
  return el('details', { className: 'finding' }, [
    el('summary', {}, [
      el('span', { className: 'term' }, [finding.term]),
      ' ',
      el('span', { className: 'msg' }, [finding.message]),
    ]),
    el('div', { className: 'body' }, [
      el(
        'ol',
        { className: 'occurrences' },
        finding.locations.map((loc) => el('li', {}, [renderOccurrence(loc)])),
      ),
    ]),
  ]);
}

function renderOccurrence(loc: Location): HTMLElement {
  const button = el('button', { type: 'button', className: 'occ', title: 'Select in the text' }, [
    el('span', { className: 'para' }, [`¶ ${loc.paragraph + 1}`]),
    el('span', { className: 'ctx' }, [loc.context]),
  ]);
  button.addEventListener('click', () => {
    const at = offsets[loc.paragraph];
    text.focus();
    text.setSelectionRange(at + loc.start, at + loc.end);
  });
  return button;
}
