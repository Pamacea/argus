# ARGUS Marketplace

> Sentinelle omnisciente pour Claude Code - Force l'IA à consulter le contexte avant toute action.

## 📦 Plugins

### ARGUS

Le plugin ARGUS transforme l'IA d'un simple "exécuteur" en un collaborateur averti qui **JAMAIS** n'agit sans avoir vérifié :
- ✅ Mémoire des prompts précédents
- ✅ RAG (index vectoriel local)
- ✅ Index des fichiers
- ✅ Documentation du projet

## 🚀 Installation

```bash
# Via Claude Code Marketplace
/install-plugin argus

# Le MCP server démarre automatiquement
# Les hooks Claude Code sont activés
```

## 🎯 Utilisation

```
User: "Explore l'authentification dans ce projet"

Claude: Je dois d'abord consulter ARGUS...
1. mcp__argus__check_hooks("Explore l'authentification", "explore")
2. ARGUS retourne: "3 patterns auth trouvés dans /src/auth/"
3. Justification: "Selon ARGUS, ce projet utilise JWT + refresh tokens"
```

## 📚 Documentation

Voir [plugins/argus/README.md](./plugins/argus/README.md) pour la documentation complète du plugin.

## 🙏 Inspiration

- **Aureus** - Git automation et hooks
- **Claude-mem** - Memory persistence
- **Argus** - Le géant aux cent yeux (mythologie grecque)

---

**ARGUS Marketplace** - *Rien ne lui échappe.*
