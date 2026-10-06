import fs from 'node:fs';
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  // The wrangler config points assets at the web build output; make sure the folder exists for tests.
  fs.mkdirSync(path.join(import.meta.dirname, '../web/dist'), { recursive: true });
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, SESSION_SECRET: 'test-secret', DEV_LOGIN: '1' },
        },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.ts'], testTimeout: 20_000 },
  };
});
