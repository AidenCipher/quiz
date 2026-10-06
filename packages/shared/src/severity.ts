import type { FlagKind, Severity, Thresholds } from './quiz';

export interface GradeInput {
  kind: FlagKind;
  /** How long the player was away during the open question. */
  awayMs: number;
  /** Counted flags this player already has in this question. */
  priorInQuestion: number;
}

/** Returns null when the event is below the ignore threshold. */
export function gradeFlag(input: GradeInput, t: Thresholds): Severity | null {
  const { kind, awayMs, priorInQuestion } = input;
  if (kind === 'blur' && awayMs < t.blurIgnoreMs) return null;
  if (kind === 'left' && awayMs < t.leftIgnoreMs) return null;
  if (kind === 'hidden' && awayMs < 300) return null; // sub-300ms visibility flicker
  let sev: Severity;
  if (awayMs > t.moderateMaxMs) sev = 'major';
  else if (kind === 'blur') sev = awayMs <= t.blurMinorMaxMs ? 'minor' : 'moderate';
  else sev = awayMs < t.hiddenMinorMaxMs ? 'minor' : 'moderate';
  if (sev === 'minor' && priorInQuestion >= 1) sev = 'moderate';
  return sev;
}
