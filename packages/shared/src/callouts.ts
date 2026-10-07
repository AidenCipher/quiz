/**
 * Funny callouts shown on the projector and on phones: after each question a random player gets a spotlight line
 * that nods to a meme or vine, and every player who got it wrong or didn't answer gets their own.
 *
 * Rules for every line in the bank: kind to the person, about the answer (never about intelligence, looks or
 * background), no swearing, no real people. Memes and vines are named or alluded to in our own words; no clips,
 * images or song lyrics are reproduced.
 */

export type CalloutKind = 'wrong' | 'none' | 'fast' | 'streak' | 'allCorrect' | 'allWrong' | 'flag';
export type CalloutMood = 'happy' | 'shock' | 'sleepy' | 'sideeye' | 'proud' | 'party';
export type CalloutFx = 'boom' | 'tumbleweed' | 'confetti' | 'fire' | 'zzz' | 'rain';

export interface Callout {
  id: string;
  kind: CalloutKind;
  mood: CalloutMood;
  emoji: string;
  text: string;
  /** The meme or vine it nods to, shown as a small tag. */
  ref?: string;
  fx?: CalloutFx;
  playerId?: string;
  nickname?: string;
}

interface Line {
  text: string;
  emoji: string;
  mood: CalloutMood;
  ref?: string;
  fx?: CalloutFx;
}

const wrong: Line[] = [
  {
    text: 'Looked at the right answer and said “Road work ahead?” Not today, {name}.',
    emoji: '🚧',
    mood: 'sideeye',
    ref: 'Vine: Road Work Ahead',
    fx: 'boom',
  },
  {
    text: 'Surprised Pikachu face: {name}. (The correct answer is also surprised.)',
    emoji: '😮',
    mood: 'shock',
    ref: 'Meme: Surprised Pikachu',
    fx: 'boom',
  },
  {
    text: 'This is fine. {name}’s answer is fine. Everything is fine.',
    emoji: '🔥',
    mood: 'shock',
    ref: 'Meme: This Is Fine',
    fx: 'boom',
  },
  { text: 'And I oop— {name}!', emoji: '🫢', mood: 'shock', ref: 'Vine: And I Oop', fx: 'boom' },
  {
    text: 'VINE BOOM. {name}’s answer just hit the floor.',
    emoji: '💥',
    mood: 'shock',
    ref: 'Sound: Vine boom',
    fx: 'boom',
  },
  {
    text: '{name} said “what are those?” to the right answer and walked away.',
    emoji: '👟',
    mood: 'sideeye',
    ref: 'Vine: What Are Those?',
    fx: 'rain',
  },
  {
    text: 'Hide-the-pain {name}: smiling, while the answer key disagrees.',
    emoji: '😬',
    mood: 'sideeye',
    ref: 'Meme: Hide the Pain Harold',
  },
  {
    text: '{name} speedran a wrong answer. New personal best!',
    emoji: '⏱️',
    mood: 'happy',
    ref: 'Meme: Speedrun',
    fx: 'boom',
  },
  { text: 'Oof. {name}, that one stung a little.', emoji: '😵', mood: 'shock', ref: 'Sound: Roblox oof', fx: 'boom' },
  { text: 'Nobody: … {name}: confidently wrong.', emoji: '😎', mood: 'sideeye', ref: 'Meme: Nobody:', fx: 'rain' },
  { text: '{name} has entered the chat and left the correct answer behind.', emoji: '🚪', mood: 'sideeye' },
  { text: 'Bruh. {name}, probably, right now.', emoji: '😐', mood: 'sideeye', ref: 'Meme: Bruh' },
  { text: '{name}: “I know this one!” The quiz: “You really do not.”', emoji: '🙃', mood: 'sideeye', fx: 'rain' },
  { text: '{name} chose chaos. The answer key chose a different chaos.', emoji: '🌀', mood: 'shock' },
];

const none: Line[] = [
  { text: '{name} left the chat. Tumbleweed delivered.', emoji: '🌵', mood: 'sleepy', fx: 'tumbleweed' },
  {
    text: 'Why are you running, {name}? Oh. You just never answered.',
    emoji: '🏃',
    mood: 'sideeye',
    ref: 'Vine: Why Are You Running?',
    fx: 'tumbleweed',
  },
  {
    text: '“Look at all those chickens,” said {name}, ignoring the timer.',
    emoji: '🐔',
    mood: 'sleepy',
    ref: 'Vine: Look At All Those Chickens',
    fx: 'zzz',
  },
  { text: '{name} is buffering… Please hold.', emoji: '⏳', mood: 'sleepy', fx: 'zzz' },
  { text: '{name} saw the question and chose peace.', emoji: '☮️', mood: 'sleepy', fx: 'zzz' },
  {
    text: 'Still waiting on {name}. Imagine elevator music.',
    emoji: '🛗',
    mood: 'sleepy',
    ref: 'Meme: Elevator music',
    fx: 'zzz',
  },
  { text: '{name} is on Do Not Disturb.', emoji: '🔕', mood: 'sleepy', fx: 'zzz' },
  {
    text: '{name} dodged the question like a pro. Nope.',
    emoji: '🙈',
    mood: 'sideeye',
    ref: 'Meme: Nope',
    fx: 'tumbleweed',
  },
];

