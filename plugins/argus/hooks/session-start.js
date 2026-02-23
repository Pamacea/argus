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
      const webDir = path.dirname(webServerPath);  // Get directory containing index.html
      const command = spawn('node', [webServerPath], {
        cwd: webDir,  // Set working directory so __dirname resolves correctly
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
      const webDir = path.dirname(webServerPath);  // Get directory containing index.html
      const command = spawn('node', [webServerPath], {
        cwd: webDir,  // Set working directory so __dirname resolves correctly
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
 * Check if Docker command is available
 */
function isDockerAvailable() {
  return new Promise((resolve) => {
    exec('docker --version', (error) => {
      resolve(!error);
    });
  });
}

/**
 * Check if Qdrant container is already running
 */
function isQdrantRunning() {
  return new Promise((resolve) => {
    exec('docker ps --filter name=argus-qdrant --format "{{.Names}}"', (error, stdout) => {
      resolve(stdout.trim().includes('argus-qdrant'));
    });
  });
}

/**
 * Check if Qdrant container exists (but may be stopped)
 */
function qdrantContainerExists() {
  return new Promise((resolve) => {
    exec('docker ps -a --filter name=argus-qdrant --format "{{.Names}}"', (error, stdout) => {
      resolve(stdout.trim().includes('argus-qdrant'));
    });
  });
}

/**
 * Start Qdrant container
 */
async function startQdrant() {
  const { spawn } = require('child_process');

  return new Promise((resolve) => {
    console.log('[ARGUS] → Starting Qdrant vector database...');

    const args = [
      'run',
      '-d',
      '--name', 'argus-qdrant',
      '-p', '6333:6333',
      '-p', '6334:6334',
      '-v', 'argus-qdrant-data:/qdrant/storage',
      'qdrant/qdrant:latest'
    ];

    const docker = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    });

    let output = '';
    let errorOutput = '';

    docker.stdout.on('data', (data) => {
      output += data.toString();
    });

    docker.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    docker.on('close', (code) => {
      if (code === 0) {
        console.log('[ARGUS] ✓ Qdrant container started');
        resolve(true);
      } else {
        console.error('[ARGUS] ✗ Failed to start Qdrant:', errorOutput);
        resolve(false);
      }
    });

    docker.on('error', (err) => {
      console.error('[ARGUS] ✗ Docker error:', err.message);
      resolve(false);
    });
  });
}

/**
 * Ensure Qdrant is running
 */
async function ensureQdrant() {
  const dockerAvailable = await isDockerAvailable();

  if (!dockerAvailable) {
    console.log('[ARGUS] ℹ Docker not available, skipping Qdrant auto-start');
    console.log('[ARGUS]   → Install Docker to enable vector search with Qdrant');
    return false;
  }

  const qdrantRunning = await isQdrantRunning();

  if (qdrantRunning) {
    console.log('[ARGUS] ✓ Qdrant already running on http://localhost:6333');
    return true;
  }

  const containerExists = await qdrantContainerExists();

  if (containerExists) {
    console.log('[ARGUS] → Starting existing Qdrant container...');
    const started = await new Promise((resolve) => {
      exec('docker start argus-qdrant', (error, stdout, stderr) => {
        if (error) {
          // Check if it's a Docker daemon error
          if (stderr.includes('daemon') || stderr.includes('pipe')) {
            console.log('[ARGUS] ℹ Docker daemon not running - will use local search');
            console.log('[ARGUS]   → Start Docker Desktop and restart session for Qdrant');
          } else {
            console.error('[ARGUS] ✗ Failed to start Qdrant:', error.message);
          }
          resolve(false);
        } else {
          console.log('[ARGUS] ✓ Qdrant container started');
          resolve(true);
        }
      });
    });

    if (started) {
      await new Promise(r => setTimeout(r, 2000));
    }

    return started;
  }

  // Create and start new container
  console.log('[ARGUS] → Creating new Qdrant container...');
  const started = await startQdrant();

  if (started) {
    await new Promise(r => setTimeout(r, 3000));
  }

  return started;
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

    // Start Qdrant if Docker is available
    const qdrantRunning = await ensureQdrant();

    // Ensure web dashboard is running
    await ensureWebDashboard(pluginRoot);

    // Update session info based on Qdrant status
    if (qdrantRunning) {
      console.log('[ARGUS] ✓ Vector search enabled (Qdrant)');
    } else {
      console.log('[ARGUS] ℹ Using local search (SQLite)');
    }
  } else {
    console.warn('[ARGUS] ⚠ CLAUDE_PLUGIN_ROOT not set');
  }

  // Session info
  const PORT = process.env.ARGUS_WEB_PORT || 30000;
  const HOST = process.env.ARGUS_WEB_HOST || 'localhost';

  console.log('[ARGUS] ');
  console.log('[ARGUS] Services:');
  console.log(`[ARGUS]   → Web Dashboard: http://${HOST}:${PORT}`);
  console.log(`[ARGUS]   → Qdrant Vector DB: http://localhost:6333`);
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

  // Actually perform the indexing by walking the directory
  try {
    const indexedFiles = [];
    const srcDirs = ['src', 'lib', 'app', 'components', 'hooks', 'utils', 'services'];

    // Walk through common source directories
    for (const srcDir of srcDirs) {
      const srcPath = path.join(projectDir, srcDir);
      if (!fs.existsSync(srcPath)) continue;

      const walkDir = (dir) => {
        try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
              // Skip node_modules and similar
              if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(file)) {
                walkDir(fullPath);
              }
            } else if (stat.isFile() && /\.(js|ts|jsx|tsx|py|rs|go|java)$/.test(file)) {
              // Store file info for indexing
              indexedFiles.push({
                path: fullPath,
                relative: path.relative(projectDir, fullPath),
                size: stat.size,
                modified: stat.mtime.getTime()
              });
            }
          }
        } catch (error) {
          // Skip directories we can't read
        }
      };

      walkDir(srcPath);
    }

    // Save index info
    const stats = {
      projectDir,
      indexed: useIncremental ? 'incremental' : 'full',
      fileCount: indexedFiles.length,
      files: indexedFiles.slice(0, 100), // Keep first 100 files
      timestamp: now
    };

    updateIndexInfo(projectDir, stats);
    console.log(`[ARGUS] ✓ Indexed ${indexedFiles.length} files in ${path.basename(projectDir)}`);
    console.log(`[ARGUS] ℹ To manually re-index, use: argus__index_codebase`);
  } catch (error) {
    console.warn('[ARGUS] ⚠ Auto-index error:', error.message);
  }
}

sessionStart().catch(error => {
  console.error('[ARGUS] Fatal error during session start:', error);
});
