/**
 * Integration tests for ARGUS
 * Tests the full workflow: check_hooks → action → save
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('ARGUS Integration Tests', () => {
  describe('Full Workflow: Check Hooks → Action → Save', () => {
    it('should complete full workflow for Explore tool', async () => {
      // Step 1: Check hooks before tool use
      const checkHooksResult = await checkHooks('Explore', { query: 'test' })
      expect(checkHooksResult).toHaveProperty('hooks')
      expect(checkHooksResult).toHaveProperty('shouldProceed')

      // Step 2: Execute the action (if not intercepted)
      if (checkHooksResult.shouldProceed) {
        const actionResult = await executeAction('Explore', { query: 'test' })
        expect(actionResult).toHaveProperty('success')

        // Step 3: Save transaction
        if (actionResult.success) {
          const saved = await saveTransaction({
            prompt: 'test',
            action: 'Explore',
            result: actionResult,
          })
          expect(saved).toBe(true)
        }
      }
    })

    it('should intercept when hook returns shouldIntercept: true', async () => {
      const checkHooksResult = await checkHooks('Bash', { command: 'rm -rf /' })

      expect(checkHooksResult.shouldProceed).toBe(false)
      expect(checkHooksResult.intercepted).toBe(true)
      expect(checkHooksResult.message).toBeDefined()
    })

    it('should save transaction after successful tool use', async () => {
      // Mock successful tool execution
      const toolResult = { success: true, output: 'File read successfully' }

      const transaction = {
        id: expect.any(String),
        timestamp: expect.any(Number),
        sessionId: 'session-123',
        prompt: { raw: 'Read the file', type: 'user' },
        context: { cwd: '/project', platform: 'linux' },
        result: toolResult,
        metadata: { tags: ['read', 'file'] },
      }

      const saved = await saveTransaction(transaction)
      expect(saved).toBe(true)

      // Verify transaction was saved
      const retrieved = await getTransaction(transaction.id)
      expect(retrieved).toEqual(transaction)
    })
  })

  describe('RAG Integration', () => {
    it('should find relevant hooks using semantic search', async () => {
      const query = 'implement authentication in Next.js'

      const results = await ragSearch(query)
      expect(results).toHaveProperty('hooks')
      expect(Array.isArray(results.hooks)).toBe(true)
      expect(results.hooks.length).toBeGreaterThan(0)
    })

    it('should find relevant historical transactions', async () => {
      const query = 'how to deploy to Vercel'

      const results = await ragSearch(query)
      expect(results).toHaveProperty('transactions')
      expect(Array.isArray(results.transactions)).toBe(true)
    })

    it('should return confidence scores', async () => {
      const query = 'typescript error handling'

      const results = await ragSearch(query)
      expect(results).toHaveProperty('confidence')
      expect(results.confidence).toBeGreaterThanOrEqual(0)
      expect(results.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('Cross-Platform Integration', () => {
    const platforms = [
      { name: 'Windows', path: 'C:\\Users\\test\\project' },
      { name: 'macOS', path: '/Users/test/project' },
      { name: 'Linux', path: '/home/test/project' },
    ]

    platforms.forEach(({ name, path }) => {
      it(`should work on ${name}`, async () => {
        const context = { cwd: path, platform: name.toLowerCase() }

        const result = await executeAction('Explore', { query: 'test' }, context)
        expect(result.success).toBe(true)
      })
    })
  })

  describe('Error Recovery', () => {
    it('should handle storage failures gracefully', async () => {
      // Mock storage failure
      vi.mocked(mockStorage.saveTransaction).mockRejectedValueOnce(new Error('Storage unavailable'))

      const result = await safeExecuteWithSave('Explore', { query: 'test' })
      expect(result).toHaveProperty('fallback')
    })

    it('should handle RAG failures gracefully', async () => {
      vi.mocked(ragSearch).mockRejectedValueOnce(new Error('RAG unavailable'))

      const result = await checkHooks('Explore', { query: 'test' })
      expect(result.shouldProceed).toBe(true) // Should proceed without hooks
    })
  })
})

// Mock implementations (these would be replaced with real imports)
async function checkHooks(tool: string, args: Record<string, unknown>) {
  // Simulated hook check
  if (tool === 'Bash' && args['command']?.toString().includes('rm -rf')) {
    return {
      hooks: [{ id: 'security-1', name: 'Security' }],
      shouldProceed: false,
      intercepted: true,
      message: 'Dangerous operation blocked',
    }
  }
  return {
    hooks: [],
    shouldProceed: true,
    intercepted: false,
  }
}

async function executeAction(tool: string, args: Record<string, unknown>, context?: Record<string, unknown>) {
  return { success: true, output: 'Action executed' }
}

async function saveTransaction(transaction: Record<string, unknown>) {
  return true
}

async function getTransaction(id: string) {
  return {
    id,
    timestamp: Date.now(),
    sessionId: 'session-123',
    prompt: { raw: 'test', type: 'user' },
    context: {},
    result: { success: true },
    metadata: { tags: [] },
  }
}

async function ragSearch(query: string) {
  return {
    hooks: [{ id: 'hook-1', name: 'Test Hook' }],
    transactions: [{ id: 'txn-1', prompt: { raw: query } }],
    confidence: 0.85,
  }
}

const mockStorage = {
  saveTransaction: vi.fn(),
}

async function safeExecuteWithSave(tool: string, args: Record<string, unknown>) {
  try {
    const result = await executeAction(tool, args)
    await saveTransaction({ action: tool, result })
    return result
  } catch {
    return { fallback: true }
  }
}
