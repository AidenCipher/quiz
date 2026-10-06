import {
  AVATAR_PARTS,
  DEFAULT_AVATAR,
  encodeAvatar,
  parseAvatar,
  type AvatarKey,
  type AvatarParts,
} from '@quiz/shared/avatar';
import { memo } from 'react';

const BG = ['#fde68a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#ddd6fe', '#fecaca'];
const SKIN = ['#fcd9b6', '#f1c27d', '#e0a370', '#c68642', '#8d5524', '#5c3a21'];

/** Original face shapes (100×100 viewBox). */
function Face({ i, fill }: { i: number; fill: string }) {
  switch (i) {
    case 0:
      return <circle cx="50" cy="52" r="34" fill={fill} />;
    case 1:
      return <rect x="17" y="19" width="66" height="66" rx="20" fill={fill} />;
    case 2:
      return <ellipse cx="50" cy="52" rx="38" ry="31" fill={fill} />;
    case 3:
      return <ellipse cx="50" cy="52" rx="30" ry="37" fill={fill} />;
    case 4:
      return <rect x="16" y="22" width="68" height="62" rx="30" fill={fill} />;
    default:
      return (
        <path
          d="M50 16 L82 34 L82 68 L50 88 L18 68 L18 34 Z"
          fill={fill}
          strokeLinejoin="round"
          stroke={fill}
          strokeWidth="8"
        />
      );
  }
}

function Eyes({ i }: { i: number }) {
  const ink = '#1f2937';
  switch (i) {
    case 0:
      return (
        <>
          <circle cx="38" cy="48" r="4" fill={ink} />
          <circle cx="62" cy="48" r="4" fill={ink} />
        </>
      );
    case 1:
      return (
        <>
          <circle cx="38" cy="48" r="7" fill="#fff" />
          <circle cx="62" cy="48" r="7" fill="#fff" />
          <circle cx="39" cy="49" r="3.5" fill={ink} />
          <circle cx="63" cy="49" r="3.5" fill={ink} />
        </>
      );
    case 2:
      return (
        <g fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round">
          <path d="M32 50 Q38 42 44 50" />
          <path d="M56 50 Q62 42 68 50" />
        </g>
      );
    case 3:
      return (
        <g stroke={ink} strokeWidth="3.5" strokeLinecap="round">
          <path d="M32 48 H44" />
          <path d="M56 48 H68" />
        </g>
      );
    case 4:
      return (
        <>
          <ellipse cx="38" cy="48" rx="4" ry="6" fill={ink} />
          <ellipse cx="62" cy="48" rx="4" ry="6" fill={ink} />
        </>
      );
    default:
      return (
        <g fill={ink}>
          <path
            d="M38 41 l2.5 5 5.5.8 -4 3.9 1 5.5 -5 -2.7 -5 2.7 1 -5.5 -4 -3.9 5.5 -.8z"
            transform="translate(-2 1) scale(.9)"
          />
          <path
            d="M62 41 l2.5 5 5.5.8 -4 3.9 1 5.5 -5 -2.7 -5 2.7 1 -5.5 -4 -3.9 5.5 -.8z"
            transform="translate(2 1) scale(.9)"
          />
        </g>
      );
  }
}

function Mouth({ i }: { i: number }) {
  const ink = '#1f2937';
  switch (i) {
    case 0:
      return <path d="M38 64 Q50 74 62 64" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />;
    case 1:
      return <path d="M36 62 Q50 80 64 62 Z" fill="#fff" stroke={ink} strokeWidth="3" strokeLinejoin="round" />;
    case 2:
      return <path d="M40 67 H60" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />;
    case 3:
      return <ellipse cx="50" cy="67" rx="7" ry="8" fill={ink} />;
    case 4:
      return (
        <>
          <path d="M38 63 Q50 74 62 63 Z" fill={ink} />
          <path d="M45 68 Q50 78 55 68 Z" fill="#f43f5e" />
        </>
      );
    default:
      return <path d="M40 67 Q52 70 62 62" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />;
  }
}

function Accessory({ i }: { i: number }) {
  switch (i) {
    case 1:
      return (
        <g fill="none" stroke="#111827" strokeWidth="3">
          <circle cx="38" cy="48" r="9" />
          <circle cx="62" cy="48" r="9" />
          <path d="M47 48 H53" />
        </g>
      );
    case 2:
      return (
        <g>
          <path d="M20 38 Q50 4 80 38 Z" fill="#ef4444" />
          <rect x="14" y="36" width="72" height="7" rx="3.5" fill="#b91c1c" />
        </g>
      );
    case 3:
      return (
        <g>
          <path d="M18 52 Q18 14 50 14 Q82 14 82 52" fill="none" stroke="#374151" strokeWidth="5" />
          <rect x="11" y="44" width="12" height="22" rx="6" fill="#4f46e5" />
          <rect x="77" y="44" width="12" height="22" rx="6" fill="#4f46e5" />
        </g>
      );
    case 4:
      return (
        <g>
          <path
            d="M26 30 L34 12 L44 26 L50 8 L56 26 L66 12 L74 30 Z"
            fill="#fbbf24"
            stroke="#d97706"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      );
    case 5:
      return (
        <g>
          <path d="M22 36 Q50 6 78 36 Q50 30 22 36Z" fill="#0ea5e9" />
          <circle cx="50" cy="12" r="5" fill="#fff" />
        </g>
      );
    default:
      return null;
  }
}

export const AvatarFace = memo(function AvatarFace({ parts }: { parts: AvatarParts }) {
  return (
    <>
      <rect width="100" height="100" fill={BG[parts.b]} />
      <Face i={parts.f} fill={SKIN[parts.s]!} />
      <Eyes i={parts.e} />
      <Mouth i={parts.m} />
      <Accessory i={parts.a} />
    </>
  );
});

export function Avatar({
  code,
  size = 64,
  rounded = 16,
  label,
}: {
  code: string;
  size?: number;
  rounded?: number;
  label?: string;
}) {
  const parts = parseAvatar(code) ?? parseAvatar(DEFAULT_AVATAR)!;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? 'avatar'}
      style={{ borderRadius: rounded, display: 'block', flex: 'none' }}
    >
      <AvatarFace parts={parts} />
    </svg>
  );
}

const KEY_LABEL: Record<AvatarKey, string> = {
  f: 'Face',
  s: 'Skin',
  e: 'Eyes',
  m: 'Mouth',
  a: 'Extra',
  b: 'Background',
};

export function AvatarBuilder({
  value,
  onChange,
  onRandomize,
}: {
  value: AvatarParts;
  onChange: (p: AvatarParts) => void;
  onRandomize: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Avatar code={encodeAvatar(value)} size={96} rounded={24} label="Your avatar" />
        <button type="button" className="btn btn-dark" onClick={onRandomize}>
          🎲 Randomise
        </button>
      </div>
      {(Object.keys(AVATAR_PARTS) as AvatarKey[]).map((k) => (
        <div key={k}>
          <div className="mb-1 text-sm font-semibold muted-on-dark">{KEY_LABEL[k]}</div>
          <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={KEY_LABEL[k]}>
            {Array.from({ length: AVATAR_PARTS[k] }, (_, n) => {
              const next = { ...value, [k]: n } as AvatarParts;
              const selected = value[k] === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${KEY_LABEL[k]} ${n + 1}`}
                  onClick={() => onChange(next)}
                  style={{
                    padding: 2,
                    borderRadius: 14,
                    background: 'transparent',
                    border: `3px solid ${selected ? '#fff' : 'transparent'}`,
                  }}
                >
                  <Avatar code={encodeAvatar(next)} size={44} rounded={10} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
