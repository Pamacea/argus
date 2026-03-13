/**
 * Unit tests for Storage (database.ts)
 * Tests CRUD operations, transactions, migrations, and persistence
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Storage } from './database.js';
import { Transaction, Hook } from '../types/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to create a mock transaction
function createMockTransaction(overrides?: Partial<Transaction>): Transaction {
  return {
    id: 'tx_test_001',
    timestamp: Date.now(),
    sessionId: 'session_001',
    prompt: {
      raw: 'Test prompt',
      type: 'user',
    },
    context: {
      cwd: '/test/workspace',
      environment: { NODE_ENV: 'test' },
      platform: 'linux',
      toolsAvailable: ['Read', 'Write'],
      files: [],
    },
    result: {
      success: true,
      output: 'Test output',
      error: undefined,
      duration: 100,
      toolsUsed: ['Read'],
    },
    metadata: {
      tags: ['test'],
      category: 'testing',
      relatedHooks: [],
    },
    ...overrides,
  };
}

// Helper to create a mock hook
function createMockHook(overrides?: Partial<Hook>): Hook {
  return {
    id: 'hook_test_001',
    name: 'Test Hook',
    description: 'A test hook',
    version: '1.0.0',
    triggers: ['PreToolUse'],
    ragQuery: 'test query',
    documentation: {
      summary: 'Test documentation',
      examples: ['example 1'],
      bestPractices: ['practice 1'],
    },
    validation: {
      requiredContext: ['cwd'],
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
    ...overrides,
  };
}

describe('Storage', () => {
  let storage: Storage;
  let testDbPath: string;

  beforeEach(async () => {
    // Create a unique test database path
    testDbPath = path.join(__dirname, '../test-data', `test_${Date.now()}.db`);
    storage = new Storage(testDbPath);

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Close storage and cleanup
    storage.close();

    // Clean up test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      // Also clean up tmp file if exists
      if (fs.existsSync(testDbPath + '.tmp')) {
        fs.unlinkSync(testDbPath + '.tmp');
      }
      // Clean up test directory
      const testDir = path.dirname(testDbPath);
      if (fs.existsSync(testDir)) {
        const statsPath = path.join(path.dirname(testDbPath), '..', 'stats.json');
        if (fs.existsSync(statsPath)) {
          fs.unlinkSync(statsPath);
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should create a new database if none exists', async () => {
      expect(storage).toBeDefined();
      const stats = await storage.getStats();
      expect(stats.transactionCount).toBe(0);
    });

    it('should load an existing database', async () => {
      // Store a transaction
      const tx = createMockTransaction();
      await storage.storeTransaction(tx);

      // Close and create new storage instance
      storage.close();
      const storage2 = new Storage(testDbPath);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify transaction was loaded
      const retrieved = await storage2.getTransaction(tx.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(tx.id);

      storage2.close();
    });

    it('should initialize all required tables and indexes', async () => {
      // This is tested implicitly by successful operations
      // but we can verify stats work
      const stats = await storage.getStats();
      expect(stats).toHaveProperty('transactionCount');
      expect(stats).toHaveProperty('hookCount');
      expect(stats).toHaveProperty('indexedFileCount');
    });
  });

  describe('Transaction CRUD', () => {
    describe('storeTransaction', () => {
      it('should store a transaction successfully', async () => {
        const tx = createMockTransaction();
        const result = await storage.storeTransaction(tx);
        expect(result).toBe(true);
      });

      it('should store a transaction with embedding', async () => {
        const tx = createMockTransaction();
        const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);
        const result = await storage.storeTransaction(tx, embedding);
        expect(result).toBe(true);
      });

      it('should handle transactions with optional fields', async () => {
        const tx = createMockTransaction({
          context: {
            cwd: '/test',
            environment: {},
            platform: 'win32',
            toolsAvailable: [],
            files: [],
          },
          result: {
            success: false,
            error: 'Test error',
            duration: 0,
          },
          metadata: {
            tags: [],
            relatedHooks: [],
          },
        });
        const result = await storage.storeTransaction(tx);
        expect(result).toBe(true);
      });

      it('should persist database to file after storing', async () => {
        const tx = createMockTransaction();
        await storage.storeTransaction(tx);

        // Verify file exists
        expect(fs.existsSync(testDbPath)).toBe(true);
      });
    });

    describe('getTransaction', () => {
      it('should retrieve a stored transaction by ID', async () => {
        const tx = createMockTransaction();
        await storage.storeTransaction(tx);

        const retrieved = await storage.getTransaction(tx.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(tx.id);
        expect(retrieved?.prompt.raw).toBe(tx.prompt.raw);
        expect(retrieved?.result.success).toBe(tx.result.success);
      });

      it('should return null for non-existent transaction', async () => {
        const retrieved = await storage.getTransaction('non_existent');
        expect(retrieved).toBeNull();
      });

      it('should properly deserialize JSON fields', async () => {
        const tx = createMockTransaction({
          context: {
            cwd: '/test',
            environment: { KEY: 'value' },
            platform: 'linux',
            toolsAvailable: ['Tool1', 'Tool2'],
            files: [{ path: '/file1.txt', hash: 'abc123' }],
          },
          metadata: {
            tags: ['tag1', 'tag2'],
            category: 'test',
            relatedHooks: ['hook1'],
          },
        });
        await storage.storeTransaction(tx);

        const retrieved = await storage.getTransaction(tx.id);
        expect(retrieved?.context.environment).toEqual({ KEY: 'value' });
        expect(retrieved?.context.toolsAvailable).toEqual(['Tool1', 'Tool2']);
        expect(retrieved?.context.files).toEqual([{ path: '/file1.txt', hash: 'abc123' }]);
        expect(retrieved?.metadata.tags).toEqual(['tag1', 'tag2']);
        expect(retrieved?.metadata.relatedHooks).toEqual(['hook1']);
      });
    });

    describe('getTransactionsBySession', () => {
      it('should retrieve all transactions for a session', async () => {
        const sessionId = 'session_test';
        const tx1 = createMockTransaction({ id: 'tx1', sessionId });
        const tx2 = createMockTransaction({ id: 'tx2', sessionId });
        const tx3 = createMockTransaction({ id: 'tx3', sessionId: 'other_session' });

        await storage.storeTransaction(tx1);
        await storage.storeTransaction(tx2);
        await storage.storeTransaction(tx3);

        const results = await storage.getTransactionsBySession(sessionId);
        expect(results).toHaveLength(2);
        expect(results.map(t => t.id)).toContain('tx1');
        expect(results.map(t => t.id)).toContain('tx2');
        expect(results.map(t => t.id)).not.toContain('tx3');
      });

      it('should respect limit parameter', async () => {
        const sessionId = 'session_test';
        for (let i = 0; i < 10; i++) {
          await storage.storeTransaction(
            createMockTransaction({ id: `tx${i}`, sessionId })
          );
        }

        const results = await storage.getTransactionsBySession(sessionId, 5);
        expect(results.length).toBeLessThanOrEqual(5);
      });

      it('should return results ordered by timestamp desc', async () => {
        const sessionId = 'session_test';
        const tx1 = createMockTransaction({
          id: 'tx1',
          sessionId,
          timestamp: 1000,
        });
        const tx2 = createMockTransaction({
          id: 'tx2',
          sessionId,
          timestamp: 3000,
        });
        const tx3 = createMockTransaction({
          id: 'tx3',
          sessionId,
          timestamp: 2000,
        });

        await storage.storeTransaction(tx1);
        await storage.storeTransaction(tx2);
        await storage.storeTransaction(tx3);

        const results = await storage.getTransactionsBySession(sessionId);
        expect(results[0].timestamp).toBeGreaterThanOrEqual(results[1].timestamp);
        expect(results[1].timestamp).toBeGreaterThanOrEqual(results[2].timestamp);
      });
    });

    describe('getTransactionsByDateRange', () => {
      it('should retrieve transactions within date range', async () => {
        const tx1 = createMockTransaction({ id: 'tx1', timestamp: 1000 });
        const tx2 = createMockTransaction({ id: 'tx2', timestamp: 2000 });
        const tx3 = createMockTransaction({ id: 'tx3', timestamp: 3000 });

        await storage.storeTransaction(tx1);
        await storage.storeTransaction(tx2);
        await storage.storeTransaction(tx3);

        const results = await storage.getTransactionsByDateRange(1500, 2500);
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('tx2');
      });

      it('should support pagination with offset', async () => {
        for (let i = 0; i < 5; i++) {
          await storage.storeTransaction(
            createMockTransaction({ id: `tx${i}`, timestamp: i * 1000 })
          );
        }

        const page1 = await storage.getTransactionsByDateRange(0, Date.now(), 2, 0);
        const page2 = await storage.getTransactionsByDateRange(0, Date.now(), 2, 2);

        expect(page1).toHaveLength(2);
        expect(page2).toHaveLength(2);
        // Ensure pages have different transactions
        const page1Ids = new Set(page1.map(t => t.id));
        const page2Ids = new Set(page2.map(t => t.id));
        const intersection = [...page1Ids].filter(id => page2Ids.has(id));
        expect(intersection).toHaveLength(0);
      });
    });

    describe('getAllTransactions', () => {
      it('should retrieve all transactions up to limit', async () => {
        for (let i = 0; i < 5; i++) {
          await storage.storeTransaction(
            createMockTransaction({ id: `tx${i}` })
          );
        }

        const results = await storage.getAllTransactions();
        expect(results).toHaveLength(5);
      });

      it('should respect custom limit', async () => {
        for (let i = 0; i < 10; i++) {
          await storage.storeTransaction(
            createMockTransaction({ id: `tx${i}` })
          );
        }

        const results = await storage.getAllTransactions(5);
        expect(results).toHaveLength(5);
      });
    });

    describe('searchTransactions', () => {
      beforeEach(async () => {
        await storage.storeTransaction(
          createMockTransaction({
            id: 'tx1',
            prompt: { raw: 'How to implement authentication', type: 'user' },
            result: { success: true, output: 'Use JWT tokens', duration: 100 },
          })
        );
        await storage.storeTransaction(
          createMockTransaction({
            id: 'tx2',
            prompt: { raw: 'Database connection issues', type: 'user' },
            result: { success: true, output: 'Check connection string', duration: 100 },
          })
        );
        await storage.storeTransaction(
          createMockTransaction({
            id: 'tx3',
            prompt: { raw: 'UI styling problems', type: 'user' },
            result: { success: true, output: 'Use CSS modules', duration: 100 },
          })
        );
      });

      it('should search by prompt text', async () => {
        const results = await storage.searchTransactions('authentication');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].prompt.raw).toContain('authentication');
      });

      it('should search by result output', async () => {
        const results = await storage.searchTransactions('JWT');
        expect(results.length).toBeGreaterThan(0);
      });

      it('should search by category', async () => {
        await storage.storeTransaction(
          createMockTransaction({
            id: 'tx4',
            prompt: { raw: 'Some prompt', type: 'user' },
            metadata: { category: 'database', tags: [], relatedHooks: [] },
          })
        );

        const results = await storage.searchTransactions('database');
        expect(results.length).toBeGreaterThan(0);
      });

      it('should return empty array for no matches', async () => {
        const results = await storage.searchTransactions('nonexistent_term_xyz');
        expect(results).toHaveLength(0);
      });
    });

    describe('deleteTransaction', () => {
      it('should delete a transaction successfully', async () => {
        const tx = createMockTransaction();
        await storage.storeTransaction(tx);

        let retrieved = await storage.getTransaction(tx.id);
        expect(retrieved).toBeDefined();

        const deleted = await storage.deleteTransaction(tx.id);
        expect(deleted).toBe(true);

        retrieved = await storage.getTransaction(tx.id);
        expect(retrieved).toBeNull();
      });

      it('return true even if transaction does not exist', async () => {
        const deleted = await storage.deleteTransaction('nonexistent');
        expect(deleted).toBe(true); // SQLite DELETE doesn't fail on non-existent
      });
    });
  });

  describe('Hook CRUD', () => {
    describe('storeHook', () => {
      it('should store a hook successfully', async () => {
        const hook = createMockHook();
        const result = await storage.storeHook(hook);
        expect(result).toBe(true);
      });

      it('should store a hook with embedding', async () => {
        const hook = createMockHook();
        const embedding = new Float32Array([0.1, 0.2, 0.3]);
        const result = await storage.storeHook(hook, embedding);
        expect(result).toBe(true);
      });

      it('should handle hooks with optional fields', async () => {
        const hook = createMockHook({
          ragQuery: undefined,
          validation: undefined,
          author: { name: 'Author' }, // no url
        });
        const result = await storage.storeHook(hook);
        expect(result).toBe(true);
      });
    });

    describe('getHook', () => {
      it('should retrieve a stored hook by ID', async () => {
        const hook = createMockHook();
        await storage.storeHook(hook);

        const retrieved = await storage.getHook(hook.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(hook.id);
        expect(retrieved?.name).toBe(hook.name);
        expect(retrieved?.version).toBe(hook.version);
      });

      it('should return null for non-existent hook', async () => {
        const retrieved = await storage.getHook('non_existent');
        expect(retrieved).toBeNull();
      });

      it('should properly deserialize JSON arrays', async () => {
        const hook = createMockHook({
          triggers: ['PreToolUse', 'PostToolUse'],
          documentation: {
            summary: 'Test',
            examples: ['ex1', 'ex2'],
            bestPractices: ['bp1', 'bp2'],
          },
        });
        await storage.storeHook(hook);

        const retrieved = await storage.getHook(hook.id);
        expect(retrieved?.triggers).toEqual(['PreToolUse', 'PostToolUse']);
        expect(retrieved?.documentation.examples).toEqual(['ex1', 'ex2']);
        expect(retrieved?.documentation.bestPractices).toEqual(['bp1', 'bp2']);
      });
    });

    describe('getAllHooks', () => {
      it('should retrieve all hooks ordered by downloads', async () => {
        const hook1 = createMockHook({
          id: 'hook1',
          marketplace: { downloads: 100, rating: 4.0, updatedAt: Date.now() },
        });
        const hook2 = createMockHook({
          id: 'hook2',
          marketplace: { downloads: 500, rating: 4.5, updatedAt: Date.now() },
        });
        const hook3 = createMockHook({
          id: 'hook3',
          marketplace: { downloads: 250, rating: 4.2, updatedAt: Date.now() },
        });

        await storage.storeHook(hook1);
        await storage.storeHook(hook2);
        await storage.storeHook(hook3);

        const results = await storage.getAllHooks();
        expect(results).toHaveLength(3);
        expect(results[0].marketplace.downloads).toBeGreaterThanOrEqual(results[1].marketplace.downloads);
        expect(results[1].marketplace.downloads).toBeGreaterThanOrEqual(results[2].marketplace.downloads);
      });

      it('should return empty array when no hooks exist', async () => {
        const results = await storage.getAllHooks();
        expect(results).toEqual([]);
      });
    });

    describe('updateHook', () => {
      it('should update an existing hook', async () => {
        const hook = createMockHook();
        await storage.storeHook(hook);

        const updatedHook = {
          ...hook,
          name: 'Updated Hook Name',
          description: 'Updated description',
          marketplace: {
            ...hook.marketplace,
            downloads: 200,
          },
        };

        const result = await storage.updateHook(updatedHook);
        expect(result).toBe(true);

        const retrieved = await storage.getHook(hook.id);
        expect(retrieved?.name).toBe('Updated Hook Name');
        expect(retrieved?.description).toBe('Updated description');
        expect(retrieved?.marketplace.downloads).toBe(200);
      });

      it('should not change hook ID on update', async () => {
        const hook = createMockHook();
        await storage.storeHook(hook);

        const updatedHook = { ...hook, name: 'New Name' };
        await storage.updateHook(updatedHook);

        const retrieved = await storage.getHook(hook.id);
        expect(retrieved?.id).toBe(hook.id);
      });
    });

    describe('deleteHook', () => {
      it('should delete a hook successfully', async () => {
        const hook = createMockHook();
        await storage.storeHook(hook);

        let retrieved = await storage.getHook(hook.id);
        expect(retrieved).toBeDefined();

        const deleted = await storage.deleteHook(hook.id);
        expect(deleted).toBe(true);

        retrieved = await storage.getHook(hook.id);
        expect(retrieved).toBeNull();
      });
    });
  });

  describe('Indexed Files', () => {
    describe('storeIndexedFile', () => {
      it('should store indexed file metadata', async () => {
        await storage.storeIndexedFile('/path/to/file.ts', 'hash123', 1024, 5);

        const retrieved = await storage.getIndexedFile('/path/to/file.ts');
        expect(retrieved).toBeDefined();
        expect(retrieved?.hash).toBe('hash123');
        expect(retrieved?.size).toBe(1024);
        expect(retrieved?.chunksCount).toBe(5);
      });

      it('should update existing file metadata', async () => {
        await storage.storeIndexedFile('/path/to/file.ts', 'hash1', 1000, 3);
        await storage.storeIndexedFile('/path/to/file.ts', 'hash2', 2000, 5);

        const retrieved = await storage.getIndexedFile('/path/to/file.ts');
        expect(retrieved?.hash).toBe('hash2');
        expect(retrieved?.size).toBe(2000);
        expect(retrieved?.chunksCount).toBe(5);
      });
    });

    describe('getIndexedFile', () => {
      it('should return null for non-existent file', async () => {
        const retrieved = await storage.getIndexedFile('/nonexistent');
        expect(retrieved).toBeNull();
      });

      it('should return correct indexedAt timestamp', async () => {
        const before = Date.now();
        await storage.storeIndexedFile('/test.ts', 'hash', 100, 1);
        const after = Date.now();

        const retrieved = await storage.getIndexedFile('/test.ts');
        expect(retrieved?.indexedAt).toBeGreaterThanOrEqual(before);
        expect(retrieved?.indexedAt).toBeLessThanOrEqual(after);
      });
    });
  });

  describe('Statistics', () => {
    it('should return zero stats for empty database', async () => {
      const stats = await storage.getStats();
      expect(stats.transactionCount).toBe(0);
      expect(stats.hookCount).toBe(0);
      expect(stats.indexedFileCount).toBe(0);
      expect(stats.lastIndexTime).toBe(0);
    });

    it('should count transactions correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.storeTransaction(createMockTransaction({ id: `tx${i}` }));
      }

      const stats = await storage.getStats();
      expect(stats.transactionCount).toBe(5);
    });

    it('should count hooks correctly', async () => {
      for (let i = 0; i < 3; i++) {
        await storage.storeHook(createMockHook({ id: `hook${i}` }));
      }

      const stats = await storage.getStats();
      expect(stats.hookCount).toBe(3);
    });

    it('should count indexed files correctly', async () => {
      await storage.storeIndexedFile('/file1.ts', 'hash1', 100, 1);
      await storage.storeIndexedFile('/file2.ts', 'hash2', 200, 2);

      const stats = await storage.getStats();
      expect(stats.indexedFileCount).toBe(2);
    });

    it('should calculate memory size correctly', async () => {
      await storage.storeTransaction(createMockTransaction());

      const stats = await storage.getStats();
      expect(stats.memorySize).toBeGreaterThan(0);
    });

    it('should track last index time', async () => {
      const before = Date.now();
      await storage.storeIndexedFile('/test.ts', 'hash', 100, 1);
      const after = Date.now();

      const stats = await storage.getStats();
      expect(stats.lastIndexTime).toBeGreaterThanOrEqual(before);
      expect(stats.lastIndexTime).toBeLessThanOrEqual(after);
    });
  });

  describe('Persistence', () => {
    it('should persist data across storage instances', async () => {
      const tx = createMockTransaction();
      await storage.storeTransaction(tx);

      // Close and create new instance
      storage.close();
      const storage2 = new Storage(testDbPath);
      await new Promise(resolve => setTimeout(resolve, 100));

      const retrieved = await storage2.getTransaction(tx.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(tx.id);

      storage2.close();
    });

    it('should use atomic writes (tmp file + rename)', async () => {
      const tx = createMockTransaction();
      await storage.storeTransaction(tx);

      // After successful write, tmp file should not exist
      expect(fs.existsSync(testDbPath + '.tmp')).toBe(false);
      expect(fs.existsSync(testDbPath)).toBe(true);
    });
  });

  describe('Singleton Pattern', () => {
    it('getStorage should return same instance', async () => {
      const { getStorage } = await import('./database.js');

      // Reset the singleton for testing
      const storage1 = getStorage(testDbPath);
      const storage2 = getStorage(testDbPath);

      expect(storage1).toBe(storage2);
    });
  });

  describe('Auto-Flush and Shutdown', () => {
    it('should save database on close', async () => {
      const tx = createMockTransaction();
      await storage.storeTransaction(tx);

      const statsBefore = await storage.getStats();
      storage.close();

      // Create new instance and verify data persisted
      const storage2 = new Storage(testDbPath);
      await new Promise(resolve => setTimeout(resolve, 100));

      const statsAfter = await storage2.getStats();
      expect(statsAfter.transactionCount).toBe(statsBefore.transactionCount);

      storage2.close();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very long strings', async () => {
      const longString = 'a'.repeat(10000);
      const tx = createMockTransaction({
        prompt: { raw: longString, type: 'user' },
        result: { success: true, output: longString, duration: 100 },
      });

      const result = await storage.storeTransaction(tx);
      expect(result).toBe(true);

      const retrieved = await storage.getTransaction(tx.id);
      expect(retrieved?.prompt.raw).toHaveLength(10000);
    });

    it('should handle special characters in strings', async () => {
      const specialString = "Test with 'quotes' and \"double quotes\" and \n newlines";
      const tx = createMockTransaction({
        prompt: { raw: specialString, type: 'user' },
        result: { success: true, output: specialString, duration: 100 },
      });

      const result = await storage.storeTransaction(tx);
      expect(result).toBe(true);

      const retrieved = await storage.getTransaction(tx.id);
      expect(retrieved?.prompt.raw).toBe(specialString);
    });

    it('should handle empty arrays', async () => {
      const tx = createMockTransaction({
        context: {
          cwd: '/test',
          environment: {},
          platform: 'linux',
          toolsAvailable: [],
          files: [],
        },
        metadata: {
          tags: [],
          relatedHooks: [],
        },
      });

      const result = await storage.storeTransaction(tx);
      expect(result).toBe(true);

      const retrieved = await storage.getTransaction(tx.id);
      expect(retrieved?.context.toolsAvailable).toEqual([]);
      expect(retrieved?.metadata.tags).toEqual([]);
    });

    it('should handle unicode characters', async () => {
      const unicodeString = 'Test with émojis 🎉 and 中文 characters';
      const tx = createMockTransaction({
        prompt: { raw: unicodeString, type: 'user' },
        result: { success: true, output: unicodeString, duration: 100 },
      });

      const result = await storage.storeTransaction(tx);
      expect(result).toBe(true);

      const retrieved = await storage.getTransaction(tx.id);
      expect(retrieved?.prompt.raw).toBe(unicodeString);
    });
  });
});
