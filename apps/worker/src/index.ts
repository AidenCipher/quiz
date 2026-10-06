import { Hono } from 'hono';
import { QuizDraftSchema, QuizSchema } from '@quiz/shared';
import {
  currentUser, endSession, googleCallback, googleStartUrl, startSession, upsertUser, type User,
} from './auth';
import { signTicket } from './crypto';
import { getQuiz, listQuizzes, saveQuiz } from './db';
import type { Env } from './env';
import type { InitPayload } from './room';

export { GameRoom } from './room';

type Vars = { user: User };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();

/* ---- tiny per-isolate rate limiter (join/PIN guessing) ---- */
const hits = new Map<string, { n: number; reset: number }>();
function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now > h.reset) {
    if (hits.size > 5000) hits.clear();
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  return ++h.n > max;
}
const ip = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'local';

const roomStub = (env: Env, pin: string) => env.GAME_ROOM.get(env.GAME_ROOM.idFromName(pin));
const validPin = (pin: string) => /^\d{6}$/.test(pin);

/* ---------------- public ---------------- */

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/games/:pin', async (c) => {
  const pin = c.req.param('pin');
  if (!validPin(pin) || limited(`pin:${ip(c.req.raw)}`, 30, 60_000)) return c.json({ exists: false }, 404);
  const live = await c.env.DB.prepare('SELECT 1 FROM live_games WHERE pin = ?').bind(pin).first();
  if (!live) return c.json({ exists: false }, 404);
  return roomStub(c.env, pin).fetch('http://room/info');
});

app.get('/ws/:pin', async (c) => {
  const pin = c.req.param('pin');
  if (!validPin(pin)) return c.text('bad pin', 400);
  const role = c.req.query('role') ?? 'player';
  if (role === 'player' && limited(`ws:${ip(c.req.raw)}`, 120, 60_000)) return c.text('rate limited', 429);
  const live = await c.env.DB.prepare('SELECT 1 FROM live_games WHERE pin = ?').bind(pin).first();
  if (!live) return c.text('not found', 404);
  const url = new URL(c.req.url);
  return roomStub(c.env, pin).fetch(new Request(`http://room/ws${url.search}`, c.req.raw));
});

app.post('/api/log', async (c) => {
  const body = (await c.req.text()).slice(0, 2000);
  console.log(JSON.stringify({ event: 'client_error', body }));
  return c.body(null, 204);
});

/* ---------------- auth ---------------- */

app.get('/api/me', async (c) => {
  const user = await currentUser(c);
  return c.json({
    user,
    devLogin: c.env.DEV_LOGIN === '1',
    google: !!c.env.GOOGLE_CLIENT_ID,
  });
});

app.get('/api/auth/google', (c) => {
  const url = googleStartUrl(c);
  return url ? c.redirect(url) : c.text('Google sign-in is not configured', 501);
});

app.get('/api/auth/google/callback', async (c) => {
  const uid = await googleCallback(c);
  if (!uid) return c.redirect('/?auth=failed');
  await startSession(c, uid);
  return c.redirect('/host');
});

app.post('/api/auth/dev', async (c) => {
  if (c.env.DEV_LOGIN !== '1') return c.text('disabled', 404);
  const { name } = await c.req.json<{ name?: string }>().catch(() => ({ name: undefined }));
  const clean = (name ?? 'Dev Host').trim().slice(0, 40) || 'Dev Host';
  const uid = await upsertUser(c.env.DB, { id: `dev:${clean.toLowerCase()}` }, { name: clean });
  await startSession(c, uid);
  return c.json({ ok: true });
});

app.post('/api/auth/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

/* ---------------- host-only ---------------- */

const host = new Hono<{ Bindings: Env; Variables: Vars }>();
host.use('*', async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
});

host.get('/quizzes', async (c) => c.json(await listQuizzes(c.env.DB, c.get('user').id)));

host.post('/quizzes', async (c) => {
  const parsed = QuizDraftSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
  const id = crypto.randomUUID();
  await saveQuiz(c.env.DB, c.get('user').id, id, parsed.data, true);
  return c.json({ id }, 201);
});

