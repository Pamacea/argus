// ARGUS Hooks Installer - RTK-style direct hooks
//
// Installs hooks directly to ~/.claude/hooks/ like RTK and Aureus
// No plugin.json, no marketplace - just simple hooks that work

use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

use crate::common;

/// Hooks installer for Claude Code integration (RTK-style)
pub struct HooksInstaller {
    claude_dir: PathBuf,
    hooks_dir: PathBuf,
}

impl HooksInstaller {
    /// Create a new hooks installer
    pub fn new() -> Result<Self> {
        let home = std::env::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;

        let claude_dir = home.join(".claude");
        let hooks_dir = claude_dir.join("hooks");

        Ok(Self {
            claude_dir,
            hooks_dir,
        })
    }

    /// Install all hooks (RTK-style: direct to ~/.claude/hooks/)
    pub fn install(&self) -> Result<()> {
        println!("🔧 Installing ARGUS hooks (RTK-style)...");
        println!("   Target: {}", self.hooks_dir.display());

        // Create hooks directory
        fs::create_dir_all(&self.hooks_dir)
            .context("Failed to create hooks directory")?;

        // Write hooks
        self.write_session_hook()?;
        self.write_pre_tool_hook()?;
        self.write_post_tool_hook()?;

        // Write ARGUS.md awareness
        self.write_awareness_md()?;

        // Update settings.json to register hooks
        self.update_settings_json()?;

        println!("✓ ARGUS hooks installed successfully");
        Ok(())
    }

    /// Uninstall hooks
    pub fn uninstall(&self) -> Result<()> {
        println!("🗑️  Removing ARGUS hooks...");

        // Remove hook files
        let hooks_to_remove = vec![
            "argus-session.cjs",
            "argus-pre-tool.cjs",
            "argus-post-tool.cjs",
        ];

        for hook in hooks_to_remove {
            let hook_path = self.hooks_dir.join(hook);
            if hook_path.exists() {
                fs::remove_file(&hook_path)
                    .with_context(|| format!("Failed to remove {}", hook))?;
            }
        }

        // Remove ARGUS.md
        let awareness_path = self.claude_dir.join("ARGUS.md");
        if awareness_path.exists() {
            fs::remove_file(&awareness_path)
                .context("Failed to remove ARGUS.md")?;
        }

        // Remove hooks from settings.json
        self.remove_hooks_from_settings()?;

        println!("✓ ARGUS hooks removed");
        Ok(())
    }

    /// Check if hooks are installed
    pub fn is_installed(&self) -> bool {
        self.hooks_dir.join("argus-pre-tool.cjs").exists()
    }

    /// Show installation status
    pub fn show_status(&self) -> Result<()> {
        println!("\n  📊 ARGUS Installation Status\n");

        let hooks = vec![
            ("argus-session.cjs", "SessionStart hook"),
            ("argus-pre-tool.cjs", "PreToolUse hook"),
            ("argus-post-tool.cjs", "PostToolUse hook"),
        ];

        for (file, description) in hooks {
            let path = self.hooks_dir.join(file);
            if path.exists() {
                println!("  ✓ {}: {}", description, file);
            } else {
                println!("  ✗ {}: {} (missing)", description, file);
            }
        }

        let awareness = self.claude_dir.join("ARGUS.md");
        if awareness.exists() {
            println!("  ✓ ARGUS.md awareness file");
        } else {
            println!("  ✗ ARGUS.md awareness file (missing)");
        }

        // Check if hooks are registered in settings.json
        if let Ok(registered) = self.are_hooks_registered() {
            if registered {
                println!("  ✓ Hooks registered in settings.json");
            } else {
                println!("  ⚠ Hooks NOT registered in settings.json");
            }
        }

        println!();
        Ok(())
    }

    fn are_hooks_registered(&self) -> Result<bool> {
        let settings_path = self.claude_dir.join("settings.json");
        if !settings_path.exists() {
            return Ok(false);
        }

        let content = fs::read_to_string(&settings_path)?;
        let settings: serde_json::Value = serde_json::from_str(&content)?;

        // Check if argus hooks are in PreToolUse
        if let Some(pre_tool_use) = settings.get("hooks")
            .and_then(|h| h.get("PreToolUse"))
            .and_then(|v| v.as_array())
        {
            for entry in pre_tool_use {
                if let Some(hooks) = entry.get("hooks")
                    .and_then(|h| h.as_array())
                {
                    for hook in hooks {
                        if let Some(cmd) = hook.get("command")
                            .and_then(|c| c.as_str())
                        {
                            if cmd.contains("argus-pre-tool.cjs") {
                                return Ok(true);
                            }
                        }
                    }
                }
            }
        }

        Ok(false)
    }

