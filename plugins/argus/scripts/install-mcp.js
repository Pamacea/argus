#!/usr/bin/env node

/**
 * ARGUS MCP Server Auto-Install Script
 *
 * This script is called during plugin installation to automatically
 * configure the ARGUS MCP server in Claude Code's mcp.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const MCP_CONFIG_PATH = path.join(CLAUDE_DIR, 'mcp.json');

/**
 * Get current plugin installation path
 */
function getPluginPath() {
  // Check if we're in the plugin cache
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot) {
    return pluginRoot;
  }

  // Fallback: try to find from current directory
  const currentDir = __dirname;
  if (currentDir.includes('.claude') || currentDir.includes('plugins')) {
    return currentDir;
  }

  return null;
}

/**
 * Read existing mcp.json config
 */
function readMcpConfig() {
  try {
    if (fs.existsSync(MCP_CONFIG_PATH)) {
      const content = fs.readFileSync(MCP_CONFIG_PATH, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('[ARGUS Install] Error reading mcp.json:', error.message);
  }
  return { mcpServers: {} };
}

/**
 * Write mcp.json config
 */
function writeMcpConfig(config) {
  try {
    // Ensure .claude directory exists
    if (!fs.existsSync(CLAUDE_DIR)) {
      fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    }

    // Write config with pretty formatting
    fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('[ARGUS Install] ✓ Updated mcp.json');
    return true;
  } catch (error) {
    console.error('[ARGUS Install] Error writing mcp.json:', error.message);
    return false;
  }
}

/**
 * Install ARGUS MCP server configuration
 */
function installMcpServer() {
  const pluginPath = getPluginPath();

  if (!pluginPath) {
    console.warn('[ARGUS Install] ⚠ Could not determine plugin path, skipping MCP setup');
    return false;
  }

  console.log('[ARGUS Install] Installing ARGUS MCP server...');
  console.log('[ARGUS Install] Plugin path:', pluginPath);

  const mcpServerPath = path.join(pluginPath, 'mcp', 'build', 'index.js');

  if (!fs.existsSync(mcpServerPath)) {
    console.warn('[ARGUS Install] ⚠ MCP server build not found at:', mcpServerPath);
    console.warn('[ARGUS Install] Please run "npm run build" in the mcp directory');
    return false;
  }

  // Read existing config
  const config = readMcpConfig();

  // Add ARGUS MCP server configuration
  config.mcpServers.argus = {
    command: 'node',
    args: [mcpServerPath],
    env: {
      ARGUS_PLUGIN_ROOT: pluginPath
    }
  };

  // Write updated config
  const success = writeMcpConfig(config);

  if (success) {
    console.log('[ARGUS Install] ✓ ARGUS MCP server configured');
    console.log('[ARGUS Install] → MCP tools will be available on next Claude Code restart');
  }

  return success;
}

/**
 * Uninstall ARGUS MCP server configuration
 */
function uninstallMcpServer() {
  console.log('[ARGUS Install] Removing ARGUS MCP server configuration...');

  const config = readMcpConfig();

  if (config.mcpServers && config.mcpServers.argus) {
    delete config.mcpServers.argus;
    writeMcpConfig(config);
    console.log('[ARGUS Install] ✓ ARGUS MCP server removed from mcp.json');
  }
}

// Main execution
const command = process.argv[2] || 'install';

if (command === 'install') {
  installMcpServer();
  process.exit(0);
} else if (command === 'uninstall') {
  uninstallMcpServer();
  process.exit(0);
} else {
  console.error('[ARGUS Install] Unknown command:', command);
  console.error('[ARGUS Install] Usage: node install-mcp.js [install|uninstall]');
  process.exit(1);
}
