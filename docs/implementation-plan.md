# Quiz Arena — Implementation Plan

Oct 6, 2026 · @Abhinav

## Summary

Build a minimalist, login-free live quiz: players scan a QR code, pick a nickname and avatar, and answer timed questions on their phones while a host runs the game from a laptop on a projector. Everything runs on free tiers, and tab switching is flagged live on the host screen with an animated suspicious character. "Quiz Arena" is a placeholder name.

**Goals for v1**

- QR scan to lobby in under 15 seconds, with no login and no app install.
- Server-authoritative timing and scoring, so nothing a player does in their browser can change a score.
- Visible, fair anti-cheat: every tab switch during a question is logged, flagged and shown to the host.
- ₹0 monthly running cost at the target scale.

**Not in v1**

- Player accounts, payments, native apps, team mode, AI-generated questions.
- Question types beyond multiple choice, true/false and type-the-answer.

**Working assumptions until you answer the open questions**

- Classroom use: one class of about 30–70 players per game, games of about 15 questions (roughly 10 minutes).
- Questions and options appear only on the projector; phones show answer buttons or a text box.
- The host always presents from a laptop over HDMI, so the big screen is the main design surface.
- Hosts sign in with a real account; players never do.
- Tab-switch penalties scale with severity, and every flag is visible to the whole room.
- Question types: multiple choice, true/false and type-the-answer.
- ₹0 including the address: a free subdomain, no custom domain.

## Roles and user flows

There are three surfaces: the host's control view, the big screen (projector) and the player's phone. In v1 the host's control view and big screen are the same browser tab, with a "presenter mode" toggle.

| Role | Device | Identity | Can do |
| --- | --- | --- | --- |
| Host | Laptop connected to a projector over HDMI | Google sign-in | Build and save quizzes, open a lobby, start, pause, skip, kick, end, clear flags |
| Player | Own phone | Random player ID + token kept on the phone (no login) | Join, make an avatar, answer, see own score and rank |
| Big screen | Same laptop as host, in fullscreen | Follows the host tab | Shows QR, lobby, question and options, timer, results, leaderboard, flags |

**Host flow**

1. Signs in with Google; their quizzes are saved to their account.
2. Creates a quiz of about 15 questions. Each is multiple choice (2–4 options), true/false, or type-the-answer (one or more accepted answers), with an optional image, a timer (5–120 s) and a points value.
3. Clicks "Host live" and puts the browser in fullscreen on the projector. The server creates a game room with a 6-digit PIN and the big screen shows the QR code and PIN.
4. Watches players appear in the lobby; can kick or rename anyone, and lock the lobby.
5. Clicks "Start". For each question: a 3-second "get ready", the question and options on the big screen with the timer, then the reveal with how many picked each option, then the leaderboard.
6. During a question, flagged players get the suspicious-character animation on the big screen, scaled to how serious the switch was, and penalties apply automatically.
7. After the last question: a top-3 podium, then a full results table with flags, which the host can download as CSV.

**Player flow**

1. Scans the QR on the projector (or opens the site and types the PIN).
2. Types a nickname and builds an avatar; both are remembered on that phone for next time.
3. Waits in the lobby and sees their avatar appear on the big screen.
4. For each question: reads it on the projector, then taps the matching shape (▲ ◆ ● ■, or True/False) or types the answer, and gets "Locked in" feedback.
5. On reveal: right or wrong, points earned, current rank and streak.
6. If they switch tabs during a question, the whole room sees the flag, and they see a warning and any penalty when they come back.
7. At the end: final rank and score. If they refresh or lose signal, they rejoin the same game with their score intact.

## Feature specification

The core loop is lobby → question → reveal → leaderboard, repeated; every rule below is enforced on the server, and the phone only displays what the server says.

**Lobby and joining**

- 6-digit numeric PIN per game, unique among live games, expires when the game ends.
- QR code encodes `https://<site>/j/<PIN>`, generated in the browser (no external QR service).
- Join screen asks only for a nickname (2–16 characters) and an avatar. Duplicate nicknames get a number suffix.
- Lobby shows avatars in a grid with a live count; the host can lock it so late joiners are refused (or allowed in, scoring 0 for missed questions — your call).

**Avatars**

- An in-house avatar builder with 5 layers: face shape, skin colour, eyes, mouth, accessory (glasses, cap, headphones…), plus a background colour. About 6 options each gives thousands of combinations.
- Drawn as original SVG parts, so there are no licensing questions; a "randomise" button for people in a hurry.
- Stored as a tiny code (e.g. `f2-s4-e1-m3-a5-b2`), sent to the server and rendered the same everywhere.
- Alternative if you'd rather not draw parts: the open-source DiceBear library, choosing a style whose licence allows reuse.

