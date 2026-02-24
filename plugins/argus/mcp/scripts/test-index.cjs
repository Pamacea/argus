#!/usr/bin/env node

/**
 * Test script to trigger indexing
 */

const { queueIndexedFiles } = require('../../hooks/utils');
const fs = require('fs');
const path = require('path');

const projectDir = process.cwd();

// Simulate finding some files
const testFiles = [
  { path: path.join(projectDir, 'package.json'), relative: 'package.json', size: 1000 },
  { path: path.join(projectDir, 'README.md'), relative: 'README.md', size: 2000 },
  { path: path.join(projectDir, 'src', 'index.ts'), relative: 'src/index.ts', size: 3000 },
];

console.log('[TEST] Queueing test files for indexing...');
queueIndexedFiles(testFiles, projectDir, 'test');
console.log('[TEST] Done! Check ~/.argus/indexed_files.jsonl');
