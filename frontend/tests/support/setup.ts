// Runs before every test file (see test.setupFiles in vite.config.ts).
import '@testing-library/jest-dom/vitest' // adds DOM checks like expect(element).toBeInTheDocument()
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup() // removes whatever the test rendered, so tests don't see each other's components
  vi.unstubAllGlobals() // undoes mockFetch() and any other replaced globals
  vi.useRealTimers() // in case a test switched to fake timers
})
