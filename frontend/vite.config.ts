import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Ports:
//   5001 - this dev server, the one URL you open.
//   5002 - the FastAPI backend, reached only through the /api proxy below,
//          so the browser never sees a second origin and CORS stays a
//          development-only concern.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5001,
    // Fail loudly rather than silently drifting to 5002 and colliding with
    // the backend when 5001 is taken.
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5002',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Not dist/. GitHub's Python .gitignore (which this repo uses unmodified)
    // ignores dist/, and these assets have to ship inside the wheel -- so the
    // build lands where FastAPI's StaticFiles mount expects it instead.
    outDir: '../backend/acquirium_gui/static',
    emptyOutDir: true,
  },
  test: {
    // Pure logic only for now (the query reducer, the confidence rule).
    // Component-level tests would need jsdom; UI flows have a manual
    // checklist in docs/manual-checks.md until that is set up.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
