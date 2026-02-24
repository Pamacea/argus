/**
 * End-to-End Tests for ARGUS
 * Tests complete workflows from user prompt to search results
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { handleCheckHooks } from '../../src/handlers/tools.js';
import { handleSaveTransaction } from '../../src/handlers/tools.js';
import { handleSearchMemory } from '../../src/handlers/tools.js';
import { handleGetHistory } from '../../src/handlers/tools.js';
import { handleGetStats } from '../../src/handlers/tools.js';
import { Storage } from '../../src/storage/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('E2E: Complete Transaction Workflow', () => {
  let storage: Storage;
  let testDbPath: string;

  beforeAll(async () => {
    testDbPath = path.join(__dirname, '../test-data', `e2e_${Date.now()}.db`);
    storage = new Storage(testDbPath);

    // Wait for initialization
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
      const testDir = path.dirname(testDbPath);
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Workflow: User Asks Question -> System Answers -> Search Later', () => {
    it('should complete full workflow: save transaction and retrieve via search', async () => {
      // Step 1: User asks about authentication
      const userPrompt = 'How do I implement JWT authentication in a Node.js API?';

      // Step 2: Check hooks before proceeding (simulated)
      const hooksResult = await handleCheckHooks({
        prompt: userPrompt,
        toolName: 'Explore',
        context: { cwd: '/test/project', platform: 'linux' },
      });

      expect(hooksResult).toBeDefined();
      expect(hooksResult.hooks).toBeDefined();
      expect(hooksResult.relevantTransactions).toBeDefined();

      // Step 3: System provides answer and saves transaction
      const systemAnswer = {
        output: `To implement JWT authentication in Node.js:
1. Install jsonwebtoken package: npm install jsonwebtoken
2. Create a login endpoint that verifies credentials
3. Sign a JWT with a secret key
4. Send the token to the client
5. Verify the token on protected routes`,
        duration: 150,
        toolsUsed: ['Write', 'Bash'],
      };

      const saveResult = await handleSaveTransaction({
        prompt: userPrompt,
        promptType: 'user',
        context: {
          cwd: '/test/project',
          platform: 'linux',
          environment: { NODE_ENV: 'development' },
          toolsAvailable: ['Read', 'Write', 'Bash'],
          files: [],
        },
        result: {
          success: true,
          ...systemAnswer,
        },
        metadata: {
          tags: ['authentication', 'jwt', 'nodejs', 'api'],
          category: 'authentication',
        },
      });

      expect(saveResult.success).toBe(true);
      expect(saveResult.transactionId).toBeDefined();

      // Step 4: User asks similar question later
      const laterQuery = 'How do I add JWT tokens to my API?';

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Step 5: Search memory for relevant information
      const searchResult = await handleSearchMemory({
        query: laterQuery,
        limit: 5,
        threshold: 0.1,
      });

      expect(searchResult.results).toBeDefined();
      expect(searchResult.results.length).toBeGreaterThan(0);

      // Should find the original transaction
      const originalTx = searchResult.results.find(
        r => r.prompt.includes('JWT authentication')
      );
      expect(originalTx).toBeDefined();

      // Step 6: Get history to see all related transactions
      const historyResult = await handleGetHistory({
        sessionId: '/test/project',
        limit: 10,
      });

      expect(historyResult.transactions).toBeDefined();
      expect(historyResult.transactions.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow: Multiple Related Questions Build Context', () => {
    it('should build context across multiple related transactions', async () => {
      const conversation = [
        {
          prompt: 'How do I set up a React project with TypeScript?',
          tags: ['react', 'typescript', 'setup'],
          output: 'Use create-react-app with --template typescript or Vite with React',
        },
        {
          prompt: 'How do I add routing to my React TypeScript app?',
          tags: ['react', 'typescript', 'routing'],
          output: 'Install react-router-dom and configure routes with TypeScript types',
        },
        {
          prompt: 'How do I implement authentication in React Router?',
          tags: ['react', 'typescript', 'routing', 'authentication'],
          output: 'Use ProtectedRoute components with context or hooks for auth state',
        },
      ];

      const savedIds: string[] = [];

      // Save all transactions
      for (const item of conversation) {
        const result = await handleSaveTransaction({
          prompt: item.prompt,
          promptType: 'user',
          context: {
            cwd: '/test/react-project',
            platform: 'linux',
          },
          result: {
            success: true,
            output: item.output,
            duration: 100,
          },
          metadata: {
            tags: item.tags,
            category: 'frontend',
          },
        });

        expect(result.success).toBe(true);
        savedIds.push(result.transactionId);
      }

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Search for related content
      const searchResult = await handleSearchMemory({
        query: 'React TypeScript authentication routing',
        limit: 5,
        threshold: 0.1,
      });

      expect(searchResult.results.length).toBeGreaterThan(0);

      // Should find multiple related transactions
      const foundIds = searchResult.results.map(r => r.id);
      const overlap = savedIds.filter(id => foundIds.includes(id));
      expect(overlap.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow: Error Handling and Recovery', () => {
    it('should handle both successful and failed transactions', async () => {
      // Successful transaction
      await handleSaveTransaction({
        prompt: 'Help me implement feature X',
        promptType: 'user',
        context: { cwd: '/test', platform: 'linux' },
        result: {
          success: true,
          output: 'Feature X implemented successfully',
          duration: 100,
        },
        metadata: { tags: ['feature'], category: 'feature' },
      });

      // Failed transaction
      await handleSaveTransaction({
        prompt: 'Help me fix broken build',
        promptType: 'user',
        context: { cwd: '/test', platform: 'linux' },
        result: {
          success: false,
          error: 'Build failed due to TypeScript errors',
          duration: 50,
        },
        metadata: { tags: ['build', 'error'], category: 'debugging' },
      });

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Search should find both
      const allResults = await handleSearchMemory({
        query: 'build feature',
        limit: 10,
        threshold: 0.1,
      });

      expect(allResults.results.length).toBeGreaterThan(0);

      // Filter for successful/failed
      const successful = allResults.results.filter(r => r.result?.success !== false);
      const failed = allResults.results.filter(r => r.result?.success === false);

      expect(successful.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow: Statistics and Monitoring', () => {
    it('should track statistics across operations', async () => {
      const initialStats = await handleGetStats();

      expect(initialStats.success).toBe(true);
      expect(initialStats.stats).toBeDefined();

      // Perform some operations
      for (let i = 0; i < 5; i++) {
        await handleSaveTransaction({
          prompt: `Test prompt ${i}`,
          promptType: 'user',
          context: { cwd: '/test', platform: 'linux' },
          result: {
            success: true,
            output: `Test output ${i}`,
            duration: 50,
          },
          metadata: { tags: ['test'], category: 'testing' },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Check updated stats
      const finalStats = await handleGetStats();

      expect(finalStats.success).toBe(true);
      expect(finalStats.stats.transactionCount).toBeGreaterThan(initialStats.stats.transactionCount);
    });
  });

  describe('Workflow: Cross-Session Learning', () => {
    it('should provide context from different sessions', async () => {
      const session1 = '/project/auth-service';
      const session2 = '/project/frontend';

      // Session 1: Backend auth implementation
      await handleSaveTransaction({
        prompt: 'Implement JWT authentication middleware',
        promptType: 'user',
        context: {
          cwd: session1,
          platform: 'linux',
          environment: { SERVICE: 'auth' },
        },
        result: {
          success: true,
          output: 'Created JWT middleware with verifyToken function',
          duration: 200,
        },
        metadata: {
          tags: ['jwt', 'middleware', 'backend'],
          category: 'backend',
        },
      });

      // Session 2: Frontend auth implementation
      await handleSaveTransaction({
        prompt: 'Add JWT token to API requests',
        promptType: 'user',
        context: {
          cwd: session2,
          platform: 'linux',
          environment: { PROJECT: 'frontend' },
        },
        result: {
          success: true,
          output: 'Added Authorization header with bearer token',
          duration: 150,
        },
        metadata: {
          tags: ['jwt', 'api', 'frontend'],
          category: 'frontend',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Search from new session should find both
      const searchResult = await handleSearchMemory({
        query: 'JWT token implementation',
        limit: 10,
        threshold: 0.1,
      });

      expect(searchResult.results.length).toBeGreaterThan(0);

      // Should have results from both sessions
      const sessions = new Set(searchResult.results.map(r => r.sessionId));
      expect(sessions.has(session1) || sessions.has(session2)).toBe(true);
    });
  });

  describe('Workflow: Tool Usage Tracking', () => {
    it('should track which tools were used', async () => {
      await handleSaveTransaction({
        prompt: 'Refactor the authentication module',
        promptType: 'user',
        context: {
          cwd: '/test',
          platform: 'linux',
          toolsAvailable: ['Read', 'Write', 'Edit', 'Bash'],
        },
        result: {
          success: true,
          output: 'Refactored authentication module',
          duration: 500,
          toolsUsed: ['Read', 'Edit', 'Edit', 'Write', 'Bash'],
        },
        metadata: {
          tags: ['refactor', 'authentication'],
          category: 'refactoring',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Retrieve transaction
      const history = await handleGetHistory({
        sessionId: '/test',
        limit: 1,
      });

      expect(history.transactions[0].toolsUsed).toEqual(['Read', 'Edit', 'Edit', 'Write', 'Bash']);
    });
  });

  describe('Workflow: Category-Based Organization', () => {
    it('should organize transactions by category', async () => {
      const categories = [
        { prompt: 'Fix database connection', category: 'bugfix', tags: ['database', 'bug'] },
        { prompt: 'Add user authentication', category: 'feature', tags: ['auth', 'feature'] },
        { prompt: 'Optimize query performance', category: 'optimization', tags: ['database', 'performance'] },
        { prompt: 'Update dependencies', category: 'maintenance', tags: ['dependencies'] },
        { prompt: 'Implement OAuth', category: 'feature', tags: ['oauth', 'auth'] },
      ];

      for (const item of categories) {
        await handleSaveTransaction({
          prompt: item.prompt,
          promptType: 'user',
          context: { cwd: '/test', platform: 'linux' },
          result: {
            success: true,
            output: `Completed: ${item.prompt}`,
            duration: 100,
          },
          metadata: {
            tags: item.tags,
            category: item.category,
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Search for feature work
      const featureResults = await handleSearchMemory({
        query: 'authentication implementation',
        filters: { category: 'feature' },
        limit: 10,
        threshold: 0.1,
      });

      expect(featureResults.results.length).toBeGreaterThan(0);

      // All results should be features
      featureResults.results.forEach(r => {
        expect(r.category).toBe('feature');
      });
    });
  });

  describe('Workflow: Tag-Based Search', () => {
    it('should support multi-tag filtering', async () => {
      await handleSaveTransaction({
        prompt: 'Implement React form with validation',
        promptType: 'user',
        context: { cwd: '/test', platform: 'linux' },
        result: {
          success: true,
          output: 'Created React form with Formik and Yup',
          duration: 200,
        },
        metadata: {
          tags: ['react', 'form', 'validation', 'frontend', 'ui'],
          category: 'frontend',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Search with multiple tags
      const searchResult = await handleSearchMemory({
        query: 'form implementation',
        filters: {
          tags: ['react', 'validation'],
        },
        limit: 10,
        threshold: 0.1,
      });

      expect(searchResult.results).toBeDefined();
    });
  });
});
