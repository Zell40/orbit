import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
let commit = ''
try { commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* not a git checkout */ }

// Served from https://tchatou.fr/app/ (must be an allowed websocket origin).
// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT__: JSON.stringify(commit),
  },
})
