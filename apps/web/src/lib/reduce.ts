import type { FlagInfo, LobbyPlayer, ServerMsg } from '@quiz/shared/protocol';

export type PhaseMsg = Extract<
  ServerMsg,
  { t: 'lobby' | 'getready' | 'question' | 'reveal' | 'leaderboard' | 'podium' }
>;

export interface Suspect {
  key: string;
  flag: FlagInfo | (Omit<FlagInfo, 'severity'> & { severity: 'removed' });
  at: number;
}
export interface Notice {
  id: string;
  text: string;
  severity: FlagInfo['severity'];
}

export interface GameView {
  status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
  role: 'host' | 'screen' | 'player' | null;
  pin: string;
  title: string;
  phase: PhaseMsg | null;
  progress: { index: number; answered: number; total: number } | null;
  flags: FlagInfo[];
  roster: LobbyPlayer[];
  locked: boolean;
  me: { playerId: string; nickname: string; avatar: string } | null;
  warned: { flag: FlagInfo; strikesLeft: number } | null;
  pending: Record<string, { nickname: string; endsAt: number }>;
  notices: Notice[];
  suspects: Suspect[];
  error: { code: string; message: string } | null;
  ended: boolean;
  removed: boolean;
  /** the player erased themselves from the game */
  erased: boolean;
  ack: { q: number; ok: boolean; reason?: string } | null;
  /** latest host-only debug snapshot */
  debug: Extract<ServerMsg, { t: 'debug' }> | null;
  /** nicknames of removed players by id (for the big screen escort). */
  removedIds: Record<string, string>;
}

export const initialView = (): GameView => ({
  status: 'idle',
  role: null,
  pin: '',
  title: '',
  phase: null,
  progress: null,
  flags: [],
  roster: [],
  locked: false,
  me: null,
  warned: null,
  pending: {},
  notices: [],
  suspects: [],
  error: null,
  ended: false,
  removed: false,
  erased: false,
  ack: null,
  removedIds: {},
  debug: null,
});

const upsertFlag = (flags: FlagInfo[], f: FlagInfo): FlagInfo[] => {
  const i = flags.findIndex((x) => x.id === f.id);
  if (i < 0) return [...flags, f];
  const next = flags.slice();
  next[i] = f;
  return next;
};

/** Pure transition: how one server message changes what the UI knows. */
export function reduce(v: GameView, msg: ServerMsg, now = Date.now()): GameView {
  switch (msg.t) {
    case 'hello':
      return { ...v, role: msg.role, pin: msg.pin, title: msg.title, error: null };
    case 'joined':
      return { ...v, me: { playerId: msg.playerId, nickname: msg.nickname, avatar: msg.avatar }, error: null };
    case 'lobby':
      return { ...v, phase: msg, progress: null, roster: msg.players, locked: msg.locked };
    case 'roster':
      return { ...v, roster: msg.players, locked: msg.locked };
    case 'getready':
    case 'leaderboard':
      return { ...v, phase: msg, progress: null };
    case 'question': {
      // A re-sent question (pause/resume/extend) must not reset the answered-count.
      const same = v.phase?.t === 'question' && v.phase.index === msg.index;
      return { ...v, phase: msg, progress: same ? v.progress : null, ack: same ? v.ack : null };
    }
    case 'reveal':
      return { ...v, phase: msg };
    case 'podium':
      return { ...v, phase: msg };
    case 'progress':
      return { ...v, progress: { index: msg.index, answered: msg.answered, total: msg.total } };
    case 'answerAck':
      return { ...v, ack: { q: msg.q, ok: msg.ok, reason: msg.reason } };
    case 'flag': {
      const existing = v.flags.find((f) => f.id === msg.flag.id);
      const upgraded = !!existing && existing.severity !== msg.flag.severity;
      const isNew = !existing;
      const out: GameView = { ...v, flags: upsertFlag(v.flags, msg.flag) };
      if (isNew || upgraded) {
        out.suspects = [...v.suspects, { key: `${msg.flag.id}:${msg.flag.severity}`, flag: msg.flag, at: now }];
      }
      if (isNew) {
        out.notices = [
          ...v.notices,
          { id: msg.flag.id, text: `👀 ${msg.flag.nickname} was flagged`, severity: msg.flag.severity },
        ].slice(-3);
      }
      return out;
    }
    case 'flagCleared':
      return {
        ...v,
        flags: v.flags.map((f) => (f.id === msg.flagId ? { ...f, cleared: true } : f)),
        suspects: v.suspects.filter((s) => !s.key.startsWith(`${msg.flagId}:`)),
        notices: v.notices.filter((n) => n.id !== msg.flagId),
        warned: v.warned?.flag.id === msg.flagId ? null : v.warned,
      };
    case 'warned':
      return { ...v, warned: { flag: msg.flag, strikesLeft: msg.strikesLeft } };
    case 'pendingRemoval':
      return { ...v, pending: { ...v.pending, [msg.playerId]: { nickname: msg.nickname, endsAt: msg.endsAt } } };
    case 'removalCancelled': {
      const { [msg.playerId]: _gone, ...rest } = v.pending;
      return { ...v, pending: rest };
    }
    case 'removed': {
      const { [msg.playerId]: _gone, ...rest } = v.pending;
      const out: GameView = { ...v, pending: rest, removedIds: { ...v.removedIds, [msg.playerId]: msg.nickname } };
      if (v.me?.playerId === msg.playerId) out.removed = true;
      else {
        out.suspects = [
          ...v.suspects,
          {
            key: `removed:${msg.playerId}`,
            at: now,
            flag: {
              id: `r-${msg.playerId}`,
              playerId: msg.playerId,
              nickname: msg.nickname,
              q: 0,
              kind: 'hidden',
              severity: 'removed',
              awayMs: 0,
              strike: 0,
              cleared: false,
              at: now,
            },
          },
        ];
      }
      return out;
    }
    case 'ended':
      return { ...v, ended: true };
    case 'left':
      return { ...v, erased: true, me: null };
    case 'error':
      return { ...v, error: { code: msg.code, message: msg.message } };
    case 'debug':
      return { ...v, debug: msg };
    case 'pong':
      return v;
  }
}

/** Per-player live flag counts (cleared ones don't count). */
export function flagCounts(flags: FlagInfo[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of flags) if (!f.cleared) out[f.playerId] = (out[f.playerId] ?? 0) + 1;
  return out;
}
