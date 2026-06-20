import { defineConfig, configDefaults, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Separate from vite.config.ts so the production `tsc -b` build never pulls in
// Vitest's type surface (which clashes with Vite's http types under tsc). Unit
// tests live under src/; the Playwright e2e specs use a different runner and are
// excluded here.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, 'e2e/**'],
    },
  }),
)
