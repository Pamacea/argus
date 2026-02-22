/**
 * MCP Tool Handlers for ARGUS
 * Integrates with RAG engine and SQLite storage
 */

import { v4 as uuidv4 } from 'uuid';
import { getStorage } from '../storage/index.js';
import { getRAGEngine } from '../rag/index.js';
import { createFileIndexer } from '../indexer/index.js';

// Initialize storage and RAG engine (lazy initialization)
const storage = getStorage();
const rag = getRAGEngine();

/**
 * Check hooks before tool execution (MANDATORY for Explore)
 */
export async function handleCheckHooks(args: {
  prompt: string;
  toolName?: string;
  context?: {
    cwd: string;
    platform: string;
  };
}) {
  // Use RAG to find relevant hooks and transactions
  const ragResult = await rag.search({
    query: args.prompt,
    limit: 5,
    threshold: 0.6
  });

  // Also get hooks directly for better accuracy
  const allHooks = storage.getAllHooks();

  // Filter hooks by relevance
  const relevantHooks = ragResult.hooks.length > 0
    ? ragResult.hooks
    : allHooks.filter(hook => {
        // Filter by tool trigger if specified
        if (args.toolName && hook.triggers.includes('PreToolUse' as any)) {
          return true;
        }
        // Filter by RAG query
        if (hook.ragQuery) {
          const queryLower = hook.ragQuery.toLowerCase();
          return args.prompt.toLowerCase().includes(queryLower);
        }
        return false;
      }).slice(0, 5);

  return {
    hooks: relevantHooks.map(h => ({
      id: h.id,
      name: h.name,
      description: h.description,
      documentation: h.documentation.summary,
      examples: h.documentation.examples || [],
    })),
    relevantTransactions: ragResult.relevantTransactions.map(t => ({
      id: t.id,
      timestamp: t.timestamp,
      prompt: t.prompt.raw,
      result: t.result.output,
    })),
    confidence: ragResult.confidence,
  };
}

/**
 * Save a transaction to memory with RAG indexing
 */
export async function handleSaveTransaction(args: {
  prompt: string;
  promptType: 'user' | 'tool' | 'system';
  context: {
    cwd: string;
    platform: string;
    environment?: Record<string, string>;
    toolsAvailable?: string[];
    files?: Array<{ path: string; hash?: string }>;
  };
  result: {
    success: boolean;
    output?: string;
    error?: string;
    duration?: number;
    toolsUsed?: string[];
  };
  metadata?: {
    tags?: string[];
    category?: string;
    relatedHooks?: string[];
  };
}) {
  const transaction = {
    id: uuidv4(),
    timestamp: Date.now(),
    sessionId: args.context.cwd, // Use cwd as simple session ID
    prompt: {
      raw: args.prompt,
      type: args.promptType,
    },
    context: {
      cwd: args.context.cwd,
      environment: args.context.environment || {},
      platform: args.context.platform,
      toolsAvailable: args.context.toolsAvailable || [],
      files: args.context.files || [],
    },
    result: {
      success: args.result.success,
      output: args.result.output,
      error: args.result.error,
      duration: args.result.duration || 0,
      toolsUsed: args.result.toolsUsed || [],
    },
    metadata: {
      tags: args.metadata?.tags || [],
      category: args.metadata?.category,
      relatedHooks: args.metadata?.relatedHooks || [],
    },
  };

  // Store in SQLite and index with RAG
  await rag.indexTransaction(transaction);

  return {
    success: true,
    transactionId: transaction.id,
    timestamp: transaction.timestamp,
  };
}

/**
 * Search semantic memory using RAG
 */
export async function handleSearchMemory(args: {
  query: string;
  limit?: number;
  threshold?: number;
  filters?: {
    sessionId?: string;
    dateRange?: {
      start: number;
      end: number;
    };
    tags?: string[];
    category?: string;
  };
}) {
  const ragResult = await rag.search({
    query: args.query,
    limit: args.limit || 10,
    threshold: args.threshold || 0.5
  });

  let filtered = ragResult.relevantTransactions;

  // Apply filters if provided
  if (args.filters) {
    const filters = args.filters;
    if (filters.sessionId) {
      filtered = filtered.filter(t => t.sessionId === filters.sessionId);
    }
    if (filters.dateRange) {
      filtered = filtered.filter(t =>
        t.timestamp >= filters.dateRange!.start &&
        t.timestamp <= filters.dateRange!.end
      );
    }
    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(t =>
        filters.tags!.some(tag => t.metadata.tags.includes(tag))
      );
    }
    if (filters.category) {
      filtered = filtered.filter(t => t.metadata.category === filters.category);
    }
  }

  return {
    results: filtered.map(t => ({
      id: t.id,
      timestamp: t.timestamp,
      sessionId: t.sessionId,
      prompt: t.prompt.raw,
      result: t.result.output,
      tags: t.metadata.tags,
      category: t.metadata.category,
    })),
    total: filtered.length,
    confidence: ragResult.confidence,
  };
}

/**
 * Get transaction history
 */
export async function handleGetHistory(args: {
  limit?: number;
  offset?: number;
  sessionId?: string;
}) {
  let transactions;

  if (args.sessionId) {
    transactions = storage.getTransactionsBySession(args.sessionId, args.limit || 50);
  } else {
    // Get all transactions and paginate
    transactions = storage.getTransactionsByDateRange(
      0,
      Date.now(),
      args.limit || 50,
      args.offset || 0
    );
  }

  return {
    transactions: transactions.map(t => ({
      id: t.id,
      timestamp: t.timestamp,
      sessionId: t.sessionId,
      prompt: t.prompt.raw,
      promptType: t.prompt.type,
      success: t.result.success,
      duration: t.result.duration,
      toolsUsed: t.result.toolsUsed,
      tags: t.metadata.tags,
      category: t.metadata.category,
    })),
    total: transactions.length,
  };
}

/**
 * Index local codebase for semantic search
 */
export async function handleIndexCodebase(args: {
  rootPath: string;
  incremental?: boolean;
}) {
  try {
    const indexer = createFileIndexer({
      rootPath: args.rootPath
    });

    let result;
    if (args.incremental) {
      result = await indexer.incrementalIndex();
    } else {
      const files = await indexer.indexCodebase();
      result = {
        indexed: files.length,
        skipped: 0,
        failed: 0
      };
    }

    const stats = await indexer.getStats();

    return {
      success: true,
      result,
      stats: {
        totalFiles: stats.totalFiles,
        totalChunks: stats.totalChunks,
        lastIndexRun: stats.lastIndexRun
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Search indexed code
 */
export async function handleSearchCode(args: {
  query: string;
  rootPath: string;
  limit?: number;
}) {
  try {
    const indexer = createFileIndexer({
      rootPath: args.rootPath
    });

    const results = await indexer.searchCode(args.query, args.limit || 10);

    return {
      success: true,
      results,
      total: results.length
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      results: [],
      total: 0
    };
  }
}

/**
 * Get RAG engine statistics
 */
export async function handleGetStats() {
  try {
    const ragStats = await rag.getStats();

    return {
      success: true,
      stats: ragStats
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
