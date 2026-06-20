import { test, expect, connect } from './fixtures';

const nick = () => 'e2e' + Math.random().toString(36).slice(2, 7);

test.describe('Orbit against a live IRCv3 server (Ergo)', () => {
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
