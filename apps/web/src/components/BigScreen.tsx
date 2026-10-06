import { SHAPES, SHAPE_LETTERS } from '@quiz/shared/constants';
import type { BoardRow, LobbyPlayer, ResultsPayload } from '@quiz/shared/protocol';
import QRCode from 'qrcode';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCountdown } from '../lib/hooks';
import { flagCounts, type PhaseMsg } from '../lib/reduce';
import { sfx } from '../lib/sound';
import { useGame } from '../lib/store';
import { Avatar } from './Avatar';
import { EyeBadge, SuspectRow } from './Detective';

/* ------------------------------------------------------------------ */
/* Stage: a fixed 1920×1080 canvas scaled to fit any window            */
/* ------------------------------------------------------------------ */

export function Stage({ children, fixedScale }: { children: ReactNode; fixedScale?: number }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (fixedScale) return setScale(fixedScale);
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fixedScale]);
  return (
    <div className="stage-viewport">
      <div className="stage-canvas" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

export function TimerRing({
  remainingMs,
  totalMs,
  size = 150,
}: {
  remainingMs: number;
  totalMs: number;
  size?: number;
}) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const frac = totalMs > 0 ? Math.min(1, remainingMs / totalMs) : 0;
  const secs = Math.ceil(remainingMs / 1000);
  const low = secs <= 5;
  return (
    <div style={{ position: 'relative', width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="14" className="ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className={low ? 'ring-value ring-low' : 'ring-value'}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: size * 0.42,
          fontWeight: 800,
        }}
      >
        {secs}
      </div>
    </div>
  );
}

const questionFont = (text: string) =>
  text.length <= 60 ? 72 : text.length <= 110 ? 62 : text.length <= 160 ? 54 : 48;

export function OptionTile({
  i,
  text,
  tf,
  state,
  count,
  maxCount,
  height = 170,
}: {
  i: number;
  text: string;
  tf?: boolean;
  state?: 'idle' | 'correct' | 'wrong';
  count?: number;
  maxCount?: number;
  height?: number;
}) {
  const cls = `tile ${tf ? `tile-tf-${i}` : `tile-${i}`} ${state === 'wrong' ? 'dim' : ''} ${state === 'correct' ? 'correct' : ''}`;
  return (
    <div className={cls} style={{ height, padding: '0 32px', fontSize: 44, position: 'relative', overflow: 'hidden' }}>
      <span aria-hidden="true" style={{ fontSize: 64, lineHeight: 1 }}>
        {tf ? (i === 0 ? '✔' : '✖') : SHAPES[i]}
      </span>
      {!tf && <span className="sr-only">{SHAPE_LETTERS[i]}</span>}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
      {count !== undefined && (
        <span style={{ fontSize: 56, fontWeight: 800 }} aria-label={`${count} answers`}>
          {count}
        </span>
      )}
      {count !== undefined && maxCount ? (
        <span
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: 12,
            width: `${(count / maxCount) * 100}%`,
            background: 'rgba(255,255,255,.85)',
            transformOrigin: 'left',
            animation: 'bar-grow 700ms ease-out both',
          }}
        />
      ) : null}
    </div>
  );
}

