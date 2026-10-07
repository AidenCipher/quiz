import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Footer, SkipLink } from '../components/Chrome';
import { Hoot } from '../components/Hoot';

const SHAPES: { glyph: string; bg: string; style: React.CSSProperties }[] = [
  {
    glyph: '▲',
    bg: 'var(--tile-a)',
    style: { left: '2%', top: '14%', ['--r' as string]: '-12deg', ['--dur' as string]: '5.5s' },
  },
  {
    glyph: '◆',
    bg: 'var(--tile-b)',
    style: { right: '3%', top: '6%', ['--r' as string]: '14deg', ['--dur' as string]: '6.5s' },
  },
  {
    glyph: '●',
    bg: 'var(--tile-c)',
    style: { left: '8%', bottom: '4%', ['--r' as string]: '8deg', ['--dur' as string]: '7s' },
  },
  {
    glyph: '■',
    bg: 'var(--tile-d)',
    style: { right: '8%', bottom: '8%', ['--r' as string]: '-10deg', ['--dur' as string]: '6s' },
  },
];

/** Decorative isometric stack: the question, the answer tiles and the leaderboard, floating in 3D. */
function IsoStack() {
  return (
    <div className="iso-wrap" aria-hidden="true">
      <div className="iso-stack">
        <div className="iso-shadow" />
        <div
          className="iso-card glass-dark"
          style={{ ['--z' as string]: '0px', ['--dur' as string]: '7s', top: '26%', left: '20%', width: '58%' }}
        >
          <div
            style={{
              fontFamily: 'var(--display)',
              fontWeight: 800,
              fontSize: 'clamp(11px, 1.4vw, 16px)',
              marginBottom: 8,
            }}
          >
            Leaderboard
          </div>
          {[
            ['f1-s1-e1-m1-a4-b1', 'Riya', '3,840'],
            ['f2-s3-e2-m0-a1-b3', 'Dev', '3,120'],
            ['f0-s4-e4-m2-a2-b0', 'Asha', '2,905'],
          ].map(([code, name, score], i) => (
            <div
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 0',
                fontWeight: 750,
                fontSize: 'clamp(10px, 1.2vw, 14px)',
              }}
            >
              <span style={{ width: 14 }}>{i + 1}</span>
              <Avatar code={code!} size={26} rounded={8} />
              <span style={{ flex: 1 }}>{name}</span>
              <span>{score}</span>
            </div>
          ))}
        </div>
        <div
          className="iso-card"
          style={{
            ['--z' as string]: '60px',
            ['--dur' as string]: '6s',
            ['--delay' as string]: '-2s',
            top: '14%',
            left: '10%',
            width: '66%',
            background: 'rgba(255,255,255,0.14)',
            border: '1.5px solid rgba(255,255,255,0.4)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['▲', '◆', '●', '■'].map((g, i) => (
              <div
                key={g}
                className={`tile tile-${i}`}
                style={{
                  padding: '10px 12px',
                  fontSize: 'clamp(14px, 2vw, 22px)',
                  justifyContent: 'center',
                  ['--edge' as string]: '#0a0418',
                  boxShadow: '0 5px 0 #0a0418',
                }}
              >
                {g}
              </div>
            ))}
          </div>
        </div>
        <div
          className="iso-card"
          style={{
            ['--z' as string]: '120px',
            ['--dur' as string]: '5s',
            ['--delay' as string]: '-1s',
            top: '0%',
            left: '4%',
            width: '70%',
            background: '#fff',
            color: 'var(--ink)',
            border: '3px solid #0a0418',
            boxShadow: '0 6px 0 #0a0418',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--display)',
              fontWeight: 800,
              fontSize: 'clamp(12px, 1.7vw, 20px)',
              lineHeight: 1.1,
            }}
          >
            Which planet is known as the Red Planet?
          </div>
          <div
            style={{ marginTop: 8, fontWeight: 750, fontSize: 'clamp(10px, 1.1vw, 13px)', color: 'var(--ink-muted)' }}
          >
            Question 3 of 15 · 14s
          </div>
        </div>
      </div>
      {SHAPES.map((s) => (
        <div
          key={s.glyph}
          className="float"
          style={{
            position: 'absolute',
            width: 'clamp(38px, 6vw, 62px)',
            height: 'clamp(38px, 6vw, 62px)',
            display: 'grid',
            placeItems: 'center',
            background: s.bg,
            border: '3px solid #0a0418',
            borderRadius: 18,
            boxShadow: '0 6px 0 #0a0418',
            fontWeight: 800,
            fontSize: 'clamp(20px, 3vw, 30px)',
            color: 'var(--ink)',
            ...s.style,
          }}
        >
          {s.glyph}
        </div>
      ))}
      <div
        className="sticker s-wrong"
        style={{
          position: 'absolute',
          right: '2%',
          bottom: '24%',
          ['--tilt' as string]: '5deg',
          fontSize: 'clamp(11px, 1.4vw, 15px)',
          fontWeight: 800,
          maxWidth: '44%',
          padding: '8px 12px',
          animationDelay: '0.6s',
        }}
      >
        Surprised Pikachu face: Dev 💥
      </div>
      <div className="float" style={{ position: 'absolute', left: '-2%', bottom: '14%', ['--dur' as string]: '4.5s' }}>
        <Hoot mood="party" size={92} />
      </div>
    </div>
  );
}

