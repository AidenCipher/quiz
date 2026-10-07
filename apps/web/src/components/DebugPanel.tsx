import type { ClientMsg } from '@quiz/shared/protocol';
import { useEffect } from 'react';
import { useDialog } from '../lib/useDialog';
import { useGame } from '../lib/store';

const fmt = (ms: number | null, unit = 'ms') => (ms === null ? '—' : `${Math.round(ms)} ${unit}`);
const CLOSE_LABEL = { 'all-answered': 'everyone answered', timer: 'timer ran out', host: 'host action' } as const;

/**
 * Host-only diagnostics (key D, not shown in the toolbar). Polls the game room once a second while open.
 * Nothing here is stored: it is a live view of connections, message rate and each phone's own round-trip time.
 */
export function DebugPanel({ send, onClose }: { send: (m: ClientMsg) => void; onClose: () => void }) {
  const d = useGame((s) => s.debug);
  const ref = useDialog<HTMLElement>(true, onClose, { trap: false });
  useEffect(() => {
    send({ t: 'debug' });
    const id = setInterval(() => send({ t: 'debug' }), 1000);
    return () => clearInterval(id);
  }, [send]);

  const slowest = d ? [...d.clients].sort((a, b) => (b.rttMs ?? -1) - (a.rttMs ?? -1)) : [];
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label="Debug"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 460,
        zIndex: 50,
        background: 'var(--stage-2)',
        borderRight: '1px solid #38425f',
        padding: 16,
        overflowY: 'auto',
        color: 'var(--on-stage)',
        fontSize: 14,
      }}
    >
      <div className="flex items-center justify-between">
        <h2 style={{ margin: 0, fontSize: 22 }}>Debug</h2>
        <button className="btn btn-dark" onClick={onClose} aria-label="Close debug">
          ✕
        </button>
      </div>
      {!d ? (
        <p className="muted-on-dark">Waiting for the game room…</p>
      ) : (
        <>
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px', margin: '16px 0' }}>
            <dt className="muted-on-dark">Connected phones</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>
              {d.connected} / {d.players}
            </dd>
            <dt className="muted-on-dark">Messages per second (last 5 s)</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{d.messagesPerSec}</dd>
            <dt className="muted-on-dark">Malformed messages dropped</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{d.malformed}</dd>
            <dt className="muted-on-dark">Last question closed</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>
              {d.lastClose
                ? `Q${d.lastClose.index + 1}: ${CLOSE_LABEL[d.lastClose.by]}, server took ${fmt(d.lastClose.ms)}`
                : '—'}
            </dd>
          </dl>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption className="muted-on-dark" style={{ textAlign: 'left', paddingBottom: 6 }}>
              Slowest phones first (round trip measured by each phone)
            </caption>
            <thead>
              <tr style={{ textAlign: 'left' }} className="muted-on-dark">
                <th scope="col">Player</th>
                <th scope="col">Round trip</th>
                <th scope="col">Last ping</th>
              </tr>
            </thead>
            <tbody>
              {slowest.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid #2b3555', opacity: c.connected ? 1 : 0.5 }}>
                  <td style={{ padding: '4px 0' }}>
                    {c.nickname}
                    {!c.connected && ' (offline)'}
                  </td>
                  <td>{fmt(c.rttMs)}</td>
                  <td>{fmt(c.lastPingAgoMs === null ? null : c.lastPingAgoMs / 1000, 's ago')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </aside>
  );
}
