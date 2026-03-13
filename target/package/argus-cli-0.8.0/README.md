# ARGUS - Omniscient Memory Sentinel for Claude Code

**Version:** 0.8.0 | **Language:** Rust | **License:** MIT

---

## 🎯 What is ARGUS?

ARGUS is a **CLI-first memory system** for Claude Code that helps you remember past actions, find patterns, and maintain context across development sessions. It replaces the previous MCP plugin with a fast, native Rust CLI that integrates seamlessly with Claude Code via injected rules.

### Key Features

- **🚀 Blazing Fast** - Written in Rust with SQLite backend
- **🔍 Semantic Search** - Full-text search with FTS5
- **💾 Persistent Storage** - Local SQLite database in `~/.argus/`
- **📝 Claude Code Integration** - Auto-injects hooks for seamless workflow
- **🤖 Background Agent** - Optional daemon for automatic memory capture (via `--features agent`)
- **🔧 CLI-First** - Simple commands, no complexity
- **📊 Statistics** - Track your development patterns
- **🏷️ Tagging System** - Organize transactions with tags and categories
- **🔌 Cross-Platform IPC** - Named Pipes (Windows) and Unix Sockets (Linux/Mac)

---

## 🚀 Quick Start

### Installation

```bash
# From crates.io (published as argus-rs)
cargo install argus-rs

# From source
cargo install --path C:/Users/Yanis/Projects/plugins/argus

# Or build and install manually
cd C:/Users/Yanis/Projects/plugins/argus
cargo build --release
cargo install --path .
```

### Initialize

```bash
argus-rs init
```

This creates:
- `~/.argus/` - Data directory
- `~/.argus/memory.db` - SQLite database
- `~/.claude/rules/argus.md` - Claude Code rules

### Basic Usage

```bash
# Remember something important
argus-rs remember "Fixed auth bug in login form" --tags "bugfix,auth"

# Search past transactions
argus-rs recall "auth"

# List recent transactions
argus-rs list

# Show statistics
argus-rs stats

# Show a specific transaction
argus-rs show 1
```

---

## 📋 Commands

| Command | Description | Example |
|---------|-------------|---------|
| `init` | Initialize ARGUS | `argus init` |
| `remember` | Save a transaction | `argus remember "description" --tags "tag1,tag2"` |
| `recall` | Search transactions | `argus recall "pattern" --limit 10` |
| `list` | List transactions | `argus list --limit 20` |
| `show` | Show details | `argus show <id>` |
| `stats` | Show statistics | `argus stats` |
| `index` | Index project | `argus index` |
| `config` | Configuration | `argus config get/set/list` |
| `prune` | Delete old transactions | `argus prune --before 30d --dry-run` |
| `reset` | Reset all data | `argus reset --confirm` |
| `complete` | Shell completions | `argus complete bash` |
| `install` | Install/uninstall hooks | `argus install [--uninstall]` |
| `daemon` | Manage background agent | `argus daemon start|stop|status|ping` |

---

## 🏗️ Architecture

```
src/
├── main.rs          # CLI entry point with Clap
├── lib.rs           # Library exports
├── common.rs        # Shared utilities
├── cli/             # CLI layer
│   ├── commands.rs  # Command implementations
│   ├── output.rs    # Terminal formatting
│   └── config.rs    # Configuration
├── core/            # Business logic
│   ├── memory.rs    # MemoryEngine (remember/recall)
│   ├── index.rs     # ProjectIndexer
│   └── search.rs    # SearchEngine
└── storage/         # Data layer
    ├── models.rs    # Data structures
    ├── db.rs        # SQLite wrapper
    └── error.rs     # Error types
```

---

## 📝 Data Models

### Transaction
```rust
pub struct Transaction {
    pub id: Option<i64>,
    pub prompt: String,
    pub prompt_type: PromptType,  // User | Tool | System
    pub context: Context,
    pub result: TxResult,
    pub metadata: Option<Metadata>,
    pub created_at: Option<DateTime<Utc>>,
}
```

### Context
```rust
pub struct Context {
    pub cwd: String,
    pub platform: String,
    pub session_id: Option<String>,
    pub project_path: Option<String>,
    pub git_branch: Option<String>,
    pub git_commit: Option<String>,
}
```

