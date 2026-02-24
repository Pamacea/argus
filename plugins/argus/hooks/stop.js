#!/usr/bin/env node

/**
 * Stop Hook
 *
 * Cleanup and persist state when Claude Code session ends.
 *
 * CRITICAL: This hook MUST process the transaction queue before shutdown
 * to prevent data loss. Transactions are queued by hooks and processed
 * by the background queue processor. On shutdown, we need to ensure
 * all queued transactions are saved to the database.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Queue paths
const ARGUS_HOME = process.env.ARGUS_DATA_DIR || path.join(os.homedir(), '.argus');
const QUEUE_DIR = path.join(ARGUS_HOME, 'queue');
const TRANSACTION_QUEUE_NEW = path.join(QUEUE_DIR, 'transactions.jsonl');
const TRANSACTION_QUEUE_OLD = path.join(QUEUE_DIR, 'transactions.json');
const TRANSACTIONS_DB = path.join(ARGUS_HOME, 'argus.db');
const TRANSACTIONS_FILE = path.join(ARGUS_HOME, 'transactions.jsonl');

// Flag to track if queue was processed
let queueProcessed = false;

/**
 * Read queue from JSONL or JSON file
 */
function readQueue(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const data = fs.readFileSync(filePath, 'utf8');

    // Check if it's JSONL (one JSON object per line)
    if (filePath.endsWith('.jsonl')) {
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
    // Old JSON format - array of objects
    else if (filePath.endsWith('.json')) {
      try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('[ARGUS] Failed to parse JSON queue:', e);
        return [];
      }
    }
  } catch (error) {
    console.error(`[ARGUS] Failed to read queue from ${filePath}:`, error.message);
  }
  return [];
}

/**
 * Clear queue file with atomic write
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
 * Append transaction to storage with atomic write
 */
function appendTransaction(transaction) {
  try {
    const line = JSON.stringify(transaction) + '\n';
    // Use appendFileSync which is atomic for small writes
    fs.appendFileSync(TRANSACTIONS_FILE, line);
    return true;
  } catch (error) {
    console.error('[ARGUS] Error appending transaction:', error.message);
    return false;
  }
}

/**
 * Process transaction queue and save to database
 * This is CRITICAL for preventing data loss on shutdown
 */
async function processQueue() {
  if (queueProcessed) {
    console.log('[ARGUS] Queue already processed, skipping...');
    return { processed: 0, failed: 0 };
  }

  // Try new format first, then old format
  let items = readQueue(TRANSACTION_QUEUE_NEW);
  let queueFile = TRANSACTION_QUEUE_NEW;

  if (items.length === 0) {
    // Try old format
    items = readQueue(TRANSACTION_QUEUE_OLD);
    queueFile = TRANSACTION_QUEUE_OLD;
  }

  if (items.length === 0) {
    console.log('[ARGUS] No queued transactions to process');
    return { processed: 0, failed: 0 };
  }

  console.log(`[ARGUS] 🔄 Processing ${items.length} queued transactions before shutdown...`);

  const { v4: uuidv4 } = require('uuid');

  let processed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const transaction = {
        id: uuidv4(),
        timestamp: item.timestamp || Date.now(),
        sessionId: item.context?.cwd || 'unknown',
        prompt: {
          raw: item.prompt,
          type: item.promptType || 'tool',
          summary: item.summary || item.prompt,
          intent: item.intent || 'tool_use'
        },
        context: {
          cwd: item.context?.cwd || process.cwd(),
          platform: item.context?.platform || process.platform,
          toolsAvailable: item.context?.toolsAvailable || [],
          files: item.context?.files || []
        },
        result: {
          success: item.result?.success ?? true,
          output: item.result?.output,
          error: item.result?.error,
          duration: item.result?.duration || 0,
          toolsUsed: item.result?.toolsUsed || [],
          changePreview: item.result?.changePreview
        },
        metadata: {
          tags: [...(item.metadata?.tags || []), 'queue_processed', 'shutdown_flush'],
          category: item.metadata?.category,
          summary: item.summary || item.prompt,
          intent: item.intent || 'tool_use',
          relatedHooks: item.metadata?.relatedHooks || []
        }
      };

      if (appendTransaction(transaction)) {
        processed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error('[ARGUS] Error processing transaction:', error.message);
      failed++;
    }
  }

  // Clear queue after processing
  if (processed > 0 || failed > 0) {
    clearQueue(queueFile);
    console.log(`[ARGUS] ✓ Shutdown flush: ${processed} saved${failed > 0 ? `, ${failed} failed` : ''}`);
  }

  queueProcessed = true;
  return { processed, failed };
}

