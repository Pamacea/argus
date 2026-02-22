#!/usr/bin/env node

/**
 * Simple script to start the web dashboard server in background
 * This script is called by session-start.js to avoid spawn issues
 */

const { spawn } = require('child_process');
const path = require('path');

// Get paths from environment
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
const webServerPath = path.join(pluginRoot, 'mcp', 'web', 'server.js');

console.log('[ARGUS Web] Starting web dashboard...');

// Start the server
const server = spawn('node', [webServerPath], {
  detached: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    ARGUS_DATA_DIR: process.env.ARGUS_DATA_DIR || path.join(require('os').homedir(), '.argus'),
    ARGUS_WEB_PORT: process.env.ARGUS_WEB_PORT || '30000',
    ARGUS_WEB_HOST: process.env.ARGUS_WEB_HOST || 'localhost'
  }
});

server.unref();

// Exit immediately, leaving the server running in background
process.exit(0);
