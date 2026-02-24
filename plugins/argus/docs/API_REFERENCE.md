# ARGUS - API Quick Reference

**Version:** 0.5.12 | **Last Updated:** 2026-02-24

---

## MCP Tools Quick Reference

### Tool Summary Table

| Tool | Purpose | Required | When to Use |
|------|---------|----------|-------------|
| `argus__check_hooks` | Consult memory before exploring | **YES** | Before Explore/CreateTeam |
| `argus__save_transaction` | Save completed action | Recommended | After significant work |
| `argus__search_memory` | Search past transactions | Optional | Finding similar solutions |
| `argus__get_history` | Get transaction history | Optional | Reviewing recent work |
| `argus__index_codebase` | Index project files | Optional | After major changes |
| `argus__search_code` | Search indexed code | Optional | Finding code patterns |
| `argus__get_stats` | Get system statistics | Optional | Monitoring health |

---

## Tool Reference Cards

### argus__check_hooks

**MANDATORY** before Explore or CreateTeam

```typescript
// Input
{
  prompt: string;           // Required: Task description
  toolName?: string;        // Tool being used
  context?: {
    cwd: string;            // Working directory
    platform: string;       // OS platform
  };
}

// Output
{
  hooks: Array<{
    id: string;
    name: string;
    description: string;
    documentation: string;
    examples: string[];
  }>;
  relevantTransactions: Array<{
    id: string;
    timestamp: number;
    prompt: string;
    result: string;
  }>;
  confidence: number;       // 0-1
}

// Example
await argus__check_hooks({
  prompt: "Implement JWT authentication with refresh tokens",
  toolName: "Explore",
  context: {
    cwd: "/Users/yanis/Projects/myapp",
    platform: "darwin"
  }
});
```

---

### argus__save_transaction

```typescript
// Input
{
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
}

// Output
{
  success: boolean;
  transactionId: string;
  timestamp: number;
}

// Example
await argus__save_transaction({
  prompt: "Add JWT refresh token rotation",
  promptType: "user",
  context: {
    cwd: process.cwd(),
    platform: process.platform,
    toolsAvailable: ["Read", "Edit", "Write"],
    files: [{ path: "src/auth/refresh.ts" }]
  },
  result: {
    success: true,
    output: "Implemented 7-day expiry with blacklist",
    duration: 15000,
    toolsUsed: ["Edit", "Write"]
  },
  metadata: {
    tags: ["jwt", "auth", "security"],
    category: "feature_implementation"
  }
});
```

---

### argus__search_memory

```typescript
// Input
{
  query: string;
  limit?: number;           // Default: 10
  threshold?: number;       // Default: 0.5
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

// Output
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
  total: number;
  confidence: number;
}

// Example
await argus__search_memory({
  query: "JWT refresh token rotation implementation",
  limit: 5,
  threshold: 0.6,
  filters: {
    tags: ["jwt", "auth"],
    dateRange: {
      start: Date.now() - 30 * 24 * 60 * 60 * 1000,
      end: Date.now()
    }
  }
});
```

---

### argus__get_history

```typescript
// Input
{
  limit?: number;           // Default: 50
  offset?: number;          // Default: 0
  sessionId?: string;
}

// Output
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
  total: number;
}

// Example
await argus__get_history({
  limit: 20,
  sessionId: "/Users/yanis/Projects/myapp"
});
```

---

### argus__index_codebase

```typescript
// Input
{
  rootPath: string;
  incremental?: boolean;    // Default: false
}

// Output
{
  success: boolean;
  result?: {
    indexed: number;
    skipped: number;
    failed: number;
  };
  stats?: {
    totalFiles: number;
    totalChunks: number;
    lastIndexRun: number;
  };
  error?: string;
}

// Example
await argus__index_codebase({
  rootPath: "/Users/yanis/Projects/myapp",
  incremental: true
});
```

---

### argus__search_code

```typescript
// Input
{
  query: string;
  rootPath: string;
  limit?: number;           // Default: 10
}

// Output
{
  success: boolean;
  results: Array<{
    filePath: string;
    lineRange: string;       // "10-50"
    snippet: string;
    score: number;
  }>;
  total: number;
  error?: string;
}

// Example
await argus__search_code({
  query: "JWT token validation middleware",
  rootPath: "/Users/yanis/Projects/myapp",
  limit: 5
});
```

