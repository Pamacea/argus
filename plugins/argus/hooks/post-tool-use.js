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

    // Capture edit/change preview for Edit/Write operations
    let changePreview = null;
    if (toolName === 'Edit' && args) {
      const { file_path, old_string, new_string } = args;
      if (old_string && new_string) {
        changePreview = {
          type: 'edit',
          file: file_path,
          oldLength: old_string.length,
          newLength: new_string.length,
          preview: {
            removed: old_string.substring(0, 200) + (old_string.length > 200 ? '...' : ''),
            added: new_string.substring(0, 200) + (new_string.length > 200 ? '...' : '')
          }
        };
        promptContent = `Edit ${file_path}: ${old_string.substring(0, 50)}... → ${new_string.substring(0, 50)}...`;
      }
    } else if (toolName === 'Write' && args) {
      const { file_path, content } = args;
      if (content) {
        changePreview = {
          type: 'write',
          file: file_path,
          contentLength: content.length,
          preview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
        };
        promptContent = `Write ${file_path} (${content.length} chars)`;
      }
    }

    // Include relevant arguments in the prompt (for non-edit operations)
    if (!changePreview && args && Object.keys(args).length > 0) {
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
        toolsUsed: [toolName],
        changePreview: changePreview
      },
      metadata: {
        tags: [toolName, 'auto_captured'],
        category: changePreview ? 'file_modification' : 'tool_execution'
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
    let stdinDataStr = '';

    try {
      const stdinBuffer = [];
      for await (const chunk of process.stdin) {
        stdinBuffer.push(chunk);
      }
      stdinDataStr = Buffer.concat(stdinBuffer).toString('utf8');

      // Debug: Log what we received
      if (stdinDataStr.trim()) {
        console.error('[ARGUS DEBUG] Raw stdin:', stdinDataStr.substring(0, 500));
        inputData = JSON.parse(stdinDataStr);
      }
    } catch (e) {
      console.error('[ARGUS] Stdin parse error:', e.message);
      console.error('[ARGUS DEBUG] Raw stdin length:', stdinDataStr.length);
    }

    // Debug: Log what we parsed
    console.error('[ARGUS DEBUG] Parsed inputData keys:', Object.keys(inputData));
    console.error('[ARGUS DEBUG] inputData:', JSON.stringify(inputData).substring(0, 500));

    // Claude Code passes: { tool_name, tool_input, ... } via stdin
    const toolName = inputData.toolName || inputData.tool_name || process.env.ARGUS_TOOL_NAME || 'unknown';
    let args = inputData.args || inputData.tool_input || inputData.input || {};
    let result = inputData.result || inputData.output || {};

    // Debug: Log extracted values
    console.error('[ARGUS DEBUG] toolName:', toolName);
    console.error('[ARGUS DEBUG] args keys:', Object.keys(args));
    console.error('[ARGUS DEBUG] result type:', typeof result);

    // Fallback to env vars for args if not in stdin
    if (Object.keys(args).length === 0) {
      try {
        args = JSON.parse(process.env.ARGUS_TOOL_ARGS || '{}');
        console.error('[ARGUS DEBUG] Using env args, keys:', Object.keys(args));
      } catch (e) {
        console.error('[ARGUS] Failed to parse args:', e.message);
      }
    }

    // Fallback to env vars for result if not in stdin
    if (Object.keys(result).length === 0 || (typeof result === 'object' && Object.keys(result).length === 0)) {
      try {
        result = JSON.parse(process.env.ARGUS_TOOL_RESULT || '{}');
        console.error('[ARGUS DEBUG] Using env result');
      } catch (e) {
        // Result might not be JSON, use as-is
        result = { output: process.env.ARGUS_TOOL_RESULT || '' };
        console.error('[ARGUS DEBUG] Using env result as string');
      }
    }

    await postToolUse(toolName, args, result);
    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Error in post-tool-use hook:', error.message);
    process.exit(0); // Don't fail the hook
  }
})();
