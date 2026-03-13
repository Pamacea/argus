#!/usr/bin/env node

/**
 * Standalone indexer for ARGUS
 * Can be run from any project directory
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Get current directory (project root)
const projectDir = process.cwd();
console.log('[ARGUS] Scanning project:', projectDir);

const indexedFiles = [];
const skipDirs = ['node_modules', '.git', '.next', 'dist', 'build', 'cache', '.claude', 'coverage', '.vscode', 'tmp'];

// File extensions to index
const targetExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.rs', '.go', '.java', '.cjs', '.mjs'];

function walkDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);

      try {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (!skipDirs.includes(file)) {
            walkDir(fullPath);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(file);
          if (targetExtensions.includes(ext)) {
            indexedFiles.push({
              path: fullPath,
              relative: path.relative(projectDir, fullPath),
              size: stat.size,
              modified: stat.mtime.getTime()
            });
          }
        }
      } catch (statError) {
        // Skip files we can't stat
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }
}

// Start scanning from project root
walkDir(projectDir);

// Ensure ARGUS data directory exists
const dataDir = path.join(os.homedir(), '.argus');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Save index
const indexFile = path.join(dataDir, 'index-' + Buffer.from(projectDir).toString('base64') + '.json');

const indexData = {
  projectDir,
  name: path.basename(projectDir),
  indexed: 'full',
  fileCount: indexedFiles.length,
  files: indexedFiles.slice(0, 500), // Keep first 500 files
  timestamp: Date.now()
};

fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2));

console.log('[ARGUS] ✓ Indexed', indexedFiles.length, 'files');
console.log('[ARGUS] ✓ Index saved to:', indexFile);
console.log('[ARGUS] ✓ View at: http://localhost:30000');
