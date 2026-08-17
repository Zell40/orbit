import { test, expect, connect, routeConfig } from './fixtures';

const nick = () => 'e2e' + Math.random().toString(36).slice(2, 7);

test.describe('Orbit against a live IRCv3 server (Ergo)', () => {
  test('site handoff auto-connects without the join form', async ({ page }) => {
    const n = nick();
    await routeConfig(page);
    // Mirror the site entry form: drop the one-shot marker before navigating to
    // /app/?nick=…&channel=… . With it present, the client must connect straight
    // away, never showing the join form.
    await page.addInitScript(() => {
      sessionStorage.setItem('orbit_handoff', JSON.stringify({ password: '', t: Date.now() }));
    });
    await page.goto(`/app/?nick=${n}&channel=%23e2e`);

    // Lands in the channel (composer renders) with no nick prompt in between.
    await expect(page.locator('.composer__rich')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('input[name="nick"]')).toHaveCount(0);
  });

  test('connects, joins the startup channel, and echoes its own message', async ({ page }) => {
    const n = nick();
    await connect(page, n);

    const msg = 'hello-' + n;
    await page.locator('.composer__rich').click();
    await page.keyboard.type(msg);
    await page.keyboard.press('Enter');

    // With echo-message, our own line is drawn when the server confirms it.
    await expect(page.getByText(msg, { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test('delivers a message from one client to another through the server', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    await connect(a, nick());
    await connect(b, nick());

    const msg = 'cross-' + nick();
    await a.locator('.composer__rich').click();
    await a.keyboard.type(msg);
    await a.keyboard.press('Enter');

    // B (a different browser session) must receive A's message via the IRC server.
    await expect(b.getByText(msg, { exact: false })).toBeVisible({ timeout: 10000 });

    await ctxA.close();
    await ctxB.close();
  });
});
