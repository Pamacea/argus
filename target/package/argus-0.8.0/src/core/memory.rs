// Memory Engine - Transaction storage and retrieval

use crate::storage::{Db, Context, MemoryStats, PromptType, Transaction, TxResult};
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
        let Transaction { prompt, prompt_type, context, result, metadata, created_at, .. } = tx;

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
                (prompt, prompt_type, summary, intent, context, result, metadata, created_at, session_id, project_path)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                "#,
                params![
                    prompt, prompt_type, summary, intent, context, result, metadata, created_at, session_id, project_path,
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
                       t.session_id, t.project_path
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
                ))
            }).map_err(|e| anyhow::anyhow!("Query map error: {}", e))?;

            let mut transactions = Vec::new();
            for row in rows {
                let (
                    id, prompt, prompt_type, summary, intent,
                    context, result, metadata, created_at,
                    session_id, project_path,
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
                       session_id, project_path
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
                ))
            }).map_err(|e| anyhow::anyhow!("Query map error: {}", e))?;

            match rows.next() {
                Some(Ok(row)) => {
                    let (
                        id, prompt, prompt_type, summary, intent,
                        context, result, metadata, created_at,
                        session_id, project_path,
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
                       session_id, project_path
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
                ))
            }).map_err(|e| anyhow::anyhow!("Query map error: {}", e))?;

            let mut transactions = Vec::new();
            for row in rows {
                let (
                    id, prompt, prompt_type, summary, intent,
                    context, result, metadata, created_at,
                    session_id, project_path,
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
