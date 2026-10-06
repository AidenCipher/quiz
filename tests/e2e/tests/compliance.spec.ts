import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { demoQuiz, hostNext, joinPlayer, openQuestion, startGame, tile } from './helpers';

const policyPages = [
  { path: '/privacy', heading: 'Privacy policy', mentions: ['Nickname', 'Cloudflare', '30 days'] },
  { path: '/cookies', heading: 'Cookie and storage policy', mentions: ['qa_session', 'strictly necessary'] },
  { path: '/trust', heading: 'Trust & safety', mentions: ['Phones never receive the question text', 'cannot see'] },
  { path: '/refunds', heading: 'Pricing & refunds', mentions: ['is free', 'nothing to refund'] },
  { path: '/credits', heading: 'Credits & licences', mentions: ['Inter', 'SIL Open Font License'] },
  { path: '/delete-data', heading: 'Delete my data', mentions: ['Leave and erase my data', 'delete your account'] },
  {
    path: '/contact',
    heading: 'Contact & business details',
    mentions: ['Example Operator Ltd', 'privacy@example.test'],
  },
];

async function newPage(browser: Browser, opts: Parameters<Browser['newContext']>[0] = {}) {
  const context = await browser.newContext(opts);
  return { context, page: await context.newPage() };
}

test.describe('policies and business details', () => {
  for (const p of policyPages) {
    test(`${p.path} is reachable, accurate and accessible`, async ({ browser }) => {
      const { context, page } = await newPage(browser);
      await page.goto(p.path);
      await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible();
      for (const text of p.mentions) await expect(page.getByRole('main')).toContainText(text);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      await context.close();
    });
  }

  test('every page links to the legal pages and operator details; the privacy policy names the operator', async ({
    browser,
  }) => {
    const { context, page } = await newPage(browser);
    await page.goto('/');
    const legal = page.getByRole('navigation', { name: 'Legal' });
    for (const name of [
      'Privacy',
      'Cookies',
      'Trust & safety',
      'Pricing & refunds',
      'Delete my data',
      'Credits & licences',
      'Contact',
    ]) {
      await expect(legal.getByRole('link', { name })).toBeVisible();
    }
    await legal.getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByRole('main')).toContainText('Example Operator Ltd');
    await expect(page.getByRole('main')).toContainText('1 Example Street, Bengaluru 560001');
    await expect(page.getByRole('main')).not.toContainText('not provided by the operator');
    await context.close();
  });

  test('the third-party notices file lists the font licence and only permissive licences', async ({ request }) => {
    const text = await (await request.get('/third-party-notices.txt')).text();
    expect(text).toContain('SIL OPEN FONT LICENSE');
    expect(text).toContain('Inter');
    expect(text).not.toMatch(/\bGPL|AGPL|SSPL\b/);
  });
});

test.describe('third parties and storage', () => {
  test('no request leaves our origin, no cookie is set for players, and storage is limited to what the policy lists', async ({
    browser,
  }) => {
    const hosts = new Set<string>();
    const game = await startGame(browser);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    ctx.on('request', (r) => hosts.add(new URL(r.url()).host));
    const page = await ctx.newPage();
    await page.goto('/');
    await page.goto(`/j/${game.pin}`);
    await page.getByLabel('Nickname', { exact: true }).fill('Riya');
    await page.getByLabel(/old enough to join/).check();
    await page.getByRole('button', { name: 'Join game' }).click();
    await expect(page.getByText("You're in!")).toBeVisible();
    await hostNext(game.page);
    await hostNext(game.page);
    await expect(page.getByRole('timer')).toBeVisible();
    await page.getByRole('button', { name: 'Option B' }).click();
    await expect(page.getByText('Correct!')).toBeVisible();

    expect([...hosts]).toEqual([new URL(page.url()).host]); // no Google Fonts, analytics, CDNs
    expect(await ctx.cookies()).toEqual([]); // players get no cookie at all
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.every((k) => k.startsWith('qa:player:') || k === 'qa:notice' || k === 'qa:muted')).toBe(true);
    expect(keys).not.toContain('qa:profile'); // remembering is opt-in
    await Promise.all([ctx.close(), game.context.close()]);
  });

  test('the host sign-in cookie is HttpOnly and SameSite=Lax', async ({ browser }) => {
    const game = await startGame(browser);
    const cookies = await game.context.cookies();
    const session = cookies.find((c) => c.name === 'qa_session')!;
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe('Lax');
    expect(cookies.map((c) => c.name)).toEqual(['qa_session']);
    await game.context.close();
  });

  test('the Content-Security-Policy allows no third-party origin', async ({ request }) => {
    const res = await request.get('/');
    const csp = res.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/googleapis|gstatic|cloudflareinsights|google-analytics|https:\/\/(?!\*)/);
  });
});

