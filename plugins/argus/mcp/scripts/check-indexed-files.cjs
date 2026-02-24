#!/usr/bin/env node

/**
 * Check indexed files in database
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.argus',
  'argus.db'
);

console.log('[CHECK] Database path:', DB_PATH);

if (!fs.existsSync(DB_PATH)) {
  console.log('[CHECK] Database not found');
  process.exit(1);
}

console.log('[CHECK] Database size:', fs.statSync(DB_PATH).size, 'bytes');

// Read and search for indexed_files table references
const data = fs.readFileSync(DB_PATH);
const content = data.toString('utf-8');

// Look for file paths in the database
const matches = content.match(/indexed_files|\.ts"|\.js"|\.json/g) || [];

console.log('[CHECK] Found', matches.length, 'potential indexed file references');

// Count unique table occurrences
const tableMatch = content.match(/indexed_files/g);
console.log('[CHECK] "indexed_files" table mentioned:', tableMatch ? tableMatch.length : 0, 'times');

// Look for CREATE TABLE
const createTableMatch = content.match(/CREATE TABLE.*indexed_files/s);
console.log('[CHECK] CREATE TABLE indexed_files found:', !!createTableMatch);

// Look for INSERT into indexed_files
const insertMatch = content.match(/INSERT INTO indexed_files/g);
console.log('[CHECK] INSERT INTO indexed_files found:', insertMatch ? insertMatch.length : 0, 'times');

console.log('\n[CHECK] Summary:');
console.log('  - Database exists: ✓');
console.log('  - indexed_files table:', createTableMatch ? '✓' : '?');
console.log('  - Files inserted:', insertMatch ? insertMatch.length : 0);
