import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://tchatou.fr/app/ (must be an allowed websocket origin).
// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [react()],
})
