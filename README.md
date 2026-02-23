# ARGUS Marketplace

> **v0.5.11** - Sentinelle omnisciente pour Claude Code - Force l'IA à consulter le contexte avant toute action avec résumés intelligents, intégration Git et persistance garantie.

## 📦 Plugins

### ARGUS

Le plugin ARGUS transforme l'IA d'un simple "exécuteur" en un collaborateur averti qui **JAMAIS** n'agit sans avoir vérifié :
- ✅ Mémoire des prompts précédents
- ✅ Recherche sémantique locale (TF-IDF) ou vectorielle (Qdrant)
- ✅ Index automatique complet des fichiers (racine du projet)
- ✅ Historique des conversations (style Claude-mem)
- ✅ Documentation du projet
- ✅ Visualisation des projets indexés
- ✅ **NOUVEAU** : Intégration Git pour suivi exact des modifications
- ✅ **NOUVEAU** : Dashboard redesign avec sidebar navigation

## 🆕 v0.5.11 Nouveautés

### 🐛 Fix Critique : Persistance des Transactions
- **Problème résolu** : Les transactions ne sont plus perdues entre les sessions
- **Écritures atomiques** : Utilisation de fichiers temporaires + rename
- **Auto-flush** : Sauvegarde automatique toutes les 10 secondes
- **Shutdown hooks** : Sauvegarde forcée à l'arrêt du processus
- **823+ transactions** : Vérifiées et persistées correctement

### 🔗 Intégration Git (v0.5.10)
- **Détection automatique** des repositories Git
- **Suivi des branches** pour chaque transaction
- **Référence de commit** avec hash, message, auteur et date
- **Diff preview** (500 caractères) pour les modifications de fichiers
- **Statut Git** des fichiers (tracked, modified, staged, added, deleted)
- **Badge Git** dans le feed d'activité pour les repositories suivis

### 📊 Dashboard Amélioré (v0.5.10)
- **Panneau Git** avec infos repository et dernier commit
- **Section Diff Preview** avec visualisation des changements
- **Indicateurs de statut** pour les fichiers modifiés
- **Tag `git_tracked`** pour les transactions dans des repos Git

## 🆕 v0.5.9 Nouveautés

### 🧠 Résumés Intelligents
- **Descriptions lisibles** pour chaque action
- **Suivi du contexte** des tâches
- **Détection d'intention** automatique
- **Format "Action (pourquoi)"** pour plus de clarté

## 🆕 v0.5.6 Nouveautés

### 🎨 Dashboard Complètement Repensé
- **Nouvelle navigation** : Barre latérale avec icônes pour toutes les sections
- **Design Vercel-inspired** : Palette noir/blanc/gris avec accents bleus subtils
- **Plus de cartes** : Séparateurs propres et organisation claire
- **Sections** : Overview, Recent Activity, History/Log, Memory Engine, MCP Tools, Server Endpoints, API Docs

### 🔧 Nouvelles Fonctionnalités
- **Transaction Search** : Recherchez dans toutes vos transactions
- **Pagination** : Navigation dans l'historique (10 par page)
- **Auto-refresh** : Dashboard se rafraîchit toutes les 30 secondes
- **/api/transactions** : Nouveau endpoint pour l'historique complet

## 🆕 v0.5.5 Nouveautés

### Bug Fixes Critiques
- **Search Memory** : Corrige le bug `TypeError: allTransactions.map is not a function`
- **Queue System** : Format JSONL corrigé pour fiabilité maximale
- **Dashboard Stats** : Affiche maintenant les vraies statistiques de la base

### Nouvelles Fonctionnalités
- **Queue Processor** : Traite automatiquement les files d'attente toutes les 5 secondes
- **Prompt/Response Capture** : Historique complet de vos interactions
- **Transaction Indexing** : Indexation automatique pour la recherche sémantique

## 🆕 v0.5.4 Nouveautés

- **Auto-index amélioré** : Scan depuis la racine du projet, exclut `node_modules`, `.git`, `.next`, etc.
- **Dashboard détaillé** : Affiche les fichiers indexés avec échantillons
- **Script autonome** : `scripts/index-project.js` pour indexer manuellement
- **Multi-projets** : Visualise tous les projets indexés dans le dashboard

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
2. ARGUS retourne: "3 patterns auth trouvés"
3. Justification: "Selon ARGUS, ce projet utilise JWT + refresh tokens"
```

## 📊 Dashboard

Accédez au dashboard : **http://localhost:30000**

- **Indexed Projects** : Tous les projets indexés avec file counts et échantillons
- **Stats** : Transactions, hooks, storage engine
- **API** : Documentation complète

## 🔧 Indexation Manuelle

```bash
# Depuis n'importe quel projet
node /path/to/argus/plugins/argus/scripts/index-project.js
```

## 📚 Documentation

Voir [plugins/argus/README.md](./plugins/argus/README.md) pour la documentation complète.

## 🙏 Inspiration

- **Aureus** - Git automation et hooks
- **Claude-mem** - Memory persistence
- **Argus** - Le géant aux cent yeux (mythologie grecque)

---

**ARGUS Marketplace** - *Rien ne lui échappe.*
