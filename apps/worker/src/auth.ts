import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { randomToken, sha256Hex } from './crypto';
import type { Env } from './env';

export interface User {
  id: string;
  name: string;
}

const COOKIE = 'qa_session';
const SESSION_MS = 30 * 24 * 3600 * 1000;

type C = Context<{ Bindings: Env; Variables: { user: User } }>;
const isSecure = (c: C) => new URL(c.req.url).protocol === 'https:';

export async function currentUser(c: C): Promise<User | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const id = await sha256Hex(token);
  return c.env.DB.prepare(
    `SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(id, Date.now())
    .first<User>();
}

export async function startSession(c: C, userId: string): Promise<void> {
  const token = randomToken(32);
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)')
    .bind(await sha256Hex(token), userId, Date.now() + SESSION_MS)
    .run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MS / 1000,
  });
}

export async function endSession(c: C): Promise<void> {
  const token = getCookie(c, COOKIE);
  if (token)
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?')
      .bind(await sha256Hex(token))
      .run();
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function upsertUser(
  db: D1Database,
  key: { googleId?: string; id?: string },
  profile: { name: string },
): Promise<string> {
  if (key.googleId) {
    const existing = await db
      .prepare('SELECT id FROM users WHERE google_id = ?')
      .bind(key.googleId)
      .first<{ id: string }>();
    if (existing) {
      await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(profile.name, existing.id).run();
      return existing.id;
    }
  }
  const id = key.id ?? crypto.randomUUID();
  await db
    .prepare('INSERT OR IGNORE INTO users (id, google_id, name, created_at) VALUES (?,?,?,?)')
    .bind(id, key.googleId ?? null, profile.name, Date.now())
    .run();
  return id;
}

/* ---------- Google OAuth (authorization-code flow) ---------- */

export function googleStartUrl(c: C): string | null {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  const state = randomToken(16);
  setCookie(c, 'qa_oauth_state', state, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax',
    path: '/api/auth',
    maxAge: 600,
  });
  const origin = new URL(c.req.url).origin;
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function googleCallback(c: C): Promise<string | null> {
  const { code, state } = c.req.query();
  const saved = getCookie(c, 'qa_oauth_state');
  deleteCookie(c, 'qa_oauth_state', { path: '/api/auth' });
  if (!code || !state || !saved || state !== saved) return null;
  const origin = new URL(c.req.url).origin;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: c.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) return null;
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) return null;
  // The id_token came straight from Google's token endpoint over TLS, so decoding it is sufficient.
  const payload = JSON.parse(atob(id_token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as {
    sub: string;
    name?: string;
  };
  // Only the subject id and display name are kept: no email address, no profile picture.
  return upsertUser(c.env.DB, { googleId: payload.sub }, { name: (payload.name ?? 'Host').slice(0, 60) });
}