test.describe('storage notice (no dark patterns)', () => {
  test('is a plain notice with one OK button, stays dismissed, and never covers a game', async ({ browser }) => {
    const { context, page } = await newPage(browser);
    await page.goto('/');
    const notice = page.getByRole('region', { name: 'Cookies and storage' });
    await expect(notice).toBeVisible();
    await expect(notice.getByRole('button')).toHaveCount(1); // no pre-ticked categories, no "accept all" vs hidden "reject"
    await expect(notice.getByRole('link', { name: 'Cookie policy' })).toBeVisible();
    await notice.getByRole('button', { name: 'OK' }).click();
    await expect(notice).toBeHidden();
    await page.reload();
    await expect(notice).toBeHidden();
    await context.close();

    const game = await startGame(browser);
    await expect(game.page.getByRole('region', { name: 'Cookies and storage' })).toHaveCount(0); // big screen
    const p = await newPage(browser, { viewport: { width: 390, height: 800 } });
    await p.page.goto(`/j/${game.pin}`);
    await expect(p.page.getByRole('region', { name: 'Cookies and storage' })).toBeVisible();
    await p.page.getByLabel('Nickname', { exact: true }).fill('Ann');
    await p.page.getByLabel(/old enough to join/).check();
    await p.page.getByRole('button', { name: 'Join game' }).click();
    await expect(p.page.getByText("You're in!")).toBeVisible();
    await expect(p.page.getByRole('region', { name: 'Cookies and storage' })).toHaveCount(0); // hidden once in a game
    await Promise.all([p.context.close(), game.context.close()]);
  });
});

test.describe('consent on forms', () => {
  test('players: Join stays disabled until they confirm permission; "remember me" is opt-in and works', async ({
    browser,
  }) => {
    const game = await startGame(browser);
    const { context, page } = await newPage(browser, { viewport: { width: 390, height: 800 } });
    await page.goto(`/j/${game.pin}`);
    const join = page.getByRole('button', { name: 'Join game' });
    const allowed = page.getByLabel(/old enough to join/);
    const remember = page.getByLabel(/Remember my nickname/);
    await expect(allowed).not.toBeChecked();
    await expect(remember).not.toBeChecked();
    await page.getByLabel('Nickname', { exact: true }).fill('Riya');
    await expect(join).toBeDisabled();
    await allowed.check();
    await expect(join).toBeEnabled();
    await expect(page.getByText('(Required)')).toBeVisible();
    await expect(page.getByText('(Optional)')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy policy' }).first()).toBeVisible();
    await remember.check();
    await join.click();
    await expect(page.getByText("You're in!")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('qa:profile'))).toContain('Riya');
    await Promise.all([context.close(), game.context.close()]);
  });

  test('hosts: opening a lobby needs an explicit, unticked-by-default confirmation, enforced by the server too', async ({
    browser,
  }) => {
    const { context, page } = await newPage(browser);
    await context.request.post('/api/auth/dev', { data: { name: 'Consent Host' } });
    const created = await context.request.post('/api/quizzes', {
      data: {
        title: 'C',
        settings: {},
        questions: [{ id: 'a', type: 'tf', text: 'Q', correctIndex: 0, timeLimitS: 10, points: 1000 }],
      },
    });
    const { id } = (await created.json()) as { id: string };
    expect((await context.request.post(`/api/quizzes/${id}/host`)).status()).toBe(400);

    await page.goto('/host');
    await page.getByRole('button', { name: '▶ Host live' }).click();
    const dialog = page.getByRole('dialog', { name: 'Before you open the lobby' });
    await expect(dialog).toBeVisible();
    const open = dialog.getByRole('button', { name: 'Open lobby' });
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await expect(open).toBeDisabled();
    await dialog.getByRole('checkbox').check();
    await open.click();
    await expect(page).toHaveURL(/\/host\/live\/\d{6}/);
    await context.close();
  });
});

