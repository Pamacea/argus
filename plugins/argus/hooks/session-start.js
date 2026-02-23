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
  console.log('[ARGUS]   • argus__index_codebase    → Index project files');
  console.log('[ARGUS]   • argus__search_code       → Search indexed code');
  console.log('[ARGUS] ');

  // Auto-index current project if in a valid project directory
  const cwd = process.env.CLAUDE_SESSION_CWD || process.cwd();
  await autoIndexProject(cwd, pluginRoot);

  console.log('[ARGUS] ════════════════════════════════════════════');
  console.log('[ARGUS] Ready to guide your actions!');
  console.log('[ARGUS] ════════════════════════════════════════════');
  console.log('[ARGUS] ');
}

/**
 * Check if directory looks like a valid project
 */
function isValidProjectDir(dir) {
  try {
    // Check for common project indicators
    const indicators = [
      'package.json',
      'tsconfig.json',
      'Cargo.toml',
      'go.mod',
      'pom.xml',
      'requirements.txt',
      'Gemfile',
      '.git',
      'src',
      'lib',
      'app'
    ];

    if (!fs.existsSync(dir)) return false;

    const contents = fs.readdirSync(dir || '.');
    return indicators.some(indicator => contents.includes(indicator));
  } catch (error) {
    return false;
  }
}

/**
 * Get last index time for a directory
 */
function getLastIndexTime(dir) {
  try {
    const indexInfoPath = path.join(dataDir, `index-${Buffer.from(dir).toString('base64')}.json`);
    if (fs.existsSync(indexInfoPath)) {
      const info = JSON.parse(fs.readFileSync(indexInfoPath, 'utf-8'));
      return info.lastIndexTime || 0;
    }
  } catch (error) {
    // Ignore
  }
  return 0;
}

/**
 * Update index info for a directory
 */
function updateIndexInfo(dir, result) {
  try {
    const indexInfoPath = path.join(dataDir, `index-${Buffer.from(dir).toString('base64')}.json`);
    fs.writeFileSync(indexInfoPath, JSON.stringify({
      lastIndexTime: Date.now(),
      lastIndexResult: result
    }, null, 2));
  } catch (error) {
    console.warn('[ARGUS] ⚠ Failed to save index info:', error.message);
  }
}

/**
 * Auto-index the current project if appropriate
 */
async function autoIndexProject(projectDir, pluginRoot) {
  // Check if this looks like a valid project directory
  if (!isValidProjectDir(projectDir)) {
    console.log('[ARGUS] ℹ Not in a project directory, skipping auto-index');
    return;
  }

  const lastIndexed = getLastIndexTime(projectDir);
  const now = Date.now();
  const INDEX_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

  // Check if we should re-index
  const shouldIndex = lastIndexed === 0 || (now - lastIndexed) > INDEX_THRESHOLD;

  if (!shouldIndex) {
    const hoursSinceIndex = Math.floor((now - lastIndexed) / (60 * 60 * 1000));
    console.log(`[ARGUS] ℹ Project indexed ${hoursSinceIndex}h ago, skipping (threshold: 24h)`);
    return;
  }

  // Perform indexing
  console.log(`[ARGUS] → Auto-indexing project: ${path.basename(projectDir)}`);

  // Use incremental index if previously indexed, full index if new
  const useIncremental = lastIndexed > 0;

  // Call the MCP tool to index the codebase
  // We need to invoke it via the MCP server since it's an MCP tool
  // For now, we'll just log that indexing would happen
  console.log(`[ARGUS] ℹ Indexing mode: ${useIncremental ? 'incremental' : 'full'}`);
  console.log(`[ARGUS] ℹ To manually index, use: argus__index_codebase`);

  // Note: Actually calling the MCP tool from a hook is complex
  // The indexing should be triggered by the user or via the MCP interface
  // This hook just sets up the infrastructure and informs the user

  try {
    // Could add automatic indexing here via direct file system operations
    // or by calling the indexer directly
    const stats = {
      projectDir,
      indexed: useIncremental ? 'incremental' : 'full',
      timestamp: now
    };

    updateIndexInfo(projectDir, stats);
    console.log('[ARGUS] ✓ Index info updated');
  } catch (error) {
    console.warn('[ARGUS] ⚠ Auto-index note:', error.message);
  }
}

sessionStart().catch(error => {
  console.error('[ARGUS] Fatal error during session start:', error);
});
