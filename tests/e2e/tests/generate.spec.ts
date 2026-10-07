import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const starterQuiz = {
  title: 'Generated',
  settings: {},
  // What "+ New quiz" creates: one empty multiple-choice question.
  questions: [
    {
      id: 'starter',
      type: 'mcq',
      text: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      timeLimitS: 20,
      points: 1000,
      acceptedAnswers: [],
    },
  ],
};

const claudeReply = `Sure, here are your questions!

\`\`\`json
${JSON.stringify({
  questions: [
    {
      topic: 'Solar system',
      difficulty: 'hard',
      type: 'mcq',
      text: 'Which planet has the shortest day?',
      options: ['Jupiter', 'Mars', 'Venus', 'Mercury'],
      correct: 0,
    },
    {
      topic: 'Solar system',
      difficulty: 'medium',
      type: 'mcq',
      text: 'Which planet is known as the Red Planet?',
      options: ['Venus', 'Mars', 'Jupiter', 'Mercury'],
      correct: 1,
    },
    { topic: 'Indian history', difficulty: 'easy', type: 'tf', text: 'The Taj Mahal is in Agra.', correct: true },
    {
      topic: 'Indian history',
      difficulty: 'hard',
      type: 'text',
      text: 'Who founded the Mughal Empire?',
      accepted: ['Babur', 'Zahir-ud-din Muhammad Babur'],
    },
    { topic: 'Solar system', type: 'mcq', text: 'Only one option here?', options: ['Alone'], correct: 0 },
    {
      topic: 'Solar system',
      type: 'mcq',
      text: 'which planet is known as the red planet',
      options: ['Venus', 'Mars', 'Jupiter', 'Mercury'],
      correct: 1,
    },
  ],
})}
\`\`\`

Let me know if you want more!`;

