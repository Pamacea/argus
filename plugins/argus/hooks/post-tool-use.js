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
    // Create a more descriptive prompt from the tool call
    let promptContent = `${toolName} called`;

    // Include relevant arguments in the prompt
    if (args && Object.keys(args).length > 0) {
      const argSummary = Object.keys(args).slice(0, 3).map(key => {
        const value = args[key];
        if (typeof value === 'string') {
          return `${key}="${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`;
        } else if (typeof value === 'object' && value !== null) {
          return `${key}=<object>`;
        }
        return `${key}=${value}`;
      }).join(', ');
      promptContent += ` with ${argSummary}`;
    }

    // Queue transaction for processing by MCP server
    queueTransaction({
      prompt: promptContent,
      promptType: 'tool',
      context: {
        cwd: process.cwd(),
        platform: process.platform,
        toolsAvailable: [],
        environment: process.env
      },
      result: {
        success: true,
        output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
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

// Main execution - Claude Code passes data via stdin
(async () => {
  try {
    // Read from stdin as per Claude Code hooks specification
    let inputData = {};
    try {
      const stdinBuffer = [];
      for await (const chunk of process.stdin) {
        stdinBuffer.push(chunk);
      }
      const stdinData = Buffer.concat(stdinBuffer).toString('utf8');
      if (stdinData.trim()) {
        inputData = JSON.parse(stdinData);
      }
    } catch (e) {
      // No stdin data - continue to env var fallback
    }

    // Claude Code passes: { toolName, args, result } via stdin
    const toolName = inputData.toolName || process.env.ARGUS_TOOL_NAME || 'unknown';
    let args = inputData.args || {};
    let result = inputData.result || {};

    // Fallback to env vars for args if not in stdin
    if (Object.keys(args).length === 0) {
      try {
        args = JSON.parse(process.env.ARGUS_TOOL_ARGS || '{}');
      } catch (e) {
        console.error('[ARGUS] Failed to parse args:', e.message);
      }
    }

    // Fallback to env vars for result if not in stdin
    if (Object.keys(result).length === 0) {
      try {
        result = JSON.parse(process.env.ARGUS_TOOL_RESULT || '{}');
      } catch (e) {
        // Result might not be JSON, use as-is
        result = { output: process.env.ARGUS_TOOL_RESULT || '' };
      }
    }

    await postToolUse(toolName, args, result);
    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Error in post-tool-use hook:', error.message);
    process.exit(0); // Don't fail the hook
  }
})();
