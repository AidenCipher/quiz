const enc = new TextEncoder();

export const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string): Uint8Array => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 24): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

export interface TicketClaims {
  pin: string;
  role: 'host' | 'screen';
  uid: string;
  exp: number; // epoch ms
}

/** Short-lived signed ticket: base64url(claims).base64url(hmac). */
export async function signTicket(claims: TicketClaims, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyTicket(ticket: string, secret: string): Promise<TicketClaims | null> {
  const [body, sig] = ticket.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as TicketClaims;
    return claims.exp > Date.now() ? claims : null;
  } catch {
    return null;
  }
}
