import {
  MAX_ACCEPTED_ANSWERS,
  MAX_QUESTIONS,
  MAX_QUESTION_TEXT,
  POINT_OPTIONS,
  SHAPES,
  TIMER_OPTIONS,
  MAX_IMAGE_BYTES,
} from '@quiz/shared/constants';
import { QuestionSchema, newQuestion, type GameSettings, type Question, type QuestionType } from '@quiz/shared/quiz';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { QuestionLayout } from '../components/BigScreen';
import { api } from '../lib/api';
import { SkipLink } from '../components/Chrome';
import { HostConsentDialog } from '../components/Dialogs';
import { GenerateDialog } from '../components/GenerateDialog';
import { csvToQuestions, download, questionsToCsv } from '../lib/csv';
import { useDialog } from '../lib/useDialog';

type SaveState = 'saved' | 'saving' | 'error' | 'dirty';
const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'Multiple choice',
  tf: 'True / false',
  text: 'Type the answer',
};

/** Compress in the browser so stored images stay under ~200 KB. */
async function compressImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  let w = Math.min(1280, bmp.width);
  for (let attempt = 0; attempt < 6; attempt++) {
    const h = Math.round((bmp.height * w) / bmp.width);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const url = canvas.toDataURL('image/jpeg', quality);
      if ((url.length * 3) / 4 <= MAX_IMAGE_BYTES) return url;
    }
    w = Math.round(w * 0.75);
  }
  throw new Error('Image is too large even after compression');
}

