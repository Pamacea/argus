#!/usr/bin/env node

/**
 * Session Start Hook
 *
 * Initializes ARGUS at the start of each Claude Code session.
 */

const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

/**
 * Check if a port is in use (LISTEN state only, not TIME_WAIT)
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows: Check for LISTENING state only, not TIME_WAIT
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
        // If there's output, something is listening on the port
        resolve(stdout.trim().length > 0);
      });
    } else {
      // Unix/Linux/Mac
      exec(`lsof -i :${port} 2>/dev/null || true`, (error, stdout) => {
        // If there's output, something is using the port
        resolve(stdout.trim().length > 0);
      });
    }
  });
}

/**
 * Start the web dashboard server in background
 */
function startWebServer(pluginRoot) {
  return new Promise((resolve) => {
    const webServerPath = path.join(pluginRoot, 'mcp', 'web', 'server.js');

    if (!fs.existsSync(webServerPath)) {
      console.error('[ARGUS] ✗ Web server not found at:', webServerPath);
      resolve(false);
      return;
    }

    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // On Windows, use spawn with DETACHED_PROCESS flag
      // This is the most reliable way to start a background process on Windows
      const { spawn } = require('child_process');
      const command = spawn('node', [webServerPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: {
          ...process.env,
          ARGUS_DATA_DIR: process.env.ARGUS_DATA_DIR || path.join(require('os').homedir(), '.argus'),
          ARGUS_WEB_PORT: process.env.ARGUS_WEB_PORT || '30000',
          ARGUS_WEB_HOST: process.env.ARGUS_WEB_HOST || 'localhost'
        }
      });

      command.on('error', (error) => {
        console.error('[ARGUS] ✗ Failed to start web server:', error.message);
        resolve(false);
      });

      // Unref to allow parent to exit
      command.unref();

      console.log('[ARGUS] ✓ Web dashboard server started in background...');
      resolve(true);
    } else {
      // Unix: use detached spawn
      const command = spawn('node', [webServerPath], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        env: {
          ...process.env,
          ARGUS_DATA_DIR: process.env.ARGUS_DATA_DIR || path.join(require('os').homedir(), '.argus'),
          ARGUS_WEB_PORT: process.env.ARGUS_WEB_PORT || '30000',
          ARGUS_WEB_HOST: process.env.ARGUS_WEB_HOST || 'localhost'
        }
      });

      command.on('error', (error) => {
        console.error('[ARGUS] ✗ Failed to start web server:', error.message);
        resolve(false);
      });

      command.unref();

      console.log('[ARGUS] ✓ Web dashboard server started in background...');
      resolve(true);
    }
  });
}

/**
 * Ensure web dashboard is running
 */
async function ensureWebDashboard(pluginRoot) {
  const PORT = process.env.ARGUS_WEB_PORT || 30000;
  const HOST = process.env.ARGUS_WEB_HOST || 'localhost';

  if (!pluginRoot) {
    console.warn('[ARGUS] ⚠ No plugin root, skipping web dashboard');
    return;
  }

  const portInUse = await isPortInUse(PORT);

  if (portInUse) {
    console.log(`[ARGUS] ✓ Web dashboard already running on http://${HOST}:${PORT}`);
  } else {
    console.log(`[ARGUS] → Starting web dashboard on http://${HOST}:${PORT}...`);
    const started = await startWebServer(pluginRoot);

    if (started) {
      // Give server a moment to start and verify
      await new Promise(r => setTimeout(r, 2000));

      // Verify it's now running
      const isRunning = await isPortInUse(PORT);
      if (isRunning) {
        console.log(`[ARGUS] ✓ Web dashboard is running at http://${HOST}:${PORT}`);
      } else {
        console.warn(`[ARGUS] ⚠ Web dashboard may not have started correctly`);
        console.warn(`[ARGUS]   Check logs for errors`);
      }
    } else {
      console.warn(`[ARGUS] ⚠ Failed to start web dashboard`);
      console.warn(`[ARGUS]   You can start it manually with: node ${path.join(pluginRoot, 'mcp', 'web', 'server.js')}`);
    }
  }
}

async function sessionStart() {
  console.log('[ARGUS] Initializing...');
  console.log('[ARGUS] ════════════════════════════════════════════');
  console.log('[ARGUS] Sentinelle Omnisciente - Context Awareness');
  console.log('[ARGUS] ════════════════════════════════════════════');

  // Get ARGUS data directory
  const dataDir = process.env.ARGUS_DATA_DIR ||
                  path.join(require('os').homedir(), '.argus');

  // Ensure data directory exists
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`[ARGUS] ✓ Created data directory: ${dataDir}`);
    }
  } catch (error) {
    console.error(`[ARGUS] ✗ Error creating data directory:`, error.message);
  }

  // Check MCP server availability
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot) {
    console.log(`[ARGUS] ✓ Plugin root: ${pluginRoot}`);
    // Ensure web dashboard is running
    await ensureWebDashboard(pluginRoot);
  } else {
    console.warn('[ARGUS] ⚠ CLAUDE_PLUGIN_ROOT not set');
  }

  // Session info
  const PORT = process.env.ARGUS_WEB_PORT || 30000;
  const HOST = process.env.ARGUS_WEB_HOST || 'localhost';

  console.log('[ARGUS] ');
  console.log('[ARGUS] Web Dashboard:');
  console.log(`[ARGUS]   → http://${HOST}:${PORT}`);
  console.log('[ARGUS] ');
  console.log('[ARGUS] Hooks Active:');
  console.log('[ARGUS]   • PreToolUse  → Intercepts Explore/CreateTeam');
  console.log('[ARGUS]   • PostToolUse → Saves results to memory');
  console.log('[ARGUS]   • Stop        → Persists state');
  console.log('[ARGUS] ');
  console.log('[ARGUS] MCP Tools Available:');
  console.log('[ARGUS]   • argus__check_hooks      → Consult RAG + Index + Docs');
  console.log('[ARGUS]   • argus__save_transaction  → Save to memory');
  console.log('[ARGUS]   • argus__search_memory     → Semantic search');
  console.log('[ARGUS]   • argus__get_history       → Get history');
  console.log('[ARGUS] ');
  console.log('[ARGUS] ════════════════════════════════════════════');
  console.log('[ARGUS] Ready to guide your actions!');
  console.log('[ARGUS] ════════════════════════════════════════════');
  console.log('[ARGUS] ');
}

sessionStart().catch(error => {
  console.error('[ARGUS] Fatal error during session start:', error);
});
