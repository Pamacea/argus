# ARGUS - API Reference

## MCP Tools

### argus__check_hooks

**OBLIGATOIRE** avant toute action `Explore` ou `CreateTeam`.

```typescript
{
  prompt: string
  action: "explore" | "create_team" | "code_edit"
  project_path?: string
}
```

**Returns:**
```typescript
{
  transaction_id: string
  rag_results: [{ content, similarity, source }]
  index_matches: [{ file, line, context }]
  docs_summary: string
  constraints: string[]
  status: "ready" | "warning" | "error"
}
```

### argus__save_transaction

Sauvegarde une transaction complète.

```typescript
{
  prompt: string
  action: string
  context: { project_path, files_involved }
  result: string
  tags?: string[]
}
```

### argus__search_memory

Recherche sémantique dans l'historique.

```typescript
{
  query: string
  limit?: number
  filters?: { date_from, date_to, action_type, project, tags }
}
```

### argus__get_history

Récupère l'historique avec filtres.

```typescript
{
  limit?: number
  offset?: number
  filters?: { date_from, date_to, action_type, project, tags }
  sort?: { field, order }
}
```

## Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| ARGUS_001 | RAG not initialized | Run session-start hook |
| ARGUS_002 | Storage unavailable | Check RocksDB |
| ARGUS_003 | No RAG results | Index project files |
| ARGUS_004 | Invalid action type | Use valid action |
| ARGUS_005 | Hooks not consulted | Call check_hooks first |

---

*API Reference v0.5.2 - ARGUS*
