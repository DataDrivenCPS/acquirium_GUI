/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { // holds settings for the development server
    proxy: { // lists the request paths Vite should forward instead of handling itself
      '/api': { // any request starting with /api
        target: 'http://127.0.0.1:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: { // settings for Vitest, the unit test runner (npm test)
    include: ['tests/**/*.test.{ts,tsx}'], // tests live in tests/, mirroring src/
    environment: 'jsdom', // tests run in a simulated browser page, so components can render
    setupFiles: './tests/support/setup.ts', // runs before every test file
  },
})
