# Changelog

All notable changes to ARGUS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.8] - 2026-02-23

### 🔧 Maintenance

#### Cache Cleanup & System Reset
- **Cache Directory Cleanup** - Removed stale cache files for fresh start
- **State Reset** - Clean ARGUS state after cache deletion
- **Documentation Refresh** - Updated all documentation to reflect current state

#### Testing & Verification
- **Read/Write Tests** - Verified all file operations working correctly
- **Hook Validation** - Confirmed all hooks functioning properly
- **MCP Tools Verification** - All MCP tools operational

---

## [0.5.7] - 2026-02-23

### 🐛 Bug Fixes

#### Critical Hook Fixes
- **Fixed stdin parsing** - Hooks now correctly read tool data from stdin JSON instead of missing env vars
- **Tool name capture** - Transactions now show actual tool names (Edit, Bash, etc.) instead of "unknown"
- **Variable scope fix** - Fixed "const changeSummary" assignment error in post-edit hook

#### Hook Updates
- **post-tool-use.js** - Now reads `{ toolName, args, result }` from stdin
- **pre-tool-use.js** - Now reads `{ toolName, args }` from stdin
- **post-edit.js** - Updated for stdin JSON parsing with fallback to env vars
- **post-response.js** - Updated for stdin JSON parsing
- **pre-prompt.js** - Updated for stdin JSON parsing

### 🔧 Technical Details

All hooks now support the Claude Code hooks specification:
- Primary data source: stdin JSON (e.g., `{"toolName":"Edit","args":{...},"result":{...}}`)
- Fallback: ARGUS_TOOL_* environment variables for backward compatibility
- Better error handling with try-catch for JSON parsing

---

## [0.5.6] - 2026-02-23

### 🎨 UI/UX Improvements

#### Complete Dashboard Redesign
- **New navigation** : Left sidebar with icons for all sections
- **Vercel-inspired design** : Black/white/gray color palette with subtle blue accents
- **No more cards** : Clean separators instead of card-based layout
- **Better organization** : Sections clearly separated with visual hierarchy

#### New Sections
- **Overview** : Dashboard with index statistics at a glance
- **Recent Activity** : Live feed of recent transactions
- **History/Log** : Complete transaction history with pagination
- **Memory Engine** : Detailed storage and search engine status
- **MCP Tools** : List of all available MCP tools
- **Server Endpoints** : Server information and process details
- **API Documentation** : Complete API reference

#### Enhanced Features
- **Transaction search** : Search through all transactions by keyword
- **Pagination** : Browse history with page navigation (10 per page)
- **Auto-refresh** : Dashboard auto-refreshes every 30 seconds
- **Responsive design** : Mobile-friendly sidebar navigation

### 🔧 API Improvements

#### New Endpoints
- **GET /api/transactions** : Fetch transaction history with pagination
  - Query params: `limit` (default: 50), `offset` (default: 0)
  - Returns: transactions array with prompt/response data
  - Supports: full-text search, filtering by tags/category

### 📝 Technical Details

**Modified Files:**
- `mcp/web/index.html` - Complete redesign with sidebar navigation
- `mcp/web/server.js` - Added /api/transactions endpoint
- `CHANGELOG.md` - Updated for v0.5.6
- `README.md` - Updated with new dashboard screenshots
- `plugins/argus/.claude-plugin/plugin.json` - Updated version to 0.5.6
- `plugins/argus/.claude-plugin/marketplace.json` - Updated version to 0.5.6

---

## [0.5.5] - 2026-02-23

### 🐛 Bug Fixes

#### Search Memory Bug Fixed
- **Missing await** : Fixed `argus__search_memory` TypeError
- **Async handling** : Added proper await for `searchTransactions()` and `getAllHooks()`
- **Better scoring** : Improved text similarity calculation for local search
- **Lower threshold** : Default threshold now 0.3 for better results

#### Queue System Fixed
- **JSONL format** : Queue files now use JSONL (one JSON per line) format
- **Proper paths** : Fixed queue file extensions from `.json` to `.jsonl`
- **Export functions** : Added `readQueue` and `clearQueue` exports to utils.js
- **Queue directory** : Auto-created when needed

### 🚀 Features

#### Queue Processor Integration
- **Auto-start** : Queue processor starts with MCP server
- **5-second interval** : Processes queued items every 5 seconds
- **Transaction indexing** : Automatically indexes queued transactions to RAG
- **Edit tracking** : Logs file edits to `~/.argus/edits.log`
- **Prompt logging** : Logs prompts to `~/.argus/prompts.log`

