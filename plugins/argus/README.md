# ARGUS - Sentinelle Omnisciente

> **v0.5.5** - Force l'IA à devenir un collaborateur context-aware en consultant le RAG, l'index et la documentation avant toute action.

## 🎯 Vision

ARGUS transforme l'IA d'un simple "exécuteur" en un collaborateur averti qui ne JAMAIS agit sans avoir vérifié :
- ✅ Mémoire des prompts précédents
- ✅ Recherche sémantique locale (TF-IDF) ou vectorielle (Qdrant optionnel)
- ✅ Index automatique complet (racine du projet)
- ✅ Documentation du projet
- ✅ Historique des conversations (style Claude-mem)
- ✅ Visualisation multi-projets

## 🆕 v0.5.5 Nouveautés

### Bug Fixes Critiques
- **Search Memory** : Corrige le bug `TypeError: allTransactions.map is not a function`
- **Queue System** : Format JSONL corrigé pour fiabilité maximale
- **Async/Await** : Ajouté les `await` manquants dans le RAG engine

### Prompt/Response Capture
- **Historique complet** : Capture toutes vos interactions avec Claude
- **Queue Processor** : Traite automatiquement les files d'attente toutes les 5 secondes
- **Indexation auto** : Les transactions sont indexées pour la recherche sémantique

## 🆕 v0.5.4 Nouveautés

### Auto-Index Amélioré
- **Scan complet** : Parcourt la racine du projet entier
- **Smart filtering** : Exclut `node_modules`, `.git`, `.next`, `dist`, `build`, `cache`, `.claude`, `coverage`
- **Plus de langages** : Indexe `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.rs`, `.go`, `.java`, `.cjs`, `.mjs`
- **Multi-projets** : Indexe et affiche tous les projets dans le dashboard

### Dashboard Amélioré
- **Fichiers échantillonnés** : Affiche les 5 premiers fichiers + compteur
- **Multi-projets** : Liste tous les projets indexés avec détails
- **Path complet** : Chemin complet du projet pour identification

### Script d'Indexation Autonome
- **Stand-alone** : Fonctionne depuis n'importe quel répertoire
- **Portable** : Pas de dépendances externes
- **Usage** : `node /path/to/argus/scripts/index-project.js`

## 🚀 Quick Start

```bash
# Installation
/install-plugin argus

# Auto-index au démarrage
# Dashboard sur http://localhost:30000
```

## 🔧 Utilisation

Avant toute exploration, consultez ARGUS :

```
User: "Explore l'authentification"

Claude: Je consulte ARGUS...
1. argus__check_hooks("Explore l'authentification")
2. ARGUS retourne: "3 patterns trouvés"
3. Justification avec contexte
```

## 📊 Dashboard

**http://localhost:30000**

- **Indexed Projects** : Tous les projets avec files + échantillons
- **Statistics** : Engine, transactions, hooks
- **API** : Endpoints disponibles

## 🔧 Indexation

### Automatique
Au démarrage de session, ARGUS indexe automatiquement le projet courant.

### Manuelle
```bash
cd /votre/projet
node /chemin/vers/argus/scripts/index-project.js
```

## 📚 Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [API.md](./docs/API.md)

## 🙏 Inspiration

- **Aureus** - Git automation
- **Claude-mem** - Memory persistence
- **Argus** - Géant aux cent yeux

## 📄 Licence

MIT

**ARGUS v0.5.4** - *Rien ne lui échappe.*
