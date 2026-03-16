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
        let query = query.to_string(); // Clone to own the data

        let results = tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();

            // Use FTS5 search with ranking
            // Note: metadata is stored as JSON in the transactions table
            let sql = format!(
                "SELECT
                    t.id, t.prompt, t.created_at,
                    json_extract(t.metadata, '$.summary') AS summary,
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
                // summary can be NULL (from json_extract), read as Option<String>
                let summary: Option<String> = row.get(3)?;
                // created_at is stored as i64 (Unix timestamp)
                let created_ts: i64 = row.get(2)?;
                let created_at = chrono::Utc.timestamp_opt(created_ts, 0).unwrap();

                results.push(SearchResult {
                    transaction_id: row.get(0)?,
                    prompt: row.get(1)?,
                    created_at,
                    summary,
                    score: row.get(4)?,
                });
            }

            Ok::<Vec<SearchResult>, anyhow::Error>(results)
        })
        .await
        .map_err(|e| anyhow::anyhow!("Spawn blocking error: {}", e))??;

        Ok(results)
    }
}
