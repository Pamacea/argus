#!/usr/bin/env node

/**
 * Standalone script to process hook executions
 * Run this manually to flush hook_executions.jsonl to the database
 */

const path = require('path');
const fs = require('fs');

const HOOK_EXECUTIONS_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.argus',
  'hook_executions.jsonl'
);

const DB_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.argus',
  'argus.db'
);

async function main() {
  console.log('[ARGUS] Processing hook executions...');

  if (!fs.existsSync(HOOK_EXECUTIONS_PATH)) {
    console.log('[ARGUS] No hook executions to process');
    return;
  }

  const data = fs.readFileSync(HOOK_EXECUTIONS_PATH, 'utf-8');
  const lines = data.trim().split('\n').filter(l => l);

  console.log(`[ARGUS] Found ${lines.length} hook executions to process`);

  // For now, just count them
  // The actual database insertion will be done by the MCP server
  const executions = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.error('[ARGUS] Failed to parse:', line.substring(0, 50));
      return null;
    }
  }).filter(e => e !== null);

  console.log(`[ARGUS] ✓ Parsed ${executions.length} valid hook executions`);

  // Group by hook type
  const byType = {};
  executions.forEach(ex => {
    byType[ex.hook_type] = (byType[ex.hook_type] || 0) + 1;
  });

  console.log('[ARGUS] Hook executions by type:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });

  // Note: The actual insertion will be done by the MCP server's processor
  console.log('[ARGUS] ℹ  Note: Actual database insertion will be done by MCP server');
  console.log('[ARGUS] ℹ  Start a Claude Code session to trigger processing');
}

main().catch(console.error);
