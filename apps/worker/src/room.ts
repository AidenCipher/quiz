import { DurableObject } from 'cloudflare:workers';
import {
  ANSWER_GRACE_MS,
  ClientMsgSchema,
  DEFAULT_AVATAR,
  EXTEND_MS,
  GET_READY_MS,
  HEARTBEAT_GAP_FLAG_MS,
  HOST_ONLY,
  KICK_OVERRIDE_MS,
  MAX_PLAYERS,
  STRIKE_POINTS,
  checkNickname,
  computeCallouts,
  flagCallout,
  gradeFlag,
  isProfane,
  isValidAvatar,
  matchesAnswer,
  normalizeAnswer,
  rankPlayers,
  scoreGame,
  uniqueNickname,
  type AnswerRec,
  type BoardRow,
  type Callout,
  type PlayerOutcome,
  type QuestionCallouts,
  type ClientMsg,
  type ErrorCode,
  type FlagInfo,
  type FlagKind,
  type GameSettings,
  type LobbyPlayer,
  type PlayerScore,
  type Question,
  type QuestionMeta,
  type ResultsPayload,
  type ServerMsg,
  type Severity,
} from '@quiz/shared';
import { randomToken, sha256Hex, verifyTicket } from './crypto';
import type { Env } from './env';

export type Phase = 'lobby' | 'getready' | 'question' | 'reveal' | 'leaderboard' | 'podium' | 'ended';
type Role = 'host' | 'screen' | 'player';

interface PlayerRec {
  id: string;
  tokenHash: string;
  nickname: string;
  avatar: string;
  removed: boolean;
  /** Where the player currently is "away" from the quiz tab, if anywhere. */
  awaySince: { kind: FlagKind; at: number } | null;
  /** When they came back after a counted flag; used for the quick-answer rule. */
  returnFlag: { flagId: string; at: number } | null;
  warnQueue: string[];
  kickOverridden: boolean;
  pendingRemovalAt: number | null;
  /** When their last socket dropped; used for a short reconnect grace before a question closes early. */
  dropAt?: number | null;
}

interface FlagRec {
  id: string;
  playerId: string;
  q: number;
  kind: FlagKind;
  severity: Severity;
  awayMs: number;
  strike: number;
  at: number;
  cleared: boolean;
  quickAnswer?: boolean;
  quip?: Callout;
}

interface GameState {
  v: 1;
  pin: string;
  hostId: string;
  quizId: string;
  title: string;
  settings: GameSettings;
  questionCount: number;
  phase: Phase;
  qIndex: number;
  openedAt: number;
  endsAt: number;
  limitMs: number;
  pausedAt: number | null;
  pausedRemainingMs: number | null;
  getReadyEndsAt: number;
  locked: boolean;
  startedAt: number | null;
  endedAt: number | null;
  closed: number;
  players: Record<string, PlayerRec>;
  answers: Record<number, Record<string, AnswerRec>>;
  limits: Record<number, number>;
  flags: FlagRec[];
  extraAccepted: Record<number, string[]>;
  prevRanks: Record<string, number>;
  shownRanks: Record<string, number>;
  flagSeq: number;
  cleanupAt: number | null;
  alarmAt: number | null;
  resultsSaved: boolean;
  /** Who got the room-wide callout in earlier questions, so it rotates between people. */
  spotlights?: { q: number; id: string }[];
}

interface Attachment {
  role: Role;
  playerId: string | null;
}

export interface InitPayload {
  pin: string;
  hostId: string;
  quizId: string;
  title: string;
  settings: GameSettings;
  questions: Question[];
}

const qKey = (i: number) => `q:${String(i).padStart(3, '0')}`;
/** One storage key per answer: saving an answer writes ~50 bytes instead of rewriting the whole game. */
const answerKey = (q: number, pid: string) => `a:${String(q).padStart(3, '0')}:${pid}`;
const MAX_MSG_BYTES = 4096;
const CLEANUP_AFTER_END_MS = 10 * 60_000;
/** A phone that drops mid-question gets this long to come back before "everyone answered" can close the question. */
const RECONNECT_GRACE_MS = 6000;
const IDLE_CLEANUP_MS = 6 * 60 * 60_000;

const log = (event: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ event, ...data }));

