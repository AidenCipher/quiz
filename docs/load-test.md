# Load test

`tests/load/load.mjs` joins N simulated phones (default 150) to a real game, plays 15 questions with every player answering inside the same
1-second window, and checks the targets from the implementation plan. It exits non-zero if any check fails.

## Result: 6 October 2026, local `wrangler dev` (Miniflare) on a MacBook, 150 players × 15 questions

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

## What the first run found

The first run failed the reveal target: **~3 s from the last answer to the reveal**, and answer acks took 1.5 s on average. Cause: per-answer work that grew with the
square of the player count, in `apps/worker/src/room.ts`:

- `isConnected(player)` scanned every socket, and was called for every player on every answer (progress count and "all answered?" check);
- every phone's reveal message recomputed the whole scoreboard.

Fix: one pass over the sockets (`connectedIds`), and the scoreboard is computed once per broadcast. A worker test (`150 simultaneous answers…`) fails on the old code
(3.7 s) and passes now, so this cannot quietly regress.

## Not measured, and why

- **Real Cloudflare behaviour.** This ran on a laptop simulating Workers, with no network between the bots and the server. Run it against staging before a real event:
  `node tests/load/load.mjs 150 15 https://<staging-host>` (staging needs `DEV_LOGIN=1`, which must never be set in production).
- **Daily-allowance usage per game.** The plan asks for this; it can only be read from the Cloudflare dashboard after a staging run. From the traffic above, a 150-player
  game is about 150 connections plus roughly 2,400 incoming messages (billed at 20 messages per request), well under the free plan's 100,000 requests/day.
- **Storage writes.** The game state is saved as one record on every answer (about 2,250 writes in this game). That is fine locally, but check "rows written" and duration on
  staging: if it grows, persist answers one key at a time instead of rewriting the whole state.
- Real phones, flaky Wi-Fi and the iOS tab-suspension behaviour are covered by the manual device checklist, not by this script.
