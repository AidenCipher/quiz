import type { FlagInfo, Question, ResultsPayload } from '@quiz/shared';

const esc = (v: unknown) => {
  const s = String(v ?? '');
  // Neutralise spreadsheet formula injection from user-typed nicknames.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(esc).join(',')).join('\n');

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const HEADER = [
  'type',
  'question',
  'option1',
  'option2',
  'option3',
  'option4',
  'correct',
  'accepted',
  'seconds',
  'points',
];

/** correct: mcq → 1-4, tf → true/false. accepted: answers separated by "|". */
export function questionsToCsv(qs: Question[]): string {
  return toCsv([
    HEADER,
    ...qs.map((q) => [
      q.type,
      q.text,
      ...[0, 1, 2, 3].map((i) => q.options[i] ?? ''),
      q.type === 'tf' ? (q.correctIndex === 0 ? 'true' : 'false') : q.type === 'mcq' ? (q.correctIndex ?? 0) + 1 : '',
      q.acceptedAnswers.join('|'),
      q.timeLimitS,
      q.points,
    ]),
  ]);
}

export function csvToQuestions(text: string, newId: () => string = () => crypto.randomUUID()): Question[] {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const col = (name: string) => head.map((h) => h.trim().toLowerCase()).indexOf(name);
  const idx = Object.fromEntries(HEADER.map((h) => [h, col(h)])) as Record<string, number>;
  const get = (r: string[], k: string) => (idx[k]! >= 0 ? (r[idx[k]!] ?? '').trim() : '');
  const timers = [5, 10, 20, 30, 60, 90, 120];
  return rows
    .filter((r) => get(r, 'question'))
    .map((r) => {
      const rawType = get(r, 'type').toLowerCase();
      const type: Question['type'] = rawType === 'tf' || rawType === 'text' ? rawType : 'mcq';
      const options =
        type === 'mcq' ? ['option1', 'option2', 'option3', 'option4'].map((k) => get(r, k)).filter(Boolean) : [];
      const correct = get(r, 'correct').toLowerCase();
      const secs = Number(get(r, 'seconds'));
      const pts = Number(get(r, 'points'));
      return {
        id: newId(),
        type,
        text: get(r, 'question').slice(0, 200),
        image: null,
        imageAlt: '',
        options,
        correctIndex:
          type === 'text'
            ? null
            : type === 'tf'
              ? correct === 'false' || correct === 'f'
                ? 1
                : 0
              : Math.max(0, Number(correct) - 1 || 0),
        acceptedAnswers:
          type === 'text'
            ? get(r, 'accepted')
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 5)
            : [],
        typoTolerance: true,
        timeLimitS: timers.includes(secs) ? secs : type === 'text' ? 30 : 20,
        points: [0, 1000, 2000].includes(pts) ? pts : 1000,
      };
    });
}

export function resultsToCsv(r: ResultsPayload): string {
  const players = toCsv([
    ['rank', 'nickname', 'score', 'correct', 'avg_time_s', 'flags', 'strike_points', 'removed'],
    ...r.players.map((p) => [
      p.rank || '',
      p.nickname,
      p.score,
      p.correct,
      (p.avgTimeMs / 1000).toFixed(2),
      p.flags,
      p.strikes,
      p.removed ? 'yes' : '',
    ]),
  ]);
  const flags = toCsv([
    ['nickname', 'question', 'time', 'kind', 'away_s', 'severity', 'strike_points', 'quick_answer', 'cleared'],
    ...r.flags.map((f: FlagInfo) => [
      f.nickname,
      f.q + 1,
      new Date(f.at).toISOString(),
      f.kind,
      (f.awayMs / 1000).toFixed(1),
      f.severity,
      f.strike,
      f.quickAnswer ? 'yes' : '',
      f.cleared ? 'yes' : '',
    ]),
  ]);
  return `${players}\n\nFLAG LOG\n${flags}`;
}

export function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
