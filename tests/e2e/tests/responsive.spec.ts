import { expect, test, type Page } from '@playwright/test';
import { demoQuiz, hostNext, joinPlayer, openQuestion, startGame, tile, type Player } from './helpers';

/** Every route at phone, tablet, laptop and projector sizes: nothing may scroll sideways or hide behind the edge. */
const SIZES = [
  { name: 'phone-s', width: 360, height: 640 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'projector', width: 1920, height: 1080 },
] as const;

const SHOTS = process.env.SHOTS; // set to a directory to also save screenshots for a visual review

async function noSidewaysScroll(page: Page, label: string) {
  await page.waitForTimeout(400);
  const over = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = Math.max(doc.scrollWidth, document.body.scrollWidth) - doc.clientWidth;
    // Elements poking past the right edge (ignoring ones deliberately clipped by an overflow container).
    const bad: string[] = [];
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= doc.clientWidth + 1) return;
      let p: HTMLElement | null = el.parentElement;
      while (p && p !== document.body) {
        const o = getComputedStyle(p).overflowX;
        if (o !== 'visible') return;
        if (getComputedStyle(p).position === 'fixed') return;
        p = p.parentElement;
      }
      if (getComputedStyle(el).position === 'fixed') return;
      bad.push(`${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 40)} ${Math.round(r.right)}`);
    });
    return { wide, bad: bad.slice(0, 5) };
  });
  expect(over.wide, `${label}: page scrolls sideways by ${over.wide}px (${over.bad.join('; ')})`).toBeLessThanOrEqual(
    1,
  );
}

async function shot(page: Page, name: string, size: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${size}.png`, fullPage: true });
}

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('public pages', async ({ page }) => {
      for (const path of ['/', '/privacy', '/cookies', '/trust', '/refunds', '/credits', '/contact', '/delete-data']) {
        await page.goto(path);
        await expect(page.locator('main, #root').first()).toBeVisible();
        await noSidewaysScroll(page, `${path} @${size.name}`);
        await shot(page, path === '/' ? 'home' : path.slice(1), size.name);
      }
    });

    test('host pages, builder, settings and results', async ({ browser }) => {
      const { page, context, pin, quizId } = await startGame(browser);
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/host');
      await expect(page.getByText('Past games')).toBeVisible();
      await noSidewaysScroll(page, `/host @${size.name}`);
      await shot(page, 'host', size.name);
      await page.goto(`/host/quiz/${quizId}`);
      await expect(page.getByRole('button', { name: /Game settings/ })).toBeVisible();
      await noSidewaysScroll(page, `builder @${size.name}`);
      await shot(page, 'builder', size.name);
      await page.getByRole('button', { name: /Game settings/ }).click();
      await expect(page.getByRole('dialog', { name: 'Game settings' })).toBeVisible();
      await noSidewaysScroll(page, `settings @${size.name}`);
      await shot(page, 'settings', size.name);
      await page.keyboard.press('Escape');
      await page.goto(`/host/live/${pin}`);
      await expect(page.getByText(pin, { exact: true })).toBeVisible();
      await noSidewaysScroll(page, `live lobby @${size.name}`);
      await shot(page, 'live-lobby', size.name);
      await context.close();
    });

    test('player screens through a whole question', async ({ browser }) => {
      const game = await startGame(browser, demoQuiz());
      const asha = await joinPlayer(browser, game.pin, 'Asha');
      await asha.page.setViewportSize({ width: size.width, height: size.height });
      await noSidewaysScroll(asha.page, `waiting @${size.name}`);
      await shot(asha.page, 'play-waiting', size.name);
      await openQuestion(game.page, [asha]);
      await noSidewaysScroll(asha.page, `answer @${size.name}`);
      await shot(asha.page, 'play-answer', size.name);
      await tile(asha, 'A').click(); // wrong; the only player, so the question closes at once
      await expect(asha.page.getByText('Not quite')).toBeVisible();
      await noSidewaysScroll(asha.page, `reveal @${size.name}`);
      await shot(asha.page, 'play-reveal', size.name);
      await game.context.close();
      await asha.context.close();
    });

    test('join form and big screen', async ({ browser }) => {
      const game = await startGame(browser, demoQuiz());
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      const join = await ctx.newPage();
      await join.goto(`/j/${game.pin}`);
      await expect(join.getByLabel('Nickname', { exact: true })).toBeVisible();
      await noSidewaysScroll(join, `join @${size.name}`);
      await shot(join, 'join', size.name);
      const screen = await game.context.newPage(); // the big screen is opened by the signed-in host
      await screen.setViewportSize({ width: size.width, height: size.height });
      await screen.goto(`/screen/${game.pin}`);
      await expect(screen.getByText(game.pin).first()).toBeVisible();
      await noSidewaysScroll(screen, `screen @${size.name}`);
      await shot(screen, 'screen', size.name);
      await ctx.close();
      await game.context.close();
    });
  });
}

test('the big screen shows every phase at laptop size without overflow', async ({ browser }) => {
  const game = await startGame(browser, demoQuiz());
  const players: Player[] = [];
  for (const n of ['Asha', 'Bilal', 'Chitra']) players.push(await joinPlayer(browser, game.pin, n));
  await openQuestion(game.page, players);
  await shot(game.page, 'stage-question', 'laptop');
  for (const [i, p] of players.entries()) await tile(p, i === 0 ? 'B' : 'A').click();
  await expect(game.page.getByTestId('stage-callout')).toBeVisible();
  await shot(game.page, 'stage-reveal', 'laptop');
  await noSidewaysScroll(game.page, 'stage reveal');
  await hostNext(game.page);
  await expect(game.page.getByText('Leaderboard')).toBeVisible();
  await game.page.waitForTimeout(900);
  await shot(game.page, 'stage-leaderboard', 'laptop');
});
