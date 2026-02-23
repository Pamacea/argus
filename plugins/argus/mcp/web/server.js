#!/usr/bin/env node

/**
 * ARGUS Web Dashboard Server
 *
 * A simple HTTP server that provides:
 * - Status information about the ARGUS MCP server
 * - Web dashboard for viewing memory and hooks
 * - Health check endpoint
 *
 * This server auto-starts when the plugin is loaded and checks if it's already running.
 * Uses only Node.js built-in modules (no external dependencies).
 */

import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.ARGUS_WEB_PORT || 30000;
const HOST = process.env.ARGUS_WEB_HOST || 'localhost';
const DATA_DIR = process.env.ARGUS_DATA_DIR || join(process.env.HOME || process.env.USERPROFILE, '.argus');
const PID_FILE = join(DATA_DIR, 'web-server.pid');

/**
 * Check if a port is in use
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      import('child_process').then(({ exec }) => {
        exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
          // If there's output with LISTENING state, port is in use
          resolve(stdout.trim().length > 0);
        });
      });
    } else {
      import('child_process').then(({ exec }) => {
        exec(`lsof -i :${port} 2>/dev/null || true`, (error, stdout) => {
          // If there's output, port is in use
          resolve(stdout.trim().length > 0);
        });
      });
    }
  });
}

/**
 * Write PID file for tracking
 */
function writePidFile() {
  try {
    const pidDir = dirname(PID_FILE);
    if (!existsSync(pidDir)) {
      mkdirSync(pidDir, { recursive: true });
    }
    writeFileSync(PID_FILE, process.pid.toString());
  } catch (error) {
    console.warn('[ARGUS Web] Could not write PID file:', error.message);
  }
}

/**
 * Clean up PID file on exit
 */
function cleanupPidFile() {
  if (existsSync(PID_FILE)) {
    try {
      const pid = readFileSync(PID_FILE, 'utf-8').trim();
      if (pid === process.pid.toString()) {
        import('fs/promises').then(fs => fs.unlink(PID_FILE)).catch(() => {});
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Set CORS headers
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Parse JSON body
 */
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * Route handler
 */
async function handleRequest(req, res) {
  setCorsHeaders(res);

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Health check endpoint
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid
    }, null, 2));
    return;
  }

  // Status endpoint
  if (url.pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'ARGUS Web Dashboard',
      version: '0.5.3',
      description: 'Sentinelle omnisciente pour Claude Code',
      server: {
        host: HOST,
        port: PORT,
        uptime: process.uptime(),
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version
      },
      endpoints: {
        health: `http://${HOST}:${PORT}/health`,
        status: `http://${HOST}:${PORT}/api/status`,
        docs: `http://${HOST}:${PORT}/api/docs`
      }
    }, null, 2));
    return;
  }

  // API documentation endpoint
  if (url.pathname === '/api/docs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'ARGUS Web Dashboard API',
      version: '1.0.0',
      endpoints: [
        {
          method: 'GET',
          path: '/',
          description: 'Web dashboard HTML interface',
          response: 'HTML page with dashboard UI'
        },
        {
          method: 'GET',
          path: '/health',
          description: 'Health check endpoint',
          response: {
            status: 'healthy',
            timestamp: 'ISO 8601 timestamp',
            uptime: 'Server uptime in seconds',
            pid: 'Process ID'
          }
        },
        {
          method: 'GET',
          path: '/api/status',
          description: 'Get server status and information',
          response: {
            name: 'ARGUS Web Dashboard',
            version: '0.5.3',
            server: {
              host: 'localhost',
              port: 30000,
              uptime: 'Server uptime in seconds',
              pid: 'Process ID',
              platform: 'Operating system',
              nodeVersion: 'Node.js version'
            }
          }
        },
        {
          method: 'GET',
          path: '/api/stats',
          description: 'Get ARGUS statistics (transactions, hooks, indexing)',
          response: {
            success: true,
            stats: {
              usingQdrant: 'boolean',
              transactionCount: 'number',
              hookCount: 'number',
              indexedFileCount: 'number',
              memorySize: 'bytes',
              lastIndexTime: 'ISO 8601 timestamp'
            }
          }
        },
        {
          method: 'GET',
          path: '/api/indexed',
          description: 'Get list of indexed projects with file counts and timestamps',
          response: {
            success: true,
            count: 'number of indexed projects',
            projects: [
              {
                name: 'project name',
                project: 'full project path',
                fileCount: 'number of indexed files',
                lastIndexed: 'ISO 8601 timestamp',
                indexed: 'full or incremental'
              }
            ]
          }
        },
        {
          method: 'GET',
          path: '/api/docs',
          description: 'API documentation'
        }
      ]
    }, null, 2));
    return;
  }

  // Stats endpoint - get ARGUS statistics
  if (url.pathname === '/api/stats' && req.method === 'GET') {
    try {
      // Try to read stats from the data directory
      const statsPath = join(DATA_DIR, 'stats.json');
      let stats = { usingQdrant: false, transactionCount: 0, hookCount: 0 };

      if (existsSync(statsPath)) {
        try {
          const statsData = readFileSync(statsPath, 'utf-8');
          stats = JSON.parse(statsData);
        } catch (e) {
          // Use default stats if file is corrupted
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        stats: stats
      }, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }, null, 2));
    }
    return;
  }

  // Indexed files endpoint - get information about indexed projects
  if (url.pathname === '/api/indexed' && req.method === 'GET') {
    try {
      import('fs').then(({ readdirSync, existsSync, readFileSync }) => {
        const indexedProjects = [];

        try {
          // Read all index info files from data directory
          const files = readdirSync(DATA_DIR);

          for (const file of files) {
            if (file.startsWith('index-') && file.endsWith('.json')) {
              try {
                const indexPath = join(DATA_DIR, file);
                const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));

                // Decode the base64 project path
                const projectPath = Buffer.from(file.replace('index-', '').replace('.json', ''), 'base64').toString('utf-8');

                indexedProjects.push({
                  project: projectPath,
                  name: projectPath.split(/[/\\]/).pop() || projectPath,
                  ...indexData,
                  lastIndexed: new Date(indexData.lastIndexTime || indexData.timestamp).toISOString(),
                  fileCount: indexData.fileCount || 0
                });
              } catch (e) {
                // Skip corrupted index files
              }
            }
          }
        } catch (e) {
          // Data directory might not exist
        }

        // Sort by last indexed time (newest first)
        indexedProjects.sort((a, b) => new Date(b.lastIndexed) - new Date(a.lastIndexed));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          count: indexedProjects.length,
          projects: indexedProjects
        }, null, 2));
      }).catch(error => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }, null, 2));
      });
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }, null, 2));
    }
    return;
  }

  // Root endpoint - serve HTML dashboard
  if (url.pathname === '/' && req.method === 'GET') {
    const indexPath = join(__dirname, 'index.html');
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'ARGUS Web Dashboard',
        message: 'ARGUS - Sentinelle Omnisciente',
        status: 'running',
        links: {
          health: '/health',
          status: '/api/status',
          stats: '/api/stats',
          indexed: '/api/indexed',
          docs: '/api/docs'
        }
      }, null, 2));
    }
    return;
  }

  // 404 handler
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not Found',
    path: url.pathname,
    available: ['/', '/health', '/api/status', '/api/stats', '/api/indexed', '/api/docs']
  }, null, 2));
}

