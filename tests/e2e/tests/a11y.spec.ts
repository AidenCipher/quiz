import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { joinPlayer, openQuestion, startGame } from './helpers';

// Reduced motion collapses entrance animations, so axe never samples a half-faded element.
const scan = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};

test('home, join form and host sign-in have no WCAG A/AA violations', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await scan(page);
  await page.goto('/host');
  await expect(page.getByText('Host a quiz').first()).toBeVisible();
  await scan(page);

  const { pin, context } = await startGame(browser);
  await page.goto(`/j/${pin}`);
  await expect(page.getByLabel('Nickname')).toBeVisible();
  await scan(page);
  await Promise.all([ctx.close(), context.close()]);
});

test('lobby, phone answer screen and big-screen question have no WCAG A/AA violations', async ({ browser }) => {
  const { page: host, pin, context } = await startGame(browser);
  await scan(host);
  const p = await joinPlayer(browser, pin, 'Asha');
  await scan(p.page);
  await openQuestion(host, [p]);
  await scan(p.page);
  await scan(host);
  await Promise.all([context.close(), p.context.close()]);
});
