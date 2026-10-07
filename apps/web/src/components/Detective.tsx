import type { Suspect } from '../lib/reduce';

/**
 * "Detective owl", an original character: round owl, deerstalker hat and a magnifying glass.
 * Animations are CSS keyframes (see index.css) and collapse to a fade under reduced motion.
 */
export function Owl({ severity, size = 120 }: { severity: Suspect['flag']['severity']; size?: number }) {
  const narrow = severity === 'minor';
  const stare = severity === 'moderate';
  const point = severity === 'major';
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      {/* body */}
      <ellipse cx="55" cy="72" rx="34" ry="36" fill="#a16207" />
      <ellipse cx="55" cy="82" rx="20" ry="24" fill="#fde68a" />
      {/* hat */}
      <path d="M26 44 Q55 6 84 44 Q55 36 26 44Z" fill="#78350f" />
      <rect x="22" y="42" width="66" height="7" rx="3" fill="#451a03" />
      <circle cx="55" cy="14" r="4" fill="#451a03" />
      {/* eyes */}
      <circle cx="42" cy="58" r="13" fill="#fff" />
      <circle cx="68" cy="58" r="13" fill="#fff" />
      <circle cx={stare ? 46 : 43} cy={narrow ? 60 : 58} r="6" fill="#111827" />
      <circle cx={stare ? 72 : 69} cy={narrow ? 60 : 58} r="6" fill="#111827" />
      {narrow && (
        <>
          <rect x="28" y="44" width="28" height="9" fill="#a16207" />
          <rect x="54" y="44" width="28" height="9" fill="#a16207" />
        </>
      )}
      {/* brows */}
      <path
        d={stare || point ? 'M30 46 L52 52' : 'M30 48 L52 50'}
        stroke="#451a03"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d={stare || point ? 'M80 46 L58 52' : 'M80 48 L58 50'}
        stroke="#451a03"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* beak */}
      <path d="M50 68 L60 68 L55 78Z" fill="#f59e0b" />
      {/* magnifying glass */}
      <g className={point ? 'lens-wiggle' : undefined}>
        <circle cx="96" cy="84" r="14" fill="rgba(186,230,253,.55)" stroke="#e5e7eb" strokeWidth="5" />
        <path d="M86 94 L72 108" stroke="#e5e7eb" strokeWidth="6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const OUTLINE: Record<string, string> = {
  minor: 'flag-outline-minor',
  moderate: 'flag-outline-moderate',
  major: 'flag-outline-major',
  removed: 'flag-outline-major',
};

/** One suspect row for the big screen: avatar tile with the owl sliding out beside it. */
export function SuspectRow({
  suspect,
  avatar,
  big = false,
}: {
  suspect: Suspect;
  avatar: React.ReactNode;
  big?: boolean;
}) {
  const sev = suspect.flag.severity;
  const quip = 'quip' in suspect.flag ? suspect.flag.quip : undefined;
  const label =
    sev === 'removed'
      ? 'was escorted out'
      : sev === 'major'
        ? 'caught red-handed'
        : sev === 'moderate'
          ? 'looks suspicious'
          : 'left the tab';
  return (
    <div
      className="flex items-center gap-4"
      style={{ animation: sev === 'removed' ? undefined : undefined }}
      role="status"
      aria-label={`${suspect.flag.nickname} ${label}`}
    >
      <div className={`det-${sev}`} style={{ marginRight: -28 }}>
        <Owl severity={sev} size={big ? 150 : 110} />
      </div>
      <div
        className={`relative rounded-2xl ${OUTLINE[sev]} ${sev === 'removed' ? 'det-removed' : ''}`}
        style={{ background: '#151b2b', padding: 6 }}
      >
        {avatar}
      </div>
      <div style={{ fontSize: big ? 34 : 26, fontWeight: 800 }}>
        {suspect.flag.nickname}
        <div style={{ fontSize: big ? 24 : 18, color: 'var(--on-stage-muted)', fontWeight: 600 }}>{label}</div>
        {quip && (
          <div
            className="sticker s-flag"
            data-testid="flag-quip"
            style={{
              marginTop: 8,
              padding: '6px 12px',
              fontSize: big ? 26 : 21,
              fontWeight: 800,
              borderRadius: 14,
              maxWidth: 560,
              ['--tilt' as string]: '-1.5deg',
            }}
          >
            <span aria-hidden="true">{quip.emoji} </span>
            {quip.text}
            {quip.ref && <span className="ref"> {quip.ref}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function EyeBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="eye-badge" title={`${count} flag${count > 1 ? 's' : ''}`}>
      👁 {count}
    </span>
  );
}
