// Join N simulated players to a live game and answer randomly.
// Usage: node tests/load/bots.mjs <pin> [count=30] [host=localhost:8787] [--cheat=<n>]
const [pin, countArg = '30', host = 'localhost:8787', ...rest] = process.argv.slice(2);
if (!pin) throw new Error('usage: node bots.mjs <pin> [count] [host]');
const count = Number(countArg);
const cheat = Number((rest.find((a) => a.startsWith('--cheat=')) ?? '--cheat=0').split('=')[1]);
const proto = host.startsWith('localhost') ? 'ws' : 'wss';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = { joined: 0, answered: 0, reveals: 0, latencies: [] };

function bot(i) {
  const ws = new WebSocket(`${proto}://${host}/ws/${pin}?role=player`);
  let questionAt = 0;
  ws.onopen = async () => {
    await sleep(Math.random() * 3000); // join burst spread over 3 s
    ws.send(
      JSON.stringify({
        t: 'join',
        nickname: `Bot ${i + 1}`,
        avatar: `f${i % 6}-s${(i >> 1) % 6}-e${(i >> 2) % 6}-m${i % 6}-a${(i >> 1) % 6}-b${i % 6}`,
      }),
    );
  };
  ws.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'joined') stats.joined++;
    if (m.t === 'question') {
      questionAt = Date.now();
      if (i < cheat) {
        // tab-switch for 2.5 s mid-question
        await sleep(500);
        ws.send(JSON.stringify({ t: 'presence', state: 'hidden' }));
        await sleep(2500);
        ws.send(JSON.stringify({ t: 'presence', state: 'visible', awayMs: 2500 }));
      }
      await sleep(1000 + Math.random() * 5000);
      if (m.qtype === 'text')
        ws.send(JSON.stringify({ t: 'answer', q: m.index, text: Math.random() < 0.5 ? 'Mumbai' : 'Pune' }));
      else
        ws.send(JSON.stringify({ t: 'answer', q: m.index, option: Math.floor(Math.random() * (m.optionCount || 2)) }));
    }
    if (m.t === 'answerAck' && m.ok) {
      stats.answered++;
      stats.latencies.push(Date.now() - questionAt);
    }
    if (m.t === 'reveal') stats.reveals++;
  };
  ws.onerror = () => {};
  return ws;
}
for (let i = 0; i < count; i++) bot(i);
setInterval(
  () => console.log(JSON.stringify({ joined: stats.joined, answered: stats.answered, reveals: stats.reveals })),
  3000,
);
