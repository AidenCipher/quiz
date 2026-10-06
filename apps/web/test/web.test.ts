import { describe, expect, it } from 'vitest';
import type { FlagInfo, ServerMsg } from '@quiz/shared/protocol';
import { newQuestion } from '@quiz/shared/quiz';
import { csvToQuestions, parseCsv, questionsToCsv, resultsToCsv, toCsv } from '../src/lib/csv';
import { flagCounts, initialView, reduce } from '../src/lib/reduce';

const flag = (over: Partial<FlagInfo> = {}): FlagInfo => ({
  id: 'f0',
  playerId: 'p1',
  nickname: 'Riya',
  q: 0,
  kind: 'hidden',
  severity: 'minor',
  awayMs: 1500,
  strike: 1,
  cleared: false,
  at: 1,
  ...over,
});
const msg = (m: Record<string, unknown>) => ({ serverTime: 0, ...m }) as unknown as ServerMsg;

describe('reduce', () => {
  it('queues an animation and a notice for a new flag, only an animation for an upgrade', () => {
    let v = reduce(initialView(), msg({ t: 'flag', flag: flag() }), 100);
    expect(v.suspects).toHaveLength(1);
    expect(v.notices[0]!.text).toContain('Riya was flagged');
    v = reduce(v, msg({ t: 'flag', flag: flag({ severity: 'major', strike: 3 }) }), 200);
    expect(v.flags).toHaveLength(1);
    expect(v.suspects).toHaveLength(2);
    expect(v.notices).toHaveLength(1);
  });
  it('clearing a flag removes the badge, notice, animation and warning', () => {
    let v = reduce(initialView(), msg({ t: 'flag', flag: flag() }));
    v = reduce(v, msg({ t: 'warned', flag: flag(), strikesLeft: 5 }));
    v = reduce(v, msg({ t: 'flagCleared', flagId: 'f0', playerId: 'p1' }));
    expect(flagCounts(v.flags)).toEqual({});
    expect(v.suspects).toHaveLength(0);
    expect(v.notices).toHaveLength(0);
    expect(v.warned).toBeNull();
  });
  it('keeps the answered count when the same question is re-sent (pause/extend)', () => {
    const q = (paused: boolean) =>
      msg({
        t: 'question',
        index: 0,
        total: 3,
        qtype: 'mcq',
        endsAt: 5,
        openedAt: 0,
        limitMs: 5,
        paused,
        pausedRemainingMs: null,
        points: 1000,
      });
    let v = reduce(initialView(), q(false));
    v = reduce(v, msg({ t: 'progress', index: 0, answered: 4, total: 9 }));
    v = reduce(v, q(true));
    expect(v.progress).toEqual({ index: 0, answered: 4, total: 9 });
  });
  it('marks the local player removed but escorts others off the big screen', () => {
    let v = reduce(initialView(), msg({ t: 'joined', playerId: 'me', token: 't', nickname: 'Me', avatar: 'a' }));
    v = reduce(v, msg({ t: 'removed', playerId: 'other', nickname: 'Zed', reason: 'strikes' }));
    expect(v.removed).toBe(false);
    expect(v.suspects[0]!.flag.severity).toBe('removed');
    v = reduce(v, msg({ t: 'removed', playerId: 'me', nickname: 'Me', reason: 'host' }));
    expect(v.removed).toBe(true);
  });
});

describe('csv', () => {
  it('round-trips quotes, commas and newlines', () => {
    const rows = [
      ['a', 'b,c', 'say "hi"'],
      ['multi\nline', '', 'x'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('neutralises spreadsheet formulas in exported text', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1']])).toBe(`"'=HYPERLINK(""x"")",'+1`);
  });
  it('round-trips a quiz through CSV', () => {
    const qs = [
      {
        ...newQuestion('mcq'),
        id: '1',
        text: 'Q1, with comma',
        options: ['a', 'b', 'c'],
        correctIndex: 2,
        timeLimitS: 10,
      },
      { ...newQuestion('tf'), id: '2', text: 'Q2', correctIndex: 1 },
      { ...newQuestion('text'), id: '3', text: 'Q3', acceptedAnswers: ['Mumbai', 'Bombay'], points: 2000 },
    ];
    const back = csvToQuestions(questionsToCsv(qs), () => 'x');
    expect(back.map((q) => [q.type, q.text, q.correctIndex, q.timeLimitS, q.points])).toEqual([
      ['mcq', 'Q1, with comma', 2, 10, 1000],
      ['tf', 'Q2', 1, 20, 1000],
      ['text', 'Q3', null, 30, 2000],
    ]);
    expect(back[0]!.options).toEqual(['a', 'b', 'c']);
    expect(back[2]!.acceptedAnswers).toEqual(['Mumbai', 'Bombay']);
  });
  it('lists every flag in the results CSV', () => {
    const csv = resultsToCsv({
      pin: '1',
      title: 't',
      startedAt: 0,
      endedAt: 1,
      questionCount: 1,
      players: [],
      flags: [flag()],
    });
    expect(csv).toContain('FLAG LOG');
    expect(csv).toContain('Riya,1,');
  });
});
