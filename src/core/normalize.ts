// A word may carry combining marks and format characters (soft hyphens, zero-width spaces).
export const WORD_RE =
  /[\p{L}\p{N}][\p{L}\p{N}\p{M}\p{Cf}]*(?:['’.-][\p{L}\p{N}][\p{L}\p{N}\p{M}\p{Cf}]*)*/gu;

export function isCapital(word: string): boolean {
  return /^\p{Lu}/u.test(word);
}

/** Two or more letters and none of them lowercase. */
export function isCaps(word: string): boolean {
  return (word.match(/\p{L}/gu) ?? []).length >= 2 && !/\p{Ll}/u.test(word);
}

export function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

/** Drops a possessive ending: Company's -> Company, Parties' -> Parties. */
export function stripPossessive(word: string): string {
  return word.replace(/['’]s$|['’]$/u, '');
}

// "U.S." and "U.S" agree, and so do "Café" typed on a Mac and on Windows.
export function normalizeWord(word: string): string {
  return stripPossessive(
    word
      .normalize('NFKC')
      .replace(/\p{Cf}/gu, '')
      .replace(/’/g, "'")
      .replace(/\.+$/, ''),
  ).toLowerCase();
}

// Applied to both sides, so it only has to agree with itself: Parties -> Party, Business -> Business.
export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (/[^aeiou]ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/(?:ss|sh|ch|x|z|us)es$/.test(word)) return word.slice(0, -2);
  if (/(?:ss|us|is)$/.test(word)) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

export function termKey(term: string): string {
  return term.trim().split(/\s+/).map(normalizeWord).join(' ');
}

/** Key that puts "Party" and "Parties" in the same family. */
export function familyKey(key: string): string {
  const words = key.split(' ');
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ');
}
