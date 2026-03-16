# ARGUS - Sentinelle Omnisciente pour Claude Code

**Version:** 0.8.2 | **License:** MIT | **Architecture:** RTK-Style Hooks

---

## 🎯 What is ARGUS?

ARGUS is a **context-aware memory system** for Claude Code that stores and retrieves your development actions, patterns, and decisions. Like RTK (Rust Token Killer) and Aureus, ARGUS uses **direct hooks** in `~/.claude/hooks/` - no plugin system, no marketplace dependency.

**Problem Solved:** Claude Code sometimes explores or creates solutions without checking existing code patterns, leading to inconsistent implementations, duplicated work, and violations of project conventions.

**Solution:** ARGUS intercepts `Explore` and `CreateTeam` tool calls, enforces consultation of memory, then saves all transactions for future reference.

---

## ✨ What's New in v0.8.2

### 🔧 RTK-Style Architecture (MAJOR CHANGE)
- **No More Plugin System** - Removed plugin.json, marketplace dependency
- **Direct Hooks** - Hooks installed to `~/.claude/hooks/` like RTK and Aureus
- **Simple Installation** - `argus init -g` for global hook installation
- **Clean Uninstall** - `argus init -g --uninstall` for complete removal
- **Status Check** - `argus init --show` to verify installation

### 📦 Simplified Structure
```
~/.claude/
├── hooks/
│   ├── argus-session.mjs   # SessionStart hook
│   ├── argus-pre-tool.mjs  # PreToolUse hook
│   └── argus-post-tool.mjs # PostToolUse hook
├── ARGUS.md                # Awareness file (10 lines)
└── settings.json           # Hooks registered here
```

### 🦅 Key Features
- **Automatic Memory Consultation** - Hooks check ARGUS before Explore/CreateTeam
- **Automatic Recording** - Hooks save Edit/Write actions to memory
- **Auto-Indexing** - Projects indexed automatically (3h threshold)
- **Fast Semantic Search** - SQLite-based TF-IDF search
- **Zero External Dependencies** - No Docker required

---

## 🚀 Quick Start

### Installation

```bash
# Build and install ARGUS CLI
cd C:\Users\Yanis\Projects\plugins\argus
cargo install --path .

# Initialize and install hooks (RTK-style)
argus init -g

# Verify installation
argus init --show
```

### Usage

```bash
# Search memory
argus recall "auth implementation"

# Remember something
argus remember "Fixed JWT token expiration bug"

# Index current project
argus index

# View statistics
argus stats

# List recent transactions
argus list
```

---

## 🔧 How It Works

### 1. Installation (`argus init -g`)
- Creates `~/.argus/` directory
- Installs hooks to `~/.claude/hooks/`
- Creates `~/.claude/ARGUS.md` awareness file
- Registers hooks in `~/.claude/settings.json`
- Backs up existing `settings.json`

### 2. SessionStart Hook
- Runs when Claude Code starts
- Verifies ARGUS CLI is available
- Auto-indexes current project (if > 3h since last index)

### 3. PreToolUse Hook
- Intercepts `Explore`, `CreateTeam`, `Task`, `Agent`, `Plan`
- Searches ARGUS memory automatically
- Displays relevant context to Claude

### 4. PostToolUse Hook
- Records `Edit`, `Write`, `Explore`, `CreateTeam`, `Bash`
- Auto-categorizes and tags actions
- Saves to SQLite database

---

## 📁 Project Structure

```
argus/
├── src/
│   ├── main.rs              # CLI entry point
│   ├── cli/                 # Command handling
│   │   ├── mod.rs
│   │   ├── commands.rs      # Command implementations
│   │   ├── config.rs
│   │   └── output.rs
│   ├── core/                # Core functionality
│   │   ├── mod.rs
│   │   ├── memory.rs        # Memory engine
│   │   ├── search.rs        # Semantic search
│   │   └── index.rs         # Project indexing
│   ├── storage/             # Database layer
│   │   ├── mod.rs
│   │   ├── db.rs            # SQLite connection
│   │   ├── models.rs        # Data models
│   │   └── error.rs
│   ├── hooks/               # Hook installation (RTK-style)
│   │   └── mod.rs
│   ├── agent/               # Optional daemon feature
│   │   └── mod.rs
│   ├── common.rs            # Shared constants
│   └── lib.rs
├── Cargo.toml               # Rust dependencies
├── CLAUDE.md                # This file
├── CHANGELOG.md             # Version history
├── INSTALL.md               # Installation guide
└── README.md                # Project README
```

