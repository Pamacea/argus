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

/// Find the nearest .git directory by traversing up the tree
/// Returns the path to the repository root (containing .git)
#[allow(dead_code)]
pub fn find_git_repo() -> anyhow::Result<PathBuf> {
    let current_dir = std::env::current_dir()?;

    for ancestor in current_dir.ancestors() {
        let git_dir = ancestor.join(".git");
        if git_dir.exists() {
            return Ok(ancestor.to_path_buf());
        }
    }

    Err(anyhow::anyhow!("No .git repository found in current directory tree"))
}

/// Get a project identifier from current directory
/// Uses git repo path if available, otherwise current directory name
#[allow(dead_code)]
pub fn get_project_id() -> String {
    match find_git_repo() {
        Ok(repo_path) => {
            // Use the repository folder name as project ID
            repo_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string()
        }
        Err(_) => {
            // Fallback to current directory name
            std::env::current_dir()
                .ok()
                .and_then(|p| p.file_name().and_then(|n| n.to_str().map(String::from)))
                .unwrap_or_else(|| "unknown".to_string())
        }
    }
}
