import { SHAPES } from '@quiz/shared/constants';
import {
  DIFFICULTIES,
  DIFFICULTY_HELP,
  GenerateRequestSchema,
  MAX_TOPICS,
  buildPrompt,
  parseGenerated,
  parseTopics,
  remainingCapacity,
  type Difficulty,
  type GeneratedQuestion,
  type ParseResult,
} from '@quiz/shared/generate';
import type { Question, QuestionType } from '@quiz/shared/quiz';
import { useMemo, useRef, useState } from 'react';
import { useDialog } from '../lib/useDialog';
import { Overlay } from './Dialogs';

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'Multiple choice',
  tf: 'True / false',
  text: 'Type the answer',
};
const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', mixed: 'Mixed' };

type Step = 'setup' | 'prompt' | 'review';

/**
 * Writes quiz questions with the host's own Claude subscription, without any API: the app builds a prompt, the host
 * pastes it into claude.ai, pastes the reply back, reviews every question, and only then adds them to the quiz.
 * Nothing in this dialog is sent anywhere by Quiz Arena.
 */
export function GenerateDialog({
  existing,
  onAdd,
  onClose,
}: {
  existing: string[];
  onAdd: (questions: Question[]) => void;
  onClose: () => void;
}) {
  const ref = useDialog<HTMLDivElement>(true, onClose);
  const room = remainingCapacity(existing.length);
  const [step, setStep] = useState<Step>('setup');
  const [topicsText, setTopicsText] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [count, setCount] = useState(Math.min(10, room));
  const [types, setTypes] = useState<QuestionType[]>(['mcq']);
  const [audience, setAudience] = useState('');
  const [language, setLanguage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const topics = useMemo(() => parseTopics(topicsText), [topicsText]);
  const counts = [5, 10, 15, 20, 25, 30].filter((n) => n <= room);
  if (room > 0 && !counts.includes(room) && room < 30) counts.push(room);

  const request = GenerateRequestSchema.safeParse({
    topics,
    difficulty,
    count: Math.min(count, room),
    types,
    audience: audience || undefined,
    language: language || undefined,
  });
  const prompt = request.success ? buildPrompt(request.data) : '';

  const toggleType = (t: QuestionType) =>
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const toPrompt = () => {
    if (room === 0) return setError('This quiz already has the maximum number of questions.');
    if (!topics.length) return setError('Add at least one topic.');
    if (topics.length > MAX_TOPICS) return setError(`Use at most ${MAX_TOPICS} topics.`);
    if (!types.length) return setError('Pick at least one question type.');
    if (!request.success) return setError(request.error.issues[0]?.message ?? 'Check the form and try again.');
    setError(null);
    setStep('prompt');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      promptRef.current?.select(); // clipboard blocked: leave it selected so Ctrl/Cmd+C works
      setCopied(false);
      setError('Your browser blocked copying. The prompt is selected: press Ctrl/Cmd+C.');
    }
  };

  const check = () => {
    const r = parseGenerated(reply, existing);
    const take = r.questions.slice(0, room);
    setResult({ ...r, questions: take });
    setPicked(new Set(take.map((_, i) => i)));
    setError(null);
    setStep('review');
  };

  const chosen: GeneratedQuestion[] = result ? result.questions.filter((_, i) => picked.has(i)) : [];

  return (
    <Overlay>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gen-title"
        className="card"
        style={{
          maxWidth: 720,
          width: '100%',
          maxHeight: '92dvh',
          overflowY: 'auto',
          padding: 20,
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 id="gen-title" style={{ margin: 0, flex: 1 }}>
            <span aria-hidden="true">✨ </span>Write questions with Claude
          </h2>
          <span style={{ color: 'var(--ink-muted)', fontSize: 14 }}>
            Step {step === 'setup' ? 1 : step === 'prompt' ? 2 : 3} of 3
          </span>
          <button className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{ background: '#fdecec', border: '1px solid #f5b5b5', borderRadius: 10, padding: 10 }}
          >
            {error}
          </div>
        )}

        {step === 'setup' && (
          <>
            <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
              Uses your own Claude subscription: you copy a prompt into claude.ai and paste the answer back. Nothing is
              sent from here, and nothing is added to your quiz until you have reviewed it.
            </p>
            <div>
              <label className="label" htmlFor="gen-topics">
                Topics (one per line, up to {MAX_TOPICS}; a single line can be a comma-separated list)
              </label>
              <textarea
                id="gen-topics"
                className="input"
                rows={4}
                value={topicsText}
                onChange={(e) => setTopicsText(e.target.value)}
                placeholder={'The Mughal Empire\nPhotosynthesis\nIndian cricket records'}
                data-autofocus
              />
              <div
                style={{
                  fontSize: 13,
                  marginTop: 4,
                  color: topics.length > MAX_TOPICS ? 'var(--bad)' : 'var(--ink-muted)',
                  fontWeight: topics.length > MAX_TOPICS ? 700 : 400,
                }}
              >
                {topics.length} of {MAX_TOPICS} topics
                {topics.length > MAX_TOPICS && ` — remove ${topics.length - MAX_TOPICS}`}
              </div>
            </div>

            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">Difficulty</legend>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label="Difficulty">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={difficulty === d}
                    className={`btn ${difficulty === d ? 'btn-primary' : ''}`}
                    onClick={() => setDifficulty(d)}
                  >
                    {DIFF_LABEL[d]}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-muted)', marginTop: 6 }}>{DIFFICULTY_HELP[difficulty]}</div>
            </fieldset>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <label className="label" htmlFor="gen-count">
                  Number of questions
                </label>
                <select
                  id="gen-count"
                  className="input"
                  value={Math.min(count, room)}
                  onChange={(e) => setCount(Number(e.target.value))}
                  disabled={room === 0}
                >
                  {counts
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                </select>
                <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 4 }}>
                  This quiz has room for {room} more.
                </div>
              </div>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="label">Question types</legend>
                {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                  <label key={t} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 32 }}>
                    <input
                      type="checkbox"
                      checked={types.includes(t)}
                      onChange={() => toggleType(t)}
                      style={{ width: 20, height: 20 }}
                    />
                    {TYPE_LABEL[t]}
                  </label>
                ))}
              </fieldset>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="label" htmlFor="gen-audience">
                  Audience (optional)
                </label>
                <input
                  id="gen-audience"
                  className="input"
                  value={audience}
                  maxLength={80}
                  placeholder="e.g. Class 8 students"
                  onChange={(e) => setAudience(e.target.value)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="label" htmlFor="gen-language">
                  Language (optional)
                </label>
                <input
                  id="gen-language"
                  className="input"
                  value={language}
                  maxLength={30}
                  placeholder="English"
                  onChange={(e) => setLanguage(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={toPrompt}>
                Create prompt
              </button>
            </div>
          </>
        )}

        {step === 'prompt' && (
          <>
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
              <li>Copy the prompt below.</li>
              <li>
                Open{' '}
                <a href="https://claude.ai/new" target="_blank" rel="noreferrer noopener" className="page-link">
                  claude.ai (opens in a new tab)
                </a>{' '}
                and paste it in.
              </li>
              <li>When Claude replies, copy its whole answer and come back here.</li>
            </ol>
            <label className="label" htmlFor="gen-prompt">
              Prompt for Claude
            </label>
            <textarea
              id="gen-prompt"
              ref={promptRef}
              className="input"
              readOnly
              rows={10}
              value={prompt}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
            />
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
              Your topics go to claude.ai under your own account, not to Quiz Arena. If you have a free Claude account
              the prompt works the same way.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setStep('setup')}>
                ← Back
              </button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span role="status" style={{ color: '#166534', fontWeight: 700, minWidth: 70 }}>
                  {copied ? '✓ Copied' : ''}
                </span>
                <button className="btn" onClick={() => void copy()}>
                  Copy prompt
                </button>
                <button className="btn btn-primary" onClick={() => setStep('review')}>
                  I have Claude's reply →
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'review' && !result && (
          <>
            <label className="label" htmlFor="gen-reply">
              Paste Claude's reply here
            </label>
            <textarea
              id="gen-reply"
              className="input"
              rows={12}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder='{"questions":[ … ]}'
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
              data-autofocus
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button className="btn" onClick={() => setStep('prompt')}>
                ← Back
              </button>
              <button className="btn btn-primary" onClick={check} disabled={!reply.trim()}>
                Check reply
              </button>
            </div>
          </>
        )}

        {step === 'review' && result && (
          <>
            {result.unreadable ? (
              <div
                role="alert"
                style={{ background: '#fff7e0', border: '1px solid #f0d58a', borderRadius: 10, padding: 10 }}
              >
                I couldn't find any questions in that reply. Make sure you pasted Claude's whole answer, and that it is
                the JSON the prompt asked for. If Claude added chat text around it, that's fine.
              </div>
            ) : (
              <>
                <div role="status" style={{ fontWeight: 700 }}>
                  {result.questions.length} question{result.questions.length === 1 ? '' : 's'} ready to review
                  {result.problems.length > 0 && ` · ${result.problems.length} skipped`}
                </div>
                <div
                  style={{
                    background: '#fff7e0',
                    border: '1px solid #f0d58a',
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 14,
                  }}
                >
                  <b>Check every answer before you use these.</b> Claude can be confidently wrong, especially on dates,
                  numbers and recent events. Untick anything you're unsure about; you can still edit questions after
                  adding them.
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                  {result.questions.map((g, i) => {
                    const q = g.question;
                    const id = `gen-q-${i}`;
                    return (
                      <li key={i} className="card" style={{ padding: 10, opacity: picked.has(i) ? 1 : 0.6 }}>
                        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <input
                            id={id}
                            type="checkbox"
                            checked={picked.has(i)}
                            onChange={() =>
                              setPicked((cur) => {
                                const next = new Set(cur);
                                if (next.has(i)) next.delete(i);
                                else next.add(i);
                                return next;
                              })
                            }
                            style={{ width: 22, height: 22, flex: 'none', marginTop: 2 }}
                            aria-label={`Add question ${i + 1}: ${q.text}`}
                          />
                          <span style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                              {TYPE_LABEL[q.type]}
                              {g.difficulty ? ` · ${g.difficulty}` : ''}
                              {g.topic ? ` · ${g.topic}` : ''} · {q.timeLimitS}s
                            </span>
                            <br />
                            <b>{q.text}</b>
                            {q.type === 'mcq' && (
                              <ul style={{ margin: '6px 0 0', paddingLeft: 0, listStyle: 'none', fontSize: 14 }}>
                                {q.options.map((o, k) => (
                                  <li key={k} style={{ fontWeight: k === q.correctIndex ? 700 : 400 }}>
                                    <span aria-hidden="true">{SHAPES[k]} </span>
                                    {o}
                                    {k === q.correctIndex && <span> ✓ correct</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {q.type === 'tf' && (
                              <div style={{ fontSize: 14 }}>
                                Answer: <b>{q.correctIndex === 0 ? 'True' : 'False'}</b>
                              </div>
                            )}
                            {q.type === 'text' && (
                              <div style={{ fontSize: 14 }}>
                                Accepted: <b>{q.acceptedAnswers.join(' · ')}</b>
                              </div>
                            )}
                            {g.explanation && (
                              <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 4 }}>
                                Why: {g.explanation}
                              </div>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {result.problems.length > 0 && (
                  <details>
                    <summary style={{ cursor: 'pointer' }}>
                      {result.problems.length} item{result.problems.length === 1 ? ' was' : 's were'} skipped
                    </summary>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 14 }}>
                      {result.problems.map((p) => (
                        <li key={p.position}>
                          Item {p.position}: {p.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={() => {
                  setResult(null);
                  setStep('review');
                }}
              >
                ← Paste a different reply
              </button>
              {!result.unreadable && (
                <button
                  className="btn btn-primary"
                  disabled={chosen.length === 0}
                  onClick={() => onAdd(chosen.map((g) => g.question))}
                >
                  Add {chosen.length} question{chosen.length === 1 ? '' : 's'} to my quiz
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}
