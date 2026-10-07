import { describe, expect, it } from 'vitest';
import {
  GenerateRequestSchema,
  buildPrompt,
  extractJson,
  parseGenerated,
  parseTopics,
  timeFor,
  type GenerateRequest,
} from '../src';

const req = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  topics: ['Indian history', 'Solar system'],
  difficulty: 'hard',
  count: 8,
  types: ['mcq'],
  ...over,
});

describe('parseTopics', () => {
  it('splits lines and commas, strips bullets and numbering, drops blanks and duplicates', () => {
    expect(parseTopics('Indian history\n- Solar system, solar system\n 3) Photosynthesis ;\n\n')).toEqual([
      'Indian history',
      'Solar system',
      'Photosynthesis',
    ]);
  });
});

describe('request validation', () => {
  it('accepts a sensible request and rejects empty, oversized or unknown values', () => {
    expect(GenerateRequestSchema.safeParse(req()).success).toBe(true);
    expect(GenerateRequestSchema.safeParse(req({ topics: [] })).success).toBe(false);
    expect(GenerateRequestSchema.safeParse(req({ topics: Array(11).fill('x') })).success).toBe(false);
    expect(GenerateRequestSchema.safeParse(req({ count: 31 })).success).toBe(false);
    expect(GenerateRequestSchema.safeParse({ ...req(), difficulty: 'impossible' }).success).toBe(false);
    expect(GenerateRequestSchema.safeParse(req({ types: [] })).success).toBe(false);
  });
});

describe('buildPrompt', () => {
  it('includes topics, difficulty with its meaning, the count, the types and the exact output shape', () => {
    const p = buildPrompt(req());
    expect(p).toContain('1. Indian history');
    expect(p).toContain('2. Solar system');
    expect(p).toContain('Difficulty: Hard.');
    expect(p).toContain('Number of questions: 8');
    expect(p).toContain('multiple choice ("mcq")');
    expect(p).not.toContain('true/false ("tf"),');
    expect(p).toContain('ONLY one JSON object');
    expect(p).toContain('{"questions":[');
  });
  it('handles mixed difficulty, extra types, audience and language', () => {
    const p = buildPrompt(
      req({ difficulty: 'mixed', types: ['mcq', 'tf', 'text'], audience: 'Class 8 students', language: 'Hindi' }),
    );
    expect(p).toContain('Difficulty: Mixed.');
    expect(p).toContain('Use a sensible mix of the allowed types.');
    expect(p).toContain('Audience: Class 8 students');
    expect(p).toContain('Write in: Hindi');
  });
});

describe('extractJson', () => {
  it('reads plain JSON, fenced JSON, and JSON surrounded by chatter', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! Here you go:\n{"a":3, "b":"x } y"}\nHope that helps {really}')).toEqual({
      a: 3,
      b: 'x } y',
    });
    expect(extractJson('[1,2]')).toEqual([1, 2]);
  });
  it('returns undefined when there is no JSON', () => {
    expect(extractJson('I could not do that.')).toBeUndefined();
    expect(extractJson('{"a": ')).toBeUndefined();
  });
});

const reply = (items: unknown[]) => JSON.stringify({ questions: items });
const mcq = (text: string, options = ['A', 'B', 'C', 'D'], correct: unknown = 1, extra = {}) => ({
  type: 'mcq',
  text,
  options,
  correct,
  ...extra,
});

