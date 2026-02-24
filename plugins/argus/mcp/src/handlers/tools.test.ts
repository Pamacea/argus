/**
 * Unit tests for MCP Tool Handlers (handlers/tools.ts)
 * Tests all 6 MCP tools with mocked dependencies
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleCheckHooks,
  handleSaveTransaction,
  handleSearchMemory,
  handleGetHistory,
  handleIndexCodebase,
  handleSearchCode,
  handleGetStats,
} from './tools.js';
import { Transaction } from '../types/index.js';

// Mock dependencies
vi.mock('../storage/database.js', () => ({
  getStorage: vi.fn(() => mockStorage),
}));

vi.mock('../rag/index.js', () => ({
  getRAGEngine: vi.fn(() => mockRAG),
}));

vi.mock('../indexer/index.js', () => ({
  createFileIndexer: vi.fn(() => mockIndexer),
}));

// Mock implementations
const mockStorage = {
  getAllHooks: vi.fn(),
  getAllTransactions: vi.fn(),
  getTransactionsBySession: vi.fn(),
  getTransactionsByDateRange: vi.fn(),
  storeTransaction: vi.fn(),
  getStats: vi.fn(),
};

const mockRAG = {
  search: vi.fn(),
  indexTransaction: vi.fn(),
  getStats: vi.fn(),
};

const mockIndexer = {
  indexCodebase: vi.fn(),
  incrementalIndex: vi.fn(),
  getStats: vi.fn(),
  searchCode: vi.fn(),
};

describe('MCP Tool Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCheckHooks', () => {
    it('should return relevant hooks and transactions', async () => {
      const mockHook = {
        id: 'hook1',
        name: 'Auth Hook',
        description: 'Authentication helper',
        triggers: ['PreToolUse'],
        ragQuery: 'auth',
        documentation: { summary: 'Helps with auth', examples: [] },
      };

      const mockTx = {
        id: 'tx1',
        timestamp: Date.now(),
        prompt: { raw: 'How to implement auth', type: 'user' },
        result: { output: 'Use JWT' },
      };

      mockRAG.search.mockResolvedValue({
        hooks: [mockHook],
        relevantTransactions: [mockTx],
        confidence: 0.8,
      });

      mockStorage.getAllHooks.mockResolvedValue([mockHook]);

      const result = await handleCheckHooks({
        prompt: 'authentication help',
        toolName: 'Explore',
        context: { cwd: '/test', platform: 'linux' },
      });

      expect(result.hooks).toBeDefined();
      expect(result.hooks.length).toBeGreaterThan(0);
      expect(result.relevantTransactions).toBeDefined();
      expect(result.confidence).toBe(0.8);
    });

    it('should filter by tool name when specified', async () => {
      const mockHook = {
        id: 'hook1',
        name: 'Explore Hook',
        description: 'For Explore tool',
        triggers: ['PreToolUse'],
        ragQuery: 'explore',
        documentation: { summary: 'Summary', examples: [] },
      };

      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [],
        confidence: 0.5,
      });

      mockStorage.getAllHooks.mockResolvedValue([mockHook]);

      const result = await handleCheckHooks({
        prompt: 'test',
        toolName: 'Explore',
        context: { cwd: '/test', platform: 'linux' },
      });

      expect(mockRAG.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test',
          limit: 5,
          threshold: 0.6,
        })
      );
    });

    it('should return empty results when no matches found', async () => {
      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [],
        confidence: 0.5,
      });

      mockStorage.getAllHooks.mockResolvedValue([]);

      const result = await handleCheckHooks({
        prompt: 'nonexistent query',
      });

      expect(result.hooks).toEqual([]);
      expect(result.relevantTransactions).toEqual([]);
    });

    it('should handle RAG query matching', async () => {
      const mockHook = {
        id: 'hook1',
        name: 'Auth Hook',
        description: 'Authentication',
        triggers: ['PreToolUse'],
        ragQuery: 'jwt tokens',
        documentation: { summary: 'Summary', examples: [] },
      };

      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [],
        confidence: 0.5,
      });

      mockStorage.getAllHooks.mockResolvedValue([mockHook]);

      const result = await handleCheckHooks({
        prompt: 'help with JWT tokens',
      });

      // Should match based on ragQuery
      expect(mockStorage.getAllHooks).toHaveBeenCalled();
    });
  });

  describe('handleSaveTransaction', () => {
    it('should save transaction successfully', async () => {
      mockRAG.indexTransaction.mockResolvedValue(true);

      const result = await handleSaveTransaction({
        prompt: 'Test prompt',
        promptType: 'user',
        context: {
          cwd: '/test',
          platform: 'linux',
          environment: { NODE_ENV: 'test' },
          toolsAvailable: ['Read', 'Write'],
          files: [],
        },
        result: {
          success: true,
          output: 'Success',
          duration: 100,
          toolsUsed: ['Read'],
        },
        metadata: {
          tags: ['test'],
          category: 'testing',
        },
      });

      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(mockRAG.indexTransaction).toHaveBeenCalled();
    });

    it('should handle transactions with error result', async () => {
      mockRAG.indexTransaction.mockResolvedValue(true);

      const result = await handleSaveTransaction({
        prompt: 'Failing prompt',
        promptType: 'user',
        context: {
          cwd: '/test',
          platform: 'linux',
        },
        result: {
          success: false,
          error: 'Something went wrong',
          duration: 50,
        },
      });

      expect(result.success).toBe(true); // Save itself should succeed
      expect(mockRAG.indexTransaction).toHaveBeenCalled();
    });

    it('should handle optional context fields', async () => {
      mockRAG.indexTransaction.mockResolvedValue(true);

      const result = await handleSaveTransaction({
        prompt: 'Test',
        promptType: 'system',
        context: {
          cwd: '/test',
          platform: 'win32',
        },
        result: {
          success: true,
          duration: 0,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should handle optional metadata', async () => {
      mockRAG.indexTransaction.mockResolvedValue(true);

      const result = await handleSaveTransaction({
        prompt: 'Test',
        promptType: 'tool',
        context: {
          cwd: '/test',
          platform: 'darwin',
        },
        result: {
          success: true,
          output: 'Output',
          duration: 100,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should use cwd as session ID', async () => {
      mockRAG.indexTransaction.mockResolvedValue(true);

      await handleSaveTransaction({
        prompt: 'Test',
        promptType: 'user',
        context: {
          cwd: '/my/project',
          platform: 'linux',
        },
        result: {
          success: true,
          duration: 0,
        },
      });

      const indexedTx = mockRAG.indexTransaction.mock.calls[0][0] as Transaction;
      expect(indexedTx.sessionId).toBe('/my/project');
    });
  });

  describe('handleSearchMemory', () => {
    it('should search memory and return results', async () => {
      const mockTx = {
        id: 'tx1',
        timestamp: Date.now(),
        sessionId: 'session1',
        prompt: { raw: 'How to authenticate', type: 'user' },
        result: { output: 'Use JWT tokens' },
        metadata: {
          tags: ['auth'],
          category: 'security',
        },
      };

      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [mockTx],
        confidence: 0.8,
      });

      const result = await handleSearchMemory({
        query: 'authentication',
        limit: 10,
        threshold: 0.5,
      });

      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.confidence).toBe(0.8);
    });

    it('should apply sessionId filter', async () => {
      const mockTx1 = {
        id: 'tx1',
        timestamp: Date.now(),
        sessionId: 'session1',
        prompt: { raw: 'Query', type: 'user' },
        result: { output: 'Result' },
        metadata: { tags: [], category: 'test' },
      };
      const mockTx2 = {
        id: 'tx2',
        timestamp: Date.now(),
        sessionId: 'session2',
        prompt: { raw: 'Query', type: 'user' },
        result: { output: 'Result' },
        metadata: { tags: [], category: 'test' },
      };

      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [mockTx1, mockTx2],
        confidence: 0.8,
      });

      const result = await handleSearchMemory({
        query: 'test',
        filters: {
          sessionId: 'session1',
        },
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].sessionId).toBe('session1');
    });

    it('should apply dateRange filter', async () => {
      const mockTx = {
        id: 'tx1',
        timestamp: 1000,
        sessionId: 'session1',
        prompt: { raw: 'Query', type: 'user' },
        result: { output: 'Result' },
        metadata: { tags: [], category: 'test' },
      };

      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [mockTx],
        confidence: 0.8,
      });

      const result = await handleSearchMemory({
        query: 'test',
        filters: {
          dateRange: {
            start: 500,
            end: 1500,
          },
        },
      });

      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should apply tags filter', async () => {
      const mockTx = {
        id: 'tx1',
        timestamp: Date.now(),
        sessionId: 'session1',
        prompt: { raw: 'Query', type: 'user' },
        result: { output: 'Result' },
        metadata: {
          tags: ['auth', 'security'],
          category: 'test',
        },
      };

      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [mockTx],
        confidence: 0.8,
      });

      const result = await handleSearchMemory({
        query: 'test',
        filters: {
          tags: ['auth'],
        },
      });

      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should apply category filter', async () => {
      const mockTx = {
        id: 'tx1',
        timestamp: Date.now(),
        sessionId: 'session1',
        prompt: { raw: 'Query', type: 'user' },
        result: { output: 'Result' },
        metadata: {
          tags: [],
          category: 'authentication',
        },
      };

      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [mockTx],
        confidence: 0.8,
      });

      const result = await handleSearchMemory({
        query: 'test',
        filters: {
          category: 'authentication',
        },
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].category).toBe('authentication');
    });

    it('should use default limit when not specified', async () => {
      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [],
        confidence: 0.5,
      });

      await handleSearchMemory({
        query: 'test',
      });

      expect(mockRAG.search).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
        })
      );
    });

    it('should return empty results when no matches', async () => {
      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [],
        confidence: 0.5,
      });

      const result = await handleSearchMemory({
        query: 'nonexistent',
      });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('handleGetHistory', () => {
    it('should get history by session ID', async () => {
      const mockTransactions = [
        {
          id: 'tx1',
          timestamp: Date.now(),
          sessionId: 'session1',
          prompt: { raw: 'Prompt 1', type: 'user' },
          result: { success: true, duration: 100 },
          metadata: { tags: [], category: 'test' },
        },
        {
          id: 'tx2',
          timestamp: Date.now(),
          sessionId: 'session1',
          prompt: { raw: 'Prompt 2', type: 'user' },
          result: { success: true, duration: 200 },
          metadata: { tags: [], category: 'test' },
        },
      ];

      mockStorage.getTransactionsBySession.mockResolvedValue(mockTransactions);

      const result = await handleGetHistory({
        sessionId: 'session1',
        limit: 50,
      });

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockStorage.getTransactionsBySession).toHaveBeenCalledWith('session1', 50);
    });

    it('should get all history with date range when no session', async () => {
      const mockTransactions = [
        {
          id: 'tx1',
          timestamp: Date.now(),
          sessionId: 'session1',
          prompt: { raw: 'Prompt', type: 'user' },
          result: { success: true, duration: 100 },
          metadata: { tags: [], category: 'test' },
        },
      ];

      mockStorage.getTransactionsByDateRange.mockResolvedValue(mockTransactions);

      const result = await handleGetHistory({
        limit: 100,
        offset: 0,
      });

      expect(result.transactions).toBeDefined();
      expect(mockStorage.getTransactionsByDateRange).toHaveBeenCalledWith(
        0,
        expect.any(Number),
        100,
        0
      );
    });

    it('should use default limit when not specified', async () => {
      mockStorage.getTransactionsByDateRange.mockResolvedValue([]);

      await handleGetHistory({});

      expect(mockStorage.getTransactionsByDateRange).toHaveBeenCalledWith(
        0,
        expect.any(Number),
        50,
        0
      );
    });

    it('should map transaction fields correctly', async () => {
      const mockTx = {
        id: 'tx1',
        timestamp: 12345,
        sessionId: 'session1',
        prompt: { raw: 'Test prompt', type: 'user' },
        result: {
          success: true,
          output: 'Output',
          duration: 100,
          toolsUsed: ['Read', 'Write'],
        },
        metadata: {
          tags: ['tag1', 'tag2'],
          category: 'test',
          relatedHooks: ['hook1'],
        },
      };

      mockStorage.getTransactionsByDateRange.mockResolvedValue([mockTx]);

      const result = await handleGetHistory({});

      expect(result.transactions[0]).toMatchObject({
        id: 'tx1',
        timestamp: 12345,
        sessionId: 'session1',
        prompt: 'Test prompt',
        promptType: 'user',
        success: true,
        duration: 100,
        toolsUsed: ['Read', 'Write'],
        tags: ['tag1', 'tag2'],
        category: 'test',
      });
    });
  });

  describe('handleIndexCodebase', () => {
    it('should index codebase successfully', async () => {
      mockIndexer.indexCodebase.mockResolvedValue([
        { path: '/test/file1.ts', hash: 'hash1', indexedAt: Date.now(), size: 100, chunksCount: 1 },
        { path: '/test/file2.ts', hash: 'hash2', indexedAt: Date.now(), size: 200, chunksCount: 2 },
      ]);

      mockIndexer.getStats.mockResolvedValue({
        totalFiles: 2,
        totalChunks: 3,
        lastIndexRun: Date.now(),
      });

      const result = await handleIndexCodebase({
        rootPath: '/test',
        incremental: false,
      });

      expect(result.success).toBe(true);
      expect(result.stats.totalFiles).toBe(2);
      expect(result.stats.totalChunks).toBe(3);
    });

    it('should handle incremental indexing', async () => {
      mockIndexer.incrementalIndex.mockResolvedValue({
        indexed: 5,
        skipped: 10,
        failed: 0,
      });

      mockIndexer.getStats.mockResolvedValue({
        totalFiles: 15,
        totalChunks: 20,
        lastIndexRun: Date.now(),
      });

      const result = await handleIndexCodebase({
        rootPath: '/test',
        incremental: true,
      });

      expect(result.success).toBe(true);
      expect(result.result.indexed).toBe(5);
      expect(result.result.skipped).toBe(10);
    });

    it('should handle indexing errors', async () => {
      mockIndexer.indexCodebase.mockRejectedValue(new Error('Indexing failed'));

      const result = await handleIndexCodebase({
        rootPath: '/test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('handleSearchCode', () => {
    it('should search indexed code successfully', async () => {
      const mockResults = [
        {
          filePath: '/src/auth.ts',
          lineRange: '10-20',
          snippet: 'function authenticate()',
          score: 0.9,
        },
        {
          filePath: '/src/login.ts',
          lineRange: '5-15',
          snippet: 'class LoginHandler',
          score: 0.7,
        },
      ];

      mockIndexer.searchCode.mockResolvedValue(mockResults);

      const result = await handleSearchCode({
        query: 'authentication',
        rootPath: '/test',
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should use default limit when not specified', async () => {
      mockIndexer.searchCode.mockResolvedValue([]);

      await handleSearchCode({
        query: 'test',
        rootPath: '/test',
      });

      expect(mockIndexer.searchCode).toHaveBeenCalledWith('test', 10);
    });

    it('should handle search errors', async () => {
      mockIndexer.searchCode.mockRejectedValue(new Error('Search failed'));

      const result = await handleSearchCode({
        query: 'test',
        rootPath: '/test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.results).toEqual([]);
    });
  });

  describe('handleGetStats', () => {
    it('should return combined RAG and storage stats', async () => {
      mockRAG.getStats.mockResolvedValue({
        totalTransactions: 100,
        totalHooks: 5,
        usingQdrant: false,
      });

      mockStorage.getStats.mockResolvedValue({
        transactionCount: 100,
        hookCount: 5,
        indexedFileCount: 50,
        memorySize: 1024000,
        lastIndexTime: Date.now(),
      });

      const result = await handleGetStats();

      expect(result.success).toBe(true);
      expect(result.stats).toMatchObject({
        totalTransactions: 100,
        totalHooks: 5,
        indexedFileCount: 50,
        memorySize: 1024000,
        usingQdrant: false,
      });
    });

    it('should handle errors when getting stats', async () => {
      mockRAG.getStats.mockRejectedValue(new Error('Stats error'));

      const result = await handleGetStats();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty query in search', async () => {
      mockRAG.search.mockResolvedValue({
        hooks: [],
        relevantTransactions: [],
        confidence: 0.5,
      });

      const result = await handleSearchMemory({
        query: '',
      });

      expect(result.results).toBeDefined();
    });

    it('should handle missing optional fields in saveTransaction', async () => {
      mockRAG.indexTransaction.mockResolvedValue(true);

      const result = await handleSaveTransaction({
        prompt: 'Test',
        promptType: 'user',
        context: {
          cwd: '/test',
          platform: 'linux',
        },
        result: {
          success: true,
          duration: 0,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should handle very large limits', async () => {
      mockStorage.getTransactionsByDateRange.mockResolvedValue([]);

      await handleGetHistory({
        limit: 1000000,
      });

      expect(mockStorage.getTransactionsByDateRange).toHaveBeenCalled();
    });

    it('should handle negative offsets', async () => {
      mockStorage.getTransactionsByDateRange.mockResolvedValue([]);

      const result = await handleGetHistory({
        offset: -10,
      });

      expect(result.transactions).toBeDefined();
    });
  });
});
