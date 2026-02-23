# ARGUS Marketplace

> **v0.5.4** - Sentinelle omnisciente pour Claude Code - Force l'IA à consulter le contexte avant toute action.

## 📦 Plugins

### ARGUS

Le plugin ARGUS transforme l'IA d'un simple "exécuteur" en un collaborateur averti qui **JAMAIS** n'agit sans avoir vérifié :
- ✅ Mémoire des prompts précédents
- ✅ Recherche sémantique locale (TF-IDF) ou vectorielle (Qdrant)
- ✅ Index automatique complet des fichiers (racine du projet)
- ✅ Documentation du projet
- ✅ Visualisation des projets indexés

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
