// Shared data models

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Type of prompt that created this transaction
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PromptType {
    User,
    Tool,
    System,
}

/// Context information about where the transaction happened
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Context {
    pub cwd: String,
    pub platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_commit: Option<String>,
}

/// Result of a tool/action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub tools_used: Vec<String>,
}

/// Additional metadata for the transaction
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Metadata {
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// A stored transaction representing a Claude Code action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    pub prompt: String,
    #[serde(rename = "prompt_type")]
    pub prompt_type: PromptType,
    pub context: Context,
    pub result: TxResult,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<DateTime<Utc>>,
}

impl Transaction {
    /// Create a new user transaction
    pub fn user(prompt: impl Into<String>, context: Context) -> Self {
        Self {
            id: None,
            prompt: prompt.into(),
            prompt_type: PromptType::User,
            context,
            result: TxResult {
                success: true,
                output: None,
                error: None,
                duration_ms: None,
                tools_used: Vec::new(),
            },
            metadata: None,
            created_at: None,
        }
    }

    /// Create a new tool transaction
    pub fn tool(prompt: impl Into<String>, context: Context) -> Self {
        Self {
            id: None,
            prompt: prompt.into(),
            prompt_type: PromptType::Tool,
            context,
            result: TxResult {
                success: true,
                output: None,
                error: None,
                duration_ms: None,
                tools_used: Vec::new(),
            },
            metadata: None,
            created_at: None,
        }
    }

    /// Add metadata to the transaction
    pub fn with_metadata(mut self, metadata: Metadata) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// Add a summary to the transaction
    pub fn with_summary(mut self, summary: impl Into<String>) -> Self {
        let mut meta = self.metadata.unwrap_or_default();
        meta.summary = Some(summary.into());
        self.metadata = Some(meta);
        self
    }

    /// Add tags to the transaction
    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        let mut meta = self.metadata.unwrap_or_default();
        meta.tags = tags;
        self.metadata = Some(meta);
        self
    }
}

/// Memory statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub total_transactions: i64,
    pub total_size_bytes: i64,
    pub oldest_transaction: Option<DateTime<Utc>>,
    pub newest_transaction: Option<DateTime<Utc>>,
    pub transactions_by_type: HashMap<String, i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transaction_user() {
        let ctx = Context {
            cwd: "/test".to_string(),
            platform: "linux".to_string(),
            session_id: None,
            project_path: None,
            git_branch: None,
            git_commit: None,
        };
        let tx = Transaction::user("test prompt", ctx);
        assert_eq!(tx.prompt_type, PromptType::User);
        assert_eq!(tx.prompt, "test prompt");
    }

    #[test]
    fn test_transaction_with_summary() {
        let ctx = Context {
            cwd: "/test".to_string(),
            platform: "linux".to_string(),
            session_id: None,
            project_path: None,
            git_branch: None,
            git_commit: None,
        };
        let tx = Transaction::user("test", ctx).with_summary("Test summary");
        assert_eq!(tx.metadata.as_ref().unwrap().summary.as_deref(), Some("Test summary"));
    }
}
