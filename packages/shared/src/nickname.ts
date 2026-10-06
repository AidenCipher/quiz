import { NICKNAME_MAX, NICKNAME_MIN } from './constants';

/**
 * Small, dependency-free word filter. Long stems are matched anywhere in the squashed text
 * (catches "f.u.c.k", "fuuuck"); short words only as whole tokens to avoid the Scunthorpe problem.
 * Extend the lists (including transliterated Hindi/Kannada) as needed.
 */
const STEMS = [
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'asshole',
  'whore',
  'slut',
  'nigg',
  'fagg',
  'retard',
  'rapist',
  'nazi',
  'pussy',
  'wanker',
  'twat',
  'porn',
  'chutiya',
  'madarchod',
  'bhosd',
  'gaandu',
  'bhenchod',
  'behenchod',
  'harami',
  'kutta',
  'kamine',
];
const WORDS = [
  'dick',
  'cunt',
  'cunts',
  'cock',
  'cocks',
  'ass',
  'sex',
  'fag',
  'rape',
  'tit',
  'tits',
  'cum',
  'anal',
  'hoe',
  'dildo',
  'lund',
  'randi',
  'gand',
  'bc',
  'mc',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

function squash(text: string): string {
  const mapped = text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[01345 7@$!]/g, (c) => LEET[c] ?? c);
  return mapped.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
}

export function isProfane(text: string): boolean {
  const tokens = text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9@$!]+/)
    .filter(Boolean)
    .map(squash);
  if (tokens.some((t) => WORDS.includes(t))) return true;
  const all = squash(text);
  const collapsedStems = STEMS.map(squash);
  return collapsedStems.some((w) => all.includes(w));
}

export function cleanNickname(raw: string): string {
  return raw
    .replace(/[\p{Cc}<>]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type NicknameCheck = { ok: true; nickname: string } | { ok: false; reason: 'length' | 'profane' };

export function checkNickname(raw: string): NicknameCheck {
  const nickname = cleanNickname(raw);
  const len = [...nickname].length;
  if (len < NICKNAME_MIN || len > NICKNAME_MAX) return { ok: false, reason: 'length' };
  if (isProfane(nickname)) return { ok: false, reason: 'profane' };
  return { ok: true, nickname };
}

/** Duplicate nicknames get a number suffix, staying within the max length. */
export function uniqueNickname(nickname: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((n) => n.toLowerCase()));
  if (!set.has(nickname.toLowerCase())) return nickname;
  for (let i = 2; i < 1000; i++) {
    const suffix = ` ${i}`;
    const base = [...nickname].slice(0, NICKNAME_MAX - suffix.length).join('');
    const candidate = base + suffix;
    if (!set.has(candidate.toLowerCase())) return candidate;
  }
  return nickname;
}
