// Claude Code Plugin Hooks Generator
//
// Generates and installs Claude Code plugin hooks that integrate ARGUS
// automatically with Claude Code sessions.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::common;

/// Claude Code plugin manifest (CORRECT FORMAT)
/// This is the format expected by Claude Code for .claude-plugin/plugin.json
#[derive(Debug, Serialize, Deserialize)]
struct ClaudePluginManifest {
    name: String,
    version: String,
    description: String,
    author: Author,
    repository: String,
    license: String,
    keywords: Vec<String>,
    hooks: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    env: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Author {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<String>,
}

/// Hooks generator for Claude Code integration
pub struct HooksInstaller {
    claude_dir: PathBuf,
    argus_plugin_dir: PathBuf,
    claude_plugin_dir: PathBuf,
}

impl HooksInstaller {
    /// Create a new hooks installer
    pub fn new() -> Result<Self> {
        let home = std::env::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;

        let claude_dir = home.join(".claude");
        let argus_plugin_dir = claude_dir.join("plugins").join("cache").join("argus").join("argus").join("0.8.0");
        let claude_plugin_dir = argus_plugin_dir.join(".claude-plugin");

        Ok(Self {
            claude_dir,
            argus_plugin_dir,
            claude_plugin_dir,
        })
    }

    /// Install all hooks and plugin files
    pub fn install(&self) -> Result<()> {
        println!("🔧 Installing ARGUS hooks for Claude Code...");
        println!("   Target: {}", self.argus_plugin_dir.display());

        // Create directories
        fs::create_dir_all(&self.argus_plugin_dir)
            .context("Failed to create plugin directory")?;

        fs::create_dir_all(&self.claude_plugin_dir)
            .context("Failed to create .claude-plugin directory")?;

        let hooks_dir = self.argus_plugin_dir.join("hooks");
        fs::create_dir_all(&hooks_dir)
            .context("Failed to create hooks directory")?;

        // Write .claude-plugin/plugin.json (CORRECT FORMAT)
        self.write_claude_plugin_json()?;

        // Write all hooks
        self.write_session_start_hook(&hooks_dir)?;
        self.write_pre_tool_use_hook(&hooks_dir)?;
        self.write_post_tool_use_hook(&hooks_dir)?;
        self.write_stop_hook(&hooks_dir)?;

        // Write ARGUS rules to .claude/rules/
        self.write_argus_rules()?;

        // Update settings.json to remove old MCP server and enable plugin
        self.update_settings_json()?;

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
        self.claude_plugin_dir.exists() &&
        self.claude_plugin_dir.join("plugin.json").exists()
    }

    /// Write .claude-plugin/plugin.json with CORRECT format
    fn write_claude_plugin_json(&self) -> Result<()> {
        let manifest = ClaudePluginManifest {
            name: "argus".to_string(),
            version: common::VERSION.to_string(),
            description: "ARGUS - Omniscient memory sentinel for Claude Code (Rust CLI)".to_string(),
            author: Author {
                name: "Yanis".to_string(),
                email: Some("yanis@pamacea.com".to_string()),
            },
            repository: "https://github.com/Pamacea/argus".to_string(),
            license: "MIT".to_string(),
            keywords: vec![
                "memory".to_string(),
                "rag".to_string(),
                "hooks".to_string(),
                "context-aware".to_string(),
                "rust".to_string(),
                "sentinel".to_string(),
                "persistence".to_string(),
            ],
            hooks: serde_json::json!({
                "SessionStart": [
                    {
                        "matcher": "*",
                        "hooks": [
                            {
                                "type": "command",
                                "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/session-start.js",
                                "timeout": 10000
                            }
                        ]
                    }
                ],
                "PreToolUse": [
                    {
                        "matcher": "Explore|CreateTeam|Plan",
                        "hooks": [
                            {
                                "type": "command",
                                "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use.js",
                                "timeout": 5000
                            }
                        ]
                    }
                ],
                "PostToolUse": [
                    {
                        "matcher": "Edit|Write|Explore|CreateTeam|Bash|Agent",
                        "hooks": [
                            {
                                "type": "command",
                                "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use.js",
                                "timeout": 5000
                            }
                        ]
                    }
                ],
                "Stop": [
                    {
                        "matcher": "*",
                        "hooks": [
                            {
                                "type": "command",
                                "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/stop.js",
                                "timeout": 5000
                            }
                        ]
                    }
                ]
            }),
            env: Some(serde_json::json!({
                "ARGUS_VERSION": common::VERSION,
                "ARGUS_ROOT": "${CLAUDE_PLUGIN_ROOT}"
            })),
        };

        let json = serde_json::to_string_pretty(&manifest)?;
        fs::write(self.claude_plugin_dir.join("plugin.json"), json)
            .context("Failed to write .claude-plugin/plugin.json")?;

        Ok(())
    }

