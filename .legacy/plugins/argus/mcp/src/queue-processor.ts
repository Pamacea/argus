/**
 * Queue Processor for ARGUS MCP Server
 *
 * Processes queued items from hooks and saves them to storage.
 * Hooks can't call MCP tools directly, so they write to queue files.
 * This processor polls the queue and processes items.
 */

import { getStorage } from './storage/index.js';
import { getRAGEngine } from './rag/index.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';

const QUEUE_DIR = path.join(os.homedir(), '.argus', 'queue');
const TRANSACTION_QUEUE_NEW = path.join(QUEUE_DIR, 'transactions.jsonl');
const TRANSACTION_QUEUE_OLD = path.join(QUEUE_DIR, 'transactions.json');
const PROMPT_QUEUE = path.join(QUEUE_DIR, 'prompts.jsonl');
const EDIT_QUEUE = path.join(QUEUE_DIR, 'edits.jsonl');

/**
 * Read queue from JSONL or JSON file (returns array of parsed objects)
 */
function readQueue(filePath: string): any[] {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');

      // Check if it's JSONL (one JSON object per line)
      if (filePath.endsWith('.jsonl')) {
        const lines = data.trim().split('\n').filter((l: string) => l);
        return lines.map((line: string) => {
          try {
            return JSON.parse(line);
          } catch (e) {
            console.error('[ARGUS] Failed to parse queue line:', line.substring(0, 100));
            return null;
          }
        }).filter((item: any) => item !== null);
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
    }
  } catch (error) {
    console.error(`[ARGUS] Failed to read queue from ${filePath}:`, error);
  }
  return [];
}

/**
 * Clear queue file
 */
function clearQueue(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`[ARGUS] Failed to clear queue ${filePath}:`, error);
  }
}

interface QueuedItem {
  type: string;
  timestamp: number;
  pid: number;
  [key: string]: any;
}

interface QueuedTransaction extends QueuedItem {
  type: 'transaction';
  prompt: string;
  promptType: string;
  context: any;
  result: any;
  metadata: any;
}

interface QueuedPrompt extends QueuedItem {
  type: 'prompt';
  prompt: string;
  context: any;
}

interface QueuedEdit extends QueuedItem {
  type: 'edit';
  filePath: string;
  operation: string;
  oldContent: string;
  newContent: string;
  context: any;
}

