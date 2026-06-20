import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the plugin to ONE droppable IIFE file. React, react-dom and the JSX
// runtime are EXTERNAL — at runtime they resolve to Orbit's single React instance
// (window.Orbit.*), never bundled. Bundling your own React would break hooks.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.tsx',
      formats: ['iife'],
      name: 'OrbitPluginTemplate',
      fileName: () => 'orbit-plugin-template.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'Orbit.React',
          'react-dom': 'Orbit.ReactDOM',
          'react/jsx-runtime': 'Orbit.jsxRuntime',
        },
      },
    },
    emptyOutDir: true,
  },
});
