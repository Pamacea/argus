# ARGUS - Comprehensive User Guide

**Version:** 0.5.11 | **Last Updated:** 2026-02-23

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [What's New in v0.5.11](#2-whats-new-in-0511)
3. [Installation](#3-installation)
4. [Getting Started](#4-getting-started)
5. [Core Concepts](#5-core-concepts)
6. [MCP Tools Reference](#6-mcp-tools-reference)
7. [Web Dashboard Guide](#7-web-dashboard-guide)
8. [Advanced Usage](#8-advanced-usage)
9. [Troubleshooting](#9-troubleshooting)
10. [Best Practices](#10-best-practices)
11. [Architecture Deep Dive](#11-architecture-deep-dive)

---

## 1. Introduction

### What is ARGUS?

ARGUS (Automatic Retrieval-Guided Understanding System) is a context-aware memory and monitoring system for Claude Code. It acts as an omniscient sentinel that ensures Claude always has complete awareness of your project's patterns, decisions, and constraints before taking any exploratory or creative action.

### Why ARGUS Matters

**The Problem:**
- Claude Code sometimes explores codebases without checking existing patterns
- Duplicate implementations are created
- Project conventions are violated
- Past solutions and decisions are forgotten
- Context is lost between sessions

**The Solution:**
- ARGUS intercepts exploratory actions before execution
- Forces consultation of historical context and documentation
- Provides semantic search across all past transactions (local or vector)
- Maintains a complete audit trail of all actions
- Indexes your codebase for intelligent retrieval
- **NEW in v0.5.11:** Guaranteed transaction persistence across sessions

### Key Benefits

1. **Consistency** - Ensures all code follows existing patterns
2. **Efficiency** - Avoids duplicate work and reinventing solutions
3. **Awareness** - Claude knows about past decisions and constraints
4. **Traceability** - Complete audit trail of all actions
5. **Intelligence** - Semantic search finds relevant past work
6. **Zero Dependencies** - Works without Docker or external databases
7. **Reliability** - Transactions persist safely across sessions (v0.5.11)

---

## 2. What's New in v0.5.11

### 🐛 Critical Fix: Transaction Persistence

**Problem:** Transactions were lost when Claude Code restarted, causing data loss and breaking the memory system.

**Solution:** Complete rewrite of the storage persistence layer with enterprise-grade reliability:

**What Changed:**
- **Atomic Writes** - Uses temporary file + rename pattern to prevent corruption
- **Auto-Flush System** - Automatically saves database every 10 seconds when there are pending changes
- **Shutdown Hooks** - Forces database save on SIGINT, SIGTERM, and beforeExit events
- **Enhanced Logging** - Debug logs show all save operations with transaction counts
- **Error Handling** - Throws errors instead of failing silently

**Technical Implementation:**
```typescript
// Atomic write with temporary file
const tmpPath = this.dbPath + '.tmp';
fs.writeFileSync(tmpPath, buffer);
fs.renameSync(tmpPath, this.dbPath);

// Auto-flush every 10 seconds
setInterval(() => {
  if (this.pendingChanges && this.db) {
    this.saveToFile();
    this.pendingChanges = false;
  }
}, 10000);

// Shutdown hooks
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('beforeExit', shutdown);
```

**Verified Results:**
- ✅ 823+ transactions persisted across sessions
- ✅ Database file: `~/.argus/argus.db` (6+ MB)
- ✅ Zero data loss on Claude Code restart
- ✅ Complete audit trail preserved

**Testing:**
```bash
cd plugins/argus/mcp
node test-persistence.mjs
```

---

## 2.1. What's New in v0.5.3

### 🚀 Local Semantic Search

ARGUS now includes a built-in TF-IDF search engine that works without any external dependencies:

**Features:**
- Text tokenization with stemming
- Term frequency-inverse document frequency scoring
- Cosine similarity matching
- Document highlighting for relevant snippets

**Benefits:**
- No Docker required
- Faster than vector search for simple queries
- Works offline
- Automatic fallback from Qdrant

### 🔧 Auto-Index Fix

The auto-indexing feature now works correctly:

**What Changed:**
- Actually scans project directories (before it only tracked)
- Indexes multiple file types (.js, .ts, .jsx, .tsx, .py, .rs, .go, .java)
- Smart filtering (ignores node_modules, .git, dist, build)
- Creates index files in `~/.argus/` with project metadata

**Result:**
- Projects are automatically indexed when you start a session
- Index information persists between sessions
- Dashboard shows real file counts

### 📊 Dashboard Enhancements

New features in the web dashboard:

**Indexed Projects Section:**
- List of all indexed projects
- File counts per project
- Last indexed timestamps
- Full vs incremental indexing status

**New API Endpoint:**
- `GET /api/indexed` - Returns indexed projects data

---

## 3. Installation

### Prerequisites

- Node.js >= 18.0.0
- Claude Code CLI
- Git (for cloning the repository)
- Docker Desktop (optional, for Qdrant vector search)

### Install ARGUS

```bash
# Clone the repository
git clone https://github.com/Pamacea/argus.git
cd argus

# Install dependencies
npm install

# Build the MCP server
npm run build
```

### Verify Installation

```bash
# Check that the MCP server is built
ls plugins/argus/mcp/dist/

# You should see:
# - index.js (bundled server)
```

---

## 4. Getting Started

### Automatic Startup

ARGUS starts automatically when you begin a Claude Code session. No manual activation is required.

### First Run

When you first run ARGUS:

1. **Session Initialization**
   - ARGUS hook runs automatically
   - MCP server starts on `http://localhost:30000`
   - Qdrant vector database initializes
   - Storage directory is created at `~/.argus/storage`

2. **Initial Indexing**
   - ARGUS scans your project's `/src` and `/docs` directories
   - Files are indexed for semantic search
   - This may take a few seconds for large projects

3. **Dashboard Available**
   - Access the web dashboard at `http://localhost:30000`
   - Monitor real-time stats and browse history

### Basic Usage

```bash
# Start a Claude Code session
claude-code

# ARGUS is now active and monitoring
# Try an exploration:
claude> "Explore the authentication module"

# ARGUS will:
# 1. Intercept the Explore call
# 2. Check if you consulted memory
# 3. Inject instruction to call argus__check_hooks
# 4. Retrieve relevant context
# 5. Allow exploration with full awareness
```

---

## 4. Core Concepts

### The ARGUS Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  User Request: "Explore the auth module"                    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Claude prepares to call Explore tool                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ARGUS PreToolUse Hook Intercepts                            │
│  - Checks: Was argus__check_hooks called?                    │
│  - If NO: Injects instruction to call it first               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Claude calls argus__check_hooks                             │
│  Input: { prompt, toolName: "Explore", context }             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ARGUS MCP Server Processes Request                          │
│  - Searches RAG for similar past transactions                │
│  - Scans indexed code for matches                            │
│  - Retrieves relevant documentation                          │
│  - Identifies constraints and patterns                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ARGUS Returns Context                                       │
│  {                                                            │
│    transaction_id,                                           │
│    rag_results: [{ content, similarity, source }],           │
│    index_matches: [{ file, line, context }],                 │
│    docs_summary,                                             │
│    constraints                                               │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Claude Reviews Context                                      │
│  - Awareness of past implementations                         │
│  - Knowledge of existing patterns                            │
│  - Understanding of constraints                              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Claude Executes Explore with Full Context                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ARGUS PostToolUse Hook Saves Transaction                    │
│  - Calls argus__save_transaction                             │
│  - Stores result for future reference                        │
│  - Indexes new code for RAG                                  │
└─────────────────────────────────────────────────────────────┘
```

### Transaction Model

Every action in ARGUS is recorded as a transaction:

```typescript
Transaction {
  // Identification
  id: string                    // Unique UUID
  timestamp: DateTime           // When the action occurred
  sessionId: string             // Claude Code session ID

  // Input
  user_prompt: string           // Original user request
  promptType: "user" | "tool" | "system"
  toolName: string              // Tool being used
  context: {
    cwd: string                 // Current working directory
    platform: string            // OS platform
    toolsAvailable: string[]    // Available tools
    files: string[]             // Files involved
  }

  // ARGUS Context
  rag_evidence?: [{            // Similar past transactions
    content: string
    similarity: number          // 0-1 score
    source: string              // Transaction ID
  }]
  index_results?: [{           // Code matches
    file: string
    matches: [{ line, context }]
  }]
  docs_consulted?: string[]    // Documentation files

  // Output
  result: {
    success: boolean
    output: string              // Action output
    error?: string              // Error if failed
    duration: number            // Execution time (ms)
    toolsUsed: string[]         // Tools used
  }

  // Metadata
  metadata?: {
    tags?: string[]             // Searchable tags
    category?: string           // Category (e.g., "refactor")
    relatedHooks?: string[]     // Related hook IDs
  }
}
```

### RAG (Retrieval-Augmented Generation)

ARGUS uses semantic search to find relevant past transactions:

- **Vector Embeddings:** Each transaction is converted to a vector
- **Qdrant Database:** Vectors are stored in Qdrant for fast similarity search
- **Semantic Similarity:** Finds transactions that are semantically similar, not just keyword matches
- **Context-Retrieval:** Returns the most relevant past work as context

---

## 5. MCP Tools Reference

### argus__check_hooks

**MANDATORY** before any `Explore` or `CreateTeam` action.

**Purpose:** Retrieves relevant context from RAG, code index, and documentation before taking an action.

**When to Call:**
- Before using the `Explore` tool
- Before using the `CreateTeam` tool
- Before any major code investigation
- When unsure about existing patterns

**Parameters:**
```typescript
{
  prompt: string              // Required: User's request or task description
  toolName: string           // Required: Tool being used (e.g., "Explore", "Task")
  context: {
    cwd: string              // Current working directory
    platform: string         // Operating system (e.g., "win32", "darwin")
  }
}
```

**Returns:**
```typescript
{
  transaction_id: string     // Unique ID for tracking
  rag_results: [{           // Similar past transactions
    content: string          // Transaction content
    similarity: number       // 0-1 similarity score
    source: string           // Transaction ID
  }],
  index_matches: [{         // Code matches from index
    file: string            // File path
    line: number            // Line number
    context: string         // Code context
  }],
  docs_summary: string       // Relevant documentation summary
  constraints: string[]     // Project constraints or patterns
  status: "ready" | "warning" | "error"
}
```

**Example:**
```typescript
// Before exploring the auth module
const context = await argus__check_hooks({
  prompt: "Explore the authentication module to understand how JWT tokens are handled",
  toolName: "Explore",
  context: {
    cwd: "/project",
    platform: "darwin"
  }
})

// Review the context before proceeding
console.log("Found relevant past work:", context.rag_results)
console.log("Code matches:", context.index_matches)
```

---

### argus__save_transaction

**Purpose:** Saves a completed transaction to memory for future reference.

**When to Call:**
- After completing any exploratory action
- After making code changes
- After finishing a task
- Automatically called by PostToolUse hook

**Parameters:**
```typescript
{
  prompt: string              // Required: Original user prompt
  promptType: "user" | "tool" | "system"
  context: {
    cwd: string
    platform: string
    toolsAvailable?: string[]
    files?: string[]
    environment?: object
  }
  result: {
    success: boolean          // Required: Did the action succeed?
    output: string            // Action output or description
    error?: string            // Error message if failed
    duration?: number         // Execution time in milliseconds
    toolsUsed?: string[]      // Tools used during action
  }
  metadata?: {
    tags?: string[]           // Searchable tags (e.g., ["auth", "jwt"])
    category?: string         // Category (e.g., "refactor", "feature")
    relatedHooks?: string[]   // Related hook IDs
  }
}
```

**Returns:**
```typescript
{
  success: boolean
  transaction_id: string
  message: string
}
```

**Example:**
```typescript
// After completing code exploration
await argus__save_transaction({
  prompt: "Explored the auth module",
  promptType: "user",
  context: {
    cwd: "/project",
    platform: "darwin",
    files: ["src/auth/index.ts", "src/auth/jwt.ts"]
  },
  result: {
    success: true,
    output: "Found JWT refresh token implementation in src/auth/jwt.ts",
    duration: 1500,
    toolsUsed: ["Explore", "Read"]
  },
  metadata: {
    tags: ["auth", "jwt", "refresh-token"],
    category: "exploration"
  }
})
```

---

### argus__search_memory

**Purpose:** Semantic search across all past transactions.

**When to Call:**
- Looking for how something was implemented before
- Searching for past decisions or solutions
- Finding relevant examples
- Investigating bugs or issues

**Parameters:**
```typescript
{
  query: string               // Required: Search query (natural language)
  limit?: number              // Max results (default: 10)
  threshold?: number          // Similarity threshold 0-1 (default: 0.5)
  filters?: {
    sessionId?: string        // Filter by session ID
    dateRange?: {
      start: number           // Start timestamp
      end: number             // End timestamp
    }
    tags?: string[]           // Filter by tags
    category?: string         // Filter by category
  }
}
```

**Returns:**
```typescript
[{
  transaction_id: string
  prompt: string
  result: {
    success: boolean
    output: string
  }
  similarity: number          // 0-1 similarity score
  timestamp: string
  metadata: {
    tags?: string[]
    category?: string
  }
}]
```

**Example:**
```typescript
// Search for JWT implementation
const results = await argus__search_memory({
  query: "JWT refresh token implementation authentication flow",
  limit: 5,
  threshold: 0.6
})

// Review results
results.forEach(result => {
  console.log(`Similarity: ${result.similarity}`)
  console.log(`Output: ${result.result.output}`)
})
```

---

### argus__get_history

**Purpose:** Retrieve transaction history with pagination.

**When to Call:**
- Browsing recent activity
- Reviewing session history
- Auditing past actions
- Finding a specific transaction

**Parameters:**
```typescript
{
  limit?: number              // Max results (default: 50)
  offset?: number             // Pagination offset (default: 0)
  sessionId?: string          // Filter by session ID
}
```

**Returns:**
```typescript
[{
  id: string
  timestamp: string
  prompt: string
  toolName?: string
  result: {
    success: boolean
    output: string
    error?: string
  }
  metadata?: {
    tags?: string[]
    category?: string
  }
}]
```

**Example:**
```typescript
// Get recent transactions
const recent = await argus__get_history({
  limit: 20,
  offset: 0
})

// Get transactions for specific session
const sessionHistory = await argus__get_history({
  sessionId: "session-123",
  limit: 100
})
```

---

### argus__index_codebase

**Purpose:** Index project files for semantic search.

**When to Call:**
- After major code changes
- When first setting up ARGUS
- Periodically to keep index fresh
- After adding new documentation

**Parameters:**
```typescript
{
  rootPath: string            // Required: Project root directory
  incremental?: boolean       // Only index changed files (default: false)
}
```

**Returns:**
```typescript
{
  success: boolean
  filesIndexed: number
  duration: number            // Indexing time in milliseconds
  message: string
}
```

**Example:**
```typescript
// Full index of project
const result = await argus__index_codebase({
  rootPath: "/project",
  incremental: false
})

console.log(`Indexed ${result.filesIndexed} files in ${result.duration}ms`)
```

---

### argus__get_stats

**Purpose:** Get ARGUS system statistics.

**When to Call:**
- Monitoring system health
- Checking transaction counts
- Verifying RAG status
- Debugging issues

**Parameters:** None

**Returns:**
```typescript
{
  transactions: {
    total: number
    bySession: { [sessionId]: number }
    byTool: { [toolName]: number }
  }
  hooks: {
    total: number
    byType: { [hookType]: number }
  }
  rag: {
    enabled: boolean
    qdrantConnected: boolean
    collections: number
    vectors: number
  }
}
```

**Example:**
```typescript
// Check system stats
const stats = await argus__get_stats()

console.log(`Total transactions: ${stats.transactions.total}`)
console.log(`RAG enabled: ${stats.rag.enabled}`)
console.log(`Vectors stored: ${stats.rag.vectors}`)
```

---

## 6. Web Dashboard Guide

### Access the Dashboard

Open your browser and navigate to:
```
http://localhost:30000
```

### Dashboard Features

#### 1. Overview Panel

**Real-time Statistics:**
- Total transactions
- Total hooks triggered
- RAG status (enabled/disabled)
- Qdrant connection status

**Server Information:**
- Host and port
- Server uptime
- Process ID
- Platform
- Node.js version

#### 2. Recent Activity

**Transaction Stream:**
- View recent transactions in real-time
- See transaction ID, timestamp, and prompt
- Color-coded by status (success/error)

#### 3. Search & Browse

**Transaction Browser:**
- Paginated list of all transactions
- Search by keyword
- Filter by session ID
- Click to view details

#### 4. API Documentation

**Complete API Reference:**
- Available at `/api/docs`
- All endpoints documented
- Request/response formats
- Usage examples

### Dashboard Endpoints

#### GET `/health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-02-23T10:00:00Z",
  "uptime": 3600,
  "pid": 12345
}
```

#### GET `/api/status`

Server status and information.

**Response:**
```json
{
  "name": "ARGUS Web Dashboard",
  "version": "0.5.2",
  "description": "Sentinelle omnisciente pour Claude Code",
  "server": {
    "host": "localhost",
    "port": 30000,
    "uptime": 3600,
    "pid": 12345,
    "platform": "darwin",
    "nodeVersion": "v18.0.0"
  },
  "endpoints": {
    "health": "http://localhost:30000/health",
    "status": "http://localhost:30000/api/status",
    "docs": "http://localhost:30000/api/docs"
  }
}
```

#### GET `/api/stats`

ARGUS system statistics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "transactions": {
      "total": 150,
      "bySession": {
        "session-1": 50,
        "session-2": 100
      },
      "byTool": {
        "Explore": 80,
        "Task": 70
      }
    },
    "hooks": {
      "total": 300,
      "byType": {
        "PreToolUse": 150,
        "PostToolUse": 150
      }
    },
    "rag": {
      "enabled": true,
      "qdrantConnected": true,
      "collections": 1,
      "vectors": 150
    }
  }
}
```

---

## 7. Advanced Usage

### Custom Tags and Categories

Organize transactions with custom metadata:

```typescript
await argus__save_transaction({
  prompt: "Implemented rate limiting for API",
  promptType: "user",
  context: { cwd: "/project", platform: "darwin" },
  result: { success: true, output: "Rate limiting implemented" },
  metadata: {
    tags: ["api", "rate-limiting", "security", "performance"],
    category: "feature"
  }
})
```

**Tag Categories:**
- **Feature:** New functionality
- **Bugfix:** Fixed an issue
- **Refactor:** Code restructuring
- **Performance:** Optimization work
- **Security:** Security improvements
- **Documentation:** Documentation updates

### Session-Based Analysis

Track work across sessions:

```typescript
// Get all transactions from current session
const sessionHistory = await argus__get_history({
  sessionId: currentSessionId,
  limit: 1000
})

// Analyze session patterns
const categories = {}
sessionHistory.forEach(tx => {
  const cat = tx.metadata?.category || "uncategorized"
  categories[cat] = (categories[cat] || 0) + 1
})

console.log("Session breakdown:", categories)
```

### Semantic Search Queries

Craft effective search queries:

**Good Queries:**
- "JWT refresh token implementation"
- "Error handling in async functions"
- "Database connection pooling patterns"
- "User authentication flow"

**Poor Queries:**
- "auth" (too generic)
- "function" (too generic)
- "code" (meaningless)

### Combining Search and Index

Use search + index for comprehensive context:

```typescript
// 1. Check hooks for RAG results
const hooksResult = await argus__check_hooks({
  prompt: "Implement password reset flow",
  toolName: "Task",
  context: { cwd: "/project", platform: "darwin" }
})

// 2. Also search memory for patterns
const searchResults = await argus__search_memory({
  query: "password reset email notification user",
  limit: 10
})

// 3. Combine insights
const allResults = [
  ...hooksResult.rag_results,
  ...searchResults
]
```

---

## 8. Troubleshooting

### Common Issues

#### Dashboard Not Loading

**Symptoms:** Browser shows "Connection refused" or infinite loading.

**Solutions:**
1. Check if ARGUS MCP server is running:
   ```bash
   curl http://localhost:30000/health
   ```

2. Check if port is in use:
   ```bash
   # Windows
   netstat -ano | findstr :30000

   # macOS/Linux
   lsof -i :30000
   ```

3. Restart Claude Code session to reinitialize ARGUS.

#### No RAG Results

**Symptoms:** `argus__check_hooks` returns empty `rag_results`.

**Solutions:**
1. Index your codebase:
   ```typescript
   await argus__index_codebase({
     rootPath: "/path/to/project",
     incremental: false
   })
   ```

2. Check Qdrant connection:
   ```bash
   curl http://localhost:6333/collections
   ```

3. Start Qdrant if not running:
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```

#### Port Already in Use

**Symptoms:** "Port 30000 is already in use" error.

**Solutions:**
1. Find and kill the process:
   ```bash
   # Windows
   netstat -ano | findstr :30000
   taskkill /PID <PID> /F

   # macOS/Linux
   lsof -ti :30000 | xargs kill
   ```

2. Or use a different port via environment variable:
   ```bash
   export ARGUS_PORT=30001
   ```

#### Transactions Not Saving

**Symptoms:** Transactions not appearing in history.

**Solutions:**
1. Check storage directory permissions:
   ```bash
   ls -la ~/.argus/storage
   ```

2. Verify storage is not corrupted:
   ```bash
   rm -rf ~/.argus/storage
   # Restart session to recreate
   ```

### Debug Mode

Enable debug logging:

```bash
# Set environment variable
export ARGUS_DEBUG=true

# Restart Claude Code
```

Check logs in:
```bash
~/.argus/logs/
```

---

## 9. Best Practices

### 1. Always Consult ARGUS

Before any exploratory action:
```typescript
// GOOD
const context = await argus__check_hooks({
  prompt: "Explore the payment module",
  toolName: "Explore",
  context: { cwd, platform }
})
// Review context, then proceed

// BAD
// Directly explore without consultation
```

### 2. Save Meaningful Transactions

```typescript
// GOOD - Detailed result
await argus__save_transaction({
  prompt: "Implemented JWT refresh token rotation",
  promptType: "user",
  context: { cwd, platform, files: ["src/auth/jwt.ts"] },
  result: {
    success: true,
    output: "Implemented refresh token rotation with 7-day expiration",
    duration: 1800,
    toolsUsed: ["Edit", "Bash"]
  },
  metadata: {
    tags: ["auth", "jwt", "security"],
    category: "feature"
  }
})

// BAD - Vague result
await argus__save_transaction({
  prompt: "Did some stuff",
  // ... minimal info
})
```

### 3. Use Descriptive Tags

```typescript
// GOOD - Specific tags
metadata: {
  tags: ["auth", "jwt", "refresh-token", "security"]
}

// BAD - Generic tags
metadata: {
  tags: ["code", "feature", "work"]
}
```

### 4. Craft Effective Search Queries

```typescript
// GOOD - Specific, contextual
query: "JWT refresh token rotation implementation auth security"

// BAD - Too generic
query: "auth code"
```

### 5. Index Regularly

```typescript
// After major changes
await argus__index_codebase({
  rootPath: "/project",
  incremental: false  // Full reindex
})

// After small changes
await argus__index_codebase({
  rootPath: "/project",
  incremental: true  // Only changed files
})
```

### 6. Review Dashboard Regularly

- Check dashboard at `http://localhost:30000` weekly
- Review recent transactions for patterns
- Identify frequently searched topics
- Look for areas needing documentation

### 7. Use Categories Consistently

Define standard categories for your project:
- `feature` - New functionality
- `bugfix` - Bug fixes
- `refactor` - Code restructuring
- `performance` - Optimizations
- `security` - Security improvements
- `documentation` - Doc updates
- `testing` - Test additions/changes

---

## 10. Architecture Deep Dive

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ SessionStart│    │ PreToolUse  │    │PostToolUse  │     │
│  │    Hook     │───▶│    Hook     │───▶│    Hook     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                   │                   │             │
│         ▼                   ▼                   ▼             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              ARGUS MCP Server                         │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  Tool Handlers                                  │  │   │
│  │  │  - check_hooks                                 │  │   │
│  │  │  - save_transaction                            │  │   │
│  │  │  - search_memory                               │  │   │
│  │  │  - get_history                                 │  │   │
│  │  │  - index_codebase                              │  │   │
│  │  │  - get_stats                                   │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │                                                         │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │   │
│  │  │   Storage    │  │     RAG      │  │   Indexer   │ │   │
│  │  │   (RocksDB)  │  │   (Qdrant)   │  │  (Scanner)  │ │   │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Web Dashboard (Express.js)                   │   │
│  │         http://localhost:30000                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Storage Layer (RocksDB)

**Purpose:** Fast, persistent key-value storage for transactions.

**Data Stored:**
- Transaction records
- Session metadata
- Hook execution logs

**Location:** `~/.argus/storage/`

**Benefits:**
- Extremely fast reads/writes
- Embedded (no separate database process)
- Scales to millions of transactions

### RAG Layer (Qdrant)

**Purpose:** Vector similarity search for semantic retrieval.

**How It Works:**
1. Each transaction is embedded into a vector
2. Vectors are stored in Qdrant collection
3. Search queries are also embedded
4. Qdrant finds nearest vectors by cosine similarity

**Benefits:**
- Finds semantically similar transactions
- Not limited to keyword matching
- Fast similarity search at scale

### Indexer (File Scanner)

**Purpose:** Scan and index project code for context retrieval.

**Directories Scanned:**
- `/src` - Source code
- `/docs` - Documentation

**Languages Supported:**
- TypeScript/JavaScript
- Python
- Rust
- Go
- Java
- And more (via tree-sitter)

**Benefits:**
- Find relevant code snippets
- Understand code structure
- Locate implementations

### Hooks Integration

**SessionStart Hook:**
- Initializes ARGUS MCP server
- Starts web dashboard
- Loads RAG index
- Prepares storage

**PreToolUse Hook:**
- Intercepts Explore and CreateTeam
- Checks if memory was consulted
- Injects instruction if not
- Blocks action until compliance

**PostToolUse Hook:**
- Saves transaction to storage
- Indexes result for RAG
- Updates code index if needed
- Records tool usage

**Stop Hook:**
- Graceful shutdown
- Saves pending transactions
- Closes connections
- Cleanup

---

## Conclusion

ARGUS is a powerful context-aware memory system that transforms how Claude Code interacts with your project. By forcing consultation of historical context and maintaining a complete audit trail, ARGUS ensures consistency, efficiency, and intelligence in every action.

### Key Takeaways

1. **Always consult ARGUS** before exploratory actions
2. **Save detailed transactions** for future reference
3. **Use semantic search** to find relevant past work
4. **Monitor the dashboard** for insights and patterns
5. **Index regularly** to keep search fresh

### Support

- **GitHub:** https://github.com/Pamacea/argus
- **Issues:** Report bugs and feature requests
- **Documentation:** See `CLAUDE.md` for quick reference

---

**ARGUS v0.5.2** - Your omniscient sentinel for Claude Code.

*Last Updated: 2025-02-23*
