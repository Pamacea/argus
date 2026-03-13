// Claude Code Plugin Hooks Generator
//
// Generates and installs Claude Code plugin hooks that integrate ARGUS
// automatically with Claude Code sessions.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::common;

/// Claude Code plugin manifest
#[derive(Debug, Serialize, Deserialize)]
struct PluginManifest {
    r#type: String,
    name: String,
    description: String,
    version: String,
    author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    homepage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    repository: Option<String>,
    hooks: Vec<HookConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mcp_servers: Option<Vec<McpServerConfig>>,
}

/// Hook configuration
#[derive(Debug, Serialize, Deserialize)]
struct HookConfig {
    r#type: String,
    path: String,
}

/// MCP Server configuration
#[derive(Debug, Serialize, Deserialize)]
struct McpServerConfig {
    name: String,
    command: String,
    args: Vec<String>,
}

/// Hooks generator for Claude Code integration
pub struct HooksInstaller {
    claude_dir: PathBuf,
    argus_plugin_dir: PathBuf,
}

impl HooksInstaller {
    /// Create a new hooks installer
    pub fn new() -> Result<Self> {
        let home = std::env::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;

        let claude_dir = home.join(".claude");
        let argus_plugin_dir = claude_dir.join("plugins").join("cache").join("argus").join("argus").join("0.8.0");

        Ok(Self {
            claude_dir,
            argus_plugin_dir,
        })
    }

    /// Install all hooks and plugin files
    pub fn install(&self) -> Result<()> {
        println!("🔧 Installing ARGUS hooks for Claude Code...");
        println!("   Target: {}", self.argus_plugin_dir.display());

        // Create directories
        fs::create_dir_all(&self.argus_plugin_dir)
            .context("Failed to create plugin directory")?;

        let hooks_dir = self.argus_plugin_dir.join("hooks");
        fs::create_dir_all(&hooks_dir)
            .context("Failed to create hooks directory")?;

        // Write plugin.json
        self.write_plugin_json()?;

        // Write all hooks
        self.write_session_start_hook(&hooks_dir)?;
        self.write_pre_tool_use_hook(&hooks_dir)?;
        self.write_post_tool_use_hook(&hooks_dir)?;
        self.write_stop_hook(&hooks_dir)?;

        // Write ARGUS rules to .claude/rules/
        self.write_argus_rules()?;

        println!("✓ ARGUS hooks installed successfully");
        Ok(())
    }

    /// Uninstall hooks
    pub fn uninstall(&self) -> Result<()> {
        println!("🗑️  Removing ARGUS hooks...");

        if self.argus_plugin_dir.exists() {
            fs::remove_dir_all(&self.argus_plugin_dir)
                .context("Failed to remove plugin directory")?;
        }

        // Remove rules
        let rules_file = self.claude_dir.join("rules").join("argus.md");
        if rules_file.exists() {
            fs::remove_file(&rules_file)
                .context("Failed to remove rules file")?;
        }

        println!("✓ ARGUS hooks removed");
        Ok(())
    }

    /// Check if hooks are installed
    pub fn is_installed(&self) -> bool {
        self.argus_plugin_dir.exists() &&
        self.argus_plugin_dir.join("plugin.json").exists()
    }

    /// Write plugin.json manifest
    fn write_plugin_json(&self) -> Result<()> {
        let manifest = PluginManifest {
            r#type: "hook".to_string(),
            name: "argus".to_string(),
            description: "ARGUS - Omniscient memory sentinel for Claude Code".to_string(),
            version: common::VERSION.to_string(),
            author: "Yanis".to_string(),
            homepage: Some("https://github.com/Pamacea/argus".to_string()),
            repository: Some("https://github.com/Pamacea/argus".to_string()),
            hooks: vec![
                HookConfig {
                    r#type: "session-start".to_string(),
                    path: "hooks/session-start.js".to_string(),
                },
                HookConfig {
                    r#type: "pre-tool-use".to_string(),
                    path: "hooks/pre-tool-use.js".to_string(),
                },
                HookConfig {
                    r#type: "post-tool-use".to_string(),
                    path: "hooks/post-tool-use.js".to_string(),
                },
                HookConfig {
                    r#type: "stop".to_string(),
                    path: "hooks/stop.js".to_string(),
                },
            ],
            mcp_servers: None, // Not using MCP, using direct IPC
        };

        let json = serde_json::to_string_pretty(&manifest)?;
        fs::write(self.argus_plugin_dir.join("plugin.json"), json)
            .context("Failed to write plugin.json")?;

        Ok(())
    }

