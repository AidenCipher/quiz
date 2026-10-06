import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { defaultSettings, newQuestion, type GameSettings, type Question } from '@quiz/shared';
import { signTicket } from '../src/crypto';
import type { InitPayload } from '../src/room';

type Msg = Record<string, any>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pinSeq = 100000;

function mcq(text: string, correct: number, limit = 20): Question {
  return { ...newQuestion('mcq'), text, options: ['A', 'B', 'C', 'D'], correctIndex: correct, timeLimitS: limit };
}

async function makeGame(opts: { questions?: Question[]; settings?: Partial<GameSettings> } = {}) {
  const pin = String(pinSeq++);
  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(pin));
  const payload: InitPayload = {
    pin,
    hostId: 'host-1',
    quizId: 'quiz-1',
    title: 'Test quiz',
    settings: { ...defaultSettings(), ...opts.settings },
    questions: opts.questions ?? [mcq('Q1', 1), mcq('Q2', 0)],
  };
  const res = await stub.fetch('http://room/init', { method: 'POST', body: JSON.stringify(payload) });
  expect(res.status).toBe(200);
  return { pin, stub };
}

class Client {
  msgs: Msg[] = [];
  closed = false;
  playerId = '';
  token = '';
  constructor(private ws: WebSocket) {
    ws.accept();
    ws.addEventListener('message', (e) => this.msgs.push(JSON.parse(e.data as string)));
    ws.addEventListener('close', () => (this.closed = true));
  }
  send(o: Msg) {
    this.ws.send(JSON.stringify(o));
  }
  close() {
    this.ws.close(1000);
  }
  last(t: string): Msg | undefined {
    return [...this.msgs].reverse().find((m) => m.t === t);
  }
  async waitFor(pred: (m: Msg) => boolean, ms = 4000): Promise<Msg> {
    const start = Date.now();
    for (;;) {
      const hit = this.msgs.find(pred);
      if (hit) return hit;
      if (Date.now() - start > ms) throw new Error(`timeout; got ${this.msgs.map((m) => m.t).join(',')}`);
      await sleep(15);
    }
  }
  /** Wait for a message of type t that arrives after this call. */
  async next(t: string, ms = 4000): Promise<Msg> {
    const from = this.msgs.length;
    const start = Date.now();
    for (;;) {
      const hit = this.msgs.slice(from).find((m) => m.t === t);
      if (hit) return hit;
      if (Date.now() - start > ms) throw new Error(`timeout waiting for ${t}`);
      await sleep(15);
    }
  }
}

async function open(stub: DurableObjectStub, qs: string): Promise<Client> {
  const res = await stub.fetch(`http://room/ws?${qs}`, { headers: { Upgrade: 'websocket' } });
  return new Client(res.webSocket!);
}
const openHost = async (stub: DurableObjectStub, pin: string, role: 'host' | 'screen' = 'host') => {
  const ticket = await signTicket({ pin, role, uid: 'host-1', exp: Date.now() + 60_000 }, env.SESSION_SECRET);
  return open(stub, `role=${role}&ticket=${ticket}`);
};
async function join(stub: DurableObjectStub, nickname: string, extra: Msg = {}): Promise<Client> {
  const c = await open(stub, 'role=player');
  c.send({ t: 'join', nickname, avatar: 'f1-s1-e1-m1-a1-b1', ...extra });
  await c.waitFor((m) => m.t === 'joined' || m.t === 'error');
  const j = c.last('joined');
  if (j) {
    c.playerId = j.playerId;
    c.token = j.token || c.token;
  }
  return c;
}

