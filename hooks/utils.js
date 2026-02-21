/**
 * Shared utilities for ARGUS hooks
 */

const fs = require('fs');
const path = require('path');

// Session state file path
const SESSION_STATE_PATH = path.join(process.env.CLAUDE_PLUGIN_ROOT, '.session-state.json');

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
  SESSION_STATE_PATH,
};
