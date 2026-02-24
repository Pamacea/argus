#!/usr/bin/env node

/**
 * Manually process indexed files
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEXED_FILES_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.argus',
  'indexed_files.jsonl'
);

const DB_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.argus',
  'argus.db'
);

console.log('[PROCESS] Checking for indexed files to process...');

if (!fs.existsSync(INDEXED_FILES_PATH)) {
  console.log('[PROCESS] No indexed files to process');
  console.log('[PROCESS] Creating test file...');

  // Create a test file
  const testEntry = JSON.stringify({
    type: 'indexed_files',
    project_dir: process.cwd(),
    index_type: 'test',
    files: [
      { path: path.join(process.cwd(), 'test1.ts'), size: 1000 },
      { path: path.join(process.cwd(), 'test2.ts'), size: 2000 },
      { path: path.join(process.cwd(), 'test3.ts'), size: 3000 }
    ],
    timestamp: Date.now()
  });

  fs.appendFileSync(INDEXED_FILES_PATH, testEntry + '\n');
  console.log('[PROCESS] Test file created');
}

// Read and parse
const data = fs.readFileSync(INDEXED_FILES_PATH, 'utf-8');
const lines = data.trim().split('\n').filter(l => l);

console.log('[PROCESS] Found', lines.length, 'entries');

let totalFiles = 0;
for (const line of lines) {
  try {
    const entry = JSON.parse(line);

    if (entry.type === 'indexed_files' && Array.isArray(entry.files)) {
      console.log('[PROCESS] Processing', entry.files.length, 'files from', entry.project_dir);

      // Calculate hashes
      const filesWithHashes = entry.files.map(file => ({
        ...file,
        hash: crypto.createHash('md5').update(file.path).digest('hex')
      }));

      totalFiles += filesWithHashes.length;

      console.log('[PROCESS] Files to insert:', filesWithHashes.length);
      filesWithHashes.forEach(f => {
        console.log('  -', path.basename(f.path), '(' + f.hash.substring(0, 8) + ')');
      });
    }
  } catch (error) {
    console.error('[PROCESS] Error:', error.message);
  }
}

console.log('\n[PROCESS] Total files to insert:', totalFiles);
console.log('[PROCESS] Database:', DB_PATH);
console.log('[PROCESS] Note: These files will be inserted by MCP server processor');
