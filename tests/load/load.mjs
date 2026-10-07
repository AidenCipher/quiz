// 150-player load test (plan: "Testing and observability → Load").
// Usage: node tests/load/load.mjs [players=150] [questions=15] [base=http://localhost:8787]
// Needs a server with DEV_LOGIN=1 (local `wrangler dev` or staging). Pass criteria come from the implementation plan:
//   join burst of N players within 30 s, every answer accepted, all N answers sent within 1 s,
//   reveal received by every player < 500 ms after the last answer, no dropped/errored sockets.
const [playersArg = '150', questionsArg = '15', base = 'http://localhost:8787'] = process.argv.slice(2);
const N = Number(playersArg);
const Q = Number(questionsArg);
const wsBase = base.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) =>
  a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0;

/* ---------- host setup ---------- */
async function api(path, init = {}, cookie) {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers },
  });
  return res;
}
const login = await api('/api/auth/dev', { method: 'POST', body: JSON.stringify({ name: `Load ${Date.now()}` }) });
if (!login.ok) throw new Error(`dev login failed (${login.status}); the server needs DEV_LOGIN=1`);
const cookie = login.headers.get('set-cookie').split(';')[0];
const questions = Array.from({ length: Q }, (_, i) => ({
  id: `q${i}`,
  type: i % 5 === 4 ? 'tf' : 'mcq',
  text: `Load question ${i + 1}`,
  options: i % 5 === 4 ? [] : ['A', 'B', 'C', 'D'],
  correctIndex: i % 5 === 4 ? 1 : i % 4,
  timeLimitS: 10,
  points: 1000,
}));
const { id: quizId } = await (
  await api(
    '/api/quizzes',
    { method: 'POST', body: JSON.stringify({ title: 'Load test', settings: {}, questions }) },
    cookie,
  )
).json();
const hosted = await api(
  `/api/quizzes/${quizId}/host`,
  { method: 'POST', body: JSON.stringify({ audienceConsent: true }) },
  cookie,
);
if (!hosted.ok) throw new Error(`host failed: ${hosted.status} ${await hosted.text()}`);
const { pin } = await hosted.json();
const { ticket } = await (await api(`/api/games/${pin}/ticket?role=host`, { method: 'POST' }, cookie)).json();
console.log(`game ${pin} on ${base}: ${N} players, ${Q} questions`);

/* ---------- sockets ---------- */
const stats = {
  joinMs: [],
  joinFailures: 0,
  sockets: 0,
  closedEarly: 0,
  errors: [],
  acks: 0,
  ackRejected: 0,
  rejections: [],
  missedQuestion: 0,
  serverCloseMs: [],
  answersSent: 0,
  revealLatency: [],
  ackLatency: [],
  perQuestion: [],
  messagesIn: 0,
  messagesOut: 0,
  bytesIn: 0,
};
const hostWs = new WebSocket(`${wsBase}/ws/${pin}?role=host&ticket=${encodeURIComponent(ticket)}`);
const hostMsgs = [];
hostWs.onmessage = (e) => hostMsgs.push(JSON.parse(e.data));
await new Promise((r) => (hostWs.onopen = r));
const hostSend = (o) => hostWs.send(JSON.stringify(o));
const waitHost = async (pred, ms = 20000) => {
  const t0 = Date.now();
  for (;;) {
    const hit = hostMsgs.find(pred);
    if (hit) return hit;
    if (Date.now() - t0 > ms) throw new Error('host timeout waiting for message');
    await sleep(5);
  }
};

