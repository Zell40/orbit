// Stops the Ergo server started in global-setup and removes its temp datastore.
import { readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(dirname, '.ergo-state.json');

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(STATE)) return;
  try {
    const { pid, work } = JSON.parse(readFileSync(STATE, 'utf8')) as { pid?: number; work?: string };
    if (pid) { try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ } }
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ } }
  } finally {
    rmSync(STATE, { force: true });
  }
}