describe('connections and joining', () => {
  it('rejects a host socket without a valid ticket', async () => {
    const { stub } = await makeGame();
    const bad = await open(stub, 'role=host&ticket=nope');
    const err = await bad.waitFor((m) => m.t === 'error');
    expect(err.code).toBe('forbidden');
  });

  it('rejects a ticket for another game', async () => {
    const { stub } = await makeGame();
    const ticket = await signTicket(
      { pin: '999999', role: 'host', uid: 'host-1', exp: Date.now() + 60_000 },
      env.SESSION_SECRET,
    );
    const c = await open(stub, `role=host&ticket=${ticket}`);
    expect((await c.waitFor((m) => m.t === 'error')).code).toBe('forbidden');
  });

  it('players cannot send host commands', async () => {
    const { stub } = await makeGame();
    const p = await join(stub, 'Riya');
    p.send({ t: 'start' });
    expect((await p.waitFor((m) => m.t === 'error')).code).toBe('forbidden');
  });

  it('lobby shows players; duplicates get a suffix; profanity and bad length refused', async () => {
    const { stub, pin } = await makeGame();
    const host = await openHost(stub, pin);
    const a = await join(stub, 'Riya');
    const b = await join(stub, 'Riya');
    expect(b.last('joined')!.nickname).toBe('Riya 2');
    const bad = await join(stub, 'x');
    expect(bad.last('error')!.code).toBe('bad_nickname');
    const rude = await join(stub, 'fuck');
    expect(rude.last('error')!.code).toBe('bad_nickname');
    await host.waitFor((m) => m.t === 'lobby' && m.players.length === 2);
    expect(a.last('lobby')!.players).toEqual([]); // phones don't receive the roster
  });

  it('rejoins the same seat with the saved token, and refuses a wrong token as a new player', async () => {
    const { stub } = await makeGame();
    const a = await join(stub, 'Riya');
    const id = a.playerId;
    a.close();
    const again = await join(stub, 'Riya', { playerId: id, token: a.token });
    expect(again.last('joined')!.playerId).toBe(id);
    const forged = await join(stub, 'Mallory', { playerId: id, token: 'wrong' });
    expect(forged.last('joined')!.playerId).not.toBe(id);
  });

  it('locked lobby refuses new players but lets existing ones back in', async () => {
    const { stub, pin } = await makeGame();
    const host = await openHost(stub, pin);
    const a = await join(stub, 'Riya');
    host.send({ t: 'lockLobby', locked: true });
    await host.waitFor((m) => m.t === 'lobby' && m.locked);
    const late = await join(stub, 'Late');
    expect(late.last('error')!.code).toBe('locked');
    a.close();
    const back = await join(stub, 'Riya', { playerId: a.playerId, token: a.token });
    expect(back.last('joined')!.playerId).toBe(a.playerId);
  });

  it('persists phase, answers and identity to durable storage at every step, and a fresh socket resumes', async () => {
    // evictDurableObject() hangs in the current pool-workers alpha, so verify what a wake-up would read.
    const { stub, pin } = await makeGame();
    const host = await openHost(stub, pin);
    const a = await join(stub, 'Riya');
    await join(stub, 'Bob');
    host.send({ t: 'start' });
    await a.waitFor((m) => m.t === 'getready');
    host.send({ t: 'skip' });
    await a.waitFor((m) => m.t === 'question');
    a.send({ t: 'answer', q: 0, option: 2 });
    await a.waitFor((m) => m.t === 'answerAck' && m.ok);
    const stored = await runInDurableObject(stub, async (_i, state) => ({
      game: await state.storage.get<any>('game'),
      qs: [...(await state.storage.list({ prefix: 'q:' })).keys()],
    }));
    expect(stored.game.phase).toBe('question');
    expect(stored.game.answers[0][a.playerId].option).toBe(2);
    expect(Object.keys(stored.game.players)).toHaveLength(2);
    expect(stored.game.players[a.playerId].tokenHash).not.toContain(a.token); // only a hash is stored
    expect(stored.qs).toEqual(['q:000', 'q:001']);
    a.close();
    const a2 = await join(stub, 'Riya', { playerId: a.playerId, token: a.token });
    const q = await a2.waitFor((m) => m.t === 'question');
    expect(q).toMatchObject({ index: 0, answered: true, myOption: 2 });
    a2.send({ t: 'answer', q: 0, option: 1 });
    await a2.waitFor((m) => m.t === 'answerAck' && m.reason === 'duplicate');
  });
});