const bots = [];
let current = { q: -1, sentAt: new Map(), revealAt: new Map(), lastAnswerAt: 0 };
function makeBot(i) {
  const bot = { i, ws: null, id: null, joinedAt: 0, ready: false, closed: false, qtype: null };
  const t0 = performance.now();
  bot.ws = new WebSocket(`${wsBase}/ws/${pin}?role=player`);
  stats.sockets++;
  bot.ws.onopen = () => {
    stats.messagesOut++;
    bot.ws.send(
      JSON.stringify({
        t: 'join',
        nickname: `Bot ${i + 1}`,
        avatar: `f${i % 6}-s${(i >> 1) % 6}-e${(i >> 2) % 6}-m${i % 6}-a${(i >> 1) % 6}-b${i % 6}`,
      }),
    );
  };
  bot.ws.onmessage = (e) => {
    stats.messagesIn++;
    stats.bytesIn += e.data.length;
    const m = JSON.parse(e.data);
    if (m.t === 'joined') {
      bot.id = m.playerId;
      bot.ready = true;
      stats.joinMs.push(performance.now() - t0);
    } else if (m.t === 'error') {
      stats.errors.push(`${i}: ${m.code}`);
      if (!bot.ready) stats.joinFailures++;
    } else if (m.t === 'question') {
      bot.qIndex = m.index;
      bot.qtype = m.qtype;
      bot.optionCount = m.optionCount;
      bot.onQuestion?.(m);
    } else if (m.t === 'answerAck') {
      if (m.ok) {
        stats.acks++;
        stats.ackLatency.push(performance.now() - (current.sentAt.get(i) ?? performance.now()));
      } else {
        stats.ackRejected++;
        stats.rejections.push(
          `q${m.q + 1} bot ${i + 1}: ${m.reason} (sent ${Math.round(performance.now() - (current.sentAt.get(i) ?? performance.now()))} ms ago)`,
        );
      }
    } else if (m.t === 'reveal') {
      current.revealAt.set(i, performance.now());
    }
  };
  bot.ws.onclose = () => {
    bot.closed = true;
    if (current.q >= 0 || !bot.ready) stats.closedEarly++;
  };
  bot.ws.onerror = () => {};
  return bot;
}

/* ---------- 1. join burst: all players inside 30 s ---------- */
const burstStart = performance.now();
for (let i = 0; i < N; i++) {
  bots.push(makeBot(i));
  await sleep((25_000 / N) * Math.random() * 2); // average 25 s spread, random arrival
}
for (let t = 0; t < 400 && bots.filter((b) => b.ready).length < N; t++) await sleep(50);
const joinedAll = (performance.now() - burstStart) / 1000;
const lobby = await waitHost((m) => m.t === 'lobby' && m.players.length === N, 10000).catch(() => null);
console.log(
  `joined ${bots.filter((b) => b.ready).length}/${N} in ${joinedAll.toFixed(1)} s (host lobby sees ${lobby ? lobby.players.length : '?'})`,
);

/* ---------- 2. play ---------- */
hostSend({ t: 'start' });
for (let q = 0; q < Q; q++) {
  await waitHost((m) => m.t === 'getready' && m.index === q);
  hostSend({ t: 'skip' }); // skip the 3 s countdown
  await waitHost((m) => m.t === 'question' && m.index === q);
  current = { q, sentAt: new Map(), revealAt: new Map(), lastAnswerAt: 0 };
  await sleep(200); // everyone has the question
  // The stress moment: every player answers inside the same 1 s window.
  const sendStart = performance.now();
  await Promise.all(
    bots.map(async (b) => {
      await sleep(Math.random() * 1000);
      // A phone only answers once it has actually received this question (slow links get it late).
      for (let w = 0; w < 100 && b.qIndex !== q && !b.closed; w++) await sleep(50);
      if (b.closed || b.qIndex !== q) {
        stats.missedQuestion++;
        return;
      }
      const opt = b.qtype === 'tf' ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * (b.optionCount || 4));
      current.sentAt.set(b.i, performance.now());
      b.ws.send(JSON.stringify({ t: 'answer', q, option: opt }));
      stats.messagesOut++;
      stats.answersSent++;
      current.lastAnswerAt = Math.max(current.lastAnswerAt, performance.now());
    }),
  );
  const sendSpan = performance.now() - sendStart;
  await waitHost((m) => m.t === 'reveal' && m.index === q, 15000);
  // Ask the game room how long ITS part took (host-only debug snapshot): trigger → reveal handed to the sockets.
  const mark = hostMsgs.length;
  hostSend({ t: 'debug' });
  const dbg = await waitHost((m) => m.t === 'debug' && hostMsgs.indexOf(m) >= mark, 5000).catch(() => null);
  if (dbg?.lastClose && dbg.lastClose.index === q) stats.serverCloseMs.push(dbg.lastClose.ms);
  for (let w = 0; w < 60 && current.revealAt.size < N; w++) await sleep(50); // let every reveal arrive (up to 3 s)
  const lat = [...current.revealAt.values()].map((t) => t - current.lastAnswerAt).filter((x) => x > -50);
  const worst = Math.max(...lat, 0);
  stats.revealLatency.push(...lat.map((x) => Math.max(0, x)));
  stats.perQuestion.push({
    q: q + 1,
    answersSpanMs: Math.round(sendSpan),
    revealsSeen: current.revealAt.size,
    worstRevealMs: Math.round(worst),
  });
  hostSend({ t: 'next' }); // leaderboard
  await waitHost((m) => m.t === 'leaderboard' && m.index === q);
  if (q < Q - 1) hostSend({ t: 'next' });
  else hostSend({ t: 'next' }); // podium
  process.stdout.write(`\rquestion ${q + 1}/${Q} done (worst reveal ${Math.round(worst)} ms)   `);
}
const podium = await waitHost((m) => m.t === 'podium');
console.log('\npodium reached; saved results include', podium.results.players.length, 'players');

