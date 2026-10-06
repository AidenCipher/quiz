import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';
import { NICKNAME_MAX, NICKNAME_MIN } from './constants';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** Starter transliterated Hindi/Kannada list; extend as needed. */
const EXTRA_BLOCKED = ['chutiya', 'madarchod', 'bhosdi', 'gaandu', 'bhenchod'];

export function isProfane(text: string): boolean {
  if (matcher.hasMatch(text)) return true;
  const squashed = text.toLowerCase().replace(/[^a-z]/g, '');
  return EXTRA_BLOCKED.some((w) => squashed.includes(w));
}

export function cleanNickname(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
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