describe('a full game', () => {
  it('runs lobby → question → reveal → leaderboard → podium with server-side scoring', async () => {
    const { stub, pin } = await makeGame();
    const host = await openHost(stub, pin);
    const a = await join(stub, 'Ann');
    const b = await join(stub, 'Bob');

    host.send({ t: 'start' });
    await a.waitFor((m) => m.t === 'getready');
    host.send({ t: 'skip' }); // skip the 3s countdown
    const qa = await a.waitFor((m) => m.t === 'question');
    const qh = await host.waitFor((m) => m.t === 'question');

    // The phone never receives question text, option text or the answer.
    expect(qa.text).toBeUndefined();
    expect(qa.options).toBeUndefined();
    expect(JSON.stringify(qa)).not.toContain('correct');
    expect(qa.optionCount).toBe(4);
    expect(qh.text).toBe('Q1');
    expect(qh.options).toEqual(['A', 'B', 'C', 'D']);

    a.send({ t: 'answer', q: 0, option: 1 }); // correct
    expect((await a.waitFor((m) => m.t === 'answerAck')).ok).toBe(true);
    a.send({ t: 'answer', q: 0, option: 2 }); // duplicate rejected
    await a.waitFor((m) => m.t === 'answerAck' && m.ok === false && m.reason === 'duplicate');
    b.send({ t: 'answer', q: 0, option: 3 }); // wrong; last connected player answering closes early

    const revA = await a.waitFor((m) => m.t === 'reveal');
    const revB = await b.waitFor((m) => m.t === 'reveal');
    expect(revA.you.correct).toBe(true);
    expect(revA.you.points).toBeGreaterThanOrEqual(500);
    expect(revA.you.rank).toBe(1);
    expect(revB.you.correct).toBe(false);
    expect(revB.you.points).toBe(0);
    expect(revB.you.rank).toBe(2);
    const revH = await host.waitFor((m) => m.t === 'reveal');
    expect(revH.counts).toEqual([0, 1, 0, 1]);
    expect(revH.correctOption).toBe(1);

    // late answer after close
    b.send({ t: 'answer', q: 0, option: 1 });
    await b.waitFor((m) => m.t === 'answerAck' && m.ok === false && m.reason === 'closed');

    host.send({ t: 'next' });
    const lb = await host.waitFor((m) => m.t === 'leaderboard');
    expect(lb.top[0].nickname).toBe('Ann');
    expect(lb.isLast).toBe(false);

    host.send({ t: 'next' });
    await host.waitFor((m) => m.t === 'getready' && m.index === 1);
    host.send({ t: 'skip' });
    await host.waitFor((m) => m.t === 'question' && m.index === 1);
    a.send({ t: 'answer', q: 1, option: 0 });
    b.send({ t: 'answer', q: 1, option: 0 });
    await host.waitFor((m) => m.t === 'reveal' && m.index === 1);
    host.send({ t: 'next' });
    await host.waitFor((m) => m.t === 'leaderboard' && m.isLast);
    host.send({ t: 'next' });
    const pod = await host.waitFor((m) => m.t === 'podium');
    expect(pod.top[0].nickname).toBe('Ann');
    expect(pod.results.players).toHaveLength(2);
    const saved = await env.DB.prepare('SELECT results FROM game_results WHERE pin = ?')
      .bind(pin)
      .first<{ results: string }>();
    expect(JSON.parse(saved!.results).players[0].nickname).toBe('Ann');
    expect((await a.waitFor((m) => m.t === 'podium')).you.rank).toBe(1);
  });

  it('closes the question by itself when the timer runs out, and rejects late answers', async () => {
    const { stub, pin } = await makeGame({ questions: [mcq('Q', 0, 5)] });
    const host = await openHost(stub, pin);
    const a = await join(stub, 'Ann');
    const b = await join(stub, 'Bob');
    host.send({ t: 'start' });
    await host.waitFor((m) => m.t === 'getready');
    host.send({ t: 'skip' });
    await a.waitFor((m) => m.t === 'question');
    a.send({ t: 'answer', q: 0, option: 0 }); // b never answers
    const rev = await host.waitFor((m) => m.t === 'reveal', 7000);
    expect(rev.counts).toEqual([1, 0, 0, 0]);
    b.send({ t: 'answer', q: 0, option: 0 });
    await b.waitFor((m) => m.t === 'answerAck' && m.ok === false);
  });

  it('supports type-the-answer with typo tolerance, and the host can accept another answer', async () => {
    const txt: Question = {
      ...newQuestion('text'),
      text: 'Capital of Maharashtra?',
      acceptedAnswers: ['Mumbai', 'Bombay'],
      timeLimitS: 30,
    };
    const { stub, pin } = await makeGame({ questions: [txt] });
    const host = await openHost(stub, pin);
    const a = await join(stub, 'Ann');
    const b = await join(stub, 'Bob');
    const c = await join(stub, 'Cy');
    host.send({ t: 'start' });
    await host.waitFor((m) => m.t === 'getready');
    host.send({ t: 'skip' });
    await a.waitFor((m) => m.t === 'question');
    a.send({ t: 'answer', q: 0, text: ' mumbay ' }); // typo, still correct
    b.send({ t: 'answer', q: 0, text: 'Pune' });
    c.send({ t: 'answer', q: 0, text: 'pune!' });
    const rev = await host.waitFor((m) => m.t === 'reveal');
    expect(rev.topAnswers[0]).toMatchObject({ count: 2, accepted: false });
    expect(rev.accepted).toEqual(['Mumbai', 'Bombay']);
    const revB = await b.waitFor((m) => m.t === 'reveal');
    expect(revB.you.correct).toBe(false);
    expect(revB.topAnswers).toEqual([]); // phones never get typed answers

    const [mb, mc] = [b.msgs.length, c.msgs.length];
    host.send({ t: 'acceptAnswer', text: 'Pune' });
    const again = await b.waitFor((m) => m.t === 'reveal' && b.msgs.indexOf(m) >= mb);
    expect(again.you.correct).toBe(true);
    const againC = await c.waitFor((m) => m.t === 'reveal' && c.msgs.indexOf(m) >= mc);
    expect(againC.you.correct).toBe(true);
  });
});