export default function Home() {
  const nav = useNavigate();
  const [pin, setPin] = useState('');
  const heroRef = useRef<HTMLDivElement>(null);
  const authFailed = new URLSearchParams(location.search).get('auth') === 'failed';

  /** Pointer parallax for the 3D stack; skipped on touch and for reduced motion. */
  const tilt = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = heroRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    heroRef.current?.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
    heroRef.current?.style.setProperty('--rz', `${(x * 10).toFixed(2)}deg`);
  };

  return (
    <div className="wallpaper" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SkipLink />
      <div className="page" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1240 }}>
        <div
          ref={heroRef}
          onPointerMove={tilt}
          className="glass-dark"
          style={{
            borderRadius: 'clamp(24px, 4vw, 40px)',
            padding: 'clamp(16px, 3vw, 32px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(14px, 3vw, 28px)',
            overflow: 'hidden',
          }}
        >
          <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link
              to="/"
              style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none' }}
              aria-label="Quiz Arena home"
            >
              <Hoot size={40} />
              <span className="display" style={{ fontSize: 24 }}>
                Quiz Arena
              </span>
            </Link>
            <span style={{ flex: 1 }} />
            <Link to="/trust" className="hide-sm" style={{ color: 'var(--on-stage-muted)', fontWeight: 700 }}>
              Fair play
            </Link>
            <Link to="/host" className="btn btn-primary" style={{ minHeight: 42 }}>
              Host a quiz
            </Link>
          </header>

          <main
            id="main"
            tabIndex={-1}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
              gap: 'clamp(16px, 4vw, 40px)',
              alignItems: 'center',
            }}
          >
            <div className="stack-sm" style={{ gap: 18 }}>
              <span className="chip" style={{ color: 'var(--mint)', width: 'fit-content' }}>
                <span aria-hidden="true">✨</span> Live quiz for classrooms &amp; game nights
              </span>
              <h1 className="display" style={{ fontSize: 'clamp(40px, 7.4vw, 84px)', margin: 0, lineHeight: 0.98 }}>
                Quiz night, but make it <span className="gradient-text">chaos.</span>
              </h1>
              <p
                style={{ margin: 0, fontSize: 'clamp(16px, 2vw, 19px)', color: 'var(--on-stage-muted)', maxWidth: 520 }}
              >
                Scan a code, pick a face, and battle your friends on the big screen. Fast rounds, fair play, and a host
                owl who has opinions about your answers.
              </p>
              {authFailed && (
                <div
                  role="alert"
                  style={{
                    background: '#ffd0d6',
                    color: 'var(--ink)',
                    borderRadius: 14,
                    padding: 10,
                    border: '2.5px solid #0a0418',
                  }}
                >
                  Google sign-in didn't complete. Please try again.
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (/^\d{6}$/.test(pin)) nav(`/j/${pin}`);
                }}
                style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}
              >
                <label htmlFor="pin" className="sr-only">
                  Game PIN
                </label>
                <input
                  id="pin"
                  className="input input-dark"
                  style={{
                    maxWidth: 230,
                    minHeight: 58,
                    fontSize: 24,
                    textAlign: 'center',
                    letterSpacing: 6,
                    fontWeight: 800,
                    borderRadius: 999,
                  }}
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="Game PIN"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <button className="btn btn-primary btn-lg" disabled={pin.length !== 6} type="submit">
                  Join the game
                </button>
              </form>
              <ul style={{ display: 'flex', gap: 8, flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
                {['No app to install', 'No sign-up for players', 'Free'].map((t) => (
                  <li key={t} className="chip" style={{ color: 'var(--on-stage-muted)' }}>
                    <span aria-hidden="true">✓</span> {t}
                  </li>
                ))}
              </ul>
            </div>
            <IsoStack />
          </main>
        </div>
      </div>
      <div style={{ paddingBottom: 8 }}>
        <div
          className="glass"
          style={{ margin: '0 auto', width: 'fit-content', maxWidth: '94vw', borderRadius: 24, color: 'var(--ink)' }}
        >
          <Footer />
        </div>
      </div>
    </div>
  );
}
