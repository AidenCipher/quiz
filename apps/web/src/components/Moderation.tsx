import type { ClientMsg, FlagInfo, LobbyPlayer } from '@quiz/shared/protocol';
import { useState } from 'react';
import { useServerNow } from '../lib/hooks';
import { useGame } from '../lib/store';
import { useDialog } from '../lib/useDialog';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './Dialogs';

const SEV_COLOR = { minor: '#f2b01e', moderate: '#f97316', major: '#ef4444' } as const;

export function PendingRemovals({ send }: { send: (m: ClientMsg) => void }) {
  const pending = useGame((s) => s.pending);
  const now = useServerNow(250);
  const entries = Object.entries(pending);
  if (!entries.length) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {entries.map(([id, p]) => (
        <div
          key={id}
          role="alert"
          className="slide-up"
          style={{
            background: '#3b1218',
            border: '2px solid var(--bad)',
            borderRadius: 14,
            padding: '10px 16px',
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            fontSize: 22,
          }}
        >
          <span>
            🚪 <b>{p.nickname}</b> reached the strike limit and will be removed in{' '}
            {Math.max(0, Math.ceil((p.endsAt - now) / 1000))}s
          </span>
          <button className="btn btn-dark" onClick={() => send({ t: 'overrideKick', playerId: id })}>
            Keep them
          </button>
        </div>
      ))}
    </div>
  );
}

export function ModerationDrawer({ send, onClose }: { send: (m: ClientMsg) => void; onClose: () => void }) {
  const roster = useGame((s) => s.roster);
  const flags = useGame((s) => s.flags);
  const locked = useGame((s) => s.locked);
  const ref = useDialog<HTMLElement>(true, onClose, { trap: false });
  const [kicking, setKicking] = useState<LobbyPlayer | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const live = flags
    .filter((f) => !f.cleared)
    .slice()
    .reverse();
  const nick = (id: string) => roster.find((p) => p.id === id)?.nickname;

  const submitRename = (p: LobbyPlayer) => {
    send({ t: 'rename', playerId: p.id, nickname: name });
    setRenaming(null);
  };
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label="Moderation"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        zIndex: 50,
        background: 'var(--stage-2)',
        borderLeft: '1px solid #38425f',
        padding: 16,
        overflowY: 'auto',
        color: 'var(--on-stage)',
      }}
    >
      <div className="flex items-center justify-between">
        <h2 style={{ margin: 0, fontSize: 22 }}>Moderation</h2>
        <button className="btn btn-dark" onClick={onClose} aria-label="Close moderation">
          ✕
        </button>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
        <input type="checkbox" checked={locked} onChange={(e) => send({ t: 'lockLobby', locked: e.target.checked })} />{' '}
        Lock lobby (no new players)
      </label>

      <h3 style={{ fontSize: 16, margin: '16px 0 8px' }} className="muted-on-dark">
        Flags ({live.length})
      </h3>
      {live.length === 0 && <div className="muted-on-dark">No active flags.</div>}
      {live.map((f: FlagInfo) => (
        <div
          key={f.id}
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: '1px solid #2b3555',
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 5, background: SEV_COLOR[f.severity], flex: 'none' }} />
          <div style={{ flex: 1, fontSize: 14 }}>
            <b>{nick(f.playerId) ?? f.nickname}</b> · Q{f.q + 1} · {f.kind} {(f.awayMs / 1000).toFixed(1)}s
            <div className="muted-on-dark">
              {f.severity}
              {f.quickAnswer ? ' (answered right after returning)' : ''} · {f.strike} strike pt
            </div>
          </div>
          <button
            className="btn btn-dark"
            onClick={() => send({ t: 'clearFlag', flagId: f.id })}
            title="Clear flag and refund penalty for everyone"
          >
            Clear
          </button>
        </div>
      ))}

      <h3 style={{ fontSize: 16, margin: '20px 0 8px' }} className="muted-on-dark">
        Players ({roster.length})
      </h3>
      {roster.map((p) => (
        <div
          key={p.id}
          style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', opacity: p.connected ? 1 : 0.5 }}
        >
          <Avatar code={p.avatar} size={36} rounded={10} />
          {renaming === p.id ? (
            <form
              style={{ display: 'flex', gap: 6, flex: 1 }}
              onSubmit={(e) => {
                e.preventDefault();
                submitRename(p);
              }}
            >
              <input
                className="input input-dark"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={16}
                autoFocus
                aria-label="New nickname"
              />
              <button className="btn btn-dark" type="submit">
                OK
              </button>
            </form>
          ) : (
            <>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.nickname}
              </span>
              <button
                className="btn btn-dark"
                onClick={() => {
                  setRenaming(p.id);
                  setName(p.nickname);
                }}
              >
                Rename
              </button>
              <button className="btn btn-danger" onClick={() => setKicking(p)}>
                Kick
              </button>
            </>
          )}
        </div>
      ))}
      {kicking && (
        <ConfirmDialog
          dark
          danger
          title={`Remove ${kicking.nickname}?`}
          confirmLabel="Remove player"
          onCancel={() => setKicking(null)}
          onConfirm={() => {
            send({ t: 'kick', playerId: kicking.id });
            setKicking(null);
          }}
        >
          They are taken out of the game and cannot rejoin.
        </ConfirmDialog>
      )}
    </aside>
  );
}