test.describe('data deletion', () => {
  test('a player can leave and erase their data mid-game; they vanish from the results and storage', async ({
    browser,
  }) => {
    const game = await startGame(browser, demoQuiz().slice(0, 1));
    const ann = await joinPlayer(browser, game.pin, 'Ann');
    const bob = await joinPlayer(browser, game.pin, 'Bob');
    await openQuestion(game.page, [ann, bob]);
    await tile(ann, 'B').click();

    await ann.page.getByRole('button', { name: 'Leave and erase my data' }).click();
    const dialog = ann.page.getByRole('alertdialog', { name: 'Leave and erase your data?' });
    await dialog.getByRole('button', { name: 'Cancel' }).click(); // cancel changes nothing
    await expect(ann.page.getByText('Locked in')).toBeVisible();
    await ann.page.getByRole('button', { name: 'Leave and erase my data' }).click();
    await dialog.getByRole('button', { name: 'Leave and erase' }).click();
    await expect(ann.page.getByText('Your data was erased')).toBeVisible();
    expect(await ann.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('qa:player:')))).toEqual(
      [],
    );

    await tile(bob, 'B').click(); // Bob is now the only player; the question closes
    await expect(bob.page.getByText('Correct!')).toBeVisible();
    await hostNext(game.page); // leaderboard
    await expect(game.page.getByText('Final standings')).toBeVisible();
    await hostNext(game.page); // podium
    await expect(game.page.getByText('🏆 Podium')).toBeVisible();
    await hostNext(game.page); // full results
    await expect(game.page.getByRole('cell', { name: 'Bob' })).toBeVisible();
    await expect(game.page.getByRole('cell', { name: 'Ann' })).toHaveCount(0);

    // Reloading the erased player's page does not bring them back.
    await ann.page.reload();
    await expect(ann.page.getByText(/Pick a name and face|Game not found/)).toBeVisible();
    await Promise.all([game.context, ann.context, bob.context].map((c) => c.close()));
  });

  test('a host can export, delete results, and delete their account', async ({ browser }) => {
    const game = await startGame(browser, demoQuiz().slice(0, 1));
    const p = await joinPlayer(browser, game.pin, 'Zed');
    await openQuestion(game.page, [p]);
    await tile(p, 'B').click();
    await hostNext(game.page); // leaderboard
    await expect(game.page.getByText('Final standings')).toBeVisible();
    await hostNext(game.page); // podium
    await expect(game.page.getByText('🏆 Podium')).toBeVisible();
    await game.page.mouse.move(300, 300);
    await game.page.getByRole('button', { name: 'End game' }).click();
    await expect(game.page).toHaveURL(/\/host$/);
    await expect(game.page.getByText('Past games')).toBeVisible();

    // export has the account and results, and no email or picture
    const exported = await game.context.request.get('/api/me/export');
    const data = (await exported.json()) as { account: Record<string, unknown>; gameResults: unknown[] };
    expect(Object.keys(data.account).sort()).toEqual(['id', 'name']);
    expect(data.gameResults).toHaveLength(1);
    const [download] = await Promise.all([
      game.page.waitForEvent('download'),
      game.page.getByRole('link', { name: 'Download my data' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('quiz-arena-my-data.json');

    // delete the result
    await game.page.getByRole('button', { name: 'Delete results' }).click();
    await game.page.getByRole('alertdialog').getByRole('button', { name: 'Delete results' }).click();
    await expect(game.page.getByText('Finished games appear here')).toBeVisible();

    // delete the account
    await game.page.getByRole('button', { name: 'Delete my account' }).click();
    await game.page.getByRole('alertdialog').getByRole('button', { name: 'Delete everything' }).click();
    await expect(game.page.getByRole('heading', { name: 'Host a quiz' })).toBeVisible();
    expect((await game.context.request.get('/api/quizzes')).status()).toBe(401);
    await Promise.all([game.context.close(), p.context.close()]);
  });
});

test.describe('keyboard navigation', () => {
  test('a player can join using only the keyboard, and the skip link works', async ({ browser }) => {
    const game = await startGame(browser);
    const { context, page } = await newPage(browser, { viewport: { width: 390, height: 800 } });
    await page.goto(`/j/${game.pin}`);
    await expect(page.getByRole('heading', { name: 'Pick a name and face' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.getByLabel('Nickname', { exact: true }).focus();
    await page.keyboard.type('Keys');
    await page.getByLabel(/old enough to join/).focus();
    await page.keyboard.press('Space');
    await expect(page.getByLabel(/old enough to join/)).toBeChecked();
    await page.getByLabel('Nickname', { exact: true }).focus();
    await page.keyboard.press('Enter'); // submit from the text field
    await expect(page.getByText("You're in!")).toBeVisible();
    await Promise.all([context.close(), game.context.close()]);
  });

  test('a player answers with the keyboard and keeps a visible focus ring', async ({ browser }) => {
    const game = await startGame(browser);
    const p = await joinPlayer(browser, game.pin, 'Keys');
    await openQuestion(game.page, [p]);
    const b = tile(p, 'B');
    await p.page.keyboard.press('Shift'); // keyboard modality, so :focus-visible applies
    await b.focus();
    const outline = await b.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
    await p.page.keyboard.press('Enter');
    await expect(p.page.getByText('Correct!')).toBeVisible();
    await Promise.all([game.context.close(), p.context.close()]);
  });

  test('dialogs trap focus, close on Escape and return focus to the button that opened them', async ({ browser }) => {
    const { context, page } = await newPage(browser);
    await context.request.post('/api/auth/dev', { data: { name: 'Key Host' } });
    await context.request.post('/api/quizzes', {
      data: {
        title: 'K',
        settings: {},
        questions: [{ id: 'a', type: 'tf', text: 'Q', correctIndex: 0, timeLimitS: 10, points: 1000 }],
      },
    });
    await page.goto('/host');
    const hostLive = page.getByRole('button', { name: '▶ Host live' });
    await hostLive.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Before you open the lobby' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox')).toBeFocused(); // focus moved into the dialog
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true); // never leaves
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(hostLive).toBeFocused();
    await context.close();
  });

  test('the host runs a whole game from the keyboard: Space, P, K, Escape', async ({ browser }) => {
    const game = await startGame(browser);
    const p = await joinPlayer(browser, game.pin, 'Kay');
    await game.page.keyboard.press('Space');
    await game.page.keyboard.press('Space');
    await expect(p.page.getByRole('timer')).toBeVisible();
    await game.page.keyboard.press('p');
    await expect(p.page.getByText('Paused by the host')).toBeVisible();
    await game.page.keyboard.press('p');
    await expect(p.page.getByText('Paused by the host')).toBeHidden();
    await game.page.keyboard.press('k');
    const drawer = game.page.getByRole('complementary', { name: 'Moderation' });
    await expect(drawer).toBeVisible();
    await game.page.keyboard.press('Space'); // inside the drawer, Space must not advance the game
    await expect(p.page.getByRole('timer')).toBeVisible();
    await game.page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await Promise.all([game.context.close(), p.context.close()]);
  });
});

test.describe('alt text', () => {
  test('a question image needs a description before the quiz can be hosted, and the big screen uses it', async ({
    browser,
  }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
    await context.request.post('/api/auth/dev', { data: { name: 'Alt Host' } });
    const created = await context.request.post('/api/quizzes', {
      data: {
        title: 'Alt',
        settings: {},
        questions: [{ id: 'a', type: 'tf', text: 'Is this a square?', correctIndex: 0, timeLimitS: 10, points: 1000 }],
      },
    });
    const { id } = (await created.json()) as { id: string };
    await page.goto(`/host/quiz/${id}`);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
      'base64',
    );
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: '🖼 Add image' }).click(),
    ]);
    await chooser.setFiles({ name: 'square.png', mimeType: 'image/png', buffer: png });
    const alt = page.getByLabel('Describe the image for screen readers (required)');
    await expect(alt).toBeVisible();
    await expect(page.getByText('Only upload images you have the right to use.')).toHaveCount(0); // shown before upload
    await page.getByRole('button', { name: '▶ Host live' }).click();
    await expect(page.getByRole('alert')).toContainText('alt text');
    await alt.fill('A red square on a white background');
    await page.getByRole('button', { name: '▶ Host live' }).click();
    await page.getByRole('dialog').getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Open lobby' }).click();
    await expect(page).toHaveURL(/\/host\/live\/\d{6}/);
    const p = await joinPlayer(browser, page.url().split('/').pop()!, 'Pat');
    await hostNext(page);
    await hostNext(page);
    await expect(page.getByRole('img', { name: 'A red square on a white background' })).toBeVisible();
    await Promise.all([context.close(), p.context.close()]);
  });
});