host.get('/quizzes/:id', async (c) => {
  const quiz = await getQuiz(c.env.DB, c.req.param('id'), c.get('user').id);
  return quiz ? c.json(quiz) : c.json({ error: 'not found' }, 404);
});

host.put('/quizzes/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await getQuiz(c.env.DB, id, c.get('user').id))) return c.json({ error: 'not found' }, 404);
  const parsed = QuizDraftSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
  await saveQuiz(c.env.DB, c.get('user').id, id, parsed.data, false);
  return c.json({ ok: true, updatedAt: Date.now() });
});

host.delete('/quizzes/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM quizzes WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), c.get('user').id).run();
  return c.json({ ok: true });
});

/** Open a lobby: validates the quiz strictly, allocates a PIN, boots the game room. */
host.post('/quizzes/:id/host', async (c) => {
  const user = c.get('user');
  const row = await getQuiz(c.env.DB, c.req.param('id'), user.id);
  if (!row) return c.json({ error: 'not found' }, 404);
  const parsed = QuizSchema.safeParse({ title: row.title, settings: row.settings, questions: row.questions });
  if (!parsed.success) return c.json({ error: 'quiz incomplete', issues: parsed.error.issues }, 422);

  await c.env.DB.prepare('DELETE FROM live_games WHERE created_at < ?').bind(Date.now() - 12 * 3600_000).run();
  let pin = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
    const res = await c.env.DB.prepare('INSERT OR IGNORE INTO live_games (pin, quiz_id, host_id, created_at) VALUES (?,?,?,?)')
      .bind(candidate, row.id, user.id, Date.now())
      .run();
    if (res.meta.changes === 1) {
      pin = candidate;
      break;
    }
  }
  if (!pin) return c.json({ error: 'no free pin' }, 503);

  const payload: InitPayload = {
    pin,
    hostId: user.id,
    quizId: row.id,
    title: parsed.data.title,
    settings: parsed.data.settings,
    questions: parsed.data.questions,
  };
  const res = await roomStub(c.env, pin).fetch('http://room/init', { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) {
    await c.env.DB.prepare('DELETE FROM live_games WHERE pin = ?').bind(pin).run();
    return c.json({ error: 'could not start game' }, 500);
  }
  return c.json({ pin });
});

/** Short-lived ticket so only the owning host can drive (or mirror) a game. */
host.post('/games/:pin/ticket', async (c) => {
  const pin = c.req.param('pin');
  const role = c.req.query('role') === 'screen' ? 'screen' : 'host';
  const live = await c.env.DB.prepare('SELECT host_id FROM live_games WHERE pin = ?').bind(pin).first<{ host_id: string }>();
  if (!live || live.host_id !== c.get('user').id) return c.json({ error: 'not found' }, 404);
  const ticket = await signTicket({ pin, role, uid: live.host_id, exp: Date.now() + 60_000 }, c.env.SESSION_SECRET);
  return c.json({ ticket });
});

host.get('/results', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.pin, r.ended_at AS endedAt, q.title,
            json_array_length(json_extract(r.results, '$.players')) AS players
       FROM game_results r LEFT JOIN quizzes q ON q.id = r.quiz_id
      WHERE r.host_id = ? ORDER BY r.ended_at DESC LIMIT 100`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json(results);
});

host.get('/results/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT results FROM game_results WHERE id = ? AND host_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .first<{ results: string }>();
  return row ? c.json(JSON.parse(row.results)) : c.json({ error: 'not found' }, 404);
});

app.route('/api', host);

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'not found' }, 404) : c.env.ASSETS.fetch(c.req.raw)));

export default {
  fetch: app.fetch,
  /** Daily housekeeping: results older than 30 days, stale PINs and sessions. */
  async scheduled(_e: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM game_results WHERE ended_at < ?').bind(now - 30 * 86400_000),
      env.DB.prepare('DELETE FROM live_games WHERE created_at < ?').bind(now - 12 * 3600_000),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    ]);
  },
} satisfies ExportedHandler<Env>;