async function scan(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const { violations } = await new AxeBuilder({ page })
    .include('[role=dialog]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

async function openEditor(browser: Parameters<Parameters<typeof test>[2]>[0]['browser']) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const hosts = new Set<string>();
  context.on('request', (r) => hosts.add(new URL(r.url()).host));
  await context.request.post('/api/auth/dev', { data: { name: `Gen ${Math.random().toString(36).slice(2, 7)}` } });
  const created = await context.request.post('/api/quizzes', { data: starterQuiz });
  const { id } = (await created.json()) as { id: string };
  const page = await context.newPage();
  await page.goto(`/host/quiz/${id}`);
  await expect(page.getByLabel('Quiz title')).toBeVisible();
  return { context, page, id, hosts };
}

test('write questions with Claude: topics + difficulty → prompt → paste reply → review → add', async ({ browser }) => {
  const { context, page, id, hosts } = await openEditor(browser);

  await page.getByRole('button', { name: /Write questions with Claude/ }).click();
  const dialog = page.getByRole('dialog', { name: /Write questions with Claude/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Step 1 of 3')).toBeVisible();
  await scan(page);

  // Needs topics and a question type before it will continue.
  await dialog.getByRole('button', { name: 'Create prompt' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Add at least one topic');

  await dialog.getByLabel(/Topics/).fill('Solar system\nIndian history, Solar system');
  await expect(dialog.getByText('2 topics')).toBeVisible(); // duplicate dropped
  await dialog.getByRole('radio', { name: 'Hard' }).click();
  await expect(dialog.getByText(/Detailed or specialised knowledge/)).toBeVisible();
  await dialog.getByLabel('Number of questions').selectOption('5');
  await dialog.getByLabel('True / false').check();
  await dialog.getByLabel('Type the answer').check();
  await dialog.getByLabel('Audience (optional)').fill('Class 8 students');
  await dialog.getByRole('button', { name: 'Create prompt' }).click();

  // Step 2: the prompt carries everything the host chose.
  await expect(dialog.getByText('Step 2 of 3')).toBeVisible();
  const prompt = dialog.getByLabel('Prompt for Claude');
  await expect(prompt).toHaveValue(/1\. Solar system\n2\. Indian history/);
  await expect(prompt).toHaveValue(/Difficulty: Hard\./);
  await expect(prompt).toHaveValue(/Number of questions: 5/);
  await expect(prompt).toHaveValue(/multiple choice \("mcq"\), true\/false \("tf"\), type-the-answer \("text"\)/);
  await expect(prompt).toHaveValue(/Audience: Class 8 students/);
  await expect(prompt).toHaveValue(/ONLY one JSON object/);
  const link = dialog.getByRole('link', { name: /claude\.ai/ });
  await expect(link).toHaveAttribute('href', 'https://claude.ai/new');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noreferrer/);
  await dialog.getByRole('button', { name: 'Copy prompt' }).click();
  await expect(dialog.getByText('✓ Copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await prompt.inputValue());
  await scan(page);

  // Step 3: paste a messy reply (chat text, code fence, one broken item, one duplicate).
  await dialog.getByRole('button', { name: /I have Claude's reply/ }).click();
  await dialog.getByLabel("Paste Claude's reply here").fill(claudeReply);
  await dialog.getByRole('button', { name: 'Check reply' }).click();
  await expect(dialog.getByRole('status').first()).toContainText('4 questions ready to review · 2 skipped');
  await expect(dialog.getByText('Check every answer before you use these.')).toBeVisible();
  await dialog.getByText('2 items were skipped').click();
  await expect(dialog.getByText(/needs 2 to 4 options, found 1/)).toBeVisible();
  await expect(dialog.getByText(/duplicate of another question/)).toBeVisible();
  // The right answer is marked in text, not just by position or colour.
  await expect(dialog.getByText('✓ correct')).toHaveCount(2);
  await scan(page);

  // Review: drop one, add the rest.
  await dialog.getByLabel(/Add question 2: Which planet is known as the Red Planet/).uncheck();
  await dialog.getByRole('button', { name: 'Add 3 questions to my quiz' }).click();
  await expect(dialog).toBeHidden();

  // The empty starter question was replaced, not kept.
  const nav = page.getByRole('navigation', { name: 'Questions' });
  await expect(nav.getByRole('listitem')).toHaveCount(3);
  await expect(nav.getByText('Empty question')).toHaveCount(0);
  await expect(nav.getByText('Which planet has the shortest day?')).toBeVisible();
  await expect(nav.getByText('The Taj Mahal is in Agra.')).toBeVisible();
  await expect(nav.getByText('Who founded the Mughal Empire?')).toBeVisible();
  await expect(page.getByText('✓ Saved')).toBeVisible();

  // What was saved is a complete quiz that can be hosted right away.
  const saved = (await (await context.request.get(`/api/quizzes/${id}`)).json()) as {
    questions: { type: string; text: string; options: string[]; correctIndex: number | null; timeLimitS: number }[];
  };
  expect(saved.questions.map((q) => q.type)).toEqual(['mcq', 'tf', 'text']);
  const mcq = saved.questions[0]!;
  expect(mcq.options[mcq.correctIndex!]).toBe('Jupiter'); // answer survived the option shuffle
  expect(mcq.timeLimitS).toBe(30); // hard multiple choice
  const hosted = await context.request.post(`/api/quizzes/${id}/host`, { data: { audienceConsent: true } });
  expect(hosted.status()).toBe(200);

  // Quiz Arena never contacted anything but itself.
  expect([...hosts]).toEqual([new URL(page.url()).host]);
  await context.close();
});

test('a reply with no questions in it is explained, and Escape closes the dialog without adding anything', async ({
  browser,
}) => {
  const { context, page } = await openEditor(browser);
  await page.getByRole('button', { name: /Write questions with Claude/ }).click();
  const dialog = page.getByRole('dialog', { name: /Write questions with Claude/ });
  await dialog.getByLabel(/Topics/).fill('Chemistry');
  await dialog.getByRole('button', { name: 'Create prompt' }).click();
  await dialog.getByRole('button', { name: /I have Claude's reply/ }).click();
  await dialog.getByLabel("Paste Claude's reply here").fill("I'm sorry, I can't help with that.");
  await dialog.getByRole('button', { name: 'Check reply' }).click();
  await expect(dialog.getByRole('alert')).toContainText("couldn't find any questions");
  await expect(dialog.getByRole('button', { name: /Add \d+ question/ })).toHaveCount(0);
  await scan(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Questions' }).getByRole('listitem')).toHaveCount(1);
  await context.close();
});

test('the whole generator works from the keyboard and keeps focus inside the dialog', async ({ browser }) => {
  const { context, page } = await openEditor(browser);
  const opener = page.getByRole('button', { name: /Write questions with Claude/ });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Write questions with Claude/ });
  await expect(dialog.getByLabel(/Topics/)).toBeFocused();
  await page.keyboard.type('Geography');
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await context.close();
});