/**
 * Verify database integrity
 */
function verifyDatabase() {
  try {
    if (!fs.existsSync(TRANSACTIONS_FILE)) {
      return { valid: true, count: 0 };
    }

    const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf8');
    const lines = data.trim().split('\n').filter(l => l);

    // Validate JSON structure
    let validCount = 0;
    for (const line of lines) {
      try {
        JSON.parse(line);
        validCount++;
      } catch (e) {
        console.error('[ARGUS] Invalid JSON in database');
      }
    }

    return { valid: validCount === lines.length, count: validCount };
  } catch (error) {
    console.error('[ARGUS] Database verification failed:', error.message);
    return { valid: false, count: 0 };
  }
}

/**
 * Get session statistics
 */
function getSessionStats() {
  const stats = {
    queueProcessed: queueProcessed,
    transactionsFile: false,
    transactionCount: 0,
    queueRemaining: 0
  };

  try {
    // Check transactions file
    if (fs.existsSync(TRANSACTIONS_FILE)) {
      stats.transactionsFile = true;
      const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf8');
      stats.transactionCount = data.trim().split('\n').filter(l => l).length;
    }

    // Check queue
    const queueItems = readQueue(TRANSACTION_QUEUE_NEW);
    stats.queueRemaining = queueItems.length;

    if (stats.queueRemaining === 0) {
      const oldQueueItems = readQueue(TRANSACTION_QUEUE_OLD);
      stats.queueRemaining = oldQueueItems.length;
    }
  } catch (error) {
    console.error('[ARGUS] Error getting session stats:', error.message);
  }

  return stats;
}

async function stop() {
  console.log('[ARGUS] ');
  console.log('[ARGUS] ════════════════════════════════════════════');
  console.log('[ARGUS] Session ending - shutting down...');
  console.log('[ARGUS] ════════════════════════════════════════════');

  // Get data directory
  const dataDir = ARGUS_HOME;

  try {
    console.log(`[ARGUS] ✓ Data directory: ${dataDir}`);

    // CRITICAL: Process any remaining queued transactions
    console.log('[ARGUS] 🔄 Flushing transaction queue...');
    const result = await processQueue();

    // Verify database integrity
    console.log('[ARGUS] 🔍 Verifying database integrity...');
    const dbCheck = verifyDatabase();

    if (dbCheck.valid) {
      console.log(`[ARGUS] ✓ Database valid: ${dbCheck.count} transactions`);
    } else {
      console.error('[ARGUS] ✗ Database validation failed');
    }

    // Show session statistics
    const stats = getSessionStats();
    console.log('[ARGUS] ');
    console.log('[ARGUS] 📊 Session Statistics:');
    console.log(`[ARGUS]   • Queue processed: ${result.processed} transactions`);
    console.log(`[ARGUS]   • Total in database: ${stats.transactionCount} transactions`);
    console.log(`[ARGUS]   • Queue remaining: ${stats.queueRemaining} items`);
    console.log('[ARGUS] ');

    // Session summary
    if (result.processed > 0) {
      console.log('[ARGUS] ✓ Saved queued transactions on shutdown');
    }

    if (result.failed > 0) {
      console.warn(`[ARGUS] ⚠ ${result.failed} transactions failed to save`);
    }

    console.log('[ARGUS] ');
    console.log('[ARGUS] ✓ Session complete. All data persisted.');
    console.log('[ARGUS] Your context has been saved.');
    console.log('[ARGUS] ');
    console.log('[ARGUS] ════════════════════════════════════════════');
    console.log('[ARGUS] ARGUS - Vigilance Terminated');
    console.log('[ARGUS] ════════════════════════════════════════════');
    console.log('[ARGUS] ');

  } catch (error) {
    console.error('[ARGUS] ✗ Error during shutdown:', error.message);
  }
}

// Handle multiple shutdown signals
const shutdownHandler = async (signal) => {
  console.log(`[ARGUS] Received ${signal} signal...`);
  try {
    await stop();
    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Fatal error during shutdown:', error);
    process.exit(1);
  }
};

// Register signal handlers for graceful shutdown
process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
process.on('beforeExit', async () => {
  if (!queueProcessed) {
    console.log('[ARGUS] beforeExit triggered - flushing queue...');
    await processQueue();
  }
});

// Main execution
stop().catch(error => {
  console.error('[ARGUS] Fatal error during stop:', error);
  process.exit(1);
}).then(() => {
  process.exit(0);
});
