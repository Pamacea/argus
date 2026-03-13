#!/usr/bin/env node

/**
 * ARGUS SessionStart Hook
 *
 * Initializes ARGUS at the start of each Claude Code session.
 *
 * This hook:
 * 1. Creates a new session ID
 * 2. Loads previous session context if available
 * 3. Records session start time
 * 4. Sets up tracking for this session
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  loadSessionState,
  saveSessionState,
  extractContext,
} = require('./utils.js');

// Session logs directory
const SESSION_LOGS_DIR = path.join(
  process.env.CLAUDE_PLUGIN_ROOT || process.cwd(),
  '.argus-sessions'
);

/**
 * Ensure session logs directory exists
 */
function ensureSessionDir() {
  if (!fs.existsSync(SESSION_LOGS_DIR)) {
    fs.mkdirSync(SESSION_LOGS_DIR, { recursive: true });
  }
}

/**
 * Generate session ID using crypto
 */
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Initialize a new session
 */
function initializeSession() {
  const sessionId = generateSessionId();
  const startTime = Date.now();
  const context = extractContext();

  const sessionState = {
    sessionId,
    startTime,
    cwd: context.cwd,
    platform: context.platform,
    toolCalls: [],
    lastCheckedHooks: false,
    metadata: {
      nodeVersion: process.version,
      argusVersion: '1.0.0',
    },
  };

  // Save session state
  saveSessionState(sessionState);

  // Create session log file
  ensureSessionDir();
  const sessionLogFile = path.join(
    SESSION_LOGS_DIR,
    `${sessionId}.json`
  );

  fs.writeFileSync(
    sessionLogFile,
    JSON.stringify(
      {
        sessionId,
        startTime,
        context,
        events: [
          {
            type: 'session_start',
            timestamp: startTime,
            context,
          },
        ],
      },
      null,
      2
    )
  );

  console.error(`[ARGUS] Session initialized: ${sessionId}`);
  console.error(`[ARGUS] Working directory: ${context.cwd}`);
  console.error(`[ARGUS] Platform: ${context.platform}`);

  return sessionState;
}

/**
 * Main hook logic
 */
function main() {
  try {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('  🛡️  ARGUS - Advanced RAG-powered Guardian System');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');

    // Initialize new session
    const sessionState = initializeSession();

    console.error(`  Session ID: ${sessionState.sessionId}`);
    console.error(`  Started at: ${new Date(sessionState.startTime).toISOString()}`);
    console.error('');
    console.error('  📋 Features enabled:');
    console.error('     • Semantic memory retrieval');
    console.error('     • Hook-based context awareness');
    console.error('     • Automatic transaction logging');
    console.error('     • Protected tool enforcement');
    console.error('');
    console.error('  ⚠️  Protected tools require argus__check_hooks:');
    console.error('     • Explore');
    console.error('     • CreateTeam');
    console.error('     • CreateAgents');
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');

    // Save session ID to environment for other hooks to use
    process.env.ARGUS_SESSION_ID = sessionState.sessionId;

    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] SessionStart error:', error.message);
    // Don't fail the session if ARGUS initialization fails
    process.exit(0);
  }
}

// Run the hook
main();