export class QueueProcessor {
  private storage = getStorage();
  private rag = getRAGEngine();
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /**
   * Start processing queues
   */
  start(intervalMs: number = 5000) {
    if (this.processingInterval) {
      console.warn('[ARGUS Queue] Processor already running');
      return;
    }

    console.log(`[ARGUS Queue] Starting processor (interval: ${intervalMs}ms)`);

    // Process immediately on start
    this.processAllQueues().catch(error => {
      console.error('[ARGUS Queue] Error in initial process:', error);
    });

    // Then process periodically
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processAllQueues();
      }
    }, intervalMs);
  }

  /**
   * Stop processing queues
   */
  async stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Process any remaining items before stopping
    console.log('[ARGUS Queue] Processing remaining items before shutdown...');
    await this.processAllQueues();
    console.log('[ARGUS Queue] Processor stopped');
  }

  /**
   * Process all queues
   */
  private async processAllQueues() {
    this.isProcessing = true;

    try {
      await this.processTransactionQueue();
      await this.processPromptQueue();
      await this.processEditQueue();
    } catch (error) {
      console.error('[ARGUS Queue] Error processing queues:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process transaction queue
   */
  private async processTransactionQueue() {
    // Try new format first, then old format
    let items = readQueue(TRANSACTION_QUEUE_NEW);
    let queueFile = TRANSACTION_QUEUE_NEW;

    if (items.length === 0) {
      // Try old format
      items = readQueue(TRANSACTION_QUEUE_OLD);
      queueFile = TRANSACTION_QUEUE_OLD;
    }

    if (items.length === 0) {
      return;
    }

    console.log(`[ARGUS Queue] Processing ${items.length} transactions from ${path.basename(queueFile)}`);

    let saved = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const queued = item as QueuedTransaction;

        // Convert queued item to transaction format
        const transaction = {
          id: uuidv4(),
          timestamp: queued.timestamp || Date.now(),
          sessionId: queued.context?.cwd || 'unknown',
          prompt: {
            raw: queued.prompt,
            type: queued.promptType as any
          },
          context: {
            cwd: queued.context?.cwd || process.cwd(),
            environment: queued.context?.environment || {},
            platform: queued.context?.platform || process.platform,
            toolsAvailable: queued.context?.toolsAvailable || [],
            files: queued.context?.files || []
          },
          result: {
            success: queued.result?.success ?? true,
            output: queued.result?.output,
            error: queued.result?.error,
            duration: queued.result?.duration || 0,
            toolsUsed: queued.result?.toolsUsed || []
          },
          metadata: {
            tags: [...(queued.metadata?.tags || []), 'queue_processed'],
            category: queued.metadata?.category,
            relatedHooks: queued.metadata?.relatedHooks || []
          }
        };

        // Save via RAG engine for indexing
        await this.rag.indexTransaction(transaction);
        saved++;

      } catch (error) {
        console.error('[ARGUS Queue] Error saving transaction:', error);
        failed++;
      }
    }

    // Clear queue after processing
    if (saved > 0 || failed > 0) {
      clearQueue(queueFile);
      console.log(`[ARGUS Queue] ✓ Saved ${saved} transactions${failed > 0 ? `, ${failed} failed` : ''}`);
    }
  }

  /**
   * Process prompt queue
   */
  private async processPromptQueue() {
    const items = readQueue(PROMPT_QUEUE);

    if (items.length === 0) {
      return;
    }

    console.log(`[ARGUS Queue] Processing ${items.length} prompts`);

    // Save prompts to a separate log file for analysis
    const promptLogPath = path.join(QUEUE_DIR, '..', 'prompts.log');
    const logLines = items.map(item => {
      const queued = item as QueuedPrompt;
      return JSON.stringify({
        timestamp: queued.timestamp,
        prompt: queued.prompt,
        context: queued.context
      });
    });

    try {
      fs.appendFileSync(promptLogPath, logLines.join('\n') + '\n');
      clearQueue(PROMPT_QUEUE);
      console.log(`[ARGUS Queue] ✓ Logged ${items.length} prompts`);
    } catch (error) {
      console.error('[ARGUS Queue] Error logging prompts:', error);
    }
  }

  /**
   * Process edit queue
   */
  private async processEditQueue() {
    const items = readQueue(EDIT_QUEUE);

    if (items.length === 0) {
      return;
    }

    console.log(`[ARGUS Queue] Processing ${items.length} edits`);

    // Save edits to a separate log file for analysis
    const editLogPath = path.join(QUEUE_DIR, '..', 'edits.log');
    const logLines = items.map(item => {
      const queued = item as QueuedEdit;
      return JSON.stringify({
        timestamp: queued.timestamp,
        filePath: queued.filePath,
        operation: queued.operation,
        oldSize: queued.oldContent.length,
        newSize: queued.newContent.length,
        context: queued.context
      });
    });

    try {
      fs.appendFileSync(editLogPath, logLines.join('\n') + '\n');
      clearQueue(EDIT_QUEUE);
      console.log(`[ARGUS Queue] ✓ Logged ${items.length} edits`);
    } catch (error) {
      console.error('[ARGUS Queue] Error logging edits:', error);
    }

    // Also create transactions for significant edits
    for (const item of items) {
      const queued = item as QueuedEdit;

      // Only create transactions for substantial edits
      if (queued.newContent.length > 100 || queued.oldContent.length > 100) {
        try {
          const transaction = {
            id: uuidv4(),
            timestamp: queued.timestamp || Date.now(),
            sessionId: queued.context?.cwd || 'unknown',
            prompt: {
              raw: `${queued.operation} ${queued.filePath}`,
              type: 'file_edit' as const
            },
            context: {
              cwd: queued.context?.cwd || process.cwd(),
              environment: {},
              platform: queued.context?.platform || process.platform,
              toolsAvailable: [],
              files: [{ path: queued.filePath }]
            },
            result: {
              success: true,
              output: `${queued.operation}: ${queued.oldContent.length} → ${queued.newContent.length} chars`,
              duration: 0,
              toolsUsed: [queued.operation]
            },
            metadata: {
              tags: ['file_edit', queued.operation, 'queue_processed', 'auto_tracked'],
              category: 'file_modification'
            }
          };

          await this.rag.indexTransaction(transaction);
        } catch (error) {
          console.error('[ARGUS Queue] Error creating edit transaction:', error);
        }
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const stats = {
      transactionQueue: this.countQueueLines(TRANSACTION_QUEUE_NEW) + this.countQueueLines(TRANSACTION_QUEUE_OLD),
      promptQueue: this.countQueueLines(PROMPT_QUEUE),
      editQueue: this.countQueueLines(EDIT_QUEUE),
      isProcessing: this.isProcessing
    };

    return stats;
  }

  /**
   * Count lines in a queue file
   */
  private countQueueLines(queuePath: string): number {
    try {
      if (!fs.existsSync(queuePath)) {
        return 0;
      }

      const content = fs.readFileSync(queuePath, 'utf8');

      // For JSONL files, count lines
      if (queuePath.endsWith('.jsonl')) {
        return content.trim().split('\n').filter(l => l).length;
      }
      // For JSON files, try to parse and count array items
      else if (queuePath.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content);
          return Array.isArray(parsed) ? parsed.length : 0;
        } catch {
          // Fallback: count by pattern matching
          const matches = content.match(/"promptType"/g);
          return matches ? matches.length : 0;
        }
      }
    } catch (error) {
      return 0;
    }
    return 0;
  }
}

// Singleton instance
let processorInstance: QueueProcessor | null = null;

/**
 * Get or create queue processor instance
 */
export function getQueueProcessor(): QueueProcessor {
  if (!processorInstance) {
    processorInstance = new QueueProcessor();
  }
  return processorInstance;
}
