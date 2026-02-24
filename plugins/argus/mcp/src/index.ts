#!/usr/bin/env node

/**
 * ARGUS MCP Server
 * Semantic memory and hooks marketplace for Claude Code
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  handleCheckHooks,
  handleSaveTransaction,
  handleSearchMemory,
  handleGetHistory,
  handleIndexCodebase,
  handleSearchCode,
  handleGetStats,
} from './handlers/tools.js';
import { getQueueProcessor } from './queue-processor.js';
import { startHookExecutionProcessor } from './processors/hook-executions.js';
import { startIndexedFilesProcessor } from './processors/indexed-files.js';

// Create MCP server
const server = new Server(
  {
    name: '@argus/mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'argus__check_hooks',
        description:
          'MANDATORY: Consult RAG + Index + Docs before using Explore tool. ' +
          'This tool checks for relevant hooks and past transactions that should ' +
          'inform the current task. Call this before starting any exploration work.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The user prompt or task description',
            },
            toolName: {
              type: 'string',
              description: 'The tool being used (e.g., "Explore", "Task")',
            },
            context: {
              type: 'object',
              properties: {
                cwd: {
                  type: 'string',
                  description: 'Current working directory',
                },
                platform: {
                  type: 'string',
                  description: 'Platform information',
                },
              },
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'argus__save_transaction',
        description:
          'Save a prompt + context + result transaction to semantic memory. ' +
          'Call this after completing a task to enable future retrieval.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The original prompt',
            },
            promptType: {
              type: 'string',
              enum: ['user', 'tool', 'system'],
              description: 'Type of prompt',
            },
            context: {
              type: 'object',
              properties: {
                cwd: {
                  type: 'string',
                  description: 'Current working directory',
                },
                platform: {
                  type: 'string',
                  description: 'Platform information',
                },
                environment: {
                  type: 'object',
                  description: 'Environment variables',
                },
                toolsAvailable: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Available tools',
                },
                files: {
                  type: 'array',
                  description: 'Files involved in the transaction',
                },
              },
              required: ['cwd', 'platform'],
            },
            result: {
              type: 'object',
              properties: {
                success: {
                  type: 'boolean',
                  description: 'Whether the operation succeeded',
                },
                output: {
                  type: 'string',
                  description: 'Result output',
                },
                error: {
                  type: 'string',
                  description: 'Error message if failed',
                },
                duration: {
                  type: 'number',
                  description: 'Duration in milliseconds',
                },
                toolsUsed: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tools used during the transaction',
                },
              },
              required: ['success'],
            },
            metadata: {
              type: 'object',
              properties: {
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tags for semantic search',
                },
                category: {
                  type: 'string',
                  description: 'Category of the transaction',
                },
                relatedHooks: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Related hook IDs',
                },
              },
            },
          },
          required: ['prompt', 'promptType', 'context', 'result'],
        },
      },
      {
        name: 'argus__search_memory',
        description:
          'Semantic search in transaction history. Use this to find ' +
          'similar past tasks and their solutions.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)',
            },
            threshold: {
              type: 'number',
              description: 'Similarity threshold (0-1, default: 0.5)',
            },
            filters: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Filter by session ID',
                },
                dateRange: {
                  type: 'object',
                  properties: {
                    start: {
                      type: 'number',
                      description: 'Start timestamp',
                    },
                    end: {
                      type: 'number',
                      description: 'End timestamp',
                    },
                  },
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by tags',
                },
                category: {
                  type: 'string',
                  description: 'Filter by category',
                },
              },
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'argus__get_history',
        description:
          'Retrieve transaction history with pagination. Useful for ' +
          'reviewing recent activity or session-specific transactions.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 50)',
            },
            offset: {
              type: 'number',
              description: 'Offset for pagination (default: 0)',
            },
            sessionId: {
              type: 'string',
              description: 'Filter by session ID',
            },
          },
        },
      },
      {
        name: 'argus__index_codebase',
        description:
          'Index local codebase for semantic search. ' +
          'Scans /src and /docs directories and creates embeddings for code chunks.',
        inputSchema: {
          type: 'object',
          properties: {
            rootPath: {
              type: 'string',
              description: 'Root path of the codebase to index',
            },
            incremental: {
              type: 'boolean',
              description: 'Only index changed files (default: false)',
            },
          },
          required: ['rootPath'],
        },
      },
      {
        name: 'argus__search_code',
        description:
          'Search indexed code using semantic search. ' +
          'Returns relevant code snippets with file paths and line numbers.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query describing the code',
            },
            rootPath: {
              type: 'string',
              description: 'Root path of the codebase',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)',
            },
          },
          required: ['query', 'rootPath'],
        },
      },
      {
        name: 'argus__get_stats',
        description:
          'Get RAG engine statistics including transaction counts, ' +
          'hook counts, and whether Qdrant is being used.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'argus__check_hooks':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await handleCheckHooks(args as any), null, 2),
            },
          ],
        };

      case 'argus__save_transaction':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await handleSaveTransaction(args as any), null, 2),
            },
          ],
        };

      case 'argus__search_memory':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await handleSearchMemory(args as any), null, 2),
            },
          ],
        };

      case 'argus__get_history':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await handleGetHistory(args as any), null, 2),
            },
          ],
        };

      case 'argus__index_codebase':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await handleIndexCodebase(args as any), null, 2),
            },
          ],
        };

      case 'argus__search_code':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await handleSearchCode(args as any), null, 2),
            },
          ],
        };

      case 'argus__get_stats':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await handleGetStats(), null, 2),
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: errorMessage,
          }),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  // Start queue processor to process queued items from hooks
  const queueProcessor = getQueueProcessor();
  queueProcessor.start(5000); // Process every 5 seconds
  console.error('[ARGUS] Queue processor started');

  // Start hook executions processor to track hook runs
  startHookExecutionProcessor(10000); // Process every 10 seconds
  console.error('[ARGUS] Hook executions processor started');

  // Start indexed files processor to track indexed files
  startIndexedFilesProcessor(15000); // Process every 15 seconds
  console.error('[ARGUS] Indexed files processor started');

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ARGUS MCP Server running on stdio');

  // Setup graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    console.error(`[ARGUS] Received ${signal}, shutting down gracefully...`);
    console.error('[ARGUS] Flushing queue before shutdown...');

    // Stop the queue processor
    queueProcessor.stop();

    // Process any remaining items in the queue
    // Give it a moment to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.error('[ARGUS] Queue flushed, exiting...');
    process.exit(0);
  };

  // Handle shutdown signals
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('beforeExit', async () => {
    console.error('[ARGUS] beforeExit triggered, flushing queue...');
    queueProcessor.stop();
    await new Promise(resolve => setTimeout(resolve, 500));
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