#### Prompt/Response Capture
- **Hook integration** : PostToolUse and PostEdit hooks queue all actions
- **Transaction format** : Captures prompt, context, result, and metadata
- **Auto-tagging** : Tags transactions with tool names and categories
- **Session tracking** : Tracks transactions per session (cwd-based)

### 📝 Technical Details

**Modified Files:**
- `mcp/src/rag/engine.ts` - Fixed async/await in local search fallback
- `mcp/src/index.ts` - Added queue processor initialization
- `hooks/utils.js` - Fixed queue format (JSONL) and exports
- `hooks/post-tool-use.js` - Simplified to use queueTransaction
- `.claude-plugin/marketplace.json` - Updated version to 0.5.5
- `.claude-plugin/plugin.json` - Updated version to 0.5.5

**Improvements:**
- Better error handling in queue operations
- More reliable file I/O with JSONL format
- Cleaner transaction flow from hooks to database
- Improved search result quality

---

## [0.5.4] - 2026-02-23

### 🚀 Auto-Index Amélioré

#### Scan Complet du Projet
- **Root Scanning** : Parcourt la racine du projet entier (pas seulement src/, lib/)
- **Plus de Langages** : Indexe `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.rs`, `.go`, `.java`, `.cjs`, `.mjs`
- **Smart Filtering** : Exclut `node_modules`, `.git`, `.next`, `dist`, `build`, `cache`, `.claude`, `coverage`

#### Multi-Projets
- **Index Multiple Projects** : Chaque projet est indexé séparément
- **Dashboard Multi-Projets** : Visualise tous les projets indexés
- **Project Identification** : Chemin complet pour identifier chaque projet

### 🔧 Dashboard Amélioré

#### Fichiers Échantillonnés
- **Sample Files** : Affiche les 5 premiers fichiers indexés
- **File Counter** : Montre le nombre total + "X more" pour les fichiers restants
- **Relative Paths** : Affiche les chemins relatifs pour lisibilité

#### Information Complète
- **Project Path** : Chemin complet du projet
- **File Count** : Nombre de fichiers indexés par projet
- **Last Indexed** : Timestamp du dernier indexage
- **Index Type** : Full vs incremental

### 🛠️ Script Autonome

#### Stand-alone Indexer
- **Portable Script** : `scripts/index-project.js` fonctionne depuis n'importe quel répertoire
- **No Dependencies** : Utilise seulement les modules Node.js natifs
- **Easy Usage** : `node /path/to/argus/scripts/index-project.js`

### 📝 Technical Details

**Modified Files:**
- `hooks/session-start.js` - Scan racine + exclude directories améliorés
- `web/index.html` - Affichage échantillons de fichiers
- `scripts/index-project.js` - Script autonome pour indexation manuelle

**Improvements:**
- Better directory filtering (excludes .claude, cache, coverage, etc.)
- More file extensions (.cjs, .mjs added)
- Cleaner project identification
- Better error handling for unreadable directories

---

## [0.5.3] - 2026-02-23

### 🚀 Major Features

#### Local Semantic Search (TF-IDF)
- **Zero Dependencies**: Works without Docker or Qdrant
- **TF-IDF Engine**: Term frequency-inverse document frequency scoring
- **Tokenization**: Smart text tokenization with stemming
- **Cosine Similarity**: Relevance scoring for search results
- **Document Highlighting**: Extracts relevant snippets from results

#### Auto-Index Fixed
- **Real File Scanning**: Actually walks project directories
- **Multi-Language Support**: Indexes .js, .ts, .jsx, .tsx, .py, .rs, .go, .java files
- **Smart Filtering**: Ignores node_modules, .git, dist, build directories
- **Persistent Index**: Saves index metadata to `~/.argus/index-*.json`
- **Incremental Support**: Tracks last index time per project

#### Dashboard Enhancements
- **Indexed Projects Section**: Shows all indexed projects with file counts
- **New API Endpoint**: `GET /api/indexed` for indexed projects data
- **Timestamp Display**: Shows last indexed time per project
- **File Counters**: Displays number of indexed files per project
- **Status Indicators**: Full vs incremental indexing status

### 🔧 Improvements

#### Queue System
- **Absolute Paths**: Uses `os.homedir()` instead of env vars
- **Reliable Creation**: Queue files persist correctly now
- **Edit Tracking**: Captures Edit/Write operations
- **Prompt Tracking**: Records all prompts for analysis

#### RAG Engine
- **Dual Mode**: Supports both Qdrant and local search
- **Automatic Fallback**: Switches to local search if Qdrant unavailable
- **Seamless Integration**: Same API regardless of backend
- **Load on Startup**: Populates local index from existing transactions

