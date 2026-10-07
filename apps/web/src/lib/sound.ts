/** Tiny WebAudio synth so there are no audio assets to ship. */
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('qa:muted') === '1';
  } catch {
    return false;
  }
})();
let musicTimer: ReturnType<typeof setInterval> | null = null;

const audio = () => {
  if (!ctx) {
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, when = 0) {
  if (muted) return;
  const c = audio();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = c.currentTime + when;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('qa:muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (m) stopMusic();
}
export const sfx = {
  tick: () => tone(880, 0.08, 'square', 0.04),
  join: () => tone(660, 0.12, 'triangle', 0.06),
  go: () => {
    tone(523, 0.12, 'triangle');
    tone(784, 0.2, 'triangle', 0.08, 0.12);
  },
  reveal: () => {
    tone(392, 0.15, 'triangle');
    tone(494, 0.15, 'triangle', 0.08, 0.15);
    tone(659, 0.35, 'triangle', 0.08, 0.3);
  },
  flag: () => {
    tone(220, 0.18, 'sawtooth', 0.05);
    tone(185, 0.3, 'sawtooth', 0.05, 0.18);
  },
  /** A low "vine boom"-style thud: a short sine that drops in pitch (synthesised, not a recording). */
  boom: () => {
    if (muted) return;
    const c = audio();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    const t = c.currentTime;
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.65);
  },
  pop: () => tone(520, 0.09, 'triangle', 0.07),
  tumble: () => {
    tone(330, 0.14, 'triangle', 0.04);
    tone(294, 0.14, 'triangle', 0.04, 0.16);
    tone(262, 0.3, 'triangle', 0.04, 0.32);
  },
  fire: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.04, i * 0.07)),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, i * 0.14)),
};

export function startMusic() {
  if (musicTimer || muted) return;
  const notes = [262, 330, 392, 330, 294, 370, 440, 370];
  let i = 0;
  musicTimer = setInterval(() => {
    tone(notes[i++ % notes.length]!, 0.35, 'sine', 0.025);
  }, 420);
}
export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
