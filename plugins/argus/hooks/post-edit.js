#!/usr/bin/env node

/**
 * Post-Edit Hook
 *
 * Specifically captures file edit operations for detailed tracking.
 * This runs after Edit/Write operations to track code changes.
 */

const fs = require('fs');
const path = require('path');
const {
  queueEdit,
  queueTransaction,
  queuePrompt,
  extractContext
} = require('./utils.js');

async function postEdit(toolName, args, result) {
  console.log(`[ARGUS] Post-edit: ${toolName}`);

  const filePath = args?.file_path || args?.notebook_path;
  if (!filePath) {
    return; // No file path, nothing to track
  }

  const context = extractContext();

  // Extract the actual change
  let operation = 'unknown';
  let oldContent = '';
  let newContent = '';

  if (toolName === 'Edit') {
    operation = 'edit';
    oldContent = args?.old_string || '';
    newContent = args?.new_string || '';
  } else if (toolName === 'Write') {
    operation = 'write';
    newContent = args?.content || '';
    // Try to read existing file for old content
    try {
      if (fs.existsSync(filePath)) {
        oldContent = fs.readFileSync(filePath, 'utf8');
      }
    } catch (e) {
      // File might not exist yet
    }
  } else if (toolName === 'NotebookEdit') {
    operation = 'notebook_edit';
    oldContent = args?.old_source || '';
    newContent = args?.new_source || '';
  }

  // Queue the edit for tracking
  queueEdit({
    filePath,
    operation,
    oldContent,
    newContent,
    context: {
      ...context,
      toolName,
      editType: operation
    }
  });

  // Also queue as a transaction for memory
  let changeSummary = `${operation}: ${path.basename(filePath)}`;
  if (oldContent && newContent) {
    const oldLines = oldContent.split('\n').length;
    const newLines = newContent.split('\n').length;
    changeSummary += ` (${oldLines} → ${newLines} lines)`;
  }

  queueTransaction({
    prompt: `${toolName} on ${filePath}`,
    promptType: 'file_edit',
    context: {
      ...context,
      toolName,
      files: [{ path: filePath }]
    },
    result: {
      success: !result?.error,
      output: changeSummary,
      error: result?.error
    },
    metadata: {
      tags: ['file_edit', operation, 'auto_saved'],
      category: 'file_modification'
    }
  });

  console.log(`[ARGUS] ✓ Tracked edit: ${filePath}`);
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
      // No stdin data or invalid JSON - try env vars as fallback
    }

    // Claude Code passes: { toolName, args, result } via stdin
    const toolName = inputData.toolName || process.env.ARGUS_TOOL_NAME || 'unknown';
    const args = inputData.args || JSON.parse(process.env.ARGUS_TOOL_ARGS || '{}');
    const result = inputData.result || JSON.parse(process.env.ARGUS_TOOL_RESULT || '{}');

    // Only process Edit/Write operations
    if (['Edit', 'Write', 'NotebookEdit'].includes(toolName)) {
      await postEdit(toolName, args, result);
    }

    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Error in post-edit hook:', error.message);
    process.exit(0); // Don't fail the hook
  }
})();
