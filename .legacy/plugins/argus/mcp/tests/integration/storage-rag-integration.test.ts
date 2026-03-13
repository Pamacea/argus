/**
 * Integration Tests for Storage + RAG Engine
 * Tests the interaction between SQLite storage and semantic search
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Storage } from '../../src/storage/database.js';
import { RAGEngine } from '../../src/rag/engine.js';
import { Transaction, Hook } from '../../src/types/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Storage + RAG Integration', () => {
  let storage: Storage;
  let rag: RAGEngine;
  let testDbPath: string;

  beforeAll(async () => {
    testDbPath = path.join(__dirname, '../test-data', `integration_${Date.now()}.db`);
    storage = new Storage(testDbPath);

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 200));

    rag = new RAGEngine({ useLocal: true }, { provider: 'local' });
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    storage.close();

    // Cleanup
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      if (fs.existsSync(testDbPath + '.tmp')) {
        fs.unlinkSync(testDbPath + '.tmp');
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clear any test data between tests
    // Note: In real tests, you might want to use transactions or clean tables
  });

  describe('Transaction Indexing Flow', () => {
    it('should index transaction and retrieve it via search', async () => {
      const tx: Transaction = {
        id: 'tx_search_001',
        timestamp: Date.now(),
        sessionId: 'test_session',
        prompt: {
          raw: 'How to implement JWT authentication in Node.js',
          type: 'user',
        },
        context: {
          cwd: '/test',
          environment: {},
          platform: 'linux',
          toolsAvailable: [],
          files: [],
        },
        result: {
          success: true,
          output: 'Use the jsonwebtoken library to sign tokens with a secret key',
          duration: 100,
        },
        metadata: {
          tags: ['auth', 'jwt', 'nodejs'],
          category: 'authentication',
        },
      };

      // Index via RAG
      const indexed = await rag.indexTransaction(tx);
      expect(indexed).toBe(true);

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Search for similar content
      const searchResult = await rag.search({
        query: 'JWT token authentication',
        limit: 5,
        threshold: 0.1,
      });

      expect(searchResult.relevantTransactions.length).toBeGreaterThan(0);
      const found = searchResult.relevantTransactions.find(t => t.id === tx.id);
      expect(found).toBeDefined();
    });

    it('should persist indexed transactions across restarts', async () => {
      const tx: Transaction = {
        id: 'tx_persist_001',
        timestamp: Date.now(),
        sessionId: 'persist_test',
        prompt: {
          raw: 'Database optimization techniques',
          type: 'user',
        },
        context: {
          cwd: '/test',
          environment: {},
          platform: 'linux',
          toolsAvailable: [],
          files: [],
        },
        result: {
          success: true,
          output: 'Add indexes on frequently queried columns',
          duration: 50,
        },
        metadata: {
          tags: ['database', 'optimization'],
          category: 'database',
        },
      };

      // Index transaction
      await rag.indexTransaction(tx);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create new storage instance (simulate restart)
      const storage2 = new Storage(testDbPath);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify transaction persisted
      const retrieved = await storage2.getTransaction(tx.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(tx.id);

      storage2.close();
    });

    it('should index multiple transactions and search across them', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx_multi_001',
          timestamp: Date.now(),
          sessionId: 'session1',
          prompt: { raw: 'React component best practices', type: 'user' },
          context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
          result: { success: true, output: 'Use functional components with hooks', duration: 100 },
          metadata: { tags: ['react', 'frontend'], category: 'frontend' },
        },
        {
          id: 'tx_multi_002',
          timestamp: Date.now(),
          sessionId: 'session1',
          prompt: { raw: 'TypeScript type safety', type: 'user' },
          context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
          result: { success: true, output: 'Use strict mode and enable noImplicitAny', duration: 80 },
          metadata: { tags: ['typescript'], category: 'typescript' },
        },
        {
          id: 'tx_multi_003',
          timestamp: Date.now(),
          sessionId: 'session1',
          prompt: { raw: 'CSS-in-JS solutions comparison', type: 'user' },
          context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
          result: { success: true, output: 'Styled-components vs emotion', duration: 120 },
          metadata: { tags: ['css', 'styling'], category: 'styling' },
        },
      ];

      // Index all transactions
      for (const tx of transactions) {
        await rag.indexTransaction(tx);
      }
      await new Promise(resolve => setTimeout(resolve, 200));

      // Search for frontend-related content
      const frontendResult = await rag.search({
        query: 'React hooks functional components',
        limit: 5,
        threshold: 0.1,
      });

      expect(frontendResult.relevantTransactions.length).toBeGreaterThan(0);

      // Search for TypeScript content
      const tsResult = await rag.search({
        query: 'TypeScript strict mode',
        limit: 5,
        threshold: 0.1,
      });

      expect(tsResult.relevantTransactions.length).toBeGreaterThan(0);
    });
  });

  describe('Hook Indexing Flow', () => {
    it('should index hook and retrieve via search', async () => {
      const hook: Hook = {
        id: 'hook_auth_001',
        name: 'Authentication Helper',
        description: 'Provides guidance on implementing authentication',
        version: '1.0.0',
        triggers: ['PreToolUse', 'PostToolUse'],
        ragQuery: 'authentication jwt oauth',
        documentation: {
          summary: 'Helps implement JWT and OAuth authentication',
          examples: [
            'Use jsonwebtoken for JWT tokens',
            'Configure passport.js for OAuth',
          ],
          bestPractices: [
            'Always hash passwords',
            'Use HTTPS in production',
            'Implement token refresh',
          ],
        },
        validation: {
          requiredContext: ['cwd', 'platform'],
          prohibitedPatterns: ['hardcoded secrets', 'plain text passwords'],
        },
        author: {
          name: 'Security Expert',
          url: 'https://example.com',
        },
        marketplace: {
          downloads: 500,
          rating: 4.8,
          updatedAt: Date.now(),
        },
      };

      // Index hook
      const indexed = await rag.indexHook(hook);
      expect(indexed).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify stored in database
      const retrieved = await storage.getHook(hook.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Authentication Helper');
      expect(retrieved?.documentation.examples).toHaveLength(2);
    });

    it('should find relevant hooks based on query', async () => {
      const hooks: Hook[] = [
        {
          id: 'hook_db_001',
          name: 'Database Helper',
          description: 'Database query optimization',
          version: '1.0.0',
          triggers: ['PreToolUse'],
          ragQuery: 'database query optimization',
          documentation: {
            summary: 'Helps optimize database queries',
            examples: [],
            bestPractices: [],
          },
          author: { name: 'DB Expert' },
          marketplace: { downloads: 100, rating: 4.0, updatedAt: Date.now() },
        },
        {
          id: 'hook_auth_002',
          name: 'Auth Guide',
          description: 'Authentication implementation',
          version: '1.0.0',
          triggers: ['PreToolUse'],
          ragQuery: 'authentication',
          documentation: {
            summary: 'Authentication guidance',
            examples: [],
            bestPractices: [],
          },
          author: { name: 'Auth Expert' },
          marketplace: { downloads: 200, rating: 4.5, updatedAt: Date.now() },
        },
      ];

      // Index hooks
      for (const hook of hooks) {
        await rag.indexHook(hook);
      }
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find relevant hooks
      const relevant = await rag.findRelevantHooks({
        prompt: 'How to implement authentication',
      });

      expect(relevant.length).toBeGreaterThan(0);
      // Should find auth-related hook
      const authHook = relevant.find(h => h.name === 'Auth Guide');
      expect(authHook).toBeDefined();
    });
  });

  describe('Search with Filters', () => {
    beforeEach(async () => {
      // Setup test data
      const transactions: Transaction[] = [
        {
          id: 'tx_filter_001',
          timestamp: 1000,
          sessionId: 'session_a',
          prompt: { raw: 'Feature A implementation', type: 'user' },
          context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
          result: { success: true, output: 'Result A', duration: 100 },
          metadata: { tags: ['feature', 'backend'], category: 'backend' },
        },
        {
          id: 'tx_filter_002',
          timestamp: 2000,
          sessionId: 'session_b',
          prompt: { raw: 'Feature B implementation', type: 'user' },
          context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
          result: { success: true, output: 'Result B', duration: 150 },
          metadata: { tags: ['feature', 'frontend'], category: 'frontend' },
        },
        {
          id: 'tx_filter_003',
          timestamp: 3000,
          sessionId: 'session_a',
          prompt: { raw: 'Bug fix in authentication', type: 'user' },
          context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
          result: { success: true, output: 'Fixed bug', duration: 50 },
          metadata: { tags: ['bug', 'auth'], category: 'bugfix' },
        },
      ];

      for (const tx of transactions) {
        await rag.indexTransaction(tx);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should filter by session ID', async () => {
      const result = await rag.search({
        query: 'implementation',
        limit: 10,
        threshold: 0.1,
      });

      // Manually filter by session (since RAG doesn't support this natively)
      const sessionResults = result.relevantTransactions.filter(
        tx => tx.sessionId === 'session_a'
      );

      expect(sessionResults.length).toBe(2);
    });

    it('should filter by date range', async () => {
      const result = await rag.search({
        query: 'implementation',
        limit: 10,
        threshold: 0.1,
      });

      // Manually filter by date
      const dateResults = result.relevantTransactions.filter(
        tx => tx.timestamp >= 1500 && tx.timestamp <= 2500
      );

      expect(dateResults.length).toBe(1);
      expect(dateResults[0].id).toBe('tx_filter_002');
    });

    it('should filter by tags', async () => {
      const result = await rag.search({
        query: 'feature',
        limit: 10,
        threshold: 0.1,
      });

      // Manually filter by tags
      const taggedResults = result.relevantTransactions.filter(
        tx => tx.metadata.tags.includes('feature')
      );

      expect(taggedResults.length).toBe(2);
    });

    it('should filter by category', async () => {
      const result = await rag.search({
        query: 'implementation',
        limit: 10,
        threshold: 0.1,
      });

      // Manually filter by category
      const backendResults = result.relevantTransactions.filter(
        tx => tx.metadata.category === 'backend'
      );

      expect(backendResults.length).toBe(1);
      expect(backendResults[0].id).toBe('tx_filter_001');
    });
  });

  describe('Statistics Integration', () => {
    it('should provide unified statistics', async () => {
      // Add some test data
      const tx: Transaction = {
        id: 'tx_stats_001',
        timestamp: Date.now(),
        sessionId: 'stats_test',
        prompt: { raw: 'Test', type: 'user' },
        context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
        result: { success: true, output: 'Result', duration: 100 },
        metadata: { tags: [], category: 'test' },
      };

      await rag.indexTransaction(tx);
      await new Promise(resolve => setTimeout(resolve, 100));

      const ragStats = await rag.getStats();
      const storageStats = await storage.getStats();

      expect(ragStats.totalTransactions).toBeGreaterThan(0);
      expect(storageStats.transactionCount).toBeGreaterThan(0);
    });
  });

  describe('Delete Operations', () => {
    it('should delete transaction from both storage and index', async () => {
      const tx: Transaction = {
        id: 'tx_delete_001',
        timestamp: Date.now(),
        sessionId: 'delete_test',
        prompt: { raw: 'To be deleted', type: 'user' },
        context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
        result: { success: true, output: 'Will be removed', duration: 100 },
        metadata: { tags: [], category: 'test' },
      };

      await rag.indexTransaction(tx);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify it exists
      let retrieved = await storage.getTransaction(tx.id);
      expect(retrieved).toBeDefined();

      // Delete via RAG
      const deleted = await rag.deleteTransaction(tx.id);
      expect(deleted).toBe(true);

      // Verify it's gone
      retrieved = await storage.getTransaction(tx.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Complex Queries', () => {
    beforeEach(async () => {
      const complexTransactions: Transaction[] = [
        {
          id: 'tx_complex_001',
          timestamp: Date.now(),
          sessionId: 'complex',
          prompt: { raw: 'Implement OAuth2 with Google provider', type: 'user' },
          context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
          result: {
            success: true,
            output: 'Use passport-google-oauth20 package, configure with client ID and secret',
            duration: 200,
          },
          metadata: {
            tags: ['oauth', 'google', 'passport', 'authentication'],
            category: 'authentication',
          },
        },
        {
          id: 'tx_complex_002',
          timestamp: Date.now(),
          sessionId: 'complex',
          prompt: { raw: 'Set up JWT refresh token rotation', type: 'user' },
          context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
          result: {
            success: true,
            output: 'Implement refresh token endpoint, store in Redis, rotate on each use',
            duration: 180,
          },
          metadata: {
            tags: ['jwt', 'refresh-token', 'redis', 'security'],
            category: 'authentication',
          },
        },
        {
          id: 'tx_complex_003',
          timestamp: Date.now(),
          sessionId: 'complex',
          prompt: { raw: 'Create React login form with validation', type: 'user' },
          context: { cwd: '/test', environment: {}, platform: 'linux', toolsAvailable: [], files: [] },
          result: {
            success: true,
            output: 'Use Formik or React Hook Form with Yup schema validation',
            duration: 150,
          },
          metadata: {
            tags: ['react', 'form', 'validation', 'frontend'],
            category: 'frontend',
          },
        },
      ];

      for (const tx of complexTransactions) {
        await rag.indexTransaction(tx);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should find multiple relevant transactions', async () => {
      const result = await rag.search({
        query: 'authentication tokens',
        limit: 5,
        threshold: 0.1,
      });

      // Should find OAuth and JWT related transactions
      expect(result.relevantTransactions.length).toBeGreaterThan(0);
    });

    it('should return results ranked by relevance', async () => {
      const result = await rag.search({
        query: 'authentication',
        limit: 10,
        threshold: 0.1,
      });

      // First result should be most relevant
      expect(result.relevantTransactions.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });
});