**Question types**

| Type | Big screen shows | Phone shows | Correct when |
| --- | --- | --- | --- |
| Multiple choice | Question, image, 2–4 options each with a shape (▲ ◆ ● ■) | Only the 2–4 shape buttons — no text | The tapped shape is the correct option |
| True/false | Question and image | Two buttons: True, False | The tap matches |
| Type-the-answer | Question, image, "Type your answer on your phone" | A text box (max 40 characters) and Submit | The text matches any accepted answer after normalising |

Phones never receive the question or option text, only the question type, the number of options and the deadline. Anyone who wants to search must leave the quiz tab, which is exactly what gets flagged.

**Type-the-answer matching (all on the server)**

- The host lists one or more accepted answers ("Mumbai", "Bombay").
- Matching ignores capitals, extra spaces, punctuation and accents; numbers compare as numbers ("7" equals "7.0").
- Typo tolerance, on by default: 1 wrong letter allowed for answers of 5+ letters, 2 for 10+.
- At the reveal the big screen shows the accepted answer and the three most common answers with counts (filtered for profanity). The host can tap a wrong answer to accept it, and everyone who typed it gets points immediately.
- Scoring uses the same speed formula as other types.

**Question builder (host)**

- Pick a type per question: multiple choice, true/false or type-the-answer. Quizzes default to 15 questions, max 50.
- Question text up to 200 characters (sized to stay readable from the back of a classroom), optional image compressed in the browser to under 200 KB.
- Multiple choice: 2–4 options, one marked correct. True/false: pick the right one. Type-the-answer: up to 5 accepted answers and a typo-tolerance switch.
- Per-question timer: 5, 10, 20, 30, 60, 90 or 120 seconds (type-the-answer defaults to 30 s). Per-question points: 0 (practice), standard (1,000) or double (2,000).
- A live preview of exactly how the question will look on the projector.
- Reorder by drag, duplicate, delete; autosave to the host's account as you type.
- Import and export as CSV/JSON, so quizzes can be written in a spreadsheet.

**Timer**

- The server owns the clock: it sends each phone the question and an absolute end time, and each phone shows a countdown corrected for its clock offset.
- Answers arriving after the end time (plus a 300 ms network grace) are rejected.
- The question closes early once every connected player has answered.

**Scoring and ranking**

Only correct answers score. Faster answers score more, but a correct answer never scores less than half the question's points:

```latex
\text{points} = \operatorname{round}\left(P \times \left(1 - \frac{t}{2T}\right)\right)
```

P is the question's points, t the server-measured time from question open to answer received, and T the timer length. A streak bonus adds 100 points per consecutive correct answer from the second one on, capped at 500. Ties in total score are broken by lower total answer time. One answer per question, no changing it (configurable if you prefer).

**Leaderboard and results**

- After each reveal: top 5 on the big screen with rank changes animated; every player sees their own rank on their phone.
- End of game: top-3 podium, then a full table with score, correct count, average answer time and flag count, downloadable as CSV.
- Host controls throughout: pause, skip question, extend timer by 10 s, kick player, end game.

## Anti-cheat

The browser can reliably tell us when a player's quiz tab stops being visible. v1 grades each switch by severity, applies a matching penalty automatically, and shows every flag to the whole room. It cannot see a second phone or a friend's screen, and the plan doesn't pretend otherwise.

**What we detect, and how much we trust it**

| Signal | Browser event | Catches | Trust |
| --- | --- | --- | --- |
| Tab or app hidden | Page Visibility API (`visibilitychange` → hidden) | Switching tabs, switching apps, home button, opening the camera or Google Lens | High |
| Focus lost | `window` `blur` | Clicking another window on a laptop, split screen, some system pop-ups | Medium |
| Page left | `pagehide` or socket drop mid-question | Closing or reloading the page | Medium |
| Heartbeat gap | Phone pings every 2 s; browsers slow timers in hidden tabs | A player who edits the page to stop sending the events above | Backup |

The server grades each switch by how long the player was away and when they answered, so the penalty fits the offence.

**Severity ladder (default thresholds; the host can adjust them per game)**

| Severity | Trigger during an open question | Penalty | Strike points |
| --- | --- | --- | --- |
| Minor | Focus lost for 1–3 s, or tab hidden under 2 s | Flag only | 1 |
| Moderate | Tab hidden 2–10 s, or a second minor event in the same question | That question's answer is void (scores 0) | 2 |
| Major | Tab hidden over 10 s, or an answer submitted within 3 s of coming back | Answer void and 500 points deducted | 3 |
| Removed | Strike points reach 6 across the game | Kicked from the game after a 5-second host override window | — |

