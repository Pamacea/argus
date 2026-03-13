// Search Engine - Full-text search over transactions

use serde::{Deserialize, Serialize};

/// A search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub transaction_id: i64,
    pub prompt: String,
    pub summary: Option<String>,
    pub score: f64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Search engine for transactions
pub struct SearchEngine {
    _db: crate::storage::Db,
}

impl SearchEngine {
    /// Create a new search engine
    pub async fn new() -> anyhow::Result<Self> {
        let db_path = crate::common::db_path()?;
        let db = crate::storage::Db::open(db_path).await?;
        Ok(Self { _db: db })
    }

    /// Search transactions
    pub async fn search(&self, _query: &str, _limit: usize) -> anyhow::Result<Vec<SearchResult>> {
        // TODO: Implement actual search with scoring
        Ok(Vec::new())
    }
}
