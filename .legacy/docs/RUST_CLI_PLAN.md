# ARGUS → Rust CLI - Plan de Transformation

> **Version:** 1.0.0 | **Date:** 2025-03-13 | **Status:** Brainstorming

---

## 🎯 Vision

Transformer ARGUS d'un plugin MCP Node.js en un **CLI Rust natif** ultra-performant qui s'intègre comme un améliorateur de Claude Code (similaire à RTK), avec les principes de versionnement d'Aureus.

### Inspirations

| CLI | Concepts à emprunter |
|-----|---------------------|
| **RTK** | Interception de commandes, réécriture automatique, gain de tokens |
| **Claude Code** | Interface native, hooks système, intégration profonde |
| **Codex** | Indexation sémantique, recherche instantanée |
| **Aureus** | Versioned Release Convention, Git Flow automation |
| **fig/io** | Auto-complétion contextuelle, suggestions intelligentes |

---

## 📊 Pourquoi Rust ?

| Avantage | Impact |
|----------|--------|
| **Performance** | 10-100x plus rapide que Node.js pour l'indexation |
| **Single Binary** | Distribution facile, aucune dépendance runtime |
| **Memory Safety** | Pas de leaks, garantie de stabilité |
| **Tokio async** | I/O concurrent ultra-efficace |
| **WASM compilable** | Possibilité de portabilité navigateur |
| **Cross-platform** | Windows/macOS/Linux natif |

---

## 🏗️ Architecture Proposée

```
argus/
├── crates/
│   ├── core/           # Cœur du système (moteur de mémoire)
│   │   ├── memory/     # RAG + indexation sémantique
│   │   ├── storage/    # SQLite + abstraction
│   │   └── vector/     # Qdrant client (optionnel)
│   │
│   ├── cli/            # Interface CLI (Clap)
│   │   ├── commands/   # Sous-commandes
│   │   ├── hooks/      # Git hooks
│   │   └── completions/# Shell completions
│   │
│   ├── agent/          # Intégration Claude Code
│   │   ├── mcp/        # Server MCP (optionnel, backward compat)
│   │   ├── bridge/     # Communication avec Claude
│   │   └── injector/   # Injection de contexte
│   │
│   ├── git/            # Intégration Git (Aureus-style)
│   │   ├── flow/       # Git Flow automation
│   │   ├── hooks/      # Git hooks natifs
│   │   └── convention/ # Versioned Release Convention
│   │
│   └── tui/            # Terminal UI (Ratatui)
│       ├── dashboard/  # Dashboard TUI
│       ├── search/     # Interface de recherche
│       └── inspect/    # Inspection de transactions
│
├── Cargo.toml
└── README.md
```

---

## 🚀 Commandes CLI Proposées

### Commandes Principales

```bash
# Installation et setup
argus install                    # Installe le binaire + configure PATH
argus init                       # Initialise ARGUS dans le projet courant

# Gestion de la mémoire
argus remember "query"           # Sauvegarde une transaction
argus recall "pattern"           # Recherche dans la mémoire
argus forget <id>                # Supprime une transaction

# Indexation
argus index                      # Indexe le projet courant
argus index --watch              # Mode watch (re-index auto)
argus index --stats              # Statistiques d'indexation

# Inspection
argus inspect                    # TUI Dashboard
argus inspect --web              # Web UI (optionnelle)
argus history                    # Historique des transactions
argus stats                      # Statistiques globales

# Git (Aureus integration)
argus commit                     # Commit versionné (Aureus-style)
argus amend                      # Amend le dernier commit
argus release                    # Crée une release avec CHANGELOG

# Claude Code Integration
argus hook                       # Installe les hooks Claude Code
argus unhook                     # Désinstalle les hooks
argus bridge                     # Bridge MCP ↔ CLI natif
```

### Sous-commandes Claude Code

```bash
# Interception intelligente (RTK-style)
argus intercept                  # Mode interception active
argus intercept --dry-run        # Simulation sans modification

# Context injection
argus context <tool> <args>      # Injecte le contexte ARGUS
argus suggest <tool>             # Suggère des actions basées sur l'historique

# Token optimization
argus optimize                   # Analyse et optimise l'usage des tokens
argus compress                   # Compresse l'historique
```

---

## 🔧 Intégration Claude Code (Style RTK)

### Mode 1: Intercepteur de Commandes

ARGUS s'intercale entre le shell et Claude Code, réécrivant les commandes:

```bash
# Original: User runs `git status`
# ARGUS intercepte et réécrit:
git status → argus git status --context-aware

# Original: User runs "explore auth module"
# ARGUS enrichit:
explore auth module → argus context search "auth" && explore auth module
```

### Mode 2: Hook System

ARGUS utilise les hooks natifs de Claude Code:

```rust
// hooks/pre-tool-use.rs
async fn pre_tool_use(tool: &ToolCall) -> HookResult {
    if tool.name == "Explore" || tool.name == "CreateTeam" {
        // Vérifie si ARGUS a été consulté
        if !argus_was_consulted() {
            return HookResult::Block {
                reason: "ARGUS_NOT_CONSULTED",
                message: "Call argus context first",
            };
        }
    }
    HookResult::Allow
}
```

