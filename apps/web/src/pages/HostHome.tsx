import { defaultSettings, newQuestion } from '@quiz/shared/quiz';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Footer, SkipLink } from '../components/Chrome';
import { Hoot } from '../components/Hoot';
import { ConfirmDialog, HostConsentDialog } from '../components/Dialogs';
import { api, type Me } from '../lib/api';

type QuizItem = Awaited<ReturnType<typeof api.quizzes>>[number];

export default function HostHome() {
  const [me, setMe] = useState<Me | null>(null);
  const reload = useCallback(() => void api.me().then(setMe), []);
  useEffect(reload, [reload]);
  if (!me) return <div className="p-8">Loading…</div>;
  if (!me.user) return <SignIn me={me} onDone={reload} />;
  return <Dashboard name={me.user.name} onSignOut={() => void api.logout().then(reload)} onGone={reload} />;
}

function SignIn({ me, onDone }: { me: Me; onDone: () => void }) {
  const [name, setName] = useState('');
  return (
    <div className="wallpaper host-wall">
      <SkipLink />
      <main id="main" tabIndex={-1} style={{ display: 'grid', placeItems: 'center', minHeight: '80dvh', padding: 20 }}>
        <div className="card" style={{ padding: 28, maxWidth: 420, width: '100%' }}>
          <h1 style={{ marginTop: 0 }}>Host a quiz</h1>
          <p style={{ color: 'var(--ink-muted)' }}>
            Hosts sign in so quizzes are saved to their account. Players never need to.
          </p>
          {me.google ? (
            <>
              <a className="btn btn-primary btn-lg" style={{ width: '100%' }} href="/api/auth/google">
                Sign in with Google
              </a>
              <p style={{ fontSize: 14, color: 'var(--ink-muted)' }}>
                We keep only your Google account ID and display name: not your email or picture. See the{' '}
                <Link to="/privacy" className="page-link">
                  privacy policy
                </Link>
                .
              </p>
            </>
          ) : (
            <p style={{ background: '#fff7e0', borderRadius: 10, padding: 10 }}>
              Google sign-in isn't configured on this server yet (set <code>GOOGLE_CLIENT_ID</code> and{' '}
              <code>GOOGLE_CLIENT_SECRET</code>).
            </p>
          )}
          {me.devLogin && (
            <form
              style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}
              onSubmit={(e) => {
                e.preventDefault();
                void api.devLogin(name || 'Dev Host').then(onDone);
              }}
            >
              <label className="label" htmlFor="dev-name">
                Development login (local only)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="dev-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
                <button className="btn" type="submit">
                  Sign in
                </button>
              </div>
            </form>
          )}
          <Link to="/" style={{ display: 'block', marginTop: 20, color: 'var(--ink-muted)' }}>
            ← Back
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Dashboard({ name, onSignOut, onGone }: { name: string; onSignOut: () => void; onGone: () => void }) {
  const nav = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizItem[] | null>(null);
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.results>>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    null | { kind: 'quiz'; item: QuizItem } | { kind: 'result'; id: string } | { kind: 'account' }
  >(null);

  const load = useCallback(() => {
    void api.quizzes().then(setQuizzes);
    void api.results().then(setResults);
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    const q = newQuestion('mcq');
    const { id } = await api.createQuiz({ title: 'Untitled quiz', settings: defaultSettings(), questions: [q] });
    nav(`/host/quiz/${id}`);
  };

  const hostLive = async (id: string) => {
    setConsentFor(null);
    setBusy(id);
    setProblem(null);
    try {
      const { pin } = await api.hostQuiz(id);
      nav(`/host/live/${pin}`);
    } catch (e) {
      const body = (e as { body?: { issues?: { message: string; path: (string | number)[] }[] } }).body;
      const first = body?.issues?.[0];
      setProblem(
        first
          ? `This quiz isn't ready: ${first.message}${typeof first.path[1] === 'number' ? ` (question ${Number(first.path[1]) + 1})` : ''}. Open it in the editor to fix.`
          : 'Could not start the game. Try again.',
      );
      setBusy(null);
    }
  };

  return (
    <div className="wallpaper host-wall">
      <SkipLink />
      <main id="main" tabIndex={-1} style={{ maxWidth: 880, margin: '0 auto', padding: '24px 16px' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Hoot mood="happy" size={44} /> My quizzes
          </h1>
          <span className="host-sub" style={{ fontWeight: 700 }}>
            {name}
          </span>
          <button className="btn" onClick={onSignOut}>
            Sign out
          </button>
          <button className="btn btn-primary" onClick={() => void create()}>
            + New quiz
          </button>
        </header>
        {problem && (
          <div
            role="alert"
            style={{
              background: '#fdecec',
              border: '1px solid #f5b5b5',
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
            }}
          >
            {problem}
          </div>
        )}
        {quizzes === null ? (
          <p>Loading…</p>
        ) : quizzes.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <p>No quizzes yet. Create your first one.</p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
            {quizzes.map((q) => (
              <li
                key={q.id}
                className="card"
                style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{q.title}</div>
                  <div style={{ color: 'var(--ink-muted)', fontSize: 14 }}>
                    {q.questionCount} question{q.questionCount === 1 ? '' : 's'} · edited{' '}
                    {new Date(q.updatedAt).toLocaleString()}
                  </div>
                </div>
                <Link className="btn" to={`/host/quiz/${q.id}`}>
                  Edit
                </Link>
                <button className="btn" onClick={() => setConfirm({ kind: 'quiz', item: q })}>
                  Delete
                </button>
                <button className="btn btn-primary" disabled={busy === q.id} onClick={() => setConsentFor(q.id)}>
                  {busy === q.id ? 'Starting…' : '▶ Host live'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <h2 style={{ marginTop: 40 }}>Past games</h2>
        {results.length === 0 ? (
          <p className="host-sub">Finished games appear here for 30 days, then are deleted automatically.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {results.map((r) => (
              <li
                key={r.id}
                className="card"
                style={{ padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <span style={{ flex: 1, minWidth: 200 }}>
                  <b>{r.title ?? 'Deleted quiz'}</b> · {r.players} player{r.players === 1 ? '' : 's'} ·{' '}
                  {new Date(r.endedAt).toLocaleString()}
                </span>
                <Link className="btn" to={`/host/results/${r.id}`}>
                  View
                </Link>
                <button className="btn" onClick={() => setConfirm({ kind: 'result', id: r.id })}>
                  Delete results
                </button>
              </li>
            ))}
          </ul>
        )}

        <h2 style={{ marginTop: 40 }}>Your data</h2>
        <div className="card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, flex: 1, minWidth: 240, color: 'var(--ink-muted)' }}>
            We keep your Google account ID, display name, quizzes and finished-game results. Download everything, or
            delete it all.
          </p>
          <a className="btn" href="/api/me/export" download>
            Download my data
          </a>
          <button className="btn btn-danger" onClick={() => setConfirm({ kind: 'account' })}>
            Delete my account
          </button>
        </div>
      </main>
      <Footer />

      {consentFor && (
        <HostConsentDialog onCancel={() => setConsentFor(null)} onConfirm={() => void hostLive(consentFor)} />
      )}
      {confirm?.kind === 'quiz' && (
        <ConfirmDialog
          title={`Delete “${confirm.item.title}”?`}
          confirmLabel="Delete quiz"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.item.id;
            setConfirm(null);
            void api.deleteQuiz(id).then(load);
          }}
        >
          The quiz and its questions are erased. This can't be undone.
        </ConfirmDialog>
      )}
      {confirm?.kind === 'result' && (
        <ConfirmDialog
          title="Delete these results?"
          confirmLabel="Delete results"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.id;
            setConfirm(null);
            void api.deleteResult(id).then(load);
          }}
        >
          The scores, nicknames and flag log of this game are erased for good.
        </ConfirmDialog>
      )}
      {confirm?.kind === 'account' && (
        <ConfirmDialog
          title="Delete your account?"
          confirmLabel="Delete everything"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void api.deleteAccount().then(onGone);
          }}
        >
          Your profile, sign-in sessions, quizzes, images and all saved game results are erased immediately. This can't
          be undone. Download your data first if you want a copy.
        </ConfirmDialog>
      )}
    </div>
  );
}