---

## 🛠️ CLI Commands

### `argus init [OPTIONS]`
Initialize ARGUS and/or install hooks.

```bash
argus init -g              # Install hooks globally
argus init -g --uninstall  # Uninstall hooks
argus init --show          # Show installation status
argus init --no-rules      # Skip rules injection
```

### `argus recall <query>`
Search memory for past transactions.

```bash
argus recall "auth bug"           # Search
argus recall "refactor" -l 20     # Limit results
argus recall "fix" --full         # Show full details
```

### `argus remember <description>`
Save an action to memory.

```bash
argus remember "Fixed login bug"
argus remember "Added OAuth" --tags "feature,auth" --category "feature"
```

### `argus index`
Index current project for semantic search.

```bash
argus index                 # Index current directory
argus index -p ./src        # Index specific path
argus index --force         # Force re-index
```

### `argus stats`
Show memory statistics.

```bash
argus stats
# → Total transactions, size, oldest/newest, by category
```

### `argus list`
List recent transactions.

```bash
argus list -l 50            # List last 50 transactions
```

### `argus show <id>`
Show specific transaction details.

```bash
argus show 123
```

### `argus prune`
Delete old transactions.

```bash
argus prune 30d             # Delete transactions older than 30 days
argus prune 3m --dry-run    # Preview what would be deleted
```

### `argus reset`
Delete all ARGUS data.

```bash
argus reset --confirm       # DANGEROUS! Deletes everything
```

---

## 📊 Data Storage

All data stored locally in `~/.argus/`:

```
~/.argus/
├── memory.db               # SQLite database (transactions)
└── index/                  # Project index data
    └── <project-hash>.json # Per-project index metadata
```

### Transaction Schema
```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    prompt TEXT NOT NULL,
    result TEXT,
    context TEXT,           -- JSON: cwd, platform, git info
    metadata TEXT,          -- JSON: tags, category, summary
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## 🎯 Usage Examples

### Example 1: Before Exploring Code

**Automatic via hooks:**
```
User: "Explore the auth module"
ARGUS Hook: [Searches memory for "auth module"]
ARGUS: Found 3 relevant past explorations
Claude: [Explores with full context]
```

### Example 2: After Making Changes

**Automatic via hooks:**
```
Claude: [Edits auth.js]
ARGUS Hook: [Categorizes as "edit", tags as "auth"]
ARGUS: Saved to memory (#123)
```

### Example 3: Manual Memory Search

```bash
$ argus recall "JWT token"
  #123 Fixed JWT token expiration bug
  at: 2026-03-15 14:30
  prompt: Fixed JWT token expiration bug
  tags: bugfix, auth
```

---

## 🔧 Configuration

ARGUS requires minimal configuration. All defaults work out of the box:

```bash
# Data directory (default: ~/.argus/)
ARGUS_DATA_DIR=/custom/path

# Auto-index threshold (default: 3 hours)
ARGUS_INDEX_THRESHOLD=3h

# Search result limit (default: 10)
ARGUS_SEARCH_LIMIT=10
```

---

## 🐛 Troubleshooting

### Hooks not working?

```bash
# Check hook status
argus init --show

# Reinstall hooks
argus init -g --uninstall
argus init -g

# Check settings.json
cat ~/.claude/settings.json | grep argus
```

### "argus command not found"?

```bash
# Check installation
which argus

# Reinstall
cd /path/to/argus
cargo install --path . --force
```

### Memory not saving?

```bash
# Check database exists
ls -la ~/.argus/memory.db

# Check permissions
argus stats
```

---

## 📚 Version History

### v0.8.2 (Current)
- **RTK-style hooks** - Direct installation to `~/.claude/hooks/`
- **Removed plugin system** - No more plugin.json or marketplace
- **Simplified install** - `argus init -g` for global installation
- **Added status check** - `argus init --show`
- **Clean uninstall** - `argus init -g --uninstall`

### Previous versions
- See CHANGELOG.md for full history

---

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests to the main repository.

**Repository:** https://github.com/Pamacea/argus

---

## 📄 License

MIT License - see LICENSE file for details.

---

**ARGUS v0.8.2** - Your omniscient sentinel for Claude Code.
