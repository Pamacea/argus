# ARGUS - Sentinelle Omnisciente pour Claude Code

**Version:** 0.5.9 | **License:** MIT

---

## 🎯 What is ARGUS?

ARGUS is a context-aware memory system for Claude Code that forces the AI to consult historical context and technical documentation before taking any exploratory or creative action. It acts as an omniscient sentinel, ensuring that Claude always has complete awareness of your project's patterns, decisions, and constraints.

**Problem Solved:** Claude Code sometimes explores or creates solutions without checking existing code patterns, leading to inconsistent implementations, duplicated work, and violations of project conventions.

**Solution:** ARGUS intercepts `Explore` and `CreateTeam` tool calls, enforces consultation of RAG (Retrieval-Augmented Generation) memory, file indexes, and documentation, then saves all transactions for future reference.

---

## ✨ Key Features (v0.5.9)

### 🎨 Complete Dashboard Redesign
- **New Sidebar Navigation** - Clean left sidebar with icons for all sections
- **Vercel-Inspired Design** - Black/white/gray palette with subtle blue accents
- **No More Cards** - Clean separators and visual hierarchy
- **Enhanced UX** - Better organization and information architecture

### 🔧 New Features
- **Transaction Search** - Search through all transactions by keyword
- **History Pagination** - Browse history 10 items at a time
- **Auto-Refresh** - Dashboard updates every 30 seconds automatically
- **New API Endpoint** - `/api/transactions` for fetching history with pagination

### 📊 Dashboard Sections
- **Overview** - Index statistics at a glance
- **Recent Activity** - Live feed of recent transactions
- **History/Log** - Complete searchable transaction history
- **Memory Engine** - Storage and search engine status
- **MCP Tools** - List of all available MCP tools
- **Server Endpoints** - Server information and process details
- **API Documentation** - Complete API reference

### 🔍 Dual-Mode Semantic Search
- **Local Search (TF-IDF)** - Works without Docker, zero external dependencies
- **Vector Search (Qdrant)** - Advanced semantic search when Docker is available
- **Automatic Fallback** - Seamlessly switches between modes

### 📁 Smart Auto-Indexing
- **Real File Scanning** - Actually walks directories and indexes files
- **Multi-Language** - Supports .js, .ts, .jsx, .tsx, .py, .rs, .go, .java
- **Smart Filtering** - Ignores node_modules, .git, dist, build
- **Persistent Index** - Index data saved between sessions

### 🧠 Intelligent Summaries (NEW in v0.5.9)
- **Human-Readable Descriptions** - Every action gets a clear, contextual summary
- **Task Context Tracking** - Knows WHAT you're working on (feature, bugfix, refactor, etc.)
- **Enhanced Recent Activity** - Shows "Building feature: Modified file.js" instead of "Edit file.js..."
- **Intent Detection** - Automatically infers purpose from user prompts
- **Full Context Memory** - Remembers user intent across multiple actions

**Example Comparisons:**
```
Before: Edit session-start.js: async function...
After:  Building feature: Modified session-start.js

Before: Bash with command="git status"
After:  Working on task: Ran git status

Before: Write install-mcp.js (145 lines)
After:  Setting up: Created install-mcp.js
```

### 🪝 Smart Hooks
- **PreToolUse** - Intercepts Explore and CreateTeam before execution
- **PostToolUse** - Captures Edit/Write operations with detailed tracking
- **SessionStart** - Initializes ARGUS and auto-indexes current project
- **Stop** - Persists state on session shutdown

### 📊 Web Dashboard
- **Real-time Monitoring** at `http://localhost:30000`
- **Indexed Projects** - View all indexed projects with file counts
- **Transaction History** - Complete audit trail
- **API Endpoints** - RESTful API for all data

### 🔧 MCP Integration
- **6 MCP Tools** - Complete toolkit for memory and search
- **Queue System** - Reliable edit/prompt tracking
- **Transaction Storage** - SQLite database with optional Qdrant

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Build the MCP server
npm run build

