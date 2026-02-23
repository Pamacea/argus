/**
 * Shared utilities for ARGUS hooks
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Session state file path
const SESSION_STATE_PATH = path.join(process.env.CLAUDE_PLUGIN_ROOT, '.session-state.json');

// Use absolute path for data directory
const ARGUS_HOME = path.join(os.homedir(), '.argus');
const QUEUE_DIR = path.join(ARGUS_HOME, 'queue');
const EDIT_QUEUE_PATH = path.join(QUEUE_DIR, 'edits.json');
const TRANSACTION_QUEUE_PATH = path.join(QUEUE_DIR, 'transactions.json');
const PROMPT_QUEUE_PATH = path.join(QUEUE_DIR, 'prompts.json');

/**
 * Ensure queue directory exists
 */
function ensureQueueDir() {
  try {
    if (!fs.existsSync(QUEUE_DIR)) {
      fs.mkdirSync(QUEUE_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('[ARGUS] Failed to create queue dir:', error.message);
  }
}

/**
 * Load queue from file
 */
function loadQueue(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`[ARGUS] Failed to load queue from ${filePath}:`, error.message);
  }
  return [];
}

/**
 * Save queue to file
 */
function saveQueue(filePath, queue) {
  try {
    ensureQueueDir();
    fs.writeFileSync(filePath, JSON.stringify(queue, null, 2));
  } catch (error) {
    console.error(`[ARGUS] Failed to save queue to ${filePath}:`, error.message);
  }
}

/**
 * Queue an edit operation for later processing
 */
function queueEdit(editData) {
  const queue = loadQueue(EDIT_QUEUE_PATH);
  queue.push({
    ...editData,
    timestamp: Date.now()
  });
  saveQueue(EDIT_QUEUE_PATH, queue);
  console.log('[ARGUS] ✓ Queued edit for processing');
}

/**
 * Queue a transaction for memory storage
 */
function queueTransaction(transaction) {
  const queue = loadQueue(TRANSACTION_QUEUE_PATH);
  queue.push({
    ...transaction,
    timestamp: Date.now()
  });
  saveQueue(TRANSACTION_QUEUE_PATH, queue);
  console.log('[ARGUS] ✓ Queued transaction for memory');
}

/**
 * Queue a prompt for analysis
 */
function queuePrompt(promptData) {
  const queue = loadQueue(PROMPT_QUEUE_PATH);
  queue.push({
    ...promptData,
    timestamp: Date.now()
  });
  saveQueue(PROMPT_QUEUE_PATH, queue);
  console.log('[ARGUS] ✓ Queued prompt for analysis');
}

/**
 * Load session state from disk
 */
function loadSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_PATH)) {
      const data = fs.readFileSync(SESSION_STATE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[ARGUS] Failed to load session state:', error.message);
  }
  return {
    sessionId: null,
    startTime: null,
    toolCalls: [],
    lastCheckedHooks: false,
  };
}

/**
 * Save session state to disk
 */
function saveSessionState(state) {
  try {
    fs.writeFileSync(SESSION_STATE_PATH, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[ARGUS] Failed to save session state:', error.message);
  }
}

/**
 * Extract context from environment
 */
function extractContext() {
  return {
    cwd: process.cwd(),
    platform: process.platform,
    timestamp: Date.now(),
  };
}

/**
 * Check if a tool requires hook consultation
 */
function requiresHookCheck(toolName) {
  const protectedTools = [
    'explore',
    'create_team',
    'create_agents',
    'spawn',
  ];
  return protectedTools.some(name =>
    toolName.toLowerCase().includes(name.toLowerCase())
  );
}

/**
 * Parse tool name from command
 */
function parseToolName(command) {
  if (!command || typeof command !== 'string') {
    return null;
  }

  // Try to extract tool name from common patterns
  const patterns = [
    /(?:^|\s)([a-z_]+)\s*\(/i,  // function_name(
    /(?:^|\s)([a-z_]+)(?:\s+|$)/i,  // command_name
  ];

  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Clean up old session state
 */
function cleanupSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_PATH)) {
      fs.unlinkSync(SESSION_STATE_PATH);
    }
  } catch (error) {
    console.error('[ARGUS] Failed to cleanup session state:', error.message);
  }
}

module.exports = {
  loadSessionState,
  saveSessionState,
  extractContext,
  requiresHookCheck,
  parseToolName,
  cleanupSessionState,
  queueEdit,
  queueTransaction,
  queuePrompt,
  SESSION_STATE_PATH,
  EDIT_QUEUE_PATH,
  TRANSACTION_QUEUE_PATH,
  PROMPT_QUEUE_PATH,
  QUEUE_DIR,
};
