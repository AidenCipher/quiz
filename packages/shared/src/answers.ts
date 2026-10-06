/** Server-side matching for type-the-answer questions. */

export function normalizeAnswer(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asNumber(s: string): number | null {
  const t = s.trim().replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

export function allowedTypos(accepted: string): number {
  const n = accepted.length;
  return n >= 10 ? 2 : n >= 5 ? 1 : 0;
}

export function matchesAnswer(input: string, accepted: readonly string[], typoTolerance: boolean): boolean {
  const given = normalizeAnswer(input);
  if (!given) return false;
  const givenNum = asNumber(input);
  for (const a of accepted) {
    const aNum = asNumber(a);
    if (aNum !== null) {
      if (givenNum !== null && givenNum === aNum) return true;
      continue;
    }
    const norm = normalizeAnswer(a);
    if (!norm) continue;
    if (norm === given) return true;
    if (typoTolerance && levenshtein(norm, given) <= allowedTypos(norm)) return true;
  }
  return false;
}
