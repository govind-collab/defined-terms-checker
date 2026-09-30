// localStorage keyed by the document URL. Office.context.document.settings would be saved into the .docx.

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
