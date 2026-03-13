// Stress tests for ARGUS CLI

use std::path::PathBuf;
use std::time::Instant;

fn get_test_db_path(test_name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!("argus_stress_{}_{}.db", test_name, std::process::id()));
    path
}

async fn clean_test_db(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
}

#[tokio::test]
async fn stress_test_bulk_insert() {
    let db_path = get_test_db_path("bulk_insert");
    clean_test_db(&db_path).await;

    let engine = argus::core::MemoryEngine::with_path(db_path.clone()).await
        .expect("Failed to create engine");

    let start = Instant::now();
    let count = 1000;

    for i in 0..count {
        let context = argus::storage::Context {
            cwd: format!("/test/project/{}", i % 10),
            platform: "linux".to_string(),
            session_id: None,
            project_path: Some(format!("/test/project/{}", i % 10)),
            git_branch: Some("main".to_string()),
            git_commit: None,
        };

        let mut metadata = argus::storage::Metadata::default();
        metadata.tags = vec![format!("tag{}", i % 5), format!("batch{}", i / 100)];
        metadata.summary = Some(format!("Test transaction #{}", i));
        metadata.category = Some(if i % 3 == 0 { "bugfix".to_string() } else { "feature".to_string() });

        let tx = argus::storage::Transaction::user(
            format!("Test prompt number {} with some content", i),
            context,
        ).with_metadata(metadata);

        engine.remember(tx).await.expect("Failed to remember");
    }

    let elapsed = start.elapsed();
    println!("Inserted {} transactions in {:?}", count, elapsed);
    println!("Average: {:.2} ms/transaction", elapsed.as_millis() as f64 / count as f64);

    // Verify count
    let stats = engine.stats().await.expect("Failed to get stats");
    assert_eq!(stats.total_transactions, count);

    clean_test_db(&db_path).await;
}

#[tokio::test]
async fn stress_test_search_performance() {
    let db_path = get_test_db_path("search_perf");
    clean_test_db(&db_path).await;

    let engine = argus::core::MemoryEngine::with_path(db_path.clone()).await
        .expect("Failed to create engine");

    // Insert diverse transactions
    let prompts = vec![
        "fixed authentication bug in login form",
        "refactored database schema for better performance",
        "added user profile feature with avatar upload",
        "optimized SQL queries for faster loading",
        "implemented OAuth2 authentication with Google",
        "fixed memory leak in background worker",
        "added pagination to user list",
        "refactored code to use async/await pattern",
        "deployed application to production server",
        "wrote unit tests for authentication module",
    ];

    for (i, prompt) in prompts.iter().enumerate() {
        let context = argus::storage::Context {
            cwd: "/test".to_string(),
            platform: "linux".to_string(),
            session_id: None,
            project_path: Some("/test".to_string()),
            git_branch: None,
            git_commit: None,
        };
        let tx = argus::storage::Transaction::user(prompt.to_string(), context);
        engine.remember(tx).await.expect("Failed to remember");
    }

    // Test various searches
    let search_terms = vec!["auth", "database", "user", "test", "performance"];

    for term in &search_terms {
        let start = Instant::now();
        let results = engine.recall(term, 10).await.expect("Failed to recall");
        let elapsed = start.elapsed();
        println!("Search for '{}' returned {} results in {:?}", term, results.len(), elapsed);
        assert!(elapsed.as_millis() < 100, "Search took too long: {:?}", elapsed);
    }

    clean_test_db(&db_path).await;
}

#[tokio::test]
async fn stress_test_concurrent_operations() {
    let db_path = get_test_db_path("concurrent");
    clean_test_db(&db_path).await;

    let engine = std::sync::Arc::new(
        argus::core::MemoryEngine::with_path(db_path.clone()).await
            .expect("Failed to create engine")
    );

    // Spawn multiple tasks
    let mut handles = vec![];

    for i in 0..10 {
        let engine_clone = engine.clone();
        let handle = tokio::spawn(async move {
            let context = argus::storage::Context {
                cwd: "/test".to_string(),
                platform: "linux".to_string(),
                session_id: None,
                project_path: Some("/test".to_string()),
                git_branch: None,
                git_commit: None,
            };

            for j in 0..10 {
                let tx = argus::storage::Transaction::user(
                    format!("Concurrent task {} transaction {}", i, j),
                    context.clone(),
                );
                engine_clone.remember(tx).await.expect("Failed to remember");
            }
        });
        handles.push(handle);
    }

    // Wait for all tasks
    for handle in handles {
        handle.await.expect("Task failed");
    }

    // Verify all transactions were saved
    let stats = engine.stats().await.expect("Failed to get stats");
    assert_eq!(stats.total_transactions, 100);

    clean_test_db(&db_path).await;
}

#[tokio::test]
async fn stress_test_large_payloads() {
    let db_path = get_test_db_path("large_payloads");
    clean_test_db(&db_path).await;

    let engine = argus::core::MemoryEngine::with_path(db_path.clone()).await
        .expect("Failed to create engine");

    // Create transactions with large content
    let large_content = "x".repeat(10000); // 10KB of text

    let context = argus::storage::Context {
        cwd: "/test".to_string(),
        platform: "linux".to_string(),
        session_id: None,
        project_path: Some("/test".to_string()),
        git_branch: None,
        git_commit: None,
    };

    let start = Instant::now();
    for i in 0..10 {
        let tx = argus::storage::Transaction::user(
            format!("Large payload test {}: {}", i, large_content),
            context.clone(),
        );
        engine.remember(tx).await.expect("Failed to remember");
    }
    let elapsed = start.elapsed();

    println!("Inserted 10 large transactions in {:?}", elapsed);

    // Test retrieval of large payloads
    let start = Instant::now();
    let results = engine.recall("large", 10).await.expect("Failed to recall");
    let elapsed = start.elapsed();
    println!("Retrieved {} large transactions in {:?}", results.len(), elapsed);

    assert_eq!(results.len(), 10);

    clean_test_db(&db_path).await;
}
