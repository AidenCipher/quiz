import { HEARTBEAT_MS, SHAPES, SHAPE_LETTERS } from '@quiz/shared/constants';
import { encodeAvatar, parseAvatar, randomAvatar, type AvatarParts, DEFAULT_AVATAR } from '@quiz/shared/avatar';
import type { FlagInfo } from '@quiz/shared/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Avatar, AvatarBuilder } from '../components/Avatar';
import { api } from '../lib/api';
import { useCountdown } from '../lib/hooks';
import {
  GameSocket,
  loadIdentity,
  loadProfile,
  resetClock,
  saveIdentity,
  saveProfile,
  type PlayerIdentity,
} from '../lib/socket';
import { useGame } from '../lib/store';
import { acquireWakeLock, releaseWakeLock } from '../lib/wakelock';

type Gate = 'checking' | 'form' | 'playing' | 'missing' | 'locked';

export default function Play() {
  const { pin = '' } = useParams();
  const [gate, setGate] = useState<Gate>('checking');
  const sock = useRef<GameSocket | null>(null);
  const identity = useRef<PlayerIdentity | null>(null);
  const me = useGame((s) => s.me);
  const error = useGame((s) => s.error);
  const removed = useGame((s) => s.removed);
  const ended = useGame((s) => s.ended);

  const start = useCallback(
    (id: PlayerIdentity) => {
      identity.current = id;
      useGame.getState().reset();
      resetClock();
      sock.current?.close();
      const s = new GameSocket(pin, 'player', {
        identity: () => identity.current,
        onIdentity: (next) => {
          identity.current = { ...identity.current, ...next };
          saveIdentity(pin, identity.current);
          saveProfile({ nickname: next.nickname, avatar: next.avatar });
        },
      });
      sock.current = s;
      s.connect();
      setGate('playing');
    },
    [pin],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let info;
      try {
        info = await api.gameInfo(pin);
      } catch {
        if (!cancelled) setGate('missing');
        return;
      }
      if (cancelled) return;
      if (!info.exists) return setGate('missing');
      const saved = loadIdentity(pin);
      if (saved?.token) return start(saved);
      if (info.locked) return setGate('locked');
      setGate('form');
    })();
    return () => {
      cancelled = true;
    };
  }, [pin, start]);

  useEffect(() => () => sock.current?.close(), []);

  // A rejected join (bad nickname) returns to the form; anything terminal stays.
  useEffect(() => {
    if (error?.code === 'bad_nickname' || (error?.code === 'locked' && !me))
      setGate(error.code === 'locked' ? 'locked' : 'form');
  }, [error, me]);

  if (gate === 'checking') return <Shell>Joining…</Shell>;
  if (gate === 'missing')
    return (
      <Terminal emoji="🔍" title="Game not found" body="Check the PIN on the big screen, or the game may have ended." />
    );
  if (gate === 'locked')
    return <Terminal emoji="🔒" title="Lobby is locked" body="The host isn't accepting new players for this game." />;
  if (removed) return <Terminal emoji="🚪" title="You were removed" body="The host removed you from this game." />;
  if (error?.code === 'removed')
    return <Terminal emoji="🚪" title="You were removed" body="The host removed you from this game." />;
  if (error?.code === 'full')
    return <Terminal emoji="🪑" title="Game is full" body="Ask the host to start a new game." />;
  if (error?.code === 'ended' || ended) return <Terminal emoji="🏁" title="Game over" body="Thanks for playing!" />;
  if (error?.code === 'not_found')
    return <Terminal emoji="🔍" title="Game not found" body="Check the PIN on the big screen." />;
  if (gate === 'form' || !me) {
    return gate === 'form' ? (
      <JoinForm pin={pin} error={error?.code === 'bad_nickname' ? error.message : null} onJoin={start} />
    ) : (
      <Shell>Joining…</Shell>
    );
  }
  return <Game pin={pin} socket={sock} />;
}

/* ------------------------------------------------------------------ */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="dark-surface"
      style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 16, textAlign: 'center' }}
    >
      <div style={{ fontSize: 22, fontWeight: 700 }}>{children}</div>
    </div>
  );
}

