#!/usr/bin/env node

/**
 * Simple script to start the web dashboard server in background
 * This script is called by session-start.js to avoid spawn issues
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Get paths from environment
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
const webServerPath = path.join(pluginRoot, 'mcp', 'web', 'server.js');

console.log('[ARGUS Web] Starting web dashboard...');
console.log('[ARGUS Web] Server path:', webServerPath);

// Get the web directory (where index.html is located)
const webDir = path.dirname(webServerPath);
console.log('[ARGUS Web] Working directory:', webDir);

// Start the server with correct working directory
const server = spawn('node', [webServerPath], {
  cwd: webDir,  // Set working directory to where index.html is located
  detached: true,
  stdio: ['ignore', 'ignore', 'ignore'],
  env: {
    ...process.env,
    ARGUS_DATA_DIR: process.env.ARGUS_DATA_DIR || path.join(os.homedir(), '.argus'),
    ARGUS_WEB_PORT: process.env.ARGUS_WEB_PORT || '30000',
    ARGUS_WEB_HOST: process.env.ARGUS_WEB_HOST || 'localhost'
  }
});

server.unref();

console.log('[ARGUS Web] Server started with PID:', server.pid);

// Exit immediately, leaving the server running in background
process.exit(0);
