import { expect, test } from '@playwright/test';
import { expectLobbyCount, hostNext, joinPlayer, openQuestion, startGame, tile, type Player } from './helpers';

test('host and five players play a full game', async ({ browser }) => {
  const { page: host, pin, context: hostCtx } = await startGame(browser);
  const players: Player[] = [];
  for (const name of ['Asha', 'Bilal', 'Chitra', 'Dev', 'Esha']) players.push(await joinPlayer(browser, pin, name));
  const [p1, p2, p3, p4, p5] = players as [Player, Player, Player, Player, Player];
  await expectLobbyCount(host, 5);
  for (const p of players) await expect(host.getByText(p.name, { exact: true })).toBeVisible();

  // ---- Q1: multiple choice, correct = B (Mars) ----
  await openQuestion(host, players);
  await expect(host.getByText('Which planet is known as the Red Planet?')).toBeVisible();
  // Phones get shapes only: no question text, no option text.
  await expect(p1.page.getByText('Mars')).toHaveCount(0);
  await expect(p1.page.getByText('Red Planet')).toHaveCount(0);
  await tile(p1, 'B').click();
  await expect(p1.page.getByText('Locked in')).toBeVisible();
  await expect(host.getByText('1/5')).toBeVisible();
  await tile(p2, 'B').click();
  await tile(p3, 'B').click();
  await tile(p4, 'A').click();
  await tile(p5, 'C').click(); // last answer closes the question early

  await expect(p1.page.getByText('Correct!')).toBeVisible();
  await expect(p4.page.getByText('Not quite')).toBeVisible();
  await expect(host.getByLabel('3 answers')).toBeVisible(); // Mars
  await expect(host.getByLabel('1 answers').first()).toBeVisible();

  await hostNext(host);
  await expect(host.getByText('Leaderboard')).toBeVisible();
  await expect(p1.page.getByText('Your rank')).toBeVisible();

  // ---- Q2: true / false, correct = False ----
  await hostNext(host);
  await hostNext(host); // skip countdown
  await expect(host.getByText('Great Wall of China')).toBeVisible();
  await p1.page.getByRole('button', { name: 'False' }).click();
  await p2.page.getByRole('button', { name: 'True' }).click();
  await p3.page.getByRole('button', { name: 'False' }).click();
  await p4.page.getByRole('button', { name: 'False' }).click();
  await p5.page.getByRole('button', { name: 'True' }).click();
  await expect(p1.page.getByText('Correct!')).toBeVisible();
  await expect(p2.page.getByText('Not quite')).toBeVisible();
  await hostNext(host);
  await hostNext(host);
  await hostNext(host);

  // ---- Q3: type the answer (typo tolerance, host accepts an extra answer) ----
  await expect(host.getByText('capital of Maharashtra')).toBeVisible();
  const type = async (p: Player, text: string) => {
    await p.page.getByLabel('Type your answer').fill(text);
    await p.page.getByRole('button', { name: 'Submit' }).click();
  };
  await type(p1, 'mumbay'); // one typo, still accepted
  await type(p2, 'Bombay');
  await type(p3, 'Pune');
  await type(p4, 'x');
  await type(p5, 'x');
  await expect(p1.page.getByText('Correct!')).toBeVisible();
  await expect(p3.page.getByText('Not quite')).toBeVisible();
  await expect(host.getByText('✔ Mumbai')).toBeVisible();
  await host.getByRole('button', { name: 'Accept this answer' }).last().click(); // "Pune" (count 1) sorts after "x" (count 2);
  await expect(p3.page.getByText('Correct!')).toBeVisible(); // retroactively scored

  await hostNext(host);
  await expect(host.getByText('Final standings')).toBeVisible();
  await hostNext(host);
  await expect(host.getByText('🏆 Podium')).toBeVisible();
  await expect(p1.page.getByText('Final rank')).toBeVisible();
  await expect(p1.page.getByText('#1', { exact: true })).toBeVisible();

  // ---- results ----
  await hostNext(host);
  await expect(host.getByRole('table')).toBeVisible();
  for (const p of players) await expect(host.getByRole('cell', { name: p.name })).toBeVisible();

  await host.mouse.move(400, 400); // wake the auto-hiding control bar
  const [download] = await Promise.all([
    host.waitForEvent('download'),
    host.getByRole('button', { name: '⬇ CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`quiz-results-${pin}.csv`);

  await host.mouse.move(420, 420);
  await host.getByRole('button', { name: 'End game' }).click();
  await expect(host).toHaveURL(/\/host$/);
  await expect(host.getByText('Past games')).toBeVisible();
  await host.getByRole('link', { name: 'View' }).first().click();
  await expect(host.getByRole('heading', { name: 'E2E quiz' })).toBeVisible();
  await expect(host.getByRole('cell', { name: 'Asha' })).toBeVisible();

  // The game is gone for latecomers.
  const late = await browser.newContext();
  const page = await late.newPage();
  await page.goto(`/j/${pin}`);
  await expect(page.getByText('Game not found')).toBeVisible();

  await Promise.all([hostCtx, ...players.map((p) => p.context), late].map((c) => c.close()));
});

test('joining: wrong PIN, nickname rules, locked lobby, kick', async ({ browser }) => {
  const { page: host, pin, context: hostCtx } = await startGame(browser);

  const stranger = await browser.newContext();
  const sp = await stranger.newPage();
  await sp.goto('/');
  await sp.getByPlaceholder('Game PIN').fill('000000');
  await sp.getByRole('button', { name: 'Join game' }).click();
  await expect(sp.getByText('Game not found')).toBeVisible();

  // Nickname validation happens server-side too.
  const rude = await browser.newContext();
  const rp = await rude.newPage();
  await rp.goto(`/j/${pin}`);
  await rp.getByLabel('Nickname', { exact: true }).fill('f.u.c.k');
  await rp.getByLabel(/old enough to join/).check();
  await rp.getByRole('button', { name: 'Join game' }).click();
  await expect(rp.getByRole('alert')).toContainText('different nickname');

  const a = await joinPlayer(browser, pin, 'Riya');
  const b = await joinPlayer(browser, pin, 'Riya'); // duplicate gets a suffix
  await expect(b.page.getByText('Riya 2')).toBeVisible();
  await expectLobbyCount(host, 2);

  // Host locks the lobby: newcomers are refused, existing players are not affected.
  await host.keyboard.press('k');
  await host.getByLabel('Lock lobby (no new players)').click();
  await expect(host.getByLabel('Lock lobby (no new players)')).toBeChecked();
  const late = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const lp = await late.newPage();
  await lp.goto(`/j/${pin}`);
  await expect(lp.getByText('Lobby is locked')).toBeVisible();

  // Kick: the player sees why.
  await host.getByRole('button', { name: 'Kick' }).last().click();
  await host.getByRole('alertdialog').getByRole('button', { name: 'Remove player' }).click();
  await expect(b.page.getByText('You were removed')).toBeVisible();
  await expect(a.page.getByText("You're in!")).toBeVisible();
  await expectLobbyCount(host, 1);

  await Promise.all([hostCtx, stranger, rude, a.context, b.context, late].map((c) => c.close()));
});
