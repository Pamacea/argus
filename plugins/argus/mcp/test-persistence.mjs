#!/usr/bin/env node
/**
 * Simple test to check if transactions persist in the database
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.argus', 'argus.db');

async function testPersistence() {
  console.log('🧪 Testing transaction persistence...\n');

  // Check if database file exists
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Database file not found:', dbPath);
    return;
  }

  const stats = fs.statSync(dbPath);
  console.log(`✅ Database file found: ${dbPath}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // Load database
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  // Get transaction count
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM transactions`);
  if (stmt.step()) {
    const count = stmt.getAsObject({ count: 0 }).count;
    console.log(`\n📊 Transaction count: ${count}`);
  }
  stmt.free();

  // Get date range
  const rangeStmt = db.prepare(`
    SELECT
      MIN(timestamp) as oldest,
      MAX(timestamp) as newest
    FROM transactions
  `);
  if (rangeStmt.step()) {
    const { oldest, newest } = rangeStmt.getAsObject({ oldest: 0, newest: 0 });
    if (oldest && newest) {
      console.log(`   Oldest: ${new Date(Number(oldest)).toISOString()}`);
      console.log(`   Newest: ${new Date(Number(newest)).toISOString()}`);

      const daysDiff = (Number(newest) - Number(oldest)) / (1000 * 60 * 60 * 24);
      console.log(`   Time span: ${daysDiff.toFixed(1)} days`);
    }
  }
  rangeStmt.free();

  // Get recent transactions
  const recentStmt = db.prepare(`
    SELECT id, timestamp, prompt_raw
    FROM transactions
    ORDER BY timestamp DESC
    LIMIT 5
  `);

  console.log('\n📝 Recent transactions:');
  while (recentStmt.step()) {
    const tx = recentStmt.getAsObject({ id: '', timestamp: 0, prompt_raw: '' });
    const preview = tx.prompt_raw.substring(0, 60);
    console.log(`   ${new Date(Number(tx.timestamp)).toLocaleString()}: ${preview}...`);
  }
  recentStmt.free();

  db.close();

  console.log('\n✅ Test complete!');
  console.log('\n💡 If you see transactions above, persistence is working.');
  console.log('💡 The database is saved at: ~/.argus/argus.db');
  console.log('💡 With the new changes, transactions will persist across sessions.');
}

testPersistence().catch(console.error);
