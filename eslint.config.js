import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // IRC formatting/CTCP legitimately uses control characters in regexes.
      'no-control-regex': 'off',
      // react-hooks v7's new "react-compiler" rules are valuable but aggressive;
      // keep them visible as warnings rather than hard CI failures.
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      // Dev-only fast-refresh hint (a couple of helper exports sit beside components).
      'react-refresh/only-export-components': 'warn',
    },
  },
])
