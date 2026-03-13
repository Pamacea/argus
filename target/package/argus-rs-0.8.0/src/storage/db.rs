// Database wrapper

use crate::storage::StorageError;
use rusqlite::{Connection, Result as SqliteResult};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct Db {
    path: PathBuf,
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    /// Open or create database at path
    pub async fn open(path: PathBuf) -> Result<Self, StorageError> {
        // Create parent directory if needed
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(StorageError::Io)?;
        }

        // Open connection
        let conn = Connection::open(&path).map_err(StorageError::Sqlite)?;

        // Enable WAL mode and other settings - use query_row for PRAGMA since it returns results
        let _ = conn.query_row("PRAGMA journal_mode=WAL", [], |_| Ok(()));
        let _ = conn.query_row("PRAGMA foreign_keys=ON", [], |_| Ok(()));
        let _ = conn.query_row("PRAGMA synchronous=NORMAL", [], |_| Ok(()));

        // Create tables
        Self::create_tables(&conn).map_err(StorageError::Sqlite)?;

        Ok(Self {
            path,
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    fn create_tables(conn: &Connection) -> SqliteResult<()> {
        // Helper function to execute DDL and ignore "returned results" errors
        fn exec_ddl(conn: &Connection, sql: &str) -> SqliteResult<()> {
            match conn.execute(sql, []) {
                Ok(_) => Ok(()),
                Err(rusqlite::Error::ExecuteReturnedResults) => Ok(()), // Ignore - DDL sometimes returns metadata
                Err(e) => Err(e),
            }
        }

        // Create core tables
        exec_ddl(conn,
            "CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                prompt_type TEXT NOT NULL,
                summary TEXT,
                intent TEXT,
                context TEXT NOT NULL,
                result TEXT NOT NULL,
                metadata TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                session_id TEXT,
                project_path TEXT
            )"
        )?;

        exec_ddl(conn,
            "CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                name TEXT,
                indexed_at INTEGER,
                file_count INTEGER,
                total_size INTEGER
            )"
        )?;

        exec_ddl(conn,
            "CREATE TABLE IF NOT EXISTS indexed_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                language TEXT,
                hash TEXT,
                indexed_at INTEGER,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )"
        )?;

        // Create indexes - ignore all errors
        let _ = exec_ddl(conn, "CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC)");
        let _ = exec_ddl(conn, "CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(session_id)");
        let _ = exec_ddl(conn, "CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project_path)");

        // Try FTS5 - optional
        let _ = exec_ddl(conn, "CREATE VIRTUAL TABLE IF NOT EXISTS transactions_fts USING fts5(prompt, summary, intent, content=transactions, content_rowid=id)");

        // Try triggers - optional
        let _ = exec_ddl(conn,
            "CREATE TRIGGER IF NOT EXISTS transactions_ai AFTER INSERT ON transactions BEGIN
                INSERT INTO transactions_fts(rowid, prompt, summary, intent)
                VALUES (new.id, new.prompt, new.summary, new.intent);
            END"
        );
        let _ = exec_ddl(conn,
            "CREATE TRIGGER IF NOT EXISTS transactions_ad AFTER DELETE ON transactions BEGIN
                INSERT INTO transactions_fts(transactions_fts, rowid, prompt, summary, intent)
                VALUES ('delete', old.id, old.prompt, old.summary, old.intent);
            END"
        );

        Ok(())
    }

    /// Get the database path
    pub fn path(&self) -> &PathBuf {
        &self.path
    }

    /// Get a connection from the pool
    pub fn conn(&self) -> &Arc<Mutex<Connection>> {
        &self.conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_db() {
        let db = Db::open(":memory:".into()).await.expect("Failed to open db");
        assert!(db.path().to_str().unwrap() == ":memory:");
    }
}
