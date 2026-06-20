// Boots an Ergo IRCv3 server for the E2E run: it generates a config from Ergo's
// bundled default.yaml (a loopback WebSocket listener, no TLS, throwaway
// datastore), inits the db, starts the server, and waits for the port. The pid
// and temp dir are recorded for global-teardown.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8097;
const STATE = path.join(dirname, '.ergo-state.json');

function findErgoDir(): string {
  const bin = path.join(dirname, '.bin');
  const d = existsSync(bin)
    ? readdirSync(bin).map((x) => path.join(bin, x)).find((x) => existsSync(path.join(x, 'ergo')))
    : undefined;
  if (!d) throw new Error('ergo binary not found — run: bash e2e/install-ergo.sh');
  return d;
}

function waitForPort(port: number, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`ergo never opened :${port}`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

export default async function globalSetup(): Promise<void> {
  const dir = findErgoDir();
  const work = mkdtempSync(path.join(tmpdir(), 'orbit-e2e-'));

  const cfg = yamlLoad(readFileSync(path.join(dir, 'default.yaml'), 'utf8')) as Record<string, any>;
  cfg.server.listeners = { [`127.0.0.1:${PORT}`]: { websocket: true } };
  cfg.server.websockets = { 'allowed-origins': [] }; // empty = no origin restriction (tests)
  cfg.server.motd = '';
  cfg.datastore.path = path.join(work, 'ircd.db');
  cfg.languages = { ...(cfg.languages ?? {}), path: path.join(dir, 'languages') };
  const cfgPath = path.join(work, 'ergo.yaml');
  writeFileSync(cfgPath, yamlDump(cfg));

  const bin = path.join(dir, 'ergo');
  spawnSync(bin, ['initdb', '--conf', cfgPath], { stdio: 'ignore', cwd: work });
  const child = spawn(bin, ['run', '--conf', cfgPath], { stdio: 'ignore', detached: true, cwd: work });
  child.unref();
  writeFileSync(STATE, JSON.stringify({ pid: child.pid, work }));

  await waitForPort(PORT);
  await new Promise((r) => setTimeout(r, 500)); // let the ircd finish coming up
}
