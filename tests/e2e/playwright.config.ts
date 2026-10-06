import { defineConfig } from '@playwright/test';

const PORT = 8788;

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Builds the web app, applies migrations to a throwaway local D1, then serves everything from one Worker.
  webServer: {
    command: [
      'pnpm --filter @quiz/web build',
      'cd ../../apps/worker',
      'rm -rf .wrangler/e2e-state',
      'npx wrangler d1 migrations apply quiz-arena --local --persist-to .wrangler/e2e-state',
      `npx wrangler dev --port ${PORT} --persist-to .wrangler/e2e-state --var DEV_LOGIN:1 --var SESSION_SECRET:e2e-secret`,
    ].join(' && '),
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Public business details are baked into the build, as in a real deploy.
    env: {
      VITE_OPERATOR_NAME: 'Example Operator Ltd',
      VITE_OPERATOR_ADDRESS: '1 Example Street, Bengaluru 560001',
      VITE_OPERATOR_COUNTRY: 'India',
      VITE_CONTACT_EMAIL: 'privacy@example.test',
    },
    stdout: 'ignore',
  },
});
