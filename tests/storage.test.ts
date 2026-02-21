/**
 * Unit tests for Storage class
 * Tests file-based transaction and hook storage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Storage } from '@plugin/mcp/src/storage.js'
import type { Transaction, Hook } from '@plugin/mcp/src/types/index.js'

// Mock file system operations
const mockFiles = new Map<string, string>()

const readFileMock = vi.fn()
const writeFileMock = vi.fn()
const mkdirMock = vi.fn()
const existsSyncMock = vi.fn()

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: readFileMock,
    writeFile: writeFileMock,
    mkdir: mkdirMock,
    stat: vi.fn(),
    readdir: vi.fn(),
  },
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
}))

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}))

// Setup mock implementations
beforeEach(() => {
  mockFiles.clear()

  readFileMock.mockImplementation((path: string) => {
    const content = mockFiles.get(path)
    if (content) {
      return Promise.resolve(content)
    }
    const error = new Error('File not found') as NodeJS.ErrnoException
    error.code = 'ENOENT'
    return Promise.reject(error)
  })

  writeFileMock.mockImplementation((path: string, data: string) => {
    mockFiles.set(path, data)
    return Promise.resolve()
  })

  mkdirMock.mockResolvedValue(undefined)
  existsSyncMock.mockImplementation((path: string) => mockFiles.has(path))
})

describe('Storage', () => {
  let storage: Storage
  const mockTransaction: Transaction = {
    id: 'test-transaction-1',
    timestamp: Date.now(),
    sessionId: 'session-123',
    prompt: {
      raw: 'How do I implement a feature?',
      type: 'user',
    },
    context: {
      cwd: '/mock/project',
      environment: { NODE_ENV: 'test' },
      platform: 'linux',
      toolsAvailable: ['Read', 'Write'],
      files: [
        { path: '/mock/project/src/index.ts', hash: 'abc123' },
      ],
    },
    result: {
      success: true,
      output: 'Feature implemented successfully',
      duration: 1500,
      toolsUsed: ['Read', 'Write'],
    },
    metadata: {
      tags: ['feature', 'implementation'],
      category: 'development',
    },
  }

  const mockHook: Hook = {
    id: 'test-hook-1',
    name: 'Test Hook',
    description: 'A test hook for validation',
    version: '1.0.0',
    triggers: ['PreToolUse', 'PostToolUse'],
    ragQuery: 'test query for relevant transactions',
    documentation: {
      summary: 'Test hook summary',
      examples: ['Example 1', 'Example 2'],
      bestPractices: ['Best practice 1'],
    },
    validation: {
      requiredContext: ['cwd', 'platform'],
      prohibitedPatterns: ['rm -rf'],
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
  }

  beforeEach(() => {
    mockFiles.clear()
    storage = new Storage()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should create .argus directory if it does not exist', async () => {
      await storage.init()
      expect(fsSync.existsSync('/mock/home/.argus')).toBeDefined()
    })

    it('should load existing transactions from file', async () => {
      const existingTransactions = [mockTransaction]
      mockFiles.set('/mock/home/.argus/transactions.json', JSON.stringify(existingTransactions))

      await storage.init()
      const retrieved = await storage.getTransaction('test-transaction-1')

      expect(retrieved).toEqual(mockTransaction)
    })

    it('should load existing hooks from file', async () => {
      const existingHooks = [mockHook]
      mockFiles.set('/mock/home/.argus/hooks.json', JSON.stringify(existingHooks))

      await storage.init()
      const retrieved = await storage.getHook('test-hook-1')

      expect(retrieved).toEqual(mockHook)
    })

    it('should only initialize once', async () => {
      const mkdirSpy = vi.spyOn(fs, 'mkdir')

      await storage.init()
      await storage.init()

      expect(mkdirSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('Transaction Management', () => {
    it('should save a transaction', async () => {
      await storage.saveTransaction(mockTransaction)

      const retrieved = await storage.getTransaction('test-transaction-1')
      expect(retrieved).toEqual(mockTransaction)
    })

    it('should persist transactions to file', async () => {
      await storage.saveTransaction(mockTransaction)

      const savedData = mockFiles.get('/mock/home/.argus/transactions.json')
      expect(savedData).toBeDefined()

      const parsed = JSON.parse(savedData!)
      expect(parsed).toHaveLength(1)
      expect(parsed[0]).toEqual(mockTransaction)
    })

    it('should retrieve all transactions', async () => {
      const transaction2: Transaction = {
        ...mockTransaction,
        id: 'test-transaction-2',
        prompt: { ...mockTransaction.prompt, raw: 'Another transaction' },
      }

      await storage.saveTransaction(mockTransaction)
      await storage.saveTransaction(transaction2)

      const all = await storage.getAllTransactions()
      expect(all).toHaveLength(2)
      expect(all).toContainEqual(mockTransaction)
      expect(all).toContainEqual(transaction2)
    })

    it('should return undefined for non-existent transaction', async () => {
      const retrieved = await storage.getTransaction('non-existent')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('Hook Management', () => {
    it('should save a hook', async () => {
      await storage.saveHook(mockHook)

      const retrieved = await storage.getHook('test-hook-1')
      expect(retrieved).toEqual(mockHook)
    })

    it('should persist hooks to file', async () => {
      await storage.saveHook(mockHook)

      const savedData = mockFiles.get('/mock/home/.argus/hooks.json')
      expect(savedData).toBeDefined()

      const parsed = JSON.parse(savedData!)
      expect(parsed).toHaveLength(1)
      expect(parsed[0]).toEqual(mockHook)
    })

    it('should retrieve all hooks', async () => {
      const hook2: Hook = {
        ...mockHook,
        id: 'test-hook-2',
        name: 'Another Hook',
      }

      await storage.saveHook(mockHook)
      await storage.saveHook(hook2)

      const all = await storage.getAllHooks()
      expect(all).toHaveLength(2)
    })

    it('should return undefined for non-existent hook', async () => {
      const retrieved = await storage.getHook('non-existent')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('Search Functionality', () => {
    beforeEach(async () => {
      // Setup test data
      const t1: Transaction = {
        ...mockTransaction,
        id: 't1',
        prompt: { raw: 'How to implement authentication in React', type: 'user' },
        result: { ...mockTransaction.result, output: 'Use NextAuth.js for authentication' },
      }
      const t2: Transaction = {
        ...mockTransaction,
        id: 't2',
        timestamp: Date.now() - 1000,
        prompt: { raw: 'Database connection error', type: 'user' },
        result: { ...mockTransaction.result, output: 'Check your database URL' },
      }
      const t3: Transaction = {
        ...mockTransaction,
        id: 't3',
        timestamp: Date.now() - 2000,
        prompt: { raw: 'How to implement API routes', type: 'user' },
        metadata: { ...mockTransaction.metadata, tags: ['api', 'routes'] },
      }

      await storage.saveTransaction(t1)
      await storage.saveTransaction(t2)
      await storage.saveTransaction(t3)
    })

    it('should search transactions by query', async () => {
      const results = await storage.searchTransactions('authentication')

      expect(results).toHaveLength(1)
      expect(results[0].prompt.raw).toContain('authentication')
    })

    it('should search in output text', async () => {
      const results = await storage.searchTransactions('NextAuth')

      expect(results).toHaveLength(1)
      expect(results[0].result.output).toContain('NextAuth')
    })

    it('should search by tags', async () => {
      const results = await storage.searchTransactions('api')

      expect(results.length).toBeGreaterThan(0)
      expect(results.some(r => r.metadata.tags.includes('api'))).toBe(true)
    })

    it('should return results sorted by timestamp (newest first)', async () => {
      const results = await storage.searchTransactions('implement')

      expect(results).toHaveLength(2)
      expect(results[0].id).toBe('t1') // Newest
      expect(results[1].id).toBe('t3') // Older
    })

    it('should respect limit parameter', async () => {
      const results = await storage.searchTransactions('implement', 1)

      expect(results).toHaveLength(1)
    })

    it('should return empty array for no matches', async () => {
      const results = await storage.searchTransactions('nonexistent query xyz')

      expect(results).toHaveLength(0)
    })
  })

  describe('History Queries', () => {
    beforeEach(async () => {
      const t1: Transaction = { ...mockTransaction, id: 't1', sessionId: 'session-1' }
      const t2: Transaction = { ...mockTransaction, id: 't2', sessionId: 'session-2' }
      const t3: Transaction = { ...mockTransaction, id: 't3', sessionId: 'session-1' }

      await storage.saveTransaction(t1)
      await storage.saveTransaction(t2)
      await storage.saveTransaction(t3)
    })

    it('should get all history', async () => {
      const history = await storage.getHistory({})

      expect(history).toHaveLength(3)
    })

    it('should filter by session ID', async () => {
      const history = await storage.getHistory({ sessionId: 'session-1' })

      expect(history).toHaveLength(2)
      expect(history.every(t => t.sessionId === 'session-1')).toBe(true)
    })

    it('should apply limit', async () => {
      const history = await storage.getHistory({ limit: 2 })

      expect(history).toHaveLength(2)
    })

    it('should apply offset', async () => {
      const history = await storage.getHistory({ offset: 1, limit: 2 })

      expect(history).toHaveLength(2)
    })

    it('should default to limit 50', async () => {
      // Add more than 50 transactions
      for (let i = 0; i < 60; i++) {
        await storage.saveTransaction({
          ...mockTransaction,
          id: `bulk-${i}`,
          timestamp: Date.now() - i * 1000,
        })
      }

      const history = await storage.getHistory({})
      expect(history.length).toBeLessThanOrEqual(50)
    })
  })

  describe('Indexing', () => {
    it('should index transaction keywords', async () => {
      await storage.saveTransaction(mockTransaction)

      // Index should be persisted
      const indexData = mockFiles.get('/mock/home/.argus/index.json')
      expect(indexData).toBeDefined()

      const index = JSON.parse(indexData!)
      expect(Object.keys(index).length).toBeGreaterThan(0)
    })

    it('should extract keywords longer than 3 characters', async () => {
      const t: Transaction = {
        ...mockTransaction,
        id: 't1',
        prompt: { raw: 'the and for how to implement with', type: 'user' },
      }

      await storage.saveTransaction(t)

      const indexData = mockFiles.get('/mock/home/.argus/index.json')!
      const index = JSON.parse(indexData)

      // Should have 'implement', 'with' but not 'the', 'and', 'for'
      expect(index['implement']).toBeDefined()
      expect(index['the']).toBeUndefined()
    })
  })

  describe('Performance', () => {
    it('should save transaction in less than 50ms', async () => {
      const start = performance.now()

      await storage.saveTransaction(mockTransaction)

      const duration = performance.now() - start
      expect(duration).toBeLessThan(50)
    })

    it('should search within 100ms for 1000 transactions', async () => {
      // Add 1000 transactions
      for (let i = 0; i < 1000; i++) {
        await storage.saveTransaction({
          ...mockTransaction,
          id: `perf-${i}`,
          prompt: {
            raw: `Transaction ${i} with content about testing performance`,
            type: 'user',
          },
          timestamp: Date.now() - i * 1000,
        })
      }

      const start = performance.now()
      const results = await storage.searchTransactions('performance')
      const duration = performance.now() - start

      expect(duration).toBeLessThan(100)
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty prompt raw text', async () => {
      const t: Transaction = {
        ...mockTransaction,
        id: 'empty',
        prompt: { raw: '', type: 'user' },
      }

      await expect(storage.saveTransaction(t)).resolves.not.toThrow()
    })

    it('should handle special characters in query', async () => {
      await storage.saveTransaction(mockTransaction)

      const results = await storage.searchTransactions('How do I?')
      expect(results).toBeDefined()
    })

    it('should handle very long query', async () => {
      const longQuery = 'a'.repeat(1000)

      const results = await storage.searchTransactions(longQuery)
      expect(results).toEqual([])
    })
  })
})
