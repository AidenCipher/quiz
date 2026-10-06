declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    GAME_ROOM: DurableObjectNamespace<import('../src/room').GameRoom>;
    ASSETS: Fetcher;
    SESSION_SECRET: string;
    DEV_LOGIN?: string;
    TEST_MIGRATIONS: unknown;
  }
}
