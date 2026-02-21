/**
 * Unit tests for MCP server handlers
 * Tests the actual handler functions from plugins/argus/mcp/src/handlers/tools.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the modules before importing
vi.mock('@plugin/mcp/src/storage/index.js', () => ({
  getStorage: vi.fn(() => ({
    getAllHooks: vi.fn(async () => []),
    getTransactionsBySession: vi.fn(async () => []),
    getTransactionsByDateRange: vi.fn(async () => []),
  })),
}))

vi.mock('@plugin/mcp/src/rag/index.js', () => ({
  getRAGEngine: vi.fn(() => ({
    search: vi.fn(async () => ({
      hooks: [],
      relevantTransactions: [],
      confidence: 0.7,
    })),
    indexTransaction: vi.fn(async () => ({})),
    getStats: vi.fn(async () => ({ totalTransactions: 0, totalHooks: 0 })),
  })),
}))

vi.mock('@plugin/mcp/src/indexer/index.js', () => ({
  createFileIndexer: vi.fn(() => ({
    indexCodebase: vi.fn(async () => []),
    incrementalIndex: vi.fn(async () => ({ indexed: 0, skipped: 0, failed: 0 })),
    searchCode: vi.fn(async () => []),
    getStats: vi.fn(async () => ({ totalFiles: 0, totalChunks: 0, lastIndexRun: 0 })),
  })),
}))

import * as handlers from '@plugin/mcp/src/handlers/tools.js'

describe('MCP Server Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('handleCheckHooks', () => {
    it('should check hooks for a prompt', async () => {
      const result = await handlers.handleCheckHooks({
        prompt: 'How to implement authentication?',
        toolName: 'Explore',
        context: { cwd: '/project', platform: 'linux' },
      })

      expect(result).toHaveProperty('hooks')
      expect(result).toHaveProperty('relevantTransactions')
      expect(result).toHaveProperty('confidence')
    })

    it('should include hooks in response', async () => {
      const result = await handlers.handleCheckHooks({
        prompt: 'test query',
      })

      expect(Array.isArray(result.hooks)).toBe(true)
    })

    it('should include relevant transactions', async () => {
      const result = await handlers.handleCheckHooks({
        prompt: 'test query',
      })

      expect(Array.isArray(result.relevantTransactions)).toBe(true)
    })

    it('should provide confidence score', async () => {
      const result = await handlers.handleCheckHooks({
        prompt: 'test query',
      })

      expect(typeof result.confidence).toBe('number')
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })

    it('should complete within 100ms', async () => {
      const start = performance.now()
      await handlers.handleCheckHooks({ prompt: 'test query' })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(100)
    })
  })

  describe('handleSaveTransaction', () => {
    it('should save a transaction', async () => {
      const result = await handlers.handleSaveTransaction({
        prompt: 'How to implement feature?',
        promptType: 'user',
        context: {
          cwd: '/project',
          platform: 'linux',
        },
        result: {
          success: true,
          output: 'Feature implemented',
          duration: 1000,
        },
      })

      expect(result.success).toBe(true)
      expect(result).toHaveProperty('transactionId')
      expect(result).toHaveProperty('timestamp')
    })

    it('should auto-generate transaction ID', async () => {
      const result = await handlers.handleSaveTransaction({
        prompt: 'test',
        promptType: 'user',
        context: { cwd: '/test', platform: 'linux' },
        result: { success: true },
      })

      expect(result.transactionId).toBeDefined()
      expect(typeof result.transactionId).toBe('string')
    })

    it('should handle tool prompts', async () => {
      const result = await handlers.handleSaveTransaction({
        prompt: 'Executing command',
        promptType: 'tool',
        context: { cwd: '/project', platform: 'linux' },
        result: { success: true, toolsUsed: ['Bash'] },
      })

      expect(result.success).toBe(true)
    })
  })

  describe('handleSearchMemory', () => {
    it('should search memory with query', async () => {
      const result = await handlers.handleSearchMemory({
        query: 'authentication',
        limit: 10,
      })

      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('confidence')
    })

    it('should apply filters', async () => {
      const result = await handlers.handleSearchMemory({
        query: 'test',
        filters: {
          sessionId: '/project',
          tags: ['auth'],
        },
      })

      expect(Array.isArray(result.results)).toBe(true)
    })

    it('should apply date range filter', async () => {
      const result = await handlers.handleSearchMemory({
        query: 'test',
        filters: {
          dateRange: {
            start: Date.now() - 86400000,
            end: Date.now(),
          },
        },
      })

      expect(Array.isArray(result.results)).toBe(true)
    })
  })

  describe('handleGetHistory', () => {
    it('should get history with default options', async () => {
      const result = await handlers.handleGetHistory({})

      expect(result).toHaveProperty('transactions')
      expect(result).toHaveProperty('total')
    })

    it('should filter by session ID', async () => {
      const result = await handlers.handleGetHistory({
        sessionId: '/project',
        limit: 20,
      })

      expect(Array.isArray(result.transactions)).toBe(true)
    })

    it('should apply limit', async () => {
      const result = await handlers.handleGetHistory({
        limit: 10,
      })

      expect(Array.isArray(result.transactions)).toBe(true)
    })

    it('should apply offset', async () => {
      const result = await handlers.handleGetHistory({
        offset: 10,
        limit: 20,
      })

      expect(Array.isArray(result.transactions)).toBe(true)
    })
  })

  describe('handleIndexCodebase', () => {
    it('should index codebase', async () => {
      const result = await handlers.handleIndexCodebase({
        rootPath: '/project',
      })

      expect(result).toHaveProperty('success')
      if (result.success) {
        expect(result).toHaveProperty('result')
        expect(result).toHaveProperty('stats')
      }
    })

    it('should support incremental indexing', async () => {
      const result = await handlers.handleIndexCodebase({
        rootPath: '/project',
        incremental: true,
      })

      expect(result).toHaveProperty('success')
    })

    it('should handle errors gracefully', async () => {
      const result = await handlers.handleIndexCodebase({
        rootPath: '/nonexistent/path',
      })

      // Should not throw
      expect(result).toBeDefined()
    })
  })

  describe('handleSearchCode', () => {
    it('should search indexed code', async () => {
      const result = await handlers.handleSearchCode({
        query: 'authentication function',
        rootPath: '/project',
        limit: 10,
      })

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('total')
    })
  })

  describe('handleGetStats', () => {
    it('should get RAG engine statistics', async () => {
      const result = await handlers.handleGetStats()

      expect(result).toHaveProperty('success')
      if (result.success) {
        expect(result).toHaveProperty('stats')
      }
    })
  })

  describe('Performance Requirements', () => {
    it('handleCheckHooks < 100ms', async () => {
      const start = performance.now()
      await handlers.handleCheckHooks({ prompt: 'test query' })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(100)
    })

    it('handleSaveTransaction < 50ms', async () => {
      const start = performance.now()
      await handlers.handleSaveTransaction({
        prompt: 'test',
        promptType: 'user',
        context: { cwd: '/test', platform: 'linux' },
        result: { success: true },
      })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(50)
    })

    it('handleSearchMemory < 100ms', async () => {
      const start = performance.now()
      await handlers.handleSearchMemory({ query: 'test' })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(100)
    })
  })

  describe('Cross-Platform Compatibility', () => {
    const platforms = ['win32', 'darwin', 'linux']

    platforms.forEach(platform => {
      it(`should work on ${platform}`, async () => {
        const cwd = platform === 'win32' ? 'C:\\project' : '/project'

        const result = await handlers.handleSaveTransaction({
          prompt: 'test',
          promptType: 'user',
          context: { cwd, platform },
          result: { success: true },
        })

        expect(result.success).toBe(true)
      })
    })
  })
})
