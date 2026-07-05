import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
let commit = ''
try { commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* not a git checkout */ }

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

// Served from https://tchatou.fr/app/ (must be an allowed websocket origin).
// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [react(), emitVersion],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT__: JSON.stringify(commit),
  },
})
