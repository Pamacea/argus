// Core - Memory engine and search

pub mod memory;
pub mod index;
pub mod search;

pub use memory::MemoryEngine;
pub use index::ProjectIndexer;

// Re-export from storage
