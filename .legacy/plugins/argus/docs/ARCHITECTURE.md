# ARGUS - Architecture Documentation

**Version:** 0.5.12 | **Last Updated:** 2026-02-24

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Component Deep Dive](#component-deep-dive)
- [Data Flow](#data-flow)
- [Storage Layer](#storage-layer)
- [Search Engine](#search-engine)
- [Hooks System](#hooks-system)
- [Concurrency Model](#concurrency-model)
- [Performance Considerations](#performance-considerations)
- [Security Model](#security-model)

---

## Overview

ARGUS (Sentinelle Omnisciente) is a context-aware memory system for Claude Code that enforces consultation of historical context, patterns, and documentation before exploratory or creative actions.

### Design Philosophy

**WHY ARGUS EXISTS:**
- Claude Code sometimes explores without checking existing patterns
- Duplicate implementations violate project conventions
- Context switching between similar tasks is inefficient
- Project knowledge is scattered across files and history

**THE SOLUTION:**
- Intercepts exploratory actions (Explore, CreateTeam)
- Forces consultation of RAG memory before execution
- Auto-captures all edits and commands
- Provides semantic search across all work

### Key Principles

1. **Non-Breaking:** Gracefully degrades if components unavailable
2. **Minimal Overhead:** Async operations don't block Claude
3. **Privacy First:** All data stored locally
4. **Zero Configuration:** Works out of the box

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Claude Code Session                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────┐  │
│  │ SessionStart│───▶│ PreToolUse │───▶│  [Action]  │───▶│PostToolUse│  │
│  │    Hook     │    │    Hook    │    │            │    │   Hook    │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └───────────┘  │
│         │                   │                                  │          │
│         ▼                   ▼                                  ▼          │
│  ┌─────────────┐    ┌─────────────┐                  ┌──────────────┐     │
│  │Initialize   │    │ INTERCEPT   │                  │Queue Result │     │
│  │ARGUS        │    │Explore/Team │                  │For Processing│     │
│  │             │    │Check if     │                  │             │     │
│  │Start Qdrant │    │consulted    │                  │Write Queue  │     │
│  │Start Web    │    │Block if not │                  │             │     │
│  │Start Queue  │    │             │                  │             │     │
│  └─────────────┘    └─────────────┘                  └──────────────┘     │
│         │                   │                                  │          │
│         └───────────────────┴──────────────────────────────────┘          │
│                              │                                            │
│                              ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                       MCP Server (stdio)                          │   │
│  │  ┌────────────────────────────────────────────────────────────┐  │   │
│  │  │                    Tool Handlers                          │  │   │
│  │  │  • argus__check_hooks    • argus__save_transaction          │  │   │
│  │  │  • argus__search_memory   • argus__get_history             │  │   │
│  │  │  • argus__index_codebase  • argus__search_code             │  │   │
│  │  │  • argus__get_stats                                          │  │   │
│  │  └────────────────────────────────────────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                              │                                            │
│                              ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                        ARGUS Core                                   │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐     │  │
│  │  │   Storage    │  │  RAG Engine  │  │    File Indexer      │     │  │
│  │  │   (SQLite)   │  │  (Qdrant/    │  │    (Code Scanning)   │     │  │
│  │  │              │  │   Local)     │  │                      │     │  │
│  │  │ • TX Store   │  │ • Vector S.  │  │ • Walk Directories   │     │  │
│  │  │ • Hook Store │  │ • TF-IDF     │  │ • Chunk Files        │     │  │
│  │  │ • Index Meta │  │ • Embeddings │  │ • Create Embeddings   │     │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      Queue Processor                                │  │
│  │  • Polls ~/.argus/queue/*.jsonl                                    │  │
│  │  • Processes queued items from hooks                               │  │
│  │  • Saves transactions to storage                                   │  │
│  │  • Indexes for RAG                                                 │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

                              External Services

┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐
│   Qdrant     │    │   Docker     │    │   Web Dashboard      │
│  (Optional)  │    │  (Optional)  │    │   http://localhost:  │
│              │    │              │    │   30000              │
│  Vector DB   │    │  Container   │    │                      │
│  Port 6333   │    │  Runtime     │    │  • History           │
│              │    │              │    │  • Stats             │
└──────────────┘    └──────────────┘    │  • API Docs          │
                                         └──────────────────────┘
```

---

## Component Deep Dive

### 1. MCP Server (`mcp/src/index.ts`)

**Purpose:** Implements the Model Context Protocol server that exposes ARGUS tools to Claude Code.

**Key Responsibilities:**
- Tool registration and schema definition
- Request/response handling over stdio
- Error handling and graceful degradation
- Queue processor lifecycle management

**Tool Registration:**
```typescript
const tools = [
  {
    name: 'argus__check_hooks',
    description: 'MANDATORY: Consult RAG before Explore',
    inputSchema: { /* JSON Schema */ }
  },
  // ... 6 more tools
];
```

**Why stdio:**
- Claude Code communicates via stdin/stdout
- Allows bidirectional JSON messaging
- Works across all platforms
- No network overhead

---

### 2. Storage Layer (`mcp/src/storage/database.ts`)

**Purpose:** Provides reliable, persistent storage using SQLite (sql.js for pure JavaScript).

**Key Design Decisions:**

**Why SQLite:**
- ✅ Pure JavaScript (no native dependencies)
- ✅ Single file database (portable)
- ✅ ACID compliant (reliable)
- ✅ In-memory indexing (fast)
- ✅ Works without Docker

**Schema:**

```sql
-- Transactions table
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  prompt_raw TEXT NOT NULL,
  prompt_type TEXT NOT NULL,
  -- ... context fields
  -- ... result fields
  -- ... metadata fields
  embedding BLOB  -- Vector embedding
);

-- Hooks table
CREATE TABLE hooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  -- ... hook fields
  embedding BLOB
);

-- Indexed files table
CREATE TABLE indexed_files (
  path TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  indexed_at INTEGER NOT NULL,
  size INTEGER NOT NULL,
  chunks_count INTEGER DEFAULT 0
);
```

**Persistence Strategy:**
1. **Atomic Writes:** Uses temp file + rename pattern
2. **Auto-Flush:** Saves every 10 seconds if changes pending
3. **Shutdown Hooks:** Forced save on SIGINT/SIGTERM/beforeExit
4. **Embedded Embeddings:** Vectors stored in BLOB columns

**Why This Works:**
- Data survives Claude Code restarts
- No data loss from crashes (atomic writes)
- Fast lookups with indexes
- Supports both local and vector search

---

### 3. RAG Engine (`mcp/src/rag/engine.ts`)

**Purpose:** Provides semantic search capabilities using vector embeddings or local TF-IDF.

**Dual-Mode Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    RAG Engine                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────┐              ┌────────────────┐         │
│  │  Vector Mode   │              │  Local Mode    │         │
│  │  (Qdrant)      │              │  (TF-IDF)      │         │
│  │                │              │                │         │
│  │ • Fast search  │              │ • No Docker    │         │
│  │ • Cosine sim   │──────────────▶│ • Always works │         │
│  │ • Scalable     │  Fallback    │• Simple text   │         │
│  └────────────────┘              └────────────────┘         │
│         │                                                   │
│         │ Primary                                          │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Embedding Generation                       ││
│  │  • OpenAI API (text-embedding-3-small)                 ││
│  │  • Local hash-based (fallback)                         ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Embedding Strategy:**

```typescript
// For transactions
const text = `${tx.prompt.raw}\n${tx.result.output || ''}`;
const embedding = await generateEmbedding(text, options);

// For hooks
const text = `${hook.name}\n${hook.description}\n${hook.documentation.summary}`;
const embedding = await generateEmbedding(text, options);
```

**Search Flow:**
1. Generate embedding for query
2. If Qdrant available: vector search with cosine similarity
3. If Qdrant unavailable: TF-IDF + Jaccard similarity
4. Filter by threshold (default: 0.5)
5. Return sorted results

**Why Fallback Matters:**
- Works offline
- No Docker required
- Faster for small datasets
- Production-ready regardless of environment

---

### 4. File Indexer (`mcp/src/indexer/file-indexer.ts`)

**Purpose:** Scans and indexes project codebases for semantic search.

**Indexing Pipeline:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    File Indexing Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Directory Scan                                              │
│     └─▶ Walk tree (skip node_modules, .git, etc)               │
│     └─▶ Filter by extension (.ts, .js, .py, etc)               │
│     └─▶ Check file size (< 1MB)                                │
│                                                                  │
│  2. File Hashing                                                │
│     └─▶ SHA256(content)                                        │
│     └─▶ Compare with indexed hash                              │
│     └─▶ Skip if unchanged                                      │
│                                                                  │
│  3. Chunking                                                   │
│     └─▶ Split by lines (500 lines/chunk)                       │
│     └─▶ Overlap chunks (50 lines)                              │
│     └─▶ Preserve line numbers                                  │
│                                                                  │
│  4. Transaction Creation                                       │
│     └─▶ Create pseudo-transaction per chunk                    │
│     └─▶ Tag with 'code-index' category                         │
│     └─▶ Include file path and line range                       │
│                                                                  │
│  5. RAG Indexing                                               │
│     └─▶ Generate embedding for chunk                           │
│     └─▶ Store in SQLite                                        │
│     └─▶ Store in Qdrant (if available)                         │
│                                                                  │
│  6. Metadata Storage                                           │
│     └─▶ Save file hash, size, chunk count                      │
│     └─▶ Track last indexed time                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Chunking Strategy:**
- **Chunk Size:** 500 lines (configurable)
- **Overlap:** 50 lines (ensures context continuity)
- **Why:** Preserves context while maintaining searchable granularity

**Incremental Indexing:**
```typescript
// Only re-index changed files
const existing = await storage.getIndexedFile(filePath);
if (existing && existing.hash === currentHash) {
  skip();  // File unchanged
}
```

---

### 5. Queue Processor (`mcp/src/queue-processor.ts`)

**Purpose:** Processes queued items from hooks asynchronously.

**Why Queue Processing:**
- Hooks can't call MCP tools directly (no stdio access)
- Hooks must return quickly (can't block Claude)
- MCP server runs in separate process

**Queue Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      Queue System                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Hooks (Hooks/)              Queue Files          Processor      │
│  ┌─────────────┐             ┌─────────────┐      ┌──────────┐  │
│  │pre-tool-use│             │transactions │      │Poll every│  │
│  │post-tool   │──write JSON▶│.jsonl       │◀─────┤5 seconds │  │
│  │session     │             │prompts.jsonl│      │          │  │
│  └─────────────┘             └─────────────┘      └──────────┘  │
│                                                    │            │
│                                                    ▼            │
│                                          ┌─────────────────┐   │
│                                          │Process Items    │   │
│                                          │• Parse JSON     │   │
│                                          │• Create TX      │   │
│                                          │• Index in RAG   │   │
│                                          │• Clear queue    │   │
│                                          └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Queue Formats:**

**JSONL (preferred):**
```jsonl
{"type":"transaction","timestamp":1234567890,"prompt":"...","context":{...},"result":{...},"metadata":{...}}
{"type":"transaction","timestamp":1234567891,"prompt":"...","context":{...},"result":{...},"metadata":{...}}
```

**JSON (legacy):**
```json
[
  {"type":"transaction",...},
  {"type":"transaction",...}
]
```

**Processing Logic:**
1. Read all items from queue file
2. Parse each line as JSON
3. Convert to transaction format
4. Save via RAG engine
5. Clear queue file
6. Log statistics

**Graceful Shutdown:**
- Processes remaining items before exit
- Uses shutdown hooks (SIGINT, SIGTERM)
- Ensures no data loss

---

## Data Flow

### Complete Request Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Request Flow Diagram                             │
└─────────────────────────────────────────────────────────────────────────┘

1. User Request
   │
   ▼
2. Claude receives request
   │
   ▼
3. PreToolUse Hook (if Explore/CreateTeam)
   │
   ├─▶ Check if argus__check_hooks called recently
   │   │
   │   ├─ NO: Block execution, return instructions
   │   │       to call argus__check_hooks
   │   │
   │   └─ YES: Allow execution to proceed
   │
   ▼
4. Claude calls argus__check_hooks
   │
   ├─▶ MCP Server receives request (stdio)
   │
   ├─▶ RAG Engine searches memory
   │   ├─▶ Generate query embedding
   │   ├─▶ Search Qdrant (if available)
   │   └─▶ Search local index (fallback)
   │
   ├─▶ Storage retrieves hooks
   │
   ├─▶ Return results to Claude
   │
   ▼
5. Claude has context, proceeds with action
   │
   ▼
6. Action executes (Explore, Edit, etc.)
   │
   ▼
7. PostToolUse Hook captures result
   │
   ├─▶ Generate intelligent summary
   ├─▶ Capture git context (if repo)
   ├─▶ Create transaction object
   └─▶ Write to queue file
   │
   ▼
8. Queue Processor (background)
   │
   ├─▶ Poll queue every 5 seconds
   ├─▶ Read queued items
   ├─▶ Create transactions
   ├─▶ Save to SQLite
   ├─▶ Index in RAG
   └─▶ Clear queue
   │
   ▼
9. Data persisted and searchable
```

---

## Hooks System

### Hook Types

**SessionStart Hook** (`hooks/session-start.js`)
- Runs when Claude Code session starts
- Initializes ARGUS services
- Starts Qdrant (if Docker available)
- Starts web dashboard
- Auto-indexes current project

**PreToolUse Hook** (`hooks/pre-tool-use.js`)
- Runs before tool execution
- Intercepts Explore and CreateTeam
- Enforces ARGUS consultation
- Blocks execution if not consulted

**PostToolUse Hook** (`hooks/post-tool-use.js`)
- Runs after tool execution
- Captures tool results
- Queues transactions for processing
- Tracks file modifications

**Stop Hook** (`hooks/stop.js`)
- Runs when Claude Code session ends
- Flushes queue processor
- Persists pending data

### Hook Communication

Hooks communicate via:
1. **Environment Variables:** `ARGUS_TOOL_NAME`, `ARGUS_TOOL_ARGS`
2. **Stdin:** JSON payload with `{ toolName, args, result }`
3. **Queue Files:** Write to `~/.argus/queue/*.jsonl`

---

## Concurrency Model

**Single-Threaded MCP Server:**
- Uses Node.js event loop
- Async/await for I/O operations
- No shared state between requests

**Queue Processing:**
- Background interval (5 seconds)
- Non-blocking
- Resilient to failures

**Database Access:**
- Single SQLite connection (sql.js is in-process)
- Atomic operations
- No locking needed (single process)

---

## Performance Considerations

### Memory Usage

**SQLite Database:**
- All data in memory (sql.js limitation)
- Typical size: 5-10MB for 1000 transactions
- Autosaves to disk periodically

**Vector Embeddings:**
- OpenAI: 1536 dimensions (float32) = 6KB per vector
- Local: 384 dimensions (float32) = 1.5KB per vector
- Stored in SQLite BLOB columns

**Optimizations:**
- Limit search results (default: 10)
- Incremental indexing (only changed files)
- Queue batching (process multiple items)

### Search Performance

**Qdrant (Vector Search):**
- Typical latency: 10-50ms
- Scales to millions of vectors
- HNSW indexing for fast ANN search

**Local (TF-IDF):**
- Typical latency: 50-200ms
- Limited to ~10K documents
- No external dependencies

### Indexing Performance

**Full Index:**
- Typical: 100-500 files per minute
- Timeout: 5 minutes max
- Processes in batches (10 files)

**Incremental Index:**
- Only changed files
- Hash-based comparison
- Usually < 10 seconds

---

## Security Model

### Data Privacy

**Local-Only Storage:**
- All data stored in `~/.argus/`
- No network calls (except optional OpenAI embeddings)
- No telemetry or analytics

**Environment Variables:**
- Sanitized before storage
- Secrets filtered (heuristic: looks for keys, tokens)

**File Access:**
- Only indexes within specified root path
- Respects .gitignore patterns
- Skips sensitive directories

### Sandbox

**MCP Server:**
- Runs in separate process
- Communicates via stdio only
- No file system access (via MCP protocol)

**Hooks:**
- Run with same permissions as Claude Code
- No special privileges

---

## Troubleshooting

### Common Issues

**Database Locked:**
- Single connection limitation
- Ensure only one ARGUS instance running

**Qdrant Connection Failed:**
- Falls back to local search automatically
- Check Docker is running: `docker ps`

**Queue Not Processing:**
- Check queue processor is running
- Verify queue file permissions
- Check logs in `~/.argus/`

**Slow Search:**
- Reduce `limit` parameter
- Use filters to narrow scope
- Consider indexing less frequently

---

**Architecture Documentation v0.5.12 - ARGUS**
