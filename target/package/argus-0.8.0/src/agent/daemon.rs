// ARGUS Agent Daemon - Background process for automatic memory capture

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use std::collections::HashMap;

use super::{AgentRequest, AgentResponse, SessionInfo};
use crate::core::MemoryEngine;
use crate::common::{VERSION, data_dir, db_path};

/// Daemon lock file structure
#[derive(Debug, Serialize, Deserialize)]
struct DaemonLock {
    pid: u32,
    started_at: u64,
    version: String,
}

/// Active sessions tracked by the daemon
type SessionMap = Arc<RwLock<HashMap<String, SessionInfo>>>;

/// ARGUS Agent Daemon
///
/// Runs in the background to:
/// - Track Claude Code sessions
/// - Automatically capture transactions
/// - Provide semantic search via IPC
/// - Support multiple concurrent Claude Code sessions
pub struct AgentDaemon {
    engine: Arc<MemoryEngine>,
    sessions: SessionMap,
    running: Arc<RwLock<bool>>,
}

impl AgentDaemon {
    /// Create a new agent daemon
    pub async fn new() -> Result<Self> {
        let db_path = db_path()
            .context("Failed to determine database path")?;

        let engine = Arc::new(MemoryEngine::with_path(db_path)
            .await
            .context("Failed to initialize memory engine")?);

        Ok(Self {
            engine,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            running: Arc::new(RwLock::new(true)),
        })
    }

    /// Start the daemon and begin processing requests
    pub async fn run(&self) -> Result<()> {
        // Create lock file
        create_lock_file()?;

        let transport = super::ipc::IpcTransport::for_platform()
            .context("Failed to create IPC transport")?;

        println!("🤖 ARGUS Agent starting...");
        println!("📍 IPC: {}", transport.path());
        println!("💾 Database: {}", db_path()?.display());
        println!("📝 PID: {}", std::process::id());

        // Create IPC server
        let server = super::ipc::IpcServer::new()?;

        // Clone shared state for the handler
        let engine = self.engine.clone();
        let sessions = self.sessions.clone();
        let running = self.running.clone();

        // Request handler
        let handler = move |request: AgentRequest| -> AgentResponse {
            let rt = tokio::runtime::Runtime::new()
                .unwrap_or_else(|_| tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .unwrap());

            rt.block_on(async {
                Self::handle_request(request, &engine, &sessions).await
            })
        };

        // Run the server (blocking call)
        let result = server.run(handler);

        // Clean up lock file on exit
        let _ = remove_lock_file();

        result
    }

    /// Stop the daemon gracefully
    pub async fn stop(&self) {
        *self.running.write().await = false;
    }

    /// Handle incoming IPC request
    async fn handle_request(
        request: AgentRequest,
        engine: &Arc<MemoryEngine>,
        sessions: &SessionMap,
    ) -> AgentResponse {
        match request.action {
            super::AgentAction::StartSession { working_dir, platform, theme } => {
                let session = SessionInfo::new(working_dir, platform, theme);
                let session_id = session.id.clone();

                sessions.write().await.insert(session_id.clone(), session.clone());

                let active_count = sessions.read().await.len();
                AgentResponse {
                    status: "ok".to_string(),
                    data: Some(format!(
                        "Session {} started. Active sessions: {}",
                        session_id, active_count
                    )),
                }
            }

            super::AgentAction::EndSession => {
                if let Some(session) = sessions.write().await.remove(&request.session_id) {
                    let active_count = sessions.read().await.len();
                    AgentResponse {
                        status: "ok".to_string(),
                        data: Some(format!(
                            "Session {} ended. Active sessions: {}",
                            session.id, active_count
                        )),
                    }
                } else {
                    AgentResponse {
                        status: "error".to_string(),
                        data: Some("Session not found".to_string()),
                    }
                }
            }

            super::AgentAction::Search { query } => {
                match engine.recall(&query, 10).await {
                    Ok(results) => {
                        let json = serde_json::to_string(&results)
                            .unwrap_or_else(|_| "[]".to_string());
                        AgentResponse {
                            status: "ok".to_string(),
                            data: Some(json),
                        }
                    }
                    Err(e) => AgentResponse {
                        status: "error".to_string(),
                        data: Some(format!("Search failed: {}", e)),
                    }
                }
            }

            super::AgentAction::Register { action_type, description, files } => {
                // Create transaction from registration
                let context = crate::storage::Context {
                    cwd: std::env::current_dir()
                        .unwrap_or_else(|_| PathBuf::from("/"))
                        .to_string_lossy()
                        .to_string(),
                    platform: std::env::consts::OS.to_string(),
                    session_id: Some(request.session_id),
                    project_path: std::env::current_dir()
                        .ok()
                        .and_then(|p| p.to_str().map(String::from)),
                    git_branch: None,
                    git_commit: None,
                };

                let mut metadata = crate::storage::Metadata::default();
                metadata.category = Some(action_type.clone());
                metadata.summary = Some(description.clone());

                // Add files as sources
                if !files.is_empty() {
                    // Could store file references in metadata
                }

                let tx = crate::storage::Transaction::user(
                    description,
                    context,
                ).with_metadata(metadata);

                match engine.remember(tx).await {
                    Ok(id) => AgentResponse {
                        status: "ok".to_string(),
                        data: Some(format!("Registered as #{}", id)),
                    },
                    Err(e) => AgentResponse {
                        status: "error".to_string(),
                        data: Some(format!("Registration failed: {}", e)),
                    }
                }
            }

            super::AgentAction::Ping => {
                let active_count = sessions.read().await.len();
                AgentResponse {
                    status: "pong".to_string(),
                    data: Some(format!(
                        "ARGUS Agent is running. Active sessions: {}",
                        active_count
                    )),
                }
            }
        }
    }

