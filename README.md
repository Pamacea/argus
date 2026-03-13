# ARGUS - Omniscient Memory Sentinel for Claude Code

**Version:** 0.8.0 | **License:** MIT

---

ARGUS est un systeme de memoire CLI pour Claude Code qui enregistre vos actions, trouve des patterns et maintient le contexte entre vos sessions de developpement. Ecrit en Rust avec SQLite, il s'integre automatiquement via des hooks injectes.

**Pourquoi ARGUS ?**

Claude Code explore ou cree des solutions sans verifier le code existant. ARGUS intercepte ces actions, force la consultation de la memoire historique, et sauvegarde les resultats pour une reutilisation future.

**Fonctionnalites cles**

- Recherche semantique (SQLite FTS5)
- Stockage persistant local (~/.argus/)
- Integration automatique Claude Code (hooks)
- Agent daemon optionnel (IPC cross-platform)
- Systeme de tags et categories

---

## Installation

```bash
# Depuis crates.io
cargo install argus-tool

# Depuis la source
cargo install --path .

# Initialisation
argus init
```

## Commandes essentielles

```bash
argus remember "Corrected auth bug" --tags "bugfix,auth"
argus recall "auth"
argus list
argus stats
```

---

**Repository:** https://github.com/Pamacea/argus
