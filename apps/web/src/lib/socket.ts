import type { ClientMsg, ServerMsg } from '@quiz/shared/protocol';
import { useGame } from './store';

export interface PlayerIdentity {
  playerId?: string;
  token?: string;
  nickname: string;
  avatar: string;
}

const idKey = (pin: string) => `qa:player:${pin}`;
export const loadIdentity = (pin: string): PlayerIdentity | null => {
  try {
    return JSON.parse(localStorage.getItem(idKey(pin)) ?? 'null');
  } catch {
    return null;
  }
};
export const saveIdentity = (pin: string, id: PlayerIdentity) => {
  try {
    localStorage.setItem(idKey(pin), JSON.stringify(id));
  } catch {
    /* private mode */
  }
};
export const clearIdentity = (pin: string) => {
  try {
    localStorage.removeItem(idKey(pin));
  } catch {
    /* ignore */
  }
};
export const loadProfile = (): { nickname: string; avatar: string } | null => {
  try {
    return JSON.parse(localStorage.getItem('qa:profile') ?? 'null');
  } catch {
    return null;
  }
};
export const saveProfile = (p: { nickname: string; avatar: string }) => {
  try {
    localStorage.setItem('qa:profile', JSON.stringify(p));
  } catch {
    /* ignore */
  }
};

/** Estimated (server clock − local clock). Server timestamps are always ≤ "now", so the max sample is the best. */
let offset = 0;
let samples: number[] = [];
export const serverNow = () => Date.now() + offset;
function observeServerTime(serverTime: number) {
  samples.push(serverTime - Date.now());
  if (samples.length > 20) samples = samples.slice(-20);
  offset = Math.max(...samples);
}
export const resetClock = () => {
  samples = [];
  offset = 0;
};

type Role = 'host' | 'screen' | 'player';

export class GameSocket {
  private ws: WebSocket | null = null;
  private closedByUs = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: string[] = [];
  private pingSentAt: number | null = null;
  /** Round trip of the last ping/pong, reported to the host's debug panel. */
  rtt: number | undefined;

  constructor(
    private pin: string,
    private role: Role,
    private opts: {
      getTicket?: () => Promise<string>;
      identity?: () => PlayerIdentity | null;
      onIdentity?: (id: PlayerIdentity) => void;
    } = {},
  ) {}

  connect(): void {
    this.closedByUs = false;
    const store = useGame.getState();
    store.set({ status: this.attempt === 0 ? 'connecting' : 'reconnecting' });
    void this.open();
  }

  private async open(): Promise<void> {
    let qs = `role=${this.role}`;
    try {
      if (this.role !== 'player') qs += `&ticket=${encodeURIComponent((await this.opts.getTicket?.()) ?? '')}`;
    } catch {
      return this.retry();
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/${this.pin}?${qs}`);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      useGame.getState().set({ status: 'open' });
      if (this.role === 'player') {
        const id = this.opts.identity?.();
        if (id)
          this.sendNow({ t: 'join', nickname: id.nickname, avatar: id.avatar, playerId: id.playerId, token: id.token });
      }
      // Hosts/screens are identified by their ticket, so they can flush now. A player must be re-identified
      // first: anything sent before the server has processed `join` would be ignored.
      if (this.role !== 'player') this.flush();
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data as string) as ServerMsg;
      } catch {
        return;
      }
      if (typeof msg.serverTime === 'number') observeServerTime(msg.serverTime);
      if (msg.t === 'joined' && this.role === 'player' && msg.token) {
        this.opts.onIdentity?.({
          playerId: msg.playerId,
          token: msg.token,
          nickname: msg.nickname,
          avatar: msg.avatar,
        });
      }
      if (msg.t === 'error' && ['not_found', 'ended', 'removed', 'forbidden'].includes(msg.code))
        this.closedByUs = true;
      // The player erased themselves: the server closes this socket next, and we must not reconnect and re-join.
      if (msg.t === 'left') this.closedByUs = true;
      if (msg.t === 'pong' && this.pingSentAt !== null) {
        this.rtt = Math.round(performance.now() - this.pingSentAt);
        this.pingSentAt = null;
      }
      if (msg.t === 'joined' && this.role === 'player') this.flush();
      useGame.getState().apply(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUs) {
        useGame.getState().set({ status: 'closed' });
        return;
      }
      this.retry();
    };
    ws.onerror = () => ws.close();
  }

  private retry(): void {
    useGame.getState().set({ status: 'reconnecting' });
    const delay = Math.min(500 * 2 ** this.attempt++, 5000);
    this.timer = setTimeout(() => !this.closedByUs && void this.open(), delay);
  }

  private flush(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    for (const q of this.queue.splice(0)) this.ws.send(q);
  }

  private sendNow(msg: ClientMsg): void {
    const data = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
    else if (msg.t !== 'ping' && msg.t !== 'presence') this.queue.push(data);
  }

  send(msg: ClientMsg): void {
    if (msg.t === 'ping') this.pingSentAt = performance.now();
    this.sendNow(msg);
  }

  close(): void {
    this.closedByUs = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close(1000);
    this.ws = null;
  }
}
