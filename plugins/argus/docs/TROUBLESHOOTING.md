# ARGUS - Troubleshooting Guide

**Version:** 0.5.12 | **Last Updated:** 2026-02-24

---

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Common Issues](#common-issues)
- [Performance Issues](#performance-issues)
- [Storage Issues](#storage-issues)
- [Qdrant Issues](#qdrant-issues)
- [Web Dashboard Issues](#web-dashboard-issues)
- [Hook Issues](#hook-issues)
- [Debugging](#debugging)

---

## Quick Diagnostics

### Health Check Command

```bash
# Check ARGUS status
cd ~/.argus && ls -lh

# Expected output:
# argus.db        (SQLite database, 1-10MB)
# queue/          (Queue directory)
# stats.json      (Statistics file)
# index-*.json    (Index files)
```

### Check ARGUS Stats

```javascript
// Run in Claude Code
await argus__get_stats();

// Expected response:
{
  "success": true,
  "stats": {
    "totalTransactions": 823,
    "totalHooks": 0,
    "usingQdrant": false
  }
}
```

### Verify Services

```bash
# Check if Qdrant is running
curl http://localhost:6333/collections

# Check if web dashboard is running
curl http://localhost:30000/health

# Expected: HTTP 200 response
```

---

## Common Issues

### 1. ARGUS Not Starting

**Symptoms:**
- No `[ARGUS]` messages in session start
- Web dashboard not accessible
- MCP tools not available

**Diagnosis:**
```bash
# Check if plugin is installed
ls -la ~/.claude/plugins/@argus

# Check session start hook
cat ~/.claude/plugins/@argus/hooks/session-start.js
```

**Solutions:**

1. **Reinstall ARGUS:**
```bash
cd ~/.claude/plugins
rm -rf @argus
npm install @argus/mcp-server
```

2. **Check Claude Code version:**
```bash
claude --version
# Requires Claude Code >= 0.5.0
```

3. **Verify plugin configuration:**
```bash
cat ~/.claude/config.json
# Should contain:
{
  "plugins": ["@argus/mcp-server"]
}
```

---

### 2. Transactions Not Being Saved

**Symptoms:**
- `argus__get_stats` shows 0 transactions
- Post-tool hooks show "✗ Queued" but no saves
- No new entries in history

**Diagnosis:**
```bash
# Check queue directory
ls -lh ~/.argus/queue/

# Check queue contents
cat ~/.argus/queue/transactions.jsonl

# Check database
sqlite3 ~/.argus/argus.db "SELECT COUNT(*) FROM transactions;"
```

**Solutions:**

1. **Queue Processor Not Running:**
```bash
# Check if queue processor is running
ps aux | grep queue-processor

# If not running, restart Claude Code session
```

2. **Database Corruption:**
```bash
# Backup current database
cp ~/.argus/argus.db ~/.argus/argus.db.backup

# Delete and recreate (will lose data)
rm ~/.argus/argus.db
# Restart Claude Code
```

3. **Queue File Permissions:**
```bash
# Fix permissions
chmod 755 ~/.argus/queue
chmod 644 ~/.argus/queue/*
```

---

### 3. check_hooks Not Working

**Symptoms:**
- Pre-tool hook doesn't block Explore
- No relevant transactions returned
- Empty results from search

**Diagnosis:**
```javascript
// Test check_hooks
await argus__check_hooks({
  prompt: "test query",
  toolName: "Explore"
});

// Expected: Some results (even if empty arrays)
// Actual: Error or timeout
```

**Solutions:**

1. **RAG Not Initialized:**
```bash
# Check RAG initialization in logs
# Look for: "[ARGUS] Local search index loaded"
# If missing: Restart Claude Code session
```

2. **No Transactions Indexed:**
```javascript
// Save test transaction
await argus__save_transaction({
  prompt: "Test transaction for debugging",
  promptType: "user",
  context: {
    cwd: process.cwd(),
    platform: process.platform
  },
  result: {
    success: true,
    output: "Test output"
  }
});

// Wait 5 seconds for queue processing
// Then search
await argus__search_memory({ query: "test" });
```

3. **Search Threshold Too High:**
```javascript
// Lower threshold
await argus__check_hooks({
  prompt: "your query",
  threshold: 0.3  // Lower from default 0.5
});
```

---

### 4. Git Integration Not Working

**Symptoms:**
- No git badge in activity feed
- No diff preview in transactions
- Branch/commit info missing

**Diagnosis:**
```bash
# Check if in git repository
git status

# Check git-utils hook
cat ~/.claude/plugins/@argus/hooks/git-utils.js
```

**Solutions:**

1. **Git Not Installed:**
```bash
# Install Git
# Windows: https://git-scm.com/download/win
# Mac: brew install git
# Linux: sudo apt install git
```

2. **Not in Git Repository:**
```bash
# Initialize git repository
cd /path/to/project
git init
git add .
git commit -m "Initial commit"
```

3. **Git Path Issues:**
```bash
# Verify git in PATH
which git

# Add to PATH if needed
export PATH="/usr/local/git/bin:$PATH"
```

---

## Performance Issues

### 1. Slow Search Performance

**Symptoms:**
- `argus__search_memory` takes > 5 seconds
- `argus__check_hooks` times out
- Claude Code appears frozen

**Diagnosis:**
```javascript
// Test search performance
const start = Date.now();
await argus__search_memory({ query: "test" });
console.log(`Search took ${Date.now() - start}ms`);
```

**Solutions:**

1. **Too Many Transactions:**
```javascript
// Limit search results
await argus__search_memory({
  query: "your query",
  limit: 5  // Reduce from default 10
});

// Filter by date
await argus__search_memory({
  query: "your query",
  filters: {
    dateRange: {
      start: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
      end: Date.now()
    }
  }
});
```

2. **Large Database:**
```bash
# Archive old transactions
# Move database to archive
mv ~/.argus/argus.db ~/.argus/argus.db.archive

# Start fresh (will lose old data)
# Restart Claude Code
```

3. **Qdrant Not Available:**
```bash
# Start Qdrant for faster vector search
docker run -d -p 6333:6333 qdrant/qdrant

# Restart Claude Code to use Qdrant
```

---

### 2. Indexing Timeout

**Symptoms:**
- `argus__index_codebase` stops early
- "Indexing timeout reached" message
- Not all files indexed

**Diagnosis:**
```bash
# Check indexing logs
# Look for: "⚠️  Indexing timeout reached"

# Check indexed files
sqlite3 ~/.argus/argus.db "SELECT COUNT(*) FROM indexed_files;"
```

**Solutions:**

1. **Reduce Project Size:**
```bash
# Add .argusignore to project root
echo "large-dir/" > .argusignore
echo "generated/" >> .argusignore
```

2. **Incremental Indexing:**
```javascript
// Use incremental instead of full
await argus__index_codebase({
  rootPath: "/path/to/project",
  incremental: true  // Only changed files
});
```

3. **Increase Timeout (fork ARGUS):**
```typescript
// In mcp/src/indexer/file-indexer.ts
const MAX_INDEX_TIME = 10 * 60 * 1000; // Increase to 10 minutes
```

---

### 3. High Memory Usage

**Symptoms:**
- Claude Code using > 1GB RAM
- System slowdown
- Crash with "out of memory"

**Diagnosis:**
```bash
# Check database size
ls -lh ~/.argus/argus.db

# Check transaction count
sqlite3 ~/.argus/argus.db "SELECT COUNT(*) FROM transactions;"
```

**Solutions:**

1. **Large Database:**
```bash
# Archive old database
mv ~/.argus/argus.db ~/.argus/argus.db.old

# Start fresh
# Restart Claude Code
```

2. **Reduce Chunk Size:**
```typescript
// In mcp/src/indexer/file-indexer.ts
chunkSize: 250  // Reduce from default 500
```

3. **Limit Queue Processing:**
```typescript
// In mcp/src/queue-processor.ts
// Process fewer items per batch
const BATCH_SIZE = 5;  // Reduce from default 10
```

---

## Storage Issues

### 1. Database Corruption

**Symptoms:**
- "Database not initialized" errors
- SQLite errors
- Transactions not saving

**Diagnosis:**
```bash
# Check database integrity
sqlite3 ~/.argus/argus.db "PRAGMA integrity_check;"
```

**Solutions:**

1. **Restore from Backup:**
```bash
# Check for backup
ls -lh ~/.argus/argus.db.*

# Restore most recent backup
cp ~/.argus/argus.db.backup ~/.argus/argus.db
```

2. **Recreate Database:**
```bash
# Backup corrupted database
mv ~/.argus/argus.db ~/.argus/argus.db.corrupted

# Restart Claude Code (will create new database)
```

3. **Export/Import:**
```bash
# Export transactions to JSON
sqlite3 ~/.argus/argus.db ".dump transactions" > transactions.sql

# Import into new database
sqlite3 ~/.argus/argus.new.db < transactions.sql
```

---

### 2. Disk Space Full

**Symptoms:**
- "No space left on device" errors
- Cannot save transactions
- Database not growing

**Diagnosis:**
```bash
# Check disk space
df -h ~/.argus

# Check ARGUS directory size
du -sh ~/.argus
```

**Solutions:**

1. **Clean Old Data:**
```bash
# Remove old index files
rm ~/.argus/index-*.json

# Clear queue files
rm ~/.argus/queue/*.jsonl
```

2. **Archive Database:**
```bash
# Compress old database
gzip ~/.argus/argus.db

# Start fresh
# Restart Claude Code
```

3. **Move to Different Drive:**
```bash
# Set custom data directory
export ARGUS_DATA_DIR=/mnt/large-drive/.argus
```

---

## Qdrant Issues

### 1. Qdrant Not Starting

**Symptoms:**
- "Qdrant not available" messages
- Local search being used
- `usingQdrant: false` in stats

**Diagnosis:**
```bash
# Check if Qdrant is running
docker ps | grep qdrant

# Check Qdrant logs
docker logs argus-qdrant
```

**Solutions:**

1. **Docker Not Running:**
```bash
# Start Docker Desktop (Windows/Mac)
# Or start Docker daemon (Linux)
sudo systemctl start docker
```

2. **Qdrant Container Not Created:**
```bash
# Create Qdrant container
docker run -d --name argus-qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  -v argus-qdrant-data:/qdrant/storage \
  qdrant/qdrant:latest
```

3. **Port Already in Use:**
```bash
# Check what's using port 6333
lsof -i :6333  # Mac/Linux
netstat -ano | findstr :6333  # Windows

# Kill conflicting process or change port
```

---

### 2. Qdrant Connection Errors

**Symptoms:**
- "Connection refused" errors
- Timeout when searching
- Inconsistent results

**Diagnosis:**
```bash
# Test Qdrant connection
curl http://localhost:6333/collections

# Expected: JSON with collections list
# Actual: Connection error
```

**Solutions:**

1. **Restart Qdrant:**
```bash
docker restart argus-qdrant

# Wait a few seconds for startup
sleep 5

# Verify connection
curl http://localhost:6333/collections
```

2. **Recreate Collection:**
```bash
# Access Qdrant console
docker exec -it argus-qdrant /bin/bash

# Delete and recreate collection
curl -X DELETE http://localhost:6333/collections/argus_memory
curl -X PUT http://localhost:6333/collections/argus_memory \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    }
  }'
```

3. **Fallback to Local Search:**
```typescript
// Force local search mode
// In mcp/src/rag/engine.ts
const config = { useLocal: true };
```

---

## Web Dashboard Issues

### 1. Dashboard Not Loading

**Symptoms:**
- `http://localhost:30000` won't load
- "Connection refused" error
- Blank page

**Diagnosis:**
```bash
# Check if web server is running
ps aux | grep "web/server.js"

# Check port availability
lsof -i :30000  # Mac/Linux
netstat -ano | findstr :30000  # Windows
```

**Solutions:**

1. **Start Web Server Manually:**
```bash
cd ~/.claude/plugins/@argus/mcp/web
node server.js
```

2. **Check Port Configuration:**
```bash
# Use different port
export ARGUS_WEB_PORT=30001

# Restart Claude Code
```

3. **Fix Server Path:**
```bash
# Verify server file exists
ls -la ~/.claude/plugins/@argus/mcp/web/server.js

# If missing, reinstall ARGUS
```

---

### 2. Dashboard Shows Wrong Data

**Symptoms:**
- Transaction count doesn't match
- Old data displayed
- Not auto-refreshing

**Diagnosis:**
```bash
# Check stats file
cat ~/.argus/stats.json

# Check database transaction count
sqlite3 ~/.argus/argus.db "SELECT COUNT(*) FROM transactions;"
```

**Solutions:**

1. **Force Stats Refresh:**
```javascript
// Call get_stats to refresh
await argus__get_stats();
```

2. **Clear Browser Cache:**
```
# In browser: Ctrl+Shift+R (Windows/Linux)
#              Cmd+Shift+R (Mac)
```

3. **Restart Web Server:**
```bash
# Kill web server
pkill -f "web/server.js"

# Restart Claude Code (will auto-start web server)
```

---

## Hook Issues

### 1. Pre-Tool Hook Not Blocking

**Symptoms:**
- Explore runs without calling check_hooks
- No warning messages
- Hooks appear inactive

**Diagnosis:**
```bash
# Check hook file
cat ~/.claude/plugins/@argus/hooks/pre-tool-use.js

# Check hook permissions
ls -la ~/.claude/plugins/@argus/hooks/pre-tool-use.js
```

**Solutions:**

1. **Verify Hook Installation:**
```bash
# Ensure hook is executable
chmod +x ~/.claude/plugins/@argus/hooks/pre-tool-use.js
```

2. **Check Hook Logic:**
```javascript
// In pre-tool-use.js, verify EXPLORE_TOOLS includes:
const EXPLORE_TOOLS = ['explore', 'create_team', 'Task'];
```

3. **Test Hook Manually:**
```bash
echo '{"toolName":"Explore","args":{}}' | \
  node ~/.claude/plugins/@argus/hooks/pre-tool-use.js
```

---

### 2. Post-Tool Hook Not Capturing

**Symptoms:**
- No transactions queued
- Missing edits in history
- Queue file remains empty

**Diagnosis:**
```bash
# Check queue file
cat ~/.argus/queue/transactions.jsonl

# Check hook logs
# Look for "[ARGUS] ✓ Queued" messages
```

**Solutions:**

1. **Verify Hook is Called:**
```bash
# Test hook manually
echo '{"toolName":"Edit","args":{"file_path":"/tmp/test"},"result":"ok"}' | \
  node ~/.claude/plugins/@argus/hooks/post-tool-use.js
```

2. **Check Queue Directory:**
```bash
# Ensure queue directory exists
mkdir -p ~/.argus/queue
chmod 755 ~/.argus/queue
```

3. **Debug Hook Logging:**
```javascript
// In post-tool-use.js, add debug logging
console.error('[ARGUS DEBUG] Tool name:', toolName);
console.error('[ARGUS DEBUG] Args:', args);
```

---

## Debugging

### Enable Debug Logging

```bash
# Set debug environment variable
export ARGUS_DEBUG=1

# Restart Claude Code
```

### Check Logs

```bash
# ARGUS logs (in Claude Code output)
# Look for: [ARGUS] prefixes

# Queue processor logs
# Look for: [ARGUS Queue] prefixes

# Web server logs
# Check console where server.js is running
```

### Test MCP Tools Directly

```javascript
// Test each tool
await argus__check_hooks({ prompt: "test" });
await argus__save_transaction({
  prompt: "test",
  promptType: "user",
  context: { cwd: process.cwd(), platform: process.platform },
  result: { success: true }
});
await argus__search_memory({ query: "test" });
await argus__get_history({ limit: 5 });
await argus__get_stats();
```

### Database Inspection

```bash
# Open SQLite database
sqlite3 ~/.argus/argus.db

# Useful queries
SELECT COUNT(*) FROM transactions;
SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 5;
SELECT DISTINCT category FROM transactions;
SELECT tags FROM transactions WHERE tags IS NOT NULL LIMIT 5;
```

---

**Troubleshooting Guide v0.5.12 - ARGUS**