# Start ARGUS with Claude Code
# ARGUS will automatically initialize on session start
```

**ARGUS starts automatically** when you begin a Claude Code session. No manual activation required.

---

## 🆕 What's New in v0.5.3

### Local Semantic Search
ARGUS now includes a built-in TF-IDF search engine:

**Benefits:**
- ✅ Works without Docker or Qdrant
- ✅ Faster than vector search for simple queries
- ✅ Zero external dependencies
- ✅ Automatic fallback from Qdrant

### Auto-Index Fix
The auto-indexing feature now works correctly:

**What Changed:**
- Actually scans project directories (not just tracking)
- Indexes multiple file types (.js, .ts, .jsx, .tsx, .py, .rs, .go, .java)
- Smart filtering (ignores node_modules, .git, dist, build)
- Creates index files in `~/.argus/` with metadata

### Dashboard Enhancements
New features in the web dashboard:

**Indexed Projects Section:**
- List of all indexed projects
- File counts per project
- Last indexed timestamps
- Full vs incremental indexing status

**New API Endpoint:**
- `GET /api/indexed` - Returns indexed projects data

---

## 🔧 How It Works

### 1. Automatic Initialization
When Claude Code starts, ARGUS initializes:
- Starts the MCP server
- Loads local semantic search index
- Prepares the transaction storage
- Auto-indexes current project (if needed)
- Starts web dashboard

### 2. Pre-Action Interception
Before any `Explore` or `CreateTeam` action:
- ARGUS intercepts the tool call
- Checks if you consulted the memory
- If not, injects instruction to call `argus__check_hooks`

### 3. Context Retrieval
The `argus__check_hooks` tool retrieves:
- Similar past transactions (local TF-IDF or Qdrant vector search)
- Relevant code from indexed projects
- Project patterns and conventions
- Any relevant constraints or decisions

### 4. Action Execution
Claude then executes the original action with full context:
- Awareness of existing patterns
- Knowledge of past solutions
- Understanding of project constraints
- Access to relevant documentation

### 5. Transaction Saving
After action completion:
- `argus__save_transaction` stores the result
- Result is indexed for local and/or vector search
- Files are queued for processing
- History is preserved for future reference

---

## 📊 Web Dashboard

Access the ARGUS dashboard at `http://localhost:30000`:

- **Real-time Stats** - Transaction counts, hook counts, RAG status
- **Transaction History** - Browse all past actions with search
- **Health Monitoring** - Server status, uptime, process info
- **API Documentation** - Complete API reference at `/api/docs`

---

## 🛠️ MCP Tools

### argus__check_hooks
**MANDATORY** before any Explore or CreateTeam action.

```typescript
{
  prompt: string           // The user's request
  toolName: string        // Tool being used (e.g., "Explore")
  context: {
    cwd: string           // Current working directory
    platform: string      // Operating system
  }
}
```

Returns relevant context: similar transactions, code matches, documentation.

### argus__save_transaction
Saves a completed transaction for future reference.

```typescript
{
  prompt: string
  promptType: "user" | "tool" | "system"
  context: { cwd, platform, toolsAvailable, files }
  result: { success, output, error, duration, toolsUsed }
  metadata?: { tags, category }
}
```

### argus__search_memory
Semantic search across transaction history.

```typescript
{
  query: string           // Search query
  limit?: number          // Max results (default: 10)
  filters?: {
    date_from?: timestamp
    date_to?: timestamp
    tags?: string[]
    category?: string
  }
}
```

### argus__get_history
Retrieve transaction history with pagination.

```typescript
{
  limit?: number          // Max results (default: 50)
  offset?: number         // Pagination offset (default: 0)
  sessionId?: string      // Filter by session
}
```

### argus__index_codebase
Index project files for semantic search.

```typescript
{
  rootPath: string        // Project root directory
  incremental?: boolean   // Only index changed files (default: false)
}
```

### argus__get_stats
Get ARGUS system statistics.

Returns: transaction counts, hook counts, Qdrant status.

---

## 📁 Project Structure

