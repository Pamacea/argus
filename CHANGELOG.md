# Changelog

All notable changes to ARGUS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.5.3]: https://github.com/Pamacea/argus/releases/tag/v0.5.3
[0.5.2]: https://github.com/Pamacea/argus/releases/tag/v0.5.2
[0.5.1]: https://github.com/Pamacea/argus/releases/tag/v0.5.1
[0.5.0]: https://github.com/Pamacea/argus/releases/tag/v0.5.0
