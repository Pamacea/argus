// Common utilities and constants

use std::path::PathBuf;

/// Current ARGUS version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Default data directory name
pub const ARGUS_DIR: &str = ".argus";

/// Default database filename
pub const DB_FILENAME: &str = "memory.db";

/// Default index directory name
pub const INDEX_DIR: &str = "index";

/// Get ARGUS data directory
pub fn data_dir() -> anyhow::Result<PathBuf> {
    let home = std::env::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
    Ok(home.join(ARGUS_DIR))
}

/// Get database path
pub fn db_path() -> anyhow::Result<PathBuf> {
    Ok(data_dir()?.join(DB_FILENAME))
}

/// Get index directory path
pub fn index_dir() -> anyhow::Result<PathBuf> {
    Ok(data_dir()?.join(INDEX_DIR))
}