const fast: Line[] = [
  {
    text: '{name} answered before the question finished loading. Zoom zoom!',
    emoji: '🏎️',
    mood: 'proud',
    fx: 'confetti',
  },
  { text: 'Stonks. {name} is up a thousand points.', emoji: '📈', mood: 'proud', ref: 'Meme: Stonks', fx: 'confetti' },
  {
    text: 'Absolute cinema: {name}’s answer.',
    emoji: '🎬',
    mood: 'proud',
    ref: 'Meme: Absolute Cinema',
    fx: 'confetti',
  },
  { text: '{name} woke up and chose accuracy.', emoji: '☀️', mood: 'proud', fx: 'confetti' },
  { text: 'Big brain time: {name}.', emoji: '🧠', mood: 'party', ref: 'Meme: Big Brain', fx: 'confetti' },
  { text: '{name} is cooking. Somebody check the oven.', emoji: '🍳', mood: 'party', fx: 'confetti' },
  { text: 'Too easy for {name}. Bring harder questions.', emoji: '😎', mood: 'proud', fx: 'confetti' },
];

const streak: Line[] = [
  { text: '{name} is on FIRE: {streak} in a row! Call the fire department.', emoji: '🔥', mood: 'party', fx: 'fire' },
  {
    text: '{streak} in a row for {name}. Is that a cheat code? ↑↑↓↓←→←→BA',
    emoji: '🎮',
    mood: 'party',
    ref: 'Gaming: Konami code',
    fx: 'fire',
  },
  { text: '{name}’s streak: {streak}. The quiz is sweating.', emoji: '💦', mood: 'proud', fx: 'fire' },
];

const allCorrect: Line[] = [
  { text: 'Everyone got it right. This room is cracked.', emoji: '🤯', mood: 'party', fx: 'confetti' },
  { text: 'Unanimous! Even the owl is impressed.', emoji: '🦉', mood: 'party', fx: 'confetti' },
  {
    text: 'A perfect round. Nobody told the question it was supposed to be hard.',
    emoji: '🎉',
    mood: 'party',
    fx: 'confetti',
  },
];

const allWrong: Line[] = [
  {
    text: 'Nobody got that one. The question wins this round.',
    emoji: '🏆',
    mood: 'proud',
    ref: 'Meme: Nobody:',
    fx: 'boom',
  },
  { text: 'Plot twist: the whole room fell for it.', emoji: '🌪️', mood: 'shock', fx: 'rain' },
  { text: 'Class discussion time: what just happened?', emoji: '🧐', mood: 'sideeye', fx: 'boom' },
];

const flagBySeverity: Record<'minor' | 'moderate' | 'major', Line[]> = {
  minor: [
    {
      text: 'Distracted Boyfriend, but the quiz is {name}’s other tab.',
      emoji: '👀',
      mood: 'sideeye',
      ref: 'Meme: Distracted Boyfriend',
    },
    { text: '{name} looked away for a second… we saw that.', emoji: '👀', mood: 'sideeye' },
  ],
  moderate: [
    { text: 'Sir, this is a quiz. {name} left the tab.', emoji: '🫡', mood: 'sideeye' },
    { text: '{name} was acting sus.', emoji: '📮', mood: 'sideeye', ref: 'Meme: Sus' },
  ],
  major: [
    { text: 'Caught in 4K: {name}!', emoji: '📸', mood: 'shock', ref: 'Meme: Caught in 4K', fx: 'boom' },
    { text: '{name} has the whole room’s full attention. Congratulations?', emoji: '🔦', mood: 'shock', fx: 'boom' },
  ],
};

/** Shown on a phone the moment an answer is locked in (no names, nothing sent anywhere). */
export const LOCK_IN_QUIPS = [
  'Locked in. No take-backs. 🔒',
  'Bold choice. Let’s see… 👀',
  'Confidence level: unreasonable 😎',
  'The quiz gods have heard you.',
  'Calculated. Or guessed. We’ll find out.',
  'Sent! The owl is nervous. 🦉',
];

const BANK: Record<Exclude<CalloutKind, 'flag'>, Line[]> = { wrong, none, fast, streak, allCorrect, allWrong };

/* ---------------------------------------------------------------------- */
/* Randomness                                                              */
/* ---------------------------------------------------------------------- */

