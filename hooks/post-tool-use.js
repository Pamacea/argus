#!/usr/bin/env node

/**
 * ARGUS PostToolUse Hook
 *
 * Captures results after tool execution and saves them to ARGUS
 * for future retrieval and learning.
 *
 * This hook:
 * 1. Captures the tool result
 * 2. Extracts key learnings
 * 3. Saves to ARGUS semantic memory via argus__save_transaction
 * 4. Updates session tracking
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  loadSessionState,
  saveSessionState,
  extractContext,
  requiresHookCheck,
} = require('./utils.js');

// Session logs directory
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const SESSION_LOGS_DIR = path.join(PLUGIN_ROOT, '.argus-sessions');

// Transaction queue for batch processing
const TRANSACTION_QUEUE_PATH = path.join(PLUGIN_ROOT, '.argus-transaction-queue.json');

/**
 * Load transaction queue
 */
function loadTransactionQueue() {
  try {
    if (fs.existsSync(TRANSACTION_QUEUE_PATH)) {
      const data = fs.readFileSync(TRANSACTION_QUEUE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[ARGUS] Failed to load transaction queue:', error.message);
  }
  return [];
}

/**
 * Save transaction queue
 */
function saveTransactionQueue(queue) {
  try {
    fs.writeFileSync(
      TRANSACTION_QUEUE_PATH,
      JSON.stringify(queue, null, 2)
    );
  } catch (error) {
    console.error('[ARGUS] Failed to save transaction queue:', error.message);
  }
}

/**
 * Generate transaction ID using crypto
 */
function generateTransactionId() {
  return `tx_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Add transaction to queue for later saving
 * (We queue because we can't call MCP tools from hooks)
 */
function queueTransaction(toolCall, result, context) {
  const queue = loadTransactionQueue();

  const transaction = {
    id: generateTransactionId(),
    timestamp: Date.now(),
    sessionId: process.env.ARGUS_SESSION_ID || 'unknown',
    toolCall: {
      name: toolCall.name || 'unknown',
      arguments: toolCall.arguments || {},
    },
    result: {
      success: result.success !== false,
      output: truncateOutput(result.output || result.content, 10000),
      error: result.error,
      duration: result.duration,
    },
    context: {
      cwd: context.cwd,
      platform: context.platform,
    },
    metadata: {
      isProtectedTool: requiresHookCheck(toolCall.name || ''),
    },
  };

  queue.push(transaction);

  // Keep only last 100 transactions in queue
  if (queue.length > 100) {
    queue.splice(0, queue.length - 100);
  }

  saveTransactionQueue(queue);

  console.error(`[ARGUS] Transaction queued: ${transaction.id}`);
  return transaction.id;
}

/**
 * Truncate output to prevent massive logs
 */
function truncateOutput(output, maxLength) {
  if (!output) return undefined;

  const outputStr = typeof output === 'string'
    ? output
    : JSON.stringify(output);

  if (outputStr.length <= maxLength) {
    return outputStr;
  }

  return outputStr.substring(0, maxLength) +
    `\n\n... [TRUNCATED: ${outputStr.length - maxLength} more chars]`;
}

/**
 * Update session state with tool call
 */
function updateSessionState(toolCall, result) {
  const state = loadSessionState();

  state.toolCalls.push({
    name: toolCall.name,
    timestamp: Date.now(),
    success: result.success !== false,
  });

  saveSessionState(state);
}

/**
 * Append event to session log
 */
function appendSessionEvent(sessionId, event) {
  try {
    if (!sessionId || sessionId === 'unknown') {
      return;
    }

    const sessionLogFile = path.join(
      SESSION_LOGS_DIR,
      `${sessionId}.json`
    );

    if (!fs.existsSync(sessionLogFile)) {
      return;
    }

    const sessionData = JSON.parse(fs.readFileSync(sessionLogFile, 'utf-8'));
    sessionData.events.push(event);

    fs.writeFileSync(
      sessionLogFile,
      JSON.stringify(sessionData, null, 2)
    );
  } catch (error) {
    console.error('[ARGUS] Failed to append session event:', error.message);
  }
}

/**
 * Main hook logic
 */
function main() {
  try {
    // Read stdin for the tool call result
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
    }

    // Parse the tool call result
    let toolResult;
    try {
      toolResult = JSON.parse(input);
    } catch (parseError) {
      // If we can't parse, check environment variables as fallback
      const toolName = process.env.ARGUS_TOOL_NAME || '';
      const toolArgs = process.env.ARGUS_TOOL_ARGS || '{}';
      const toolResultData = process.env.ARGUS_TOOL_RESULT || '{}';

      toolResult = {
        tool: {
          name: toolName,
          arguments: JSON.parse(toolArgs),
        },
        result: JSON.parse(toolResultData),
      };
    }

    const toolCall = toolResult.tool || {};
    const result = toolResult.result || {};
    const context = extractContext();

    console.error(`[ARGUS] PostToolUse: Tool "${toolCall.name || 'unknown'}" completed`);

    // Queue transaction for later saving
    const transactionId = queueTransaction(toolCall, result, context);

    // Update session state
    updateSessionState(toolCall, result);

    // Append to session log
    appendSessionEvent(process.env.ARGUS_SESSION_ID, {
      type: 'tool_call',
      timestamp: Date.now(),
      toolName: toolCall.name,
      transactionId,
      success: result.success !== false,
    });

    console.error(`[ARGUS] Transaction recorded: ${transactionId}`);

    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] PostToolUse error:', error.message);
    // Don't fail if logging fails
    process.exit(0);
  }
}

// Run the hook
main();
