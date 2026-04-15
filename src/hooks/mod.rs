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
        self.write_session_end_hook()?;

        // Write ARGUS.md awareness
        self.write_awareness_md()?;

        // Update settings.json to register hooks + MCP server
        self.update_settings_json()?;

        // Register MCP server in settings.json
        self.register_mcp_server()?;

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
            "argus-session-end.cjs",
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

        // Remove MCP server from settings.json
        self.remove_mcp_server()?;

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
            ("argus-session.cjs", "SessionStart hook (context injection)"),
            ("argus-pre-tool.cjs", "PreToolUse hook"),
            ("argus-post-tool.cjs", "PostToolUse hook (queue async)"),
            ("argus-session-end.cjs", "SessionEnd hook (process queue)"),
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

    /// Write session-start hook (v0.9.0 with context injection)
    fn write_session_hook(&self) -> Result<()> {
        let hook = r#"#!/usr/bin/env node
/**
 * ARGUS SessionStart Hook (v0.9.0)
 * Injects context from past sessions + auto-indexes project
 *
 * Outputs hookSpecificOutput.additionalContext for Claude Code
 */

const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function main() {
    let inputData = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { inputData += chunk; });
    process.stdin.on('end', () => {
        let context = {};
        try {
            context = JSON.parse(inputData);
        } catch (e) {
            // No context provided
        }

        const workingDir = context?.working_directory || process.cwd();

        // Verify ARGUS CLI is available
        try {
            const check = spawnSync('argus', ['--version'], {
                stdio: 'pipe',
                timeout: 5000,
                shell: false
            });

            if (check.status !== 0) {
                process.stderr.write('[ARGUS] CLI not found\n');
                process.exit(0);
                return;
            }
        } catch (err) {
            process.exit(0);
            return;
        }

        // Auto-index current project if needed (background)
        const argusDir = path.join(require('os').homedir(), '.argus');
        const indexFile = path.join(argusDir, 'index.json');

        let shouldIndex = true;
        try {
            if (fs.existsSync(indexFile)) {
                const stats = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
                const lastIndexed = stats.lastIndexed || 0;
                const hoursSince = (Date.now() - lastIndexed) / (1000 * 60 * 60);
                shouldIndex = hoursSince > 3;
            }

            if (shouldIndex) {
                const index = spawn('argus', ['index'], {
                    stdio: 'ignore',
                    shell: false,
                    detached: true,
                    cwd: workingDir
                });
                index.unref();
            }
        } catch (err) {
            // Silent fail
        }

        // Context injection — get compact index of recent observations
        try {
            const contextResult = spawnSync('argus', [
                'context',
                '--project', workingDir,
                '--limit', '20'
            ], {
                encoding: 'utf8',
                timeout: 10000,
                shell: false
            });

            if (contextResult.status === 0 && contextResult.stdout && contextResult.stdout.trim().length > 20) {
                const output = JSON.stringify({
                    hookSpecificOutput: {
                        hookEventName: 'SessionStart',
                        additionalContext: contextResult.stdout.trim()
                    }
                });
                process.stdout.write(output + '\n');
            }
        } catch (err) {
            // Context injection failed silently — not critical
        }

        process.exit(0);
    });
}

main();
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
        let hook = r#"/**
 * ARGUS PreToolUse Hook
 * Consults ARGUS memory before Explore/CreateTeam/Agent/Plan
 */

const { spawnSync } = require('child_process');

// Enable debug output via ARGUS_HOOK_DEBUG=1
const DEBUG = process.env.ARGUS_HOOK_DEBUG === '1';

