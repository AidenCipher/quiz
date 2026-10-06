import type { GameRoom } from './room';

export interface Env {
  DB: D1Database;
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  DEV_LOGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
