// Integration tests for ARGUS CLI

use std::path::PathBuf;

fn get_test_db_path(test_name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!("argus_test_{}_{}.db", test_name, std::process::id()));
    path
}

async fn clean_test_db(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
}

#[tokio::test]
async fn test_full_workflow() {
    let db_path = get_test_db_path("full_workflow");
    clean_test_db(&db_path).await;

    // Create a new memory engine
    let engine = argus::core::MemoryEngine::with_path(db_path.clone()).await
        .expect("Failed to create engine");

    // Create a transaction
    let context = argus::storage::Context {
        cwd: "/test/project".to_string(),
        platform: "linux".to_string(),
        session_id: None,
        project_path: Some("/test/project".to_string()),
        git_branch: Some("main".to_string()),
        git_commit: None,
    };

    let mut metadata = argus::storage::Metadata::default();
    metadata.tags = vec!["test".to_string(), "integration".to_string()];
    metadata.summary = Some("Test transaction".to_string());

    let tx = argus::storage::Transaction::user("Test prompt", context)
        .with_metadata(metadata);

    let id = engine.remember(tx).await.expect("Failed to remember");
    assert!(id > 0);

    // Recall the transaction
    let results = engine.recall("test", 10).await.expect("Failed to recall");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].prompt, "Test prompt");

    // Get by ID
    let retrieved = engine.get(id).await.expect("Failed to get");
    assert!(retrieved.is_some());
    let tx = retrieved.unwrap();
    assert_eq!(tx.prompt, "Test prompt");

    // List transactions
    let list = engine.list(10, 0).await.expect("Failed to list");
    assert_eq!(list.len(), 1);

    // Get stats
    let stats = engine.stats().await.expect("Failed to get stats");
    assert_eq!(stats.total_transactions, 1);

    // Delete transaction
    let deleted = engine.delete(id).await.expect("Failed to delete");
    assert!(deleted);

    // Verify deletion
    let after_delete = engine.get(id).await.expect("Failed to get after delete");
    assert!(after_delete.is_none());

    clean_test_db(&db_path).await;
}

#[tokio::test]
async fn test_search_functionality() {
    let db_path = get_test_db_path("search");
    clean_test_db(&db_path).await;

    let engine = argus::core::MemoryEngine::with_path(db_path.clone()).await
        .expect("Failed to create engine");

    // Create multiple transactions
    let contexts = vec![
        ("fixed auth bug in login", "/project/auth"),
        ("refactored database schema", "/project/db"),
        ("added feature for user profiles", "/project/features"),
        ("optimized database queries", "/project/db"),
    ];

    for (prompt, path) in contexts {
        let context = argus::storage::Context {
            cwd: path.to_string(),
            platform: "linux".to_string(),
            session_id: None,
            project_path: Some(path.to_string()),
            git_branch: None,
            git_commit: None,
        };
        let tx = argus::storage::Transaction::user(prompt, context);
        engine.remember(tx).await.expect("Failed to remember");
    }

    // Search for "database" should return 2 results
    let results = engine.recall("database", 10).await.expect("Failed to recall");
    assert_eq!(results.len(), 2);

    // Search for "auth" should return 1 result
    let results = engine.recall("auth", 10).await.expect("Failed to recall");
    assert_eq!(results.len(), 1);

    clean_test_db(&db_path).await;
}

#[tokio::test]
async fn test_prune_functionality() {
    let db_path = get_test_db_path("prune");
    clean_test_db(&db_path).await;

    let engine = argus::core::MemoryEngine::with_path(db_path.clone()).await
        .expect("Failed to create engine");

    let context = argus::storage::Context {
        cwd: "/test".to_string(),
        platform: "linux".to_string(),
        session_id: None,
        project_path: None,
        git_branch: None,
        git_commit: None,
    };

    // Create a transaction
    let tx = argus::storage::Transaction::user("old transaction", context.clone());
    engine.remember(tx).await.expect("Failed to remember");

    // Prune everything older than now (should not delete the just-created transaction)
    let count = engine.prune(chrono::Utc::now()).await.expect("Failed to prune");
    // Transaction was just created, so it shouldn't be pruned
    assert_eq!(count, 0);

    clean_test_db(&db_path).await;
}
