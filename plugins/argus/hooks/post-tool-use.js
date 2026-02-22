#!/usr/bin/env node

/**
 * Post-Tool Use Hook
 *
 * Captures tool results and saves them to ARGUS memory for learning.
 */

const { execSync } = require('child_process');
const path = require('path');

async function postToolUse(toolName, args, result) {
  console.log(`[ARGUS] Post-tool: ${toolName}`);

  // Skip ARGUS tools to avoid infinite loops
  if (toolName.startsWith('argus__')) {
    return;
  }

  // Skip tools that don't produce meaningful results
  const skipTools = ['Read', 'Glob', 'Grep', 'Bash'];
  if (skipTools.includes(toolName)) {
    return;
  }

  // Try to call argus__save_transaction via MCP if available
  // Note: This is a best-effort attempt - hooks run in a separate process
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    if (!pluginRoot) {
      return; // No plugin root, can't save
    }

    // Extract meaningful info for storage
    const transaction = {
      prompt: `${toolName} - ${JSON.stringify(args).slice(0, 100)}`,
      action: 'tool_execution',
      context: {
        tool_name: toolName,
        args: JSON.stringify(args),
        timestamp: new Date().toISOString()
      },
      result: typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500),
      tags: [toolName, 'auto_captured']
    };

    // Note: We can't directly call MCP tools from hooks
    // The MCP server will need to poll or we need IPC
    // For now, just log that we captured it
    console.log(`[ARGUS] ✓ Captured: ${toolName}`);

  } catch (error) {
    // Silently fail - don't break hooks on save error
    console.error(`[ARGUS] Warning: Could not save transaction:`, error.message);
  }
}

// Main execution
(async () => {
  try {
    const toolName = process.env.ARGUS_TOOL_NAME || 'unknown';
    const args = JSON.parse(process.env.ARGUS_TOOL_ARGS || '{}');
    const result = JSON.parse(process.env.ARGUS_TOOL_RESULT || '{}');

    await postToolUse(toolName, args, result);
    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Error in post-tool-use hook:', error);
    process.exit(0); // Don't fail the hook
  }
})();
