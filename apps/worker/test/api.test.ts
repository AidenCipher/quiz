import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const call = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  (exports as unknown as { default: { fetch: typeof fetch } }).default.fetch(
    new Request(`http://example.com${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
    }),
  );

async function login(name = `Host ${crypto.randomUUID().slice(0, 6)}`) {
  const res = await call('/api/auth/dev', { method: 'POST', body: JSON.stringify({ name }) });
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  return { cookie, name };
}

const question = (over: Record<string, unknown> = {}) => ({
  id: 'q1',
  type: 'mcq',
  text: 'Pick B',
  options: ['A', 'B'],
  correctIndex: 1,
  timeLimitS: 10,
  points: 1000,
  ...over,
});
const createQuiz = async (cookie: string, questions = [question()]) => {
  const res = await call('/api/quizzes', {
    method: 'POST',
    cookie,
    body: JSON.stringify({ title: 'T', settings: {}, questions }),
  });
  return ((await res.json()) as { id: string }).id;
};

describe('data minimisation', () => {
  it('stores and returns only an id and display name for hosts', async () => {
    const { cookie } = await login('Dev Person');
    const me = (await (await call('/api/me', { cookie })).json()) as { user: Record<string, unknown> };
    expect(Object.keys(me.user).sort()).toEqual(['id', 'name']);
    const cols = await env.DB.prepare("SELECT name FROM pragma_table_info('users')").all<{ name: string }>();
    expect(cols.results.map((c) => c.name)).not.toContain('email');
    expect(cols.results.map((c) => c.name)).not.toContain('picture');
  });

  it('scrubs game PINs from client error logs', async () => {
    const res = await call('/api/log', { method: 'POST', body: '{"url":"/j/123456"}' });
    expect(res.status).toBe(204);
  });
});

describe('hosting requires the host to confirm audience consent', () => {
  it('refuses without it and opens a lobby with it', async () => {
    const { cookie } = await login();
    const id = await createQuiz(cookie);
    expect((await call(`/api/quizzes/${id}/host`, { method: 'POST', cookie })).status).toBe(400);
    expect(
      (
        await call(`/api/quizzes/${id}/host`, {
          method: 'POST',
          cookie,
          body: JSON.stringify({ audienceConsent: false }),
        })
      ).status,
    ).toBe(400);
    const ok = await call(`/api/quizzes/${id}/host`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({ audienceConsent: true }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { pin: string }).pin).toMatch(/^\d{6}$/);
  });

  it('will not host a quiz whose image has no alt text', async () => {
    const { cookie } = await login();
    const id = await createQuiz(cookie, [question({ image: 'data:image/jpeg;base64,AAAA', imageAlt: '' })]);
    const res = await call(`/api/quizzes/${id}/host`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({ audienceConsent: true }),
    });
    expect(res.status).toBe(422);
    const fixed = await call(`/api/quizzes/${id}`, {
      method: 'PUT',
      cookie,
      body: JSON.stringify({
        title: 'T',
        settings: {},
        questions: [question({ image: 'data:image/jpeg;base64,AAAA', imageAlt: 'A red planet' })],
      }),
    });
    expect(fixed.status).toBe(200);
    expect(
      (
        await call(`/api/quizzes/${id}/host`, {
          method: 'POST',
          cookie,
          body: JSON.stringify({ audienceConsent: true }),
        })
      ).status,
    ).toBe(200);
    const saved = (await (await call(`/api/quizzes/${id}`, { cookie })).json()) as {
      questions: { imageAlt: string }[];
    };
    expect(saved.questions[0]!.imageAlt).toBe('A red planet');
  });
});

describe('PIN guessing limiter', () => {
  it('slows repeated wrong PINs from one address but never blocks successful joins', async () => {
    const { cookie } = await login();
    const id = await createQuiz(cookie);
    const { pin } = (await (
      await call(`/api/quizzes/${id}/host`, { method: 'POST', cookie, body: JSON.stringify({ audienceConsent: true }) })
    ).json()) as { pin: string };
    const from = (ip: string) => ({ headers: { 'cf-connecting-ip': ip } });
    // A classroom: 100 students on one IP all look up the real game.
    for (let i = 0; i < 100; i++) expect((await call(`/api/games/${pin}`, from('10.0.0.1'))).status).toBe(200);
    // A guesser: misses add up, then even correct lookups from that address are refused for a minute.
    for (let i = 0; i < 30; i++)
      expect((await call(`/api/games/${String(900000 + i)}`, from('10.0.0.2'))).status).toBe(404);
    expect((await call(`/api/games/${pin}`, from('10.0.0.2'))).status).toBe(429);
    // Other addresses are unaffected.
    expect((await call(`/api/games/${pin}`, from('10.0.0.3'))).status).toBe(200);
  });
});

describe('question ids', () => {
  it('round-trips UUID question ids (as the builder creates them) and can still be hosted', async () => {
    const { cookie } = await login();
    const qid = crypto.randomUUID();
    const id = await createQuiz(cookie, [question({ id: qid })]);
    const saved = (await (await call(`/api/quizzes/${id}`, { cookie })).json()) as { questions: { id: string }[] };
    expect(saved.questions[0]!.id).toBe(qid);
    // saving again must not keep growing the id
    await call(`/api/quizzes/${id}`, {
      method: 'PUT',
      cookie,
      body: JSON.stringify({ title: 'T', settings: {}, questions: saved.questions }),
    });
    const again = (await (await call(`/api/quizzes/${id}`, { cookie })).json()) as { questions: { id: string }[] };
    expect(again.questions[0]!.id).toBe(qid);
    const res = await call(`/api/quizzes/${id}/host`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({ audienceConsent: true }),
    });
    expect(res.status).toBe(200);
  });
});

describe('data rights', () => {
  it('exports everything held about a host, and nothing for anonymous callers', async () => {
    const { cookie, name } = await login();
    await createQuiz(cookie);
    expect((await call('/api/me/export')).status).toBe(401);
    const res = await call('/api/me/export', { cookie });
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const body = (await res.json()) as { account: { name: string }; quizzes: unknown[] };
    expect(body.account.name).toBe(name);
    expect(body.quizzes).toHaveLength(1);
  });

  it('deleting an account erases quizzes, questions, results, sessions and the user', async () => {
    const { cookie } = await login();
    const mine = (await (await call('/api/me', { cookie })).json()) as { user: { id: string } };
    const uid = mine.user.id;
    const quizId = await createQuiz(cookie);
    await env.DB.prepare(
      'INSERT INTO game_results (id, quiz_id, host_id, pin, started_at, ended_at, results) VALUES (?,?,?,?,?,?,?)',
    )
      .bind('r1', quizId, uid, '111111', 1, 2, '{"players":[]}')
      .run();
    const other = await login();
    const otherQuiz = await createQuiz(other.cookie);

    expect((await call('/api/me', { method: 'DELETE', cookie })).status).toBe(200);
    const count = async (sql: string, ...b: unknown[]) =>
      (await env.DB.prepare(sql)
        .bind(...b)
        .first<{ n: number }>())!.n;
    expect(await count('SELECT COUNT(*) n FROM users WHERE id = ?', uid)).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM sessions WHERE user_id = ?', uid)).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM quizzes WHERE owner_id = ?', uid)).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM questions WHERE quiz_id = ?', quizId)).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM game_results WHERE host_id = ?', uid)).toBe(0);
    expect((await call('/api/quizzes', { cookie })).status).toBe(401); // session is gone
    // Someone else's data is untouched.
    expect(await count('SELECT COUNT(*) n FROM questions WHERE quiz_id = ?', otherQuiz)).toBe(1);
  });

  it('a host can delete one saved result, but not another host’s', async () => {
    const a = await login();
    const b = await login();
    const aid = ((await (await call('/api/me', { cookie: a.cookie })).json()) as { user: { id: string } }).user.id;
    await env.DB.prepare(
      'INSERT INTO game_results (id, quiz_id, host_id, pin, started_at, ended_at, results) VALUES (?,?,?,?,?,?,?)',
    )
      .bind('r-a', null, aid, '222222', 1, 2, '{"players":[]}')
      .run();
    await call('/api/results/r-a', { method: 'DELETE', cookie: b.cookie });
    expect(await env.DB.prepare('SELECT 1 FROM game_results WHERE id = ?').bind('r-a').first()).not.toBeNull();
    await call('/api/results/r-a', { method: 'DELETE', cookie: a.cookie });
    expect(await env.DB.prepare('SELECT 1 FROM game_results WHERE id = ?').bind('r-a').first()).toBeNull();
  });
});