---

### argus__get_stats

```typescript
// Input
{}  // No parameters

// Output
{
  success: boolean;
  stats?: {
    totalTransactions: number;
    totalHooks: number;
    usingQdrant: boolean;
  };
  error?: string;
}

// Example
await argus__get_stats();
```

---

## Common Workflows

### Before Exploring

```typescript
// 1. Check hooks (MANDATORY)
const context = await argus__check_hooks({
  prompt: "Explore auth module",
  toolName: "Explore"
});

// 2. Review results
context.relevantTransactions.forEach(tx => {
  console.log(`Past work: ${tx.prompt}`);
  console.log(`Solution: ${tx.result}`);
});

// 3. Proceed with exploration
```

### After Completing Work

```typescript
// 1. Save transaction
await argus__save_transaction({
  prompt: "Implemented feature X",
  promptType: "user",
  context: {
    cwd: process.cwd(),
    platform: process.platform
  },
  result: {
    success: true,
    output: "Description of what was done",
    duration: performance.now() - startTime
  },
  metadata: {
    tags: ["feature", "category"],
    category: "implementation"
  }
});

// 2. Update index if files changed
await argus__index_codebase({
  rootPath: process.cwd(),
  incremental: true
});
```

### Finding Similar Solutions

```typescript
// Search for similar past work
const results = await argus__search_memory({
  query: "Problem description here",
  limit: 5,
  filters: {
    tags: ["relevant-tag"],
    category: "relevant-category"
  }
});

// Use results to guide implementation
results.results.forEach(tx => {
  console.log(`Similar: ${tx.prompt}`);
  console.log(`Result: ${tx.result}`);
});
```

---

## Tags Reference

### Common Tags

| Tag Category | Tags | Usage |
|--------------|------|-------|
| **Language** | `typescript`, `javascript`, `python`, `rust` | Code language |
| **Framework** | `react`, `nextjs`, `nestjs`, `express` | Framework used |
| **Task Type** | `feature`, `bugfix`, `refactor`, `test` | Type of work |
| **Domain** | `auth`, `database`, `api`, `ui` | Problem domain |
| **Security** | `jwt`, `oauth`, `encryption`, `validation` | Security topics |

### Categories

| Category | When to Use |
|----------|-------------|
| `feature_implementation` | Adding new features |
| `bug_fix` | Fixing bugs |
| `refactoring` | Restructuring code |
| `testing` | Writing tests |
| `documentation` | Writing docs |
| `performance` | Optimizing performance |
| `security` | Security improvements |
| `file_modification` | Editing files |
| `tool_execution` | Running commands |

---

## Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `ARGUS_001` | RAG not initialized | Restart Claude Code |
| `ARGUS_002` | Storage unavailable | Check disk space |
| `ARGUS_003` | No RAG results | Lower threshold |
| `ARGUS_004` | Invalid action type | Use valid action |
| `ARGUS_005` | Hooks not consulted | Call check_hooks |
| `ARGUS_006` | Database locked | Restart Claude Code |
| `ARGUS_007` | Index timeout | Use incremental |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ARGUS_DATA_DIR` | `~/.argus` | Data directory |
| `ARGUS_WEB_PORT` | `30000` | Web dashboard port |
| `ARGUS_WEB_HOST` | `localhost` | Web dashboard host |
| `ARGUS_DEBUG` | `0` | Enable debug logging |
| `ARGUS_QDRANT_URL` | `http://localhost:6333` | Qdrant URL |

### File Locations

| File | Location |
|------|----------|
| Database | `~/.argus/argus.db` |
| Queue | `~/.argus/queue/*.jsonl` |
| Stats | `~/.argus/stats.json` |
| Index | `~/.argus/index-*.json` |

---

## Performance Tips

1. **Use incremental indexing** for large projects
2. **Limit search results** for faster queries
3. **Filter by date** to reduce search space
4. **Tag transactions** for better filtering
5. **Use local search** if Qdrant is slow

---

**API Quick Reference v0.5.12 - ARGUS**
