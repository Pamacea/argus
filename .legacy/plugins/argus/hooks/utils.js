/**
 * Shared utilities for ARGUS hooks
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Use absolute path for data directory
const ARGUS_HOME = path.join(os.homedir(), '.argus');
const QUEUE_DIR = path.join(ARGUS_HOME, 'queue');
const EDIT_QUEUE_PATH = path.join(QUEUE_DIR, 'edits.jsonl');
const TRANSACTION_QUEUE_PATH = path.join(QUEUE_DIR, 'transactions.jsonl');
const PROMPT_QUEUE_PATH = path.join(QUEUE_DIR, 'prompts.jsonl');
const HOOK_EXECUTIONS_PATH = path.join(ARGUS_HOME, 'hook_executions.jsonl');
const INDEXED_FILES_PATH = path.join(ARGUS_HOME, 'indexed_files.jsonl');

// Session state file path (with fallback)
const SESSION_STATE_PATH = process.env.CLAUDE_PLUGIN_ROOT
  ? path.join(process.env.CLAUDE_PLUGIN_ROOT, '.session-state.json')
  : path.join(ARGUS_HOME, '.session-state.json');

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
 * Read queue from JSONL file (returns array of parsed objects)
 */
function readQueue(filePath) {
  try {
    ensureQueueDir();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const lines = data.trim().split('\n').filter(l => l);
      return lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.error('[ARGUS] Failed to parse queue line:', line.substring(0, 100));
          return null;
        }
      }).filter(item => item !== null);
    }
  } catch (error) {
    console.error(`[ARGUS] Failed to read queue from ${filePath}:`, error.message);
  }
  return [];
}

/**
 * Clear queue file
 */
function clearQueue(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`[ARGUS] Failed to clear queue ${filePath}:`, error.message);
  }
}

/**
 * Queue an edit operation for later processing (JSONL format)
 */
function queueEdit(editData) {
  try {
    ensureQueueDir();
    const entry = JSON.stringify({
      type: 'edit',
      ...editData,
      timestamp: Date.now(),
      pid: process.pid
    });
    fs.appendFileSync(EDIT_QUEUE_PATH, entry + '\n');
    console.log('[ARGUS] ✓ Queued edit for processing');
  } catch (error) {
    console.error('[ARGUS] Failed to queue edit:', error.message);
  }
}

/**
 * Queue a transaction for memory storage (JSONL format)
 */
function queueTransaction(transaction) {
  try {
    ensureQueueDir();
    const entry = JSON.stringify({
      type: 'transaction',
      ...transaction,
      timestamp: Date.now(),
      pid: process.pid
    });
    fs.appendFileSync(TRANSACTION_QUEUE_PATH, entry + '\n');
    console.log('[ARGUS] ✓ Queued transaction for memory');
  } catch (error) {
    console.error('[ARGUS] Failed to queue transaction:', error.message);
  }
}

/**
 * Queue a prompt for analysis (JSONL format)
 */
function queuePrompt(promptData) {
  try {
    ensureQueueDir();
    const entry = JSON.stringify({
      type: 'prompt',
      ...promptData,
      timestamp: Date.now(),
      pid: process.pid
    });
    fs.appendFileSync(PROMPT_QUEUE_PATH, entry + '\n');
    console.log('[ARGUS] ✓ Queued prompt for analysis');
  } catch (error) {
    console.error('[ARGUS] Failed to queue prompt:', error.message);
  }
}

/**
 * Record a hook execution for tracking
 */
function recordHookExecution(hookName, hookType, sessionId, durationMs) {
  try {
    const entry = JSON.stringify({
      hook_name: hookName,
      hook_type: hookType,
      executed_at: Date.now(),
      session_id: sessionId || process.cwd(),
      duration_ms: durationMs
    });
    fs.appendFileSync(HOOK_EXECUTIONS_PATH, entry + '\n');
    console.log(`[ARGUS] ✓ Recorded hook execution: ${hookType}`);
  } catch (error) {
    console.error('[ARGUS] Failed to record hook execution:', error.message);
  }
}

/**
 * Queue indexed files for database insertion
 */
function queueIndexedFiles(files, projectDir, indexType) {
  try {
    const entry = JSON.stringify({
      type: 'indexed_files',
      project_dir: projectDir,
      index_type: indexType, // 'full' or 'incremental'
      files: files,
      timestamp: Date.now()
    });
    fs.appendFileSync(INDEXED_FILES_PATH, entry + '\n');
    console.log(`[ARGUS] ✓ Queued ${files.length} indexed files for database`);
  } catch (error) {
    console.error('[ARGUS] Failed to queue indexed files:', error.message);
  }
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
  recordHookExecution,
  queueIndexedFiles,
  readQueue,
  clearQueue,
  ensureQueueDir,
  SESSION_STATE_PATH,
  EDIT_QUEUE_PATH,
  TRANSACTION_QUEUE_PATH,
  PROMPT_QUEUE_PATH,
  HOOK_EXECUTIONS_PATH,
  INDEXED_FILES_PATH,
  QUEUE_DIR,
};