**Rules**

- Only counted while a question is open. Switching tabs in the lobby or on the leaderboard is fine.
- Every event is sent to the server with how long the player was away; the server decides the severity, not the phone.
- A focus loss shorter than 1 second is ignored (a notification sliding down).
- Penalties are applied at the reveal, so the reveal can show "voided" next to that player.
- The host can clear any flag (an incoming call is not cheating); clearing it refunds the penalty and strike points and removes the badge for everyone.
- Everyone sees flags: the animation on the big screen, a short notice on every phone ("👀 Riya was flagged"), an eye badge with the count on the leaderboard and in the final results.
- The flagged player sees what happened and what it cost when they return.
- The results CSV lists every flag with its time, duration, severity and penalty.

**The suspicious-character animation**

- An original character drawn for this app (for example a round owl-detective with a magnifying glass; final pick is yours), not a known cartoon character, to avoid copyright problems.
- It escalates with severity. Minor: slides out from behind the player's avatar tile and narrows its eyes (about 2 s, amber outline). Moderate: turns and stares at the avatar with a slow head tilt (about 2.5 s). Major: pulls out the magnifying glass and points (about 3 s, red outline). Removed: the avatar is escorted off the screen.
- Afterwards an eye badge with the flag count stays on that avatar for the rest of the game.
- Built as an SVG with CSS keyframes (or Rive, which has a free tier) so it stays crisp at projector size and is tiny to download.
- If several players are flagged at once, at most 3 animations play together and the rest collapse into "+5 more suspects".
- Respects the operating system's reduced-motion setting: the character appears as a still badge instead.

**Known limits and false positives**

- Not detectable: a second device, a friend's phone, paper notes, voice assistants on another device.
- False flags: incoming calls, low-battery pop-ups, a screen that auto-locks during a long timer, tapping a notification. The host's "clear flag" handles these.
- Fullscreen mode would help on Android but isn't supported for web pages on iPhones, so it's not part of v1.
- We only record that the tab was hidden and for how long, never what the player switched to.

## Architecture (all free)

The game server runs on Cloudflare's free Workers plan: one Durable Object per live game is the authoritative server over WebSockets, a Worker handles the API and host login, and D1 stores accounts and quizzes. The site itself can be served from the same Worker or from Vercel; both are free (see Hosting decision below). A classroom game uses about 1–2% of the daily free allowances.

&#91;embedded content: architecture · 2 clients, 3 Cloudflare parts\]

Phones and the host talk only to the Worker, which hands each WebSocket to that game's object; the object is the single source of truth for the clock, answers, scores and flags.

**Recommended stack**

