# ARGUS - Sentinelle Omnisciente

> **v0.5.3** - Force l'IA à devenir un collaborateur context-aware en consultant le RAG, l'index et la documentation avant toute action.

## 🎯 Vision

ARGUS transforme l'IA d'un simple "exécuteur" en un collaborateur averti qui ne JAMAIS agit sans avoir vérifié :
- ✅ Mémoire des prompts précédents
- ✅ Recherche sémantique locale (TF-IDF) ou vectorielle (Qdrant optionnel)
- ✅ Index automatique des fichiers
- ✅ Documentation du projet
- ✅ Dashboard web en temps réel

## 🆕 v0.5.3 Nouveautés

### Recherche Sémantique Locale
- **TF-IDF Search** : Fonctionne sans Docker ni Qdrant
- **Automatic Fallback** : Bascule automatiquement sur local search si Qdrant indisponible
- **Zero Dependencies** : Aucune dépendance externe requise

### Auto-Index Fix
- **Vrai File Scanning** : Parcourt réellement les répertoires du projet
- **Multi-Language** : Indexe `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.rs`, `.go`, `.java`
- **Smart Filtering** : Ignore `node_modules`, `.git`, `dist`, `build`

### Dashboard Amélioré
- **Indexed Projects** : Liste des projets indexés avec file counts
- **Timestamps** : Date de dernier indexage
- **API Endpoint** : `/api/indexed` pour les données brutes

## 🚀 Quick Start

```bash
# Installation via Claude Code Marketplace
/install-plugin argus

# Le MCP server démarre automatiquement
# Les hooks Claude Code sont activés
# L'auto-index démarre automatiquement
# Le dashboard est accessible sur http://localhost:30000
```

## 🔧 Utilisation

Avant toute exploration ou création de team, consultez ARGUS :

```
User: "Explore l'authentification dans ce projet"

Claude: Je dois d'abord consulter ARGUS...
1. Appel: argus__check_hooks("Explore l'authentification")
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
| `argus__index_codebase` | Indexe manuellement les fichiers du projet |
| `argus__search_code` | Recherche dans le code indexé |

## 📊 Dashboard Web

**http://localhost:30000**

- **Indexed Projects** : Projets indexés avec file counts et timestamps
- **Statistics** : Transactions, hooks, storage engine
- **Memory Stats** : Database size, last index time
- **Server Info** : Uptime, PID, platform
- **API Endpoints** : Documentation complète

## 🔍 Modes de Recherche

### Local Search (Défaut)
- **Avantages** : Pas de Docker, rapide, léger
- **Technique** : TF-IDF avec tokenization
- **Utilisation** : Recherche textuelle standard

### Vector Search (Optionnel)
- **Avantages** : Recherche sémantique avancée
- **Prérequis** : Docker Desktop + Qdrant container
- **Utilisation** : Recherche par similarité conceptuelle

ARGUS bascule automatiquement entre les deux modes !

## 📚 Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Architecture complète
- [API.md](./docs/API.md) - Référence API MCP
- [INSTALLATION.md](./docs/INSTALLATION.md) - Guide d'installation détaillé

## 🙏 Inspiration

- **Aureus** - Git automation et hooks
- **Claude-mem** - Memory persistence
- **Argus** - Le géant aux cent yeux (mythologie grecque)

## 📄 Licence

MIT

**ARGUS v0.5.3** - *Rien ne lui échappe.*
