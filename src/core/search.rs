// Search Engine - Full-text search over transactions

use crate::storage::Db;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, TimeZone};
use anyhow::Result;
use rusqlite::params;

/// A search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub transaction_id: i64,
    pub prompt: String,
    pub summary: Option<String>,
    pub observation_type: String,
    pub tags: Vec<String>,
    pub score: f64,
    pub created_at: DateTime<chrono::Utc>,
}

/// Search engine for transactions
pub struct SearchEngine {
    db: Db,
}

impl SearchEngine {
    /// Create a new search engine
    pub async fn new() -> Result<Self> {
        let db_path = crate::common::db_path()?;
        let db = Db::open(db_path).await
            .map_err(|e| anyhow::anyhow!("Failed to open database: {}", e))?;
        Ok(Self { db })
    }

    /// Search transactions using FTS5
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let conn = self.db.conn().clone();
        let query = query.to_string();

        let results = tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();

            let sql = format!(
                "SELECT
                    t.id, t.prompt, t.created_at,
                    json_extract(t.metadata, '$.summary') AS summary,
                    COALESCE(t.observation_type, 'action') AS observation_type,
                    json_extract(t.metadata, '$.tags') AS tags,
                    bm25(transactions_fts) AS score
                FROM transactions_fts fts
                JOIN transactions t ON t.id = fts.rowid
                WHERE transactions_fts MATCH ?1
                ORDER BY score
                LIMIT ?2"
            );

            let mut stmt = conn.prepare(&sql)?;

            let mut results = Vec::new();

            let mut rows = stmt.query(params![query, limit as i64])?;

            while let Some(row) = rows.next()? {
                let summary: Option<String> = row.get(3)?;
                let created_ts: i64 = row.get(2)?;
                let created_at = chrono::Utc.timestamp_opt(created_ts, 0).unwrap();
                let observation_type: String = row.get(4)?;
                let tags_str: Option<String> = row.get(5)?;
                let tags: Vec<String> = tags_str
                    .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
                    .unwrap_or_default();

                results.push(SearchResult {
                    transaction_id: row.get(0)?,
                    prompt: row.get(1)?,
                    created_at,
                    summary,
                    observation_type,
                    tags,
                    score: row.get(6)?,
                });
            }

            Ok::<Vec<SearchResult>, anyhow::Error>(results)
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))??;

        Ok(results)
    }
}
