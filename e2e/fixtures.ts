// Shared E2E helpers. The client fetches /app/config.json at boot; we intercept
// that request and serve the test config (pointing at the local Ergo) so no build
// artefact has to be rewritten.
import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
export const configBody = readFileSync(path.join(dirname, 'config.e2e.json'), 'utf8');

export async function routeConfig(page: Page): Promise<void> {
  await page.route('**/config.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: configBody }));
}

// Open the app, sign in with a guest nick, and wait until we've joined the
// startup channel (the composer only renders once a channel buffer is active).
export async function connect(page: Page, nick: string): Promise<void> {
  await routeConfig(page);
  await page.goto('/app/');
  const input = page.locator('input[name="nick"]');
  await input.fill(nick);
  await input.press('Enter');
  await expect(page.locator('.composer__rich')).toBeVisible({ timeout: 15000 });
}

export const test = base;
export { expect };
