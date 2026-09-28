// The ignore list lives in the task pane's local storage, keyed by the document's URL. Putting it in
// Office.context.document.settings would work too, but that writes into the .docx, and this add-in
// never changes the file. An unsaved document has no URL, so its list lasts for the session only.

const PREFIX = 'defined-terms-checker:ignore:';
let sessionList: string[] = [];

function storageKey(): string | null {
  const url: string | null = Office.context.document.url;
  return url ? PREFIX + url : null;
}

export function loadIgnored(): string[] {
  const key = storageKey();
  if (!key) return sessionList;
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return sessionList;
  }
}

export function saveIgnored(terms: string[]): void {
  sessionList = terms;
  const key = storageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(terms));
  } catch {
    // Storage blocked or full: the list still works for this session.
  }
}