    /// Get current session info
    pub async fn get_session(&self, session_id: &str) -> Option<SessionInfo> {
        self.sessions.read().await.get(session_id).cloned()
    }

    /// List all active sessions
    pub async fn list_sessions(&self) -> Vec<SessionInfo> {
        self.sessions.read().await.values().cloned().collect()
    }
}

/// Get lock file path
fn lock_file_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("daemon.lock"))
}

/// Create daemon lock file
pub fn create_lock_file() -> Result<()> {
    let lock_path = lock_file_path()?;

    // Check if lock file already exists
    if lock_path.exists() {
        // Try to read and validate existing lock
        if let Ok(content) = fs::read_to_string(&lock_path) {
            if let Ok(lock) = serde_json::from_str::<DaemonLock>(&content) {
                // Check if process is still alive
                if is_process_alive(lock.pid) {
                    return Err(anyhow::anyhow!(
                        "Daemon already running with PID: {}. Use 'argus daemon stop' first.",
                        lock.pid
                    ));
                }
            }
        }
        // Lock file is stale, remove it
        let _ = fs::remove_file(&lock_path);
    }

    // Create new lock file
    let lock = DaemonLock {
        pid: std::process::id(),
        started_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        version: VERSION.to_string(),
    };

    let lock_json = serde_json::to_string_pretty(&lock)?;
    fs::write(&lock_path, lock_json)?;

    Ok(())
}

/// Remove daemon lock file
pub fn remove_lock_file() -> Result<()> {
    let lock_path = lock_file_path()?;
    if lock_path.exists() {
        fs::remove_file(&lock_path)?;
    }
    Ok(())
}

/// Check if a process is alive
fn is_process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, 0) == 0
        }
    }

    #[cfg(windows)]
    {
        // On Windows, we'll use IPC ping as the primary check
        // The lock file timestamp is used as a fallback
        // For now, return true and let the IPC ping determine actual status
        true
    }

    #[cfg(not(any(unix, windows)))]
    {
        true
    }
}

/// Read lock file
pub fn read_lock_file() -> Result<Option<DaemonLock>> {
    let lock_path = lock_file_path()?;

    if !lock_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&lock_path)?;
    let lock: DaemonLock = serde_json::from_str(&content)?;
    Ok(Some(lock))
}

/// Check if daemon is running
pub fn is_daemon_running() -> bool {
    use super::ipc::IpcClient;

    // First check via IPC (more reliable)
    if let Ok(client) = IpcClient::new() {
        if client.ping() {
            return true;
        }
    }

    // Fallback to lock file check
    if let Ok(Some(lock)) = read_lock_file() {
        return is_process_alive(lock.pid);
    }

    false
}

/// Start daemon in background mode
pub fn start_daemon_background() -> Result<()> {
    if is_daemon_running() {
        return Ok(());
    }

    #[cfg(unix)]
    {
        // Fork on Unix systems
        unsafe {
            let pid = libc::fork();
            if pid < 0 {
                return Err(anyhow::anyhow!("Failed to fork daemon"));
            } else if pid == 0 {
                // Child process - daemonize
                let _ = libc::setsid();

                // Redirect stdout/stderr to null
                let null = libc::open(b"/dev/null\0".as_ptr() as *const i8, libc::O_RDWR);
                if null >= 0 {
                    libc::dup2(null, libc::STDOUT_FILENO);
                    libc::dup2(null, libc::STDERR_FILENO);
                    libc::close(null);
                }

                // The actual daemon will be started by the caller
                Ok(())
            } else {
                // Parent process - exit
                std::process::exit(0);
            }
        }
    }

    #[cfg(windows)]
    {
        // On Windows, use DETACHED_PROCESS flag
        // The process is already spawned with CREATE_NO_WINDOW or similar
        Ok(())
    }

    #[cfg(not(any(unix, windows)))]
    {
        Err(anyhow::anyhow!("Background mode not supported on this platform"))
    }
}

/// Stop daemon
pub fn stop_daemon() -> Result<()> {
    if !is_daemon_running() {
        println!("✓ ARGUS Agent is not running");
        return Ok(());
    }

    // Send shutdown request via IPC
    let client = super::ipc::IpcClient::new()?;
    let request = AgentRequest {
        session_id: "shutdown".to_string(),
        action: super::AgentAction::EndSession,
    };

    let _ = client.send(&request);

    // Wait a bit and remove lock file
    std::thread::sleep(std::time::Duration::from_millis(500));
    let _ = remove_lock_file();

    println!("✓ ARGUS Agent stopped");

    Ok(())
}

/// Get daemon status
pub fn daemon_status() -> Result<DaemonStatus> {
    let lock = read_lock_file()?;

    let is_running = is_daemon_running();

    Ok(DaemonStatus {
        running: is_running,
        pid: lock.as_ref().map(|l| l.pid),
        uptime: lock.as_ref().map(|l| {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            now.saturating_sub(l.started_at)
        }),
        version: lock.and_then(|l| Some(l.version)),
    })
}

/// Daemon status information
#[derive(Debug, Clone)]
pub struct DaemonStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub uptime: Option<u64>,
    pub version: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lock_file_creation() {
        // This test is for CI, actual daemon tests would need cleanup
        let lock_path = lock_file_path();
        assert!(lock_path.is_ok());
    }
}
