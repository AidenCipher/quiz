import { demoCallout, type Callout } from '@quiz/shared/callouts';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { HeroSceneControls } from '../3d/HeroScene';
import type { HomeFx } from '../3d/homeFx';
import { CalloutFx, CalloutSticker } from '../components/CalloutSticker';
import { Footer, SkipLink } from '../components/Chrome';
import { Hoot } from '../components/Hoot';
import { IsoStack } from '../components/IsoStack';
import { Owl } from '../components/Detective';
import { sfx } from '../lib/sound';

const HeroScene = lazy(() => import('../3d/HeroScene'));

const GRADIENT = ['#ffd23f', '#ffb347', '#ff8ac2', '#e49cff', '#c9a0ff'];

/**
 * Splits text into words and letters so each letter can be animated; the full text stays available to screen readers.
 * With `gradient`, each letter gets its own colour from the gradient (background-clip text breaks on transformed children).
 */
function SplitText({ text, gradient }: { text: string; gradient?: boolean }) {
  const letters = [...text.replace(/ /g, '')].length;
  let n = 0;
  return (
    <span aria-hidden="true">
      {text.split(' ').map((word, w) => (
        <span key={w} style={{ display: 'inline-block', whiteSpace: 'nowrap', marginRight: '0.25em' }}>
          {[...word].map((c, i) => {
            const t = letters > 1 ? n++ / (letters - 1) : 0;
            const color = gradient
              ? GRADIENT[Math.min(GRADIENT.length - 1, Math.round(t * (GRADIENT.length - 1)))]
              : undefined;
            return (
              <span key={i} data-ch={gradient ? 'g' : ''} style={{ display: 'inline-block', color }}>
                {c}
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
}

const STEPS = [
  {
    n: '1',
    title: 'Scan the code',
    body: 'The host puts a QR code on the big screen. Point any phone at it. No app, no account.',
    emoji: '📱',
    bg: 'var(--mint)',
    tilt: -2,
  },
  {
    n: '2',
    title: 'Build your face',
    body: 'Pick a nickname and mix an owl-approved avatar. Your phone is now a game controller.',
    emoji: '🎭',
    bg: 'var(--lilac)',
    tilt: 1.5,
  },
  {
    n: '3',
    title: 'Battle on the big screen',
    body: 'Tap ▲ ◆ ● ■ before the timer runs out. Fast and right scores the most.',
    emoji: '⚡',
    bg: 'var(--sun)',
    tilt: -1,
  },
];

interface Sticker {
  id: number;
  callout: Callout;
  left: number;
  top: number;
}

export default function Home() {
  const nav = useNavigate();
  const [pin, setPin] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const fx = useRef<HomeFx | null>(null);
  const hero = useRef<HeroSceneControls | null>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [heroCallout, setHeroCallout] = useState<Callout | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({ id: i, callout: demoCallout(), left: 4 + i * 22, top: 8 + (i % 2) * 34 })),
  );
  const nextId = useRef(4);
  const authFailed = new URLSearchParams(location.search).get('auth') === 'failed';

  // Start the animation layer after first paint. If it fails or is slow, never leave content hidden.
  const [waiting, setWaiting] = useState(!reduced);
  useEffect(() => {
    if (reduced || !root.current) return;
    let alive = true;
    const failsafe = setTimeout(() => setWaiting(false), 2500);
    void import('../3d/homeFx')
      .then((m) => {
        if (!alive || !root.current) return;
        fx.current = m.initHomeFx(root.current);
        setWaiting(false);
      })
      .catch(() => setWaiting(false));
    return () => {
      alive = false;
      clearTimeout(failsafe);
      fx.current?.cleanup();
      fx.current = null;
    };
  }, [reduced]);

  const roast = useCallback(() => {
    const c = demoCallout();
    setHeroCallout(c);
    hero.current?.poke();
    if (c.kind === 'wrong' || c.fx === 'boom') sfx.boom();
    else if (c.kind === 'none') sfx.tumble();
    else if (c.kind === 'streak') sfx.fire();
    else sfx.pop();
  }, []);

  const addSticker = () => {
    sfx.pop();
    setStickers((cur) => [
      ...cur.slice(-9),
      { id: nextId.current++, callout: demoCallout(), left: 10 + Math.random() * 55, top: 6 + Math.random() * 55 },
    ]);
  };

  const tilt = (e: React.PointerEvent) => {
    // CSS fallback stack parallax (the WebGL scene does its own).
    if (e.pointerType !== 'mouse' || reduced) return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--rx', `${(-((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(2)}deg`);
    el.style.setProperty('--rz', `${(((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(2)}deg`);
  };

  return (
    <div
      ref={root}
      className={`wallpaper ${waiting ? 'fx-wait' : ''}`}
      style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <SkipLink />
      <div
        className="page"
        style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(28px, 6vw, 72px)', maxWidth: 1240 }}
      >
        {/* ---------------- hero ---------------- */}
        <div
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
          <header className="reveal" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            <a href="#how" className="hide-sm" style={{ color: 'var(--on-stage-muted)', fontWeight: 700 }}>
              How it works
            </a>
            <Link to="/trust" className="hide-sm" style={{ color: 'var(--on-stage-muted)', fontWeight: 700 }}>
              Fair play
            </Link>
            <Link to="/host" className="btn btn-primary" style={{ minHeight: 42 }} data-magnetic>
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
              <span className="chip reveal" style={{ color: 'var(--mint)', width: 'fit-content' }}>
                <span aria-hidden="true">✨</span> Live quiz for classrooms &amp; game nights
              </span>
              <h1
                className="display"
                aria-label="Quiz night, but make it chaos."
                data-split
                style={{ fontSize: 'clamp(40px, 7.4vw, 84px)', margin: 0, lineHeight: 0.98 }}
              >
                <SplitText text="Quiz night, but make it" /> <SplitText text="chaos." gradient />
              </h1>
              <p
                className="reveal"
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
                className="reveal"
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
                <button className="btn btn-primary btn-lg" disabled={pin.length !== 6} type="submit" data-magnetic>
                  Join game
                </button>
              </form>
              <ul
                className="reveal"
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}
              >
                {['No app to install', 'No sign-up for players', 'Free'].map((t) => (
                  <li key={t} className="chip" style={{ color: 'var(--on-stage-muted)' }}>
                    <span aria-hidden="true">✓</span> {t}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ position: 'relative' }}>
              <Suspense fallback={<IsoStack />}>
                <HeroScene onOwlClick={roast} controls={hero} />
              </Suspense>
              {heroCallout && (
                <div
                  key={heroCallout.id}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <CalloutSticker callout={heroCallout} size="home" showHoot={false} tilt={-2} />
                  <CalloutFx callout={heroCallout} />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                <button className="btn btn-dark" onClick={roast} data-magnetic>
                  <span aria-hidden="true">🦉</span> Roast someone
                </button>
              </div>
            </div>
          </main>
        </div>

        {/* ---------------- how it works ---------------- */}
        <section id="how" aria-labelledby="how-title" style={{ perspective: 1200 }}>
          <h2
            id="how-title"
            className="display"
            style={{ fontSize: 'clamp(30px, 5vw, 56px)', margin: '0 0 clamp(16px, 3vw, 28px)', maxWidth: 640 }}
          >
            Three steps.{' '}
            <span
              style={{
                background: 'var(--ink)',
                color: 'var(--sun)',
                padding: '0 12px',
                borderRadius: 14,
                display: 'inline-block',
                transform: 'rotate(-2deg)',
              }}
            >
              Zero homework.
            </span>
          </h2>
          <ol
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
              gap: 'clamp(14px, 3vw, 28px)',
              alignItems: 'start',
            }}
          >
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                className="step-card card"
                style={{
                  background: s.bg,
                  padding: 'clamp(16px, 3vw, 26px)',
                  marginTop: i === 1 ? 'clamp(0px, 3vw, 36px)' : 0,
                  rotate: `${s.tilt}deg`,
                  color: 'var(--ink)',
                  transformStyle: 'preserve-3d',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="display" style={{ fontSize: 64, lineHeight: 1 }} aria-hidden="true">
                    {s.n}
                  </span>
                  <span style={{ fontSize: 44 }} aria-hidden="true">
                    {s.emoji}
                  </span>
                </div>
                <h3 style={{ fontSize: 26, margin: '8px 0 6px' }}>{s.title}</h3>
                <p style={{ margin: 0, fontWeight: 600 }}>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------- the callouts playground ---------------- */}
        <section
          aria-labelledby="co-title"
          className="glass"
          style={{ borderRadius: 'clamp(24px, 4vw, 40px)', padding: 'clamp(16px, 3vw, 32px)', color: 'var(--ink)' }}
        >
          <div
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'flex-end',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ maxWidth: 560 }}>
              <h2 id="co-title" className="display" style={{ fontSize: 'clamp(28px, 4.6vw, 52px)', margin: 0 }}>
                Every round, the owl picks someone.{' '}
                <span style={{ textDecoration: 'underline wavy var(--lilac-deep)', textUnderlineOffset: 6 }}>
                  Kindly.
                </span>
              </h2>
              <p style={{ margin: '10px 0 0', fontWeight: 600 }}>
                Wrong answer? No answer? Streak? The big screen gets a meme-powered callout. Drag the stickers around:
                they have momentum.
              </p>
            </div>
            <button className="btn btn-primary btn-lg" onClick={addSticker} data-magnetic>
              Roast another
            </button>
          </div>
          <div
            ref={zone}
            className="sticker-zone"
            aria-label="Sample callouts you can drag around"
            role="group"
            style={{
              position: 'relative',
              minHeight: 'clamp(360px, 52vw, 460px)',
              marginTop: 20,
              borderRadius: 24,
              border: '2.5px dashed rgba(26,16,51,0.4)',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.3)',
            }}
          >
            {stickers.map((st) => (
              <div
                key={st.id}
                ref={(el) => {
                  if (el && !el.dataset.dragging) {
                    el.dataset.dragging = '1';
                    if (zone.current) fx.current?.drag(el, zone.current);
                  }
                }}
                className="sticker-drag"
                style={{
                  position: 'absolute',
                  left: `${st.left}%`,
                  top: `${st.top}%`,
                  width: 'min(78%, 330px)',
                  touchAction: 'none',
                  cursor: 'grab',
                  zIndex: 2,
                }}
              >
                <CalloutSticker callout={st.callout} size="home" showHoot={false} tilt={st.id % 2 ? 2 : -2} />
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- fair play ---------------- */}
        <section
          aria-labelledby="fair-title"
          className="card"
          style={{
            background: 'var(--sky)',
            padding: 'clamp(16px, 4vw, 36px)',
            display: 'flex',
            gap: 'clamp(12px, 3vw, 32px)',
            alignItems: 'center',
            flexWrap: 'wrap',
            color: 'var(--ink)',
          }}
        >
          <div data-parallax="-8" className="wobble" style={{ flex: 'none' }}>
            <Owl severity="major" size={140} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 id="fair-title" className="display" style={{ fontSize: 'clamp(26px, 4vw, 42px)', margin: 0 }}>
              Switch tabs and the detective owl shows up.
            </h2>
            <p style={{ margin: '8px 0 14px', fontWeight: 600 }}>
              Questions only appear on the big screen, scores are kept by the server, and every flag is visible and
              fixable by the host.
            </p>
            <Link to="/trust" className="btn" data-magnetic>
              How fair play works
            </Link>
          </div>
        </section>
      </div>

      <div style={{ paddingBottom: 8, marginTop: 'clamp(16px, 4vw, 40px)' }}>
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