describe('anti-cheat', () => {
  async function startQ(settings: Partial<GameSettings> = {}, names = ['Ann', 'Bob']) {
    const g = await makeGame({ settings });
    const host = await openHost(g.stub, g.pin);
    const players = [];
    for (const n of names) players.push(await join(g.stub, n));
    host.send({ t: 'start' });
    await host.waitFor((m) => m.t === 'getready');
    host.send({ t: 'skip' });
    await players[0]!.waitFor((m) => m.t === 'question');
    return { ...g, host, players };
  }

  it('flags a short focus loss as minor (flag only, answer still scores)', async () => {
    const { host, players } = await startQ();
    const [a, b] = players as [Client, Client];
    a.send({ t: 'presence', state: 'blur' });
    await sleep(1200);
    a.send({ t: 'presence', state: 'focus' });
    const flag = await host.waitFor((m) => m.t === 'flag');
    expect(flag.flag).toMatchObject({ severity: 'minor', kind: 'blur', nickname: 'Ann' });
    // everyone is told who was flagged
    await b.waitFor((m) => m.t === 'flag' && m.flag.nickname === 'Ann');
    expect((await a.waitFor((m) => m.t === 'warned')).flag.severity).toBe('minor');
    await sleep(3200); // outside the quick-answer window
    a.send({ t: 'answer', q: 0, option: 1 });
    b.send({ t: 'answer', q: 0, option: 1 });
    const rev = await a.waitFor((m) => m.t === 'reveal');
    expect(rev.you.correct).toBe(true);
    expect(rev.you.voided).toBe(false);
  });

  it('ignores sub-second focus loss', async () => {
    const { host, players } = await startQ();
    const a = players[0]!;
    a.send({ t: 'presence', state: 'blur' });
    await sleep(300);
    a.send({ t: 'presence', state: 'focus' });
    await sleep(200);
    expect(host.last('flag')).toBeUndefined();
  });

  it('voids the answer after a 2s+ tab switch, and clearing the flag refunds it for everyone', async () => {
    const { host, players } = await startQ();
    const [a, b] = players as [Client, Client];
    a.send({ t: 'presence', state: 'hidden' });
    await sleep(2200);
    a.send({ t: 'presence', state: 'visible' });
    const flag = (await host.waitFor((m) => m.t === 'flag')).flag;
    expect(flag.severity).toBe('moderate');
    await sleep(3200);
    a.send({ t: 'answer', q: 0, option: 1 });
    b.send({ t: 'answer', q: 0, option: 3 });
    const rev = await a.waitFor((m) => m.t === 'reveal');
    expect(rev.you).toMatchObject({ voided: true, points: 0 });
    const revH = await host.waitFor((m) => m.t === 'reveal');
    expect(revH.voided.map((v: Msg) => v.nickname)).toEqual(['Ann']);

    const seen = a.msgs.length;
    host.send({ t: 'clearFlag', flagId: flag.id });
    await b.waitFor((m) => m.t === 'flagCleared' && m.flagId === flag.id);
    const after = await a.waitFor((m) => m.t === 'reveal' && a.msgs.indexOf(m) >= seen);
    expect(after.you.voided).toBe(false);
    expect(after.you.points).toBeGreaterThan(0);
  });

  it('answering within 3s of returning escalates to major (void + deduction)', async () => {
    const { host, players } = await startQ();
    const [a, b] = players as [Client, Client];
    a.send({ t: 'presence', state: 'hidden' });
    await sleep(1200);
    a.send({ t: 'presence', state: 'visible' });
    await host.waitFor((m) => m.t === 'flag' && m.flag.severity === 'minor');
    a.send({ t: 'answer', q: 0, option: 1 });
    await host.waitFor((m) => m.t === 'flag' && m.flag.severity === 'major' && m.flag.quickAnswer);
    b.send({ t: 'answer', q: 0, option: 1 });
    const rev = await a.waitFor((m) => m.t === 'reveal');
    expect(rev.you).toMatchObject({ voided: true, penalty: 500, points: 0 });
  });

  it('a player who is still away when the question closes is flagged and warned on return', async () => {
    const { host, players } = await startQ({}, ['Ann']);
    const a = players[0]!;
    await sleep(100);
    a.send({ t: 'presence', state: 'hidden' });
    await sleep(2200);
    host.send({ t: 'skip' });
    const flag = await host.waitFor((m) => m.t === 'flag');
    expect(flag.flag.severity).toBe('moderate');
    a.send({ t: 'presence', state: 'visible' });
    await a.waitFor((m) => m.t === 'warned');
  });

  it('auto-kicks at the strike limit after a host override window; override cancels it', async () => {
    const { stub, host, players } = await startQ({ kickStrikes: 2 }, ['Ann', 'Bob']);
    const [a, b] = players as [Client, Client];
    for (const p of [a, b]) {
      p.send({ t: 'presence', state: 'hidden' });
    }
    await sleep(2200);
    for (const p of [a, b]) p.send({ t: 'presence', state: 'visible' });
    const pending = await host.waitFor((m) => m.t === 'pendingRemoval' && m.nickname === 'Bob');
    await host.waitFor((m) => m.t === 'pendingRemoval' && m.nickname === 'Ann');
    host.send({ t: 'overrideKick', playerId: a.playerId });
    await host.waitFor((m) => m.t === 'removalCancelled' && m.playerId === a.playerId);
    expect(pending.endsAt).toBeGreaterThan(Date.now());
    await host.waitFor((m) => m.t === 'removed' && m.playerId === b.playerId, 7000);
    await b.waitFor(() => b.closed);
    expect(a.closed).toBe(false);
    const rejoin = await join(stub, 'Bob', { playerId: b.playerId, token: b.token });
    expect(rejoin.last('error')!.code).toBe('removed');
  });
});

