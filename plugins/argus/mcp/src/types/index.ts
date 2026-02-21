/**
 * Core transaction types for ARGUS semantic memory system
 */

/**
 * A single transaction/interaction in the Claude Code session
 */
export interface Transaction {
  id: string;
  timestamp: number;
  sessionId: string;

  // Prompt information
  prompt: {
    raw: string;
    type: 'user' | 'tool' | 'system';
  };

  // Context at the time of the prompt
  context: {
    cwd: string;
    environment: Record<string, string>;
    platform: string;
    toolsAvailable: string[];
    files: {
      path: string;
      hash?: string;
    }[];
  };

  // Result information
  result: {
    success: boolean;
    output?: string;
    error?: string;
    duration: number;
    toolsUsed?: string[];
  };

  // Semantic metadata
  metadata: {
    tags: string[];
    category?: string;
    relatedHooks?: string[];
  };
}

/**
 * Hook definition from the marketplace
 */
export interface Hook {
  id: string;
  name: string;
  description: string;
  version: string;

  // Hook trigger points
  triggers: ('SessionStart' | 'PreToolUse' | 'PostToolUse' | 'PreResponse' | 'PostResponse')[];

  // RAG query to find relevant transactions
  ragQuery?: string;

  // Documentation content
  documentation: {
    summary: string;
    examples?: string[];
    bestPractices?: string[];
  };

  // Validation rules
  validation?: {
    requiredContext?: string[];
    prohibitedPatterns?: string[];
  };

  // Author info
  author: {
    name: string;
    url?: string;
  };

  // Marketplace metadata
  marketplace: {
    downloads: number;
    rating: number;
    updatedAt: number;
  };
}

/**
 * RAG query result
 */
export interface RAGResult {
  hooks: Hook[];
  relevantTransactions: Transaction[];
  confidence: number;
}

/**
 * Search query for semantic memory
 */
export interface SearchQuery {
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
}

/**
 * History query options
 */
export interface HistoryQuery {
  limit?: number;
  offset?: number;
  sessionId?: string;
  dateRange?: {
    start: number;
    end: number;
  };
  orderBy?: 'timestamp' | 'duration';
  order?: 'asc' | 'desc';
}

/**
 * Tool handler context
 */
export interface ToolContext {
  sessionId: string;
  cwd: string;
  environment: Record<string, string>;
}