    /// Write session-start hook
    fn write_session_hook(&self) -> Result<()> {
        let hook = r#"#!/usr/bin/env node
/**
 * ARGUS SessionStart Hook
 * Initializes ARGUS at the start of each Claude Code session
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function sessionStart(context) {
    const workingDir = context?.workingDir || process.cwd();
    const platform = context?.platform || process.platform;

    console.log('[ARGUS] 🦅 Sentinelle Omnisciente');
    console.log('[ARGUS] Working dir:', workingDir);

    // Verify ARGUS CLI is available (synchronous check)
    try {
        const check = spawnSync('argus', ['--version'], {
            stdio: 'pipe',
            timeout: 5000,
            shell: true
        });

        if (check.status === 0) {
            console.log('[ARGUS] ✓ CLI ready - Memory capture enabled');
            console.log('[ARGUS] → Use: argus recall "query"');
        } else {
            console.log('[ARGUS] ⚠ CLI not found - Install: cargo install argus-tool');
        }
    } catch (err) {
        // Silent fail on check
    }

    // Auto-index current project if needed (background to not block startup)
    const argusDir = path.join(require('os').homedir(), '.argus');
    const indexFile = path.join(argusDir, 'index.json');

    let shouldIndex = true;
    try {
        if (fs.existsSync(indexFile)) {
            const stats = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            const lastIndexed = stats.lastIndexed || 0;
            const hoursSince = (Date.now() - lastIndexed) / (1000 * 60 * 60);
            shouldIndex = hoursSince > 3; // Re-index every 3 hours
        }

        if (shouldIndex) {
            console.log('[ARGUS] → Indexing project...');
            // Run in background with spawn to avoid blocking
            const { spawn } = require('child_process');
            const index = spawn('argus index', [], {
                stdio: 'ignore',
                shell: true,
                detached: true
            });
            index.unref();
        }
    } catch (err) {
        // Silent fail on index check
    }
}

module.exports = { sessionStart };
"#;

        fs::write(self.hooks_dir.join("argus-session.cjs"), hook)
            .context("Failed to write argus-session.cjs")?;

        // Make executable on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let path = self.hooks_dir.join("argus-session.cjs");
            let mut perms = fs::metadata(&path)?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&path, perms)?;
        }

        Ok(())
    }

    /// Write pre-tool-use hook
    fn write_pre_tool_hook(&self) -> Result<()> {
        let hook = r#"#!/usr/bin/env node
/**
 * ARGUS PreToolUse Hook
 * Intercepts Explore/CreateTeam and forces ARGUS consultation
 */

const { spawnSync } = require('child_process');

// Track last consultation (module-level state persists across hook invocations)
let lastConsultation = null;
const CONSULTATION_TTL = 5 * 60 * 1000; // 5 minutes

async function preToolUse(context, toolName, toolInput) {
    // Tools that require ARGUS consultation
    const memoryTools = ['Explore', 'CreateTeam', 'Task', 'Agent', 'Plan'];

    if (!memoryTools.includes(toolName)) {
        return; // Not a memory tool
    }

    // Check if recently consulted
    const now = Date.now();
    if (lastConsultation && (now - lastConsultation) < CONSULTATION_TTL) {
        return; // Still valid, skip
    }

    // Extract prompt from tool input
    const prompt = toolInput?.prompt || toolInput?.description || toolInput?.query || '';
    if (!prompt || prompt.length < 5) {
        return; // No meaningful prompt
    }

    console.log(`[ARGUS] 🔍 Checking memory before ${toolName}...`);

    // Escape prompt for shell (handle quotes and special chars)
    const promptEscaped = prompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');

    // Search ARGUS memory (synchronous for reliability)
    try {
        const argus = spawnSync(`argus recall "${promptEscaped}" --limit 5 --json`, {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 5000,
            shell: true,
            encoding: 'utf-8'
        });

        if (argus.status === 0 && argus.stdout && argus.stdout.trim()) {
            const output = argus.stdout.trim();
            console.log('[ARGUS] Found relevant context:');
            console.log(output);
            lastConsultation = Date.now();
        }
    } catch (err) {
        // Silent fail - don't break the workflow
    }
}

module.exports = { preToolUse };
"#;

        fs::write(self.hooks_dir.join("argus-pre-tool.cjs"), hook)
            .context("Failed to write argus-pre-tool.cjs")?;

        // Make executable on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let path = self.hooks_dir.join("argus-pre-tool.cjs");
            let mut perms = fs::metadata(&path)?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&path, perms)?;
        }

        Ok(())
    }

    /// Write post-tool-use hook
    fn write_post_tool_hook(&self) -> Result<()> {
        let hook = r#"#!/usr/bin/env node
/**
 * ARGUS PostToolUse Hook
 * Records successful actions to memory
 */

const { spawnSync } = require('child_process');

async function postToolUse(context, toolName, toolInput, result) {
    // Tools to record
    const recordableTools = ['Edit', 'Write', 'Explore', 'CreateTeam', 'Bash'];

    if (!recordableTools.includes(toolName)) {
        return;
    }

    // Skip failed operations
    if (result?.error) {
        return;
    }

    // Build description
    let description = '';
    let category = 'action';
    let tags = [];

    switch (toolName) {
        case 'Edit':
            description = `Modified ${toolInput?.file_path || 'unknown file'}`;
            category = 'edit';
            break;
        case 'Write':
            description = `Created ${toolInput?.file_path || 'unknown file'}`;
            category = 'create';
            tags.push('new-file');
            break;
        case 'Explore':
            description = `Explored: ${toolInput?.prompt || toolInput?.query || 'unknown'}`;
            category = 'explore';
            break;
        case 'CreateTeam':
            description = `Created team: ${toolInput?.team_name || 'unknown'}`;
            category = 'team';
            tags.push('collaboration');
            break;
        case 'Bash':
            const cmd = toolInput?.command || '';
            // Skip noisy commands
            if (/^(git status|git log|ls|dir|pwd|rtk )/.test(cmd)) {
                return;
            }
            description = `Executed: ${cmd.substring(0, 60)}${cmd.length > 60 ? '...' : ''}`;
            category = 'command';
            break;
    }

    // Auto-detect tags
    const descLower = description.toLowerCase();
    if (descLower.includes('fix') || descLower.includes('bug')) {
        tags.push('bugfix');
    }
    if (descLower.includes('add') || descLower.includes('implement') || descLower.includes('create')) {
        tags.push('feature');
    }
    if (descLower.includes('refactor') || descLower.includes('clean') || descLower.includes('simplify')) {
        tags.push('refactor');
    }
    if (descLower.includes('test')) {
        tags.push('test');
    }

    // Build command line with proper escaping
    const descriptionEscaped = description.replace(/"/g, '\\"');
    let cmdLine = `argus remember "${descriptionEscaped}"`;
    if (tags.length > 0) {
        cmdLine += ` --tags ${tags.join(',')}`;
    }
    cmdLine += ` --category ${category}`;

    // Save to ARGUS (synchronous for reliability)
    try {
        spawnSync(cmdLine, {
            stdio: 'ignore',
            shell: true,
            timeout: 5000
        });
    } catch (err) {
        // Silent fail - don't break the workflow
    }
}

module.exports = { postToolUse };
"#;

        fs::write(self.hooks_dir.join("argus-post-tool.cjs"), hook)
            .context("Failed to write argus-post-tool.cjs")?;

        // Make executable on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let path = self.hooks_dir.join("argus-post-tool.cjs");
            let mut perms = fs::metadata(&path)?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&path, perms)?;
        }

        Ok(())
    }

    /// Write ARGUS.md awareness file (like RTK.md)
    fn write_awareness_md(&self) -> Result<()> {
        let awareness = r#"# ARGUS - Sentinelle Omnisciente

**Version:** {} | **CLI:** `argus`

## Meta Commands

```bash
argus recall "pattern"      # Rechercher mémoire
argus remember "desc"       # Sauver en mémoire
argus index                 # Indexer projet
argus stats                 # Statistiques
```

## Installation Verification

```bash
argus --version    # Doit afficher la version
argus stats        # Doit afficher les stats
```

## Hook-Based Usage

Les hooks ARGUS s'exécutent automatiquement :
- **SessionStart** → Initialise ARGUS, auto-indexe
- **PreToolUse** → Consulte mémoire avant Explore/CreateTeam
- **PostToolUse** → Enregistre les actions automatiquement

## Workflow

1. Avant d'explorer → Les hooks consultent ARGUS automatiquement
2. Pendant le travail → Les hooks enregistrent automatiquement
3. Rechercher manuel → `argus recall "pattern"`

## Data Storage

Toutes les données sont stockées localement :
- `~/.argus/memory.db` → Base de données SQLite
- `~/.argus/index/` → Index de fichiers

---

*Auto-generated by ARGUS v{}*
"#;

        let awareness = awareness.replace("{}", common::VERSION);
        fs::write(self.claude_dir.join("ARGUS.md"), awareness)
            .context("Failed to write ARGUS.md")?;

        Ok(())
    }

    /// Update settings.json to register hooks (RTK-style)
    fn update_settings_json(&self) -> Result<()> {
        let settings_path = self.claude_dir.join("settings.json");

        // Backup settings.json
        if settings_path.exists() {
            let backup_path = settings_path.with_extension("json.bak");
            fs::copy(&settings_path, &backup_path)
                .context("Failed to backup settings.json")?;
            println!("  → Backed up settings.json");
        }

        // Read or create settings
        let mut settings: serde_json::Value = if settings_path.exists() {
            let content = fs::read_to_string(&settings_path)
                .context("Failed to read settings.json")?;
            serde_json::from_str(&content)
                .context("Failed to parse settings.json")?
        } else {
            serde_json::json!({})
        };

        // Ensure hooks object exists
        if !settings.get("hooks").and_then(|v| v.as_object()).is_some() {
            settings["hooks"] = serde_json::json!({});
        }

        // Add SessionStart hook
        let hooks_obj = settings["hooks"].as_object_mut().unwrap();

        // Use absolute path for reliability (especially on Windows where ~ doesn't expand)
        let hooks_dir_str = self.hooks_dir
            .to_string_lossy()
            .replace('\\', "/"); // Normalize path separators

        // SessionStart
        let session_start = serde_json::json!([
            {
                "matcher": "*",
                "hooks": [
                    {
                        "type": "command",
                        "command": format!("node {}/argus-session.cjs", hooks_dir_str),
                        "timeout": 10000
                    }
                ]
            }
        ]);
        hooks_obj.insert("SessionStart".to_string(), session_start);

        // PreToolUse - for Explore/CreateTeam interception
        let pre_tool = serde_json::json!([
            {
                "matcher": "Explore|CreateTeam|Task|Agent|Plan",
                "hooks": [
                    {
                        "type": "command",
                        "command": format!("node {}/argus-pre-tool.cjs", hooks_dir_str),
                        "timeout": 5000
                    }
                ]
            }
        ]);
        hooks_obj.insert("PreToolUse".to_string(), pre_tool);

        // PostToolUse - for recording actions
        let post_tool = serde_json::json!([
            {
                "matcher": "Edit|Write|Explore|CreateTeam|Bash",
                "hooks": [
                    {
                        "type": "command",
                        "command": format!("node {}/argus-post-tool.cjs", hooks_dir_str),
                        "timeout": 5000
                    }
                ]
            }
        ]);
        hooks_obj.insert("PostToolUse".to_string(), post_tool);

        // Write updated settings
        let json = serde_json::to_string_pretty(&settings)?;
        fs::write(&settings_path, json)
            .context("Failed to write settings.json")?;

        println!("  → Registered hooks in settings.json");

        Ok(())
    }

    /// Remove ARGUS hooks from settings.json
    fn remove_hooks_from_settings(&self) -> Result<()> {
        let settings_path = self.claude_dir.join("settings.json");

        if !settings_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&settings_path)?;
        let mut settings: serde_json::Value = serde_json::from_str(&content)?;

        // Remove hook registrations that contain "argus"
        if let Some(hooks_obj) = settings.get_mut("hooks").and_then(|v| v.as_object_mut()) {
            hooks_obj.retain(|_key, value| {
                // Keep hooks that don't reference argus
                let json_str = value.to_string();
                !json_str.contains("argus")
            });
        }

        // Remove old enabledPlugins entry if exists
        if let Some(enabled) = settings.get_mut("enabledPlugins").and_then(|v| v.as_object_mut()) {
            enabled.remove("argus@argus");
        }

        let json = serde_json::to_string_pretty(&settings)?;
        fs::write(&settings_path, json)?;

        println!("  → Removed hooks from settings.json");

        Ok(())
    }
}

/// Install hooks with output
pub fn install_hooks() -> Result<()> {
    let installer = HooksInstaller::new()?;

    if installer.is_installed() {
        println!("✓ ARGUS hooks already installed");
        installer.show_status()?;
        return Ok(());
    }

    installer.install()?;
    installer.show_status()?;
    Ok(())
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

/// Show installation status
pub fn show_status() -> Result<()> {
    let installer = HooksInstaller::new()?;
    installer.show_status()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_installer_creation() {
        let installer = HooksInstaller::new();
        assert!(installer.is_ok());
    }
}