describe('parseGenerated', () => {
  it('turns a good reply into validated questions, with timers following difficulty', () => {
    const r = parseGenerated(
      reply([
        mcq('Which planet is red?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 1, {
          difficulty: 'easy',
          topic: 'Solar system',
        }),
        { type: 'tf', text: 'The Sun is a planet.', correct: false, difficulty: 'easy' },
        { type: 'text', text: 'Capital of Maharashtra?', accepted: ['Mumbai', 'Bombay'], difficulty: 'hard' },
      ]),
    );
    expect(r.problems).toEqual([]);
    expect(r.questions).toHaveLength(3);
    const [a, b, c] = r.questions.map((q) => q.question);
    expect([a!.type, b!.type, c!.type]).toEqual(['mcq', 'tf', 'text']);
    expect(a!.timeLimitS).toBe(timeFor('mcq', 'easy'));
    expect(c!.timeLimitS).toBe(60);
    expect(b!.correctIndex).toBe(1); // false
    expect(c!.acceptedAnswers).toEqual(['Mumbai', 'Bombay']);
    expect(r.questions[0]!.topic).toBe('Solar system');
  });

  it('shuffles options but always keeps the right answer marked', () => {
    const options = ['Venus', 'Mars', 'Jupiter', 'Mercury'];
    const positions = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      let x = seed;
      const rand = () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
      const q = parseGenerated(reply([mcq('Red planet?', options, 1)]), [], rand).questions[0]!.question;
      expect(q.options[q.correctIndex!]).toBe('Mars');
      expect([...q.options].sort()).toEqual([...options].sort());
      positions.add(q.correctIndex!);
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it('accepts a bare array, aliases, letter / text answers and fenced replies with chatter', () => {
    const text =
      'Here are your questions:\n```json\n' +
      JSON.stringify([
        { type: 'multiple_choice', question: 'Q one?', options: ['a', 'b', 'c', 'd'], answer: 'C' },
        mcq('Q two?', ['north', 'south', 'east', 'west'], 'South'),
        { type: 'true_false', text: 'Water boils at 100 °C at sea level.', answer: 'True' },
        { type: 'short_answer', text: 'Chemical symbol for gold?', answer: 'Au' },
      ]) +
      '\n```\nLet me know if you want more!';
    const r = parseGenerated(text, [], () => 0.5);
    expect(r.problems).toEqual([]);
    expect(r.questions).toHaveLength(4);
    const q1 = r.questions[0]!.question;
    expect(q1.options[q1.correctIndex!]).toBe('c');
    const q2 = r.questions[1]!.question;
    expect(q2.options[q2.correctIndex!]).toBe('south');
  });

  it('skips bad items with a reason and keeps the good ones', () => {
    const r = parseGenerated(
      reply([
        mcq('Fine question?'),
        mcq('Only one option?', ['A']),
        mcq('Answer out of range?', ['A', 'B', 'C', 'D'], 7),
        mcq('Repeated options?', ['A', 'a', 'C', 'D']),
        { type: 'essay', text: 'Write about…' },
        { type: 'tf', text: 'No answer given.' },
        { type: 'text', text: 'No accepted answers?' },
        mcq('x'.repeat(201)),
        mcq('', ['A', 'B']),
        'not an object',
      ]),
    );
    expect(r.questions).toHaveLength(1);
    expect(r.problems.map((p) => p.position)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.problems[0]!.reason).toMatch(/2 to 4 options/);
    expect(r.problems[1]!.reason).toMatch(/out of range/);
    expect(r.problems[3]!.reason).toMatch(/unknown question type/);
  });

  it('drops duplicates within the reply and against questions already in the quiz', () => {
    const r = parseGenerated(reply([mcq('Capital of France?'), mcq('capital of france'), mcq('Largest ocean?')]), [
      'Largest Ocean?',
    ]);
    expect(r.questions.map((q) => q.question.text)).toEqual(['Capital of France?']);
    expect(r.problems.map((p) => p.reason)).toEqual(['duplicate of another question', 'duplicate of another question']);
  });

  it('flags unreadable replies instead of throwing', () => {
    expect(parseGenerated('Sorry, I cannot help with that.').unreadable).toBe(true);
    expect(parseGenerated('').unreadable).toBe(true);
    expect(parseGenerated('{"nope": []}').unreadable).toBe(true);
    expect(parseGenerated('x'.repeat(300_000)).unreadable).toBe(true);
  });

  it('keeps markup-looking text verbatim; the app only ever renders it as text', () => {
    const r = parseGenerated(reply([mcq('<img src=x onerror=alert(1)> Which?', ['<b>a</b>', 'b', 'c', 'd'], 0)]));
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0]!.question.text).toContain('<img');
  });
});
