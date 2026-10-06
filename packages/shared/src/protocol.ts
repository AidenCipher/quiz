import { z } from 'zod';
import { MAX_ANSWER_TEXT, NICKNAME_MAX } from './constants';
import { FlagKindSchema, QuestionTypeSchema, SeveritySchema } from './quiz';

/* ---------- client → server ---------- */

const join = z.object({
  t: z.literal('join'),
  nickname: z.string().max(NICKNAME_MAX * 4),
  avatar: z.string().max(32),
  playerId: z.string().max(64).optional(),
  token: z.string().max(128).optional(),
});
const answer = z.object({
  t: z.literal('answer'),
  q: z.number().int().min(0),
  option: z.number().int().min(0).max(3).optional(),
  text: z.string().max(MAX_ANSWER_TEXT * 2).optional(),
});
const presence = z.object({
  t: z.literal('presence'),
  state: z.enum(['hidden', 'visible', 'blur', 'focus', 'left']),
  awayMs: z.number().min(0).max(3_600_000).optional(),
});
const ping = z.object({ t: z.literal('ping') });
const cmd = <T extends string>(t: T) => z.object({ t: z.literal(t) });

export const ClientMsgSchema = z.discriminatedUnion('t', [
  join,
  answer,
  presence,
  ping,
  cmd('start'),
  cmd('next'),
  cmd('pause'),
  cmd('resume'),
  cmd('skip'),
  cmd('extend'),
  cmd('end'),
  z.object({ t: z.literal('kick'), playerId: z.string() }),
  z.object({ t: z.literal('overrideKick'), playerId: z.string() }),
  z.object({ t: z.literal('rename'), playerId: z.string(), nickname: z.string().max(NICKNAME_MAX * 4) }),
  z.object({ t: z.literal('clearFlag'), flagId: z.string() }),
  z.object({ t: z.literal('lockLobby'), locked: z.boolean() }),
  z.object({ t: z.literal('acceptAnswer'), text: z.string().max(MAX_ANSWER_TEXT * 2) }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;
export const HOST_ONLY = new Set([
  'start', 'next', 'pause', 'resume', 'skip', 'extend', 'end',
  'kick', 'overrideKick', 'rename', 'clearFlag', 'lockLobby', 'acceptAnswer',
]);

/* ---------- server → client ---------- */

export interface LobbyPlayer {
  id: string;
  nickname: string;
  avatar: string;
  connected: boolean;
  flags: number;
}
export interface FlagInfo {
  id: string;
  playerId: string;
  nickname: string;
  q: number;
  kind: z.infer<typeof FlagKindSchema>;
  severity: z.infer<typeof SeveritySchema>;
  awayMs: number;
  strike: number;
  cleared: boolean;
  at: number;
  quickAnswer?: boolean;
}
export interface BoardRow {
  id: string;
  nickname: string;
  avatar: string;
  score: number;
  rank: number;
  /** positive = moved up since the previous leaderboard */
  delta: number;
  flags: number;
}
export interface YouReveal {
  correct: boolean;
  voided: boolean;
  points: number;
  bonus: number;
  penalty: number;
  streak: number;
  total: number;
  rank: number;
  answered: boolean;
}
export interface ResultRow {
  id: string;
  nickname: string;
  avatar: string;
  rank: number;
  score: number;
  correct: number;
  avgTimeMs: number;
  flags: number;
  strikes: number;
  removed: boolean;
}
export interface ResultsPayload {
  pin: string;
  title: string;
  startedAt: number | null;
  endedAt: number;
  questionCount: number;
  players: ResultRow[];
  flags: FlagInfo[];
}

type Base = { serverTime: number };
export type ServerMsg =
  | (Base & { t: 'joined'; playerId: string; token: string; nickname: string; avatar: string })
  | (Base & { t: 'hello'; role: 'host' | 'screen' | 'player'; pin: string; title: string })
  | (Base & { t: 'lobby'; pin: string; players: LobbyPlayer[]; locked: boolean; started: boolean })
  | (Base & { t: 'getready'; index: number; total: number; endsAt: number })
  | (Base & {
      t: 'question';
      index: number;
      total: number;
      qtype: z.infer<typeof QuestionTypeSchema>;
      endsAt: number;
      openedAt: number;
      limitMs: number;
      paused: boolean;
      pausedRemainingMs: number | null;
      points: number;
      // big screen / host only:
      text?: string;
      image?: string | null;
      options?: string[];
      // players only:
      optionCount?: number;
      answered?: boolean;
      myOption?: number;
      allowChange?: boolean;
    })
  | (Base & { t: 'progress'; index: number; answered: number; total: number })
  | (Base & { t: 'answerAck'; q: number; ok: boolean; reason?: string })
  | (Base & {
      t: 'reveal';
      index: number;
      qtype: z.infer<typeof QuestionTypeSchema>;
      correctOption: number | null;
      accepted: string[];
      counts: number[];
      topAnswers: { text: string; count: number; accepted: boolean }[];
      voided: { id: string; nickname: string; severity: z.infer<typeof SeveritySchema> }[];
      text?: string;
      options?: string[];
      image?: string | null;
      you?: YouReveal;
      isLast: boolean;
    })
  | (Base & { t: 'leaderboard'; index: number; top: BoardRow[]; you?: { rank: number; score: number; total: number; streak: number }; isLast: boolean })
  | (Base & { t: 'podium'; top: BoardRow[]; you?: { rank: number; score: number; total: number }; results?: ResultsPayload })
  | (Base & { t: 'flag'; flag: FlagInfo })
  | (Base & { t: 'flagCleared'; flagId: string; playerId: string })
  | (Base & { t: 'warned'; flag: FlagInfo; strikesLeft: number })
  | (Base & { t: 'pendingRemoval'; playerId: string; nickname: string; endsAt: number })
  | (Base & { t: 'removalCancelled'; playerId: string })
  | (Base & { t: 'removed'; playerId: string; nickname: string; reason: 'strikes' | 'host' })
  | (Base & { t: 'ended' })
  | (Base & { t: 'pong' })
  | (Base & { t: 'error'; code: ErrorCode; message: string });

export type ErrorCode =
  | 'not_found'
  | 'locked'
  | 'removed'
  | 'bad_nickname'
  | 'bad_message'
  | 'forbidden'
  | 'rate_limited'
  | 'full'
  | 'ended';
