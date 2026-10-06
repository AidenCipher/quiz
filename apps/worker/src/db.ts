import { QuizDraftSchema, type GameSettings, type Question } from '@quiz/shared';

export interface QuizRow {
  id: string;
  title: string;
  settings: GameSettings;
  questions: unknown[];
  createdAt: number;
  updatedAt: number;
}

interface DbQuestion {
  id: string;
  type: string;
  text: string;
  image: string | null;
  image_alt: string;
  options: string | null;
  correct_index: number | null;
  accepted_answers: string | null;
  typo_tolerance: number;
  time_limit_s: number;
  points: number;
}

const parseJson = <T>(s: string | null, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export async function listQuizzes(db: D1Database, ownerId: string) {
  const { results } = await db
    .prepare(
      `SELECT q.id, q.title, q.updated_at AS updatedAt,
              (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS questionCount
         FROM quizzes q WHERE q.owner_id = ? ORDER BY q.updated_at DESC`,
    )
    .bind(ownerId)
    .all<{ id: string; title: string; updatedAt: number; questionCount: number }>();
  return results;
}

export async function getQuiz(db: D1Database, id: string, ownerId: string): Promise<QuizRow | null> {
  const q = await db
    .prepare('SELECT id, title, settings, created_at, updated_at FROM quizzes WHERE id = ? AND owner_id = ?')
    .bind(id, ownerId)
    .first<{ id: string; title: string; settings: string; created_at: number; updated_at: number }>();
  if (!q) return null;
  const { results } = await db
    .prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position')
    .bind(id)
    .all<DbQuestion>();
  return {
    id: q.id,
    title: q.title,
    settings: parseJson(q.settings, {} as GameSettings),
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    questions: results.map((r) => ({
      // Rows are keyed `${quizId}:${questionId}` to be unique in the table; clients only know the question id.
      id: r.id.startsWith(`${id}:`) ? r.id.slice(id.length + 1) : r.id,
      type: r.type,
      text: r.text,
      image: r.image,
      imageAlt: r.image_alt,
      options: parseJson<string[]>(r.options, []),
      correctIndex: r.correct_index,
      acceptedAnswers: parseJson<string[]>(r.accepted_answers, []),
      typoTolerance: !!r.typo_tolerance,
      timeLimitS: r.time_limit_s,
      points: r.points,
    })),
  };
}

/** Insert or replace a whole quiz (drafts allowed) in one batch. */
export async function saveQuiz(
  db: D1Database,
  ownerId: string,
  id: string,
  draft: ReturnType<typeof QuizDraftSchema.parse>,
  isNew: boolean,
): Promise<void> {
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];
  if (isNew) {
    stmts.push(
      db
        .prepare('INSERT INTO quizzes (id, owner_id, title, settings, created_at, updated_at) VALUES (?,?,?,?,?,?)')
        .bind(id, ownerId, draft.title, JSON.stringify(draft.settings), now, now),
    );
  } else {
    stmts.push(
      db
        .prepare('UPDATE quizzes SET title = ?, settings = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
        .bind(draft.title, JSON.stringify(draft.settings), now, id, ownerId),
      db.prepare('DELETE FROM questions WHERE quiz_id = ?').bind(id),
    );
  }
  (draft.questions as Partial<Question>[]).forEach((q, i) => {
    stmts.push(
      db
        .prepare(
          `INSERT INTO questions (id, quiz_id, position, type, text, image, image_alt, options, correct_index,
             accepted_answers, typo_tolerance, time_limit_s, points) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          // Question ids are only unique per quiz in the client; namespace them for the table key.
          `${id}:${q.id ?? i}`.slice(0, 120),
          id,
          i,
          q.type ?? 'mcq',
          (q.text ?? '').slice(0, 200),
          q.image ?? null,
          (q.imageAlt ?? '').slice(0, 150),
          JSON.stringify(q.options ?? []),
          q.correctIndex ?? null,
          JSON.stringify(q.acceptedAnswers ?? []),
          q.typoTolerance === false ? 0 : 1,
          q.timeLimitS ?? 20,
          q.points ?? 1000,
        ),
    );
  });
  await db.batch(stmts);
}
