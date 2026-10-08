import { expect, test } from '@playwright/test';
import { demoQuiz, joinPlayer, openQuestion, setHidden, startGame, tile, type Player } from './helpers';

async function room(browser: Parameters<typeof startGame>[0], settings: Record<string, unknown> = {}) {
  const game = await startGame(browser, demoQuiz(), settings);
  const players: Player[] = [];
  for (const name of ['Asha', 'Bilal', 'Chitra', 'Dev']) players.push(await joinPlayer(browser, game.pin, name));
  await openQuestion(game.page, players);
  return {
    ...game,
    players,
    close: () => Promise.all([game.context, ...players.map((p) => p.context)].map((c) => c.close())),
  };
}

test('a wrong answer is roasted on the phone and a spotlight line lands on the projector', async ({ browser }) => {
  const { page: host, players, close } = await room(browser);
  const [asha, bilal, chitra, dev] = players as [Player, Player, Player, Player];
  await tile(asha, 'B').click();
  await tile(bilal, 'A').click(); // wrong
  await tile(chitra, 'C').click(); // wrong
  await tile(dev, 'D').click(); // wrong; last answer closes the question

  await expect(bilal.page.getByTestId('phone-callout')).toBeVisible();
  await expect(bilal.page.getByTestId('phone-callout')).not.toBeEmpty();
  await expect(asha.page.getByText('Correct!')).toBeVisible();
  // The projector shows the room spotlight a beat after the reveal.
  await expect(host.getByTestId('stage-callout')).toBeVisible();
  await expect(host.getByTestId('stage-callout')).not.toBeEmpty();
  // Effects (fire, emoji rain, tumbleweed) play once and are removed: nothing piles up on the screen.
  await expect(host.locator('.fx-layer')).toHaveCount(0, { timeout: 12_000 });
  await close();
});

test('a flagged player gets a quip on the projector and on the other phones', async ({ browser }) => {
  const { page: host, players, close } = await room(browser);
  const [asha, bilal] = players as [Player, Player];
  await setHidden(asha.page, true);
  await asha.page.waitForTimeout(2300);
  await setHidden(asha.page, false);
  await expect(host.getByTestId('flag-quip').first()).toBeVisible();
  await expect(bilal.page.getByText('👀 Asha was flagged')).toBeVisible();
  await expect(bilal.page.getByTestId('flag-quip')).toBeVisible();
  await close();
});

test('funny call-outs can be switched off for a serious game', async ({ browser }) => {
  const { page: host, players, close } = await room(browser, { funCallouts: false });
  const [asha, bilal, chitra, dev] = players as [Player, Player, Player, Player];
  await tile(asha, 'A').click();
  await tile(bilal, 'A').click();
  await tile(chitra, 'C').click();
  await tile(dev, 'D').click();
  await expect(asha.page.getByText('Not quite')).toBeVisible();
  await host.waitForTimeout(2500);
  await expect(host.getByTestId('stage-callout')).toHaveCount(0);
  await expect(asha.page.getByTestId('phone-callout')).toHaveCount(0);
  await close();
});
