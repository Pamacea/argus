#!/usr/bin/env node

/**
 * Debug Hook - Permet de voir comment Claude Code appelle les hooks
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const debugPath = path.join(os.homedir(), '.argus', 'debug-hook.log');

const debugInfo = {
  timestamp: new Date().toISOString(),
  argv: process.argv,
  env: Object.keys(process.env)
    .filter(key => key.startsWith('ARGUS_') || key.includes('TOOL') || key.includes('CMD'))
    .reduce((acc, key) => {
      acc[key] = process.env[key];
      return acc;
    }, {}),
  stdin: ''
};

// Lire stdin si disponible (sans for await)
try {
  let stdinData = '';
  process.stdin.on('data', (chunk) => {
    stdinData += chunk;
  });
  process.stdin.on('end', () => {
    debugInfo.stdin = stdinData.substring(0, 500); // Premier 500 chars
    logAndExit();
  });

  // Timeout si stdin est vide
  setTimeout(() => {
    logAndExit();
  }, 100);
} catch (e) {
  debugInfo.stdinError = e.message;
  logAndExit();
}

function logAndExit() {
  try {
    fs.appendFileSync(debugPath, JSON.stringify(debugInfo, null, 2) + '\n---\n');
    console.log('[DEBUG] Hook info logged to:', debugPath);
  } catch (e) {
    console.error('[DEBUG] Error logging:', e.message);
  }
  process.exit(0);
}