function preToolUse(context, toolName, toolInput) {
    // Only run for specific tools
    const targetTools = ['Explore', 'CreateTeam', 'Task', 'Agent', 'Plan'];
    if (!targetTools.includes(toolName)) {
        return;
    }

    // Extract a meaningful query from tool input
    const prompt = toolInput?.prompt || toolInput?.description || toolInput?.query || '';
    if (!prompt || prompt.length < 3) {
        return;
    }

    if (DEBUG) {
        console.error('[ARGUS] Searching for:', prompt.substring(0, 50));
    }

    // Search ARGUS memory
    try {
        const argus = spawnSync('argus', ['recall', prompt, '--limit', '3', '--json'], {
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 5000,
            shell: false,
            encoding: 'utf-8'
        });

        if (argus.status === 0 && argus.stdout && argus.stdout.trim()) {
            const results = JSON.parse(argus.stdout);
            if (Array.isArray(results) && results.length > 0) {
                // Format results for Claude
                const output = "\n🔍 [ARGUS] Found " + results.length + " relevant memories for \"" +
                    prompt.substring(0, 50) + "...\":\n" +
                    results.map(r => {
                        const summary = (r.summary || r.prompt || '').substring(0, 80);
                        const date = new Date(r.created_at).toLocaleDateString();
                        return "  • " + summary + "... (" + date + ")";
                    }).join('\n');

                // Write to stderr for visibility (may not appear in conversation)
                console.error(output);

                if (DEBUG) {
                    console.error('[ARGUS] Found', results.length, 'memories');
                }

                // Return output that will be visible in conversation (may not work)
                return {
                    permissionDecision: 'allow',
                    permissionDecisionReason: output
                };
            }
        }
    } catch (err) {
        if (DEBUG) {
            console.error('[ARGUS] Error:', err.message);
        }
        // Silent fail
    }

    if (DEBUG) {
        console.error('[ARGUS] No memories found');
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

    /// Write post-tool-use hook (v0.9.0 with async queue)
    fn write_post_tool_hook(&self) -> Result<()> {
        let hook = r#"#!/usr/bin/env node
/**
 * ARGUS PostToolUse Hook (v0.9.0)
 * Writes actions to async queue instead of synchronous CLI calls
 * Queue is processed at SessionEnd via argus process-queue
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function main() {
    let inputData = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { inputData += chunk; });
    process.stdin.on('end', () => {
        let context = {};
        try {
            context = JSON.parse(inputData);
        } catch (e) {
            process.exit(0);
            return;
        }

        const toolName = context?.tool_name || '';
        const toolInput = context?.tool_input || {};
        const sessionId = context?.session_id || 'unknown';

        // Build description based on tool
        let description = '';
        let category = 'action';
        let tags = [];
        let type = 'action';

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
            case 'Bash': {
                const cmd = toolInput?.command || '';
                // Skip noisy/read-only/trivial commands
                if (/^(git status|git log|git diff|ls|dir|pwd|rtk |cat |head |tail |argus |echo |which |env |printenv|find |grep |rg |tree |bat )/.test(cmd)) {
                    process.exit(0);
                    return;
                }
                description = `Executed: ${cmd.substring(0, 80)}${cmd.length > 80 ? '...' : ''}`;
                category = 'command';
                break;
            }
            default:
                process.exit(0);
                return;
        }

        if (!description || description.length < 20) {
            process.exit(0);
            return;
        }

        // Auto-detect observation type from description
        const descLower = description.toLowerCase();
        if (descLower.includes('fix') || descLower.includes('bug') || descLower.includes('error')) {
            type = 'problem-solution';
            tags.push('bugfix');
        } else if (descLower.includes('decide') || descLower.includes('chose') || descLower.includes('selected')) {
            type = 'decision';
        } else if (descLower.includes('discover') || descLower.includes('found') || descLower.includes('learned')) {
            type = 'discovery';
        }
        if (descLower.includes('test')) tags.push('test');

        // Write to queue file (async JSONL)
        try {
            const queueDir = path.join(os.homedir(), '.argus', 'queue');
            fs.mkdirSync(queueDir, { recursive: true });

            const queueFile = path.join(queueDir, `${sessionId}.jsonl`);
            const queueEntry = {
                description,
                category,
                type,
                tags,
                timestamp: Date.now(),
                sessionId
            };

            fs.appendFileSync(queueFile, JSON.stringify(queueEntry) + '\n');
        } catch (err) {
            // Silent fail — queue write failed
        }

        process.exit(0);
    });
}

main();
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

    /// Write session-end hook (v0.9.0 — processes queue)
    fn write_session_end_hook(&self) -> Result<()> {
        let hook = r#"#!/usr/bin/env node
/**
 * ARGUS SessionEnd Hook (v0.9.0)
 * Processes the async queue at session end
 * Calls argus process-queue to flush pending entries to the database
 */

const { spawnSync } = require('child_process');

function main() {
    let inputData = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { inputData += chunk; });
    process.stdin.on('end', () => {
        let context = {};
        try {
            context = JSON.parse(inputData);
        } catch (e) {
            // No context provided
        }

        const sessionId = context?.session_id;

        // Process queue
        try {
            const args = ['process-queue', '--limit', '100'];
            if (sessionId) {
                args.push('--session', sessionId);
            }

            spawnSync('argus', args, {
                stdio: 'ignore',
                shell: false,
                timeout: 15000
            });
        } catch (err) {
            // Silent fail
        }

        process.exit(0);
    });
}

main();
"#;

        fs::write(self.hooks_dir.join("argus-session-end.cjs"), hook)
            .context("Failed to write argus-session-end.cjs")?;

        // Make executable on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let path = self.hooks_dir.join("argus-session-end.cjs");
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
argus context               # Contexte compact (session start)
argus get <id>              # Détails transaction
argus summarize             # Sauver résumé session
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
- **SessionStart** → Injecte contexte des sessions passées + auto-indexe
- **PreToolUse** → Consulte mémoire avant Explore/CreateTeam
- **PostToolUse** → Écrit dans queue async (JSONL)
- **SessionEnd** → Traite la queue → DB

## Workflow

1. Session démarre → ARGUS injecte les 20 dernières observations
2. Avant d'explorer → Les hooks consultent ARGUS automatiquement
3. Pendant le travail → Les hooks écrivent dans la queue
4. Session finit → Queue traitée automatiquement

## Data Storage

Toutes les données sont stockées localement :
- `~/.argus/memory.db` → Base de données SQLite
- `~/.argus/queue/` → Queue async (JSONL)
- `~/.argus/index/` → Index de fichiers

---

*Auto-generated by ARGUS v{}*
"#;

        let awareness = awareness.replace("{}", common::VERSION);
        fs::write(self.claude_dir.join("ARGUS.md"), awareness)
            .context("Failed to write ARGUS.md")?;

        Ok(())
    }

    /// Update settings.json to register hooks (RTK-style, merge with existing)
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

        let hooks_obj = settings["hooks"].as_object_mut().unwrap();

        // Use absolute path for reliability (especially on Windows where ~ doesn't expand)
        let hooks_dir_str = self.hooks_dir
            .to_string_lossy()
            .replace('\\', "/"); // Normalize path separators

        // Define ARGUS hook entries
        let argus_hooks = vec![
            ("SessionStart", serde_json::json!({
                "matcher": "*",
                "hooks": [{
                    "type": "command",
                    "command": format!("node {}/argus-session.cjs", hooks_dir_str),
                    "timeout": 10000
                }]
            })),
            ("PreToolUse", serde_json::json!({
                "matcher": "Explore|CreateTeam|Task|Agent|Plan",
                "hooks": [{
                    "type": "command",
                    "command": format!("node {}/argus-pre-tool.cjs", hooks_dir_str),
                    "timeout": 5000
                }]
            })),
            ("PostToolUse", serde_json::json!({
                "matcher": "Edit|Write|Explore|CreateTeam|Bash",
                "hooks": [{
                    "type": "command",
                    "command": format!("node {}/argus-post-tool.cjs", hooks_dir_str),
                    "timeout": 5000
                }]
            })),
            ("SessionEnd", serde_json::json!({
                "matcher": "*",
                "hooks": [{
                    "type": "command",
                    "command": format!("node {}/argus-session-end.cjs", hooks_dir_str),
                    "timeout": 15000
                }]
            })),
        ];

        for (hook_type, argus_entry) in argus_hooks {
            // Get or create the array for this hook type
            let entries = hooks_obj
                .entry(hook_type)
                .or_insert_with(|| serde_json::json!([]));

            let arr = entries.as_array_mut()
                .ok_or_else(|| anyhow::anyhow!("{} is not an array in settings.json", hook_type))?;

            // Remove any existing ARGUS entries (to avoid duplicates on re-init)
            arr.retain(|entry| {
                let json_str = entry.to_string();
                !json_str.contains("argus-")
            });

            // Append the new ARGUS entry
            arr.push(argus_entry);
        }

        // Write updated settings
        let json = serde_json::to_string_pretty(&settings)?;
        fs::write(&settings_path, json)
            .context("Failed to write settings.json")?;

        println!("  → Registered hooks in settings.json");

        Ok(())
    }

    /// Remove ARGUS hooks from settings.json (preserves other hooks)
    fn remove_hooks_from_settings(&self) -> Result<()> {
        let settings_path = self.claude_dir.join("settings.json");

        if !settings_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&settings_path)?;
        let mut settings: serde_json::Value = serde_json::from_str(&content)?;

        // Remove only ARGUS entries from each hook type array (preserve others)
        if let Some(hooks_obj) = settings.get_mut("hooks").and_then(|v| v.as_object_mut()) {
            for (_key, value) in hooks_obj.iter_mut() {
                if let Some(arr) = value.as_array_mut() {
                    arr.retain(|entry| {
                        let json_str = entry.to_string();
                        !json_str.contains("argus-")
                    });
                }
            }
        }

        // Remove old enabledPlugins entry if exists
        if let Some(enabled) = settings.get_mut("enabledPlugins").and_then(|v| v.as_object_mut()) {
            enabled.remove("argus@argus");
        }

        let json = serde_json::to_string_pretty(&settings)?;
        fs::write(&settings_path, json)?;

        println!("  → Removed ARGUS hooks from settings.json");

        Ok(())
    }

    /// Register ARGUS MCP server in settings.json
    fn register_mcp_server(&self) -> Result<()> {
        let settings_path = self.claude_dir.join("settings.json");

        if !settings_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&settings_path)?;
        let mut settings: serde_json::Value = serde_json::from_str(&content)?;

        // Ensure mcpServers object exists
        if !settings.get("mcpServers").and_then(|v| v.as_object()).is_some() {
            settings["mcpServers"] = serde_json::json!({});
        }

        let mcp_obj = settings["mcpServers"].as_object_mut().unwrap();

        // Detect path to MCP server (relative to argus binary or from common path)
        let mcp_server_path = if let Ok(argus_bin) = which::which("argus") {
            // Try to find mcp-server relative to the binary's source
            if let Some(bin_dir) = argus_bin.parent() {
                let candidate = bin_dir.join("..").join("Projects").join("-plugins").join("argus").join("mcp-server").join("index.js");
                if candidate.exists() {
                    candidate.canonicalize().unwrap_or(candidate)
                } else {
                    // Fallback to hardcoded path
                    std::path::PathBuf::from("C:/Users/Yanis/Projects/-plugins/argus/mcp-server/index.js")
                }
            } else {
                std::path::PathBuf::from("C:/Users/Yanis/Projects/-plugins/argus/mcp-server/index.js")
            }
        } else {
            std::path::PathBuf::from("C:/Users/Yanis/Projects/-plugins/argus/mcp-server/index.js")
        };

        let mcp_path_str = mcp_server_path.to_string_lossy().replace('\\', "/");

        // Add or update the argus MCP server entry
        mcp_obj.insert("argus".to_string(), serde_json::json!({
            "command": "node",
            "args": [mcp_path_str]
        }));

        let json = serde_json::to_string_pretty(&settings)?;
        fs::write(&settings_path, json)?;

        println!("  → Registered ARGUS MCP server in settings.json");

        Ok(())
    }

    /// Remove ARGUS MCP server from settings.json
    fn remove_mcp_server(&self) -> Result<()> {
        let settings_path = self.claude_dir.join("settings.json");

        if !settings_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&settings_path)?;
        let mut settings: serde_json::Value = serde_json::from_str(&content)?;

        if let Some(mcp_obj) = settings.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
            mcp_obj.remove("argus");
        }

        let json = serde_json::to_string_pretty(&settings)?;
        fs::write(&settings_path, json)?;

        println!("  → Removed ARGUS MCP server from settings.json");

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
