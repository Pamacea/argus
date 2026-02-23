#!/usr/bin/env node

/**
 * Post-Tool Use Hook
 *
 * Captures tool results and queues them for ARGUS memory processing.
 */

const { queueTransaction } = require('./utils');

async function postToolUse(toolName, args, result) {
  console.log(`[ARGUS] Post-tool: ${toolName}`);

  // Skip ARGUS tools to avoid infinite loops
  if (toolName.startsWith('argus__')) {
    return;
  }

  // Skip tools that don't produce meaningful results for learning
  const skipTools = ['Read', 'Glob', 'Grep', 'AskUserQuestion'];
  if (skipTools.includes(toolName)) {
    return;
  }

  try {
    // Queue transaction for processing by MCP server
    queueTransaction({
      prompt: `${toolName} called`,
      promptType: 'tool',
      context: {
        cwd: process.cwd(),
        platform: process.platform,
        toolsAvailable: [],
        environment: process.env
      },
      result: {
        success: true,
        output: typeof result === 'string' ? result : JSON.stringify(result),
        duration: 0,
        toolsUsed: [toolName]
      },
      metadata: {
        tags: [toolName, 'auto_captured'],
        category: 'tool_execution'
      }
    });

    console.log(`[ARGUS] ✓ Queued: ${toolName}`);

  } catch (error) {
    // Silently fail - don't break hooks on save error
    console.error(`[ARGUS] Warning: Could not queue transaction:`, error.message);
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