export class GameRoom extends DurableObject<Env> {
  private state: GameState | null = null;
  private questions: Question[] = [];
  /** Per-socket token bucket: [tokens, lastRefill]. Reset on wake, which is fine. */
  private buckets = new WeakMap<WebSocket, [number, number]>();
  private pingAt = new Map<string, number>();
  private maxGap = new Map<string, number>();
  private dropped = 0;
  // Host debug panel: live, in-memory only (nothing here is stored).
  private msgSeconds = new Map<number, number>();
  private rtts = new Map<string, number>();
  private lastAnswerAt = 0;
  private lastClose: { index: number; ms: number; by: 'all-answered' | 'timer' | 'host' } | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<GameState>('game');
      this.state = stored ? { ...stored, answers: stored.answers ?? {} } : null; // `answers` is kept in its own keys
      if (this.state) {
        const entries = await ctx.storage.list<Question>({ prefix: 'q:' });
        this.questions = [...entries.values()];
        const answers = await ctx.storage.list<AnswerRec>({ prefix: 'a:' });
        for (const [key, rec] of answers) {
          const [, q, pid] = key.split(':');
          if (q === undefined || pid === undefined) continue;
          (this.state.answers[Number(q)] ??= {})[pid] = rec;
        }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* HTTP entry points (called by the Worker, never directly by clients) */
  /* ------------------------------------------------------------------ */

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.state) return new Response('exists', { status: 409 });
      const p = (await request.json()) as InitPayload;
      const now = Date.now();
      this.state = {
        v: 1,
        pin: p.pin,
        hostId: p.hostId,
        quizId: p.quizId,
        title: p.title,
        settings: p.settings,
        questionCount: p.questions.length,
        phase: 'lobby',
        qIndex: -1,
        openedAt: 0,
        endsAt: 0,
        limitMs: 0,
        pausedAt: null,
        pausedRemainingMs: null,
        getReadyEndsAt: 0,
        locked: false,
        startedAt: null,
        endedAt: null,
        closed: 0,
        players: {},
        answers: {},
        limits: {},
        flags: [],
        extraAccepted: {},
        prevRanks: {},
        shownRanks: {},
        flagSeq: 0,
        cleanupAt: now + IDLE_CLEANUP_MS,
        alarmAt: null,
        resultsSaved: false,
      };
      this.questions = p.questions;
      const puts: Record<string, unknown> = { game: this.state };
      p.questions.forEach((q, i) => (puts[qKey(i)] = q));
      await this.ctx.storage.put(puts);
      await this.scheduleAlarm();
      log('game_created', { pin: p.pin, questions: p.questions.length });
      return new Response('ok');
    }

    if (url.pathname === '/info') {
      const s = this.state;
      if (!s || s.phase === 'ended') return Response.json({ exists: false });
      return Response.json({
        exists: true,
        phase: s.phase,
        locked: s.locked || (s.startedAt !== null && !s.settings.lateJoin),
        title: s.title,
      });
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const s = this.state;
      const role = (url.searchParams.get('role') ?? 'player') as Role;
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);

      if (!s || s.phase === 'ended') {
        server.serializeAttachment({ role: 'player', playerId: null } satisfies Attachment);
        this.send(server, { t: 'error', code: s ? 'ended' : 'not_found', message: 'Game not found' });
        server.close(1000, 'gone');
        return new Response(null, { status: 101, webSocket: client });
      }

      if (role === 'host' || role === 'screen') {
        const claims = await verifyTicket(url.searchParams.get('ticket') ?? '', this.env.SESSION_SECRET);
        if (!claims || claims.pin !== s.pin || claims.role !== role || claims.uid !== s.hostId) {
          server.serializeAttachment({ role: 'player', playerId: null } satisfies Attachment);
          this.send(server, { t: 'error', code: 'forbidden', message: 'Invalid host ticket' });
          server.close(1008, 'forbidden');
          return new Response(null, { status: 101, webSocket: client });
        }
        server.serializeAttachment({ role, playerId: null } satisfies Attachment);
        this.send(server, { t: 'hello', role, pin: s.pin, title: s.title } as ServerMsg);
        this.send(server, this.phaseMsg({ role, playerId: null }));
        if (s.phase !== 'lobby') {
          this.send(server, { t: 'roster', players: this.lobbyPlayers(s), locked: s.locked } as ServerMsg);
          for (const f of s.flags) this.send(server, { t: 'flag', flag: this.flagInfo(s, f) } as ServerMsg);
        }
        if (role === 'host') this.sendPendingRemovals(server);
      } else {
        // Players identify themselves with a `join` message right after connecting.
        server.serializeAttachment({ role: 'player', playerId: null } satisfies Attachment);
        this.send(server, { t: 'hello', role: 'player', pin: s.pin, title: s.title } as ServerMsg);
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  /* ------------------------------------------------------------------ */
  /* WebSocket handlers                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Messages from one socket are handled strictly in order. `join` awaits a hash, so without this an answer sent
   * right behind it (a reconnecting phone flushing its queue) could be processed before the player was identified.
   */
  private chains = new WeakMap<WebSocket, Promise<void>>();

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const next = (this.chains.get(ws) ?? Promise.resolve())
      .then(() => this.handleMessage(ws, data))
      .catch((e) => log('message_error', { error: String(e) }));
    this.chains.set(ws, next);
    await next;
  }

  private async handleMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const s = this.state;
    if (!s || typeof data !== 'string' || data.length > MAX_MSG_BYTES) return this.drop();
    if (!this.allow(ws)) {
      this.send(ws, { t: 'error', code: 'rate_limited', message: 'Slow down' });
      return;
    }
    let msg: ClientMsg;
    try {
      const parsed = ClientMsgSchema.safeParse(JSON.parse(data));
      if (!parsed.success) return this.drop();
      msg = parsed.data;
    } catch {
      return this.drop();
    }

    const att = (ws.deserializeAttachment() as Attachment | null) ?? { role: 'player', playerId: null };
    const now = Date.now();
    this.countMessage(now);

    if (msg.t === 'debug') {
      if (att.role === 'host') this.send(ws, this.debugSnapshot(s, now));
      else this.send(ws, { t: 'error', code: 'forbidden', message: 'Host only' });
      return;
    }

    if (HOST_ONLY.has(msg.t)) {
      if (att.role !== 'host') {
        this.send(ws, { t: 'error', code: 'forbidden', message: 'Host only' });
        return;
      }
      await this.handleHost(s, msg, now);
    } else if (att.role === 'player') {
      if (msg.t === 'join') await this.handleJoin(s, ws, att, msg, now);
      else if (att.playerId) {
        const p = s.players[att.playerId];
        if (p && !p.removed) {
          if (msg.t === 'answer') await this.handleAnswer(s, p, msg, now);
          else if (msg.t === 'presence') await this.handlePresence(s, p, msg, now);
          else if (msg.t === 'ping') this.handlePing(s, p, ws, now, msg.rtt);
          else if (msg.t === 'leave') await this.eraseSelf(s, p, ws);
        }
      }
    } else if (msg.t === 'ping') {
      this.send(ws, { t: 'pong' } as ServerMsg);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.onDisconnect(ws);
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.onDisconnect(ws);
  }

  private async onDisconnect(ws: WebSocket): Promise<void> {
    const s = this.state;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!s || !att) return;
    if (att.role === 'player' && att.playerId) {
      const p = s.players[att.playerId];
      const stillConnected = this.sockets().some(
        (w) => w !== ws && (w.deserializeAttachment() as Attachment | null)?.playerId === att.playerId,
      );
      if (p && !stillConnected && !p.removed) {
        const now = Date.now();
        p.dropAt = now;
        if (!p.awaySince) p.awaySince = { kind: 'left', at: now };
        await this.save();
        this.broadcastRoster();
        if (s.phase === 'question') {
          this.broadcastProgress();
          await this.maybeCloseEarly(s);
          await this.scheduleAlarm(); // wake up when the reconnect grace ends
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Alarm: the single timer that drives phases                          */
  /* ------------------------------------------------------------------ */

  async alarm(): Promise<void> {
    const s = this.state;
    if (!s) return;
    const now = Date.now();
    s.alarmAt = null;

    if (s.phase === 'getready' && now >= s.getReadyEndsAt) await this.openQuestion(s, now);
    else if (s.phase === 'question' && s.pausedAt === null && now >= s.endsAt) {
      await this.closeQuestion(s, now, false, 'timer');
    }

    for (const p of Object.values(s.players)) {
      if (p.pendingRemovalAt !== null && now >= p.pendingRemovalAt && !p.removed) {
        await this.removePlayer(s, p, 'strikes');
      }
    }
    // A reconnect grace may just have run out for the last player we were waiting on.
    await this.maybeCloseEarly(s);

    if (s.cleanupAt !== null && now >= s.cleanupAt) {
      log('game_cleanup', { pin: s.pin });
      for (const ws of this.sockets()) {
        try {
          ws.close(1000, 'game over');
        } catch {
          /* already closed */
        }
      }
      await this.releasePin(s);
      await this.ctx.storage.deleteAll();
      this.state = null;
      this.questions = [];
      return;
    }
    await this.save();
    await this.scheduleAlarm();
  }

  private nextDeadline(s: GameState): number | null {
    const c: number[] = [];
    if (s.phase === 'getready') c.push(s.getReadyEndsAt);
    if (s.phase === 'question' && s.pausedAt === null) c.push(s.endsAt);
    for (const p of Object.values(s.players)) if (p.pendingRemovalAt !== null && !p.removed) c.push(p.pendingRemovalAt);
    if (s.phase === 'question' && s.pausedAt === null) {
      for (const p of Object.values(s.players)) {
        if (p.dropAt && !p.removed && p.dropAt + RECONNECT_GRACE_MS > Date.now()) c.push(p.dropAt + RECONNECT_GRACE_MS);
      }
    }
    if (s.cleanupAt !== null) c.push(s.cleanupAt);
    return c.length ? Math.min(...c) : null;
  }

  private async scheduleAlarm(): Promise<void> {
    const s = this.state;
    if (!s) return;
    const next = this.nextDeadline(s);
    if (next === s.alarmAt) return;
    s.alarmAt = next;
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }

  /* ------------------------------------------------------------------ */
  /* Players                                                             */
  /* ------------------------------------------------------------------ */

  private async handleJoin(
    s: GameState,
    ws: WebSocket,
    att: Attachment,
    msg: Extract<ClientMsg, { t: 'join' }>,
    now: number,
  ): Promise<void> {
    if (s.phase === 'ended') return this.sendError(ws, 'ended', 'This game has ended');

    let p: PlayerRec | undefined;
    if (msg.playerId && msg.token) {
      const existing = s.players[msg.playerId];
      if (existing && existing.tokenHash === (await sha256Hex(msg.token))) p = existing;
    }

    if (p) {
      if (p.removed) {
        this.sendError(ws, 'removed', 'You were removed from this game');
        ws.close(1000, 'removed');
        return;
      }
    } else {
      const started = s.startedAt !== null;
      if (s.locked || (started && !s.settings.lateJoin)) {
        return this.sendError(ws, 'locked', 'This game is not accepting new players');
      }
      if (Object.keys(s.players).length >= MAX_PLAYERS) return this.sendError(ws, 'full', 'This game is full');
      const check = checkNickname(msg.nickname);
      if (!check.ok) {
        return this.sendError(
          ws,
          'bad_nickname',
          check.reason === 'length' ? 'Nickname must be 2–16 characters' : 'Please pick a different nickname',
        );
      }
      const token = randomToken();
      p = {
        id: crypto.randomUUID().slice(0, 8),
        tokenHash: await sha256Hex(token),
        nickname: uniqueNickname(
          check.nickname,
          Object.values(s.players).map((x) => x.nickname),
        ),
        avatar: isValidAvatar(msg.avatar) ? msg.avatar : DEFAULT_AVATAR,
        removed: false,
        awaySince: null,
        returnFlag: null,
        warnQueue: [],
        kickOverridden: false,
        pendingRemovalAt: null,
      };
      s.players[p.id] = p;
      log('player_joined', { pin: s.pin, players: Object.keys(s.players).length });
      this.send(ws, { t: 'joined', playerId: p.id, token, nickname: p.nickname, avatar: p.avatar } as ServerMsg);
    }

    if (!p) return;
    if (msg.playerId && msg.token && s.players[msg.playerId] === p && att.playerId === null) {
      // Rejoin: confirm identity back to the phone (token is unchanged and not re-sent).
      this.send(ws, {
        t: 'joined',
        playerId: p.id,
        token: msg.token,
        nickname: p.nickname,
        avatar: p.avatar,
      } as ServerMsg);
    }

    // Max 2 sockets per player: drop the oldest beyond that.
    const mine = this.sockets().filter(
      (w) => w !== ws && (w.deserializeAttachment() as Attachment | null)?.playerId === p.id,
    );
    while (mine.length >= 2) {
      const old = mine.shift();
      try {
        old?.close(1000, 'replaced');
      } catch {
        /* ignore */
      }
    }
    ws.serializeAttachment({ role: 'player', playerId: p.id } satisfies Attachment);

    p.dropAt = null;
    this.handleReturn(s, p, now, 'left');
    await this.save();
    this.send(ws, this.phaseMsg({ role: 'player', playerId: p.id }));
    this.flushWarnings(s, p);
    this.broadcastRoster();
    if (s.phase === 'question') this.broadcastProgress();
  }

  private async handleAnswer(
    s: GameState,
    p: PlayerRec,
    msg: Extract<ClientMsg, { t: 'answer' }>,
    now: number,
  ): Promise<void> {
    const q = this.questions[s.qIndex];
    const ack = (ok: boolean, reason?: string) =>
      this.sendToPlayer(p.id, { t: 'answerAck', q: msg.q, ok, reason } as ServerMsg);
    if (s.phase !== 'question' || !q || msg.q !== s.qIndex) return ack(false, 'closed');
    if (s.pausedAt !== null) return ack(false, 'paused');
    if (now > s.endsAt + ANSWER_GRACE_MS) return ack(false, 'late');

    const bucket = (s.answers[s.qIndex] ??= {});
    if (bucket[p.id] && !s.settings.allowAnswerChange) return ack(false, 'duplicate');

    const rec: AnswerRec = { tMs: now - s.openedAt };
    if (q.type === 'text') {
      const text = (msg.text ?? '').trim().slice(0, 40);
      if (!text) return ack(false, 'invalid');
      rec.text = text;
    } else {
      const max = q.type === 'tf' ? 2 : q.options.length;
      if (msg.option === undefined || msg.option >= max) return ack(false, 'invalid');
      rec.option = msg.option;
    }
    bucket[p.id] = rec;

    // Answered within quickAnswerMs of coming back from a flagged switch: upgrade to major.
    let stateChanged = false;
    if (p.returnFlag && now - p.returnFlag.at < s.settings.thresholds.quickAnswerMs) {
      const f = s.flags.find((x) => x.id === p.returnFlag!.flagId);
      if (f && !f.cleared && f.q === s.qIndex && f.severity !== 'major') {
        f.severity = 'major';
        f.strike = STRIKE_POINTS.major;
        f.quickAnswer = true;
        if (s.settings.funCallouts) f.quip = flagCallout('major', p.nickname, p.id, f.id);
        this.broadcastAll({ t: 'flag', flag: this.flagInfo(s, f) } as ServerMsg);
        this.checkKick(s, p, now);
        stateChanged = true;
      }
    }

    await this.saveAnswer(s.qIndex, p.id, rec, stateChanged);
    this.lastAnswerAt = now;
    ack(true);
    this.broadcastProgress();
    await this.maybeCloseEarly(s);
  }

  private handlePing(s: GameState, p: PlayerRec, ws: WebSocket, now: number, rtt?: number): void {
    this.send(ws, { t: 'pong' } as ServerMsg);
    if (rtt !== undefined) this.rtts.set(p.id, rtt);
    if (s.phase !== 'question' || s.pausedAt !== null) return;
    const last = this.pingAt.get(p.id);
    if (last !== undefined) {
      const gap = now - last;
      if (gap > (this.maxGap.get(p.id) ?? 0)) this.maxGap.set(p.id, gap);
    }
    this.pingAt.set(p.id, now);
  }

  private async handlePresence(
    s: GameState,
    p: PlayerRec,
    msg: Extract<ClientMsg, { t: 'presence' }>,
    now: number,
  ): Promise<void> {
    if (!s.settings.antiCheat) return;
    if (msg.state === 'hidden' || msg.state === 'blur' || msg.state === 'left') {
      const kind: FlagKind = msg.state === 'blur' ? 'blur' : msg.state === 'hidden' ? 'hidden' : 'left';
      if (!p.awaySince) p.awaySince = { kind, at: now };
      else if (kind === 'hidden' || (kind === 'left' && p.awaySince.kind === 'blur')) p.awaySince.kind = kind;
    } else {
      // visible / focus: a plain `focus` never ends a hidden spell.
      if (msg.state === 'focus' && p.awaySince && p.awaySince.kind !== 'blur') return;
      this.handleReturn(s, p, now, msg.state === 'focus' ? 'blur' : 'hidden', msg.awayMs);
      this.flushWarnings(s, p);
    }
    await this.save();
  }

  /** The player is back. Grade what happened while a question was open. */
  private handleReturn(s: GameState, p: PlayerRec, now: number, fallbackKind: FlagKind, reportedAwayMs?: number): void {
    const a = p.awaySince;
    p.awaySince = null;
    if (!s.settings.antiCheat || s.phase !== 'question' || s.pausedAt !== null) return;

    let kind: FlagKind;
    let awayMs: number;
    if (a) {
      kind = a.kind;
      awayMs = now - Math.max(a.at, s.openedAt);
    } else if (reportedAwayMs && reportedAwayMs > 0) {
      // We never saw them leave (dropped message): fall back to what the phone reports, clamped to this question.
      kind = fallbackKind;
      awayMs = Math.min(reportedAwayMs, now - s.openedAt);
    } else return;
    if (awayMs <= 0) return;

    const flag = this.raiseFlag(s, p, kind, awayMs, now);
    if (flag) p.returnFlag = { flagId: flag.id, at: now };
  }

  /** Grade and record a flag; returns it, or null if below the ignore thresholds. */
  private raiseFlag(s: GameState, p: PlayerRec, kind: FlagKind, awayMs: number, now: number): FlagRec | null {
    const prior = s.flags.filter((f) => f.playerId === p.id && f.q === s.qIndex && !f.cleared).length;
    const severity = gradeFlag({ kind, awayMs, priorInQuestion: prior }, s.settings.thresholds);
    if (!severity) return null;
    const flag: FlagRec = {
      id: `f${s.flagSeq++}`,
      playerId: p.id,
      q: s.qIndex,
      kind,
      severity,
      awayMs: Math.round(awayMs),
      strike: STRIKE_POINTS[severity],
      at: now,
      cleared: false,
    };
    if (s.settings.funCallouts) flag.quip = flagCallout(severity, p.nickname, p.id, flag.id);
    s.flags.push(flag);
    p.warnQueue.push(flag.id);
    log('flag_raised', { pin: s.pin, severity, kind, awayMs: flag.awayMs });
    this.broadcastAll({ t: 'flag', flag: this.flagInfo(s, flag) } as ServerMsg);
    this.checkKick(s, p, now);
    return flag;
  }

  private strikesOf(s: GameState, pid: string): number {
    return s.flags.reduce((n, f) => (f.playerId === pid && !f.cleared ? n + f.strike : n), 0);
  }

  private checkKick(s: GameState, p: PlayerRec, now: number): void {
    if (!s.settings.autoKick || p.kickOverridden || p.removed || p.pendingRemovalAt !== null) return;
    if (this.strikesOf(s, p.id) >= s.settings.kickStrikes) {
      p.pendingRemovalAt = now + KICK_OVERRIDE_MS;
      const msg = {
        t: 'pendingRemoval',
        playerId: p.id,
        nickname: p.nickname,
        endsAt: p.pendingRemovalAt,
      } as ServerMsg;
      this.broadcast((r) => (r === 'player' ? undefined : msg));
    }
  }

  private sendPendingRemovals(ws: WebSocket): void {
    const s = this.state;
    if (!s) return;
    for (const p of Object.values(s.players)) {
      if (p.pendingRemovalAt !== null && !p.removed) {
        this.send(ws, {
          t: 'pendingRemoval',
          playerId: p.id,
          nickname: p.nickname,
          endsAt: p.pendingRemovalAt,
        } as ServerMsg);
      }
    }
  }

  private flushWarnings(s: GameState, p: PlayerRec): void {
    if (p.awaySince || !p.warnQueue.length) return;
    const ids = p.warnQueue.splice(0);
    for (const id of ids) {
      const f = s.flags.find((x) => x.id === id);
      if (!f || f.cleared) continue;
      const strikesLeft = Math.max(0, s.settings.kickStrikes - this.strikesOf(s, p.id));
      this.sendToPlayer(p.id, { t: 'warned', flag: this.flagInfo(s, f), strikesLeft } as ServerMsg);
    }
  }

  /**
   * Right to erasure: a player removes themselves and everything stored about them in this game
   * (identity, answers, flags). Their nickname will not appear in the saved results.
   */
  private async eraseSelf(s: GameState, p: PlayerRec, ws: WebSocket): Promise<void> {
    delete s.players[p.id];
    const erased: string[] = [];
    for (const q of Object.keys(s.answers)) {
      if (s.answers[Number(q)]?.[p.id]) erased.push(answerKey(Number(q), p.id));
      delete s.answers[Number(q)]?.[p.id];
    }
    if (erased.length) await this.ctx.storage.delete(erased);
    const gone = new Set(s.flags.filter((f) => f.playerId === p.id).map((f) => f.id));
    s.flags = s.flags.filter((f) => f.playerId !== p.id);
    delete s.prevRanks[p.id];
    delete s.shownRanks[p.id];
    this.pingAt.delete(p.id);
    this.maxGap.delete(p.id);
    this.send(ws, { t: 'left' } as ServerMsg);
    for (const w of this.sockets()) {
      if ((w.deserializeAttachment() as Attachment | null)?.playerId === p.id) {
        try {
          w.close(1000, 'erased');
        } catch {
          /* ignore */
        }
      }
    }
    for (const id of gone) this.broadcastAll({ t: 'flagCleared', flagId: id, playerId: p.id } as ServerMsg);
    log('player_erased', { pin: s.pin });
    await this.save();
    this.broadcastRoster();
    if (s.phase === 'question') {
      this.broadcastProgress();
      await this.maybeCloseEarly(s);
    }
  }

  private async removePlayer(s: GameState, p: PlayerRec, reason: 'strikes' | 'host'): Promise<void> {
    p.removed = true;
    p.pendingRemovalAt = null;
    const msg = { t: 'removed', playerId: p.id, nickname: p.nickname, reason } as ServerMsg;
    this.broadcastAll(msg);
    for (const ws of this.sockets()) {
      if ((ws.deserializeAttachment() as Attachment | null)?.playerId === p.id) {
        try {
          ws.close(1000, 'removed');
        } catch {
          /* ignore */
        }
      }
    }
    log('player_removed', { pin: s.pin, reason });
    await this.save();
    this.broadcastRoster();
    if (s.phase === 'question') {
      this.broadcastProgress();
      await this.maybeCloseEarly(s);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Host commands                                                       */
  /* ------------------------------------------------------------------ */

  private async handleHost(s: GameState, msg: ClientMsg, now: number): Promise<void> {
    switch (msg.t) {
      case 'start': {
        if (s.phase !== 'lobby') return;
        if (!this.activePlayers(s).length) {
          this.broadcast((r) =>
            r === 'host'
              ? ({ t: 'error', code: 'bad_message', message: 'Wait for at least one player' } as ServerMsg)
              : undefined,
          );
          return;
        }
        s.startedAt = now;
        s.cleanupAt = now + IDLE_CLEANUP_MS;
        this.beginGetReady(s, now);
        break;
      }
      case 'next': {
        if (s.phase === 'reveal') this.enterLeaderboard(s);
        else if (s.phase === 'leaderboard') {
          if (s.qIndex + 1 >= s.questionCount) await this.enterPodium(s, now);
          else this.beginGetReady(s, now);
        } else return;
        break;
      }
      case 'skip': {
        if (s.phase === 'question') await this.closeQuestion(s, now);
        else if (s.phase === 'reveal') this.enterLeaderboard(s);
        else if (s.phase === 'leaderboard') {
          if (s.qIndex + 1 >= s.questionCount) await this.enterPodium(s, now);
          else this.beginGetReady(s, now);
        } else if (s.phase === 'getready') await this.openQuestion(s, now);
        else return;
        break;
      }
      case 'pause': {
        if (s.phase !== 'question' || s.pausedAt !== null) return;
        this.settleAway(s, now);
        s.pausedAt = now;
        s.pausedRemainingMs = Math.max(0, s.endsAt - now);
        this.broadcastPhase();
        break;
      }
      case 'resume': {
        if (s.phase !== 'question' || s.pausedAt === null) return;
        const pausedFor = now - s.pausedAt;
        s.openedAt += pausedFor;
        s.endsAt = now + (s.pausedRemainingMs ?? 0);
        s.pausedAt = null;
        s.pausedRemainingMs = null;
        for (const p of Object.values(s.players)) if (p.awaySince) p.awaySince.at = now;
        this.pingAt.clear();
        this.maxGap.clear();
        this.broadcastPhase();
        break;
      }
      case 'extend': {
        if (s.phase !== 'question') return;
        s.limitMs += EXTEND_MS;
        s.limits[s.qIndex] = s.limitMs;
        if (s.pausedAt !== null) s.pausedRemainingMs = (s.pausedRemainingMs ?? 0) + EXTEND_MS;
        else s.endsAt += EXTEND_MS;
        this.broadcastPhase();
        break;
      }
      case 'end': {
        if (s.phase === 'podium') {
          s.phase = 'ended';
          s.cleanupAt = now + CLEANUP_AFTER_END_MS;
          this.broadcastAll({ t: 'ended' } as ServerMsg);
          await this.releasePin(s);
        } else if (s.phase !== 'ended') {
          if (s.phase === 'question') await this.closeQuestion(s, now, /* silent */ true);
          await this.enterPodium(s, now);
        }
        break;
      }
      case 'kick': {
        const p = s.players[msg.playerId];
        if (p && !p.removed) await this.removePlayer(s, p, 'host');
        return;
      }
      case 'overrideKick': {
        const p = s.players[msg.playerId];
        if (!p || p.pendingRemovalAt === null) return;
        p.pendingRemovalAt = null;
        p.kickOverridden = true;
        this.broadcast((r) => (r === 'player' ? undefined : ({ t: 'removalCancelled', playerId: p.id } as ServerMsg)));
        break;
      }
      case 'rename': {
        const p = s.players[msg.playerId];
        const check = checkNickname(msg.nickname);
        if (!p || !check.ok) return;
        p.nickname = uniqueNickname(
          check.nickname,
          Object.values(s.players)
            .filter((x) => x.id !== p.id)
            .map((x) => x.nickname),
        );
        this.sendToPlayer(p.id, {
          t: 'joined',
          playerId: p.id,
          token: '',
          nickname: p.nickname,
          avatar: p.avatar,
        } as ServerMsg);
        this.broadcastRoster();
        break;
      }
      case 'clearFlag': {
        const f = s.flags.find((x) => x.id === msg.flagId);
        if (!f || f.cleared) return;
        f.cleared = true;
        const p = s.players[f.playerId];
        if (p) {
          if (p.pendingRemovalAt !== null && this.strikesOf(s, p.id) < s.settings.kickStrikes) {
            p.pendingRemovalAt = null;
            this.broadcast((r) =>
              r === 'player' ? undefined : ({ t: 'removalCancelled', playerId: p.id } as ServerMsg),
            );
          }
        }
        this.broadcastAll({ t: 'flagCleared', flagId: f.id, playerId: f.playerId } as ServerMsg);
        if (s.phase === 'reveal' || s.phase === 'leaderboard' || s.phase === 'podium') this.broadcastPhase();
        break;
      }
      case 'lockLobby': {
        s.locked = msg.locked;
        this.broadcastRoster();
        break;
      }
      case 'acceptAnswer': {
        const q = this.questions[s.qIndex];
        if (s.phase !== 'reveal' || !q || q.type !== 'text') return;
        const list = (s.extraAccepted[s.qIndex] ??= []);
        if (list.length < 20 && !list.includes(msg.text)) list.push(msg.text);
        this.broadcastPhase();
        break;
      }
      default:
        return;
    }
    await this.save();
    await this.scheduleAlarm();
  }

  /* ------------------------------------------------------------------ */
  /* State machine                                                       */
  /* ------------------------------------------------------------------ */

  private beginGetReady(s: GameState, now: number): void {
    s.qIndex += 1;
    s.phase = 'getready';
    s.getReadyEndsAt = now + GET_READY_MS;
    this.broadcastPhase();
  }

  private async openQuestion(s: GameState, now: number): Promise<void> {
    const q = this.questions[s.qIndex];
    if (!q) return;
    s.phase = 'question';
    s.openedAt = now;
    s.limitMs = q.timeLimitS * 1000;
    s.limits[s.qIndex] = s.limitMs;
    s.endsAt = now + s.limitMs;
    s.pausedAt = null;
    s.pausedRemainingMs = null;
    s.answers[s.qIndex] = {};
    this.pingAt.clear();
    this.maxGap.clear();
    const online = this.connectedIds();
    for (const p of this.activePlayers(s)) {
      if (online.has(p.id)) this.pingAt.set(p.id, now);
    }
    this.broadcastPhase();
    this.broadcastProgress();
  }

  /** Evaluate players who are still away so the time up to `now` is graded, then restart their clock. */
  private settleAway(s: GameState, now: number): void {
    if (!s.settings.antiCheat) return;
    for (const p of this.activePlayers(s)) {
      const a = p.awaySince;
      if (!a) continue;
      const awayMs = now - Math.max(a.at, s.openedAt);
      if (awayMs > 0) this.raiseFlag(s, p, a.kind, awayMs, now);
      a.at = now;
    }
  }

  private async closeQuestion(
    s: GameState,
    now: number,
    silent = false,
    by: 'all-answered' | 'timer' | 'host' = 'host',
  ): Promise<void> {
    if (s.phase !== 'question') return;
    if (s.pausedAt !== null) {
      s.pausedAt = null;
      s.pausedRemainingMs = null;
    }
    this.settleAway(s, now);

    // Heartbeat backup: a long gap in pings with no event at all looks like a tampered client.
    if (s.settings.antiCheat) {
      for (const p of this.activePlayers(s)) {
        const gap = this.maxGap.get(p.id) ?? 0;
        const flagged = s.flags.some((f) => f.playerId === p.id && f.q === s.qIndex && !f.cleared);
        if (gap > HEARTBEAT_GAP_FLAG_MS && !flagged && !p.awaySince) {
          this.raiseFlag(s, p, 'hidden', gap, now);
        }
      }
    }

    s.closed = s.qIndex + 1;
    s.phase = 'reveal';
    // Remember who was in the spotlight so the next questions pick someone else.
    // Standings and callouts are computed once and handed to the broadcast, which would otherwise redo both.
    const st = this.computeStandings(s);
    const spot = s.settings.funCallouts ? this.calloutsFor(s, s.qIndex, st.scores)?.spotlight : null;
    if (spot?.playerId) (s.spotlights ??= []).push({ q: s.qIndex, id: spot.playerId });
    s.endsAt = Math.min(s.endsAt, now);
    if (silent) this.calloutCache.clear();
    else {
      this.frame = st;
      this.broadcastPhase();
    }
    // Server-side share of "last answer → reveal": from the trigger to the reveal being handed to the sockets.
    this.lastClose = {
      index: s.qIndex,
      ms: Math.max(0, Date.now() - (by === 'all-answered' ? this.lastAnswerAt : now)),
      by,
    };
    for (const p of this.activePlayers(s)) this.flushWarnings(s, p);
  }

  private enterLeaderboard(s: GameState): void {
    s.phase = 'leaderboard';
    s.prevRanks = s.shownRanks;
    const { ranked } = this.standings(s);
    s.shownRanks = Object.fromEntries(ranked.map((r) => [r.id, r.rank]));
    this.broadcastPhase();
  }

  private async enterPodium(s: GameState, now: number): Promise<void> {
    if (s.phase === 'podium' || s.phase === 'ended') return;
    s.phase = 'podium';
    s.endedAt = now;
    s.cleanupAt = now + IDLE_CLEANUP_MS;
    this.broadcastPhase();
    await this.saveResults(s);
  }

  private async maybeCloseEarly(s: GameState): Promise<void> {
    if (s.phase !== 'question' || s.pausedAt !== null) return;
    const online = this.connectedIds();
    const now = Date.now();
    // Players whose phone dropped a moment ago still count: their answer may be waiting in the reconnect queue.
    const connected = this.activePlayers(s).filter(
      (p) => online.has(p.id) || (p.dropAt && now - p.dropAt < RECONNECT_GRACE_MS),
    );
    if (!online.size || !connected.length) return;
    const answers = s.answers[s.qIndex] ?? {};
    if (connected.every((p) => answers[p.id])) {
      await this.closeQuestion(s, Date.now(), false, 'all-answered');
      await this.save();
      await this.scheduleAlarm();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Scoring and views                                                   */
  /* ------------------------------------------------------------------ */

  private qMetas(s: GameState): QuestionMeta[] {
    return this.questions.map((q, i) => ({
      points: q.points,
      limitMs: s.limits[i] ?? q.timeLimitS * 1000,
      isCorrect: (a: AnswerRec) => this.isCorrect(s, q, i, a),
    }));
  }

  private isCorrect(s: GameState, q: Question, i: number, a: AnswerRec): boolean {
    if (q.type === 'text') {
      return matchesAnswer(
        a.text ?? '',
        [...q.acceptedAnswers, ...(s.extraAccepted[i] ?? [])],
        q.typoTolerance && s.settings.typoTolerance,
      );
    }
    return a.option !== undefined && a.option === q.correctIndex;
  }

  /** Set for the duration of one broadcast so 150 phones don't each trigger a full re-score. */
  private frame: ReturnType<GameRoom['computeStandings']> | null = null;

  private standings(s: GameState) {
    return this.frame ?? this.computeStandings(s);
  }

  private computeStandings(s: GameState) {
    const players = Object.values(s.players);
    const scores = scoreGame({
      questions: this.qMetas(s),
      closed: s.closed,
      answers: s.answers,
      flags: s.flags.map((f) => ({ id: f.id, playerId: f.playerId, q: f.q, severity: f.severity, cleared: f.cleared })),
      playerIds: players.map((p) => p.id),
      settings: s.settings,
    });
    // Removed players stay in the final table but never occupy a podium spot.
    const ranked = rankPlayers(
      players
        .filter((p) => !p.removed)
        .map((p) => ({
          id: p.id,
          nickname: p.nickname,
          score: scores[p.id]!.score,
          totalTimeMs: scores[p.id]!.totalTimeMs,
        })),
    );
    return { scores, ranked };
  }

  /** Callout cache for the duration of one broadcast (like `frame`). */
  private calloutCache = new Map<number, QuestionCallouts>();

  /**
   * Funny callouts for question `i`: seeded by game and question, so a reveal re-sent after a host action keeps
   * the same lines. `avoid` rotates the spotlight between players across the game.
   */
  private calloutsFor(
    s: GameState,
    i: number,
    scores: ReturnType<GameRoom['computeStandings']>['scores'],
  ): QuestionCallouts | null {
    if (!s.settings.funCallouts || i >= s.closed) return null;
    const cached = this.calloutCache.get(i);
    if (cached) return cached;
    const answers = s.answers[i] ?? {};
    const players: PlayerOutcome[] = this.activePlayers(s).map((p) => {
      const r = scores[p.id]?.perQuestion[i];
      const outcome = !r ? 'none' : r.voided ? 'voided' : !r.answered ? 'none' : r.correct ? 'right' : 'wrong';
      return { id: p.id, nickname: p.nickname, outcome, tMs: answers[p.id]?.tMs ?? null, streak: r?.streak ?? 0 };
    });
    const recent = (s.spotlights ?? [])
      .filter((h) => h.q < i)
      .slice(-3)
      .map((h) => h.id);
    const result = computeCallouts({
      seed: s.pin,
      index: i,
      players,
      limitMs: s.limits[i] ?? this.questions[i]!.timeLimitS * 1000,
      avoid: recent,
    });
    this.calloutCache.set(i, result);
    return result;
  }

  private flagInfo(s: GameState, f: FlagRec): FlagInfo {
    return {
      id: f.id,
      playerId: f.playerId,
      nickname: s.players[f.playerId]?.nickname ?? '?',
      q: f.q,
      kind: f.kind,
      severity: f.severity,
      awayMs: f.awayMs,
      strike: f.strike,
      cleared: f.cleared,
      at: f.at,
      quickAnswer: f.quickAnswer,
      quip: f.quip,
    };
  }

  private flagCount(s: GameState, pid: string): number {
    return s.flags.filter((f) => f.playerId === pid && !f.cleared).length;
  }

  private boardRows(s: GameState, ranked: ReturnType<GameRoom['standings']>['ranked'], limit: number): BoardRow[] {
    return ranked.slice(0, limit).map((r) => {
      const prev = s.prevRanks[r.id];
      return {
        id: r.id,
        nickname: r.nickname,
        avatar: s.players[r.id]!.avatar,
        score: r.score,
        rank: r.rank,
        delta: prev === undefined ? 0 : prev - r.rank,
        flags: this.flagCount(s, r.id),
      };
    });
  }

  private buildResults(s: GameState): ResultsPayload {
    const { scores, ranked } = this.standings(s);
    const rankOf = new Map(ranked.map((r) => [r.id, r.rank]));
    const players = Object.values(s.players)
      .map((p) => {
        const sc = scores[p.id]!;
        return {
          id: p.id,
          nickname: p.nickname,
          avatar: p.avatar,
          rank: rankOf.get(p.id) ?? 0,
          score: sc.score,
          correct: sc.correctCount,
          avgTimeMs: sc.answeredCount ? Math.round(sc.totalTimeMs / sc.answeredCount) : 0,
          flags: sc.flagCount,
          strikes: sc.strikes,
          removed: p.removed,
        };
      })
      .sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));
    return {
      pin: s.pin,
      title: s.title,
      startedAt: s.startedAt,
      endedAt: s.endedAt ?? Date.now(),
      questionCount: s.questionCount,
      players,
      flags: s.flags.map((f) => this.flagInfo(s, f)),
    };
  }

  private async saveResults(s: GameState): Promise<void> {
    if (s.resultsSaved) return;
    s.resultsSaved = true;
    try {
      await this.env.DB.prepare(
        'INSERT INTO game_results (id, quiz_id, host_id, pin, started_at, ended_at, results) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(
          crypto.randomUUID(),
          s.quizId,
          s.hostId,
          s.pin,
          s.startedAt,
          s.endedAt ?? Date.now(),
          JSON.stringify(this.buildResults(s)),
        )
        .run();
      log('results_saved', { pin: s.pin });
    } catch (e) {
      s.resultsSaved = false;
      log('results_save_failed', { pin: s.pin, error: String(e) });
    }
  }

  private async releasePin(s: GameState): Promise<void> {
    try {
      await this.env.DB.prepare('DELETE FROM live_games WHERE pin = ?').bind(s.pin).run();
    } catch (e) {
      log('release_pin_failed', { pin: s.pin, error: String(e) });
    }
  }

  /** Build the message that describes the current phase for one connection. */
  private phaseMsg(who: { role: Role; playerId: string | null }): ServerMsg {
    const s = this.state!;
    const t = Date.now();
    const base = { serverTime: t };
    const isPlayer = who.role === 'player';
    const pid = who.playerId;
    const q = this.questions[s.qIndex];

    switch (s.phase) {
      case 'lobby':
        return {
          ...base,
          t: 'lobby',
          pin: s.pin,
          players: isPlayer ? [] : this.lobbyPlayers(s),
          locked: s.locked,
          started: s.startedAt !== null,
        };
      case 'getready':
        return { ...base, t: 'getready', index: s.qIndex, total: s.questionCount, endsAt: s.getReadyEndsAt };
      case 'question': {
        const mine = pid ? s.answers[s.qIndex]?.[pid] : undefined;
        const common = {
          ...base,
          t: 'question' as const,
          index: s.qIndex,
          total: s.questionCount,
          qtype: q!.type,
          endsAt: s.pausedAt !== null ? t + (s.pausedRemainingMs ?? 0) : s.endsAt,
          openedAt: s.openedAt,
          limitMs: s.limitMs,
          paused: s.pausedAt !== null,
          pausedRemainingMs: s.pausedRemainingMs,
          points: q!.points,
        };
        if (isPlayer) {
          return {
            ...common,
            optionCount: q!.type === 'tf' ? 2 : q!.type === 'mcq' ? q!.options.length : 0,
            answered: !!mine,
            myOption: mine?.option,
            allowChange: s.settings.allowAnswerChange,
            funCallouts: s.settings.funCallouts,
          };
        }
        return {
          ...common,
          text: q!.text,
          image: q!.image,
          imageAlt: q!.imageAlt,
          options: q!.type === 'tf' ? ['True', 'False'] : q!.options,
        };
      }
      case 'reveal':
        return this.revealMsg(s, who);
      case 'leaderboard': {
        const { scores, ranked } = this.standings(s);
        const me = pid ? ranked.find((r) => r.id === pid) : undefined;
        return {
          ...base,
          t: 'leaderboard',
          index: s.qIndex,
          top: this.boardRows(s, ranked, 5),
          you:
            me && pid
              ? { rank: me.rank, score: me.score, total: ranked.length, streak: scores[pid]!.streak }
              : undefined,
          isLast: s.qIndex + 1 >= s.questionCount,
        };
      }
      case 'podium':
      case 'ended': {
        const { ranked } = this.standings(s);
        const me = pid ? ranked.find((r) => r.id === pid) : undefined;
        return {
          ...base,
          t: 'podium',
          top: this.boardRows(s, ranked, 3),
          you: me ? { rank: me.rank, score: me.score, total: ranked.length } : undefined,
          results: who.role === 'host' || who.role === 'screen' ? this.buildResults(s) : undefined,
        };
      }
    }
  }

  private revealMsg(s: GameState, who: { role: Role; playerId: string | null }): ServerMsg {
    const q = this.questions[s.qIndex]!;
    const i = s.qIndex;
    const answers = s.answers[i] ?? {};
    const { scores, ranked } = this.standings(s);
    const isPlayer = who.role === 'player';

    const optionCount = q.type === 'tf' ? 2 : q.options.length;
    const counts = new Array<number>(q.type === 'text' ? 0 : optionCount).fill(0);
    const groups = new Map<string, { text: string; count: number }>();
    for (const a of Object.values(answers)) {
      if (q.type === 'text') {
        const key = normalizeAnswer(a.text ?? '');
        if (!key || isProfane(a.text ?? '')) continue;
        const g = groups.get(key);
        if (g) g.count++;
        else groups.set(key, { text: a.text!, count: 1 });
      } else if (a.option !== undefined && a.option < counts.length) counts[a.option]!++;
    }
    const accepted = [...q.acceptedAnswers, ...(s.extraAccepted[i] ?? [])];
    const topAnswers = [...groups.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map((g) => ({ ...g, accepted: matchesAnswer(g.text, accepted, q.typoTolerance && s.settings.typoTolerance) }));

    const voided = Object.values(s.players)
      .filter((p) => scores[p.id]?.perQuestion[i]?.voided)
      .map((p) => {
        const sev = s.flags
          .filter((f) => f.playerId === p.id && f.q === i && !f.cleared)
          .reduce<Severity>((m, f) => (f.severity === 'major' || m === 'major' ? 'major' : 'moderate'), 'moderate');
        return { id: p.id, nickname: p.nickname, severity: sev };
      });

    const callouts = this.calloutsFor(s, i, scores);
    let you;
    if (isPlayer && who.playerId && scores[who.playerId]) {
      const sc = scores[who.playerId]!;
      const r = sc.perQuestion[i]!;
      you = {
        correct: r.correct && !r.voided,
        voided: r.voided,
        points: r.points + r.bonus,
        bonus: r.bonus,
        penalty: r.penalty,
        streak: r.streak,
        total: sc.score,
        rank: ranked.find((x) => x.id === who.playerId)?.rank ?? 0,
        answered: r.answered,
        callout: callouts?.personal.get(who.playerId),
      };
    }

    return {
      serverTime: Date.now(),
      t: 'reveal',
      index: i,
      total: s.questionCount,
      qtype: q.type,
      correctOption: q.type === 'text' ? null : q.correctIndex,
      accepted: q.type === 'text' ? accepted : [],
      counts,
      topAnswers: isPlayer ? [] : topAnswers,
      voided,
      text: isPlayer ? undefined : q.text,
      options: isPlayer ? undefined : q.type === 'tf' ? ['True', 'False'] : q.options,
      image: isPlayer ? undefined : q.image,
      imageAlt: isPlayer ? undefined : q.imageAlt,
      you,
      callout: callouts?.spotlight ?? null,
      isLast: i + 1 >= s.questionCount,
    };
  }

  private lobbyPlayers(s: GameState): LobbyPlayer[] {
    const online = this.connectedIds();
    return Object.values(s.players)
      .filter((p) => !p.removed)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        connected: online.has(p.id),
        flags: this.flagCount(s, p.id),
      }));
  }

  /* ------------------------------------------------------------------ */
  /* Sending                                                             */
  /* ------------------------------------------------------------------ */

  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets();
  }

  /** One pass over the sockets. Calling isConnected() per player is O(players²) and showed up under load. */
  private connectedIds(): Set<string> {
    const ids = new Set<string>();
    for (const w of this.sockets()) {
      const id = (w.deserializeAttachment() as Attachment | null)?.playerId;
      if (id) ids.add(id);
    }
    return ids;
  }

  private activePlayers(s: GameState): PlayerRec[] {
    return Object.values(s.players).filter((p) => !p.removed);
  }

  private send(ws: WebSocket, msg: ServerMsg | Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify({ serverTime: Date.now(), ...msg }));
    } catch {
      /* socket closing */
    }
  }

  private sendError(ws: WebSocket, code: ErrorCode, message: string): void {
    this.send(ws, { t: 'error', code, message });
  }

  private sendToPlayer(pid: string, msg: ServerMsg): void {
    for (const ws of this.sockets()) {
      if ((ws.deserializeAttachment() as Attachment | null)?.playerId === pid) this.send(ws, msg);
    }
  }

  /** `pick` returns the message for a role, or undefined to skip that role. */
  private broadcast(pick: (role: Role) => ServerMsg | undefined): void {
    for (const ws of this.sockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      const m = pick(att.role);
      if (m) this.send(ws, m);
    }
  }

  private broadcastAll(msg: ServerMsg): void {
    this.broadcast(() => msg);
  }

  private broadcastPhase(): void {
    const s = this.state;
    if (!s) return;
    this.frame ??= this.computeStandings(s);
    try {
      for (const ws of this.sockets()) {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (!att) continue;
        if (att.role === 'player' && !att.playerId) continue; // not joined yet
        this.send(ws, this.phaseMsg(att));
      }
    } finally {
      this.frame = null;
      this.calloutCache.clear();
    }
  }

  /** Lobby: the full lobby message. Later phases: a lightweight `roster` for the host's moderation panel. */
  private broadcastRoster(): void {
    const s = this.state;
    if (!s) return;
    const msg = (
      s.phase === 'lobby'
        ? { t: 'lobby', pin: s.pin, players: this.lobbyPlayers(s), locked: s.locked, started: s.startedAt !== null }
        : { t: 'roster', players: this.lobbyPlayers(s), locked: s.locked }
    ) as ServerMsg;
    this.broadcast((r) => (r === 'player' ? undefined : msg));
  }

  private broadcastProgress(): void {
    const s = this.state;
    if (!s || s.phase !== 'question') return;
    const online = this.connectedIds();
    const active = this.activePlayers(s).filter((p) => online.has(p.id));
    const answers = s.answers[s.qIndex] ?? {};
    const msg = {
      t: 'progress',
      index: s.qIndex,
      answered: active.filter((p) => answers[p.id]).length,
      total: active.length,
    } as ServerMsg;
    this.broadcast((r) => (r === 'player' ? undefined : msg));
  }

  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    const b = this.buckets.get(ws) ?? [20, now];
    const refill = ((now - b[1]) / 1000) * 10; // 10 msgs/s sustained, burst of 20
    b[0] = Math.min(20, b[0] + refill);
    b[1] = now;
    this.buckets.set(ws, b);
    if (b[0] < 1) return false;
    b[0] -= 1;
    return true;
  }

  private countMessage(now: number): void {
    const sec = Math.floor(now / 1000);
    this.msgSeconds.set(sec, (this.msgSeconds.get(sec) ?? 0) + 1);
    if (this.msgSeconds.size > 20) for (const k of this.msgSeconds.keys()) if (k < sec - 10) this.msgSeconds.delete(k);
  }

  private debugSnapshot(s: GameState, now: number): ServerMsg {
    const sec = Math.floor(now / 1000);
    let recent = 0;
    for (let k = sec - 5; k < sec; k++) recent += this.msgSeconds.get(k) ?? 0; // last 5 whole seconds
    const online = this.connectedIds();
    return {
      serverTime: now,
      t: 'debug',
      connected: online.size,
      players: this.activePlayers(s).length,
      messagesPerSec: Math.round((recent / 5) * 10) / 10,
      malformed: this.dropped,
      lastClose: this.lastClose,
      clients: this.activePlayers(s).map((p) => {
        const ping = this.pingAt.get(p.id);
        return {
          id: p.id,
          nickname: p.nickname,
          connected: online.has(p.id),
          rttMs: this.rtts.get(p.id) ?? null,
          lastPingAgoMs: ping === undefined ? null : now - ping,
        };
      }),
    } as ServerMsg;
  }

  private drop(): void {
    this.dropped++;
    if (this.dropped % 50 === 1) log('malformed_messages', { count: this.dropped });
  }

  /** Everything except answers, which live in their own keys (see saveAnswer). */
  private snapshot(): Omit<GameState, 'answers'> {
    const { answers: _answers, ...rest } = this.state!;
    return rest;
  }

  private async save(): Promise<void> {
    if (this.state) await this.ctx.storage.put('game', this.snapshot());
  }

  private async saveAnswer(q: number, pid: string, rec: AnswerRec, alsoState = false): Promise<void> {
    if (alsoState) await this.ctx.storage.put({ game: this.snapshot(), [answerKey(q, pid)]: rec });
    else await this.ctx.storage.put(answerKey(q, pid), rec);
  }
}

export type { PlayerScore };