/** The question layout, used live and in the builder preview. */
export function QuestionLayout(props: {
  index: number;
  total: number;
  qtype: 'mcq' | 'tf' | 'text';
  text: string;
  image?: string | null;
  options: string[];
  remainingMs: number;
  limitMs: number;
  answered?: { answered: number; total: number } | null;
  paused?: boolean;
  reveal?: { correctOption: number | null; counts: number[] };
}) {
  const { qtype, text, image, options, reveal } = props;
  const maxCount = reveal ? Math.max(1, ...reveal.counts) : undefined;
  return (
    <div className="stage-safe" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 40,
          fontSize: 30,
          color: 'var(--on-stage-muted)',
        }}
      >
        <span>
          Question {props.index + 1} of {props.total}
        </span>
        {props.paused && <span style={{ color: 'var(--warn)', fontWeight: 800 }}>⏸ PAUSED</span>}
      </div>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', minHeight: 190 }}>
        <h1
          style={{
            flex: 1,
            margin: 0,
            fontSize: questionFont(text),
            lineHeight: 1.12,
            fontWeight: 800,
            overflowWrap: 'anywhere',
          }}
        >
          {text || 'Your question appears here'}
        </h1>
        {!reveal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flex: 'none' }}>
            {props.answered && (
              <div style={{ textAlign: 'center', fontSize: 28, color: 'var(--on-stage-muted)' }}>
                <div style={{ fontSize: 64, fontWeight: 800, color: 'var(--on-stage)' }}>
                  {props.answered.answered}/{props.answered.total}
                </div>
                answered
              </div>
            )}
            <TimerRing remainingMs={props.remainingMs} totalMs={props.limitMs} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
        {image ? (
          <img
            src={image}
            alt=""
            style={{ maxHeight: 360, maxWidth: '100%', borderRadius: 16, objectFit: 'contain' }}
          />
        ) : qtype === 'text' && !reveal ? (
          <div style={{ fontSize: 56, color: 'var(--on-stage-muted)' }}>⌨ Type your answer on your phone</div>
        ) : null}
      </div>
      {qtype !== 'text' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {options.map((o, i) => (
            <OptionTile
              key={i}
              i={i}
              text={o}
              tf={qtype === 'tf'}
              state={reveal ? (reveal.correctOption === i ? 'correct' : 'wrong') : 'idle'}
              count={reveal?.counts[i]}
              maxCount={maxCount}
              height={qtype === 'tf' ? 200 : 170}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phases                                                              */
/* ------------------------------------------------------------------ */

function Lobby({ phase, roster }: { phase: Extract<PhaseMsg, { t: 'lobby' }>; roster: LobbyPlayer[] }) {
  const [qr, setQr] = useState('');
  const url = `${location.origin}/j/${phase.pin}`;
  useEffect(() => {
    void QRCode.toDataURL(url, { margin: 2, width: 560, color: { dark: '#0b0f1a', light: '#ffffff' } }).then(setQr);
  }, [url]);
  const flags = useGame((s) => s.flags);
  const counts = flagCounts(flags);
  return (
    <div className="stage-safe" style={{ display: 'flex', gap: 64 }}>
      <div style={{ width: 600, flex: 'none', textAlign: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: 20 }}>
          {qr && (
            <img src={qr} alt={`QR code to join at ${url}`} width={560} height={560} style={{ display: 'block' }} />
          )}
        </div>
        <div style={{ marginTop: 28, fontSize: 30, color: 'var(--on-stage-muted)' }}>Scan, or go to</div>
        <div style={{ fontSize: 36, fontWeight: 800, wordBreak: 'break-all' }}>{location.host}</div>
        <div style={{ marginTop: 8, fontSize: 30, color: 'var(--on-stage-muted)' }}>and enter PIN</div>
        <div
          style={{ fontSize: 120, fontWeight: 800, letterSpacing: 12, lineHeight: 1.1 }}
          aria-label={`PIN ${phase.pin.split('').join(' ')}`}
        >
          {phase.pin}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 28 }}>
          <span style={{ fontSize: 88, fontWeight: 800 }}>{roster.length}</span>
          <span style={{ fontSize: 40, color: 'var(--on-stage-muted)' }}>
            {roster.length === 1 ? 'player' : 'players'} in the lobby
          </span>
          {phase.locked && <span style={{ fontSize: 32, color: 'var(--warn)', fontWeight: 800 }}>🔒 locked</span>}
        </div>
        {roster.length === 0 && (
          <div style={{ fontSize: 44, color: 'var(--on-stage-muted)' }}>Waiting for players to scan the code…</div>
        )}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 24,
            alignContent: 'flex-start',
            maxHeight: 800,
            overflow: 'hidden',
          }}
        >
          {roster.map((p) => (
            <div
              key={p.id}
              className="pop-in"
              style={{ width: 132, textAlign: 'center', opacity: p.connected ? 1 : 0.45 }}
            >
              <div style={{ position: 'relative', width: 104, margin: '0 auto' }}>
                <Avatar code={p.avatar} size={104} rounded={24} />
                <EyeBadge count={counts[p.id] ?? 0} />
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 26,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.nickname}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GetReady({ phase }: { phase: Extract<PhaseMsg, { t: 'getready' }> }) {
  const left = useCountdown(phase.endsAt);
  const n = Math.max(1, Math.ceil(left / 1000));
  const last = useRef(0);
  useEffect(() => {
    if (n !== last.current) {
      last.current = n;
      sfx.tick();
    }
  }, [n]);
  return (
    <div className="stage-safe" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 56, color: 'var(--on-stage-muted)' }}>
          Question {phase.index + 1} of {phase.total}
        </div>
        <div key={n} className="pop-in" style={{ fontSize: 360, fontWeight: 800, lineHeight: 1 }}>
          {n}
        </div>
        <div style={{ fontSize: 48 }}>Get ready…</div>
      </div>
    </div>
  );
}

function Question({ phase }: { phase: Extract<PhaseMsg, { t: 'question' }> }) {
  const progress = useGame((s) => s.progress);
  const remaining = useCountdown(phase.endsAt, phase.paused, phase.pausedRemainingMs);
  const secs = Math.ceil(remaining / 1000);
  const prev = useRef(secs);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    if (!phase.paused && secs !== prev.current && secs <= 5 && secs > 0) sfx.tick();
    if (secs === 10 || secs === 5) setAnnounce(`${secs} seconds left`);
    prev.current = secs;
  }, [secs, phase.paused]);
  return (
    <>
      <QuestionLayout
        index={phase.index}
        total={phase.total}
        qtype={phase.qtype}
        text={phase.text ?? ''}
        image={phase.image}
        options={phase.options ?? []}
        remainingMs={remaining}
        limitMs={phase.limitMs}
        paused={phase.paused}
        answered={
          progress && progress.index === phase.index
            ? { answered: progress.answered, total: progress.total }
            : { answered: 0, total: 0 }
        }
      />
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </>
  );
}

