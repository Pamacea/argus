# ARGUS - Complete API Documentation

**Version:** 0.5.12 | **Last Updated:** 2026-02-24

---

## Table of Contents

- [Overview](#overview)
- [MCP Tools](#mcp-tools)
  - [argus__check_hooks](#argus__check_hooks)
  - [argus__save_transaction](#argus__save_transaction)
  - [argus__search_memory](#argus__search_memory)
  - [argus__get_history](#argus__get_history)
  - [argus__index_codebase](#argus__index_codebase)
  - [argus__search_code](#argus__search_code)
  - [argus__get_stats](#argus__get_stats)
- [Data Types](#data-types)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## Overview

ARGUS provides 7 MCP tools for context-aware memory management in Claude Code. All tools follow a consistent pattern:

- **Request-Response:** JSON-based input/output
- **Error Handling:** Graceful degradation with fallback mechanisms
- **Async:** All operations are asynchronous
- **Idempotent:** Safe to retry operations

---

## MCP Tools

### argus__check_hooks

**MANDATORY** before using `Explore` or `CreateTeam` tools. This tool enforces consultation of RAG memory, file indexes, and documentation before exploratory actions.

**WHY THIS EXISTS:**
- Prevents duplicate work by finding similar past operations
- Ensures consistent patterns across the codebase
- Enforces documentation and constraint awareness
- Reduces context-switching overhead

**Parameters:**

```typescript
{
  // Required: The user's request or task description
  prompt: string;

  // Optional: Name of the tool being used (e.g., "Explore", "Task")
  toolName?: string;

  // Optional: Execution context
  context?: {
    cwd: string;           // Current working directory
    platform: string;      // Operating system (win32, darwin, linux)
  };
}
```

**Returns:**

```typescript
{
  // Relevant hooks that match the query
  hooks: Array<{
    id: string;
    name: string;
    description: string;
    documentation: string;        // Summary of what the hook does
    examples: string[];           // Usage examples
  }>;

  // Similar past transactions with solutions
  relevantTransactions: Array<{
    id: string;
    timestamp: number;            // Unix timestamp
    prompt: string;               // Original user prompt
    result: string;               // What was done/output
  }>;

  // Confidence score (0-1) of the matches
  confidence: number;
}
```

**Example Usage:**

```typescript
// Before exploring the auth module
const result = await argus__check_hooks({
  prompt: "Explore the authentication module to understand JWT implementation",
  toolName: "Explore",
  context: {
    cwd: "/Users/yanis/Projects/myapp",
    platform: "darwin"
  }
});

// Result might contain:
// - Past explorations of auth modules
// - JWT implementation patterns
// - Relevant documentation about authentication
```

**When to Call:**
- ✅ Before using `Explore` tool
- ✅ Before using `Task` tool with subagent_type
- ✅ Before using `CreateTeam` tool
- ❌ Not needed for Read, Edit, Write operations

---

### argus__save_transaction

Saves a completed transaction to semantic memory for future retrieval. This is the primary way ARGUS learns from your actions.

**WHY THIS EXISTS:**
- Creates a knowledge base of past solutions
- Enables semantic search across all work
- Tracks patterns and decisions over time
- Provides context for future similar tasks

**Parameters:**

```typescript
{
  // Required: The original prompt
  prompt: string;

  // Required: Type of prompt
  promptType: 'user' | 'tool' | 'system';

  // Required: Execution context
  context: {
    cwd: string;                    // Working directory
    platform: string;               // OS platform
    environment?: Record<string, string>;  // Env vars (sanitized)
    toolsAvailable?: string[];      // Tools in session
    files?: Array<{                 // Files involved
      path: string;
      hash?: string;
    }>;
  };

  // Required: Result of the operation
  result: {
    success: boolean;
    output?: string;                // Result output
    error?: string;                 // Error message if failed
    duration?: number;              // Duration in milliseconds
    toolsUsed?: string[];           // Tools used in operation
  };

  // Optional: Semantic metadata
  metadata?: {
    tags?: string[];                // For semantic search
    category?: string;              // Transaction category
    relatedHooks?: string[];        // Related hook IDs
  };
}
```

**Returns:**

```typescript
{
  success: boolean;
  transactionId: string;            // UUID of saved transaction
  timestamp: number;                // Unix timestamp
}
```

**Example Usage:**

```typescript
// After implementing a feature
await argus__save_transaction({
  prompt: "Add JWT refresh token rotation to auth system",
  promptType: "user",
  context: {
    cwd: "/Users/yanis/Projects/myapp",
    platform: "darwin",
    toolsAvailable: ["Read", "Edit", "Bash"],
    files: [
      { path: "src/auth/jwt.ts" },
      { path: "src/auth/refresh.ts" }
    ]
  },
  result: {
    success: true,
    output: "Implemented JWT refresh token rotation with 7-day expiry",
    duration: 15000,
    toolsUsed: ["Edit", "Write"]
  },
  metadata: {
    tags: ["jwt", "auth", "security", "refresh-token"],
    category: "feature_implementation"
  }
});
```

**Best Practices:**
- Include specific tags for semantic search
- Set appropriate category for filtering
- Capture actual duration for performance analysis
- Include all relevant files

---

### argus__search_memory

Performs semantic search across all past transactions using TF-IDF (local) or vector search (Qdrant).

**WHY THIS EXISTS:**
- Find similar past problems and solutions
- Reuse existing patterns instead of reinventing
- Learn from previous decisions and outcomes
- Maintain consistency across the codebase

**Parameters:**

```typescript
{
  // Required: Search query (natural language)
  query: string;

  // Optional: Maximum results (default: 10)
  limit?: number;

  // Optional: Similarity threshold 0-1 (default: 0.5)
  threshold?: number;

  // Optional: Filters
  filters?: {
    sessionId?: string;              // Filter by session
    dateRange?: {
      start: number;                 // Start timestamp
      end: number;                   // End timestamp
    };
    tags?: string[];                 // Filter by tags
    category?: string;               // Filter by category
  };
}
```

**Returns:**

```typescript
{
  results: Array<{
    id: string;
    timestamp: number;
    sessionId: string;
    prompt: string;
    result: string;
    tags: string[];
    category?: string;
  }>;

  total: number;                     // Number of results
  confidence: number;                // Match confidence (0-1)
}
```

**Example Usage:**

```typescript
// Search for how we handled JWT before
const results = await argus__search_memory({
  query: "JWT refresh token implementation authentication security",
  limit: 5,
  threshold: 0.6,
  filters: {
    tags: ["jwt", "auth"],
    dateRange: {
      start: Date.now() - 30 * 24 * 60 * 60 * 1000, // Last 30 days
      end: Date.now()
    }
  }
});

// Results show similar auth implementations with solutions
```

**Search Tips:**
- Use specific technical terms
- Include domain concepts (e.g., "authentication", "database")
- Add context (e.g., "error handling", "performance")
- Use natural language queries

---

### argus__get_history

Retrieves transaction history with pagination. Useful for reviewing recent activity or debugging.

**WHY THIS EXISTS:**
- Audit trail of all operations
- Session-specific history review
- Chronological analysis of work
- Debugging and troubleshooting

**Parameters:**

```typescript
{
  // Optional: Maximum results (default: 50)
  limit?: number;

  // Optional: Pagination offset (default: 0)
  offset?: number;

  // Optional: Filter by session ID
  sessionId?: string;
}
```

**Returns:**

```typescript
{
  transactions: Array<{
    id: string;
    timestamp: number;
    sessionId: string;
    prompt: string;
    promptType: 'user' | 'tool' | 'system';
    success: boolean;
    duration: number;
    toolsUsed: string[];
    tags: string[];
    category?: string;
  }>;

  total: number;                     // Number of transactions
}
```

**Example Usage:**

```typescript
// Get recent transactions
const recent = await argus__get_history({
  limit: 20,
  offset: 0
});

// Get session-specific history
const sessionHistory = await argus__get_history({
  sessionId: "/Users/yanis/Projects/myapp",
  limit: 100
});
```

---

### argus__index_codebase

Indexes local codebase files for semantic search. Scans project directories and creates searchable embeddings.

**WHY THIS EXISTS:**
- Enables code-aware semantic search
- Finds relevant code snippets without grep
- Understands project structure
- Provides context-aware code recommendations

**Parameters:**

```typescript
{
  // Required: Root path of the codebase
  rootPath: string;

  // Optional: Only index changed files (default: false)
  incremental?: boolean;
}
```

**Returns:**

```typescript
{
  success: boolean;
  result?: {
    indexed: number;                 // Files indexed
    skipped: number;                 // Files skipped (unchanged)
    failed: number;                  // Files that failed
  };
  stats?: {
    totalFiles: number;              // Total indexed files
    totalChunks: number;             // Total code chunks
    lastIndexRun: number;            // Last index timestamp
  };
  error?: string;                    // Error message if failed
}
```

**Example Usage:**

```typescript
// Full index of project
const result = await argus__index_codebase({
  rootPath: "/Users/yanis/Projects/myapp",
  incremental: false
});

console.log(`Indexed ${result.result.indexed} files`);

// Incremental index (only changed files)
const update = await argus__index_codebase({
  rootPath: "/Users/yanis/Projects/myapp",
  incremental: true
});
```

**Supported File Types:**
- TypeScript: `.ts`, `.tsx`
- JavaScript: `.js`, `.jsx`, `.cjs`, `.mjs`
- Python: `.py`
- Rust: `.rs`
- Go: `.go`
- Java: `.java`
- Markdown: `.md`
- Config: `.json`, `.yaml`, `.yml`, `.toml`

**Auto-Excluded Directories:**
- `node_modules`, `.git`, `dist`, `build`
- `target`, `.next`, `.vscode`, `.idea`
- `coverage`, `__tests__`, `.venv`, `venv`

---

### argus__search_code

Searches indexed code using semantic search. Returns relevant code snippets with file paths and line numbers.

**WHY THIS EXISTS:**
- Find code by intent, not just keywords
- Discover patterns across the codebase
- Locate implementations without knowing exact file names
- Understand code relationships semantically

**Parameters:**

```typescript
{
  // Required: Search query describing the code
  query: string;

  // Required: Root path of the codebase
  rootPath: string;

  // Optional: Maximum results (default: 10)
  limit?: number;
}
```

**Returns:**

```typescript
{
  success: boolean;
  results: Array<{
    filePath: string;                // Relative file path
    lineRange: string;               // Line range (e.g., "10-50")
    snippet: string;                 // Code snippet preview
    score: number;                   // Relevance score
  }>;
  total: number;
  error?: string;
}
```

**Example Usage:**

```typescript
// Find authentication code
const authCode = await argus__search_code({
  query: "JWT token validation middleware authentication",
  rootPath: "/Users/yanis/Projects/myapp",
  limit: 5
});

// Results might include:
// - src/auth/jwt.ts:10-50
// - src/middleware/auth.ts:5-30
// - src/utils/token.ts:15-45
```

**Search Tips:**
- Describe what the code does, not just keywords
- Include technical concepts (e.g., "middleware", "validation")
- Use domain language (e.g., "authentication", "routing")
- Combine multiple concepts for better results

---

### argus__get_stats

Retrieves ARGUS system statistics including transaction counts, hook counts, and storage information.

**WHY THIS EXISTS:**
- Monitor system health
- Track memory usage
- Verify indexing status
- Debug storage issues

**Parameters:**

```typescript
{} // No parameters required
```

**Returns:**

```typescript
{
  success: boolean;
  stats?: {
    totalTransactions: number;       // Total transactions stored
    totalHooks: number;              // Total hooks available
    usingQdrant: boolean;            // Whether Qdrant is enabled
  };
  error?: string;
}
```

**Example Usage:**

```typescript
const stats = await argus__get_stats();

console.log(`Transactions: ${stats.stats.totalTransactions}`);
console.log(`Hooks: ${stats.stats.totalHooks}`);
console.log(`Qdrant: ${stats.stats.usingQdrant ? 'enabled' : 'disabled'}`);
```

---

## Data Types

### Transaction

```typescript
interface Transaction {
  id: string;                        // UUID
  timestamp: number;                 // Unix timestamp
  sessionId: string;                 // Session identifier (usually cwd)

  prompt: {
    raw: string;                     // Original prompt text
    type: 'user' | 'tool' | 'system';
  };

  context: {
    cwd: string;                     // Working directory
    environment: Record<string, string>;
    platform: string;
    toolsAvailable: string[];
    files: Array<{
      path: string;
      hash?: string;
    }>;
  };

  result: {
    success: boolean;
    output?: string;
    error?: string;
    duration: number;
    toolsUsed?: string[];
  };

  metadata: {
    tags: string[];
    category?: string;
    relatedHooks?: string[];
  };
}
```

### Hook

```typescript
interface Hook {
  id: string;
  name: string;
  description: string;
  version: string;

  triggers: Array<'SessionStart' | 'PreToolUse' | 'PostToolUse' | 'PreResponse' | 'PostResponse'>;

  ragQuery?: string;

  documentation: {
    summary: string;
    examples?: string[];
    bestPractices?: string[];
  };

  validation?: {
    requiredContext?: string[];
    prohibitedPatterns?: string[];
  };

  author: {
    name: string;
    url?: string;
  };

  marketplace: {
    downloads: number;
    rating: number;
    updatedAt: number;
  };
}
```

---

## Error Handling

All ARGUS tools follow consistent error handling:

```typescript
// Success response
{
  success: true,
  data: {...}
}

// Error response
{
  success: false,
  error: "Error description",
  details?: {...}
}
```

### Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `Database not initialized` | SQLite not ready | Wait for initialization |
| `Qdrant not available` | Docker/Qdrant down | System uses local search automatically |
| `Invalid query` | Malformed search query | Check query syntax |
| `Index timeout` | Large codebase | Results partial, retry |
| `Storage full` | Disk space issue | Free up disk space |

---

## Best Practices

### 1. Always Check Hooks

Before exploring or creating teams:

```typescript
// ❌ BAD: Direct exploration
await Explore("auth module");

// ✅ GOOD: Check ARGUS first
await argus__check_hooks({
  prompt: "Explore auth module",
  toolName: "Explore"
});
// Then explore with context
```

### 2. Save Meaningful Transactions

```typescript
// ❌ BAD: Vague transaction
await argus__save_transaction({
  prompt: "Did some stuff",
  promptType: "user",
  context: {...},
  result: { success: true }
});

// ✅ GOOD: Specific transaction
await argus__save_transaction({
  prompt: "Implemented JWT refresh token rotation with 7-day expiry and blacklist support",
  promptType: "user",
  context: {...},
  result: {
    success: true,
    output: "Created refresh.ts with rotation logic",
    duration: 15000
  },
  metadata: {
    tags: ["jwt", "auth", "security", "refresh-token"],
    category: "feature_implementation"
  }
});
```

### 3. Use Semantic Search

```typescript
// ❌ BAD: Keyword search
await argus__search_memory({
  query: "jwt auth"
});

// ✅ GOOD: Semantic query
await argus__search_memory({
  query: "JWT refresh token rotation implementation with blacklist",
  limit: 5,
  filters: {
    tags: ["jwt", "security"]
  }
});
```

### 4. Index Regularly

```typescript
// After significant changes
await argus__index_codebase({
  rootPath: "/Users/yanis/Projects/myapp",
  incremental: true  // Only changed files
});
```

---

## Examples

### Complete Workflow

```typescript
// 1. Check before exploring
const context = await argus__check_hooks({
  prompt: "Add JWT authentication to API",
  toolName: "Explore"
});

// 2. Review relevant past work
if (context.relevantTransactions.length > 0) {
  console.log("Found similar work:");
  context.relevantTransactions.forEach(tx => {
    console.log(`- ${tx.prompt}`);
    console.log(`  Result: ${tx.result}`);
  });
}

// 3. Proceed with implementation
// ... your code here ...

// 4. Save the transaction
await argus__save_transaction({
  prompt: "Add JWT authentication to API",
  promptType: "user",
  context: {
    cwd: process.cwd(),
    platform: process.platform,
    toolsAvailable: ["Read", "Edit", "Write"],
    files: [
      { path: "src/auth/jwt.ts" },
      { path: "src/middleware/auth.ts" }
    ]
  },
  result: {
    success: true,
    output: "Implemented JWT authentication with middleware",
    duration: 25000,
    toolsUsed: ["Edit", "Write", "Bash"]
  },
  metadata: {
    tags: ["jwt", "auth", "middleware", "security"],
    category: "feature_implementation"
  }
});

// 5. Update codebase index
await argus__index_codebase({
  rootPath: process.cwd(),
  incremental: true
});
```

---

**API Documentation v0.5.12 - ARGUS**
