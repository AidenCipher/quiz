/** Avatar code, e.g. `f2-s4-e1-m3-a5-b2`: face, skin, eyes, mouth, accessory, background. */
export const AVATAR_PARTS = { f: 6, s: 6, e: 6, m: 6, a: 6, b: 6 } as const;
export type AvatarKey = keyof typeof AVATAR_PARTS;
const KEYS = Object.keys(AVATAR_PARTS) as AvatarKey[];
export type AvatarParts = Record<AvatarKey, number>;

export function encodeAvatar(p: AvatarParts): string {
  return KEYS.map((k) => `${k}${p[k]}`).join('-');
}

export function parseAvatar(code: string): AvatarParts | null {
  const m = /^f(\d)-s(\d)-e(\d)-m(\d)-a(\d)-b(\d)$/.exec(code);
  if (!m) return null;
  const parts = {} as AvatarParts;
  for (let i = 0; i < KEYS.length; i++) {
    const k = KEYS[i]!;
    const n = Number(m[i + 1]);
    if (n >= AVATAR_PARTS[k]) return null;
    parts[k] = n;
  }
  return parts;
}

export function randomAvatar(rand: () => number = Math.random): AvatarParts {
  const parts = {} as AvatarParts;
  for (const k of KEYS) parts[k] = Math.floor(rand() * AVATAR_PARTS[k]);
  return parts;
}

export const DEFAULT_AVATAR = 'f0-s0-e0-m0-a0-b0';
export const isValidAvatar = (code: string): boolean => parseAvatar(code) !== null;
