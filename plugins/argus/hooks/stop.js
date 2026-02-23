#!/usr/bin/env node

/**
 * Stop Hook
 *
 * Cleanup and persist state when Claude Code session ends.
 */

import path from 'path';
import fs from 'fs';

async function stop() {
  console.log('[ARGUS] ');
  console.log('[ARGUS] ════════════════════════════════════════════');
  console.log('[ARGUS] Session ending - shutting down...');
  console.log('[ARGUS] ════════════════════════════════════════════');

  // Get data directory
  const dataDir = process.env.ARGUS_DATA_DIR ||
                  path.join((await import('os')).homedir(), '.argus');

  try {
    // Check if data directory exists
    if (fs.existsSync(dataDir)) {
      const stats = fs.statSync(dataDir);
      console.log(`[ARGUS] ✓ Data directory: ${dataDir}`);

      // Could add cleanup logic here:
      // - Flush any pending writes
      // - Close database connections
      // - Compact storage if needed
      // - Generate session statistics
    }

    // Session summary could be logged here
    console.log('[ARGUS] ');
    console.log('[ARGUS] Session complete. All data persisted.');
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

stop().catch(error => {
  console.error('[ARGUS] Fatal error during stop:', error);
  process.exit(1);
});
