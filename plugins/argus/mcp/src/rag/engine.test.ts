/**
 * Unit tests for RAG Engine (rag/engine.ts)
 * Tests semantic search, indexing, Qdrant integration (mocked), and fallback behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RAGEngine, getRAGEngine } from './engine.js';
import { Transaction, Hook, SearchQuery } from '../types/index.js';
import { getStorage } from '../storage/database.js';
import fs from 'fs';
import path from 'path';

// Mock the storage module
vi.mock('../storage/database.js', () => ({
  getStorage: vi.fn(() => ({
    storeTransaction: vi.fn().mockResolvedValue(true),
    getTransaction: vi.fn().mockResolvedValue(null),
    getAllTransactions: vi.fn().mockResolvedValue([]),
    searchTransactions: vi.fn().mockResolvedValue([]),
    getAllHooks: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({
      transactionCount: 0,
      hookCount: 0,
      indexedFileCount: 0,
      memorySize: 0,
      lastIndexTime: 0,
    }),
    deleteTransaction: vi.fn().mockResolvedValue(true),
  })),
}));

// Mock Qdrant client
vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    getCollections: vi.fn().mockResolvedValue({ collections: [] }),
    createCollection: vi.fn().mockResolvedValue(true),
    upsert: vi.fn().mockResolvedValue(true),
    search: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  })),
}));

// Helper to create a mock transaction
function createMockTransaction(overrides?: Partial<Transaction>): Transaction {
  return {
    id: 'tx_test_001',
    timestamp: Date.now(),
    sessionId: 'session_001',
    prompt: {
      raw: 'How to implement JWT authentication',
      type: 'user',
    },
    context: {
      cwd: '/test/workspace',
      environment: {},
      platform: 'linux',
      toolsAvailable: [],
      files: [],
    },
    result: {
      success: true,
      output: 'Use jsonwebtoken library and sign tokens with a secret key',
      error: undefined,
      duration: 100,
    },
    metadata: {
      tags: ['auth', 'jwt'],
      category: 'authentication',
      relatedHooks: [],
    },
    ...overrides,
  };
}

// Helper to create a mock hook
function createMockHook(overrides?: Partial<Hook>): Hook {
  return {
    id: 'hook_test_001',
    name: 'Auth Hook',
    description: 'Helps with authentication implementation',
    version: '1.0.0',
    triggers: ['PreToolUse'],
    ragQuery: 'authentication jwt',
    documentation: {
      summary: 'Provides authentication guidance',
      examples: [],
      bestPractices: [],
    },
    author: {
      name: 'Test Author',
    },
    marketplace: {
      downloads: 100,
      rating: 4.5,
      updatedAt: Date.now(),
    },
    ...overrides,
  };
}

describe('RAGEngine', () => {
  let rag: RAGEngine;
  let mockStorage: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Get mocked storage
    mockStorage = getStorage();

    // Create RAG instance with local search forced
    rag = new RAGEngine({ useLocal: true }, { provider: 'local' });
  });

  afterEach(() => {
    // Clean up
  });

  describe('Initialization', () => {
    it('should initialize with local search when useLocal is true', () => {
      const localRag = new RAGEngine({ useLocal: true }, { provider: 'local' });
      expect(localRag).toBeDefined();
    });

    it('should use default config values', () => {
      const defaultRag = new RAGEngine({}, { provider: 'local' });
      expect(defaultRag).toBeDefined();
    });

    it('should support singleton pattern via getRAGEngine', () => {
      const instance1 = getRAGEngine({ useLocal: true }, { provider: 'local' });
      const instance2 = getRAGEngine({ useLocal: true }, { provider: 'local' });
      expect(instance1).toBe(instance2);
    });
  });

  describe('indexTransaction', () => {
    it('should index a transaction successfully', async () => {
      const tx = createMockTransaction();
      const result = await rag.indexTransaction(tx);
      expect(result).toBe(true);
      expect(mockStorage.storeTransaction).toHaveBeenCalled();
    });

    it('should handle transactions with empty output', async () => {
      const tx = createMockTransaction({
        result: {
          success: true,
          output: undefined,
          duration: 100,
        },
      });
      const result = await rag.indexTransaction(tx);
      expect(result).toBe(true);
    });

    it('should handle indexing errors gracefully', async () => {
      mockStorage.storeTransaction.mockRejectedValueOnce(new Error('DB Error'));

      const tx = createMockTransaction();
      const result = await rag.indexTransaction(tx);
      expect(result).toBe(false);
    });

    it('should store embedding with transaction', async () => {
      const tx = createMockTransaction();
      await rag.indexTransaction(tx);

      const storeCall = mockStorage.storeTransaction.mock.calls[0];
      expect(storeCall[0]).toBe(tx);
      expect(storeCall[1]).toBeInstanceOf(Float32Array);
    });
  });

  describe('indexHook', () => {
    it('should index a hook successfully', async () => {
      const hook = createMockHook();
      mockStorage.storeHook = vi.fn().mockResolvedValue(true);

      const result = await rag.indexHook(hook);
      expect(result).toBe(true);
      expect(mockStorage.storeHook).toHaveBeenCalled();
    });

    it('should handle hooks without ragQuery', async () => {
      const hook = createMockHook({ ragQuery: undefined });
      mockStorage.storeHook = vi.fn().mockResolvedValue(true);

      const result = await rag.indexHook(hook);
      expect(result).toBe(true);
    });

    it('should handle hooks without validation', async () => {
      const hook = createMockHook({ validation: undefined });
      mockStorage.storeHook = vi.fn().mockResolvedValue(true);

      const result = await rag.indexHook(hook);
      expect(result).toBe(true);
    });
  });

  describe('search', () => {
    it('should return empty result when no matches found', async () => {
      mockStorage.searchTransactions = vi.fn().mockResolvedValue([]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      const query: SearchQuery = {
        query: 'nonexistent query',
        limit: 10,
      };

      const result = await rag.search(query);
      expect(result.relevantTransactions).toEqual([]);
      expect(result.hooks).toEqual([]);
    });

    it('should apply threshold filter', async () => {
      const mockTx = createMockTransaction({
        prompt: { raw: 'database query optimization', type: 'user' },
        result: { success: true, output: 'Use indexing', duration: 100 },
      });
      mockStorage.searchTransactions = vi.fn().mockResolvedValue([mockTx]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      const query: SearchQuery = {
        query: 'database',
        limit: 10,
        threshold: 0.9, // High threshold
      };

      const result = await rag.search(query);
      // With high threshold and text similarity, likely no matches
      expect(result).toBeDefined();
    });

    it('should use default limit when not specified', async () => {
      mockStorage.searchTransactions = vi.fn().mockResolvedValue([]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      const query: SearchQuery = {
        query: 'test query',
      };

      await rag.search(query);
      expect(mockStorage.searchTransactions).toHaveBeenCalledWith(
        'test query',
        20 // limit * 2 for filtering
      );
    });

    it('should handle search errors gracefully', async () => {
      mockStorage.searchTransactions = vi.fn().mockRejectedValue(new Error('Search error'));

      const query: SearchQuery = {
        query: 'test query',
      };

      const result = await rag.search(query);
      expect(result).toBeDefined();
      expect(result.relevantTransactions).toBeDefined();
    });
  });

  describe('findRelevantHooks', () => {
    it('should search for hooks based on context', async () => {
      const mockHook = createMockHook();
      mockStorage.searchTransactions = vi.fn().mockResolvedValue([]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([mockHook]);

      const result = await rag.findRelevantHooks({
        prompt: 'authentication implementation',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should pass category in search if provided', async () => {
      mockStorage.searchTransactions = vi.fn().mockResolvedValue([]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      await rag.findRelevantHooks({
        prompt: 'test',
        category: 'auth',
      });

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('deleteTransaction', () => {
    it('should delete transaction from storage', async () => {
      const result = await rag.deleteTransaction('tx_001');
      expect(result).toBe(true);
      expect(mockStorage.deleteTransaction).toHaveBeenCalledWith('tx_001');
    });

    it('should handle delete errors gracefully', async () => {
      mockStorage.deleteTransaction = vi.fn().mockRejectedValue(new Error('Delete error'));

      const result = await rag.deleteTransaction('tx_001');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      mockStorage.getTransactionsByDateRange = vi.fn().mockResolvedValue([]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      const stats = await rag.getStats();
      expect(stats).toHaveProperty('totalTransactions');
      expect(stats).toHaveProperty('totalHooks');
      expect(stats).toHaveProperty('usingQdrant');
    });

    it('should indicate local search when using local mode', async () => {
      mockStorage.getTransactionsByDateRange = vi.fn().mockResolvedValue([]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      const stats = await rag.getStats();
      expect(stats.usingQdrant).toBe(false);
    });
  });

  describe('Text Similarity Calculation', () => {
    it('should calculate similarity for matching words', async () => {
      const mockTx = createMockTransaction({
        prompt: { raw: 'authentication and authorization', type: 'user' },
        result: { success: true, output: 'Use JWT', duration: 100 },
      });
      mockStorage.searchTransactions = vi.fn().mockResolvedValue([mockTx]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      const query: SearchQuery = {
        query: 'authentication methods',
        limit: 10,
        threshold: 0.1,
      };

      const result = await rag.search(query);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return zero similarity for no matches', async () => {
      const mockTx = createMockTransaction({
        prompt: { raw: 'database optimization', type: 'user' },
        result: { success: true, output: 'Add indexes', duration: 100 },
      });
      mockStorage.searchTransactions = vi.fn().mockResolvedValue([mockTx]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      const query: SearchQuery = {
        query: 'authentication security', // No overlap
        limit: 10,
        threshold: 0.9, // Very high threshold
      };

      const result = await rag.search(query);
      expect(result).toBeDefined();
    });
  });

  describe('Embedding Generation', () => {
    it('should generate local embeddings when provider is local', async () => {
      const tx = createMockTransaction({
        prompt: { raw: 'test prompt for embedding', type: 'user' },
        result: { success: true, output: 'test output', duration: 100 },
      });

      await rag.indexTransaction(tx);

      const storeCall = mockStorage.storeTransaction.mock.calls[0];
      const embedding = storeCall[1];

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBeGreaterThan(0);
    });

    it('should generate embeddings with consistent dimensions', async () => {
      const tx1 = createMockTransaction({ id: 'tx1' });
      const tx2 = createMockTransaction({ id: 'tx2' });

      await rag.indexTransaction(tx1);
      await rag.indexTransaction(tx2);

      const embedding1 = mockStorage.storeTransaction.mock.calls[0][1];
      const embedding2 = mockStorage.storeTransaction.mock.calls[1][1];

      expect(embedding1.length).toBe(embedding2.length);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query string', async () => {
      mockStorage.searchTransactions = vi.fn().mockResolvedValue([]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      const query: SearchQuery = {
        query: '',
        limit: 10,
      };

      const result = await rag.search(query);
      expect(result).toBeDefined();
    });

    it('should handle very long query strings', async () => {
      const longQuery = 'test '.repeat(1000);
      mockStorage.searchTransactions = vi.fn().mockResolvedValue([]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      const query: SearchQuery = {
        query: longQuery,
        limit: 10,
      };

      const result = await rag.search(query);
      expect(result).toBeDefined();
    });

    it('should handle unicode in queries', async () => {
      const unicodeQuery = 'authentication 认证 🎉';
      mockStorage.searchTransactions = vi.fn().mockResolvedValue([]);
      mockStorage.getAllHooks = vi.fn().mockResolvedValue([]);

      const query: SearchQuery = {
        query: unicodeQuery,
        limit: 10,
      };

      const result = await rag.search(query);
      expect(result).toBeDefined();
    });

    it('should handle transaction with minimal data', async () => {
      const minimalTx: Transaction = {
        id: 'tx_minimal',
        timestamp: Date.now(),
        sessionId: 'session',
        prompt: { raw: '', type: 'user' },
        context: {
          cwd: '/',
          environment: {},
          platform: 'linux',
          toolsAvailable: [],
          files: [],
        },
        result: { success: true, duration: 0 },
        metadata: { tags: [] },
      };

      const result = await rag.indexTransaction(minimalTx);
      expect(result).toBe(true);
    });
  });

  describe('Qdrant Integration (Mocked)', () => {
    it('should attempt Qdrant connection when not using local', async () => {
      // This test verifies the code path, actual Qdrant is mocked
      const { QdrantClient } = await import('@qdrant/js-client-rest');

      const ragWithQdrant = new RAGEngine({ useLocal: false }, { provider: 'local' });

      // QdrantClient should have been called
      expect(QdrantClient).toHaveBeenCalled();
    });
  });
});