export default function Builder() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sel, setSel] = useState(0);
  const [save, setSave] = useState<SaveState>('saved');
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [hosting, setHosting] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const latest = useRef({ title, settings, questions });
  latest.current = { title, settings, questions };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.quiz(id).then(
      (q) => {
        setTitle(q.title);
        setSettings(q.settings);
        setQuestions(q.questions);
        setLoaded(true);
      },
      () => nav('/host'),
    );
  }, [id, nav]);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setSave('saving');
    try {
      const { title, settings, questions } = latest.current;
      await api.saveQuiz(id, { title: title.trim() || 'Untitled quiz', settings, questions });
      setSave(dirty.current ? 'dirty' : 'saved');
    } catch {
      dirty.current = true;
      setSave('error');
    }
  }, [id]);

  const touch = useCallback(() => {
    dirty.current = true;
    setSave('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  const update = (i: number, patch: Partial<Question>) => {
    setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...patch } : q)));
    touch();
  };
  const add = (type: QuestionType) => {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions((qs) => [...qs, newQuestion(type)]);
    setSel(questions.length);
    touch();
  };
  const remove = (i: number) => {
    if (questions.length === 1) return;
    setQuestions((qs) => qs.filter((_, k) => k !== i));
    setSel((s) => Math.max(0, Math.min(s, questions.length - 2)));
    touch();
  };
  const duplicate = (i: number) => {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions((qs) => {
      const copy = { ...qs[i]!, id: crypto.randomUUID() };
      return [...qs.slice(0, i + 1), copy, ...qs.slice(i + 1)];
    });
    setSel(i + 1);
    touch();
  };
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= questions.length) return;
    setQuestions((qs) => {
      const next = qs.slice();
      const [q] = next.splice(from, 1);
      next.splice(to, 0, q!);
      return next;
    });
    setSel(to);
    touch();
  };

  /** Reviewed questions from the Claude helper. A brand-new quiz's single empty starter question is replaced, not kept. */
  const addGenerated = (added: Question[]) => {
    const emptyStarter = questions.length === 1 && !questions[0]!.text && questions[0]!.options.every((o) => !o);
    const base = emptyStarter ? [] : questions;
    setQuestions([...base, ...added].slice(0, MAX_QUESTIONS));
    setSel(base.length);
    setShowGenerate(false);
    touch();
  };

  const validity = useMemo(() => questions.map((q) => QuestionSchema.safeParse(q)), [questions]);
  const invalidCount = validity.filter((v) => !v.success).length;
  const q = questions[sel];

  const hostLive = async () => {
    setProblem(null);
    if (invalidCount > 0) {
      const first = validity.findIndex((v) => !v.success);
      setSel(first);
      setProblem(
        `Question ${first + 1} isn't complete yet: ${validity[first]!.error?.issues[0]?.message ?? 'check the highlighted fields'}.`,
      );
      return;
    }
    setShowConsent(true);
  };

  const startHosting = async () => {
    setShowConsent(false);
    setHosting(true);
    try {
      dirty.current = true;
      await flush();
      const { pin } = await api.hostQuiz(id);
      nav(`/host/live/${pin}`);
    } catch (e) {
      const issue = (e as { body?: { issues?: { message: string }[] } }).body?.issues?.[0]?.message;
      setProblem(issue ? `Could not start the game: ${issue}.` : 'Could not start the game. Please try again.');
      setHosting(false);
    }
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    let imported: Question[] = [];
    try {
      if (file.name.endsWith('.json')) {
        const raw = JSON.parse(text) as { questions?: unknown[] } | unknown[];
        const list = Array.isArray(raw) ? raw : (raw.questions ?? []);
        imported = list.map((x) => ({ ...newQuestion('mcq'), ...(x as object), id: crypto.randomUUID() }) as Question);
      } else imported = csvToQuestions(text);
    } catch {
      setProblem('Could not read that file.');
      return;
    }
    if (!imported.length) return setProblem('No questions found in that file.');
    setQuestions((qs) => [...qs, ...imported].slice(0, MAX_QUESTIONS));
    touch();
  };

  if (!loaded || !settings) return <div className="p-8">Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <SkipLink />
      <header
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          padding: '12px 16px',
          background: '#fff',
          borderBottom: '1px solid var(--line)',
          flexWrap: 'wrap',
        }}
      >
        <Link to="/host" aria-label="Back to my quizzes" style={{ textDecoration: 'none', fontSize: 22 }}>
          ←
        </Link>
        <input
          className="input"
          style={{ flex: 1, minWidth: 200, fontWeight: 700, fontSize: 18 }}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            touch();
          }}
          maxLength={100}
          aria-label="Quiz title"
        />
        <span
          role="status"
          style={{ fontSize: 14, color: save === 'error' ? 'var(--bad)' : 'var(--ink-muted)', minWidth: 90 }}
        >
          {save === 'saved'
            ? '✓ Saved'
            : save === 'saving'
              ? 'Saving…'
              : save === 'error'
                ? 'Save failed — retrying'
                : 'Unsaved…'}
        </span>
        <button className="btn" onClick={() => setShowSettings(true)}>
          ⚙ Game settings
        </button>
        <button className="btn" onClick={() => setShowGenerate(true)}>
          <span aria-hidden="true">✨</span> Write questions with Claude
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json"
          hidden
          onChange={(e) => e.target.files?.[0] && void onImport(e.target.files[0])}
        />
        <button className="btn" onClick={() => download(`${title || 'quiz'}.csv`, questionsToCsv(questions))}>
          CSV
        </button>
        <button
          className="btn"
          onClick={() =>
            download(
              `${title || 'quiz'}.json`,
              JSON.stringify({ title, settings, questions }, null, 2),
              'application/json',
            )
          }
        >
          JSON
        </button>
        <button className="btn btn-primary" onClick={() => void hostLive()} disabled={hosting}>
          {hosting ? 'Starting…' : '▶ Host live'}
        </button>
      </header>
      {problem && (
        <div role="alert" style={{ background: '#fdecec', borderBottom: '1px solid #f5b5b5', padding: '10px 16px' }}>
          {problem}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0, flexWrap: 'wrap' }}>
        <nav
          aria-label="Questions"
          className="b-nav"
          style={{ flex: 'none', padding: 12, background: '#fff', minWidth: 0 }}
        >
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {questions.map((qq, i) => (
              <li
                key={qq.id}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragFrom !== null && move(dragFrom, i)}
                style={{
                  border: `2px solid ${i === sel ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 12,
                  padding: 8,
                  minWidth: 0,
                  background: i === sel ? '#f0eeff' : '#fff',
                }}
              >
                <button
                  className="btn-ghost"
                  style={{
                    border: 0,
                    width: '100%',
                    textAlign: 'left',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'baseline',
                    minWidth: 0,
                  }}
                  onClick={() => setSel(i)}
                  aria-current={i === sel}
                >
                  <b>{i + 1}</b>
                  <span
                    style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {qq.text || <i style={{ color: 'var(--ink-muted)' }}>Empty question</i>}
                  </span>
                  {!validity[i]!.success && (
                    <span title="Incomplete" aria-label="Incomplete" style={{ color: 'var(--bad)' }}>
                      ●
                    </span>
                  )}
                </button>
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    marginTop: 4,
                    fontSize: 13,
                    color: 'var(--ink-muted)',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ flex: 1 }}>{TYPE_LABEL[qq.type]}</span>
                  <button
                    className="btn-ghost"
                    style={{ border: 0 }}
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label={`Move question ${i + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ border: 0 }}
                    onClick={() => move(i, i + 1)}
                    disabled={i === questions.length - 1}
                    aria-label={`Move question ${i + 1} down`}
                  >
                    ↓
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ border: 0 }}
                    onClick={() => duplicate(i)}
                    aria-label={`Duplicate question ${i + 1}`}
                  >
                    ⧉
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ border: 0 }}
                    onClick={() => remove(i)}
                    disabled={questions.length === 1}
                    aria-label={`Delete question ${i + 1}`}
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
            <div className="label">
              Add question ({questions.length}/{MAX_QUESTIONS})
            </div>
            {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
              <button key={t} className="btn" onClick={() => add(t)} disabled={questions.length >= MAX_QUESTIONS}>
                + {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </nav>

        {q && (
          <section
            id="main"
            tabIndex={-1}
            aria-label={`Editing question ${sel + 1}`}
            className="b-main"
            style={{ flex: 1, padding: 16, display: 'grid', gap: 16, alignContent: 'start' }}
          >
            <Editor
              q={q}
              errors={validity[sel]!.success ? [] : validity[sel]!.error.issues.map((i) => String(i.path[0]))}
              onChange={(p) => update(sel, p)}
              onError={setProblem}
              globalTypo={settings.typoTolerance}
            />
            <div>
              <div className="label">Live preview — how it looks on the projector</div>
              <Preview q={q} index={sel} total={questions.length} />
            </div>
          </section>
        )}
      </div>

      {showGenerate && (
        <GenerateDialog
          existing={questions.map((q) => q.text)}
          onAdd={addGenerated}
          onClose={() => setShowGenerate(false)}
        />
      )}
      {showConsent && (
        <HostConsentDialog onCancel={() => setShowConsent(false)} onConfirm={() => void startHosting()} />
      )}
      {showSettings && (
        <SettingsDialog
          value={settings}
          onClose={() => setShowSettings(false)}
          onChange={(s) => {
            setSettings(s);
            touch();
          }}
        />
      )}
    </div>
  );
}

