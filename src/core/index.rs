// Project Indexer - File indexing and code search

use crate::storage::StorageError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tokio::fs;

/// Statistics after indexing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexStats {
    pub files_indexed: usize,
    pub total_bytes: usize,
    pub languages: HashMap<String, usize>,
    pub duration_ms: u64,
}

/// Metadata for an indexed project
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProjectMetadata {
    project_path: String,
    last_indexed: i64,
    files: Vec<FileMetadata>,
}

/// Metadata for a single file
#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileMetadata {
    path: String,
    size: u64,
    language: String,
    last_modified: i64,
}

/// A match found in indexed code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeMatch {
    pub file_path: String,
    pub line_number: usize,
    pub language: String,
    pub snippet: String,
    pub score: f64,
}

/// Project indexer for semantic code search
pub struct ProjectIndexer {
    data_dir: PathBuf,
}

impl ProjectIndexer {
    /// Create a new indexer
    pub async fn new() -> anyhow::Result<Self> {
        let data_dir = crate::common::index_dir()?;
        fs::create_dir_all(&data_dir).await?;
        Ok(Self { data_dir })
    }

    /// Get the index file path for a project
    fn project_index_path(&self, project_path: &Path) -> PathBuf {
        // Use a hash of the project path to create a unique filename
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        project_path.hash(&mut hasher);
        let hash = format!("{:x}", hasher.finish());

        self.data_dir.join(format!("project_{}.json", hash))
    }

    /// Index a project directory
    pub async fn index(&self, project_path: &Path) -> Result<IndexStats, StorageError> {
        let start = std::time::Instant::now();

        // File extensions to index by language
        let extensions = HashMap::from([
            ("rs", "rust"), ("go", "go"), ("py", "python"), ("js", "javascript"),
            ("ts", "typescript"), ("tsx", "typescript"), ("jsx", "javascript"),
            ("java", "java"), ("kt", "kotlin"), ("cpp", "cpp"), ("c", "c"),
            ("cs", "csharp"), ("php", "php"), ("rb", "ruby"), ("sh", "shell"),
            ("md", "markdown"), ("txt", "text"), ("toml", "toml"), ("yaml", "yaml"),
            ("yml", "yaml"), ("json", "json"),
        ]);

        // Directories to skip
        let skip_dirs = [
            "node_modules", "target", ".git", "dist", "build", ".next",
            ".claude", "vendor", "cache", ".cache", "out", "bin", "obj",
        ];

        let mut files_indexed = 0;
        let mut total_bytes = 0;
        let mut languages: HashMap<String, usize> = HashMap::new();
        let mut file_metadata = Vec::new();

        // Walk the project directory
        let _entries = fs::read_dir(project_path).await
            .map_err(StorageError::Io)?;

        let mut stack = vec![project_path.to_path_buf()];

        while let Some(dir) = stack.pop() {
            let mut read_dir = match fs::read_dir(&dir).await {
                Ok(e) => e,
                Err(_) => continue, // Skip directories we can't read
            };

            while let Some(entry) = read_dir.next_entry().await
                .map_err(StorageError::Io)?
            {
                let entry_path = entry.path();
                let file_name = entry.file_name().to_string_lossy().to_string();

                // Skip hidden files and skip dirs
                if file_name.starts_with('.') {
                    continue;
                }

                // Skip certain directories
                if entry_path.is_dir() {
                    if skip_dirs.contains(&file_name.as_str()) {
                        continue;
                    }
                    stack.push(entry_path);
                    continue;
                }

                // Process files
                if entry_path.is_file() {
                    if let Some(ext) = entry_path.extension() {
                        let ext_str = ext.to_string_lossy().to_string();
                        if let Some(lang) = extensions.get(ext_str.as_str()) {
                            let metadata = match fs::metadata(&entry_path).await {
                                Ok(m) => m,
                                Err(_) => continue,
                            };

                            let modified = match metadata.modified() {
                                Ok(t) => t,
                                Err(_) => SystemTime::now(),
                            };
                            let last_modified = modified
                                .duration_since(SystemTime::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs() as i64;

                            let size = metadata.len() as usize;

                            file_metadata.push(FileMetadata {
                                path: entry_path.to_string_lossy().to_string(),
                                size: size as u64,
                                language: lang.to_string(),
                                last_modified,
                            });

                            *languages.entry(lang.to_string()).or_insert(0) += 1;
                            total_bytes += size;
                            files_indexed += 1;
                        }
                    }
                }
            }
        }

        // Save project metadata
        let project_meta = ProjectMetadata {
            project_path: project_path.to_string_lossy().to_string(),
            last_indexed: std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
            files: file_metadata.clone(),
        };

        let index_path = self.project_index_path(project_path);
        let json = serde_json::to_string_pretty(&project_meta)
            .map_err(|e| StorageError::Json(e))?;
        fs::write(&index_path, json).await
            .map_err(StorageError::Io)?;

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(IndexStats {
            files_indexed,
            total_bytes,
            languages,
            duration_ms,
        })
    }

    /// Search indexed code
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<CodeMatch>, StorageError> {
        let mut matches = Vec::new();

        // Read all project indices
        let mut entries = fs::read_dir(&self.data_dir).await
            .map_err(StorageError::Io)?;

        let query_lower = query.to_lowercase();

        while let Some(entry) = entries.next_entry().await
            .map_err(StorageError::Io)?
        {
            let path = entry.path();

            // Skip non-JSON files
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }

            // Read project metadata
            let content = match fs::read_to_string(&path).await {
                Ok(c) => c,
                Err(_) => continue,
            };

            let project_meta: ProjectMetadata = match serde_json::from_str(&content) {
                Ok(m) => m,
                Err(_) => continue,
            };

            // Search in file names and paths
            for file in &project_meta.files {
                if file.path.to_lowercase().contains(&query_lower) ||
                   file.language.to_lowercase().contains(&query_lower) {
                    matches.push(CodeMatch {
                        file_path: file.path.clone(),
                        line_number: 0,
                        language: file.language.clone(),
                        snippet: format!("File: {}", file.path),
                        score: 1.0,
                    });
                }
            }
        }

        matches.truncate(limit);
        Ok(matches)
    }

    /// Check if a project is indexed
    pub async fn is_indexed(&self, project_path: &Path) -> bool {
        let index_path = self.project_index_path(project_path);
        index_path.exists()
    }

    /// Remove a project from the index
    pub async fn unindex(&self, project_path: &Path) -> Result<(), StorageError> {
        let index_path = self.project_index_path(project_path);

        if index_path.exists() {
            fs::remove_file(&index_path).await?;
        }

        Ok(())
    }
}
