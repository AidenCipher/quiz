import { expect, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';

export interface Q {
  type: 'mcq' | 'tf' | 'text';
  text: string;
  options?: string[];
  correctIndex?: number | null;
  acceptedAnswers?: string[];
  timeLimitS?: number;
  points?: number;
}

export const demoQuiz = (): Q[] => [
  {
    type: 'mcq',
    text: 'Which planet is known as the Red Planet?',
    options: ['Venus', 'Mars', 'Jupiter', 'Mercury'],
    correctIndex: 1,
    timeLimitS: 20,
  },
  {
    type: 'tf',
    text: 'The Great Wall of China is visible from the Moon with the naked eye.',
    correctIndex: 1,
    timeLimitS: 20,
  },
  {
    type: 'text',
    text: 'What is the capital of Maharashtra?',
    acceptedAnswers: ['Mumbai', 'Bombay'],
    correctIndex: null,
    timeLimitS: 30,
  },
];

/** Sign in with the local dev login and return a host page plus the game PIN for a fresh quiz. */
export async function startGame(browser: Browser, questions: Q[] = demoQuiz(), settings: Record<string, unknown> = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const name = `Host ${Math.random().toString(36).slice(2, 8)}`;
  expect((await context.request.post('/api/auth/dev', { data: { name } })).ok()).toBe(true);
  const created = await context.request.post('/api/quizzes', {
    data: {
      title: 'E2E quiz',
      settings,
      questions: questions.map((q, i) => ({
        id: `q${i}`,
        options: [],
        acceptedAnswers: [],
        correctIndex: null,
        typoTolerance: true,
        points: 1000,
        timeLimitS: 20,
        image: null,
        ...q,
      })),
    },
  });
  const { id } = (await created.json()) as { id: string };
  const hosted = await context.request.post(`/api/quizzes/${id}/host`);
  expect(hosted.ok()).toBe(true);
  const { pin } = (await hosted.json()) as { pin: string };
  await page.goto(`/host/live/${pin}`);
  await expect(page.getByText(pin, { exact: true })).toBeVisible();
  return { context, page, pin, quizId: id };
}

export interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
}

/** A phone-sized player in its own browser context (own localStorage, like a separate device). */
export async function joinPlayer(browser: Browser, pin: string, name: string): Promise<Player> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  await page.goto(`/j/${pin}`);
  await page.getByLabel('Nickname').fill(name);
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByText("You're in!")).toBeVisible();
  return { name, context, page };
}

export async function expectLobbyCount(host: Page, n: number) {
  await expect(host.getByText(`${n}`, { exact: true }).first()).toBeVisible();
  await expect(host.getByText(n === 1 ? 'player in the lobby' : 'players in the lobby')).toBeVisible();
}

/** Host presses Space (start, skip countdown, next …). */
export async function hostNext(host: Page) {
  await host.keyboard.press('Space');
}

/** Start the game and skip the 3 s countdown so the first question is open. */
export async function openQuestion(host: Page, players: Player[]) {
  await hostNext(host); // start
  await expect(host.getByText('Get ready…')).toBeVisible();
  await hostNext(host); // skip countdown
  for (const p of players) await expect(p.page.getByRole('timer')).toBeVisible();
}

/** Emulate switching tabs/apps: headless Chromium has no real tab visibility, so drive the Page Visibility API. */
export async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Emulate a brief loss of window focus (notification pull-down, clicking another window). */
export async function blipBlur(page: Page, ms: number) {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(ms);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

export const tile = (p: Player, letter: 'A' | 'B' | 'C' | 'D') =>
  p.page.getByRole('button', { name: `Option ${letter}` });
