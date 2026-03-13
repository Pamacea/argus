// Agent module - Background daemon for automatic memory capture

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[cfg(feature = "agent")]
pub mod ipc;
#[cfg(feature = "agent")]
pub mod daemon;

/// Current session information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub started_at: String,
    pub working_dir: String,
    pub platform: String,
    pub theme: String,
}

impl SessionInfo {
    pub fn new(working_dir: String, platform: String, theme: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            started_at: chrono::Utc::now().to_rfc3339(),
            working_dir,
            platform,
            theme,
        }
    }
}

/// Message from Claude Code to Agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRequest {
    pub session_id: String,
    pub action: AgentAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentAction {
    StartSession { working_dir: String, platform: String, theme: String },
    EndSession,
    Search { query: String },
    Register { action_type: String, description: String, files: Vec<String> },
    Ping,
}

/// Response from Agent to Claude Code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResponse {
    pub status: String,
    pub data: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_info() {
        let session = SessionInfo::new(
            "/test".to_string(),
            "linux".to_string(),
            "dark".to_string()
        );
        assert!(!session.id.is_empty());
    }
}