function Reveal({
  phase,
  isHost,
  send,
}: {
  phase: Extract<PhaseMsg, { t: 'reveal' }>;
  isHost: boolean;
  send?: (m: { t: 'acceptAnswer'; text: string }) => void;
}) {
  const isText = phase.qtype === 'text';
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isText ? (
        <div className="stage-safe" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontSize: 30, color: 'var(--on-stage-muted)' }}>Question {phase.index + 1} · answer</div>
          <h1 style={{ margin: 0, fontSize: questionFont(phase.text ?? ''), fontWeight: 800, lineHeight: 1.12 }}>
            {phase.text}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <span style={{ fontSize: 34, color: 'var(--on-stage-muted)' }}>Accepted:</span>
            {phase.accepted.map((a) => (
              <span
                key={a}
                className="pop-in"
                style={{
                  background: 'var(--tile-d)',
                  padding: '10px 28px',
                  borderRadius: 14,
                  fontSize: 52,
                  fontWeight: 800,
                }}
              >
                ✔ {a}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 34, color: 'var(--on-stage-muted)', marginTop: 12 }}>Most common answers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {phase.topAnswers.slice(0, isHost ? 6 : 3).map((a) => (
              <div key={a.text} style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 44 }}>
                <span style={{ width: 90, textAlign: 'right', fontWeight: 800 }}>{a.count}×</span>
                <span
                  style={{
                    background: a.accepted ? 'var(--tile-d)' : 'var(--stage-3)',
                    padding: '6px 24px',
                    borderRadius: 12,
                  }}
                >
                  {a.text}
                </span>
                {isHost && !a.accepted && send && (
                  <button
                    className="btn btn-dark"
                    style={{ fontSize: 22 }}
                    onClick={() => send({ t: 'acceptAnswer', text: a.text })}
                  >
                    Accept this answer
                  </button>
                )}
              </div>
            ))}
            {phase.topAnswers.length === 0 && (
              <div style={{ fontSize: 40, color: 'var(--on-stage-muted)' }}>Nobody answered.</div>
            )}
          </div>
        </div>
      ) : (
        <QuestionLayout
          index={phase.index}
          total={phase.total}
          qtype={phase.qtype}
          text={phase.text ?? ''}
          image={phase.image}
          options={phase.options ?? []}
          remainingMs={0}
          limitMs={1}
          reveal={{ correctOption: phase.correctOption, counts: phase.counts }}
        />
      )}
      {phase.voided.length > 0 && (
        <div
          className="slide-up"
          style={{
            position: 'absolute',
            right: 96,
            top: 54,
            background: '#3b1218',
            border: '2px solid var(--bad)',
            borderRadius: 16,
            padding: '12px 22px',
            fontSize: 28,
            maxWidth: 640,
          }}
        >
          🚫 Voided: <b>{phase.voided.map((v) => v.nickname).join(', ')}</b>
        </div>
      )}
    </div>
  );
}

