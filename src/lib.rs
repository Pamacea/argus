pub mod cli;
pub mod core;
pub mod storage;
pub mod common;

// Agent and hooks modules (feature-gated)
#[cfg(feature = "agent")]
pub mod agent;
pub mod hooks;

// Re-export common utilities
pub use common::{VERSION, ARGUS_DIR, DB_FILENAME, INDEX_DIR, data_dir, db_path, index_dir};

// Re-export storage types for convenience
pub use storage::{Context, Transaction, Metadata, PromptType};
