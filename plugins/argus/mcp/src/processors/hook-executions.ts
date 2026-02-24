/**
 * Hook Executions Processor
 *
 * Processes hook_executions.jsonl file and records executions to database.
 * This is similar to the queue processor but for hook executions tracking.
 */

import fs from 'fs';
import path from 'path';
import { getStorage } from '../storage/index.js';

const ARGUS_HOME = process.env.ARGUS_DATA_DIR ||
  path.join(process.env.HOME || process.env.USERPROFILE || '.', '.argus');
const HOOK_EXECUTIONS_PATH = path.join(ARGUS_HOME, 'hook_executions.jsonl');

let processing = false;

/**
 * Process hook executions from the JSONL file
 */
export async function processHookExecutions(): Promise<number> {
  if (processing) {
    return 0; // Already processing
  }

  if (!fs.existsSync(HOOK_EXECUTIONS_PATH)) {
    return 0; // No file to process
  }

  processing = true;

  try {
    const data = fs.readFileSync(HOOK_EXECUTIONS_PATH, 'utf-8');
    const lines = data.trim().split('\n').filter(l => l);

    if (lines.length === 0) {
      return 0;
    }

    const storage = getStorage();
    let processedCount = 0;

    for (const line of lines) {
      try {
        const execution = JSON.parse(line);

        // Record to database
        await storage.recordHookExecution(
          execution.hook_name,
          execution.hook_type,
          execution.session_id,
          execution.duration_ms
        );

        processedCount++;
      } catch (error) {
        console.error('[ARGUS] Failed to process hook execution:', error);
      }
    }

    // Clear the file after successful processing
    fs.unlinkSync(HOOK_EXECUTIONS_PATH);

    console.log(`[ARGUS] ✓ Processed ${processedCount} hook executions`);
    return processedCount;
  } catch (error) {
    console.error('[ARGUS] Error processing hook executions:', error);
    return 0;
  } finally {
    processing = false;
  }
}

/**
 * Start periodic processing of hook executions
 */
export function startHookExecutionProcessor(intervalMs: number = 10000): NodeJS.Timeout {
  return setInterval(async () => {
    await processHookExecutions();
  }, intervalMs);
}
