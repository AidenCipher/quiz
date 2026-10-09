import { z } from 'zod';
import { MAX_QUESTIONS, MAX_QUESTION_TEXT, TIMER_OPTIONS } from './constants';
import { QuestionSchema, newQuestion, type Question, type QuestionType } from './quiz';

/**
 * Quiz-writing helper that works with a normal Claude subscription: the app writes a prompt, the host pastes it
 * into claude.ai, then pastes the reply back and this module validates it. Nothing here calls any API.
 */

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_HELP: Record<Difficulty, string> = {
  easy: 'Well-known basics that most people in the audience can answer without studying.',
  medium: 'Needs some familiarity with the topic, or one step of reasoning.',
  hard: 'Detailed or specialised knowledge and subtle distinctions; a strong player should still have to think.',
  mixed: 'A spread of easy, medium and hard questions, roughly a third each, in a varied order.',
};

export const MAX_TOPICS = 10;
export const MAX_TOPIC_LENGTH = 200;
export const MAX_PASTE_LENGTH = 200_000;

export const GenerateRequestSchema = z.object({
  topics: z.array(z.string().trim().min(1).max(MAX_TOPIC_LENGTH)).min(1).max(MAX_TOPICS),
  difficulty: z.enum(DIFFICULTIES),
  count: z.number().int().min(1).max(30),
  types: z.array(z.enum(['mcq', 'tf', 'text'])).min(1),
  audience: z.string().trim().max(80).optional(),
  language: z.string().trim().max(30).optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

/**
 * Splits the topics box into topics. With more than one line, every line is one topic (so a topic may contain
 * commas, like "Indian freedom struggle, 1857 to 1947"). A single line is read as a comma or semicolon separated
 * list. Bullets and numbering are stripped; blanks and duplicates are dropped.
 */
export function parseTopics(input: string): string[] {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parts = lines.length > 1 ? lines : (lines[0]?.split(/[,;]+/) ?? []);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const t = part
      .replace(/^[\s\-*•\d.)]+/, '')
      .replace(/[\s;,]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

const TYPE_LINE: Record<QuestionType, string> = {
  mcq: 'multiple choice ("mcq")',
  tf: 'true/false ("tf")',
  text: 'type-the-answer ("text")',
};

export function buildPrompt(req: GenerateRequest): string {
  const topics = req.topics.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const types = req.types.map((t) => TYPE_LINE[t]).join(', ');
  const difficulty =
    req.difficulty === 'mixed'
      ? `Mixed. ${DIFFICULTY_HELP.mixed} Put the right "difficulty" on every question.`
      : `${req.difficulty[0]!.toUpperCase()}${req.difficulty.slice(1)}. ${DIFFICULTY_HELP[req.difficulty]}`;
  const mix = req.types.length > 1 ? ' Use a sensible mix of the allowed types.' : '';
  const typeRules: string[] = [];
  if (req.types.includes('mcq'))
    typeRules.push(
      '- Multiple choice ("mcq"): exactly 4 options, each under 40 characters. Exactly one is correct. Write the three distractors so each is a believable mistake (a common misconception, a near miss, or the right answer to a similar question), the same part of speech, grammar and rough length as the correct option. No "all of the above", "none of the above" or "both A and B". No option may be a partial duplicate of another, and none may give the answer away by being the longest, the most detailed or the only one that fits the sentence. Put the correct answer in different positions across the set.',
    );
  if (req.types.includes('tf'))
    typeRules.push(
      '- True/false ("tf"): one self-contained statement that is unambiguously true or false to an expert. Avoid absolutes ("always", "never", "only") as giveaways, double negatives, and statements that are only true "in some cases". Make roughly half of them false, and make the false ones plausible, not absurd.',
    );
  if (req.types.includes('text'))
    typeRules.push(
      '- Type-the-answer ("text"): the question must have one short answer (one word, a name, a number, or a phrase under 40 characters) that cannot be phrased in many valid ways. In "accepted" list 1 to 5 variants a player might type: spellings, common abbreviations, with and without "the", and synonyms the host would mark correct. Write numbers as digits. Do not require special characters or accents to be typed correctly.',
    );
  return `# ROLE
You are an experienced assessment designer and quiz writer. You write accurate, fair, engaging questions, and you would rather deliver fewer questions than include a doubtful one.

# CONTEXT
The questions are for a live quiz game that is shown on a projector in a classroom or at an event. Players answer on their phones against a timer (10 to 60 seconds), so every question must be readable in a few seconds and answerable from knowledge alone, with nothing to look up and no need to see an image.

# TASK
Write quiz questions using exactly these inputs.

Topics (cover them roughly evenly):
${topics}

Difficulty: ${difficulty}
Number of questions: ${req.count}
Allowed question types: ${types}.${mix}${req.audience ? `\nAudience: ${req.audience}` : ''}${req.language ? `\nWrite in: ${req.language}` : ''}

# QUALITY STANDARD
Accuracy
- Every question has exactly one clearly correct answer that you are confident is factually right, widely documented and unlikely to change. If you are not certain of a fact, write a different question instead of guessing.
- Avoid time-sensitive facts ("current", "latest", "newest", "as of this year"): they go stale. Use settled facts, or name the year.
- Avoid questions that depend on opinion, a single disputed source, or a definition that differs between countries or textbooks.
Clarity
- Keep each question under 140 characters. Plain text only: no markdown, no emoji, no images, no references to other questions.
- One idea per question, written as a direct question or a clear statement. Do not use "Which of the following is NOT…" or other negative phrasing.
- Do not hide the answer inside the question: no wording, grammar or clue should point to the right option.
Cognitive level
- Match the difficulty. Easy: recall and recognition of well-known facts. Medium: understanding, one step of reasoning or connecting two facts. Hard: application, comparison or subtle distinctions that a strong player still has to think about.
- Hard means more demanding, not more obscure: never rely on trivia that nobody could reasonably know.
Fairness and tone
- Use inclusive, neutral wording that does not assume a country, culture, gender or background beyond the audience stated above. Keep content age-appropriate for that audience and avoid graphic, political or sensitive material unless a topic asks for it.
Variety
- Cover each topic about equally, vary the question stems (what, which, who, when, how many, why), and spread the difficulty as asked. No duplicate or near-duplicate questions, and no questions about the quiz itself.

# TYPE RULES
${typeRules.join('\n')}

# SELF-CHECK BEFORE YOU REPLY
Silently go through every question and fix or replace it if any answer is "no":
1. Am I certain of the correct answer, and is it the only defensible one?
2. Is it under 140 characters and free of clues and negative phrasing?
3. Are the distractors plausible and similar in length and style to the correct answer?
4. Does it match the requested difficulty and topic?
5. Is it different from every other question? Is the number of questions exactly ${req.count}? (Return fewer only if you cannot write that many that meet every rule. Never pad with weak ones.)

# OUTPUT FORMAT
Reply with ONLY one JSON object: no introduction, no explanation outside the JSON, no markdown code fences. It must be valid JSON (double quotes, no trailing commas, no comments). Use exactly this shape:
{"questions":[
{"topic":"…","difficulty":"easy","type":"mcq","text":"…","options":["…","…","…","…"],"correct":1,"explanation":"…"},
{"topic":"…","difficulty":"medium","type":"tf","text":"…","correct":true,"explanation":"…"},
{"topic":"…","difficulty":"hard","type":"text","text":"…","accepted":["…","…"],"explanation":"…"}
]}
"topic" is one of the topics above, worded the same way. "difficulty" is "easy", "medium" or "hard". For "mcq", "correct" is the zero-based position (0 to 3) of the right option. For "tf", "correct" is true or false. "explanation" is one sentence (under 160 characters) stating why the answer is right, so the host can verify it quickly.`;
}

/* ---------------------------------------------------------------------- */
/* Reading Claude's reply                                                  */
/* ---------------------------------------------------------------------- */

/** Finds JSON in pasted text: tolerates code fences and prose before or after it. */
export function extractJson(text: string): unknown | undefined {
  const cleaned = text.replace(/```(?:json|JSON)?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to scanning */
  }
  for (let start = 0; start < cleaned.length; start++) {
    const open = cleaned[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          break; // not valid JSON from this start; try the next opening bracket
        }
      }
    }
  }
  return undefined;
}

export interface GeneratedQuestion {
  question: Question;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Claude's one-line reason the answer is right, shown to the host while reviewing. */
  explanation?: string;
}
export interface ParseProblem {
  /** 1-based position in Claude's reply */
  position: number;
  reason: string;
}
export interface ParseResult {
  questions: GeneratedQuestion[];
  problems: ParseProblem[];
  /** True when no JSON could be found at all. */
  unreadable: boolean;
}

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const str = (v: unknown) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' ? String(v) : '';

const TYPE_ALIASES: Record<string, QuestionType> = {
  mcq: 'mcq',
  multiple_choice: 'mcq',
  'multiple choice': 'mcq',
  multiplechoice: 'mcq',
  tf: 'tf',
  true_false: 'tf',
  'true/false': 'tf',
  truefalse: 'tf',
  boolean: 'tf',
  text: 'text',
  short_answer: 'text',
  'short answer': 'text',
  'type-the-answer': 'text',
  type_answer: 'text',
};

/** Timers by difficulty (always one of the allowed timer lengths). */
export function timeFor(type: QuestionType, difficulty?: 'easy' | 'medium' | 'hard'): number {
  const table: Record<QuestionType, Record<'easy' | 'medium' | 'hard', number>> = {
    mcq: { easy: 10, medium: 20, hard: 30 },
    tf: { easy: 10, medium: 10, hard: 20 },
    text: { easy: 20, medium: 30, hard: 60 },
  };
  const t = table[type][difficulty ?? 'medium'];
  return (TIMER_OPTIONS as readonly number[]).includes(t) ? t : 20;
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function toQuestion(
  raw: Record<string, unknown>,
  rand: () => number,
): { ok: true; value: GeneratedQuestion } | { ok: false; reason: string } {
  const typeKey = str(raw.type).toLowerCase();
  const type = TYPE_ALIASES[typeKey];
  if (!type) return { ok: false, reason: `unknown question type “${str(raw.type) || 'missing'}”` };
  const text = str(raw.text ?? raw.question);
  if (!text) return { ok: false, reason: 'the question text is empty' };
  if (text.length > MAX_QUESTION_TEXT)
    return { ok: false, reason: `the question is ${text.length} characters (limit ${MAX_QUESTION_TEXT})` };

  const dRaw = str(raw.difficulty).toLowerCase();
  const difficulty = dRaw === 'easy' || dRaw === 'medium' || dRaw === 'hard' ? dRaw : undefined;
  const base = { ...newQuestion(type), text, timeLimitS: timeFor(type, difficulty) } as Question;

  if (type === 'mcq') {
    const options = Array.isArray(raw.options) ? raw.options.map(str).filter(Boolean) : [];
    if (options.length < 2 || options.length > 4)
      return { ok: false, reason: `needs 2 to 4 options, found ${options.length}` };
    if (new Set(options.map(norm)).size !== options.length) return { ok: false, reason: 'two options are the same' };
    let correct: number | undefined;
    const c = raw.correct ?? raw.answer ?? raw.correctIndex;
    if (typeof c === 'number' && Number.isInteger(c)) correct = c;
    else if (typeof c === 'string') {
      const t = c.trim();
      if (/^[0-3]$/.test(t)) correct = Number(t);
      else if (/^[A-Da-d]$/.test(t)) correct = t.toLowerCase().charCodeAt(0) - 97;
      else {
        const at = options.findIndex((o) => norm(o) === norm(t));
        if (at >= 0) correct = at;
      }
    }
    if (correct === undefined || correct < 0 || correct >= options.length)
      return { ok: false, reason: 'the correct answer is missing or out of range' };
    // Claude tends to favour certain positions; shuffle so the answer is not predictable.
    const order = shuffled(
      options.map((_, i) => i),
      rand,
    );
    base.options = order.map((i) => options[i]!);
    base.correctIndex = order.indexOf(correct);
  } else if (type === 'tf') {
    const c = raw.correct ?? raw.answer;
    const v =
      typeof c === 'boolean'
        ? c
        : typeof c === 'string'
          ? ({ true: true, false: false, t: true, f: false }[c.trim().toLowerCase()] as boolean | undefined)
          : undefined;
    if (v === undefined) return { ok: false, reason: 'true/false needs a true or false answer' };
    base.correctIndex = v ? 0 : 1;
  } else {
    const list = Array.isArray(raw.accepted) ? raw.accepted : raw.answer !== undefined ? [raw.answer] : [];
    const accepted = [...new Set(list.map(str).filter(Boolean))].slice(0, 5);
    if (!accepted.length) return { ok: false, reason: 'type-the-answer needs at least one accepted answer' };
    if (accepted.some((a) => a.length > 40))
      return { ok: false, reason: 'an accepted answer is longer than 40 characters' };
    base.acceptedAnswers = accepted;
    base.correctIndex = null;
  }

  const parsed = QuestionSchema.safeParse(base);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? 'not a valid question' };
  const explanation = str(raw.explanation ?? raw.rationale).slice(0, 200) || undefined;
  return { ok: true, value: { question: parsed.data, topic: str(raw.topic) || undefined, difficulty, explanation } };
}

/**
 * Validate Claude's pasted reply. Bad items are skipped with a reason; good ones are returned with their answer
 * positions shuffled. `existing` question texts are used to drop duplicates.
 */
export function parseGenerated(text: string, existing: string[] = [], rand: () => number = Math.random): ParseResult {
  if (!text.trim() || text.length > MAX_PASTE_LENGTH) return { questions: [], problems: [], unreadable: true };
  const json = extractJson(text);
  const list = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as { questions?: unknown }).questions)
      ? (json as { questions: unknown[] }).questions
      : undefined;
  if (!list) return { questions: [], problems: [], unreadable: true };

  const seen = new Set(existing.map(norm));
  const questions: GeneratedQuestion[] = [];
  const problems: ParseProblem[] = [];
  list.slice(0, 60).forEach((item, i) => {
    const position = i + 1;
    if (!item || typeof item !== 'object') return problems.push({ position, reason: 'not a question object' });
    const r = toQuestion(item as Record<string, unknown>, rand);
    if (!r.ok) return problems.push({ position, reason: r.reason });
    const key = norm(r.value.question.text);
    if (seen.has(key)) return problems.push({ position, reason: 'duplicate of another question' });
    seen.add(key);
    questions.push(r.value);
  });
  return { questions, problems, unreadable: false };
}

/** How many more questions this quiz can take. */
export const remainingCapacity = (existing: number) => Math.max(0, MAX_QUESTIONS - existing);
