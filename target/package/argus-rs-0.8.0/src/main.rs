// ARGUS CLI - Command-line interface for Claude Code memory sentinel

use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

mod cli;
mod core;
mod storage;
mod common;
mod hooks;

#[cfg(feature = "agent")]
mod agent;

use cli::commands::*;

/// ARGUS - Omniscient memory sentinel for Claude Code
#[derive(Parser)]
#[command(name = "argus")]
#[command(version = "0.8.0")]
#[command(about = "ARGUS maintains semantic memory of your Claude Code sessions", long_about = None)]
#[command(author = "Yanis")]
#[command(long_about = "ARGUS is a memory system that helps you remember past actions and \
find patterns in your development work. It stores transactions locally and provides fast semantic search.")]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Verbose output
    #[arg(short, long, global = true)]
    verbose: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize ARGUS (create ~/.argus/ + inject Claude Code rules)
    Init {
        /// Skip injecting rules to ~/.claude/rules/
        #[arg(long)]
        no_rules: bool,
    },

    /// Remember a transaction for future reference
    Remember {
        /// Description of what was done
        description: String,

        /// Add tags (comma-separated)
        #[arg(short, long)]
        tags: Option<String>,

        /// Set category
        #[arg(short, long)]
        category: Option<String>,
    },

    /// Recall/search past transactions
    Recall {
        /// Search query
        query: String,

        /// Maximum number of results
        #[arg(short, long, default_value = "10")]
        limit: usize,

        /// Show full output including context
        #[arg(short, long)]
        full: bool,
    },

    /// List recent transactions
    List {
        /// Maximum number of results
        #[arg(short, long, default_value = "20")]
        limit: usize,
    },

    /// Show a specific transaction
    Show {
        /// Transaction ID
        id: i64,
    },

    /// Index current project for semantic search
    Index {
        /// Path to index (default: current directory)
        #[arg(short, long)]
        path: Option<PathBuf>,

        /// Force re-index even if already indexed
        #[arg(long)]
        force: bool,
    },

    /// Show statistics
    Stats,

    /// Configuration management
    Config {
        #[command(subcommand)]
        config_cmd: ConfigCommand,
    },

    /// Prune old transactions
    Prune {
        /// Delete transactions older than DATE (e.g., "30d", "3m", "1y")
        before: String,

        /// Dry run (show what would be deleted)
        #[arg(long)]
        dry_run: bool,
    },

    /// Reset ARGUS (delete all data) - DANGEROUS!
    Reset {
        /// Confirm without prompting
        #[arg(long)]
        confirm: bool,
    },

    /// Generate shell completions
    Complete {
        /// Shell type
        shell: Option<String>,
    },

    /// Install Claude Code hooks
    Install {
        /// Uninstall hooks instead of installing
        #[arg(long)]
        uninstall: bool,
    },

    /// Daemon management
    Daemon {
        #[command(subcommand)]
        daemon_cmd: DaemonCommand,
    },
}

#[derive(Subcommand)]
enum DaemonCommand {
    /// Start the ARGUS agent daemon
    Start {
        /// Run in background (default for auto-start from hooks)
        #[arg(long)]
        background: bool,

        /// Run in foreground (for debugging)
        #[arg(long, conflicts_with = "background")]
        foreground: bool,
    },

    /// Stop the ARGUS agent daemon
    Stop,

    /// Check daemon status
    Status,

    /// Ping the daemon
    Ping,
}

impl Cli {
    /// Generate completions for shells
    pub fn generate_completions(shell: Option<String>) -> anyhow::Result<()> {
        use clap::Command;
        use clap_complete::{generate, Shell};

        let shell_enum = match shell.as_deref() {
            Some("bash") | None => Shell::Bash,
            Some("elvish") => Shell::Elvish,
            Some("fish") => Shell::Fish,
            Some("powershell") | Some("pwsh") => Shell::PowerShell,
            Some("zsh") => Shell::Zsh,
            Some(s) => {
                eprintln!("Unknown shell: {}", s);
                eprintln!("Supported: bash, elvish, fish, powershell, zsh");
                return Ok(());
            }
        };

        let mut cmd = Command::new("argus");
        cmd = Commands::augment_subcommands(cmd);

        let name = "argus".to_string();
        generate(shell_enum, &mut cmd, name, &mut std::io::stdout());

        Ok(())
    }
}

#[derive(Subcommand)]
enum ConfigCommand {
    /// Get a config value
    Get {
        /// Config key
        key: String,
    },

    /// Set a config value
    Set {
        /// Config key
        key: String,
        /// Config value
        value: String,
    },

    /// List all config
    List,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    if cli.verbose {
        tracing_subscriber::fmt()
            .with_max_level(tracing::Level::DEBUG)
            .init();
    }

    // Run command
    match cli.command {
        Commands::Init { no_rules } => cmd_init(no_rules).await,
        Commands::Remember { description, tags, category } => {
            cmd_remember(description, tags, category).await
        }
        Commands::Recall { query, limit, full } => {
            cmd_recall(query, limit, full).await
        }
        Commands::List { limit } => {
            cmd_list(limit).await
        }
        Commands::Show { id } => cmd_show(id).await,
        Commands::Index { path, force } => {
            cmd_index(path, force).await
        }
        Commands::Stats => {
            cmd_stats().await
        }
        Commands::Config { config_cmd } => match config_cmd {
            ConfigCommand::Get { key } => cmd_config_get(key).await,
            ConfigCommand::Set { key, value } => cmd_config_set(key, value).await,
            ConfigCommand::List => cmd_config_list().await,
        },
        Commands::Prune { before, dry_run } => {
            cmd_prune(before, dry_run).await
        }
        Commands::Reset { confirm } => {
            cmd_reset(confirm).await
        }
        Commands::Complete { shell } => {
            Cli::generate_completions(shell)
        }
        Commands::Install { uninstall } => {
            cmd_install(uninstall).await
        }
        Commands::Daemon { daemon_cmd } => match daemon_cmd {
            DaemonCommand::Start { background, foreground } => {
                cmd_daemon_start(background, foreground).await
            }
            DaemonCommand::Stop => cmd_daemon_stop().await,
            DaemonCommand::Status => cmd_daemon_status().await,
            DaemonCommand::Ping => cmd_daemon_ping().await,
        },
    }
}