function Leaderboard({ rows, isLast }: { rows: BoardRow[]; isLast: boolean }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), 400);
    return () => clearTimeout(id);
  }, []);
  const H = 128;
  return (
    <div className="stage-safe">
      <div style={{ fontSize: 64, fontWeight: 800, marginBottom: 32 }}>
        {isLast ? 'Final standings' : 'Leaderboard'}
      </div>
      <div style={{ position: 'relative', height: rows.length * H }}>
        {rows.map((r) => {
          const startRank = r.rank + r.delta;
          const pos = (settled ? r.rank : startRank) - 1;
          return (
            <div
              key={r.id}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: H - 16,
                transform: `translateY(${pos * H}px)`,
                transition: 'transform 700ms cubic-bezier(.2,.8,.2,1)',
                display: 'flex',
                alignItems: 'center',
                gap: 28,
                padding: '0 32px',
                background: 'var(--stage-2)',
                borderRadius: 20,
                fontSize: 52,
              }}
            >
              <span style={{ width: 70, fontWeight: 800 }}>{r.rank}</span>
              <div style={{ position: 'relative' }}>
                <Avatar code={r.avatar} size={84} rounded={20} />
                <EyeBadge count={r.flags} />
              </div>
              <span
                style={{ flex: 1, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {r.nickname}
              </span>
              {r.delta !== 0 && (
                <span style={{ fontSize: 34, color: r.delta > 0 ? '#4ade80' : '#f87171', fontWeight: 800 }}>
                  {r.delta > 0 ? '▲' : '▼'} {Math.abs(r.delta)}
                </span>
              )}
              <span style={{ fontWeight: 800, minWidth: 220, textAlign: 'right' }}>{r.score.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d')!;
    const colors = ['#c62839', '#2457d6', '#f2b01e', '#12794a', '#5b4bff', '#fff'];
    const bits = Array.from({ length: 160 }, () => ({
      x: 960 + (Math.random() - 0.5) * 200,
      y: 700,
      vx: (Math.random() - 0.5) * 36,
      vy: -Math.random() * 34 - 8,
      s: Math.random() * 14 + 6,
      c: colors[Math.floor(Math.random() * colors.length)]!,
      r: Math.random() * 6,
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, 1920, 1080);
      for (const b of bits) {
        b.vy += 0.8;
        b.x += b.vx;
        b.y += b.vy;
        b.r += 0.2;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
        ctx.restore();
      }
      if (++frame < 150) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, 1920, 1080);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas ref={ref} width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
  );
}

export function ResultsTable({ results }: { results: ResultsPayload }) {
  return (
    <div style={{ fontSize: 24 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--on-stage-muted)' }}>
            {['#', 'Player', 'Score', 'Correct', 'Avg time', 'Flags'].map((h) => (
              <th key={h} style={{ padding: '8px 12px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.players.map((p) => (
            <tr key={p.id} style={{ borderTop: '1px solid #2b3555', opacity: p.removed ? 0.5 : 1 }}>
              <td style={{ padding: '4px 12px' }}>{p.rank || '—'}</td>
              <td style={{ padding: '4px 12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <Avatar code={p.avatar} size={32} rounded={10} /> {p.nickname}
                  {p.removed && ' (removed)'}
                </span>
              </td>
              <td style={{ padding: '8px 12px', fontWeight: 800 }}>{p.score.toLocaleString()}</td>
              <td style={{ padding: '8px 12px' }}>
                {p.correct}/{results.questionCount}
              </td>
              <td style={{ padding: '8px 12px' }}>{(p.avgTimeMs / 1000).toFixed(1)}s</td>
              <td style={{ padding: '8px 12px' }}>{p.flags > 0 ? `👁 ${p.flags}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Podium({ phase, showTable }: { phase: Extract<PhaseMsg, { t: 'podium' }>; showTable: boolean }) {
  const order = [phase.top[1], phase.top[0], phase.top[2]];
  const heights = [300, 420, 220];
  const medals = ['🥈', '🥇', '🥉'];
  const fired = useRef(false);
  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      sfx.fanfare();
    }
  }, []);
  if (showTable && phase.results) {
    return (
      <div className="stage-safe" style={{ overflow: 'auto' }}>
        <div style={{ fontSize: 56, fontWeight: 800, marginBottom: 12 }}>Full results</div>
        <ResultsTable results={phase.results} />
      </div>
    );
  }
  return (
    <div className="stage-safe">
      <Confetti />
      <div style={{ fontSize: 72, fontWeight: 800, textAlign: 'center' }}>🏆 Podium</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 40, height: 760 }}>
        {order.map((p, i) =>
          p ? (
            <div
              key={p.id}
              className="slide-up"
              style={{ textAlign: 'center', animationDelay: `${i === 1 ? 0.6 : i === 0 ? 0.3 : 0}s`, width: 400 }}
            >
              <div style={{ position: 'relative', width: 160, margin: '0 auto 12px' }}>
                <Avatar code={p.avatar} size={160} rounded={36} />
                <EyeBadge count={p.flags} />
              </div>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 800,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.nickname}
              </div>
              <div style={{ fontSize: 40, color: 'var(--on-stage-muted)' }}>{p.score.toLocaleString()}</div>
              <div
                style={{
                  height: heights[i],
                  marginTop: 12,
                  background: i === 1 ? 'var(--accent)' : 'var(--stage-3)',
                  borderRadius: '20px 20px 0 0',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 120,
                }}
              >
                {medals[i]}
              </div>
            </div>
          ) : (
            <div key={i} style={{ width: 400 }} />
          ),
        )}
      </div>
    </div>
  );
}

/** Up to 3 owl animations at once; the rest collapse into "+N more suspects". */
function SuspectLayer() {
  const suspects = useGame((s) => s.suspects);
  const roster = useGame((s) => s.roster);
  const drop = useGame((s) => s.dropSuspect);
  const avatarOf = (id: string) => roster.find((p) => p.id === id)?.avatar ?? 'f0-s0-e0-m0-a0-b0';
  const DURATION = { minor: 2000, moderate: 2500, major: 3000, removed: 1600 } as const;
  const shown = suspects.slice(0, 3);
  const more = suspects.length - shown.length;
  const flaggedKey = shown.map((s) => s.key).join('|');
  useEffect(() => {
    const timers = shown.map((s) => setTimeout(() => drop(s.key), DURATION[s.flag.severity]));
    if (shown.some((s) => s.flag.severity !== 'removed')) sfx.flag();
    return () => timers.forEach(clearTimeout);
  }, [flaggedKey]);
  if (!shown.length) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        bottom: 420,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      {shown.map((s) => (
        <SuspectRow
          key={s.key}
          suspect={s}
          avatar={<Avatar code={avatarOf(s.flag.playerId)} size={72} rounded={16} />}
        />
      ))}
      {more > 0 && (
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            background: '#3b1218',
            borderRadius: 14,
            padding: '8px 18px',
            width: 'fit-content',
          }}
        >
          +{more} more suspects
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

export function BigScreen({
  isHost,
  send,
  showTable = false,
}: {
  isHost: boolean;
  send?: (m: never) => void;
  showTable?: boolean;
}) {
  const phase = useGame((s) => s.phase);
  const roster = useGame((s) => s.roster);
  const ended = useGame((s) => s.ended);
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const memoSend = useMemo(() => send as ((m: { t: 'acceptAnswer'; text: string }) => void) | undefined, [send]);

  let body: ReactNode;
  if (error && ['not_found', 'ended', 'forbidden'].includes(error.code)) {
    body = (
      <div className="stage-safe" style={{ display: 'grid', placeItems: 'center', fontSize: 56 }}>
        {error.code === 'forbidden' ? 'Sign in again to control this game' : 'This game is no longer available'}
      </div>
    );
  } else if (ended) {
    body = (
      <div className="stage-safe" style={{ display: 'grid', placeItems: 'center', fontSize: 72, fontWeight: 800 }}>
        Thanks for playing! 🎉
      </div>
    );
  } else if (!phase) {
    body = (
      <div
        className="stage-safe"
        style={{ display: 'grid', placeItems: 'center', fontSize: 48, color: 'var(--on-stage-muted)' }}
      >
        Connecting…
      </div>
    );
  } else {
    switch (phase.t) {
      case 'lobby':
        body = <Lobby phase={phase} roster={roster} />;
        break;
      case 'getready':
        body = <GetReady phase={phase} />;
        break;
      case 'question':
        body = <Question phase={phase} />;
        break;
      case 'reveal':
        body = <Reveal phase={phase} isHost={isHost} send={memoSend} />;
        break;
      case 'leaderboard':
        body = <Leaderboard rows={phase.top} isLast={phase.isLast} />;
        break;
      case 'podium':
        body = <Podium phase={phase} showTable={showTable} />;
        break;
    }
  }
  return (
    <>
      {body}
      <SuspectLayer />
      {status === 'reconnecting' && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--warn)',
            color: '#1a1300',
            padding: '8px 24px',
            borderRadius: 12,
            fontSize: 26,
            fontWeight: 800,
          }}
        >
          Reconnecting…
        </div>
      )}
    </>
  );
}
