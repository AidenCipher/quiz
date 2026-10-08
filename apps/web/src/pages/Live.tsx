import type { ClientMsg } from '@quiz/shared/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BigScreen, Stage } from '../components/BigScreen';
import { ConfirmDialog } from '../components/Dialogs';
import { DebugPanel } from '../components/DebugPanel';
import { ModerationDrawer, PendingRemovals } from '../components/Moderation';
import { api } from '../lib/api';
import { resultsToCsv, download } from '../lib/csv';
import { GameSocket, resetClock } from '../lib/socket';
import { isMuted, setMuted, sfx, startMusic, stopMusic } from '../lib/sound';
import { useGame } from '../lib/store';
import { acquireWakeLock, releaseWakeLock } from '../lib/wakelock';

export default function Live() {
  const { pin = '' } = useParams();
  const nav = useNavigate();
  const sock = useRef<GameSocket | null>(null);
  const phase = useGame((s) => s.phase);
  const status = useGame((s) => s.status);
  const roster = useGame((s) => s.roster);
  const locked = useGame((s) => s.locked);
  const error = useGame((s) => s.error);
  const [barVisible, setBarVisible] = useState(true);
  const [moderation, setModeration] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [table, setTable] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback((m: ClientMsg) => sock.current?.send(m), []);

  useEffect(() => {
    useGame.getState().reset();
    resetClock();
    const s = new GameSocket(pin, 'host', { getTicket: async () => (await api.ticket(pin, 'host')).ticket });
    sock.current = s;
    s.connect();
    void acquireWakeLock();
    return () => {
      s.close();
      releaseWakeLock();
      stopMusic();
    };
  }, [pin]);

  // Sign-in expired: send the host back to the home page.
  useEffect(() => {
    if (error?.code === 'forbidden') void api.me().then((m) => !m.user && nav('/host'));
  }, [error, nav]);

  // Sound cues
  const prevPlayers = useRef(0);
  useEffect(() => {
    if (phase?.t === 'lobby') {
      if (roster.length > prevPlayers.current) sfx.join();
      prevPlayers.current = roster.length;
      startMusic();
    } else stopMusic();
    if (phase?.t === 'question') sfx.go();
    if (phase?.t === 'reveal') sfx.reveal();
  }, [phase?.t, roster.length]);

  const endAndGoHome = useCallback(() => {
    send({ t: 'end' });
    setTimeout(() => nav('/host'), 600);
  }, [send, nav]);

  const primary = useCallback(() => {
    if (!phase) return;
    if (phase.t === 'lobby') send({ t: 'start' });
    else if (phase.t === 'reveal' || phase.t === 'leaderboard') send({ t: 'next' });
    else if (phase.t === 'question') send({ t: 'skip' });
    else if (phase.t === 'getready') send({ t: 'skip' });
    else if (phase.t === 'podium') {
      if (!table) setTable(true);
      else endAndGoHome(); // the last screen: Space closes the game and returns to the dashboard
    }
  }, [phase, send, table, endAndGoHome]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };
  const toggleMute = () => {
    setMuted(!isMuted());
    setMutedState(isMuted());
  };

  // One listener for the page's lifetime that always calls the latest handlers, so no key press can fall
  // into the gap between a phase change and the effect that would have re-attached the listener.
  const keyHandlers = useRef({ primary, phase, send });
  keyHandlers.current = { primary, phase, send };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { primary, phase, send } = keyHandlers.current;
      const el = e.target as HTMLElement;
      // Never hijack keys meant for a focused control, a form field or an open dialog/drawer.
      if (el.closest('input, textarea, select, button, a, [role=dialog], [role=alertdialog], aside')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        primary();
      } else if (e.key === 'p' || e.key === 'P') {
        if (phase?.t === 'question') send({ t: phase.paused ? 'resume' : 'pause' });
      } else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'm' || e.key === 'M') toggleMute();
      else if (e.key === 'k' || e.key === 'K') setModeration((m) => !m);
      else if (e.key === 'd' || e.key === 'D') setDebugOpen((d) => !d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auto-hiding control bar
  const wake = () => {
    setBarVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!document.activeElement?.closest('.controls-bar')) setBarVisible(false);
    }, 3500);
  };
  useEffect(() => {
    wake();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const label = (() => {
    switch (phase?.t) {
      case 'lobby':
        return '▶ Start game (Space)';
      case 'getready':
        return 'Skip countdown';
      case 'question':
        return 'End question (Space)';
      case 'reveal':
        return 'Leaderboard (Space)';
      case 'leaderboard':
        return phase.isLast ? 'Finish — podium (Space)' : 'Next question (Space)';
      case 'podium':
        return table ? 'End game & go home (Space)' : 'Full results (Space)';
      default:
        return '…';
    }
  })();

  return (
    <div
      onMouseMove={wake}
      onTouchStart={wake}
      // After a mouse click, hand keyboard shortcuts (Space, P, F, M, K) back to the page; keyboard users keep their focus.
      onClickCapture={(e) => e.detail > 0 && (e.target as HTMLElement).closest('button')?.blur()}
      style={{ position: 'fixed', inset: 0 }}
    >
      <Stage>
        <BigScreen isHost send={send as never} showTable={table} />
      </Stage>
      {confirmEnd && (
        <ConfirmDialog
          dark
          danger
          title="End the game now?"
          confirmLabel="End and show podium"
          onCancel={() => setConfirmEnd(false)}
          onConfirm={() => {
            setConfirmEnd(false);
            send({ t: 'end' });
          }}
        >
          The current question is closed and the podium is shown.
        </ConfirmDialog>
      )}
      <PendingRemovals send={send} />
      {debugOpen && <DebugPanel send={send} onClose={() => setDebugOpen(false)} />}
      {moderation && <ModerationDrawer send={send} onClose={() => setModeration(false)} />}
      {status !== 'open' && status !== 'idle' && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            background: 'var(--warn)',
            color: '#1a1300',
            padding: '6px 14px',
            borderRadius: 10,
            fontWeight: 700,
          }}
        >
          {status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        </div>
      )}
      <div
        className={`controls-bar ${barVisible ? '' : 'hidden-bar'}`}
        role="toolbar"
        aria-label="Host controls"
        onFocus={wake}
      >
        {phase?.t === 'lobby' && (
          <button className="btn btn-dark" onClick={() => send({ t: 'lockLobby', locked: !locked })}>
            {locked ? '🔓 Unlock' : '🔒 Lock lobby'}
          </button>
        )}
        {phase?.t === 'question' && (
          <>
            <button className="btn btn-dark" onClick={() => send({ t: phase.paused ? 'resume' : 'pause' })}>
              {phase.paused ? '▶ Resume (P)' : '⏸ Pause (P)'}
            </button>
            <button className="btn btn-dark" onClick={() => send({ t: 'extend' })}>
              +10s
            </button>
          </>
        )}
        <button
          className="btn btn-primary"
          onClick={primary}
          disabled={!phase || (phase.t === 'lobby' && roster.length === 0)}
        >
          {label}
        </button>
        {phase?.t === 'podium' && (
          <>
            {phase.results && (
              <button
                className="btn btn-dark"
                onClick={() => download(`quiz-results-${pin}.csv`, resultsToCsv(phase.results!))}
              >
                ⬇ CSV
              </button>
            )}
            {table && (
              <button className="btn btn-dark" onClick={() => setTable(false)}>
                ← Back to podium
              </button>
            )}
            <button className="btn btn-danger" onClick={endAndGoHome}>
              End game
            </button>
          </>
        )}
        <button className="btn btn-dark" onClick={() => setModeration((m) => !m)} aria-pressed={moderation}>
          🛡 Moderate (K)
        </button>
        <button className="btn btn-dark" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="btn btn-dark" onClick={toggleFullscreen} aria-label="Fullscreen (F)">
          ⛶
        </button>
        <button
          className="btn btn-dark"
          onClick={() => window.open(`/screen/${pin}`, 'quiz-arena-screen', 'popup,width=1280,height=720')}
          title="Show the game on a second display"
        >
          🖥 Second window
        </button>
        {phase?.t !== 'podium' && (
          <button className="btn btn-dark" onClick={() => setConfirmEnd(true)}>
            End
          </button>
        )}
      </div>
    </div>
  );
}
