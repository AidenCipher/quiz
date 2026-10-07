import type { Callout } from '@quiz/shared/callouts';
import { useEffect, useMemo } from 'react';
import { Hoot } from './Hoot';

type Size = 'stage' | 'phone' | 'home';
const SIZES: Record<Size, { font: number; emoji: number; hoot: number; pad: string; max: number }> = {
  stage: { font: 46, emoji: 84, hoot: 150, pad: '22px 30px', max: 1000 },
  phone: { font: 19, emoji: 34, hoot: 64, pad: '12px 16px', max: 420 },
  home: { font: 17, emoji: 30, hoot: 56, pad: '10px 14px', max: 340 },
};
const kindClass = (c: Callout) =>
  c.kind === 'wrong' || c.kind === 'allWrong'
    ? 's-wrong'
    : c.kind === 'none'
      ? 's-none'
      : c.kind === 'flag'
        ? 's-flag'
        : 's-win';

/** The funny callout as a slapped-on sticker with Hoot reacting beside it. */
export function CalloutSticker({
  callout,
  size = 'phone',
  tilt = -3,
  showHoot = true,
}: {
  callout: Callout;
  size?: Size;
  tilt?: number;
  showHoot?: boolean;
}) {
  const s = SIZES[size];
  return (
    <div
      role="status"
      style={{ display: 'flex', alignItems: 'flex-end', gap: size === 'stage' ? 18 : 8, maxWidth: s.max }}
    >
      {showHoot && (
        <div className="pop-spring" style={{ flex: 'none', marginBottom: -6 }}>
          <Hoot mood={callout.mood} size={s.hoot} />
        </div>
      )}
      <div
        className={`sticker ${kindClass(callout)}`}
        style={{ ['--tilt' as string]: `${tilt}deg`, padding: s.pad, maxWidth: s.max }}
      >
        <div style={{ display: 'flex', gap: size === 'stage' ? 18 : 10, alignItems: 'center' }}>
          <span aria-hidden="true" style={{ fontSize: s.emoji, lineHeight: 1, flex: 'none' }}>
            {callout.emoji}
          </span>
          <div>
            <div
              className="display"
              style={{ fontSize: s.font, lineHeight: 1.12, fontWeight: 800, letterSpacing: '-0.02em' }}
            >
              {callout.text}
            </div>
            {callout.ref && (
              <span className="ref" style={{ fontSize: Math.max(11, s.font * 0.42) }}>
                {callout.ref}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const TUMBLEWEED = (
  <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
    <g fill="none" stroke="#6b4a2b" strokeWidth="4" strokeLinecap="round">
      <circle cx="50" cy="50" r="38" />
      <path d="M14 38 Q50 70 86 36 M20 70 Q52 30 82 66 M50 12 Q30 52 52 88 M32 20 Q76 46 36 82 M68 18 Q28 54 70 84" />
    </g>
  </svg>
);

/**
 * Full-screen effect for a callout: a shock ring, a rolling tumbleweed, floating zzz, flames or emoji rain.
 * Everything is CSS, pointer-transparent, and hidden for reduced-motion users (the sticker still shows).
 */
export function CalloutFx({ callout, big = false }: { callout: Callout; big?: boolean }) {
  const fx = callout.fx;
  const bits = useMemo(
    () =>
      Array.from({ length: fx === 'rain' ? 16 : fx === 'fire' ? 12 : 0 }, (_, i) => ({
        left: `${(i * 97) % 100}%`,
        fall: 2.4 + ((i * 37) % 18) / 10,
        delay: ((i * 53) % 12) / 10,
        spin: (i % 2 ? 1 : -1) * (180 + ((i * 41) % 360)),
        size: (big ? 54 : 28) + ((i * 29) % 20),
      })),
    [fx, big, callout.id],
  );
  useEffect(() => {
    if (!fx) return;
    document.documentElement.classList.add('fx-shake');
    const t = setTimeout(() => document.documentElement.classList.remove('fx-shake'), 560);
    return () => {
      clearTimeout(t);
      document.documentElement.classList.remove('fx-shake');
    };
  }, [fx, callout.id]);
  if (!fx) return null;
  return (
    <div className="fx-layer" aria-hidden="true">
      {fx === 'boom' && (
        <>
          <div className="shock-ring" style={{ inset: '30% 30%' }} />
          <div className="shock-ring" style={{ inset: '30% 30%', animationDelay: '120ms' }} />
        </>
      )}
      {fx === 'tumbleweed' && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: big ? 40 : 20,
            width: big ? 160 : 70,
            height: big ? 160 : 70,
            animation: `tumble ${big ? 4.5 : 3.5}s linear both`,
          }}
        >
          {TUMBLEWEED}
        </div>
      )}
      {fx === 'zzz' && (
        <div
          style={{
            position: 'absolute',
            left: big ? 290 : 90,
            bottom: big ? 220 : 90,
            fontFamily: 'var(--display)',
            fontWeight: 800,
            fontSize: big ? 70 : 30,
            color: '#fff',
          }}
        >
          {['z', 'Z', 'z'].map((z, i) => (
            <span
              key={i}
              style={{ position: 'absolute', animation: `zzz 2.6s ease-out ${i * 0.7}s infinite`, left: i * 22 }}
            >
              {z}
            </span>
          ))}
        </div>
      )}
      {(fx === 'rain' || fx === 'fire') &&
        bits.map((b, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: b.left,
              fontSize: b.size,
              animation: `emoji-rain ${b.fall}s linear ${b.delay}s both`,
              ['--spin' as string]: `${b.spin}deg`,
            }}
          >
            {fx === 'fire' ? '🔥' : callout.emoji}
          </span>
        ))}
    </div>
  );
}
