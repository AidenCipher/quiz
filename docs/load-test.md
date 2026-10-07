# Load test

`tests/load/load.mjs` joins N simulated phones (default 150) to a real game, plays 15 questions with every player answering inside the same
1-second window, and checks the targets from the implementation plan. It exits non-zero if any check fails.

## Result: 6 October 2026, local `wrangler dev` (Miniflare) on a MacBook, 150 players × 15 questions (no network)

| Check (target) | Result |
| --- | --- |
| All 150 players join within 30 s | pass (25–30 s, spread over 28 s on purpose; join latency p95 28–36 ms) |
| No join failures, no socket errors, no dropped sockets | pass |
| Every answer accepted | pass (2250 / 2250) |
| All 150 answers sent in about 1 s per question | pass |
| Every player receives every reveal | pass |
| Reveal reaches players < 500 ms after the last answer | pass: p50 28–29 ms, p95 38–190 ms, max 41–199 ms across four runs (was p95 3.6 s before the fix below) |
| Answer ack latency | p50 8–9 ms, p95 24–26 ms, max 59–187 ms |
| Results for all players saved | pass |

Traffic for the whole game: 2,400 messages from players (150 joins + 2,250 answers), about 11,850 messages to them, 3.1 MiB.

## Result on real Cloudflare (staging), 7 October 2026

Run from one MacBook on a home connection in India to `quiz-arena-staging.abhinavrotti.workers.dev`, 150 players × 15 questions, 2,250 answers (`tests/load/load.mjs`).

| Check | Result |
| --- | --- |
| All 150 players join, burst within 30 s | pass: 150/150 in 27.3 s (join latency p50 594 ms, p95 1.24 s, mostly TLS setup over the WAN) |
| No join failures, socket errors or dropped sockets | pass |
| Every answer accepted | pass: 2,250/2,250 |
| All 150 answers sent in about 1 s per question | pass |
| Every phone received every question and every reveal | pass |
| Results saved for all 150 players | pass |
| Answer acknowledgement | p50 154 ms, p95 357 ms, max 1.63 s |
| **Reveal reaches every phone < 500 ms after the last answer is sent** | **marginal fail: p50 184 ms, p95 527 ms.** 14 of 15 questions peaked at 505–941 ms; one question hit 2.47 s |

A second staging run later the same day, on the final code, passed this check too: **reveal p50 128 ms, p95 172 ms, max 630 ms**, join burst 24.5 s, answer ack p50 111 ms / p95 153 ms, all 2,250 answers accepted, every phone received every question and reveal. The spread between runs (p95 527 ms, then 172 ms) is the home network, not the server.

Reading the reveal numbers: the clock starts when the test sends the last answer and stops when each phone receives the reveal, so it includes the answer's trip to Cloudflare, the broadcast, and the trip back to a single laptop that is also driving 150 sockets. The same test against a local server (no network) gives p95 ≈ 40 ms, so almost all of the 527 ms is network and the test machine, not the game room. Real phones are spread out and on their own connections, but the numbers are an honest upper bound for a classroom with one slow link. Treat 500 ms as met on a normal connection, and expect it to vary with the network.

Two earlier staging runs on the same day were discarded: the test script itself sent answers with a stale question type when a question message reached a phone late, so the server correctly rejected them, and that question then waited out its 10 s timer. The script now makes each phone wait for its own question first.

Cloudflare usage (account dashboard, four staging runs plus deployments that day): about 620 HTTP requests (roughly 190 per game, about 0.2% of the 100,000/day free allowance; WebSocket messages are counted separately), 1.5 s of Worker CPU in total, and about 10.5k Workers Logs events (about 3k per game, around 1.5% of the 200,000/day allowance). Durable Object duration, requests and SQL rows written had not appeared in the dashboard yet when this was written; update this section once they do.

## What the first run found

The first run failed the reveal target: **~3 s from the last answer to the reveal**, and answer acks took 1.5 s on average. Cause: per-answer work that grew with the
square of the player count, in `apps/worker/src/room.ts`:

- `isConnected(player)` scanned every socket, and was called for every player on every answer (progress count and "all answered?" check);
- every phone's reveal message recomputed the whole scoreboard.

Fix: one pass over the sockets (`connectedIds`), and the scoreboard is computed once per broadcast. A worker test (`150 simultaneous answers…`) fails on the old code
(3.7 s) and passes now, so this cannot quietly regress.

## Not measured, and why

- **The game room's own processing time.** The host debug panel (key D) and the load test report "last answer → reveal sent" from the room's clock, but Cloudflare freezes `Date.now()` while code is running, so this only counts time spent waiting on storage or the network. It reads 0 ms on staging, which means nothing was waiting, not that the work was free. Real CPU time per game is visible in the Cloudflare dashboard (Workers CPU time, Durable Object duration) once its analytics catch up.

- **Staging runs need the dev login.** Turn it on only for the test: `npx wrangler secret put DEV_LOGIN --env staging` (value `1`), run `node tests/load/load.mjs 150 15 https://<staging-host>`, then `npx wrangler secret delete DEV_LOGIN --env staging`. Never set it in production.
- **Daily-allowance usage per game.** The plan asks for this; it can only be read from the Cloudflare dashboard after a staging run. From the traffic above, a 150-player
  game is about 150 connections plus roughly 2,400 incoming messages (billed at 20 messages per request), well under the free plan's 100,000 requests/day.
- **Storage writes on real Cloudflare.** Each answer is now saved as its own small key (`a:<question>:<player>`, about 40 bytes) instead of rewriting the whole game state. In a worker test with
  100 players, 99 answers wrote 4 KB in total, against 3.06 MB (and 99 rewrites of the game record) before. A 150-player, 15-question game is about 2,250 small writes. Rows-written and
  duration figures still need confirming on staging, but the volume no longer grows with players × questions.
- Real phones, flaky Wi-Fi and the iOS tab-suspension behaviour are covered by the manual device checklist, not by this script.