### Mode 3: MCP Bridge (Backward Compat)

Pour les utilisateurs qui veulent garder le MCP:

```rust
// crates/agent/mcp/server.rs
#[tokio::main]
async fn main() {
    let argus_core = ArgusCore::new();
    let mcp_server = MCPServer::new(argus_core);
    mcp_server.serve("127.0.0.1:30000").await;
}
```

---

## 🎨 TUI Dashboard (Ratatui)

```
┌─────────────────────────────────────────────────────────────────┐
│ ARGUS v1.0.0                    🔍 3 projects indexed           │
├─────────────────────────────────────────────────────────────────┤
│ 📊 Memory Engine                                               │
│ ├─ Transactions: 1,234                                         │
│ ├─ Index: 8,234 files (452 MB)                                 │
│ └─ Qdrant: Connected ✓                                         │
│                                                                 │
│ 🔍 Recent Activity                                             │
│ ├─ [12:34] Modified auth.service.ts (Git: main)                │
│ ├─ [12:30] Created user.model.ts                               │
│ └─ [12:25] Ran: npm test                                       │
│                                                                 │
│ 🎯 Quick Actions                                               │
│ [F1] Search   [F2] Index   [F3] Git   [F4] History  [Q] Quit   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Comparaison Architecture

| Composant | Node.js (Actuel) | Rust (Proposé) | Gain |
|-----------|------------------|----------------|------|
| **Indexation** | ~500 ms | ~50 ms | **10x** |
| **Recherche** | ~200 ms | ~20 ms | **10x** |
| **Startup** | ~1.2s | ~50ms | **24x** |
| **Mémoire** | ~150 MB | ~15 MB | **10x** |
| **Binary** | npm/node | single exe | **∞** |

---

## 🔄 Migration Strategy

### Phase 1: Core Engine (Semaines 1-2)

```rust
// crates/core/memory/src/lib.rs
pub struct ArgusMemory {
    storage: Storage,
    index: TfIdfIndex,
    vector: Option<QdrantClient>,
}

impl ArgusMemory {
    pub async fn remember(&self, transaction: Transaction) -> Result<()>;
    pub async fn recall(&self, query: &str) -> Vec<Transaction>;
    pub async fn index_project(&self, path: &Path) -> Result<IndexStats>;
}
```

### Phase 2: CLI Interface (Semaines 3-4)

```rust
// crates/cli/src/main.rs
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "argus")]
#[command(about = "ARGUS - Omniscient sentinel for Claude Code", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Remember { query: String },
    Recall { pattern: String },
    Index { path: Option<PathBuf> },
    Inspect,
}
```

### Phase 3: Claude Code Integration (Semaines 5-6)

```rust
// crates/agent/injector/src/lib.rs
pub struct ArgusInjector {
    memory: ArgusMemory,
}

impl ArgusInjector {
    pub async fn enrich_prompt(
        &self,
        tool: &str,
        args: &Value,
    ) -> Result<Context> {
        // 1. Search memory for similar actions
        // 2. Index current project state
        // 3. Return enriched context
    }
}
```

### Phase 4: Git Integration (Aureus) (Semaines 7-8)

```rust
// crates/git/flow/src/lib.rs
pub struct GitFlow {
    convention: VersionedConvention,
}

impl GitFlow {
    pub async fn versioned_commit(
        &self,
        repo: &Repository,
        ty: CommitType,
        project: &str,
    ) -> Result<Oid>;
}
```

---

## 🔌 Dépendances Rust Proposées

```toml
[dependencies]
# CLI
clap = { version = "4.5", features = ["derive"] }
clap_complete = "4.5"

# Async runtime
tokio = { version = "1.35", features = ["full"] }

# Database
rusqlite = { version = "0.30", features = ["bundled"] }
heed = { version = "0.20", optional = true }  # LMDB (alternative)

# Search/Vector
qdrant-client = { version = "1.7", optional = true }
tantivy = "0.22"  # Full-text search

# Git
git2 = "0.18"

# TUI
ratatui = "0.26"
crossterm = "0.27"

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Logging
tracing = "0.1"
tracing-subscriber = "0.3"

# Error handling
anyhow = "1.0"
thiserror = "1.0"

# Watcher
notify = "6.1"
```

---

## 🎯 Features Uniques ARGUS CLI

### 1. Smart Context Injection

```bash
# Claude Code reçoit le contexte enrichi automatiquement
$ argus context explore "auth module"

# ARGUS injecte dans le prompt Claude:
"""
=== ARGUS CONTEXT ===
📁 Project: MyProject (main branch)
🔍 Similar explorations: 3 found
├─ 2025-03-10: Explored auth middleware → found JWT pattern
├─ 2025-03-08: Explored auth service → found OAuth flow
└─ 2025-03-01: Created auth module → established pattern

💡 Recommended approach:
- Use existing JWT pattern from auth/middleware.ts
- Follow service structure in auth/service.ts
- See commit abc123 for reference

====================
"""
```

### 2. Token Optimization Advisor

```bash
$ argus analyze

