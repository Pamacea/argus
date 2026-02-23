#!/usr/bin/env node

/**
 * Queue Processor Hook
 *
 * Processes queued transactions from hooks and saves them to storage.
 * This runs as a background process started by session-start.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Queue paths
const ARGUS_HOME = path.join(os.homedir(), '.argus');
const QUEUE_DIR = path.join(ARGUS_HOME, 'queue');
const TRANSACTION_QUEUE = path.join(QUEUE_DIR, 'transactions.jsonl');
const STORAGE_DB = path.join(ARGUS_HOME, 'transactions.sqlite');

/**
 * Read queue from JSONL file
 */
function readQueue(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.trim().split('\n').filter(l => l);

    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.error('[ARGUS Queue] Failed to parse line:', line.substring(0, 100));
        return null;
      }
    }).filter(item => item !== null);
  } catch (error) {
    console.error('[ARGUS Queue] Error reading queue:', error.message);
    return [];
  }
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
    console.error('[ARGUS Queue] Error clearing queue:', error.message);
  }
}

/**
 * Initialize SQLite database
 */
function initDatabase() {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(STORAGE_DB);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      timestamp INTEGER,
      sessionId TEXT,
      prompt TEXT,
      promptType TEXT,
      context TEXT,
      result TEXT,
      metadata TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_timestamp ON transactions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_sessionId ON transactions(sessionId);
    CREATE INDEX IF NOT EXISTS idx_promptType ON transactions(promptType);
  `);

  return db;
}

/**
 * Save transaction to database
 */
function saveTransaction(db, transaction) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO transactions
      (id, timestamp, sessionId, prompt, promptType, context, result, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      transaction.id,
      transaction.timestamp,
      transaction.sessionId,
      transaction.prompt.raw,
      transaction.prompt.type,
      JSON.stringify(transaction.context),
      JSON.stringify(transaction.result),
      JSON.stringify(transaction.metadata),
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );

    stmt.finalize();
  });
}

/**
 * Process transaction queue
 */
async function processQueue() {
  const items = readQueue(TRANSACTION_QUEUE);

  if (items.length === 0) {
    return { processed: 0, failed: 0 };
  }

  console.log(`[ARGUS Queue] Processing ${items.length} transactions...`);

  const { v4: uuidv4 } = require('uuid');
  const db = initDatabase();

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
          type: item.promptType || 'tool'
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
          toolsUsed: item.result?.toolsUsed || []
        },
        metadata: {
          tags: [...(item.metadata?.tags || []), 'queue_processed'],
          category: item.metadata?.category,
          relatedHooks: item.metadata?.relatedHooks || []
        }
      };

      await saveTransaction(db, transaction);
      processed++;
    } catch (error) {
      console.error('[ARGUS Queue] Error saving transaction:', error.message);
      failed++;
    }
  }

  db.close();

  // Clear queue after processing
  if (processed > 0 || failed > 0) {
    clearQueue(TRANSACTION_QUEUE);
    console.log(`[ARGUS Queue] ✓ Processed ${processed} transactions${failed > 0 ? `, ${failed} failed` : ''}`);
  }

  return { processed, failed };
}

/**
 * Main processing loop
 */
function startProcessor(intervalMs = 5000) {
  console.log(`[ARGUS Queue] Starting processor (interval: ${intervalMs}ms)`);

  // Process immediately on start
  processQueue().catch(error => {
    console.error('[ARGUS Queue] Error in initial process:', error);
  });

  // Then process periodically
  const interval = setInterval(async () => {
    try {
      await processQueue();
    } catch (error) {
      console.error('[ARGUS Queue] Error processing queue:', error);
    }
  }, intervalMs);

  // Keep process alive
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('[ARGUS Queue] Processor stopped');
    process.exit(0);
  });
}

// Run processor if executed directly
if (require.main === module) {
  startProcessor();
}

module.exports = { processQueue, startProcessor };