### 📝 Documentation

- Updated README.md with v0.5.3 features
- Updated GUIDE.md with comprehensive v0.5.3 documentation
- Updated CLAUDE.md with new capabilities
- Updated CHANGELOG.md with detailed release notes

### 🔍 Technical Details

**New Files:**
- `src/semantic/local-semantic.ts` - TF-IDF search engine implementation

**Modified Files:**
- `src/rag/engine.ts` - Dual-mode support (Qdrant + local)
- `hooks/session-start.js` - Real file indexing implementation
- `hooks/utils.js` - Fixed queue paths with os.homedir()
- `web/server.js` - New `/api/indexed` endpoint
- `web/index.html` - Indexed projects display

**Dependencies:**
- Added `node-nlp@^4.27.0` for TF-IDF functionality

### 🎯 User Experience

**Before v0.5.3:**
- ❌ Auto-index didn't actually scan files
- ❌ Required Docker/Qdrant for semantic search
- ❌ Queue files weren't created reliably
- ❌ No visibility into indexed projects

**After v0.5.3:**
- ✅ Auto-index scans and tracks actual files
- ✅ Semantic search works without Docker
- ✅ Queue system creates files reliably
- ✅ Dashboard shows all indexed projects
- ✅ Automatic fallback to local search

---

## [0.5.2] - 2025-02-23

### Fixed
- **Web Dashboard:** Fixed infinite loading issues when stats endpoint fails
- **Port Detection:** Improved port detection to handle TIME_WAIT connections
- **Server.js:** Fixed cwd (current working directory) for proper index.html serving
- **Error Handling:** Enhanced error handling in dashboard for robust operation

### Technical Details
- Dashboard now gracefully handles API failures without infinite loading
- Port detection now checks for TIME_WAIT state to avoid false conflicts
- Server.js now properly resolves absolute path for index.html
- Added better error messages and fallback UI states

---

## [0.5.2] - 2025-02-23

### Fixed
- **Web Dashboard:** Fixed infinite loading issues when stats endpoint fails
- **Port Detection:** Improved port detection to handle TIME_WAIT connections
- **Server.js:** Fixed cwd (current working directory) for proper index.html serving
- **Error Handling:** Enhanced error handling in dashboard for robust operation

### Technical Details
- Dashboard now gracefully handles API failures without infinite loading
- Port detection now checks for TIME_WAIT state to avoid false conflicts
- Server.js now properly resolves absolute path for index.html
- Added better error messages and fallback UI states

---

## [0.5.1] - 2025-02-20

### Added
- **Web Dashboard:** Real-time monitoring interface at http://localhost:30000
- **API Endpoints:** `/health`, `/api/status`, `/api/stats`, `/api/docs`
- **Transaction Browsing:** View all past transactions with pagination
- **System Stats:** Transaction counts, hook counts, Qdrant status

### Improved
- Better error handling in MCP server
- Enhanced transaction metadata
- Improved RAG search relevance

---

## [0.5.0] - 2025-02-15

### Major Features
- **Initial Release:** ARGUS Sentinelle Omnisciente for Claude Code
- **RAG Memory Engine:** Semantic search with Qdrant vector database
- **Code Indexing:** Automatic scanning of `/src` and `/docs` directories
- **Smart Hooks:** Interception of Explore and CreateTeam tools
- **Transaction History:** Complete audit trail of all Claude actions
- **MCP Integration:** Full Model Context Protocol server implementation

### MCP Tools
- `argus__check_hooks` - Mandatory context check before actions
- `argus__save_transaction` - Save completed transactions
- `argus__search_memory` - Semantic search across history
- `argus__get_history` - Retrieve transaction history
- `argus__index_codebase` - Index project files
- `argus__get_stats` - System statistics

### Claude Code Hooks
- `SessionStart` - Initialize ARGUS on session start
- `PreToolUse` - Intercept Explore and CreateTeam
- `PostToolUse` - Save transaction after tool use
- `Stop` - Cleanup on session stop

---

## Version Format

- **MAJOR** - Breaking changes or major features
- **MINOR** - New features or enhancements
- **PATCH** - Bug fixes or minor improvements

---

[0.5.4]: https://github.com/Pamacea/argus/releases/tag/v0.5.4
[0.5.3]: https://github.com/Pamacea/argus/releases/tag/v0.5.3
[0.5.2]: https://github.com/Pamacea/argus/releases/tag/v0.5.2
[0.5.1]: https://github.com/Pamacea/argus/releases/tag/v0.5.1
[0.5.0]: https://github.com/Pamacea/argus/releases/tag/v0.5.0
