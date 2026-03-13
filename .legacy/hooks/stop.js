#!/usr/bin/env node

/**
 * ARGUS Stop Hook
 *
 * Called when Claude Code session ends.
 *
 * This hook:
 * 1. Captures session summary
 * 2. Persists all queued transactions
 * 3. Generates session report
 * 4. Cleans up resources
 */

const fs = require('fs');
const path = require('path');
const {
  loadSessionState,
  saveSessionState,
  extractContext,
  cleanupSessionState,
} = require('./utils.js');

// Session logs directory
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const SESSION_LOGS_DIR = path.join(PLUGIN_ROOT, '.argus-sessions');

// Transaction queue
const TRANSACTION_QUEUE_PATH = path.join(PLUGIN_ROOT, '.argus-transaction-queue.json');

// Hook check marker
const HOOK_CHECK_MARKER = path.join(PLUGIN_ROOT, '.argus-hook-check.json');

/**
 * Generate session report
 */
function generateSessionReport(sessionState) {
  const duration = Date.now() - sessionState.startTime;
  const successfulCalls = sessionState.toolCalls.filter(t => t.success).length;
  const failedCalls = sessionState.toolCalls.length - successfulCalls;

  return {
    sessionId: sessionState.sessionId,
    startTime: sessionState.startTime,
    endTime: Date.now(),
    duration,
    summary: {
      totalToolCalls: sessionState.toolCalls.length,
      successfulCalls,
      failedCalls,
      successRate: sessionState.toolCalls.length > 0
        ? (successfulCalls / sessionState.toolCalls.length * 100).toFixed(2) + '%'
        : 'N/A',
    },
    toolsUsed: countToolUsage(sessionState.toolCalls),
    cwd: sessionState.cwd,
    platform: sessionState.platform,
  };
}

/**
 * Count tool usage
 */
function countToolUsage(toolCalls) {
  const counts = {};

  for (const call of toolCalls) {
    const name = call.name || 'unknown';
    counts[name] = (counts[name] || 0) + 1;
  }

  return counts;
}

/**
 * Finalize session log
 */
function finalizeSessionLog(sessionId, report) {
  try {
    const sessionLogFile = path.join(
      SESSION_LOGS_DIR,
      `${sessionId}.json`
    );

    if (!fs.existsSync(sessionLogFile)) {
      return;
    }

    const sessionData = JSON.parse(fs.readFileSync(sessionLogFile, 'utf-8'));

    // Add end event and report
    sessionData.events.push({
      type: 'session_end',
      timestamp: Date.now(),
      report,
    });

    sessionData.report = report;

    fs.writeFileSync(
      sessionLogFile,
      JSON.stringify(sessionData, null, 2)
    );

    console.error(`[ARGUS] Session log finalized: ${sessionLogFile}`);
  } catch (error) {
    console.error('[ARGUS] Failed to finalize session log:', error.message);
  }
}

/**
 * Save transaction queue to disk for later processing
 */
function persistTransactionQueue() {
  try {
    if (!fs.existsSync(TRANSACTION_QUEUE_PATH)) {
      console.error('[ARGUS] No transactions to persist');
      return;
    }

    // Read queue
    const queue = JSON.parse(fs.readFileSync(TRANSACTION_QUEUE_PATH, 'utf-8'));

    if (queue.length === 0) {
      console.error('[ARGUS] Transaction queue is empty');
      return;
    }

    // Save to sessions directory with timestamp
    const queueFile = path.join(
      SESSION_LOGS_DIR,
      `transactions_${Date.now()}.json`
    );

    fs.writeFileSync(
      queueFile,
      JSON.stringify(queue, null, 2)
    );

    console.error(`[ARGUS] Persisted ${queue.length} transactions to ${queueFile}`);

    // Clear queue
    fs.unlinkSync(TRANSACTION_QUEUE_PATH);

    return queue.length;
  } catch (error) {
    console.error('[ARGUS] Failed to persist transaction queue:', error.message);
    return 0;
  }
}

/**
 * Cleanup temporary files
 */
function cleanupTempFiles() {
  try {
    // Clean up hook check marker
    if (fs.existsSync(HOOK_CHECK_MARKER)) {
      fs.unlinkSync(HOOK_CHECK_MARKER);
    }

    // Clean up session state
    cleanupSessionState();

    console.error('[ARGUS] Temporary files cleaned up');
  } catch (error) {
    console.error('[ARGUS] Failed to cleanup temp files:', error.message);
  }
}

/**
 * Format duration for display
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Main hook logic
 */
function main() {
  try {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('  🛡️  ARGUS - Session Ending');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');

    // Load session state
    const sessionState = loadSessionState();

    if (!sessionState.sessionId) {
      console.error('[ARGUS] No active session found');
      process.exit(0);
    }

    // Generate session report
    const report = generateSessionReport(sessionState);

    console.error(`  Session ID: ${report.sessionId}`);
    console.error(`  Duration: ${formatDuration(report.duration)}`);
    console.error('');
    console.error('  📊 Session Summary:');
    console.error(`     Total tool calls: ${report.summary.totalToolCalls}`);
    console.error(`     Successful: ${report.summary.successfulCalls}`);
    console.error(`     Failed: ${report.summary.failedCalls}`);
    console.error(`     Success rate: ${report.summary.successRate}`);
    console.error('');
    console.error('  🔧 Tools Used:');
    for (const [tool, count] of Object.entries(report.toolsUsed)) {
      console.error(`     • ${tool}: ${count}x`);
    }
    console.error('');

    // Finalize session log
    finalizeSessionLog(sessionState.sessionId, report);

    // Persist transaction queue
    const persistedCount = persistTransactionQueue();
    if (persistedCount > 0) {
      console.error(`  💾 Persisted ${persistedCount} transactions for later processing`);
      console.error('');
    }

    // Cleanup
    cleanupTempFiles();

    console.error('═══════════════════════════════════════════════════════════');
    console.error('  ✅ ARGUS session ended gracefully');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');

    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Stop hook error:', error.message);
    // Don't fail on cleanup errors
    process.exit(0);
  }
}

// Run the hook
main();
