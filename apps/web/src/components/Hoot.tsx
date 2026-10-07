export type HootMood = 'happy' | 'shock' | 'sleepy' | 'sideeye' | 'proud' | 'party';

const INK = '#1a1033';

/**
 * Hoot, the quiz host owl: an original character drawn for this app. Moods match the callouts
 * (shocked at a wrong answer, asleep when someone doesn't answer, side-eye at a flag, proud of a streak).
 */
export function Hoot({ mood = 'happy', size = 120, title }: { mood?: HootMood; size?: number; title?: string }) {
  const eyeY = 62;
  const pupil = mood === 'shock' ? 3.2 : 6;
  const shift = mood === 'sideeye' ? 5 : 0;
  const closed = mood === 'sleepy' || mood === 'proud';
  return (
    <svg
      viewBox="0 0 120 130"
      width={size}
      height={size * (130 / 120)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* ears + body */}
      <path d="M26 34 L18 10 L44 24 Z" fill="#a974f0" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M94 34 L102 10 L76 24 Z" fill="#a974f0" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <ellipse cx="60" cy="74" rx="44" ry="46" fill="#c9a0ff" stroke={INK} strokeWidth="4.5" />
      <ellipse cx="60" cy="94" rx="26" ry="26" fill="#bff5c3" stroke={INK} strokeWidth="3.5" />
      {/* wings */}
      <path d="M17 78 Q4 96 20 110 Q24 94 26 82 Z" fill="#a974f0" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <path
        d="M103 78 Q116 96 100 110 Q96 94 94 82 Z"
        fill="#a974f0"
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* party hat */}
      {mood === 'party' && (
        <g>
          <path d="M44 28 L60 -2 L76 28 Z" fill="#ffd23f" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <circle cx="60" cy="-2" r="5" fill="#ff6b81" stroke={INK} strokeWidth="3" />
        </g>
      )}
      {/* eyes */}
      {closed ? (
        <g fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round">
          <path d={mood === 'proud' ? 'M36 66 Q44 54 52 66' : 'M36 62 Q44 70 52 62'} />
          <path d={mood === 'proud' ? 'M68 66 Q76 54 84 66' : 'M68 62 Q76 70 84 62'} />
        </g>
      ) : (
        <g>
          <circle cx="44" cy={eyeY} r="14" fill="#fff" stroke={INK} strokeWidth="4" />
          <circle cx="76" cy={eyeY} r="14" fill="#fff" stroke={INK} strokeWidth="4" />
          <circle cx={44 + shift} cy={eyeY} r={pupil} fill={INK} />
          <circle cx={76 + shift} cy={eyeY} r={pupil} fill={INK} />
        </g>
      )}
      {/* brows */}
      {mood === 'sideeye' && (
        <g stroke={INK} strokeWidth="4.5" strokeLinecap="round">
          <path d="M30 46 L54 52" />
          <path d="M90 46 L66 52" />
        </g>
      )}
      {mood === 'shock' && (
        <g stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none">
          <path d="M32 40 Q44 32 54 40" />
          <path d="M66 40 Q76 32 88 40" />
        </g>
      )}
      {/* beak */}
      {mood === 'shock' ? (
        <ellipse cx="60" cy="86" rx="8" ry="10" fill="#ff8a3d" stroke={INK} strokeWidth="3.5" />
      ) : (
        <path d="M51 78 L69 78 L60 92 Z" fill="#ffd23f" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      )}
      {mood === 'shock' && <path d="M104 40 q6 8 0 14 q-6 -6 0 -14z" fill="#5ac8fa" stroke={INK} strokeWidth="2.5" />}
      {mood === 'sleepy' && (
        <g fill={INK} fontWeight="800" fontFamily="Bricolage Grotesque Variable, sans-serif">
          <text x="92" y="30" fontSize="16">
            z
          </text>
          <text x="102" y="16" fontSize="12">
            z
          </text>
        </g>
      )}
      {mood === 'proud' && (
        <g fill="#ffd23f" stroke={INK} strokeWidth="2">
          <path d="M100 30 l3 7 7 1 -5 5 1 7 -6 -4 -6 4 1 -7 -5 -5 7 -1z" />
        </g>
      )}
    </svg>
  );
}