    /// Write session-start hook
    fn write_session_start_hook(&self, hooks_dir: &PathBuf) -> Result<()> {
        let hook = r#""use strict";

// ARGUS Session Start Hook
// Auto-starts the ARGUS daemon if not already running

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Daemon lock file to prevent multiple instances
function getDaemonLockPath() {
    const homeDir = require('os').homedir();
    return path.join(homeDir, '.argus', 'daemon.lock');
}

// Check if daemon is running
function isDaemonRunning() {
    const lockPath = getDaemonLockPath();
    try {
        if (fs.existsSync(lockPath)) {
            const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            // Check if process is still alive by trying to ping
            const pid = lock.pid;
            try {
                process.kill(pid, 0); // Signal 0 checks if process exists
                return true;
            } catch (e) {
                // Process is dead, clean up lock
                fs.unlinkSync(lockPath);
                return false;
            }
        }
    } catch (e) {
        // Lock file corrupted, clean up
        try { fs.unlinkSync(lockPath); } catch (_) {}
    }
    return false;
}

// Start daemon in background
function startDaemon() {
    const homeDir = require('os').homedir();
    const lockPath = getDaemonLockPath();

    // Create .argus directory if not exists
    const argusDir = path.join(homeDir, '.argus');
    if (!fs.existsSync(argusDir)) {
        fs.mkdirSync(argusDir, { recursive: true });
    }

    // Spawn daemon detached
    const daemon = spawn('argus', ['daemon', 'start', '--background'], {
        stdio: 'ignore',
        detached: true,
        shell: process.platform === 'win32'
    });

    daemon.unref();

    // Wait a bit and check if it started
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(isDaemonRunning());
        }, 500);
    });
}

async function sessionStart(context) {
    // Extract session info for theme (discussion subject)
    const workingDir = context.workingDir || process.cwd();
    const platform = context.platform || process.platform;
    const theme = context.theme || 'general'; // Discussion subject

    console.log('[ARGUS] Starting session...');
    console.log('[ARGUS] Working dir:', workingDir);
    console.log('[ARGUS] Platform:', platform);
    console.log('[ARGUS] Discussion:', theme);

    // Check if daemon is already running
    if (isDaemonRunning()) {
        console.log('[ARGUS] ✓ Daemon already running - multi-session enabled');
        return;
    }

    // Start the daemon
    console.log('[ARGUS] Starting daemon in background...');
    const started = await startDaemon();

    if (started) {
        console.log('[ARGUS] ✓ Daemon started successfully');
        console.log('[ARGUS] ✓ Automatic memory capture enabled');
    } else {
        console.log('[ARGUS] ⚠ Failed to start daemon');
        console.log('[ARGUS] Manual start: argus daemon start');
    }
}

