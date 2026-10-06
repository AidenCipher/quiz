import { expect, test } from '@playwright/test';
import { blipBlur, hostNext, joinPlayer, openQuestion, setHidden, startGame, tile, type Player } from './helpers';

async function room(browser: Parameters<typeof startGame>[0], names = ['Asha', 'Bilal', 'Chitra']) {
  const game = await startGame(browser);
  const players: Player[] = [];
  for (const name of names) players.push(await joinPlayer(browser, game.pin, name));
  await openQuestion(game.page, players);
  return {
    ...game,
    players,
    close: () => Promise.all([game.context, ...players.map((p) => p.context)].map((c) => c.close())),
  };
}

test('a 2 s+ tab switch is flagged to the room, voids the answer, and the host can clear it', async ({ browser }) => {
  const { page: host, players, close } = await room(browser);
  const [asha, bilal, chitra] = players as [Player, ...Player[]];

  await setHidden(asha.page, true);
  await asha.page.waitForTimeout(2300);
  await setHidden(asha.page, false);

  // The big screen animates the suspect; every phone is told; the flagged player gets a warning.
  await expect(host.getByRole('status', { name: /Asha looks suspicious/ })).toBeVisible();
  await expect(bilal.page.getByText('👀 Asha was flagged')).toBeVisible();
  await expect(chitra.page.getByText('👀 Asha was flagged')).toBeVisible();
  const warning = asha.page.getByRole('alertdialog', { name: 'Warning' });
  await expect(warning).toContainText('You left the quiz for 2.');
  await expect(warning).toContainText("doesn't count");
  await warning.getByRole('button', { name: 'Got it' }).click();

  await asha.page.waitForTimeout(3200); // answer outside the "just returned" window
  await tile(asha, 'B').click();
  await tile(bilal, 'B').click();
  await tile(chitra, 'A').click();

  await expect(asha.page.getByText('Answer voided')).toBeVisible();
  await expect(bilal.page.getByText('Correct!')).toBeVisible();
  await expect(host.getByText(/Voided:\s*Asha/)).toBeVisible();

  // Clearing the flag refunds it for everyone and removes the badge.
  await host.keyboard.press('k');
  await expect(host.getByText('Flags (1)')).toBeVisible();
  await host.getByRole('button', { name: 'Clear' }).click();
  await expect(asha.page.getByText('Correct!')).toBeVisible();
  await expect(host.getByText('Flags (0)')).toBeVisible();
  await expect(host.getByText(/Voided:/)).toHaveCount(0);
  await close();
});

test('a short tab switch is flagged but the answer still scores; a sub-second blip is ignored', async ({ browser }) => {
  const { players, close } = await room(browser);
  const [asha, bilal, chitra] = players as [Player, ...Player[]];

  await blipBlur(chitra.page, 600); // under 1 s of lost focus: ignored
  await bilal.page.waitForTimeout(1200);
  await expect(bilal.page.getByText('was flagged')).toHaveCount(0);

  await setHidden(asha.page, true);
  await asha.page.waitForTimeout(1200);
  await setHidden(asha.page, false);
  await expect(bilal.page.getByText('👀 Asha was flagged')).toBeVisible();
  await expect(asha.page.getByRole('alertdialog')).toContainText('No points lost');
  await asha.page.getByRole('button', { name: 'Got it' }).click();

  await asha.page.waitForTimeout(3200);
  await tile(asha, 'B').click();
  await tile(bilal, 'B').click();
  await tile(chitra, 'B').click();
  await expect(asha.page.getByText('Correct!')).toBeVisible();
  await close();
});

test('answering right after returning from a flagged switch escalates to a major flag', async ({ browser }) => {
  const { page: host, players, close } = await room(browser, ['Asha', 'Bilal']);
  const [asha, bilal] = players as [Player, ...Player[]];

  await setHidden(asha.page, true);
  await asha.page.waitForTimeout(1200);
  await setHidden(asha.page, false);
  await expect(bilal.page.getByText('👀 Asha was flagged')).toBeVisible();
  await asha.page.getByRole('button', { name: 'Got it' }).click(); // dismiss the warning, then answer straight away
  await tile(asha, 'B').click(); // within 3 s of returning
  await tile(bilal, 'B').click();

  await expect(asha.page.getByText('Answer voided')).toBeVisible();
  await expect(asha.page.getByText(/500 points/)).toBeVisible();
  await expect(host.getByText(/Voided:\s*Asha/)).toBeVisible();
  await close();
});

test('switching away in the lobby or on the leaderboard is not counted', async ({ browser }) => {
  const game = await startGame(browser);
  const a = await joinPlayer(browser, game.pin, 'Asha');
  const b = await joinPlayer(browser, game.pin, 'Bilal');
  await setHidden(a.page, true);
  await a.page.waitForTimeout(2300);
  await setHidden(a.page, false);

  await hostNext(game.page);
  await hostNext(game.page);
  await tile(a, 'B').click();
  await tile(b, 'B').click();
  await expect(a.page.getByText('Correct!')).toBeVisible();
  await hostNext(game.page); // leaderboard
  await setHidden(b.page, true);
  await b.page.waitForTimeout(2300);
  await setHidden(b.page, false);
  await a.page.waitForTimeout(500);
  await expect(a.page.getByText('was flagged')).toHaveCount(0);
  await Promise.all([game.context, a.context, b.context].map((c) => c.close()));
});

test('a network blip during a question and a page refresh keep the same seat and score', async ({ browser }) => {
  const game = await startGame(browser);
  const asha = await (async () => {
    const p = await joinPlayer(browser, game.pin, 'Asha');
    return p;
  })();
  const bilal = await joinPlayer(browser, game.pin, 'Bilal');

  // Capture Asha's socket so the test can drop it like a flaky connection.
  let drop: (() => void) | undefined;
  await asha.page.routeWebSocket(/\/ws\//, (ws) => {
    ws.connectToServer();
    drop = () => void ws.close();
  });
  await asha.page.reload();
  await expect(asha.page.getByText("You're in!")).toBeVisible();

  await openQuestion(game.page, [asha, bilal]);
  drop?.();
  await asha.page.waitForTimeout(1500); // under the 2 s "page left" threshold
  await expect(asha.page.getByRole('timer')).toBeVisible();
  await tile(asha, 'B').click();
  await tile(bilal, 'B').click();
  await expect(bilal.page.getByText('was flagged')).toHaveCount(0);
  await expect(asha.page.getByText('Correct!')).toBeVisible();

  const scoreLine = asha.page.getByText(/pts · rank/);
  const before = await scoreLine.innerText();
  await asha.page.reload(); // refresh: rejoin with the saved token
  await expect(asha.page.getByText('Correct!')).toBeVisible();
  await expect(scoreLine).toHaveText(before);

  await hostNext(game.page);
  await expect(asha.page.getByText('Your rank')).toBeVisible();
  await Promise.all([game.context, asha.context, bilal.context].map((c) => c.close()));
});
