import { useState, type ReactNode } from 'react';
import { useDialog } from '../lib/useDialog';

interface ConfirmProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  dark?: boolean;
}

/** An accessible replacement for window.confirm(): focus-trapped, Escape cancels, nothing pre-selected as "yes". */
export function ConfirmDialog({ title, children, confirmLabel, danger, onConfirm, onCancel, dark }: ConfirmProps) {
  const ref = useDialog<HTMLDivElement>(true, onCancel);
  return (
    <Overlay>
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        className={dark ? undefined : 'card'}
        style={{
          maxWidth: 440,
          width: '100%',
          padding: 20,
          background: dark ? 'var(--stage-2)' : undefined,
          color: dark ? 'var(--on-stage)' : undefined,
          borderRadius: 16,
          border: dark ? '1px solid #38425f' : undefined,
        }}
      >
        <h2 id="dlg-title" style={{ marginTop: 0 }}>
          {title}
        </h2>
        <div style={{ marginBottom: 16 }}>{children}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className={`btn ${dark ? 'btn-dark' : ''}`} onClick={onCancel} data-autofocus>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export const Overlay = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.55)',
      display: 'grid',
      placeItems: 'center',
      padding: 16,
      zIndex: 60,
    }}
  >
    {children}
  </div>
);

/**
 * Shown before a host opens a lobby. The box starts unticked and the button stays disabled until it is ticked,
 * so permission for children is an active, informed choice by the host.
 */
export function HostConsentDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onCancel);
  const [ok, setOk] = useState(false);
  return (
    <Overlay>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hc-title"
        className="card"
        style={{ maxWidth: 480, width: '100%', padding: 20 }}
      >
        <h2 id="hc-title" style={{ marginTop: 0 }}>
          Before you open the lobby
        </h2>
        <p>
          Players give a nickname and an avatar, and their answers, scores and tab switches are recorded for this game.
          Results are kept for 30 days unless you delete them sooner.{' '}
          <a href="/privacy" target="_blank" rel="noreferrer">
            Privacy policy
          </a>
        </p>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '12px 0' }}>
          <input
            type="checkbox"
            checked={ok}
            onChange={(e) => setOk(e.target.checked)}
            style={{ width: 22, height: 22, marginTop: 2, flex: 'none' }}
            data-autofocus
          />
          <span>
            I have the right to run this game with my audience. If any player is under 16 (or the age set by local law),
            I have permission from their school, parent or guardian.
          </span>
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!ok} onClick={onConfirm}>
            Open lobby
          </button>
        </div>
      </div>
    </Overlay>
  );
}