/* ---------- report ---------- */
const checks = [
  ['all players joined', bots.filter((b) => b.ready).length === N],
  [`join burst finished within 30 s (${joinedAll.toFixed(1)} s)`, joinedAll <= 32],
  ['no join failures or socket errors', stats.joinFailures === 0 && stats.errors.length === 0],
  ['no sockets dropped during the game', stats.closedEarly === 0],
  [
    `every answer accepted (${stats.acks}/${stats.answersSent}, ${stats.ackRejected} rejected)`,
    stats.acks === stats.answersSent && stats.ackRejected === 0,
  ],
  [`all ${N} answers sent inside ~1 s per question`, stats.perQuestion.every((p) => p.answersSpanMs <= 1300)],
  [`every player received every reveal`, stats.perQuestion.every((p) => p.revealsSeen === N)],
  [
    `reveal latency p95 < 500 ms (p50 ${Math.round(pct(stats.revealLatency, 50))}, p95 ${Math.round(pct(stats.revealLatency, 95))}, max ${Math.round(Math.max(...stats.revealLatency))} ms)`,
    pct(stats.revealLatency, 95) < 500,
  ],
  [`every phone received every question before answering (${stats.missedQuestion} missed)`, stats.missedQuestion === 0],
  [`results saved for all players`, podium.results.players.length === N],
];
console.log('\n--- results ---');
console.log(`join latency  p50 ${Math.round(pct(stats.joinMs, 50))} ms  p95 ${Math.round(pct(stats.joinMs, 95))} ms`);
console.log(
  `answer ack    p50 ${Math.round(pct(stats.ackLatency, 50))} ms  p95 ${Math.round(pct(stats.ackLatency, 95))} ms  max ${Math.round(Math.max(...stats.ackLatency))} ms`,
);
console.log(
  `server-side   last answer → reveal sent, I/O wait only (Workers freeze Date.now() while code runs, so 0 = no waiting, not zero CPU): p50 ${Math.round(pct(stats.serverCloseMs, 50))} ms  p95 ${Math.round(pct(stats.serverCloseMs, 95))} ms  max ${Math.round(Math.max(0, ...stats.serverCloseMs))} ms  (${stats.serverCloseMs.length} questions)`,
);
console.log(
  `traffic       ${stats.messagesOut} messages sent by players, ${stats.messagesIn} received (${(stats.bytesIn / 1024 / 1024).toFixed(1)} MiB)`,
);
console.table(stats.perQuestion);
if (stats.rejections.length) console.log('rejected answers:\n  ' + stats.rejections.join('\n  '));
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
hostSend({ t: 'end' });
await sleep(300);
bots.forEach((b) => b.ws.close());
hostWs.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
