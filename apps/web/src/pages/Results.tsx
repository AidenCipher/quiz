import type { ResultsPayload } from '@quiz/shared/protocol';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Footer, SkipLink } from '../components/Chrome';
import { api } from '../lib/api';
import { download, resultsToCsv } from '../lib/csv';

export default function Results() {
  const { id = '' } = useParams();
  const [r, setR] = useState<ResultsPayload | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    api.result(id).then(setR, () => setMissing(true));
  }, [id]);
  if (missing)
    return (
      <main style={{ padding: 24 }}>
        Results not found (they're kept for 30 days). <Link to="/host">Back</Link>
      </main>
    );
  if (!r) return <main style={{ padding: 24 }}>Loading…</main>;
  return (
    <div className="wallpaper host-wall">
      <SkipLink />
      <main id="main" tabIndex={-1} style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        <Link to="/host" className="legal-back">
          <span aria-hidden="true">←</span> My quizzes
        </Link>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 20px' }}>
          <h1 style={{ margin: 0, flex: 1 }}>{r.title}</h1>
          <button className="btn btn-primary" onClick={() => download(`quiz-results-${r.pin}.csv`, resultsToCsv(r))}>
            ⬇ Download CSV
          </button>
        </header>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-muted)' }}>
                {['#', 'Player', 'Score', 'Correct', 'Avg time', 'Flags', 'Strikes'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.players.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--line)', opacity: p.removed ? 0.55 : 1 }}>
                  <td style={{ padding: '8px 12px' }}>{p.rank || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                      <Avatar code={p.avatar} size={32} rounded={8} /> {p.nickname}
                      {p.removed && <em>(removed)</em>}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 700 }}>{p.score.toLocaleString()}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {p.correct}/{r.questionCount}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{(p.avgTimeMs / 1000).toFixed(1)}s</td>
                  <td style={{ padding: '8px 12px' }}>{p.flags || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{p.strikes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 style={{ marginTop: 32 }}>Flag log</h2>
        {r.flags.length === 0 ? (
          <p style={{ color: 'var(--ink-muted)' }}>No tab switches were flagged.</p>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--ink-muted)' }}>
                  {['Player', 'Q', 'Time', 'Kind', 'Away', 'Severity', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.flags.map((f) => (
                  <tr key={f.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 12px' }}>{f.nickname}</td>
                    <td style={{ padding: '8px 12px' }}>{f.q + 1}</td>
                    <td style={{ padding: '8px 12px' }}>{new Date(f.at).toLocaleTimeString()}</td>
                    <td style={{ padding: '8px 12px' }}>{f.kind}</td>
                    <td style={{ padding: '8px 12px' }}>{(f.awayMs / 1000).toFixed(1)}s</td>
                    <td style={{ padding: '8px 12px' }}>{f.severity}</td>
                    <td style={{ padding: '8px 12px' }}>{f.cleared ? 'cleared by host' : 'counted'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
