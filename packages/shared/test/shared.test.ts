import { describe, expect, it } from 'vitest';
import {
  answerPoints,
  streakBonus,
  scoreGame,
  rankPlayers,
  matchesAnswer,
  normalizeAnswer,
  gradeFlag,
  defaultSettings,
  parseAvatar,
  encodeAvatar,
  randomAvatar,
  checkNickname,
  uniqueNickname,
  QuestionSchema,
  newQuestion,
  ClientMsgSchema,
  type QuestionMeta,
} from '../src';

const T = defaultSettings().thresholds;

describe('scoring', () => {
  it('awards P at t=0 and P/2 at the deadline', () => {
    expect(answerPoints(1000, 0, 20000)).toBe(1000);
    expect(answerPoints(1000, 20000, 20000)).toBe(500);
    expect(answerPoints(1000, 10000, 20000)).toBe(750);
    expect(answerPoints(1000, 99999, 20000)).toBe(500);
    expect(answerPoints(0, 0, 20000)).toBe(0);
  });
  it('streak bonus: none on first, +100 each from second, cap 500', () => {
    expect([1, 2, 3, 6, 7, 20].map(streakBonus)).toEqual([0, 100, 200, 500, 500, 500]);
  });

  const qs: QuestionMeta[] = [0, 1, 2].map(() => ({
    points: 1000,
    limitMs: 10000,
    isCorrect: (a) => a.option === 1,
  }));
  const settings = { majorDeduction: 500 };

  it('scores streaks and breaks them on a miss', () => {
    const r = scoreGame({
      questions: qs,
      closed: 3,
      playerIds: ['a'],
      flags: [],
      settings,
      answers: { 0: { a: { option: 1, tMs: 0 } }, 1: { a: { option: 1, tMs: 0 } }, 2: { a: { option: 0, tMs: 0 } } },
    }).a!;
    expect(r.score).toBe(1000 + 1100);
    expect(r.streak).toBe(0);
    expect(r.correctCount).toBe(2);
  });
  it('moderate flag voids the answer, major also deducts; clearing refunds', () => {
    const base = {
      questions: qs,
      closed: 1,
      playerIds: ['a'],
      settings,
      answers: { 0: { a: { option: 1, tMs: 0 } } },
    };
    const mk = (severity: 'minor' | 'moderate' | 'major', cleared = false) => [
      { id: 'f', playerId: 'a', q: 0, severity, cleared },
    ];
    expect(scoreGame({ ...base, flags: mk('minor') }).a!.score).toBe(1000);
    expect(scoreGame({ ...base, flags: mk('moderate') }).a!.score).toBe(0);
    expect(scoreGame({ ...base, flags: mk('major') }).a!.score).toBe(0); // clamped at 0
    expect(scoreGame({ ...base, flags: mk('major', true) }).a!.score).toBe(1000);
    expect(scoreGame({ ...base, flags: mk('major') }).a!.strikes).toBe(3);
    expect(scoreGame({ ...base, flags: mk('major', true) }).a!.strikes).toBe(0);
  });
  it('major deduction can reduce earlier points', () => {
    const r = scoreGame({
      questions: qs,
      closed: 2,
      playerIds: ['a'],
      settings,
      answers: { 0: { a: { option: 1, tMs: 0 } }, 1: { a: { option: 1, tMs: 0 } } },
      flags: [{ id: 'f', playerId: 'a', q: 1, severity: 'major', cleared: false }],
    }).a!;
    expect(r.score).toBe(500);
  });
  it('ranks ties by lower total time', () => {
    const r = rankPlayers([
      { id: 'a', nickname: 'a', score: 100, totalTimeMs: 5000 },
      { id: 'b', nickname: 'b', score: 100, totalTimeMs: 3000 },
      { id: 'c', nickname: 'c', score: 200, totalTimeMs: 9000 },
    ]);
    expect(r.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('type-the-answer matching', () => {
  it('normalises case, spaces, punctuation and accents', () => {
    expect(normalizeAnswer('  Café,  DU   Monde! ')).toBe('cafe du monde');
    expect(matchesAnswer('MUMBAI!', ['Mumbai'], false)).toBe(true);
    expect(matchesAnswer('bombay', ['Mumbai', 'Bombay'], false)).toBe(true);
    expect(matchesAnswer('delhi', ['Mumbai'], true)).toBe(false);
  });
  it('compares numbers as numbers', () => {
    expect(matchesAnswer('7.0', ['7'], false)).toBe(true);
    expect(matchesAnswer('7', ['7.00'], false)).toBe(true);
    expect(matchesAnswer('8', ['7'], true)).toBe(false);
    expect(matchesAnswer('1,000', ['1000'], false)).toBe(true);
  });
  it('typo tolerance: 1 for 5+, 2 for 10+, none under 5', () => {
    expect(matchesAnswer('mumbay', ['mumbai'], true)).toBe(true);
    expect(matchesAnswer('mumbay', ['mumbai'], false)).toBe(false);
    expect(matchesAnswer('mumbxi', ['mumbai'], true)).toBe(true);
    expect(matchesAnswer('mumbxy', ['mumbai'], true)).toBe(false);
    expect(matchesAnswer('cat', ['cot'], true)).toBe(false);
    expect(matchesAnswer('photosynthesys', ['photosynthesis'], true)).toBe(true);
    expect(matchesAnswer('photosynthxsys', ['photosynthesis'], true)).toBe(true);
    expect(matchesAnswer('photosxnthxsxs', ['photosynthesis'], true)).toBe(false);
  });
  it('rejects empty input', () => expect(matchesAnswer('  ', ['a'], true)).toBe(false));
});

describe('severity ladder', () => {
  const g = (kind: 'hidden' | 'blur' | 'left', awayMs: number, priorInQuestion = 0) =>
    gradeFlag({ kind, awayMs, priorInQuestion }, T);
  it('ignores short blur and network blips', () => {
    expect(g('blur', 900)).toBeNull();
    expect(g('left', 1500)).toBeNull();
  });
  it('grades hidden by duration', () => {
    expect(g('hidden', 1500)).toBe('minor');
    expect(g('hidden', 2000)).toBe('moderate');
    expect(g('hidden', 10000)).toBe('moderate');
    expect(g('hidden', 10001)).toBe('major');
  });
  it('grades blur by duration', () => {
    expect(g('blur', 1000)).toBe('minor');
    expect(g('blur', 3000)).toBe('minor');
    expect(g('blur', 3500)).toBe('moderate');
  });
  it('a second minor event in the same question becomes moderate', () => {
    expect(g('hidden', 1000, 1)).toBe('moderate');
  });
});

describe('avatar, nickname, schemas', () => {
  it('round-trips avatar codes and rejects bad ones', () => {
    const p = randomAvatar();
    expect(parseAvatar(encodeAvatar(p))).toEqual(p);
    expect(parseAvatar('f9-s0-e0-m0-a0-b0')).toBeNull();
    expect(parseAvatar('nope')).toBeNull();
  });
  it('validates nicknames', () => {
    expect(checkNickname(' Riya ')).toEqual({ ok: true, nickname: 'Riya' });
    expect(checkNickname('a').ok).toBe(false);
    expect(checkNickname('x'.repeat(17)).ok).toBe(false);
    expect(checkNickname('fuck').ok).toBe(false);
    expect(checkNickname('f.u.c.k').ok).toBe(false);
    expect(checkNickname('Sh1t').ok).toBe(false);
    for (const fine of ['Blunder', 'Scunthorpe', 'Class Clown', 'Assam Tea', 'Cocktail'.slice(0, 4) + 'y', 'Riya']) {
      expect(checkNickname(fine).ok, fine).toBe(true);
    }
  });
  it('suffixes duplicates', () => {
    expect(uniqueNickname('Riya', ['riya'])).toBe('Riya 2');
    expect(uniqueNickname('Riya', ['Riya', 'Riya 2'])).toBe('Riya 3');
    expect(uniqueNickname('A'.repeat(16), ['A'.repeat(16)]).length).toBeLessThanOrEqual(16);
  });
  it('validates questions per type', () => {
    const mcq = { ...newQuestion('mcq'), text: 'Q', options: ['a', 'b'], correctIndex: 1 };
    expect(QuestionSchema.safeParse(mcq).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...mcq, correctIndex: 3 }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...newQuestion('text'), text: 'Q' }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...newQuestion('text'), text: 'Q', acceptedAnswers: ['x'] }).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...newQuestion('tf'), text: 'Q', correctIndex: 2 }).success).toBe(false);
  });
  it('requires alt text for question images', () => {
    const q = { ...newQuestion('tf'), text: 'Q', correctIndex: 0, image: 'data:image/png;base64,AAAA' };
    expect(QuestionSchema.safeParse(q).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...q, imageAlt: 'A map of India' }).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...q, image: null }).success).toBe(true);
  });
  it('accepts a leave (erasure) message', () => {
    expect(ClientMsgSchema.safeParse({ t: 'leave' }).success).toBe(true);
  });
  it('drops malformed protocol messages', () => {
    expect(ClientMsgSchema.safeParse({ t: 'answer', q: 0, option: 9 }).success).toBe(false);
    expect(ClientMsgSchema.safeParse({ t: 'answer', q: 0, option: 2 }).success).toBe(true);
    expect(ClientMsgSchema.safeParse({ t: 'nope' }).success).toBe(false);
  });
});