/** Deterministic PRNG so a reveal re-sent after a host action keeps the same callouts. */
export function seededRand(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(items: T[], rand: () => number): T => items[Math.floor(rand() * items.length)]!;

const fill = (text: string, vars: { name?: string; streak?: number }) =>
  text.replace('{name}', vars.name ?? 'Someone').replace('{streak}', String(vars.streak ?? 0));

function make(
  kind: CalloutKind,
  line: Line,
  id: string,
  vars: { name?: string; streak?: number; playerId?: string },
): Callout {
  return {
    id,
    kind,
    mood: line.mood,
    emoji: line.emoji,
    text: fill(line.text, vars),
    ref: line.ref,
    fx: line.fx,
    playerId: vars.playerId,
    nickname: vars.name,
  };
}

/** A flag quip, chosen when the flag is raised. Not deterministic: it is stored with the flag. */
export function flagCallout(
  severity: 'minor' | 'moderate' | 'major',
  name: string,
  playerId: string,
  flagId: string,
  rand: () => number = Math.random,
): Callout {
  return make('flag', pick(flagBySeverity[severity], rand), `flag-${flagId}`, { name, playerId });
}

/* ---------------------------------------------------------------------- */
/* Choosing who gets the spotlight                                         */
/* ---------------------------------------------------------------------- */

export type Outcome = 'right' | 'wrong' | 'none' | 'voided';
export interface PlayerOutcome {
  id: string;
  nickname: string;
  outcome: Outcome;
  /** Server-measured answer time for this question, if they answered. */
  tMs: number | null;
  streak: number;
}

export interface QuestionCallouts {
  /** One spotlight for the whole room (projector and phones). */
  spotlight: Callout | null;
  /** A line for everyone who got it wrong or didn't answer, plus streak holders. */
  personal: Map<string, Callout>;
}

/**
 * Pure and seeded: the same question outcome always gives the same callouts.
 * `avoid` holds players who were spotlighted recently, so the same person is not picked every round.
 */
export function computeCallouts(input: {
  seed: string;
  players: PlayerOutcome[];
  limitMs: number;
  avoid?: string[];
}): QuestionCallouts {
  const { seed, players, limitMs } = input;
  const avoid = new Set(input.avoid ?? []);
  const rand = seededRand(seed);
  const personal = new Map<string, Callout>();

  const rights = players.filter((p) => p.outcome === 'right');
  const wrongs = players.filter((p) => p.outcome === 'wrong');
  const nones = players.filter((p) => p.outcome === 'none');
  const counted = players.filter((p) => p.outcome !== 'voided');

  const forPlayer = (kind: Exclude<CalloutKind, 'flag'>, p: PlayerOutcome): Callout =>
    make(kind, pick(BANK[kind], seededRand(`${seed}:${p.id}:${kind}`)), `${seed}:${p.id}`, {
      name: p.nickname,
      streak: p.streak,
      playerId: p.id,
    });

  for (const p of wrongs) personal.set(p.id, forPlayer('wrong', p));
  for (const p of nones) personal.set(p.id, forPlayer('none', p));
  for (const p of rights) if (p.streak >= 3) personal.set(p.id, forPlayer('streak', p));

  // Group moments beat individual ones when they apply.
  if (counted.length >= 3 && counted.every((p) => p.outcome === 'right')) {
    return { spotlight: make('allCorrect', pick(BANK.allCorrect, rand), `${seed}:all`, {}), personal };
  }
  if (counted.length >= 3 && counted.every((p) => p.outcome === 'wrong' || p.outcome === 'none')) {
    return { spotlight: make('allWrong', pick(BANK.allWrong, rand), `${seed}:all`, {}), personal };
  }

  const fresh = <T extends PlayerOutcome>(list: T[]) => {
    const notRecent = list.filter((p) => !avoid.has(p.id));
    return notRecent.length ? notRecent : list;
  };
  const fastRights = rights.filter((p) => p.tMs !== null && p.tMs < limitMs * 0.4);
  const streakers = rights.filter((p) => p.streak >= 3);

  type Option = { kind: Exclude<CalloutKind, 'flag'>; weight: number; pool: PlayerOutcome[] };
  const options: Option[] = (
    [
      { kind: 'wrong', weight: 4, pool: wrongs },
      { kind: 'none', weight: 3, pool: nones },
      { kind: 'fast', weight: 3, pool: fastRights },
      { kind: 'streak', weight: 2, pool: streakers },
    ] as Option[]
  ).filter((o) => o.pool.length > 0);
  if (!options.length) return { spotlight: null, personal };

  let roll = rand() * options.reduce((n, o) => n + o.weight, 0);
  const chosen = options.find((o) => (roll -= o.weight) < 0) ?? options[options.length - 1]!;
  const who = pick(fresh(chosen.pool), rand);
  const spotlight = personal.get(who.id)?.kind === chosen.kind ? personal.get(who.id)! : forPlayer(chosen.kind, who);
  personal.set(who.id, spotlight);
  return { spotlight, personal };
}

export const CALLOUT_BANK_SIZE =
  Object.values(BANK).reduce((n, l) => n + l.length, 0) +
  Object.values(flagBySeverity).reduce((n, l) => n + l.length, 0);

/** Exposed for tests: every line, so they can be checked for tone and shape. */
export const ALL_LINES: { kind: CalloutKind; line: Line }[] = [
  ...(Object.entries(BANK) as [Exclude<CalloutKind, 'flag'>, Line[]][]).flatMap(([kind, lines]) =>
    lines.map((line) => ({ kind, line })),
  ),
  ...Object.values(flagBySeverity).flatMap((lines) => lines.map((line) => ({ kind: 'flag' as const, line }))),
];
