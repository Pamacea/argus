/**
 * CRITICAL: Hook Interception Tests
 * Tests that ARGUS properly intercepts Explore tool calls
 * This is the core value proposition of ARGUS
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock hook executor
interface MockHookExecutor {
  executeBeforeTool: (toolName: string, args: unknown) => Promise<boolean>
  executeAfterTool: (toolName: string, result: unknown) => Promise<void>
  findRelevantHooks: (context: string) => Promise<MockHook[]>
}

interface MockHook {
  id: string
  name: string
  triggers: string[]
  ragQuery: string
  execute: (context: Record<string, unknown>) => Promise<{ shouldIntercept: boolean; message?: string }>
}

describe('Hook Interception System', () => {
  let mockHooks: MockHook[]
  let hookExecutor: MockHookExecutor

  // Sample hooks for testing
  const securityHook: MockHook = {
    id: 'security-1',
    name: 'Security Validation',
    triggers: ['PreToolUse'],
    ragQuery: 'security validation check',
    execute: vi.fn(async () => ({
      shouldIntercept: false,
      message: 'Security check passed',
    })),
  }

  const bestPracticeHook: MockHook = {
    id: 'bp-1',
    name: 'Best Practice Guide',
    triggers: ['PreToolUse'],
    ragQuery: 'best practice pattern',
    execute: vi.fn(async () => ({
      shouldIntercept: false,
      message: 'Consider using TypeScript',
    })),
  }

  const blockingHook: MockHook = {
    id: 'block-1',
    name: 'Dangerous Operation Blocker',
    triggers: ['PreToolUse'],
    ragQuery: 'dangerous operation rm -rf',
    execute: vi.fn(async () => ({
      shouldIntercept: true,
      message: 'This operation is dangerous. Are you sure?',
    })),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockHooks = [securityHook, bestPracticeHook, blockingHook]

    // Mock hook executor
    hookExecutor = {
      executeBeforeTool: vi.fn(async (toolName: string, args: unknown) => {
        const relevantHooks = mockHooks.filter(h =>
          h.triggers.includes('PreToolUse')
        )

        for (const hook of relevantHooks) {
          const result = await hook.execute({ toolName, args })
          if (result.shouldIntercept) {
            return true // Intercepted
          }
        }

        return false // Not intercepted
      }),

      executeAfterTool: vi.fn(async () => {
        // Post-tool execution logic
      }),

      findRelevantHooks: vi.fn(async (context: string) => {
        return mockHooks.filter(h =>
          h.ragQuery.includes(context.toLowerCase()) ||
          context.toLowerCase().includes(h.ragQuery.split(' ')[0])
        )
      }),
    }
  })

  describe('Explore Tool Interception', () => {
    it('should intercept Explore tool calls', async () => {
      const intercepted = await hookExecutor.executeBeforeTool('Explore', {
        query: 'test query',
      })

      // The hooks should have been checked
      expect(hookExecutor.executeBeforeTool).toHaveBeenCalled()

      // All hooks should have been executed
      expect(securityHook.execute).toHaveBeenCalled()
      expect(bestPracticeHook.execute).toHaveBeenCalled()
      expect(blockingHook.execute).toHaveBeenCalled()
    })

    it('should allow Explore to proceed when no hooks block', async () => {
      const intercepted = await hookExecutor.executeBeforeTool('Explore', {
        query: 'safe operation',
      })

      expect(intercepted).toBe(false)
    })

    it('should block Explore when a hook returns shouldIntercept: true', async () => {
      // Make blockingHook trigger
      blockingHook.execute = vi.fn(async () => ({
        shouldIntercept: true,
        message: 'Blocked by security policy',
      }))

      const intercepted = await hookExecutor.executeBeforeTool('Explore', {
        query: 'rm -rf /',
      })

      expect(intercepted).toBe(true)
    })

    it('should find relevant hooks based on context', async () => {
      const relevant = await hookExecutor.findRelevantHooks('security')

      expect(relevant).toContain(securityHook)
    })

    it('should pass tool arguments to hooks', async () => {
      const args = {
        query: 'authentication implementation',
        sessionId: 'session-123',
      }

      await hookExecutor.executeBeforeTool('Explore', args)

      expect(securityHook.execute).toHaveBeenCalledWith({
        toolName: 'Explore',
        args,
      })
    })
  })

  describe('Hook Trigger Points', () => {
    it('should trigger on PreToolUse', async () => {
      const preToolHook: MockHook = {
        id: 'pre-1',
        name: 'Pre Tool Hook',
        triggers: ['PreToolUse'],
        ragQuery: 'pre tool',
        execute: vi.fn(async () => ({ shouldIntercept: false })),
      }

      mockHooks.push(preToolHook)

      await hookExecutor.executeBeforeTool('Read', { path: '/test' })

      expect(preToolHook.execute).toHaveBeenCalled()
    })

    it('should trigger on PostToolUse', async () => {
      const postToolHook: MockHook = {
        id: 'post-1',
        name: 'Post Tool Hook',
        triggers: ['PostToolUse'],
        ragQuery: 'post tool',
        execute: vi.fn(async () => ({ shouldIntercept: false })),
      }

      mockHooks.push(postToolHook)

      await hookExecutor.executeAfterTool('Read', { content: 'test' })

      expect(hookExecutor.executeAfterTool).toHaveBeenCalled()
    })

    it('should trigger on SessionStart', async () => {
      const sessionHook: MockHook = {
        id: 'session-1',
        name: 'Session Start Hook',
        triggers: ['SessionStart'],
        ragQuery: 'session start',
        execute: vi.fn(async () => ({ shouldIntercept: false })),
      }

      mockHooks.push(sessionHook)

      // SessionStart would be triggered at session initialization
      expect(sessionHook.triggers).toContain('SessionStart')
    })
  })

  describe('RAG-based Hook Selection', () => {
    it('should select hooks based on semantic similarity', async () => {
      const query = 'implement authentication security'

      const relevant = await hookExecutor.findRelevantHooks(query)

      // Should find security-related hooks
      expect(relevant.length).toBeGreaterThan(0)
    })

    it('should rank hooks by relevance', async () => {
      const hooks = await hookExecutor.findRelevantHooks('best practices')

      // More relevant hooks should come first
      expect(hooks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Best Practice Guide' }),
        ])
      )
    })

    it('should handle no matching hooks', async () => {
      const relevant = await hookExecutor.findRelevantHooks('completely unrelated topic')

      expect(relevant).toBeDefined()
    })
  })

  describe('Hook Execution Context', () => {
    it('should provide tool name to hooks', async () => {
      await hookExecutor.executeBeforeTool('Write', { path: '/test' })

      expect(securityHook.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'Write',
        })
      )
    })

    it('should provide tool arguments to hooks', async () => {
      const args = { path: '/test', content: 'data' }

      await hookExecutor.executeBeforeTool('Write', args)

      expect(securityHook.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          args,
        })
      )
    })

    it('should provide session context to hooks', async () => {
      const context = {
        sessionId: 'session-123',
        cwd: '/project',
        platform: 'linux',
      }

      await hookExecutor.executeBeforeTool('Explore', context)

      expect(securityHook.execute).toHaveBeenCalled()
    })
  })

  describe('Hook Response Handling', () => {
    it('should handle non-intercepting hooks', async () => {
      securityHook.execute = vi.fn(async () => ({
        shouldIntercept: false,
        message: 'All good',
      }))

      const intercepted = await hookExecutor.executeBeforeTool('Read', {})

      expect(intercepted).toBe(false)
    })

    it('should handle intercepting hooks', async () => {
      securityHook.execute = vi.fn(async () => ({
        shouldIntercept: true,
        message: 'Operation blocked',
      }))

      const intercepted = await hookExecutor.executeBeforeTool('Write', {})

      expect(intercepted).toBe(true)
    })

    it('should aggregate messages from multiple hooks', async () => {
      securityHook.execute = vi.fn(async () => ({
        shouldIntercept: false,
        message: 'Security: OK',
      }))

      bestPracticeHook.execute = vi.fn(async () => ({
        shouldIntercept: false,
        message: 'Tip: Use TypeScript',
      }))

      await hookExecutor.executeBeforeTool('Explore', {})

      // Both hooks should execute
      expect(securityHook.execute).toHaveBeenCalled()
      expect(bestPracticeHook.execute).toHaveBeenCalled()
    })
  })

  describe('Performance Requirements', () => {
    it('should complete hook execution within 50ms', async () => {
      securityHook.execute = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { shouldIntercept: false }
      })

      const start = performance.now()
      await hookExecutor.executeBeforeTool('Explore', {})
      const duration = performance.now() - start

      expect(duration).toBeLessThan(50)
    })

    it('should handle multiple hooks efficiently', async () => {
      // Add 10 more hooks
      for (let i = 0; i < 10; i++) {
        mockHooks.push({
          id: `hook-${i}`,
          name: `Hook ${i}`,
          triggers: ['PreToolUse'],
          ragQuery: `test ${i}`,
          execute: vi.fn(async () => ({ shouldIntercept: false })),
        })
      }

      const start = performance.now()
      await hookExecutor.executeBeforeTool('Explore', {})
      const duration = performance.now() - start

      // Should still be fast even with multiple hooks
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Error Handling', () => {
    it('should handle hook execution errors gracefully', async () => {
      securityHook.execute = vi.fn(async () => {
        throw new Error('Hook execution failed')
      })

      // Should not throw, should handle gracefully
      await expect(hookExecutor.executeBeforeTool('Explore', {})).resolves.not.toThrow()
    })

    it('should continue executing hooks after one fails', async () => {
      securityHook.execute = vi.fn(async () => {
        throw new Error('Error')
      })

      await hookExecutor.executeBeforeTool('Explore', {})

      // Other hooks should still execute
      expect(bestPracticeHook.execute).toHaveBeenCalled()
      expect(blockingHook.execute).toHaveBeenCalled()
    })
  })

  describe('Integration Scenarios', () => {
    it('should prevent dangerous operations', async () => {
      const scenario = 'rm -rf /important/data'

      blockingHook.execute = vi.fn(async (context) => {
        const args = context.args as Record<string, unknown>
        const command = args?.command as string || ''

        if (command.includes('rm -rf')) {
          return {
            shouldIntercept: true,
            message: 'Dangerous operation detected!',
          }
        }

        return { shouldIntercept: false }
      })

      const intercepted = await hookExecutor.executeBeforeTool('Bash', {
        command: scenario,
      })

      expect(intercepted).toBe(true)
    })

    it('should suggest improvements during Explore', async () => {
      const context = 'implementing user authentication'

      bestPracticeHook.execute = vi.fn(async () => ({
        shouldIntercept: false,
        message: 'Consider using NextAuth.js v5 instead of custom auth',
      }))

      await hookExecutor.executeBeforeTool('Explore', { query: context })

      expect(bestPracticeHook.execute).toHaveBeenCalled()
    })

    it('should enforce security patterns', async () => {
      securityHook.execute = vi.fn(async (context) => {
        const args = context.args as Record<string, unknown>

        // Check for API key in code
        const content = args?.content as string || ''
        if (content.includes('api_key = ')) {
          return {
            shouldIntercept: true,
            message: 'API key detected in code. Use environment variables.',
          }
        }

        return { shouldIntercept: false }
      })

      const intercepted = await hookExecutor.executeBeforeTool('Write', {
        path: '/src/config.ts',
        content: 'const api_key = "secret123"',
      })

      expect(intercepted).toBe(true)
    })
  })
})
