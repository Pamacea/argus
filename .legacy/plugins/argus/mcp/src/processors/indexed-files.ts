/**
 * Indexed Files Processor
 *
 * Processes indexed_files.jsonl file and inserts files into database.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getStorage } from '../storage/index.js';

const ARGUS_HOME = process.env.ARGUS_DATA_DIR ||
  path.join(process.env.HOME || process.env.USERPROFILE || '.', '.argus');
const INDEXED_FILES_PATH = path.join(ARGUS_HOME, 'indexed_files.jsonl');

let processing = false;

/**
 * Calculate hash of a file path for change detection
 */
function calculateHash(filePath: string): string {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

/**
 * Process indexed files from the JSONL file
 */
export async function processIndexedFiles(): Promise<number> {
  if (processing) {
    return 0; // Already processing
  }

  if (!fs.existsSync(INDEXED_FILES_PATH)) {
    return 0; // No file to process
  }

  processing = true;

  try {
    const data = fs.readFileSync(INDEXED_FILES_PATH, 'utf-8');
    const lines = data.trim().split('\n').filter(l => l);

    if (lines.length === 0) {
      return 0;
    }

    const storage = getStorage();
    let processedCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.type === 'indexed_files' && Array.isArray(entry.files)) {
          // Insert each file into the database
          for (const file of entry.files) {
            const fileHash = calculateHash(file.path);

            await storage.indexFile({
              path: file.path,
              hash: fileHash,
              size: file.size,
              indexedAt: entry.timestamp || Date.now()
            });

            processedCount++;
          }

          console.log(`[ARGUS] ✓ Processed ${entry.files.length} indexed files from ${entry.project_dir}`);
        }
      } catch (error) {
        console.error('[ARGUS] Failed to process indexed files entry:', error);
      }
    }

    // Clear the file after successful processing
    fs.unlinkSync(INDEXED_FILES_PATH);

    console.log(`[ARGUS] ✓ Total indexed files processed: ${processedCount}`);
    return processedCount;
  } catch (error) {
    console.error('[ARGUS] Error processing indexed files:', error);
    return 0;
  } finally {
    processing = false;
  }
}

/**
 * Start periodic processing of indexed files
 */
export function startIndexedFilesProcessor(intervalMs: number = 10000): NodeJS.Timeout {
  return setInterval(async () => {
    await processIndexedFiles();
  }, intervalMs);
}
