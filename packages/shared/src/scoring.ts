import { STREAK_BONUS_CAP, STREAK_BONUS_STEP } from './constants';
import type { GameSettings, Severity } from './quiz';

/** points = round(P × (1 − t / 2T)); never below half of P for a correct answer. */
export function answerPoints(P: number, tMs: number, limitMs: number): number {
  if (P <= 0) return 0;
  const t = Math.min(Math.max(tMs, 0), limitMs);
  return Math.round(P * (1 - t / (2 * limitMs)));
}

/** 100 per consecutive correct answer from the second on, capped. `streak` counts this answer. */
export function streakBonus(streak: number): number {
  if (streak < 2) return 0;
  return Math.min((streak - 1) * STREAK_BONUS_STEP, STREAK_BONUS_CAP);
}

export const STRIKE_POINTS: Record<Severity, number> = { minor: 1, moderate: 2, major: 3 };
const SEVERITY_RANK: Record<Severity, number> = { minor: 1, moderate: 2, major: 3 };
export const maxSeverity = (a: Severity | null, b: Severity): Severity =>
  a && SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;

export interface QuestionMeta {
  points: number;
  limitMs: number;
  /** Decides correctness for an answer (the server knows the key). */
  isCorrect: (answer: AnswerRec) => boolean;
}
export interface AnswerRec {
  option?: number;
  text?: string;
  /** Server-measured ms from question open to receipt. */
  tMs: number;
}
export interface FlagRec {
  id: string;
  playerId: string;
  q: number;
  severity: Severity;
  cleared: boolean;
}
export interface QuestionResult {
  answered: boolean;
  correct: boolean;
  voided: boolean;
  points: number;
  bonus: number;
  penalty: number;
  streak: number;
}
export interface PlayerScore {
  score: number;
  streak: number;
  correctCount: number;
  answeredCount: number;
  totalTimeMs: number;
  strikes: number;
  flagCount: number;
  perQuestion: Record<number, QuestionResult>;
}

/**
 * Pure recomputation of every score from raw answers and flags. Because it is pure,
 * clearing a flag or accepting a typed answer is just "recompute".
 */
export function scoreGame(input: {
  questions: QuestionMeta[];
  closed: number; // number of questions whose reveal has happened (0..n)
  answers: Record<number, Record<string, AnswerRec>>;
  flags: FlagRec[];
  playerIds: string[];
  settings: Pick<GameSettings, 'majorDeduction'>;
  strikePoints?: Record<Severity, number>;
}): Record<string, PlayerScore> {
  const sp = input.strikePoints ?? STRIKE_POINTS;
  const out: Record<string, PlayerScore> = {};
  for (const pid of input.playerIds) {
    const live = input.flags.filter((f) => f.playerId === pid && !f.cleared);
    const ps: PlayerScore = {
      score: 0,
      streak: 0,
      correctCount: 0,
      answeredCount: 0,
      totalTimeMs: 0,
      strikes: live.reduce((n, f) => n + sp[f.severity], 0),
      flagCount: live.length,
      perQuestion: {},
    };
    let total = 0;
    for (let q = 0; q < input.closed; q++) {
      const meta = input.questions[q];
      if (!meta) continue;
      const ans = input.answers[q]?.[pid];
      const qFlags = live.filter((f) => f.q === q);
      const sev = qFlags.reduce<Severity | null>((m, f) => maxSeverity(m, f.severity), null);
      const voided = sev === 'moderate' || sev === 'major';
      const penalty = sev === 'major' ? input.settings.majorDeduction : 0;
      const r: QuestionResult = {
        answered: !!ans,
        correct: false,
        voided,
        points: 0,
        bonus: 0,
        penalty,
        streak: 0,
      };
      if (ans) {
        ps.answeredCount++;
        ps.totalTimeMs += Math.min(ans.tMs, meta.limitMs);
        const correct = meta.isCorrect(ans);
        r.correct = correct;
        if (correct && !voided) {
          ps.streak++;
          ps.correctCount++;
          r.points = answerPoints(meta.points, ans.tMs, meta.limitMs);
          r.bonus = meta.points > 0 ? streakBonus(ps.streak) : 0;
        } else ps.streak = 0;
      } else ps.streak = 0;
      r.streak = ps.streak;
      total += r.points + r.bonus - penalty;
      ps.perQuestion[q] = r;
    }
    ps.score = Math.max(0, total);
    out[pid] = ps;
  }
  return out;
}

export interface Rankable {
  id: string;
  nickname: string;
  score: number;
  totalTimeMs: number;
}
/** Higher score first; ties broken by lower total answer time. */
export function rankPlayers<T extends Rankable>(players: T[]): (T & { rank: number })[] {
  return [...players]
    .sort((a, b) => b.score - a.score || a.totalTimeMs - b.totalTimeMs || a.nickname.localeCompare(b.nickname))
    .map((p, i) => ({ ...p, rank: i + 1 }));
}