describe('right to erasure', () => {
  it('a player can erase themselves: gone from the roster, answers, flags and saved results', async () => {
    const { stub, pin } = await makeGame({ questions: [mcq('Q1', 1)] });
    const host = await openHost(stub, pin);
    const a = await join(stub, 'Ann');
    const b = await join(stub, 'Bob');
    host.send({ t: 'start' });
    await host.waitFor((m) => m.t === 'getready');
    host.send({ t: 'skip' });
    await a.waitFor((m) => m.t === 'question');
    a.send({ t: 'answer', q: 0, option: 1 });
    await a.waitFor((m) => m.t === 'answerAck' && m.ok);
    a.send({ t: 'leave' });
    await a.waitFor((m) => m.t === 'left');
    await a.waitFor(() => a.closed);
    const stored = await runInDurableObject(stub, async (_i, state) => state.storage.get<any>('game'));
    expect(stored.players[a.playerId]).toBeUndefined();
    expect(stored.answers[0][a.playerId]).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain('Ann');
    // The remaining player still finishes the game, and the saved results never mention Ann.
    b.send({ t: 'answer', q: 0, option: 1 });
    await host.waitFor((m) => m.t === 'reveal');
    host.send({ t: 'next' });
    await host.waitFor((m) => m.t === 'leaderboard');
    host.send({ t: 'next' });
    const pod = await host.waitFor((m) => m.t === 'podium');
    expect(pod.results.players.map((p: Msg) => p.nickname)).toEqual(['Bob']);
    const saved = await env.DB.prepare('SELECT results FROM game_results WHERE pin = ?')
      .bind(pin)
      .first<{ results: string }>();
    expect(saved!.results).not.toContain('Ann');
    // Their old token no longer works.
    const back = await join(stub, 'Ann', { playerId: a.playerId, token: a.token });
    expect(back.last('joined')!.playerId).not.toBe(a.playerId);
  });
});

