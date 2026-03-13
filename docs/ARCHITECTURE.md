# ARGUS v0.8.0 - Cross-platform Memory Daemon

## 🎯 Architecture

```
argus (crate)
├── Cargo.toml              # Library + Binary configs
├── src/
│   ├── lib.rs               # Public API
│   ├── main.rs              # CLI entry point
│   ├── agent/
│   │   ├── mod.rs            # Daemon module
│   │   ├── ipc.rs            # Cross-platform IPC (named pipe/unix socket)
│   │   ├── daemon.rs         # Daemon process management
│   │   ├── session.rs        # Session tracking
│   │   └── watcher.rs        # File watcher (optional)
│   ├── cli/
│   │   ├── commands.rs       # CLI commands
│   │   ├── output.rs         # Terminal formatting
│   │   └── config.rs         # Config management
│   ├── core/
│   │   ├── mod.rs
│   │   ├── memory.rs         # Memory engine
│   │   ├── search.rs         # Semantic search
│   │   └── context.rs        # Context extraction NEW
│   ├── storage/
│   │   ├── mod.rs
│   │   ├── models.rs         # Data models (Transaction, Session, etc.)
│   │   ├── db.rs             # SQLite database
│   │   └── error.rs
│   ├── hooks/
│   │   ├── mod.rs
│   │   ├── claude.rs         # Claude Code hooks generator
│   │   └── installer.rs      # Plugin installer
│   └── common/
│       ├── mod.rs
│       └── utils.rs
├── argus-plugin/             # Claude Code plugin
│   ├── package.json
│   ├── plugin.json
│   ├── hooks/
│   │   ├── session-start.js
│   │   ├── pre-tool-use.js
│   │   ├── post-tool-use.js
│   │   └── stop.js
│   └── agent/
│       └── Cargo.toml         # Agent sub-crate
└── tests/
```

## 📦 Crates on crates.io

- `argus` - Main library + CLI
- `argus-agent` - Standalone daemon (optional dep)