    /// Update settings.json to remove old MCP server and enable plugin
    fn update_settings_json(&self) -> Result<()> {
        let settings_path = self.claude_dir.join("settings.json");

        if !settings_path.exists() {
            // Settings file doesn't exist, skip update
            return Ok(());
        }

        let settings_content = fs::read_to_string(&settings_path)
            .context("Failed to read settings.json")?;

        let mut settings: serde_json::Value = serde_json::from_str(&settings_content)
            .context("Failed to parse settings.json")?;

        // Remove old MCP argus server if exists
        if let Some(mcp_servers) = settings.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
            mcp_servers.remove("argus");
        }

        // Add argus to enabledPlugins
        if let Some(enabled_plugins) = settings.get_mut("enabledPlugins").and_then(|v| v.as_object_mut()) {
            enabled_plugins.insert("argus@argus".to_string(), serde_json::json!(true));
        }

        let updated_json = serde_json::to_string_pretty(&settings)?;
        fs::write(&settings_path, updated_json)
            .context("Failed to write updated settings.json")?;

        Ok(())
    }

    /// Write session-start hook
    /// NOTE: Uses CLI directly instead of daemon due to Windows named pipe bug
    fn write_session_start_hook(&self, hooks_dir: &PathBuf) -> Result<()> {
        let hook = r#""use strict";

// ARGUS Session Start Hook
// Initializes ARGUS for the session using CLI (not daemon)

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function sessionStart(context) {
    const workingDir = context.workingDir || process.cwd();
    const platform = context.platform || process.platform;

    console.log('[ARGUS] Starting session...');
    console.log('[ARGUS] Working dir:', workingDir);
    console.log('[ARGUS] Platform:', platform);

    // Verify ARGUS is available
    const check = spawn('argus', ['--version'], {
        stdio: 'pipe',
        timeout: 5000
    });

    check.on('close', (code) => {
        if (code === 0) {
            console.log('[ARGUS] ✓ ARGUS CLI ready - Memory capture enabled');
            console.log('[ARGUS] Use "argus recall <query>" to search memory');
        } else {
            console.log('[ARGUS] ⚠ ARGUS CLI not found');
            console.log('[ARGUS] Install with: cargo install argus-tool');
        }
    });
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
        'Edit', 'Write', 'Explore', 'CreateTeam', 'Bash', 'Agent'
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

    // Save to ARGUS (fire and forget)
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
    fn test_claude_plugin_manifest_serialization() {
        let manifest = ClaudePluginManifest {
            name: "argus".to_string(),
            version: "0.8.0".to_string(),
            description: "Test".to_string(),
            author: Author {
                name: "Test".to_string(),
                email: None,
            },
            repository: "https://github.com/Pamacea/argus".to_string(),
            license: "MIT".to_string(),
            keywords: vec!["memory".to_string()],
            hooks: serde_json::json!({}),
            env: None,
        };

        let json = serde_json::to_string(&manifest);
        assert!(json.is_ok());
    }
}