module.exports = { sessionStart };
"#;

        fs::write(hooks_dir.join("session-start.js"), hook)
            .context("Failed to write session-start.js")?;

        Ok(())
    }

    /// Write pre-tool-use hook
    fn write_pre_tool_use_hook(&self, hooks_dir: &PathBuf) -> Result<()> {
        let hook = r#""use strict";

// ARGUS Pre-Tool-Use Hook
// Called before Claude executes a tool

async function preToolUse(context, toolName, toolInput) {
    // Tools that should consult memory first
    const memoryTools = ['Explore', 'CreateTeam', 'Plan'];

    if (!memoryTools.includes(toolName)) {
        return;
    }

    console.log(`[ARGUS] Checking memory before ${toolName}...`);

    const { spawn } = require('child_process');
    const prompt = toolInput.prompt || toolInput.description || toolInput.query || '';

    if (!prompt) {
        return;
    }

    // Search ARGUS memory
    const argus = spawn('argus', ['recall', prompt, '--limit', '5'], {
        stdio: 'pipe',
        timeout: 5000
    });

    let output = '';
    argus.stdout.on('data', (data) => {
        output += data.toString();
    });

    argus.on('close', (code) => {
        if (code === 0 && output.trim()) {
            console.log('[ARGUS] Found relevant context:');
            console.log(output);
        }
    });
}

module.exports = { preToolUse };
"#;

        fs::write(hooks_dir.join("pre-tool-use.js"), hook)
            .context("Failed to write pre-tool-use.js")?;

        Ok(())
    }

    /// Write post-tool-use hook
    fn write_post_tool_use_hook(&self, hooks_dir: &PathBuf) -> Result<()> {
        let hook = r#""use strict";

// ARGUS Post-Tool-Use Hook
// Called after Claude executes a tool

async function postToolUse(context, toolName, toolInput, result) {
    // Tools that should be recorded
    const recordableTools = [
        'Edit', 'Write', 'Read', 'Explore', 'CreateTeam',
        'Bash', 'Agent'
    ];

    if (!recordableTools.includes(toolName)) {
        return;
    }

    // Only record successful operations
    if (result && result.error) {
        return;
    }

    const { spawn } = require('child_process');

    // Build description
    let description = '';
    let category = 'unknown';

    switch (toolName) {
        case 'Edit':
            description = `Modified ${toolInput.file_path}`;
            category = 'edit';
            break;
        case 'Write':
            description = `Created ${toolInput.file_path}`;
            category = 'create';
            break;
        case 'Read':
            // Don't record reads
            return;
        case 'Explore':
            description = `Explored: ${toolInput.prompt || toolInput.query}`;
            category = 'explore';
            break;
        case 'CreateTeam':
            description = `Created team: ${toolInput.team_name}`;
            category = 'team';
            break;
        case 'Bash':
            const cmd = toolInput.command || '';
            // Skip certain commands
            if (cmd.startsWith('git status') || cmd.startsWith('git log') || cmd.startsWith('ls')) {
                return;
            }
            description = `Executed: ${cmd.substring(0, 50)}${cmd.length > 50 ? '...' : ''}`;
            category = 'command';
            break;
        default:
            description = `Used ${toolName}`;
            category = 'tool';
    }

    // Auto-detect tags from description
    const tags = [];
    if (description.toLowerCase().includes('fix') || description.toLowerCase().includes('bug')) {
        tags.push('bugfix');
    }
    if (description.toLowerCase().includes('add') || description.toLowerCase().includes('create')) {
        tags.push('feature');
    }
    if (description.toLowerCase().includes('refactor') || description.toLowerCase().includes('clean')) {
        tags.push('refactor');
    }

    // Build args
    const args = ['remember', description];
    if (tags.length > 0) {
        args.push('--tags', tags.join(','));
    }
    args.push('--category', category);

    // Save to ARGUS
    spawn('argus', args, {
        stdio: 'ignore',
        detached: true
    }).unref();
}

module.exports = { postToolUse };
"#;

        fs::write(hooks_dir.join("post-tool-use.js"), hook)
            .context("Failed to write post-tool-use.js")?;

        Ok(())
    }

    /// Write stop hook
    fn write_stop_hook(&self, hooks_dir: &PathBuf) -> Result<()> {
        let hook = r#""use strict";

// ARGUS Stop Hook
// Called when Claude Code session ends

async function stop(context) {
    console.log('[ARGUS] Session ending...');
    console.log('[ARGUS] Memory persisted. Use "argus recall <query>" to search.');
}

module.exports = { stop };
"#;

        fs::write(hooks_dir.join("stop.js"), hook)
            .context("Failed to write stop.js")?;

        Ok(())
    }

    /// Write ARGUS rules to .claude/rules/
    fn write_argus_rules(&self) -> Result<()> {
        let rules_dir = self.claude_dir.join("rules");
        fs::create_dir_all(&rules_dir)
            .context("Failed to create rules directory")?;

        let rules = r#"# ARGUS - Omniscient Memory Sentinel

> **Version:** 0.8.0 | **CLI:** `argus`

---

## 🎯 Purpose

ARGUS maintains semantic memory of all your Claude Code sessions.
**Always consult ARGUS before** exploring code or creating solutions.

## 🔧 Integration

ARGUS is installed as a CLI tool. Available commands:
- `argus recall "pattern"` - Search past transactions
- `argus remember "description"` - Save to memory
- `argus index` - Index current project
- `argus stats` - View statistics

## ✅ Mandatory Workflow

### Before ANY Explore or CreateTeam action:

```bash
# Step 1: Search ARGUS memory
argus recall "<what you're looking for>"

# Step 2: Review results
# Step 3: Proceed with action using context
```

### After ANY significant action:

```bash
# Save the result for future reference
argus remember "What you did and why"
```

## 🚫 Never

- Explore without checking ARGUS first
- CreateTeam without searching past solutions
- Ignore patterns found in memory
- Skip remembering important decisions

## 📊 Memory Location

All data stored in: `~/.argus/`
- Transactions: `~/.argus/memory.db`
- Index: `~/.argus/index/`

---

*Auto-generated by ARGUS v0.8.0*
"#;

        fs::write(rules_dir.join("argus.md"), rules)
            .context("Failed to write argus.md rules")?;

        Ok(())
    }
}

/// Install hooks with output
pub fn install_hooks() -> Result<()> {
    let installer = HooksInstaller::new()?;

    if installer.is_installed() {
        println!("✓ ARGUS hooks already installed");
        return Ok(());
    }

    installer.install()
}

/// Uninstall hooks with output
pub fn uninstall_hooks() -> Result<()> {
    let installer = HooksInstaller::new()?;

    if !installer.is_installed() {
        println!("✓ ARGUS hooks not installed");
        return Ok(());
    }

    installer.uninstall()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_installer_creation() {
        let installer = HooksInstaller::new();
        assert!(installer.is_ok());
    }

    #[test]
    fn test_manifest_serialization() {
        let manifest = PluginManifest {
            r#type: "hook".to_string(),
            name: "argus".to_string(),
            description: "Test".to_string(),
            version: "0.8.0".to_string(),
            author: "Test".to_string(),
            homepage: None,
            repository: None,
            hooks: vec![],
            mcp_servers: None,
        };

        let json = serde_json::to_string(&manifest);
        assert!(json.is_ok());
    }
}
