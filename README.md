# ARGUS Marketplace

> **v0.5.3** - Sentinelle omnisciente pour Claude Code - Force l'IA à consulter le contexte avant toute action.

## 📦 Plugins

### ARGUS

Le plugin ARGUS transforme l'IA d'un simple "exécuteur" en un collaborateur averti qui **JAMAIS** n'agit sans avoir vérifié :
- ✅ Mémoire des prompts précédents
- ✅ Recherche sémantique locale (TF-IDF) ou vectorielle (Qdrant)
- ✅ Index automatique des fichiers
- ✅ Documentation du projet
- ✅ Historique des transactions

## 🆕 v0.5.3 Nouveautés

- **Recherche sémantique locale** : Fonctionne sans Docker, avec TF-IDF
- **Auto-index fix** : Les projets sont indexés automatiquement au démarrage
- **Dashboard amélioré** : Affiche les projets indexés avec compteur de fichiers
- **Queue system** : Capture fiable des edits et prompts

## 🚀 Installation

```bash
# Via Claude Code Marketplace
/install-plugin argus

# Le MCP server démarre automatiquement
# Les hooks Claude Code sont activés
# L'auto-index démarre automatiquement
```

## 🎯 Utilisation

```
User: "Explore l'authentification dans ce projet"

Claude: Je dois d'abord consulter ARGUS...
1. argus__check_hooks("Explore l'authentification")
2. ARGUS retourne: "3 patterns auth trouvés dans /src/auth/"
3. Justification: "Selon ARGUS, ce projet utilise JWT + refresh tokens"
```

## 📊 Dashboard

Accédez au dashboard : **http://localhost:30000**

- **Projects** : Voir les projets indexés avec file counts
- **Stats** : Transactions, hooks, index status
- **Activity** : Historique des actions récentes
- **API** : Documentation complète des endpoints

## 📚 Documentation

Voir [plugins/argus/README.md](./plugins/argus/README.md) pour la documentation complète du plugin.

## 🙏 Inspiration

- **Aureus** - Git automation et hooks
- **Claude-mem** - Memory persistence
- **Argus** - Le géant aux cent yeux (mythologie grecque)

---

**ARGUS Marketplace** - *Rien ne lui échappe.*