async function scan(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

test('dashboard, builder, dialogs, results and every in-game phone screen pass axe', async ({ browser }) => {
  const game = await startGame(browser);
  const p = await joinPlayer(browser, game.pin, 'Axe');
  await scan(p.page); // waiting
  await openQuestion(game.page, [p]);
  await tile(p, 'B').click();
  await scan(p.page); // locked in
  await expect(p.page.getByText('Correct!')).toBeVisible();
  await scan(p.page); // reveal
  await game.page.keyboard.press('k');
  await expect(game.page.getByRole('complementary', { name: 'Moderation' })).toBeVisible();
  await scan(game.page); // moderation drawer over the reveal
  await game.page.keyboard.press('Escape');
  await hostNext(game.page);
  await expect(p.page.getByText('Your rank')).toBeVisible();
  await scan(p.page); // leaderboard
  await scan(game.page); // big-screen leaderboard
  await p.page.getByRole('button', { name: 'Leave and erase my data' }).click();
  await scan(p.page); // confirm dialog
  await p.page.getByRole('button', { name: 'Cancel' }).click();
  await hostNext(game.page); // next question
  await hostNext(game.page); // skip countdown
  await expect(game.page.getByText('Great Wall of China')).toBeVisible();
  await game.page.mouse.move(300, 300); // wake the auto-hiding control bar
  await game.page.getByRole('button', { name: 'End', exact: true }).click();
  await game.page.getByRole('alertdialog').getByRole('button', { name: 'End and show podium' }).click();
  await expect(game.page.getByText('🏆 Podium')).toBeVisible();
  await scan(p.page); // podium
  await game.page.mouse.move(300, 300);
  await game.page.getByRole('button', { name: 'End game' }).click();
  await expect(game.page).toHaveURL(/\/host$/);
  await scan(game.page); // dashboard
  await game.page.getByRole('button', { name: 'Delete my account' }).click();
  await scan(game.page); // confirm dialog
  await game.page.getByRole('button', { name: 'Cancel' }).click();
  await game.page.getByRole('link', { name: 'View' }).first().click();
  await expect(game.page.getByRole('heading', { name: 'E2E quiz' })).toBeVisible();
  await scan(game.page); // results
  await game.page.goto(`/host/quiz/${game.quizId}`);
  await expect(game.page.getByLabel('Quiz title')).toBeVisible();
  await scan(game.page); // builder
  await game.page.getByRole('button', { name: '⚙ Game settings' }).click();
  await scan(game.page); // settings dialog
  await Promise.all([game.context.close(), p.context.close()]);
});