```
argus/
├── .claude-plugin/
│   ├── plugin.json          # Plugin manifest
│   └── marketplace.json     # Marketplace metadata
├── plugins/argus/
│   ├── .claude-plugin/
│   │   └── plugin.json      # Sub-plugin manifest
│   ├── hooks/               # Claude Code hooks
│   │   ├── session-start.js
│   │   ├── pre-tool-use.js
│   │   ├── post-tool-use.js
│   │   └── stop.js
│   ├── mcp/                 # MCP Server
│   │   ├── src/
│   │   │   ├── handlers/    # Tool implementations
│   │   │   ├── storage/     # RocksDB wrapper
│   │   │   ├── rag/         # Qdrant integration
│   │   │   └── indexer/     # File scanning
│   │   ├── web/
│   │   │   ├── index.html   # Dashboard UI
│   │   │   └── server.js    # Dashboard server
│   │   └── package.json
│   ├── docs/                # Documentation
│   │   ├── ARCHITECTURE.md
│   │   └── API.md
│   └── package.json
├── CLAUDE.md                # This file
├── CHANGELOG.md             # Version history
└── package.json
```

---

## 🔍 Usage Examples

### Example 1: Exploring Code

**Without ARGUS:**
```
User: "Explore the auth module"
Claude: [Explores without context, might miss patterns]
```

**With ARGUS:**
```
User: "Explore the auth module"
ARGUS: [Intercepts, retrieves past auth explorations, finds patterns]
Claude: [Explores with full context of existing implementations]
```

### Example 2: Creating a Team

**Without ARGUS:**
```
User: "Create a team to refactor the payment system"
Claude: [Creates team without checking past payment work]
```

**With ARGUS:**
```
User: "Create a team to refactor the payment system"
ARGUS: [Retrieves payment history, finds past decisions]
Claude: [Creates team with awareness of payment patterns]
```

### Example 3: Semantic Search

```typescript
// Search for how we implemented JWT refresh tokens
const results = await argus__search_memory({
  query: "JWT refresh token implementation authentication",
  limit: 5
})

// Returns similar transactions with solutions
```

---

## 🎯 Best Practices

### 1. Always Consult ARGUS
Before using Explore or CreateTeam, always call `argus__check_hooks` first.

### 2. Save Transactions
After completing work, call `argus__save_transaction` to preserve context.

### 3. Use Semantic Search
When unsure how something was implemented, use `argus__search_memory`.

### 4. Check the Dashboard
Monitor activity and browse history at `http://localhost:30000`.

### 5. Index Your Codebase
Run `argus__index_codebase` after major changes for up-to-date search.

---

## 🔧 Configuration

ARGUS requires minimal configuration:

- **Qdrant Vector DB** - Automatically started on `http://localhost:6333`
- **RocksDB Storage** - Automatic in `~/.argus/storage`
- **Web Dashboard** - Available at `http://localhost:30000`

### Environment Variables (Optional)

```bash
ARGUS_PORT=30000              # Dashboard port
ARGUS_HOST=localhost          # Dashboard host
ARGUS_QDRANT_URL=http://localhost:6333  # Qdrant URL
ARGUS_STORAGE_PATH=~/.argus/storage     # Storage path
```

---

## 🐛 Troubleshooting

### Dashboard Not Loading
```bash
# Check if the dashboard server is running
curl http://localhost:30000/health

# Restart ARGUS session
```

### Qdrant Connection Failed
```bash
# Ensure Qdrant is running
docker run -p 6333:6333 qdrant/qdrant
```

### No RAG Results
```bash
# Index your codebase
# Call: argus__index_codebase with rootPath
```

---

## 📚 Version History

See **CHANGELOG.md** for detailed version history.

### Current Version: 0.5.9

**Recent Updates:**
- Intelligent summary generation for all tool actions
- Task context tracking across session
- Enhanced Recent Activity with human-readable descriptions
- Intent detection from user prompts
- Pre-prompt hook captures user goals
- Auto-configuration of MCP server on install
- Standalone queue processor for transactions

---

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests to the main repository.

**Repository:** https://github.com/Pamacea/argus

---

## 📄 License

MIT License - see LICENSE file for details.

---

**ARGUS v0.5.9** - Your omniscient sentinel for Claude Code.
