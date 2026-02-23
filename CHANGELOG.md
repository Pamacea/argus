# Changelog

All notable changes to ARGUS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.5.2]: https://github.com/Pamacea/argus/releases/tag/v0.5.2
[0.5.1]: https://github.com/Pamacea/argus/releases/tag/v0.5.1
[0.5.0]: https://github.com/Pamacea/argus/releases/tag/v0.5.0