describe('host controls', () => {
  it('pause freezes the clock; resume gives back the remaining time; extend adds 10s', async () => {
    const { stub, pin } = await makeGame({ questions: [mcq('Q', 0, 5)] });
    const host = await openHost(stub, pin);
    const a = await join(stub, 'Ann');
    host.send({ t: 'start' });
    await host.waitFor((m) => m.t === 'getready');
    host.send({ t: 'skip' });
    await a.waitFor((m) => m.t === 'question');
    host.send({ t: 'pause' });
    const paused = await a.waitFor((m) => m.t === 'question' && m.paused);
    expect(paused.pausedRemainingMs).toBeGreaterThan(3000);
    a.send({ t: 'answer', q: 0, option: 0 });
    await a.waitFor((m) => m.t === 'answerAck' && m.reason === 'paused');
    await sleep(5500); // would have expired if the clock were running
    expect(host.last('reveal')).toBeUndefined();
    host.send({ t: 'extend' });
    host.send({ t: 'resume' });
    const resumed = await a.waitFor((m) => m.t === 'question' && !m.paused && m.limitMs === 15000);
    expect(resumed.endsAt - Date.now()).toBeGreaterThan(10000);
    a.send({ t: 'answer', q: 0, option: 0 });
    await host.waitFor((m) => m.t === 'reveal');
  });

  it('kick removes a player and blocks rejoin; end moves to podium then ends the game', async () => {
    const { stub, pin } = await makeGame();
    const host = await openHost(stub, pin);
    const a = await join(stub, 'Ann');
    const b = await join(stub, 'Bob');
    host.send({ t: 'kick', playerId: b.playerId });
    await host.waitFor((m) => m.t === 'removed' && m.playerId === b.playerId);
    const back = await join(stub, 'Bob', { playerId: b.playerId, token: b.token });
    expect(back.last('error')!.code).toBe('removed');
    host.send({ t: 'end' });
    await a.waitFor((m) => m.t === 'podium');
    host.send({ t: 'end' });
    await a.waitFor((m) => m.t === 'ended');
    const late = await join(stub, 'Zed');
    expect(late.last('error')!.code).toBe('ended');
  });

  it('rename applies uniqueness and profanity rules', async () => {
    const { stub, pin } = await makeGame();
    const host = await openHost(stub, pin);
    const a = await join(stub, 'Ann');
    await join(stub, 'Bob');
    host.send({ t: 'rename', playerId: a.playerId, nickname: 'Bob' });
    const j = await a.waitFor((m) => m.t === 'joined' && m.nickname === 'Bob 2');
    expect(j.nickname).toBe('Bob 2');
  });

  it('ignores malformed messages', async () => {
    const { stub } = await makeGame();
    const p = await join(stub, 'Ann');
    p.send({ t: 'answer', q: 0, option: 99 });
    p.send({ t: 'nonsense' });
    p.send({ t: 'ping' });
    await p.waitFor((m) => m.t === 'pong');
  });
});