function Terminal({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div
      className="dark-surface"
      style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24, textAlign: 'center' }}
    >
      <div>
        <div style={{ fontSize: 64 }}>{emoji}</div>
        <h1 style={{ fontSize: 28, margin: '8px 0' }}>{title}</h1>
        <p className="muted-on-dark">{body}</p>
        <Link to="/" className="btn btn-dark" style={{ marginTop: 16 }}>
          Back to home
        </Link>
      </div>
    </div>
  );
}

function JoinForm({ pin, onJoin, error }: { pin: string; onJoin: (id: PlayerIdentity) => void; error: string | null }) {
  const profile = loadProfile();
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [parts, setParts] = useState<AvatarParts>(() => parseAvatar(profile?.avatar ?? '') ?? randomAvatar());
  return (
    <div className="dark-surface" style={{ minHeight: '100dvh', padding: '20px 16px 32px' }}>
      <form
        style={{ maxWidth: 440, margin: '0 auto' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (nickname.trim().length >= 2) onJoin({ nickname: nickname.trim(), avatar: encodeAvatar(parts) });
        }}
      >
        <div className="muted-on-dark" style={{ fontWeight: 700 }}>
          Game {pin}
        </div>
        <h1 style={{ fontSize: 30, margin: '4px 0 16px' }}>Pick a name and face</h1>
        <label className="label muted-on-dark" htmlFor="nick">
          Nickname
        </label>
        <input
          id="nick"
          className="input input-dark"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={16}
          minLength={2}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="go"
          required
          aria-invalid={!!error}
          style={{ fontSize: 20, minHeight: 52 }}
        />
        {error && (
          <div role="alert" style={{ color: '#fca5a5', marginTop: 6 }}>
            {error}
          </div>
        )}
        <div style={{ margin: '20px 0' }}>
          <AvatarBuilder value={parts} onChange={setParts} onRandomize={() => setParts(randomAvatar())} />
        </div>
        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%' }}
          type="submit"
          disabled={nickname.trim().length < 2}
        >
          Join game
        </button>
        <p className="muted-on-dark" style={{ fontSize: 14, marginTop: 14 }}>
          👀 Switching tabs or apps during a question is recorded, shown to the whole room, and may cost points.
        </p>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Game({ pin, socket }: { pin: string; socket: React.RefObject<GameSocket | null> }) {
  const phase = useGame((s) => s.phase);
  const me = useGame((s) => s.me)!;
  const status = useGame((s) => s.status);
  const notices = useGame((s) => s.notices);
  const warned = useGame((s) => s.warned);
  const dismissWarned = useGame((s) => s.dismissWarned);
  const dropNotice = useGame((s) => s.dropNotice);
  usePresence(socket, phase?.t === 'question' && !phase.paused);

  useEffect(() => {
    void acquireWakeLock();
    return releaseWakeLock;
  }, []);

  useEffect(() => {
    const timers = notices.map((n) => setTimeout(() => dropNotice(n.id), 4000));
    return () => timers.forEach(clearTimeout);
  }, [notices, dropNotice]);

  return (
    <div className="dark-surface" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {status === 'reconnecting' && (
        <div
          role="status"
          style={{ background: 'var(--warn)', color: '#1a1300', textAlign: 'center', padding: 6, fontWeight: 700 }}
        >
          Reconnecting… your score is safe
        </div>
      )}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 8,
          left: 8,
          right: 8,
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        {notices.map((n) => (
          <div
            key={n.id}
            className="slide-up"
            style={{
              background: '#3b2a05',
              border: '1px solid var(--warn)',
              borderRadius: 12,
              padding: '8px 14px',
              fontWeight: 700,
            }}
          >
            {n.text}
          </div>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 'max(12px, env(safe-area-inset-top)) 16px max(12px, env(safe-area-inset-bottom))',
        }}
      >
        {!phase || phase.t === 'lobby' ? <Waiting nick={me.nickname} avatar={me.avatar} pin={pin} /> : null}
        {phase?.t === 'getready' && <GetReady index={phase.index} total={phase.total} endsAt={phase.endsAt} />}
        {phase?.t === 'question' && <Answer phase={phase} socket={socket} />}
        {phase?.t === 'reveal' && <RevealView phase={phase} />}
        {phase?.t === 'leaderboard' && (
          <Centered>
            <div style={{ fontSize: 24 }} className="muted-on-dark">
              {phase.isLast ? 'Final standing' : 'Your rank'}
            </div>
            <div className="pop-in" style={{ fontSize: 96, fontWeight: 800, lineHeight: 1 }}>
              #{phase.you?.rank ?? '–'}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{(phase.you?.score ?? 0).toLocaleString()} pts</div>
            {phase.you && phase.you.streak >= 2 && <div style={{ fontSize: 22 }}>🔥 {phase.you.streak} in a row</div>}
            <div className="muted-on-dark">Look at the big screen</div>
          </Centered>
        )}
        {phase?.t === 'podium' && (
          <Centered>
            <div style={{ fontSize: 56 }}>
              {phase.you && phase.you.rank <= 3 ? ['🥇', '🥈', '🥉'][phase.you.rank - 1] : '🎉'}
            </div>
            <div style={{ fontSize: 24 }} className="muted-on-dark">
              Final rank
            </div>
            <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1 }}>#{phase.you?.rank ?? '–'}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {(phase.you?.score ?? 0).toLocaleString()} pts of {phase.you?.total ?? 0} players
            </div>
          </Centered>
        )}
      </div>
      {warned && <WarnedModal flag={warned.flag} strikesLeft={warned.strikesLeft} onClose={dismissWarned} />}
    </div>
  );
}

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      textAlign: 'center',
    }}
  >
    {children}
  </div>
);

