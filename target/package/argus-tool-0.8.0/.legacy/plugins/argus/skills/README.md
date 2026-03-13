# ARGUS Skills Reference

Quick reference for all ARGUS Claude Code skills.

---

## Available Skills

### argus-consult
**Search memory before taking action**

```
Usage: /argus-consult
Alias: /consult

When to use:
- Before implementing features
- Before refactoring
- Before choosing approaches
- When debugging

Example:
"You: How should I handle authentication in this API?"
"Claude: /argus-consult [searches memory for similar patterns]"
```

**See:** [argus-consult.md](argus-consult.md)

---

### argus-save
**Save learnings to memory**

```
Usage: /argus-save
Alias: /save

When to use:
- After successful solutions
- After failures
- After making decisions
- After debugging

Example:
"You: This pattern worked great!"
"Claude: /argus-save [saves pattern to memory]"
```

**See:** [argus-save.md](argus-save.md)

---

## Quick Workflow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Start      │────▶│ /argus-consult│────▶│  Implement   │
│    Task      │     │ (search first)│     │  Solution    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  /argus-save │
                                          │ (save result)│
                                          └──────────────┘
```

---

## MCP Tools Reference

ARGUS provides these MCP tools:

| Tool | Purpose |
|------|---------|
| `argus_search` | Semantic search across memory |
| `argus_save` | Save manual observations |
| `argus_get` | Retrieve specific observations |
| `argus_timeline` | Get context around events |
| `argus_analyze_codebase` | Scan and understand codebase |
| `argus_get_config` | Get ARGUS configuration |
| `argus_clear_memory` | Clear stored memories |

---

## Common Patterns

### Pattern 1: Feature Development
```
1. /argus-consult "How to implement [feature]?"
2. Review similar past implementations
3. Implement based on proven patterns
4. /argus-save "Implementation successful"
```

### Pattern 2: Debugging
```
1. /argus-consult "[error message] similar issues"
2. Review past bug fixes
3. Apply solution
4. /argus-save "Root cause and fix"
```

### Pattern 3: Architecture Decisions
```
1. /argus-consult "Pros/cons of [approach]?"
2. Review past decisions
3. Make decision
4. /argus-save "Chose X because Y"
```

---

## Tips

1. **Consult early** - Before writing code
2. **Save often** - After significant events
3. **Be specific** - More context = better results
4. **Tag properly** - Makes retrieval easier
5. **Trust but verify** - ARGUS suggests, you decide

---

## Documentation

- [argus-consult.md](argus-consult.md) - Full consultation guide
- [argus-save.md](argus-save.md) - Full saving guide
- [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) - System architecture
- [../docs/API.md](../docs/API.md) - Complete API reference
- [../docs/INSTALLATION.md](../docs/INSTALLATION.md) - Installation guide

---

*Last Updated: 2026-02-21*
