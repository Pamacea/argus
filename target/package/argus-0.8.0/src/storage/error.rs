// Storage error types

use std::fmt;

#[derive(Debug)]
pub enum StorageError {
    Sqlite(rusqlite::Error),
    Json(serde_json::Error),
    Io(std::io::Error),
    Join(tokio::task::JoinError),
    Custom(String),
}

impl fmt::Display for StorageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StorageError::Sqlite(e) => write!(f, "SQLite error: {}", e),
            StorageError::Json(e) => write!(f, "JSON error: {}", e),
            StorageError::Io(e) => write!(f, "IO error: {}", e),
            StorageError::Join(e) => write!(f, "Join error: {}", e),
            StorageError::Custom(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for StorageError {}

impl From<rusqlite::Error> for StorageError {
    fn from(e: rusqlite::Error) -> Self {
        StorageError::Sqlite(e)
    }
}

impl From<serde_json::Error> for StorageError {
    fn from(e: serde_json::Error) -> Self {
        StorageError::Json(e)
    }
}

impl From<std::io::Error> for StorageError {
    fn from(e: std::io::Error) -> Self {
        StorageError::Io(e)
    }
}

impl From<tokio::task::JoinError> for StorageError {
    fn from(e: tokio::task::JoinError) -> Self {
        StorageError::Join(e)
    }
}

impl From<anyhow::Error> for StorageError {
    fn from(e: anyhow::Error) -> Self {
        StorageError::Custom(e.to_string())
    }
}
