# ARGUS - Architecture

## 🎯 Vue d'Ensemble

ARGUS est un système de mémoire contextuelle pour Claude Code qui force l'IA à consulter l'historique et la documentation avant toute action.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code                               │
├─────────────────────────────────────────────────────────────┤
│  SessionStart → PreToolUse → PostToolUse → Stop            │
│       ↓             ↓              ↓           ↓            │
│  Initialize    INTERCEPT       Save        Cleanup         │
│  ARGUS         Explore/        Result                       │
│                CreateTeam                                   │
│       └──────────────────────┼─────────────────────┘       │
│                            ▼                                │
│                    ┌──────────────┐                         │
│                    │   MCP Server │                         │
│                    └──────────────┘                         │
└────────────────────────────┼────────────────────────────────┘
                             ▼
                  ┌──────────────────┐
                  │   ARGUS Core     │
                  ├──────────────────┤
                  │  Storage (RocksDB)│
                  │  RAG (Qdrant)    │
                  │  Indexer (Files) │
                  └──────────────────┘
```

## 🔄 Workflow

### 1. SessionStart
- Initialise le MCP server ARGUS
- Charge l'index RAG
- Prépare le stockage

### 2. PreToolUse (CRITIQUE)
- Intercepte `Explore` et `CreateTeam`
- Vérifie si `argus__check_hooks` a été appelé
- Si NON → injecte instruction
- Bloque jusqu'à consultation

### 3. argus__check_hooks (MCP)
- Recherche RAG local
- Scan index fichiers
- Lit documentation projet
- Retourne contexte enrichi

### 4. Action Exécutée
- L'IA agit avec contexte complet
- Connaissance patterns existants
- Respect contraintes documentation

### 5. PostToolUse
- Sauvegarde transaction
- Indexe résultat pour RAG
- Met à jour historique

## 📊 Schéma de Données

```typescript
Transaction {
  id: uuid
  timestamp: DateTime
  user_prompt: string
  action_type: "explore" | "create_team" | "code_edit" | "query"
  context: { project_path, files_involved }
  rag_evidence: [{ content, similarity, source }]
  index_results: [{ file, matches }]
  docs_consulted: string[]
  ai_decision: string
  state_diff?: { before, after }
  compliance_status: "compliant" | "non_compliant" | "warning"
}
```

## 🔧 Composants

- **mcp/src/handlers/** - Tool handlers
- **mcp/src/storage/** - RocksDB wrapper
- **mcp/src/rag/** - Qdrant client
- **mcp/src/indexer/** - File scanning
- **hooks/** - Claude Code hooks

## ⚡ Performance

- Cible: <100ms pour check_hooks
- RAG indexé en mémoire
- RocksDB accès rapide
- Index incrémental

---

*Architecture v0.5.2 - ARGUS*
