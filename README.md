# Quiz Arena

A minimalist, login-free live quiz. Players scan a QR code, pick a nickname and avatar, and answer timed
questions on their phones while the host runs the game from a laptop on a projector. Tab switching is
flagged live on the big screen by an animated detective owl. Everything runs on free tiers.

The full design is in [`docs/implementation-plan.md`](docs/implementation-plan.md).

## Run locally (3 commands)

```bash
pnpm install
pnpm setup:local          # creates apps/worker/.dev.vars and applies D1 migrations locally
pnpm --filter @quiz/web build && pnpm --filter @quiz/worker dev   # http://localhost:8787
```

Open <http://localhost:8787/host>, use the **development login**, create a quiz and press **Host live**.
For hot reload of the UI run `pnpm --filter @quiz/web dev` (port 5173, proxies `/api` and `/ws` to the worker).

Simulate players (optionally with tab-switchers) against a live game:

```bash
node tests/load/bots.mjs <PIN> 30 localhost:8787 --cheat=3
```

## Layout

```
apps/web/        React + Vite + Tailwind: player, host, builder and big-screen app
apps/worker/     Cloudflare Worker (Hono API), GameRoom Durable Object, D1 migrations
packages/shared/ zod message schemas, scoring, answer matching, severity ladder, avatars
tests/load/      WebSocket bot script
```

Scoring and validation live in `packages/shared`, so the phone and the server cannot disagree.
The `GameRoom` Durable Object is the single source of truth for the clock, answers, scores and flags;
phones never receive question text or the correct answer.

## Tests

```bash
pnpm test        # shared unit tests, web reducer/CSV tests, Worker + Durable Object integration tests
pnpm typecheck
pnpm lint
```

## Deploy (Cloudflare, free plan)

1. `wrangler d1 create quiz-arena` (and `quiz-arena-staging`); put the ids in `apps/worker/wrangler.jsonc`.
2. Set secrets: `wrangler secret put SESSION_SECRET` (a long random string), and for Google sign-in
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. The OAuth redirect URI is
   `https://<your-worker>.workers.dev/api/auth/google/callback`.
3. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets.
4. Merge to `main` to deploy production (CI also runs D1 migrations); push to `staging` for staging.
   Roll back with `wrangler rollback`.

`DEV_LOGIN` must stay `0` in production.

## Branching

`main` is deployable. Work happens on short-lived branches and pull requests; commits follow Conventional Commits.