/**
 * Start server
 */
async function start() {
  // Check if port is already in use
  const portInUse = await isPortInUse(PORT);

  if (portInUse) {
    console.log(`[ARGUS Web] ✓ Web dashboard already running on port ${PORT}`);
    console.log(`[ARGUS Web] → Access at http://${HOST}:${PORT}`);
    process.exit(0);
    return;
  }

  // Write PID file
  writePidFile();

  // Create server
  const server = http.createServer(handleRequest);

  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('[ARGUS] ════════════════════════════════════════════');
    console.log('[ARGUS] Web Dashboard Server Started');
    console.log('[ARGUS] ════════════════════════════════════════════');
    console.log(`[ARGUS] Dashboard: http://${HOST}:${PORT}/`);
    console.log(`[ARGUS] Health:     http://${HOST}:${PORT}/health`);
    console.log(`[ARGUS] Status:     http://${HOST}:${PORT}/api/status`);
    console.log(`[ARGUS] Stats:      http://${HOST}:${PORT}/api/stats`);
    console.log(`[ARGUS] Docs:       http://${HOST}:${PORT}/api/docs`);
    console.log(`[ARGUS] PID:        ${process.pid}`);
    console.log('[ARGUS] ════════════════════════════════════════════');
    console.log('');
  });

  // Handle graceful shutdown
  server.on('close', () => {
    cleanupPidFile();
    console.log('[ARGUS Web] Server closed');
  });

  // Handle process signals
  process.on('SIGINT', () => {
    console.log('[ARGUS Web] Received SIGINT, shutting down gracefully...');
    server.close(() => {
      cleanupPidFile();
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('[ARGUS Web] Received SIGTERM, shutting down gracefully...');
    server.close(() => {
      cleanupPidFile();
      process.exit(0);
    });
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[ARGUS Web] Uncaught exception:', error);
    cleanupPidFile();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[ARGUS Web] Unhandled rejection at:', promise, 'reason:', reason);
  });
}

// Start the server
start().catch((error) => {
  console.error('[ARGUS Web] Fatal error starting server:', error);
  process.exit(1);
});
