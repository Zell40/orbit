import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
let commit = ''
try { commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* not a git checkout */ }

// The sandbox guest (src/modules/sandbox/guest) runs INSIDE an opaque-origin iframe,
// so it can't load app chunks — it must be a standalone script served with its own
// strict CSP. We keep it as typed core source and transpile it here into a shell HTML
// (plugin-sandbox.html): served on the fly in dev, emitted into the build otherwise.
// Kept unminified so the served security-boundary code stays auditable.
const GUEST_ENTRY = 'src/modules/sandbox/guest/index.ts'
const GUEST_SHELL = `<!doctype html>
<meta charset="utf-8">
<title>Orbit sandboxed plugin</title>
<style>
  /* Transparent iframe so a plugin sits on the app background; color-scheme goes on
     <body>, not the root (root scheme paints an opaque UA canvas = grey box).
     Hide scrollbars (not overflow:hidden — that paints an opaque backdrop and kills
     the transparency) so a mid-resize frame never flashes a scrollbar. */
  html { background: transparent; color-scheme: normal; scrollbar-width: none; }
  body { margin: 0; padding: 0; background: transparent; color: var(--ink, inherit); display: inline-block; font: 13px/1.4 system-ui, sans-serif; }
  *, *::before, *::after { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 0; height: 0; }
</style>
<body>
%GUEST%`
function buildGuestHtml(): string {
  const src = readFileSync(GUEST_ENTRY, 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.ESNext } })
    .outputText.replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, '') // strip the module marker (breaks a classic <script>)
  return GUEST_SHELL.replace('%GUEST%', () => `<script>\n${js}</script>\n`)
}
const sandboxGuest: Plugin = {
  name: 'sandbox-guest',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if ((req.url || '').split('?')[0].endsWith('/plugin-sandbox.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(buildGuestHtml()); return
      }
      next()
    })
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'plugin-sandbox.html', source: buildGuestHtml() })
  },
}

// Stamp the built app with its commit so the running client can poll for a newer
// deploy (src/ui/appUpdate.ts) and refresh itself in place, no manual reload.
const emitVersion: Plugin = {
  name: 'emit-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ commit, builtAt: new Date().toISOString() }),
    })
  },
}

// Tie the service-worker cache name to the build commit. sw.js ships a
// `__SW_BUILD__` placeholder; without this every deploy would keep the SAME
// cache name, so a returning browser never reinstalls the SW and can serve a
// stale app shell. Stamping the commit makes each deploy a new SW that drops the
// old cache on activate. Runs in writeBundle so it patches the copied public file.
const stampServiceWorker: Plugin = {
  name: 'stamp-service-worker',
  apply: 'build',
  writeBundle(options) {
    const out = join(options.dir || 'dist', 'sw.js')
    try {
      const src = readFileSync(out, 'utf8')
      writeFileSync(out, src.replace('__SW_BUILD__', commit || String(Date.now())))
    } catch { /* no sw.js in this build */ }
  },
}

// Served from https://tchatou.fr/app/ (must be an allowed websocket origin).
// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [react(), emitVersion, sandboxGuest, stampServiceWorker],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT__: JSON.stringify(commit),
  },
})