function Preview({ q, index, total }: { q: Question; index: number; total: number }) {
  const W = 640;
  const scale = W / 1920;
  return (
    <div
      style={{
        width: W,
        maxWidth: '100%',
        aspectRatio: '16/9',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 12,
        background: 'var(--stage)',
        color: 'var(--on-stage)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          fontWeight: 600,
        }}
      >
        <QuestionLayout
          index={index}
          total={total}
          qtype={q.type}
          text={q.text}
          image={q.image}
          imageAlt={q.imageAlt}
          options={q.type === 'tf' ? ['True', 'False'] : q.options.map((o, i) => o || `Option ${i + 1}`)}
          remainingMs={q.timeLimitS * 1000}
          limitMs={q.timeLimitS * 1000}
          answered={{ answered: 0, total: 0 }}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
  id,
}: {
  label: string;
  error?: boolean;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id} style={error ? { color: 'var(--bad)' } : undefined}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Editor({
  q,
  errors,
  onChange,
  onError,
  globalTypo,
}: {
  q: Question;
  errors: string[];
  onChange: (p: Partial<Question>) => void;
  onError: (m: string | null) => void;
  globalTypo: boolean;
}) {
  const bad = (k: string) => errors.includes(k);
  const fileInput = useRef<HTMLInputElement>(null);
  const changeType = (type: QuestionType) => {
    const base = newQuestion(type);
    onChange({
      type,
      options: type === 'mcq' ? (q.options.length >= 2 ? q.options : base.options) : [],
      correctIndex: type === 'text' ? null : Math.min(q.correctIndex ?? 0, type === 'tf' ? 1 : 3),
      acceptedAnswers: type === 'text' ? (q.acceptedAnswers.length ? q.acceptedAnswers : ['']) : [],
      timeLimitS: type === 'text' && q.type !== 'text' ? 30 : q.timeLimitS,
    });
  };
  const setOption = (i: number, v: string) => onChange({ options: q.options.map((o, k) => (k === i ? v : o)) });

  return (
    <div className="card" style={{ padding: 16, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label="Question type">
        {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={q.type === t}
            className={`btn ${q.type === t ? 'btn-primary' : ''}`}
            onClick={() => changeType(t)}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <Field label={`Question (${q.text.length}/${MAX_QUESTION_TEXT})`} error={bad('text')} id="qtext">
        <textarea
          id="qtext"
          className="input"
          rows={2}
          maxLength={MAX_QUESTION_TEXT}
          value={q.text}
          onChange={(e) => onChange({ text: e.target.value })}
          style={{ resize: 'vertical' }}
        />
      </Field>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {q.image ? (
            <>
              <img
                src={q.image}
                alt={q.imageAlt || 'Question illustration (no description yet)'}
                style={{ height: 64, borderRadius: 8 }}
              />
              <button className="btn" onClick={() => onChange({ image: null, imageAlt: '' })}>
                Remove image
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => fileInput.current?.click()}>
                🖼 Add image
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                tabIndex={-1}
                aria-hidden="true"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    onError(null);
                    onChange({ image: await compressImage(f) });
                  } catch (err) {
                    onError(String((err as Error).message));
                  }
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                Only upload images you have the right to use.
              </span>
            </>
          )}
        </div>
        {q.image && (
          <Field label="Describe the image for screen readers (required)" error={bad('imageAlt')} id="alt">
            <input
              id="alt"
              className="input"
              value={q.imageAlt}
              maxLength={150}
              placeholder="e.g. A map of India with Maharashtra highlighted"
              aria-invalid={bad('imageAlt')}
              onChange={(e) => onChange({ imageAlt: e.target.value })}
            />
          </Field>
        )}
      </div>

      {q.type === 'mcq' && (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <legend className="label">Options — select the correct one</legend>
          {q.options.map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="radio"
                name="correct"
                checked={q.correctIndex === i}
                onChange={() => onChange({ correctIndex: i })}
                aria-label={`Option ${i + 1} is correct`}
                style={{ width: 22, height: 22 }}
              />
              <span
                aria-hidden="true"
                className={`tile tile-${i}`}
                style={{ width: 40, height: 40, justifyContent: 'center', fontSize: 20 }}
              >
                {SHAPES[i]}
              </span>
              <input
                className="input"
                value={o}
                maxLength={100}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => setOption(i, e.target.value)}
                aria-label={`Option ${i + 1} text`}
              />
              {q.options.length > 2 && (
                <button
                  className="btn"
                  aria-label={`Remove option ${i + 1}`}
                  onClick={() =>
                    onChange({
                      options: q.options.filter((_, k) => k !== i),
                      correctIndex:
                        q.correctIndex === null
                          ? 0
                          : q.correctIndex === i
                            ? 0
                            : q.correctIndex > i
                              ? q.correctIndex - 1
                              : q.correctIndex,
                    })
                  }
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {q.options.length < 4 && (
            <button
              className="btn"
              style={{ width: 'fit-content' }}
              onClick={() => onChange({ options: [...q.options, ''] })}
            >
              + Add option
            </button>
          )}
          {bad('options') || bad('correctIndex') ? (
            <div style={{ color: 'var(--bad)', fontSize: 14 }}>
              Fill in at least two options and mark the correct one.
            </div>
          ) : null}
        </fieldset>
      )}

      {q.type === 'tf' && (
        <div style={{ display: 'flex', gap: 8 }} role="radiogroup" aria-label="Correct answer">
          {['True', 'False'].map((label, i) => (
            <button
              key={label}
              role="radio"
              aria-checked={q.correctIndex === i}
              className={`btn ${q.correctIndex === i ? 'btn-primary' : ''}`}
              onClick={() => onChange({ correctIndex: i })}
            >
              {label} is correct
            </button>
          ))}
        </div>
      )}

      {q.type === 'text' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="label" style={bad('acceptedAnswers') ? { color: 'var(--bad)' } : undefined}>
            Accepted answers (up to {MAX_ACCEPTED_ANSWERS}) — capitals, punctuation and accents are ignored
          </div>
          {q.acceptedAnswers.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={a}
                maxLength={40}
                aria-label={`Accepted answer ${i + 1}`}
                onChange={(e) =>
                  onChange({ acceptedAnswers: q.acceptedAnswers.map((x, k) => (k === i ? e.target.value : x)) })
                }
              />
              {q.acceptedAnswers.length > 1 && (
                <button
                  className="btn"
                  aria-label={`Remove accepted answer ${i + 1}`}
                  onClick={() => onChange({ acceptedAnswers: q.acceptedAnswers.filter((_, k) => k !== i) })}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {q.acceptedAnswers.length < MAX_ACCEPTED_ANSWERS && (
            <button
              className="btn"
              style={{ width: 'fit-content' }}
              onClick={() => onChange({ acceptedAnswers: [...q.acceptedAnswers, ''] })}
            >
              + Add accepted answer
            </button>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={q.typoTolerance}
              disabled={!globalTypo}
              onChange={(e) => onChange({ typoTolerance: e.target.checked })}
            />
            Allow small typos (1 letter for 5+ letters, 2 for 10+){!globalTypo && ' — turned off in game settings'}
          </label>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Field label="Timer" id="timer">
          <select
            id="timer"
            className="input"
            value={q.timeLimitS}
            onChange={(e) => onChange({ timeLimitS: Number(e.target.value) })}
          >
            {TIMER_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t} seconds
              </option>
            ))}
          </select>
        </Field>
        <Field label="Points" id="points">
          <select
            id="points"
            className="input"
            value={q.points}
            onChange={(e) => onChange({ points: Number(e.target.value) })}
          >
            {POINT_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p === 0 ? '0 (practice)' : p === 1000 ? '1,000 (standard)' : '2,000 (double)'}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function SettingsDialog({
  value,
  onChange,
  onClose,
}: {
  value: GameSettings;
  onChange: (s: GameSettings) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
  const t = value.thresholds;
  const set = (patch: Partial<GameSettings>) => onChange({ ...value, ...patch });
  const setT = (patch: Partial<GameSettings['thresholds']>) => onChange({ ...value, thresholds: { ...t, ...patch } });
  const sec = (ms: number, apply: (ms: number) => void, label: string, min = 0, max = 60) => (
    <Field label={label} id={label}>
      <input
        id={label}
        className="input"
        type="number"
        min={min}
        max={max}
        step={0.5}
        value={ms / 1000}
        onChange={(e) => apply(Math.round(Number(e.target.value) * 1000))}
      />
    </Field>
  );
  const check = (label: string, k: keyof GameSettings, hint?: string) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <input
        type="checkbox"
        checked={value[k] as boolean}
        onChange={(e) => set({ [k]: e.target.checked } as Partial<GameSettings>)}
        style={{ marginTop: 4 }}
      />
      <span>
        {label}
        {hint && <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{hint}</div>}
      </span>
    </label>
  );
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Game settings"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 560,
          width: '100%',
          maxHeight: '90dvh',
          overflowY: 'auto',
          padding: 20,
          display: 'grid',
          gap: 14,
        }}
      >
        <h2 style={{ margin: 0 }}>Game settings</h2>
        {check(
          'Anti-cheat: flag tab switches',
          'antiCheat',
          'Records, shows and penalises switching away during a question.',
        )}
        {check('Allow late joiners', 'lateJoin', 'Players who join after the start score 0 for missed questions.')}
        {check('Allow changing an answer before the timer ends', 'allowAnswerChange')}
        {check('Typo tolerance for typed answers', 'typoTolerance')}
        {check('Lobby music', 'music')}
        {check(
          'Funny call-outs (meme and vine jokes after answers, flags and no-shows)',
          'funCallouts',
          'Playful and kind, never mean. Turn off for a plain, serious game.',
        )}
        <h3 style={{ margin: '8px 0 0' }}>Severity ladder</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {sec(t.blurIgnoreMs, (ms) => setT({ blurIgnoreMs: ms }), 'Ignore focus loss shorter than (s)')}
          {sec(t.blurMinorMaxMs, (ms) => setT({ blurMinorMaxMs: ms }), 'Focus loss is minor up to (s)')}
          {sec(t.hiddenMinorMaxMs, (ms) => setT({ hiddenMinorMaxMs: ms }), 'Tab hidden is minor under (s)')}
          {sec(t.moderateMaxMs, (ms) => setT({ moderateMaxMs: ms }), 'Moderate up to, then major (s)')}
          {sec(
            t.quickAnswerMs,
            (ms) => setT({ quickAnswerMs: ms }),
            'Answer within this long of returning = major (s)',
          )}
          <Field label="Points deducted for a major flag" id="ded">
            <input
              id="ded"
              className="input"
              type="number"
              min={0}
              step={100}
              value={value.majorDeduction}
              onChange={(e) => set({ majorDeduction: Math.max(0, Number(e.target.value)) })}
            />
          </Field>
        </div>
        {check('Auto-remove players at the strike limit', 'autoKick', 'The host gets a 5-second window to override.')}
        <Field label="Strike points that trigger removal (minor = 1, moderate = 2, major = 3)" id="kick">
          <input
            id="kick"
            className="input"
            type="number"
            min={1}
            max={30}
            value={value.kickStrikes}
            disabled={!value.autoKick}
            onChange={(e) => set({ kickStrikes: Math.max(1, Number(e.target.value)) })}
          />
        </Field>
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
