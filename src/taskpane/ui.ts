import type { FindingKind } from '../core/types';

export const KIND_LABELS: Record<FindingKind, string> = {
  undefined: 'Used but never defined',
  unused: 'Defined but never used',
  duplicate: 'Defined more than once',
  'before-definition': 'Used before its inline definition',
  lowercase: 'Lowercase uses of a defined term',
};

export const KIND_HINTS: Record<FindingKind, string> = {
  undefined:
    'Capitalized like a defined term, with no definition anywhere. A name or a place can get through; use Ignore.',
  unused: 'A definition nothing refers to, often left behind after a clause was deleted.',
  duplicate: 'The same term defined in more than one place. Cross-references and "includes" are not counted.',
  'before-definition': 'Used earlier than the parenthetical that defines it.',
  lowercase:
    "The words of a defined term without their capitals. Inside the term's own definition this is not reported.",
};

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
