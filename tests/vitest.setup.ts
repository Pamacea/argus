import { vi } from 'vitest'

// Mock file system operations
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn(),
  },
}))

// Global test utilities
declare global {
  const vi: typeof import('vitest').vi
}

export {}