function Waiting({ nick, avatar, pin }: { nick: string; avatar: string; pin: string }) {
  return (
    <Centered>
      <div className="pop-in">
        <Avatar code={avatar || DEFAULT_AVATAR} size={140} rounded={36} label={`${nick}'s avatar`} />
      </div>
      <div style={{ fontSize: 32, fontWeight: 800 }}>{nick}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>You're in! 🎉</div>
      <div className="muted-on-dark">Look at the big screen · game {pin}</div>
    </Centered>
  );
}

function GetReady({ index, total, endsAt }: { index: number; total: number; endsAt: number }) {
  const left = useCountdown(endsAt);
  return (
    <Centered>
      <div className="muted-on-dark" style={{ fontSize: 22 }}>
        Question {index + 1} of {total}
      </div>
      <div key={Math.ceil(left / 1000)} className="pop-in" style={{ fontSize: 140, fontWeight: 800, lineHeight: 1 }}>
        {Math.max(1, Math.ceil(left / 1000))}
      </div>
      <div style={{ fontSize: 22 }}>Get ready…</div>
    </Centered>
  );
}

function Answer({
  phase,
  socket,
}: {
  phase: Extract<NonNullable<ReturnType<typeof useGame.getState>['phase']>, { t: 'question' }>;
  socket: React.RefObject<GameSocket | null>;
}) {
  const remaining = useCountdown(phase.endsAt, phase.paused, phase.pausedRemainingMs);
  const ack = useGame((s) => s.ack);
  const [picked, setPicked] = useState<number | undefined>(phase.myOption);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(phase.answered ?? false);
  const [sentText, setSentText] = useState('');
  const idx = phase.index;

  // New question → reset local state
  useEffect(() => {
    setPicked(phase.myOption);
    setSent(phase.answered ?? false);
    setText('');
    setSentText('');
  }, [idx]);

  const rejected = ack && ack.q === idx && !ack.ok && ack.reason !== 'duplicate' ? ack.reason : null;
  const closed = rejected === 'late' || rejected === 'closed' || remaining <= 0;
  const locked = (sent && !phase.allowChange) || closed || phase.paused;
  const secs = Math.ceil(remaining / 1000);

  const submit = (opt?: number, t?: string) => {
    if (locked) return;
    if (opt !== undefined) setPicked(opt);
    if (t !== undefined) setSentText(t);
    setSent(true);
    socket.current?.send({ t: 'answer', q: idx, option: opt, text: t });
    navigator.vibrate?.(30);
  };

  const count = phase.qtype === 'tf' ? 2 : (phase.optionCount ?? 0);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="muted-on-dark" style={{ fontWeight: 700 }}>
          {idx + 1}/{phase.total}
        </span>
        <div
          style={{ flex: 1, height: 12, borderRadius: 6, background: '#2b3555', overflow: 'hidden' }}
          aria-hidden="true"
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, (remaining / phase.limitMs) * 100)}%`,
              background: secs <= 5 ? 'var(--bad)' : 'var(--accent)',
              transition: 'width 100ms linear',
            }}
          />
        </div>
        <span
          style={{ fontWeight: 800, minWidth: 28, textAlign: 'right' }}
          role="timer"
          aria-label={`${secs} seconds left`}
        >
          {secs}
        </span>
      </div>

      {phase.paused && (
        <div
          role="status"
          style={{
            background: 'var(--warn)',
            color: '#1a1300',
            textAlign: 'center',
            borderRadius: 12,
            padding: 8,
            fontWeight: 800,
          }}
        >
          ⏸ Paused by the host
        </div>
      )}

      {phase.qtype === 'text' ? (
        <form
          style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) submit(undefined, text.trim());
          }}
        >
          <label htmlFor="ans" className="muted-on-dark" style={{ textAlign: 'center', fontWeight: 600 }}>
            Type your answer
          </label>
          <input
            id="ans"
            className="input input-dark"
            style={{ minHeight: 64, fontSize: 24, textAlign: 'center' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={40}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={locked}
            enterKeyHint="send"
          />
          <button className="btn btn-primary btn-lg" disabled={locked || !text.trim()} type="submit">
            Submit
          </button>
          {sent && <LockedIn detail={sentText ? `“${sentText}”` : undefined} />}
        </form>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'grid',
            gap: 12,
            gridTemplateColumns: count <= 2 ? '1fr' : '1fr 1fr',
            gridAutoRows: '1fr',
            minHeight: 0,
          }}
        >
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              className={`tile ${phase.qtype === 'tf' ? `tile-tf-${i}` : `tile-${i}`} ${picked !== undefined && picked !== i ? 'dim' : ''}`}
              style={{
                minHeight: 64,
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 4,
                fontSize: phase.qtype === 'tf' ? 32 : 56,
              }}
              disabled={locked}
              aria-label={phase.qtype === 'tf' ? (i === 0 ? 'True' : 'False') : `Option ${SHAPE_LETTERS[i]}`}
              aria-pressed={picked === i}
              onClick={() => submit(i)}
            >
              <span aria-hidden="true" style={{ lineHeight: 1 }}>
                {phase.qtype === 'tf' ? (i === 0 ? '✔' : '✖') : SHAPES[i]}
              </span>
              <span style={{ fontSize: 22 }}>
                {phase.qtype === 'tf' ? (i === 0 ? 'True' : 'False') : SHAPE_LETTERS[i]}
              </span>
            </button>
          ))}
        </div>
      )}

      {phase.qtype !== 'text' && sent && <LockedIn detail={phase.allowChange ? 'Tap another to change' : undefined} />}
      {closed && !sent && (
        <div role="status" className="muted-on-dark" style={{ textAlign: 'center', fontWeight: 700 }}>
          Time's up
        </div>
      )}
    </div>
  );
}

const LockedIn = ({ detail }: { detail?: string }) => (
  <div
    role="status"
    className="pop-in"
    style={{ textAlign: 'center', fontWeight: 800, fontSize: 20, color: '#86efac' }}
  >
    ✓ Locked in{detail ? <div style={{ fontSize: 15, fontWeight: 600 }}>{detail}</div> : null}
  </div>
);

function RevealView({
  phase,
}: {
  phase: Extract<NonNullable<ReturnType<typeof useGame.getState>['phase']>, { t: 'reveal' }>;
}) {
  const you = phase.you;
  const verdict = !you?.answered ? 'none' : you.voided ? 'void' : you.correct ? 'right' : 'wrong';
  const style = {
    right: { bg: '#052e16', fg: '#86efac', title: 'Correct!' },
    wrong: { bg: '#3b1218', fg: '#fca5a5', title: 'Not quite' },
    void: { bg: '#3b1218', fg: '#fdba74', title: 'Answer voided' },
    none: { bg: '#1f2740', fg: '#c3cbe0', title: "Time's up" },
  }[verdict];
  return (
    <div
      className="fade-in"
      style={{
        flex: 1,
        margin: '-12px -16px',
        padding: 16,
        background: style.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 800, color: style.fg }}>{style.title}</div>
      {verdict === 'right' && you && (
        <>
          <div className="pop-in" style={{ fontSize: 72, fontWeight: 800 }}>
            +{you.points}
          </div>
          {you.bonus > 0 && <div>🔥 includes +{you.bonus} streak bonus</div>}
        </>
      )}
      {verdict === 'void' && you && (
        <div style={{ fontSize: 22 }}>
          👀 You switched away during the question.
          {you.penalty > 0 && <div style={{ fontWeight: 800 }}>−{you.penalty} points</div>}
        </div>
      )}
      {phase.qtype === 'text' && verdict !== 'right' && phase.accepted.length > 0 && (
        <div className="muted-on-dark">Answer: {phase.accepted[0]}</div>
      )}
      {you && (
        <div style={{ marginTop: 12, fontSize: 22 }}>
          <b>{you.total.toLocaleString()}</b> pts · rank <b>#{you.rank}</b>
          {you.streak >= 2 && <span> · 🔥 {you.streak}</span>}
        </div>
      )}
    </div>
  );
}

function WarnedModal({ flag, strikesLeft, onClose }: { flag: FlagInfo; strikesLeft: number; onClose: () => void }) {
  const msg =
    flag.severity === 'minor'
      ? 'You were flagged. No points lost this time.'
      : flag.severity === 'moderate'
        ? "Your answer for that question doesn't count."
        : `Your answer is void and 500 points were deducted${flag.quickAnswer ? ' (you answered right after returning)' : ''}.`;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Warning"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.7)',
        zIndex: 50,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        className="pop-in"
        style={{
          background: 'var(--stage-2)',
          borderRadius: 20,
          padding: 24,
          maxWidth: 380,
          textAlign: 'center',
          border: '2px solid var(--warn)',
        }}
      >
        <div style={{ fontSize: 56 }}>👀</div>
        <h2 style={{ margin: '4px 0' }}>We noticed that</h2>
        <p style={{ margin: '8px 0' }}>
          You left the quiz for {(flag.awayMs / 1000).toFixed(1)}s. {msg}
        </p>
        <p className="muted-on-dark" style={{ fontSize: 14 }}>
          {strikesLeft} strike point{strikesLeft === 1 ? '' : 's'} left before removal. Everyone in the room can see
          this flag. If it was a mistake, the host can clear it.
        </p>
        <button className="btn btn-primary btn-lg" onClick={onClose} style={{ width: '100%' }}>
          Got it
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presence + heartbeat                                                */
/* ------------------------------------------------------------------ */

function usePresence(socket: React.RefObject<GameSocket | null>, questionOpen: boolean) {
  // Listeners run for the whole game; the server only counts events during open questions.
  useEffect(() => {
    let away: { at: number } | null = null;
    const send = (state: 'hidden' | 'visible' | 'blur' | 'focus' | 'left', awayMs?: number) =>
      socket.current?.send({ t: 'presence', state, awayMs: awayMs === undefined ? undefined : Math.round(awayMs) });
    const begin = (state: 'hidden' | 'blur') => {
      if (!away) away = { at: Date.now() };
      send(state);
    };
    const end = (state: 'visible' | 'focus') => {
      if (!away) return; // already reported by the other event (visible then focus)
      const ms = Date.now() - away.at;
      away = null;
      send(state, ms);
    };
    const onVis = () => (document.hidden ? begin('hidden') : end('visible'));
    const onBlur = () => !document.hidden && begin('blur');
    const onFocus = () => !document.hidden && end('focus');
    const onHide = () => send('left');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onHide);
    };
  }, [socket]);

  // Heartbeat: a gap in pings while a question is open is the backup signal.
  useEffect(() => {
    if (!questionOpen) return;
    const id = setInterval(() => socket.current?.send({ t: 'ping' }), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [questionOpen, socket]);
}
