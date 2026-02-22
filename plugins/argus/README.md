# ARGUS - Sentinelle Omnisciente

> Force l'IA à devenir un collaborateur context-aware en consultant le RAG, l'index et la documentation avant toute action.

## 🎯 Vision

ARGUS transforme l'IA d'un simple "exécuteur" en un collaborateur averti qui ne JAMAIS agit sans avoir vérifié :
- ✅ Mémoire des prompts précédents
- ✅ RAG (index vectoriel local)
- ✅ Index des fichiers
- ✅ Documentation du projet

## 🚀 Quick Start

```bash
# Installation via Claude Code Marketplace
/install-plugin argus

# Le MCP server démarre automatiquement
# Les hooks Claude Code sont activés
```

## 🔧 Utilisation

Avant toute exploration ou création de team, consultez ARGUS :

```
User: "Explore l'authentification dans ce projet"

Claude: Je dois d'abord consulter ARGUS...
1. Appel: mcp__argus__check_hooks("Explore l'authentification", "explore")
2. ARGUS retourne: "3 patterns auth trouvés dans /src/auth/"
3. Justification: "Selon ARGUS, ce projet utilise JWT + refresh tokens"
```

## 🪝 MCP Tools

| Tool | Description |
|------|-------------|
| `argus__check_hooks` | Consulte RAG + Index + Docs (OBLIGATOIRE) |
| `argus__save_transaction` | Sauvegarde prompt + contexte + résultat |
| `argus__search_memory` | Recherche sémantique dans l'historique |
| `argus__get_history` | Récupère l'historique des transactions |

## 📚 Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Architecture complète
- [API.md](./docs/API.md) - Référence API MCP

## 🙏 Inspiration

- **Aureus** - Git automation et hooks
- **Claude-mem** - Memory persistence
- **Argus** - Le géant aux cent yeux (mythologie grecque)

## 📄 Licence

MIT

**ARGUS** - *Rien ne lui échappe.*