### Metadata
```rust
pub struct Metadata {
    pub tags: Vec<String>,
    pub category: Option<String>,
    pub intent: Option<String>,
    pub summary: Option<String>,
    // + extra fields
}
```

---

## 🔧 Development

### Build

```bash
cargo build --release
```

### Test

```bash
cargo test
```

### Run

```bash
./target/release/argus --help
```

---

## 📊 Statistics Example

```
📊 ARGUS Statistics

  Transactions: 42
  Total Size:   12.5 KB
  Oldest:      2026-03-10 09:30
  Newest:      2026-03-13 16:45

  By Type:
    user: 35
    tool: 7
```

---

## 🔍 Search Examples

```bash
# Search for auth-related transactions
argus recall "auth"

# Search with limit
argus recall "database" --limit 5

# Full output with context
argus recall "bug" --full
```

---

## 🏷️ Tagging

```bash
# Single tag
argus remember "Fixed bug" --tags "bugfix"

# Multiple tags
argus remember "Added feature" --tags "feature,auth"

# With category
argus remember "Refactored DB" --category "refactor"
```

---

## 🔌 Claude Code Integration

### Hooks Installation

ARGUS automatically integrates with Claude Code via hooks:

```bash
# Install hooks (creates plugin in ~/.claude/plugins/cache/)
argus install

# Uninstall hooks
argus install --uninstall
```

Installed hooks:
- **session-start** - Initializes ARGUS tracking when Claude starts
- **pre-tool-use** - Searches memory before Explore/CreateTeam actions
- **post-tool-use** - Automatically saves completed actions
- **stop** - Persists state when session ends

### Background Agent (Optional)

For automatic memory capture, build with the agent feature:

```bash
# Install from crates.io with agent support
cargo install argus-rs --features agent

# Or build with agent support locally
cargo build --release --features agent

# Start the daemon
argus daemon start

# Run in foreground (for debugging)
argus daemon start --foreground

# Check status
argus daemon status

# Stop the daemon
argus daemon stop

# Ping the daemon
argus daemon ping
```

The agent uses cross-platform IPC:
- **Windows**: Named Pipes (`\\.\pipe\argus-ipc`)
- **Linux/macOS**: Unix Sockets (`~/.argus/argus.sock`)

---

## 🗑️ Maintenance

### Prune Old Transactions

```bash
# Dry run
argus prune --before 30d --dry-run

# Actually delete
argus prune --before 30d
```

### Reset Everything

```bash
argus reset --confirm
```

---

## 🔧 Configuration

Configuration is stored in `~/.argus/config.toml`:

```toml
[core]
version = "0.8.0"
data_dir = "~/.argus"

[memory]
max_transactions = 100000
prune_after_days = 365

[recall]
default_limit = 10
min_score = 0.3
```

---

## 📝 Claude Code Integration

ARGUS injects rules into `~/.claude/rules/argus.md` that tell Claude to:

1. **Consult memory before exploring** - Check ARGUS before using Explore/CreateTeam
2. **Save after actions** - Store results after completing work
3. **Use semantic search** - Find similar past solutions

### Example Rule

```markdown
## Mandatory Workflow

Before ANY Explore or CreateTeam action:

1. Search ARGUS memory: `argus recall "<what you're looking for>"`
2. Review results
3. Proceed with action using context

After ANY significant action:

1. Save the result: `argus remember "What you did and why"`
```

---

## 🚀 Migration from v0.6 (MCP Plugin)

The v0.8.0 Rust CLI is a **complete rewrite** that replaces the Node.js MCP plugin:

| v0.6 (Node.js MCP) | v0.8.0 (Rust CLI) |
|---------------------|---------------------|
| MCP Server | CLI tool |
| Docker required | No dependencies |
| Qdrant vector DB | SQLite FTS5 |
| Complex setup | Single binary |
| `~/.argus-plugin/` | `~/.argus/` |

### Data Migration

If you have data from v0.6, you'll need to export/import manually. The database format has changed.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

## 📄 License

MIT License - see LICENSE file for details.

---

## 🙏 Acknowledgments

- Inspired by RTK (Rust Token Killer) - CLI-first approach
- Built with Claude Code in mind - seamless integration
- Uses SQLite FTS5 for fast semantic search

---

**ARGUS v0.8.0** - Your omniscient sentinel for Claude Code.
