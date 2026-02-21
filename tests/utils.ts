/**
 * Test utilities for ARGUS testing suite
 */

import { vi } from 'vitest'
import type { Transaction, Hook } from '../mcp/src/types/index.js'

/**
 * Creates a mock transaction with default values
 */
export function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    sessionId: 'test-session-123',
    prompt: {
      raw: 'How to implement authentication in Next.js?',
      type: 'user',
    },
    context: {
      cwd: '/mock/project',
      environment: {
        NODE_ENV: 'test',
        PATH: '/usr/bin:/bin',
      },
      platform: 'linux',
      toolsAvailable: ['Read', 'Write', 'Bash'],
      files: [
        { path: '/mock/project/src/index.ts', hash: 'abc123' },
        { path: '/mock/project/package.json', hash: 'def456' },
      ],
    },
    result: {
      success: true,
      output: 'Use NextAuth.js v5 for authentication',
      duration: 1500,
      toolsUsed: ['Read', 'Write'],
    },
    metadata: {
      tags: ['nextjs', 'auth', 'security'],
      category: 'backend',
    },
    ...overrides,
  }
}

/**
 * Creates a mock hook with default values
 */
export function createMockHook(overrides: Partial<Hook> = {}): Hook {
  return {
    id: `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Hook',
    description: 'A test hook for validation',
    version: '1.0.0',
    triggers: ['PreToolUse', 'PostToolUse'],
    ragQuery: 'test query for relevant transactions',
    documentation: {
      summary: 'Test hook summary',
      examples: ['Example 1', 'Example 2'],
      bestPractices: ['Best practice 1', 'Best practice 2'],
    },
    validation: {
      requiredContext: ['cwd', 'platform'],
      prohibitedPatterns: ['rm -rf /', 'DELETE FROM'],
    },
    author: {
      name: 'Test Author',
      url: 'https://example.com',
    },
    marketplace: {
      downloads: 100,
      rating: 4.5,
      updatedAt: Date.now(),
    },
    ...overrides,
  }
}

/**
 * Creates multiple mock transactions
 */
export function createMockTransactions(count: number, overrides?: Partial<Transaction>): Transaction[] {
  return Array.from({ length: count }, (_, i) =>
    createMockTransaction({
      ...overrides,
      id: `txn-${i}`,
      prompt: {
        raw: `Transaction ${i}: ${overrides?.prompt?.raw || 'test query'}`,
        type: 'user',
      },
    })
  )
}

/**
 * Creates multiple mock hooks
 */
export function createMockHooks(count: number, overrides?: Partial<Hook>): Hook[] {
  return Array.from({ length: count }, (_, i) =>
    createMockHook({
      ...overrides,
      id: `hook-${i}`,
      name: `Hook ${i}`,
    })
  )
}

/**
 * Mock performance measurement utility
 */
export class PerformanceMeasurement {
  private startTime: number
  private measurements: Map<string, number[]> = new Map()

  constructor() {
    this.startTime = performance.now()
  }

  /**
   * Records a measurement
   */
  record(name: string, duration: number): void {
    if (!this.measurements.has(name)) {
      this.measurements.set(name, [])
    }
    this.measurements.get(name)!.push(duration)
  }

  /**
   * Measures a function execution time
   */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    const result = await fn()
    const duration = performance.now() - start
    this.record(name, duration)
    return result
  }

  /**
   * Gets statistics for a measurement
   */
  getStats(name: string) {
    const measurements = this.measurements.get(name) || []
    if (measurements.length === 0) {
      return null
    }

    const sorted = [...measurements].sort((a, b) => a - b)
    const sum = measurements.reduce((a, b) => a + b, 0)

    return {
      count: measurements.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / measurements.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    }
  }

  /**
   * Gets all measurement statistics
   */
  getAllStats() {
    const stats: Record<string, ReturnType<typeof this.getStats>> = {}
    for (const name of this.measurements.keys()) {
      stats[name] = this.getStats(name)
    }
    return stats
  }

  /**
   * Resets all measurements
   */
  reset(): void {
    this.measurements.clear()
    this.startTime = performance.now()
  }

  /**
   * Gets total elapsed time
   */
  getElapsed(): number {
    return performance.now() - this.startTime
  }
}

/**
 * Mock file system for testing
 */
export class MockFileSystem {
  private files = new Map<string, string>()
  private directories = new Set<string>(['/mock/home/.argus'])

  /**
   * Mock readFile
   */
  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (!content) {
      const error = new Error('File not found') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    }
    return content
  }

  /**
   * Mock writeFile
   */
  async writeFile(path: string, data: string): Promise<void> {
    this.files.set(path, data)
  }

  /**
   * Mock mkdir
   */
  async mkdir(path: string, options?: { recursive: boolean }): Promise<void> {
    if (options?.recursive) {
      // Create parent directories
      const parts = path.split('/')
      for (let i = 1; i <= parts.length; i++) {
        this.directories.add(parts.slice(0, i).join('/'))
      }
    }
    this.directories.add(path)
  }

  /**
   * Mock existsSync
   */
  existsSync(path: string): boolean {
    return this.files.has(path) || this.directories.has(path)
  }

  /**
   * Clears all mock data
   */
  clear(): void {
    this.files.clear()
    this.directories.clear()
    this.directories.add('/mock/home/.argus')
  }

  /**
   * Gets all stored files
   */
  getFiles(): Map<string, string> {
    return new Map(this.files)
  }

  /**
   * Gets all directories
   */
  getDirectories(): Set<string> {
    return new Set(this.directories)
  }
}

/**
 * Mock RAG engine for testing
 */
export class MockRAGEngine {
  private hooks: Hook[] = []
  private transactions: Transaction[] = []

  addHooks(hooks: Hook[]): void {
    this.hooks.push(...hooks)
  }

  addTransactions(transactions: Transaction[]): void {
    this.transactions.push(...transactions)
  }

  async search(query: string): Promise<{
    hooks: Hook[]
    transactions: Transaction[]
    confidence: number
  }> {
    // Simple keyword matching
    const queryLower = query.toLowerCase()

    const matchingHooks = this.hooks.filter(h =>
      h.name.toLowerCase().includes(queryLower) ||
      h.description.toLowerCase().includes(queryLower) ||
      h.ragQuery?.toLowerCase().includes(queryLower)
    )

    const matchingTransactions = this.transactions.filter(t =>
      t.prompt.raw.toLowerCase().includes(queryLower) ||
      t.result.output?.toLowerCase().includes(queryLower) ||
      t.metadata.tags.some(tag => tag.toLowerCase().includes(queryLower))
    )

    // Calculate confidence based on match quality
    const confidence = matchingHooks.length > 0 || matchingTransactions.length > 0
      ? 0.7 + (Math.random() * 0.3) // 0.7-1.0
      : 0

    return {
      hooks: matchingHooks,
      transactions: matchingTransactions,
      confidence,
    }
  }

  clear(): void {
    this.hooks = []
    this.transactions = []
  }
}

/**
 * Async delay utility for testing
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry utility for flaky tests
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delay?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delay: retryDelay = 100 } = options

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error
      }
      await delay(retryDelay * attempt)
    }
  }

  throw new Error('Retry failed')
}

/**
 * Type guard for checking if a value is defined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

/**
 * Creates a spy that tracks performance
 */
export function createPerformanceSpy() {
  const calls: Array<{ name: string; duration: number; timestamp: number }> = []

  return {
    track: (name: string, fn: () => Promise<void>) => async () => {
      const start = performance.now()
      await fn()
      const duration = performance.now() - start
      calls.push({ name, duration, timestamp: Date.now() })
    },
    getCalls: () => calls,
    clear: () => calls.length = 0,
    getAverage: (name: string) => {
      const filtered = calls.filter(c => c.name === name)
      if (filtered.length === 0) return 0
      return filtered.reduce((sum, c) => sum + c.duration, 0) / filtered.length
    },
    getMax: (name: string) => {
      const filtered = calls.filter(c => c.name === name)
      return Math.max(...filtered.map(c => c.duration), 0)
    },
  }
}

/**
 * Platform-specific test helpers
 */
export const platformHelpers = {
  isWindows: process.platform === 'win32',
  isMacOS: process.platform === 'darwin',
  isLinux: process.platform === 'linux',

  normalizePath: (path: string) => {
    if (process.platform === 'win32') {
      return path.replace(/\//g, '\\')
    }
    return path.replace(/\\/g, '/')
  },

  getTempDir: () => {
    if (process.platform === 'win32') {
      return process.env.TEMP || 'C:\\Temp'
    }
    return '/tmp'
  },
}