💰 Token Savings Analysis:
├─ Current usage: ~85,000 tokens/session
├─ Potential savings: ~35,000 tokens (41%)
│
├─ Recommendations:
│   ├─ Use `argus recall` before exploring (saves ~15k)
│   ├─ Enable context compression (saves ~8k)
│   └─ Cache common patterns (saves ~12k)
```

### 3. Predictive Context

```rust
// ARGUS prédit ce que vous allez faire et pré-charge le contexte
pub async fn predictive_context(
    &self,
    current_action: &Action,
) -> Result<Context> {
    let predictions = self.predict_next_actions(current_action);
    for prediction in predictions {
        self.preload_context(prediction).await?;
    }
}
```

---

## 📦 Distribution

### Installation One-Line

```bash
# Via cargo
cargo install argus-rs

# Via script (curl|sh)
curl -sSf https://install.argus.dev | sh

# Via Homebrew
brew install argus-rs/tap/argus

# Via Scoop (Windows)
scoop install argus
```

### Auto-Update

```rust
// crates/cli/src/update.rs
pub async fn check_update() -> Result<Update> {
    let current = version();
    let latest = fetch_latest_version().await?;
    if latest > current {
        Ok(Update::Available {
            from: current,
            to: latest,
        })
    } else {
        Ok(Update::UpToDate)
    }
}
```

---

## 🔐 Sécurité

```rust
// Toutes les données locales
// Pas de télémétrie par défaut
// Validation stricte des entrées
// Sandboxing pour l'exécution de code externe

pub struct SecurityConfig {
    pub enable_telemetry: bool,      // false par défaut
    pub sandbox_mode: bool,           // true par défaut
    pub max_memory_mb: usize,         // 512
    pub allowed_paths: Vec<PathBuf>,  // whitelist
}
```

---

## 📈 Roadmap

### v0.1.0 - MVP (4 semaines)
- ✅ Core memory engine
- ✅ Basic CLI (remember, recall, index)
- ✅ SQLite storage
- ✅ TF-IDF search

### v0.2.0 - Claude Integration (2 semaines)
- ✅ Claude Code hooks
- ✅ Context injection
- ✅ Pre-tool-use enforcement

### v0.3.0 - Git Features (2 semaines)
- ✅ Aureus integration
- ✅ Versioned commits
- ✅ Git hooks

### v0.4.0 - TUI Dashboard (2 semaines)
- ✅ Ratatui interface
- ✅ Real-time monitoring
- ✅ Interactive search

### v0.5.0 - Advanced Features (4 semaines)
- ✅ Vector search (Qdrant)
- ✅ Token optimization
- ✅ Predictive context

### v1.0.0 - Production Ready
- ✅ Full test suite
- ✅ Documentation complète
- ✅ Cross-platform binaries
- ✅ Auto-update system

---

## 🎨 Exemples d'Utilisation

### Workflow Typique

```bash
# 1. Initialisation
$ argus init
✓ ARGUS initialized for argus project

# 2. Indexation
$ argus index
✓ Indexed 847 files (234 MB) in 45ms

# 3. Recherche avant exploration
$ argus recall "authentication JWT pattern"
Found 3 similar transactions:
├─ [2025-03-10] JWT implementation in auth/middleware.ts
├─ [2025-03-05] OAuth flow setup
└─ [2025-02-28] Auth module creation

# 4. Exploration enrichie
$ argus context explore "refresh token flow"
[ARGUS] Injecting context into Claude Code...

# 5. Commit versionné
$ argus commit --type UPDATE
📝 Suggested: UPDATE: Argus - v0.7.0
✓ Commit created: abc123def
```

---

## 🤔 Questions à Résoudre

### Architecture

1. **Stockage**: SQLite pur ou LMDB pour performance?
2. **Search**: TF-IDF suffit-il ou Qdrant obligatoire?
3. **Distribution**: Single binaire ou support plugins?

### Claude Integration

1. **Hooks**: Comment hooker Claude Code nativement?
2. **Protocol**: JSON-RPC, stdio, ou IPC?
3. **Fallback**: Conserver MCP pour backward compat?

### Git Integration

1. **Aureus**: Fork ou module indépendant?
2. **Hooks**: Git hooks natifs ou wrapper?
3. **Multi-repo**: Comment gérer les workspaces?

---

## 📚 Références

- **RTK**: https://github.com/rtk-ai/rtk
- **Claude Code**: Documentation Anthropic
- **Aureus**: `~/.claude/plugins/marketplaces/aureus/`
- **Rust CLI Book**: https://rust-cli.github.io/book/
- **Clap**: https://docs.rs/clap/
- **Tokio**: https://tokio.rs/
- **Ratatui**: https://github.com/ratatui-org/ratatui

---

## ✅ Prochaine Étape

**Decision needed:**

1. **Approche** - Complete rewrite vs progressive migration?
2. **Scope** - Full feature parity v1 ou MVP d'abord?
3. **Integration** - Comment prioriser: Claude bridge ou CLI autonome?

---

**Document créé:** 2025-03-13
**Auteur:** Claude Opus + Yanis
**Status:** Brainstorming - Awaiting validation
