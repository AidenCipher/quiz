# Quiz Arena

A minimalist, login-free live quiz. Players scan a QR code, pick a nickname and avatar, and answer timed
questions on their phones while the host runs the game from a laptop on a projector. Tab switching is
flagged live on the big screen by an animated detective owl. It is designed to fit within Cloudflare's free plan limits (check the current limits before a large event).

The full design is in [`docs/implementation-plan.md`](docs/implementation-plan.md).

## Run locally (3 commands)

```bash
pnpm install
pnpm setup:local          # creates apps/worker/.dev.vars and applies D1 migrations locally
pnpm --filter @quiz/web build && pnpm --filter @quiz/worker dev   # http://localhost:8787
```

Open <http://localhost:8787/host>, use the **development login**, create a quiz and press **Host live**.
For hot reload of the UI run `pnpm --filter @quiz/web dev` (port 5173, proxies `/api` and `/ws` to the worker).

Load test (150 players, 15 questions) against a server with `DEV_LOGIN=1`, local or staging:

```bash
node tests/load/load.mjs 150 15 http://localhost:8787   # or: pnpm test:load
```

Simulate players (optionally with tab-switchers) against a live game:

```bash
node tests/load/bots.mjs <PIN> 30 localhost:8787 --cheat=3
```

## Host keyboard shortcuts

| Key | Does |
| --- | --- |
| Space | The main action: start, skip countdown, end question, next, full results |
| P | Pause / resume the current question |
| K | Moderation drawer: flags, rename, kick, lock lobby |
| D | Debug panel: connected phones, messages per second, each phone's round trip |
| F | Fullscreen |
| M | Mute |
| Esc | Close the open drawer or dialog |

Shortcuts never fire while a dialog, drawer or form field has focus, so they cannot be triggered by accident.

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
pnpm test:e2e    # Playwright: full game with 5 phones, anti-cheat flows, reconnects, axe accessibility scans
pnpm typecheck
pnpm lint
```

The e2e suite needs a one-time `pnpm --filter @quiz/e2e exec playwright install chromium`. It builds the app and starts its own
Worker with a throwaway local database on port 8788. Headless Chromium has no real tab visibility, so the tests drive the Page
Visibility API (`setHidden` in `tests/e2e/tests/helpers.ts`); real tab/app switching is covered by the manual device checklist.

## Deploy (Cloudflare, free plan)

1. `wrangler d1 create quiz-arena` (and `quiz-arena-staging`); put the ids in `apps/worker/wrangler.jsonc`.
2. Set secrets: `wrangler secret put SESSION_SECRET` (a long random string), and for Google sign-in
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. The OAuth redirect URI is
   `https://<your-worker>.workers.dev/api/auth/google/callback`.
3. Set the public business details (shown on the privacy policy, contact page and footer). The deploy refuses to run without them:
   GitHub repository **variables** `OPERATOR_NAME`, `OPERATOR_ADDRESS`, `OPERATOR_COUNTRY`, `CONTACT_EMAIL`.
   Locally, set `VITE_OPERATOR_NAME`, `VITE_OPERATOR_ADDRESS`, `VITE_OPERATOR_COUNTRY`, `VITE_CONTACT_EMAIL` before `pnpm build`.
4. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets.
5. Merge to `main` to deploy production (CI also runs D1 migrations); push to `staging` for staging.
   Roll back with `wrangler rollback`.

`DEV_LOGIN` must stay `0` in production.

## Branching

`main` is deployable. Work happens on short-lived branches and pull requests; commits follow Conventional Commits.

## Privacy, accessibility and compliance

The app ships a privacy policy, cookie policy, trust & safety page, pricing & refunds page, credits & licences, a contact page
with the operator's details, and a data-deletion page. [`docs/compliance.md`](docs/compliance.md) maps each requirement to the
code and tests, lists what does not apply (payments, email, reviews) and what the operator still has to do. These pages are
drafted from what the code does; they are not legal advice, so have them reviewed before a public launch.

Regenerate the third-party licence notices after changing dependencies: `node scripts/generate-licenses.mjs`.

## License

[MIT](LICENSE) © 2026 Abhinav P Rotti. Third-party licences (Inter font under the SIL OFL, and the npm dependencies) are listed in
`apps/web/public/third-party-notices.txt`. Hosts' own quizzes and uploaded images belong to them.
