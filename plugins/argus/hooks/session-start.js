#!/usr/bin/env node

/**
 * Session Start Hook
 *
 * Initializes ARGUS at the start of each Claude Code session.
 */

const path = require('path');
const fs = require('fs');

async function sessionStart() {
  console.log('[ARGUS] Initializing...');
  console.log('[ARGUS] ════════════════════════════════════════════');
  console.log('[ARGUS] Sentinelle Omnisciente - Context Awareness');
  console.log('[ARGUS] ════════════════════════════════════════════');

  // Get ARGUS data directory
  const dataDir = process.env.ARGUS_DATA_DIR ||
                  path.join(require('os').homedir(), '.argus');

  // Ensure data directory exists
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`[ARGUS] ✓ Created data directory: ${dataDir}`);
    }
  } catch (error) {
    console.error(`[ARGUS] ✗ Error creating data directory:`, error.message);
  }

  // Check MCP server availability
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot) {
    console.log(`[ARGUS] ✓ Plugin root: ${pluginRoot}`);
  } else {
    console.warn('[ARGUS] ⚠ CLAUDE_PLUGIN_ROOT not set');
  }

  // Session info
  console.log('[ARGUS] ');
  console.log('[ARGUS] Hooks Active:');
  console.log('[ARGUS]   • PreToolUse  → Intercepts Explore/CreateTeam');
  console.log('[ARGUS]   • PostToolUse → Saves results to memory');
  console.log('[ARGUS]   • Stop        → Persists state');
  console.log('[ARGUS] ');
  console.log('[ARGUS] MCP Tools Available:');
  console.log('[ARGUS]   • argus__check_hooks      → Consult RAG + Index + Docs');
  console.log('[ARGUS]   • argus__save_transaction  → Save to memory');
  console.log('[ARGUS]   • argus__search_memory     → Semantic search');
  console.log('[ARGUS]   • argus__get_history       → Get history');
  console.log('[ARGUS] ');
  console.log('[ARGUS] ════════════════════════════════════════════');
  console.log('[ARGUS] Ready to guide your actions!');
  console.log('[ARGUS] ════════════════════════════════════════════');
  console.log('[ARGUS] ');
}

sessionStart().catch(error => {
  console.error('[ARGUS] Fatal error during session start:', error);
  process.exit(1);
});