| Layer | Choice | Free allowance (as of Oct 2026) |
| --- | --- | --- |
| Frontend | React + Vite + TypeScript single-page app, Tailwind CSS, Motion for animation, Zustand for state | — |
| Hosting | Cloudflare Workers static assets on `*.workers.dev` (recommended) or Vercel Hobby on `*.vercel.app` | Cloudflare static asset requests free and unlimited ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)); Vercel Hobby free for non-commercial use ([Hobby plan](https://vercel.com/docs/plans/hobby)) |
| API | Cloudflare Worker (TypeScript, Hono router) | 100,000 requests/day, 10 ms CPU per request |
| Host login | Better Auth library on the Worker, "Sign in with Google", sessions stored in D1 | No auth vendor or monthly limit; Google sign-in costs nothing |
| Realtime game server | One SQLite-backed Durable Object per game, WebSocket Hibernation API, alarms for timers | 100,000 requests/day, 13,000 GB-s/day, 100,000 rows written/day ([Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)) |
| Database | Cloudflare D1 (SQLite) for hosts, sessions, quizzes, questions and past results | 5M rows read/day, 100,000 rows written/day, 5 GB total |
| Images | Compressed in the browser to under 200 KB, stored in D1 | Counts toward the 5 GB |
| Shared code | `zod` schemas for every message, shared by client and server | — |
| Logs | Workers Logs | 200,000 events/day, kept 3 days |
| Code and CI | GitHub + GitHub Actions | Free for public repos |

Why a Durable Object: each game is one single-threaded object that holds the room, the clock and the scores, so there are no race conditions between 100 simultaneous answers and no separate server to keep awake. Incoming WebSocket messages are billed at 20 messages per request, outgoing messages are free, and protocol pings handled by the auto-response feature cost nothing, which keeps heartbeats free.

**Capacity estimate for one 60-player, 15-question game:** about 60 connection requests plus roughly 100 billed message requests, around 1,500 rows written, and a few minutes of active time: 1–2% of each daily allowance. Dozens of class games a day stay inside the free plan. Limits reset at 00:00 UTC (5:30 am IST), and going over makes further calls fail rather than charge you.

**Alternatives considered**

| Option | Free realtime limit | Catch | Verdict |
| --- | --- | --- | --- |
| Vercel Functions WebSockets (public beta since June 2026) | Per function instance | Each connection is pinned to one instance and players aren't guaranteed the same one; connections close at the function's max duration ([docs](https://vercel.com/docs/functions/websockets)) | Fine for serving pages, not for a shared game room |
| Supabase Realtime + Postgres | 200 concurrent connections, 2M messages/month ([pricing](https://supabase.com/pricing)) | Free projects pause after 1 week of inactivity; no built-in authoritative server clock | Good fallback; the pause is risky for an app used occasionally |
| Firebase Realtime Database (Spark) | 100 simultaneous connections ([limits](https://firebase.google.com/docs/database/usage/limits)) | Game logic would run on clients | Not recommended |
| Node + Socket.IO on a free host | Varies | Free web services typically sleep when idle, causing a slow first join | Not recommended |

**Hosting decision: Cloudflare-only or Vercel + Cloudflare**

|  | A. All on Cloudflare (recommended) | B. Pages on Vercel, game on Cloudflare |
| --- | --- | --- |
| Address | `quiz-arena.<your-subdomain>.workers.dev` (you pick the subdomain once) | `quiz-arena.vercel.app` if the name is free |
| Deploys | One | Two (Vercel for pages, Cloudflare for the game server) |
| Host login | Cookie on the same site as the pages, nothing extra | Vercel must forward `/api` calls to the Worker so the login cookie works; sockets need a short-lived ticket |
| Rules | Workers free plan | Vercel Hobby is for non-commercial personal use, which a classroom quiz fits |
| Cost | ₹0 | ₹0 |

Both work. A is less to build and debug; B gives a slightly shorter address. Since players join by QR, the address is rarely typed, so the plan assumes A unless you prefer B.

## Data model and realtime protocol

Saved quizzes live in D1; a live game lives entirely inside its Durable Object, which copies the quiz in at start, runs the state machine below, and writes the final results back to D1 when the game ends.

&#91;embedded content: game state machine · 7 states, 1 decision\]

A question also closes early once every connected player has answered. Only the server moves the game between states; phones and the big screen just draw whatever state they're told.

**D1 tables (persistent)**

| Table | Key columns | Notes |
| --- | --- | --- |
| `user`, `session`, `account` | Better Auth's standard tables: Google ID, name, email, avatar URL, session expiry | Hosts only; players never get a row here |
| `quizzes` | `id`, `owner_id`, `title`, `settings` (JSON: severity thresholds, penalties), `created_at`, `updated_at` | Only the owner can edit or host it |
| `questions` | `id`, `quiz_id`, `position`, `type` (mcq / tf / text), `text`, `image`, `options` (JSON), `correct_index`, `accepted_answers` (JSON), `typo_tolerance`, `time_limit_s`, `points` | Unused columns stay null for each type |
| `game_results` | `id`, `quiz_id`, `host_id`, `pin`, `started_at`, `ended_at`, `results` (JSON) | Final table incl. flags; deleted after 30 days (configurable) |

**Game object state (in the Durable Object's own SQLite)**

| Entity | Fields |
| --- | --- |
| Game | `pin`, `host_id`, quiz snapshot, `phase`, `question_index`, `opened_at`, `ends_at`, settings (severity thresholds, penalties, lobby lock) |
| Player | `id`, `token_hash`, `nickname`, `avatar_code`, `score`, `streak`, `connected`, `strike_points`, `removed` |
| Answer | `player_id`, `question_index`, `option_index` or `text`, `received_at`, `correct`, `voided`, `points` |
| Flag | `player_id`, `question_index`, `type` (hidden / blur / left), `away_ms`, `at`, `severity`, `penalty`, `cleared` |

State is written to the object's storage at every phase change and every answer, because a hibernating object loses anything held only in memory.

**Messages (JSON over one WebSocket per device, validated with zod on both ends)**

| Direction | Message | Payload | Sent when |
| --- | --- | --- | --- |
| Player → server | `join` | nickname, avatar code, saved token if rejoining | On the join screen |
| Player → server | `answer` | question index, option index or answer text | Player taps a shape or submits text |
| Player → server | `presence` | hidden / visible / blur / focus, away time | Visibility or focus changes |
| Host → server | `start`, `next`, `pause`, `skip`, `extend`, `end` | — | Host clicks a control |
| Host → server | `kick`, `rename`, `clearFlag`, `lockLobby`, `acceptAnswer` | player id or answer text, new value | Host moderates or accepts a typed answer |
| Server → all | `lobby` | player list (id, nickname, avatar) | Someone joins or leaves |
| Server → big screen | `question` | full text, image, options, type, `ends_at`, server time | Question opens |
| Server → players | `question` | type, number of options, `ends_at`, server time — no text, never the answer | Question opens |
| Server → player | `answerAck` | accepted or reason rejected | After each answer |
| Server → all | `reveal` | correct option or accepted answers, counts, top typed answers, voided players; each player also gets their own points, rank, streak | Timer ends or all answered |
| Server → all | `leaderboard` | top 5 with rank changes and flag badges; each player gets their own rank | After reveal |
| Server → all | `flag` | player id, nickname, severity, penalty, strike points | A flag is raised (big screen animates, phones show a notice) |
| Server → player | `warned` | severity, penalty, strike points left | Player returns after a flag |
| Server → all | `removed`, `flagCleared` | player id | Kick by strikes, or host clears a flag |
| Server → all | `podium`, `ended` | top 3; final ranks with flag counts | Game ends |

The host's WebSocket must present a short-lived ticket issued by the API to a signed-in host who owns the quiz, so nobody can control a game by guessing its PIN.

Clock sync: every server message carries the server's time, the phone keeps a running estimate of its offset, and countdowns are drawn from `ends_at` minus corrected local time, so a slow phone never shows a different deadline.

## UI, UX and visual design

The projector is the stage: questions, options, timer, reveals and flags all live there, so most design effort goes into the big screen, while the phone stays a simple controller. Minimalist still means one typeface family, a restrained palette, generous space, and motion only where it carries meaning.

**Big-screen (projector) design**

- Designed at 1920×1080 (16:9) and checked at 1280×720, a common projector resolution, with a 5% safe margin on every side.
- One-click fullscreen for the host (the Fullscreen API works in laptop browsers), plus an optional "open big screen in a second window" mode so the projector shows the game while the laptop shows controls.
- Projectors wash out colour and thin lines, so: dark background, medium-to-bold weights only, no light-grey text, contrast of at least 7:1, saturated tile colours checked on a real projector.
- Readable from the back of a classroom: question text 56–72 px (auto-shrinks for long questions), option text at least 40 px, a large timer ring and answered count.
- Question layout: question in the top band, image in the centre, 2×2 option grid at the bottom, timer ring top right, answered count beside it.
- Designed "stage beats": avatars pop into the lobby, the question slides in, reveal bars grow, leaderboard rows reorder, and the podium ends with a short confetti burst.
- Sound through HDMI: lobby music, countdown tick, reveal sting, with volume and mute in the host controls.
- Host controls sit in a small auto-hiding bar; keyboard shortcuts: Space = next, P = pause, F = fullscreen, M = mute.

**Screens**

| # | Screen | Surface | Key elements |
| --- | --- | --- | --- |
| 1 | Home | Any | "Join a game" (PIN field) and "Host a quiz" (Google sign-in) |
| 2 | My quizzes | Host | List of the host's saved quizzes, past results, create new |
| 3 | Quiz builder | Host | Question list on the left, editor on the right, live projector preview, autosave indicator |
| 4 | Game settings | Host | Severity thresholds and penalties, late joining, answer changes, music on/off |
| 5 | Lobby | Big screen | Large QR, PIN, join URL, avatar grid, player count, Start button |
| 6 | Join | Phone | Nickname field, avatar builder with randomise, Join button |
| 7 | Waiting | Phone | Own avatar, "You're in — look at the big screen" |
| 8 | Get ready | Both | Question number, 3-second countdown |
| 9 | Question | Big screen | Question text, image, option tiles with shapes, timer ring, answered count, flag animations |
| 10 | Answer | Phone | 2–4 large shape buttons, True/False, or a text box; timer bar; then "Locked in" |
| 11 | Reveal | Both | Correct tile or accepted answer, bar per option or top typed answers, voided players; phone shows right/wrong, points, streak |
| 12 | Leaderboard | Both | Top 5 with animated rank changes and flag badges; phone shows own rank |
| 13 | Podium and results | Both | Top 3 podium; host gets the full table, flag log and CSV download |
| 14 | Flag notice and warning | Phone | Room-wide notice when someone is flagged; personal warning and penalty on return |
| 15 | Error states | Both | Game not found, lobby locked, kicked, reconnecting, game ended |

**Design system**

- Colour: dark neutrals for the big screen, light neutrals for host editing screens, one accent colour for primary actions. Answer tiles each get a shape and letter (▲ A, ◆ B, ● C, ■ D) plus a distinct hue, so they never rely on colour alone; phones show the same shape and hue as the projector tile.
- Type: one free Google Font family (for example Inter, or something with more character like Space Grotesk — your pick), medium weight minimum on the projector; phone body text 16 px.
- Spacing on an 8 px grid; corner radius 12 px; no gradients or heavy shadows.
- Motion: 150–250 ms transitions on phones, slightly longer stage beats on the big screen; reduced-motion users get fades only.
- Phone answer screen fits without scrolling, tiles at least 64 px tall.

**Mobile and performance**

- Built phone-first for 360 px wide screens; tested on Android Chrome and iPhone Safari (latest two versions each).
- First load under 150 KB of compressed JavaScript so joining works on weak campus Wi-Fi or mobile data.
- Uses the Screen Wake Lock API during a game so phones don't auto-lock mid-question, which also avoids false cheating flags.
- Option tiles at least 64 px tall; the whole answer screen fits without scrolling.

**Accessibility (target WCAG 2.2 AA)**

- Text contrast at least 4.5:1; tiles distinguishable by shape and letter as well as colour.
- Full keyboard use for the host; screen-reader labels on tiles; the timer announces at 10 and 5 seconds.
- Honour the operating system's reduced-motion setting everywhere, including the suspicious character.

## Security, privacy and abuse prevention

The server never trusts the phone: correct answers stay on the server until reveal, the server measures answer time, and every message is validated and rate-limited. No personal data is collected beyond a nickname.

**Game integrity**

- Correct answers are never sent to phones before the reveal, so reading the page's code or network traffic gives nothing away.
- Answer time is measured on the server from question open to message received; the phone's clock is never used for scoring.
- One accepted answer per player per question; duplicates and late answers are rejected.
- Every incoming message is checked against a zod schema; anything malformed is dropped and counted.

**Identity without logins**

- Players get a random ID and a secret token on join, saved on the phone so a refresh rejoins the same seat. The server stores only a hash of the token.
- Hosts sign in with Google through Better Auth; the session lives in an HTTP-only, secure cookie and in D1. Only a quiz's owner can edit or host it.
- Opening a game issues a short-lived signed host ticket; the game object accepts host commands only over a socket that presented it.
- Google sign-in needs a free OAuth client set up once in Google Cloud Console, with the site's address as the allowed redirect.

**Abuse and moderation**

- Nickname filter: length 2–16, trimmed, profanity checked with an open-source word-list library (English plus a Hindi/Kannada transliterated list you can extend), with the host able to rename or kick.
- Per-IP limits on join attempts and on messages per second, enforced in the Worker and the game object; a locked lobby refuses all new joins.
- 6-digit PINs (900,000 combinations) are only valid while a game is live; repeated wrong PINs from one address get slowed down.
- Max 2 WebSocket connections per player token, so one person can't fill a lobby with fake players from one tab.
- Optional for public events: Cloudflare Turnstile (a free CAPTCHA alternative) on the join screen.

**Web security basics**

- HTTPS only (default on workers.dev), strict Content-Security-Policy, no third-party scripts in the player app.
- Uploaded images re-encoded in the browser and size-checked on the server; question text rendered as plain text, never as HTML.

**Privacy**

- Collected from players: nickname, avatar code, answers, timings, tab-visibility events. Not collected: names, emails, phone numbers, device identifiers, location.
- Collected from hosts: Google name, email and profile picture, only to run their account.
- A one-line notice on the join screen that tab switches are recorded, shown to the whole room, and may cost points.
- Because flags are public, the host's "clear flag" also removes the badge and notice for everyone, so an honest mistake isn't left on display.
- Live game data is deleted when the game object is cleaned up after the game; saved results kept 30 days unless you choose otherwise.
- Keep it nickname-only for players and avoid real names on the projector; check India's DPDP Act requirements if this ever goes beyond classroom use.

## Testing and observability

The riskiest parts are timing, scoring and flagging under load, so those get the most automated tests, and a 150-player simulated game must pass before any real event.

| Level | Tool | What it covers |
| --- | --- | --- |
| Unit | Vitest | Scoring formula, streaks, tie-breaks, state-machine transitions, nickname filter, message schemas |
| Game object | Vitest with Cloudflare's Workers test pool (runs locally) | Join/rejoin, late answers rejected, all-answered early close, alarms firing, kick, hibernation and wake with state intact |
| End-to-end | Playwright with several browser contexts | Host plus 5 players play a full game; a player opens a new tab mid-question and the host sees the flag; reconnect after going offline |
| Device | Real phones | One cheap Android, one iPhone, the projector laptop; tab switch, app switch, lock screen, incoming call, notification pull-down |
| Load | A small Node script (or k6) opening 150 WebSockets against staging | Join burst in 30 s, 150 answers within 1 s, reveal latency under 500 ms, daily-allowance usage per game |
| Accessibility | axe in Playwright + manual screen-reader pass | Contrast, labels, keyboard flow, reduced motion |

**Before every live event (checklist)**

- [ ] Run a 10-minute dry game on the venue Wi-Fi with 3–4 real phones.
- [ ] Check the day's Cloudflare usage dashboard is near zero.
- [ ] Projector: confirm the QR scans from the back row.

**Observability (free)**

- Workers Logs for structured server logs: game created, joins, answer latency, flags, errors.
- A hidden host-only debug panel showing connected count, message rate and server latency per player.
- Cloudflare Web Analytics (cookie-free) for page views, if wanted.
- Client errors sent to a small `/log` endpoint in the Worker instead of a paid error-tracking service.

## DevOps and deployment

One GitHub repository, one command to run everything locally, and every merge to `main` deploys automatically to production through GitHub Actions and Cloudflare's `wrangler` CLI.

**Repository layout (pnpm workspace)**

```
quiz-arena/
  apps/web/        React + Vite player, host and big-screen app
  apps/worker/     Worker: API routes, GameRoom Durable Object, D1 migrations
  packages/shared/ zod message schemas, scoring logic, avatar parts, types
  tests/e2e/       Playwright tests
  tests/load/      WebSocket load script
```

Scoring and validation live in `packages/shared`, so the phone and server can't disagree.

**Environments**

| Environment | Address | Deploys on | Data |
| --- | --- | --- | --- |
| Local | localhost via `wrangler dev` | — | Local D1 and Durable Objects simulated on your laptop |
| Staging | `quiz-arena-staging.<you>.workers.dev` | Push to `staging` branch | Separate D1 database |
| Production | `quiz-arena.<you>.workers.dev` or a custom domain | Merge to `main` | Production D1 |

**CI/CD pipeline (GitHub Actions)**

1. On every pull request: install, type-check, lint (ESLint + Prettier), unit and game-object tests, build.
2. On merge to `staging`: deploy to staging, run D1 migrations, run Playwright against it.
3. On merge to `main`: deploy to production with the Cloudflare API token stored as a GitHub secret.
4. Rollback: `wrangler rollback` to the previous version (seconds).

**Domain**

Fully free, so no custom domain. Option A uses `quiz-arena.<your-subdomain>.workers.dev`; option B uses `quiz-arena.vercel.app` for the pages (if the name is free). Both come with HTTPS. The QR code means the address is rarely typed, and the lobby also shows the PIN for anyone joining manually.

**Housekeeping**

- Dependabot (free) for dependency updates.
- Conventional commits and a short README with "run locally in 3 commands".
- Durable Object migrations versioned in `wrangler` config; D1 migrations as numbered SQL files.

## Roadmap

Build in six phases over about seven weeks: a game you can play with friends exists at the end of week 3, and each later phase adds one complete capability.

&#91;embedded content: roadmap · 6 phases over 7 weeks, 3 gates\]

Each gate is a hard check; the next phase starts only once it passes. Weeks assume one person working part-time and will be re-cut once you confirm a deadline (question 32).

## Risks and mitigations

The two biggest risks are venue networks and false cheating flags; both are handled with testing and host controls rather than more code.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Campus Wi-Fi blocks or drops WebSockets, or has a login portal | Medium | High | Dry run on the classroom network; players can switch to mobile data; auto-reconnect keeps scores |
| False tab-switch flags (calls, pop-ups, auto-lock) cost honest players points in front of the class | High | Medium | Graded severity, 1 s grace, wake lock, host can clear a flag and refund the penalty for everyone |
| Auto-kick at 6 strike points removes someone unfairly | Low | Medium | 5-second host override before removal; thresholds adjustable per game |
| Typed answers marked wrong for a valid spelling | Medium | Low | Multiple accepted answers, typo tolerance, host "accept this answer" at reveal |
| Determined cheaters use a second phone | High | Low | Accepted; stated openly; fast timers reduce the time to search |
| Projector washes out colours or text | Medium | Medium | Dark high-contrast theme, bold weights, test on the actual classroom projector in Phase 2 |
| Free-tier daily limit hit | Low | High | A class game uses 1–2% of the allowance; usage check before events; Paid plan is $5/month if ever needed |
| Free-tier terms change | Low | Medium | Logic in plain TypeScript in `packages/shared`; Supabase Realtime is the documented fallback |
| Option B: login cookies across Vercel and Cloudflare | Medium | Medium | Forward `/api` through Vercel rewrites and use socket tickets, or choose option A |
| iPhone Safari quirks (aggressive tab suspension) | Medium | Medium | Test on a real iPhone each phase; rejoin flow built in from Phase 1 |
| Inappropriate nicknames or typed answers on the big screen | Medium | Medium | Profanity filter, host rename/kick, typed answers shown only after filtering |
| Scope creep delays launch | Medium | Medium | Phased roadmap; anything not in v1 goes to a backlog |

## Open questions

Your answers from 6 Oct are recorded below and already folded into the plan. Questions A–H follow from them and matter most now; the numbered ones can be answered as we go.

**Decided**

- Audience: classroom, about 15 questions per game.
- Question and options appear only on the projector.
- There is always a projector over HDMI, so the big screen must look polished.
- Hosts use a real login (planned as Google sign-in).
- Penalties scale with severity: flag, void the answer, deduct points, kick.
- Everyone sees flags.
- Question types: multiple choice, true/false, type-the-answer.
- The address must be free; Vercel suggested.

**Follow-ups from your answers**

- A. What's the largest class you'll run a game for? The plan assumes up to 70.
- B. Is 15 questions a fixed game length or just typical? The plan defaults to 15 with a maximum of 50.
- C. Is Google sign-in enough, or do some hosts need email and password? Who hosts: only you, or any teacher or student who signs up?
- D. Hosting: option A (everything on Cloudflare, `workers.dev` address) or option B (pages on Vercel, game server on Cloudflare)?
- E. Are the default severity thresholds right (2 s and 10 s cut-offs, void, −500 points, kick at 6 strike points)? Should the host be able to switch auto-kick off?
- F. Should the flag notice on every phone name the player, or say "someone was flagged" while only the big screen shows who?
- G. Typo tolerance on by default for typed answers: okay?
- H. Projector setup: its resolution if you know it, whether the room lights stay on, and whether sound goes through HDMI speakers. Would you use two-window mode (projector shows the game, laptop shows controls)?

**Still open from before**

**Game rules**

9. Points: keep the speed-weighted formula, or flat points for any correct answer?
10. Streak bonus: yes or no? Any negative marking for wrong answers?
11. Can players change their answer before the timer ends?
12. Late joiners: allowed mid-game (starting from 0), or lobby closes at Start?
13. Should the host be able to advance automatically (auto-play) or always click Next?
14. Do you want a team mode in v1 or later?

**Content**

15. Images in questions: needed in v1? Video or audio clips?
16. Do you want CSV/spreadsheet import for questions, or is the in-app builder enough?
17. Any maths or code in questions that would need special formatting?
18. Languages: English UI only, or also Hindi/Kannada?

**Avatars and the character**

19. Avatar style: build-your-own from parts (face, eyes, mouth, accessory) as planned, or pick from a fixed set of characters, or emoji?
20. Should avatars be able to react or emote in the lobby?
21. The suspicious character: any concept in mind (owl detective, cat, shifty eyeball, a mascot for your college or club)? Do you or a friend want to draw it, or should we design it from your description?
22. Should the character also appear on the cheater's own phone, or only on the big screen?

**Results and data**

23. What should the host get at the end: on-screen podium only, CSV download, or emailed results?
24. How long should results be kept: delete right after, 30 days, or forever?
25. Should players be able to see a game recap (their answers vs correct) afterwards?

**Design and branding**

26. Name for the app? Any colour, logo or brand to follow (for example a club or fest identity)?
27. Light, dark or both? Any reference sites whose look you like?
28. Sound effects and music: wanted, and on which screens?

**Build and ownership**

29. Will you code this yourself (with Claude Code), with teammates, or should I generate the starter code for you?
30. Is a public GitHub repo OK (free CI minutes, portfolio value), or must it be private?
31. Do you already have a Cloudflare account and GitHub account?
32. Is there a target date — a specific event or demo — that sets the deadline?

## Sources

- [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) — free-plan requests, duration, SQLite rows, WebSocket billing
- [Cloudflare Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/) — per-object throughput and storage
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) — Workers, static assets, D1, Workers Logs, $5 Paid plan
- [Vercel Functions WebSockets](https://vercel.com/docs/functions/websockets) — public beta, one instance per connection, closes at max duration
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) — free, non-commercial personal use only
- [Supabase pricing](https://supabase.com/pricing) — free Realtime limits and 1-week pause
- [Firebase Realtime Database limits](https://firebase.google.com/docs/database/usage/limits) — 100 simultaneous connections on Spark
- [WebKit bug 206854](https://bugs.webkit.org/show_bug.cgi?id=206854) — Fullscreen API still missing on iPhone
