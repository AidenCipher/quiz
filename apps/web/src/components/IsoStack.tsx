import { Avatar } from './Avatar';
import { Hoot } from './Hoot';

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

/**
 * CSS-3D version of the hero. Shown while the WebGL scene loads, and instead of it when WebGL is unavailable
 * or the person prefers reduced motion.
 */
export function IsoStack() {
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
            top: '22%',
            left: '20%',
            width: '58%',
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
            top: '16%',
            left: '20%',
            width: '58%',
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
      <div className="float" style={{ position: 'absolute', left: '-2%', bottom: '14%', ['--dur' as string]: '4.5s' }}>
        <Hoot mood="party" size={92} />
      </div>
    </div>
  );
}
