import { describe, expect, it } from 'vitest';
import {
  ALL_LINES,
  LOCK_IN_QUIPS,
  computeCallouts,
  flagCallout,
  isProfane,
  seededRand,
  type PlayerOutcome,
} from '../src';

const p = (id: string, outcome: PlayerOutcome['outcome'], over: Partial<PlayerOutcome> = {}): PlayerOutcome => ({
  id,
  nickname: `P-${id}`,
  outcome,
  tMs: outcome === 'right' ? 15000 : null, // slow by default, so "fast" has to be asked for
  streak: 0,
  ...over,
});

describe('the callout bank', () => {
  it('is kind: no insults, no swearing, every individual line names the player', () => {
    const unkind =
      /\b(stupid|dumb|idiot|moron|loser|retard|ugly|fat|trash|garbage|worthless|pathetic|clown|noob|failure)\b/i;
    for (const { kind, line } of ALL_LINES) {
      expect(unkind.test(line.text), line.text).toBe(false);
      expect(isProfane(line.text), line.text).toBe(false);
      expect(line.text.length, line.text).toBeLessThanOrEqual(140);
      expect(line.emoji.length).toBeGreaterThan(0);
      if (kind !== 'allCorrect' && kind !== 'allWrong') expect(line.text, line.text).toContain('{name}');
      if (kind === 'streak') expect(line.text).toContain('{streak}');
      if (line.ref) expect(line.ref, line.ref).toMatch(/^(Vine|Meme|Sound|Gaming): /);
    }
  });
  it('is big enough that rounds do not repeat quickly', () => {
    const count = (k: string) => ALL_LINES.filter((l) => l.kind === k).length;
    expect(count('wrong')).toBeGreaterThanOrEqual(10);
    expect(count('none')).toBeGreaterThanOrEqual(6);
    expect(count('fast')).toBeGreaterThanOrEqual(5);
    expect(ALL_LINES.filter((l) => l.line.ref?.startsWith('Vine')).length).toBeGreaterThanOrEqual(4);
    expect(LOCK_IN_QUIPS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('seededRand', () => {
  it('is repeatable for a seed and different across seeds', () => {
    const a = seededRand('x');
    const b = seededRand('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRand('x')()).not.toBe(seededRand('y')());
  });
});

describe('computeCallouts', () => {
  const room = [p('a', 'right', { tMs: 1500 }), p('b', 'wrong'), p('c', 'none'), p('d', 'right'), p('e', 'wrong')];

  it('gives every wrong or unanswered player their own line, naming them', () => {
    const r = computeCallouts({ seed: 'g:1', players: room, limitMs: 20000 });
    for (const id of ['b', 'c', 'e']) {
      const c = r.personal.get(id)!;
      expect(c.text).toContain(`P-${id}`);
      expect(c.playerId).toBe(id);
    }
    expect(r.personal.get('b')!.kind).toBe('wrong');
    expect(r.personal.get('c')!.kind).toBe('none');
    expect(r.personal.has('d')).toBe(false); // an ordinary correct answer needs no roast or cheer
  });

  it('is deterministic for the same question, so a re-sent reveal shows the same callout', () => {
    const a = computeCallouts({ seed: 'g:1', players: room, limitMs: 20000 });
    const b = computeCallouts({ seed: 'g:1', players: room, limitMs: 20000 });
    expect(a.spotlight).toEqual(b.spotlight);
  });

  it('picks a spotlight whose subject really had that outcome', () => {
    for (let q = 0; q < 60; q++) {
      const { spotlight } = computeCallouts({ seed: `g:${q}`, players: room, limitMs: 20000 });
      expect(spotlight).not.toBeNull();
      const who = room.find((x) => x.id === spotlight!.playerId)!;
      const expected = { wrong: 'wrong', none: 'none', fast: 'right', streak: 'right' }[
        spotlight!.kind as 'wrong' | 'none' | 'fast' | 'streak'
      ];
      expect(who.outcome).toBe(expected);
    }
  });

  it('varies who gets picked, and avoids the people spotlighted recently', () => {
    const chosen = new Set<string>();
    for (let q = 0; q < 80; q++)
      chosen.add(computeCallouts({ seed: `g:${q}`, players: room, limitMs: 20000 }).spotlight!.playerId!);
    expect(chosen.size).toBeGreaterThanOrEqual(3);
    for (let q = 0; q < 80; q++) {
      const s = computeCallouts({ seed: `h:${q}`, players: room, limitMs: 20000, avoid: ['b', 'c'] }).spotlight!;
      if (s.kind === 'wrong') expect(s.playerId).toBe('e'); // the only wrong player who was not recent
      if (s.kind === 'none') expect(s.playerId).toBe('c'); // nobody else to choose, so repetition is allowed
    }
  });

  it('honours the group moments, which need at least three players', () => {
    const allRight = computeCallouts({
      seed: 's',
      players: [p('a', 'right'), p('b', 'right'), p('c', 'right')],
      limitMs: 20000,
    });
    expect(allRight.spotlight!.kind).toBe('allCorrect');
    expect(allRight.spotlight!.playerId).toBeUndefined();
    const allWrong = computeCallouts({
      seed: 's',
      players: [p('a', 'wrong'), p('b', 'none'), p('c', 'wrong')],
      limitMs: 20000,
    });
    expect(allWrong.spotlight!.kind).toBe('allWrong');
    const tiny = computeCallouts({ seed: 's', players: [p('a', 'right'), p('b', 'right')], limitMs: 20000 });
    expect(tiny.spotlight).toBeNull(); // two correct players: nothing to say, and that is fine
  });

  it('celebrates fast answers and streaks of three or more', () => {
    const r = computeCallouts({
      seed: 'x',
      players: [
        p('a', 'right', { tMs: 800, streak: 4 }),
        p('b', 'right'), // two players only: no group moment, so the spotlight must go to the streak holder
      ],
      limitMs: 20000,
    });
    expect(r.spotlight!.playerId).toBe('a');
    expect(['fast', 'streak']).toContain(r.spotlight!.kind);
    // the person's own line is always the same as the room's spotlight when they are the spotlight
    expect(r.personal.get('a')).toEqual(r.spotlight);
    // a streak line carries the streak length
    const streakLine = computeCallouts({
      seed: 'x2',
      players: [p('a', 'right', { tMs: 15000, streak: 4 }), p('b', 'right', { tMs: 15000 })],
      limitMs: 20000,
    });
    expect(streakLine.spotlight!.kind).toBe('streak');
    expect(streakLine.spotlight!.text).toContain('4');
  });

  it('ignores voided answers (the flag already told that story)', () => {
    const r = computeCallouts({
      seed: 'x',
      players: [p('a', 'voided'), p('b', 'right'), p('c', 'right')],
      limitMs: 20000,
    });
    expect(r.personal.has('a')).toBe(false);
    expect(r.spotlight).toBeNull();
  });

  it('copes with an empty room', () => {
    expect(computeCallouts({ seed: 'x', players: [], limitMs: 20000 })).toEqual({
      spotlight: null,
      personal: new Map(),
    });
  });
});

describe('flagCallout', () => {
  it('has lines for every severity and names the player', () => {
    for (const s of ['minor', 'moderate', 'major'] as const) {
      const c = flagCallout(s, 'Riya', 'p1', 'f0');
      expect(c.kind).toBe('flag');
      expect(c.text).toContain('Riya');
      expect(c.playerId).toBe('p1');
    }
  });
});
