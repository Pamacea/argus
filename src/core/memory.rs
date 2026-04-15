// Memory Engine - Transaction storage and retrieval

use crate::storage::{Db, Context, MemoryStats, ObservationType, PromptType, SessionSummary, Transaction, TxResult};
use chrono::{DateTime, TimeZone, Utc};
use rusqlite::params;

/// Memory engine for storing and retrieving transactions
pub struct MemoryEngine {
    db: Db,
}

impl MemoryEngine {
    /// Create a new memory engine with default database path
    pub async fn new() -> anyhow::Result<Self> {
        let db_path = crate::common::db_path()?;
        Self::with_path(db_path).await
    }

    /// Create a new memory engine with specific database path
    pub async fn with_path(path: std::path::PathBuf) -> anyhow::Result<Self> {
        let db = Db::open(path).await?;
        Ok(Self { db })
    }

    /// Remember a transaction
    pub async fn remember(&self, tx: Transaction) -> anyhow::Result<i64> {
        let conn = self.db.conn().clone();
        let Transaction { prompt, prompt_type, context, result, metadata, created_at, observation_type, .. } = tx;

        // Extract fields before serializing
        let session_id = context.session_id.clone();
        let project_path = context.project_path.clone();

        let prompt_type = serde_json::to_string(&prompt_type)?;
        let context = serde_json::to_string(&context)?;
        let result = serde_json::to_string(&result)?;

        let summary = metadata.as_ref().and_then(|m| m.summary.clone());
        let intent = metadata.as_ref().and_then(|m| m.intent.clone());
        let metadata = metadata.map(|m| serde_json::to_string(&m).ok()).flatten();
        let created_at: i64 = created_at
            .map(|dt| dt.timestamp())
            .unwrap_or_else(|| Utc::now().timestamp());

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            conn.execute(
                r#"
                INSERT INTO transactions
                (prompt, prompt_type, summary, intent, context, result, metadata, created_at, session_id, project_path, observation_type)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                "#,
                params![
                    prompt, prompt_type, summary, intent, context, result, metadata, created_at, session_id, project_path, observation_type,
                ],
            )?;
            Ok(conn.last_insert_rowid())
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))?
    }

    /// Recall transactions by search query
    pub async fn recall(&self, query: &str, limit: usize) -> anyhow::Result<Vec<Transaction>> {
        let conn = self.db.conn().clone();
        let query = query.to_string();
        let limit = limit as i64;

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT t.id, t.prompt, t.prompt_type, t.summary, t.intent,
                       t.context, t.result, t.metadata, t.created_at,
                       t.session_id, t.project_path, t.observation_type
                FROM transactions t
                JOIN transactions_fts fts ON t.id = fts.rowid
                WHERE transactions_fts MATCH ?1
                ORDER BY t.created_at DESC
                LIMIT ?2
                "#,
            ).map_err(|e| anyhow::anyhow!("Prepare error: {}", e))?;

            let rows = stmt.query_map(params![query, limit], |row| {
                Ok((
                    row.get::<_, i64>("id")?,
                    row.get::<_, String>("prompt")?,
                    row.get::<_, String>("prompt_type")?,
                    row.get::<_, Option<String>>("summary")?,
                    row.get::<_, Option<String>>("intent")?,
                    row.get::<_, String>("context")?,
                    row.get::<_, String>("result")?,
                    row.get::<_, Option<String>>("metadata")?,
                    row.get::<_, i64>("created_at")?,
                    row.get::<_, Option<String>>("session_id")?,
                    row.get::<_, Option<String>>("project_path")?,
                    row.get::<_, String>("observation_type")?,
                ))
            }).map_err(|e| anyhow::anyhow!("Query map error: {}", e))?;

            let mut transactions = Vec::new();
            for row in rows {
                let (
                    id, prompt, prompt_type, summary, intent,
                    context, result, metadata, created_at,
                    session_id, project_path, observation_type,
                ) = row.map_err(|e| anyhow::anyhow!("Row error: {}", e))?;

                let prompt_type: PromptType = serde_json::from_str(&prompt_type)?;
                let context: Context = serde_json::from_str(&context)?;
                let result: TxResult = serde_json::from_str(&result)?;
                let metadata = metadata.and_then(|m| serde_json::from_str(&m).ok());

                let mut tx = Transaction {
                    id: Some(id),
                    prompt,
                    prompt_type,
                    context,
                    result,
                    metadata,
                    created_at: Some(Utc.timestamp_opt(created_at, 0).unwrap()),
                    observation_type,
                };

                if let Some(mut meta) = tx.metadata {
                    if summary.is_some() && meta.summary.is_none() {
                        meta.summary = summary;
                    }
                    if intent.is_some() && meta.intent.is_none() {
                        meta.intent = intent;
                    }
                    tx.metadata = Some(meta);
                }

                tx.context.session_id = session_id;
                tx.context.project_path = project_path;

                transactions.push(tx);
            }

            Ok::<Vec<Transaction>, anyhow::Error>(transactions)
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))?
    }

    /// Get a transaction by ID
    pub async fn get(&self, id: i64) -> anyhow::Result<Option<Transaction>> {
        let conn = self.db.conn().clone();

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT id, prompt, prompt_type, summary, intent,
                       context, result, metadata, created_at,
                       session_id, project_path, observation_type
                FROM transactions
                WHERE id = ?1
                "#,
            ).map_err(|e| anyhow::anyhow!("Prepare error: {}", e))?;

            let mut rows = stmt.query_map(params![id], |row| {
                Ok((
                    row.get::<_, i64>("id")?,
                    row.get::<_, String>("prompt")?,
                    row.get::<_, String>("prompt_type")?,
                    row.get::<_, Option<String>>("summary")?,
                    row.get::<_, Option<String>>("intent")?,
                    row.get::<_, String>("context")?,
                    row.get::<_, String>("result")?,
                    row.get::<_, Option<String>>("metadata")?,
                    row.get::<_, i64>("created_at")?,
                    row.get::<_, Option<String>>("session_id")?,
                    row.get::<_, Option<String>>("project_path")?,
                    row.get::<_, String>("observation_type")?,
                ))
            }).map_err(|e| anyhow::anyhow!("Query map error: {}", e))?;

            match rows.next() {
                Some(Ok(row)) => {
                    let (
                        id, prompt, prompt_type, summary, intent,
                        context, result, metadata, created_at,
                        session_id, project_path, observation_type,
                    ) = row;

                    let prompt_type: PromptType = serde_json::from_str(&prompt_type)?;
                    let context: Context = serde_json::from_str(&context)?;
                    let result: TxResult = serde_json::from_str(&result)?;
                    let metadata = metadata.and_then(|m| serde_json::from_str(&m).ok());

                    let mut tx = Transaction {
                        id: Some(id),
                        prompt,
                        prompt_type,
                        context,
                        result,
                        metadata,
                        created_at: Some(Utc.timestamp_opt(created_at, 0).unwrap()),
                        observation_type,
                    };

                    if let Some(mut meta) = tx.metadata {
                        if summary.is_some() && meta.summary.is_none() {
                            meta.summary = summary;
                        }
                        if intent.is_some() && meta.intent.is_none() {
                            meta.intent = intent;
                        }
                        tx.metadata = Some(meta);
                    }

                    tx.context.session_id = session_id;
                    tx.context.project_path = project_path;

                    Ok::<Option<Transaction>, anyhow::Error>(Some(tx))
                }
                Some(Err(e)) => Err(anyhow::anyhow!("Row error: {}", e)),
                None => Ok(None),
            }
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))?
    }

    /// List recent transactions
    pub async fn list(&self, limit: usize, offset: usize) -> anyhow::Result<Vec<Transaction>> {
        let conn = self.db.conn().clone();
        let limit = limit as i64;
        let offset = offset as i64;

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT id, prompt, prompt_type, summary, intent,
                       context, result, metadata, created_at,
                       session_id, project_path, observation_type
                FROM transactions
                ORDER BY created_at DESC
                LIMIT ?1 OFFSET ?2
                "#,
            ).map_err(|e| anyhow::anyhow!("Prepare error: {}", e))?;

            let rows = stmt.query_map(params![limit, offset], |row| {
                Ok((
                    row.get::<_, i64>("id")?,
                    row.get::<_, String>("prompt")?,
                    row.get::<_, String>("prompt_type")?,
                    row.get::<_, Option<String>>("summary")?,
                    row.get::<_, Option<String>>("intent")?,
                    row.get::<_, String>("context")?,
                    row.get::<_, String>("result")?,
                    row.get::<_, Option<String>>("metadata")?,
                    row.get::<_, i64>("created_at")?,
                    row.get::<_, Option<String>>("session_id")?,
                    row.get::<_, Option<String>>("project_path")?,
                    row.get::<_, String>("observation_type")?,
                ))
            }).map_err(|e| anyhow::anyhow!("Query map error: {}", e))?;

            let mut transactions = Vec::new();
            for row in rows {
                let (
                    id, prompt, prompt_type, summary, intent,
                    context, result, metadata, created_at,
                    session_id, project_path, observation_type,
                ) = row.map_err(|e| anyhow::anyhow!("Row error: {}", e))?;

                let prompt_type: PromptType = serde_json::from_str(&prompt_type)?;
                let context: Context = serde_json::from_str(&context)?;
                let result: TxResult = serde_json::from_str(&result)?;
                let metadata = metadata.and_then(|m| serde_json::from_str(&m).ok());

                let mut tx = Transaction {
                    id: Some(id),
                    prompt,
                    prompt_type,
                    context,
                    result,
                    metadata,
                    created_at: Some(Utc.timestamp_opt(created_at, 0).unwrap()),
                    observation_type,
                };

                if let Some(mut meta) = tx.metadata {
                    if summary.is_some() && meta.summary.is_none() {
                        meta.summary = summary;
                    }
                    if intent.is_some() && meta.intent.is_none() {
                        meta.intent = intent;
                    }
                    tx.metadata = Some(meta);
                }

                tx.context.session_id = session_id;
                tx.context.project_path = project_path;

                transactions.push(tx);
            }

            Ok::<Vec<Transaction>, anyhow::Error>(transactions)
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))?
    }

    /// Get statistics
    pub async fn stats(&self) -> anyhow::Result<MemoryStats> {
        let conn = self.db.conn().clone();

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();

            let total_transactions: i64 = conn.query_row(
                "SELECT COUNT(*) FROM transactions",
                [],
                |row| row.get(0),
            )?;

            let total_size_bytes: i64 = conn.query_row(
                "SELECT SUM(LENGTH(prompt) + LENGTH(context) + LENGTH(result) + COALESCE(LENGTH(metadata), 0)) FROM transactions",
                [],
                |row| row.get(0),
            ).unwrap_or(0);

            let oldest_transaction: Option<i64> = conn.query_row(
                "SELECT MIN(created_at) FROM transactions",
                [],
                |row| row.get(0),
            )?;

            let newest_transaction: Option<i64> = conn.query_row(
                "SELECT MAX(created_at) FROM transactions",
                [],
                |row| row.get(0),
            )?;

            let mut transactions_by_type = std::collections::HashMap::new();
            let mut stmt = conn.prepare(
                "SELECT prompt_type, COUNT(*) as count FROM transactions GROUP BY prompt_type"
            ).map_err(|e| anyhow::anyhow!("Prepare error: {}", e))?;

            let type_rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>("prompt_type")?,
                    row.get::<_, i64>("count")?,
                ))
            }).map_err(|e| anyhow::anyhow!("Query map error: {}", e))?;

            for row in type_rows {
                let (type_str, count) = row.map_err(|e| anyhow::anyhow!("Row error: {}", e))?;
                transactions_by_type.insert(type_str, count);
            }

            Ok::<MemoryStats, anyhow::Error>(MemoryStats {
                total_transactions,
                total_size_bytes,
                oldest_transaction: oldest_transaction.map(|ts| Utc.timestamp_opt(ts, 0).unwrap()),
                newest_transaction: newest_transaction.map(|ts| Utc.timestamp_opt(ts, 0).unwrap()),
                transactions_by_type,
            })
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))?
    }

    /// Prune transactions older than given date
    pub async fn prune(&self, before: DateTime<Utc>) -> anyhow::Result<usize> {
        let conn = self.db.conn().clone();
        let before_ts = before.timestamp();

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            let count = conn.execute(
                "DELETE FROM transactions WHERE created_at < ?1",
                params![before_ts],
            )?;
            Ok::<usize, anyhow::Error>(count as usize)
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))?
    }

    /// Delete a transaction by ID
    pub async fn delete(&self, id: i64) -> anyhow::Result<bool> {
        let conn = self.db.conn().clone();

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            let count = conn.execute(
                "DELETE FROM transactions WHERE id = ?1",
                params![id],
            )?;
            Ok::<bool, anyhow::Error>(count > 0)
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))?
    }

    /// List transactions for a specific project
    pub async fn list_by_project(&self, project_path: &str, limit: usize) -> anyhow::Result<Vec<Transaction>> {
        let conn = self.db.conn().clone();
        let project_path = project_path.to_string();
        let limit = limit as i64;

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            let mut stmt = conn.prepare(
                r#"
                SELECT id, prompt, prompt_type, summary, intent,
                       context, result, metadata, created_at,
                       session_id, project_path, observation_type
                FROM transactions
                WHERE project_path = ?1
                ORDER BY created_at DESC
                LIMIT ?2
                "#,
            ).map_err(|e| anyhow::anyhow!("Prepare error: {}", e))?;

            let rows = stmt.query_map(params![project_path, limit], |row| {
                Ok((
                    row.get::<_, i64>("id")?,
                    row.get::<_, String>("prompt")?,
                    row.get::<_, String>("prompt_type")?,
                    row.get::<_, Option<String>>("summary")?,
                    row.get::<_, Option<String>>("intent")?,
                    row.get::<_, String>("context")?,
                    row.get::<_, String>("result")?,
                    row.get::<_, Option<String>>("metadata")?,
                    row.get::<_, i64>("created_at")?,
                    row.get::<_, Option<String>>("session_id")?,
                    row.get::<_, Option<String>>("project_path")?,
                    row.get::<_, String>("observation_type")?,
                ))
            }).map_err(|e| anyhow::anyhow!("Query map error: {}", e))?;

            let mut transactions = Vec::new();
            for row in rows {
                let (
                    id, prompt, prompt_type, summary, intent,
                    context, result, metadata, created_at,
                    session_id, project_path, observation_type,
                ) = row.map_err(|e| anyhow::anyhow!("Row error: {}", e))?;

                let prompt_type: PromptType = serde_json::from_str(&prompt_type)?;
                let context: Context = serde_json::from_str(&context)?;
                let result: TxResult = serde_json::from_str(&result)?;
                let metadata = metadata.and_then(|m| serde_json::from_str(&m).ok());

                let mut tx = Transaction {
                    id: Some(id),
                    prompt,
                    prompt_type,
                    context,
                    result,
                    metadata,
                    created_at: Some(Utc.timestamp_opt(created_at, 0).unwrap()),
                    observation_type,
                };

                if let Some(mut meta) = tx.metadata {
                    if summary.is_some() && meta.summary.is_none() {
                        meta.summary = summary;
                    }
                    if intent.is_some() && meta.intent.is_none() {
                        meta.intent = intent;
                    }
                    tx.metadata = Some(meta);
                }

                tx.context.session_id = session_id;
                tx.context.project_path = project_path;

                transactions.push(tx);
            }

            Ok::<Vec<Transaction>, anyhow::Error>(transactions)
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))?
    }

    /// Generate a compact context index (for session start injection)
    pub async fn recent_context(&self, project_path: Option<&str>, limit: usize) -> anyhow::Result<String> {
        let transactions = if let Some(project) = project_path {
            self.list_by_project(project, limit).await?
        } else {
            self.list(limit, 0).await?
        };

        if transactions.is_empty() {
            return Ok(String::new());
        }

        let mut output = String::from("# [ARGUS] Recent Context\n\n");
        output.push_str("| ID | Date | T | Title | Tags |\n");
        output.push_str("|----|------|---|-------|------|\n");

        for tx in &transactions {
            let id = tx.id.unwrap_or(0);
            let date = tx.created_at
                .map(|d| d.format("%m-%d").to_string())
                .unwrap_or_else(|| "??".to_string());

            let obs = ObservationType::from_str(&tx.observation_type);
            let emoji = obs.emoji();

            let title = tx.metadata.as_ref()
                .and_then(|m| m.summary.as_ref())
                .map(|s| s.as_str())
                .unwrap_or(&tx.prompt);
            // Truncate title to 60 chars
            let title = if title.len() > 60 {
                format!("{}...", &title[..57])
            } else {
                title.to_string()
            };

            let tags = tx.metadata.as_ref()
                .map(|m| m.tags.join(", "))
                .unwrap_or_default();

            output.push_str(&format!("| #{} | {} | {} | {} | {} |\n", id, date, emoji, title, tags));
        }

        output.push_str("\n Use `argus get <id>` for full details\n");

        Ok(output)
    }

    /// Save a session summary
    pub async fn save_summary(&self, summary: &SessionSummary) -> anyhow::Result<i64> {
        let conn = self.db.conn().clone();
        let session_id = summary.session_id.clone();
        let project_path = summary.project_path.clone();
        let request = summary.request.clone();
        let investigated = summary.investigated.clone();
        let learned = summary.learned.clone();
        let completed = summary.completed.clone();
        let next_steps = summary.next_steps.clone();
        let notes = summary.notes.clone();

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            conn.execute(
                r#"
                INSERT INTO session_summaries
                (session_id, project_path, request, investigated, learned, completed, next_steps, notes)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
                params![session_id, project_path, request, investigated, learned, completed, next_steps, notes],
            )?;
            Ok(conn.last_insert_rowid())
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))?
    }

    /// List recent session summaries
    pub async fn list_summaries(&self, project_path: Option<&str>, limit: usize) -> anyhow::Result<Vec<SessionSummary>> {
        let conn = self.db.conn().clone();
        let project_path = project_path.map(|s| s.to_string());
        let limit = limit as i64;

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();

            let mut summaries = Vec::new();

            if let Some(ref project) = project_path {
                let mut stmt = conn.prepare(
                    r#"
                    SELECT id, session_id, project_path, request, investigated,
                           learned, completed, next_steps, notes, created_at
                    FROM session_summaries
                    WHERE project_path = ?1
                    ORDER BY created_at DESC
                    LIMIT ?2
                    "#,
                ).map_err(|e| anyhow::anyhow!("Prepare error: {}", e))?;

                let rows = stmt.query_map(params![project.as_str(), limit], |row| {
                    Ok(SessionSummary {
                        id: Some(row.get::<_, i64>("id")?),
                        session_id: row.get::<_, Option<String>>("session_id")?,
                        project_path: row.get::<_, Option<String>>("project_path")?,
                        request: row.get::<_, Option<String>>("request")?,
                        investigated: row.get::<_, Option<String>>("investigated")?,
                        learned: row.get::<_, Option<String>>("learned")?,
                        completed: row.get::<_, Option<String>>("completed")?,
                        next_steps: row.get::<_, Option<String>>("next_steps")?,
                        notes: row.get::<_, Option<String>>("notes")?,
                        created_at: Some(Utc.timestamp_opt(row.get::<_, i64>("created_at")?, 0).unwrap()),
                    })
                }).map_err(|e| anyhow::anyhow!("Query map error: {}", e))?;

                for row in rows {
                    summaries.push(row.map_err(|e| anyhow::anyhow!("Row error: {}", e))?);
                }
            } else {
                let mut stmt = conn.prepare(
                    r#"
                    SELECT id, session_id, project_path, request, investigated,
                           learned, completed, next_steps, notes, created_at
                    FROM session_summaries
                    ORDER BY created_at DESC
                    LIMIT ?1
                    "#,
                ).map_err(|e| anyhow::anyhow!("Prepare error: {}", e))?;

                let rows = stmt.query_map(params![limit], |row| {
                    Ok(SessionSummary {
                        id: Some(row.get::<_, i64>("id")?),
                        session_id: row.get::<_, Option<String>>("session_id")?,
                        project_path: row.get::<_, Option<String>>("project_path")?,
                        request: row.get::<_, Option<String>>("request")?,
                        investigated: row.get::<_, Option<String>>("investigated")?,
                        learned: row.get::<_, Option<String>>("learned")?,
                        completed: row.get::<_, Option<String>>("completed")?,
                        next_steps: row.get::<_, Option<String>>("next_steps")?,
                        notes: row.get::<_, Option<String>>("notes")?,
                        created_at: Some(Utc.timestamp_opt(row.get::<_, i64>("created_at")?, 0).unwrap()),
                    })
                }).map_err(|e| anyhow::anyhow!("Query map error: {}", e))?;

                for row in rows {
                    summaries.push(row.map_err(|e| anyhow::anyhow!("Row error: {}", e))?);
                }
            }

            Ok::<Vec<SessionSummary>, anyhow::Error>(summaries)
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_memory_engine() {
        let engine = MemoryEngine::new().await.expect("Failed to create engine");

        // Create a test transaction
        let ctx = Context {
            cwd: "/test".to_string(),
            platform: "linux".to_string(),
            session_id: None,
            project_path: None,
            git_branch: None,
            git_commit: None,
        };

        let tx = Transaction::user("test prompt", ctx)
            .with_summary("Test summary");

        let id = engine.remember(tx).await.expect("Failed to remember");
        assert!(id > 0);

        // Retrieve it
        let retrieved = engine.get(id).await.expect("Failed to get");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().prompt, "test prompt");
    }
}
