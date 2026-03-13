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
const TRANSACTIONS_FILE = path.join(ARGUS_HOME, 'transactions.jsonl');

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
 * Append transaction to storage file
 */
function appendTransaction(transaction) {
  try {
    const line = JSON.stringify(transaction) + '\n';
    fs.appendFileSync(TRANSACTIONS_FILE, line);
    return true;
  } catch (error) {
    console.error('[ARGUS Queue] Error appending transaction:', error.message);
    return false;
  }
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
          summary: item.summary || item.prompt,  // Human-readable summary
          intent: item.intent || 'tool_use'      // Inferred intent
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
          tags: [...(item.metadata?.tags || []), 'queue_processed'],
          category: item.metadata?.category,
          summary: item.summary || item.prompt,  // Store summary for display
          intent: item.intent || 'tool_use',    // Store intent for filtering
          relatedHooks: item.metadata?.relatedHooks || []
        }
      };

      if (appendTransaction(transaction)) {
        processed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error('[ARGUS Queue] Error processing transaction:', error.message);
      failed++;
    }
  }

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
