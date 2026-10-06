import { z } from 'zod';
import { MAX_ACCEPTED_ANSWERS, MAX_QUESTIONS, MAX_QUESTION_TEXT, TIMER_OPTIONS, POINT_OPTIONS } from './constants';

export const QuestionTypeSchema = z.enum(['mcq', 'tf', 'text']);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const FlagKindSchema = z.enum(['hidden', 'blur', 'left']);
export type FlagKind = z.infer<typeof FlagKindSchema>;

export const SeveritySchema = z.enum(['minor', 'moderate', 'major']);
export type Severity = z.infer<typeof SeveritySchema>;

export const ThresholdsSchema = z.object({
  /** Focus loss shorter than this is ignored. */
  blurIgnoreMs: z.number().int().min(0).default(1000),
  /** Focus loss up to this is minor. */
  blurMinorMaxMs: z.number().int().min(0).default(3000),
  /** Tab hidden (or page left) up to this is minor. */
  hiddenMinorMaxMs: z.number().int().min(0).default(2000),
  /** Up to this is moderate; beyond is major. */
  moderateMaxMs: z.number().int().min(0).default(10_000),
  /** Page-left (socket drop) shorter than this is treated as a network blip. */
  leftIgnoreMs: z.number().int().min(0).default(2000),
  /** Answer within this long of returning is major. */
  quickAnswerMs: z.number().int().min(0).default(3000),
});
export type Thresholds = z.infer<typeof ThresholdsSchema>;

export const GameSettingsSchema = z.object({
  thresholds: ThresholdsSchema.default(() => ThresholdsSchema.parse({})),
  majorDeduction: z.number().int().min(0).default(500),
  kickStrikes: z.number().int().min(1).default(6),
  autoKick: z.boolean().default(true),
  lateJoin: z.boolean().default(true),
  allowAnswerChange: z.boolean().default(false),
  typoTolerance: z.boolean().default(true),
  music: z.boolean().default(true),
  antiCheat: z.boolean().default(true),
});
export type GameSettings = z.infer<typeof GameSettingsSchema>;
export const defaultSettings = (): GameSettings => GameSettingsSchema.parse({});

const timer = z.number().refine((n) => (TIMER_OPTIONS as readonly number[]).includes(n), 'invalid timer');
const points = z.number().refine((n) => (POINT_OPTIONS as readonly number[]).includes(n), 'invalid points');

export const QuestionSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: QuestionTypeSchema,
    text: z.string().trim().min(1).max(MAX_QUESTION_TEXT),
    image: z.string().max(400_000).nullable().default(null),
    options: z.array(z.string().trim().min(1).max(100)).max(4).default([]),
    /** mcq: index of correct option. tf: 0 = True, 1 = False. text: null. */
    correctIndex: z.number().int().min(0).max(3).nullable().default(null),
    acceptedAnswers: z.array(z.string().trim().min(1).max(40)).max(MAX_ACCEPTED_ANSWERS).default([]),
    typoTolerance: z.boolean().default(true),
    timeLimitS: timer,
    points,
  })
  .superRefine((q, ctx) => {
    if (q.type === 'mcq') {
      if (q.options.length < 2) ctx.addIssue({ code: 'custom', message: 'mcq needs 2–4 options', path: ['options'] });
      if (q.correctIndex === null || q.correctIndex >= q.options.length)
        ctx.addIssue({ code: 'custom', message: 'mark a correct option', path: ['correctIndex'] });
    } else if (q.type === 'tf') {
      if (q.correctIndex === null || q.correctIndex > 1)
        ctx.addIssue({ code: 'custom', message: 'pick True or False', path: ['correctIndex'] });
    } else if (q.acceptedAnswers.length < 1) {
      ctx.addIssue({ code: 'custom', message: 'add an accepted answer', path: ['acceptedAnswers'] });
    }
  });
export type Question = z.infer<typeof QuestionSchema>;

export const QuizSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(100),
  settings: GameSettingsSchema.default(() => defaultSettings()),
  questions: z.array(QuestionSchema).min(1).max(MAX_QUESTIONS),
});
export type Quiz = z.infer<typeof QuizSchema>;

/** Draft quizzes (builder autosave) may be incomplete: no refinement beyond size caps. */
export const QuizDraftSchema = z.object({
  title: z.string().trim().min(1).max(100),
  settings: GameSettingsSchema.default(() => defaultSettings()),
  questions: z.array(z.any()).max(MAX_QUESTIONS),
});

export function newQuestion(type: QuestionType = 'mcq'): Question {
  return {
    id: crypto.randomUUID(),
    type,
    text: '',
    image: null,
    options: type === 'mcq' ? ['', '', '', ''] : [],
    correctIndex: type === 'text' ? null : 0,
    acceptedAnswers: type === 'text' ? [''] : [],
    typoTolerance: true,
    timeLimitS: type === 'text' ? 30 : 20,
    points: 1000,
  };
}
