# ARGUS Error Handling Reference

**Version:** 0.6.0 | **Last Updated:** 2025-02-24

---

## Table of Contents

- [Overview](#overview)
- [Error Types](#error-types)
- [Error Messages](#error-messages)
- [Recovery Strategies](#recovery-strategies)
- [Common Issues](#common-issues)
- [Debugging](#debugging)

---

## Overview

ARGUS includes a comprehensive error handling system with:

- **Structured Error Types** - Clear categorization of errors
- **Automatic Retry** - Exponential backoff for transient failures
- **Graceful Fallbacks** - Local search when Qdrant fails
- **Actionable Messages** - Clear guidance on how to fix issues
- **Error Tracking** - Statistics and monitoring

---

## Error Types

### QdrantError

**Code:** `QDRANT_ERROR`
**Retryable:** Yes
**Fallback:** Local semantic search

#### When It Occurs

- Qdrant connection fails
- Collection operations fail
- Vector search fails
- Indexing operations fail

#### Error Codes

| Sub-Code | Message | Action |
|----------|---------|--------|
| `QDRANT_CONNECTION_FAILED` | Failed to connect to Qdrant at {url}. Falling back to local search. | Check Qdrant is running on port 6333 |
| `QDRANT_COLLECTION_FAILED` | Failed to {operation} collection "{collection}" | Check Qdrant logs |
| `QDRANT_SEARCH_FAILED` | Vector search failed. Falling back to local text search. | Local search will be used automatically |
| `QDRANT_INDEX_FAILED` | Failed to index document "{id}" in Qdrant. Local indexing succeeded. | Transaction is saved locally |

#### Example Error

```
[QDRANT_ERROR]
Failed to connect to Qdrant at http://localhost:6333. Falling back to local search.

Context:
  url: http://localhost:6333
  operation: connect

This error is retryable - the system will attempt automatic recovery.
```

#### Resolution

1. **Check if Qdrant is running:**
   ```bash
   docker ps | grep qdrant
   # or
   curl http://localhost:6333
   ```

2. **Start Qdrant if needed:**
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```

3. **ARGUS will automatically use local search** - no data loss

---

### DatabaseError

**Code:** `DATABASE_ERROR`
**Retryable:** Yes
**Automatic Recovery:** Retry with backoff

#### When It Occurs

- Database initialization fails
- Query execution fails
- Transaction storage fails
- Database save to disk fails

#### Error Codes

| Sub-Code | Message | Action |
|----------|---------|--------|
| `DATABASE_INIT_FAILED` | Failed to initialize database at {path} | Check permissions and disk space |
| `DATABASE_QUERY_FAILED` | Database query failed | Check query syntax and data integrity |
| `DATABASE_TRANSACTION_FAILED` | Failed to {operation} transaction "{id}" | Data may not be persisted |
| `DATABASE_SAVE_FAILED` | Failed to save database to disk | Check disk space and permissions |

#### Example Error

```
[DATABASE_ERROR]
Failed to save database to disk. Check disk space and permissions.

Context:
  dbPath: /home/user/.argus/argus.db
  operation: save

This error is retryable - the system will attempt automatic recovery.
```

#### Resolution

1. **Check disk space:**
   ```bash
   df -h ~/.argus
   ```

2. **Check permissions:**
   ```bash
   ls -la ~/.argus/argus.db
   ```

3. **Clear space if needed:**
   ```bash
   # ARGUS will auto-flush pending changes
   rm ~/.argus/argus.db
   # ARGUS will recreate on next run
   ```

---

### FileSystemError

**Code:** `FILESYSTEM_ERROR`
**Retryable:** No (requires manual intervention)

#### When It Occurs

- File not found
- Permission denied
- Directory creation fails
- Invalid path

#### Error Codes

| Sub-Code | Message | Action |
|----------|---------|--------|
| `FS_FILE_NOT_FOUND` | File not found: {path} | Check file path |
| `FS_PERMISSION_DENIED` | Permission denied: Cannot {operation} {path} | Check file permissions |
| `FS_DIRECTORY_FAILED` | Failed to {operation} directory: {path} | Check directory path and permissions |
| `FS_INVALID_PATH` | Invalid path "{path}": {reason} | Fix path format |

#### Example Error

```
[FILESYSTEM_ERROR]
Permission denied: Cannot write /home/user/.argus/argus.db

Context:
  path: /home/user/.argus/argus.db
  operation: write
```

#### Resolution

1. **Fix permissions:**
   ```bash
   chmod u+w ~/.argus/argus.db
   ```

2. **Fix ownership:**
   ```bash
   chown $USER:$USER ~/.argus/argus.db
   ```

---

### MCPError

**Code:** `MCP_ERROR`
**Retryable:** No

#### When It Occurs

- Invalid parameters
- Missing required parameters
- Tool execution failures

#### Error Codes

| Sub-Code | Message | Action |
|----------|---------|--------|
| `MCP_INVALID_PARAMETER` | Invalid parameter "{param}". Expected: {expected} | Fix parameter type/value |
| `MCP_MISSING_PARAMETER` | Missing required parameter: {param} | Provide required parameter |
| `MCP_TOOL_FAILED` | Tool "{tool}" execution failed: {reason} | Check tool inputs |

#### Example Error

```
[MCP_ERROR]
Invalid parameter "rootPath". Expected: string

Context:
  param: rootPath
  value: null
  expected: string
```

#### Resolution

Provide correct parameter type/value in the MCP tool call.

---

### GitError

**Code:** `GIT_ERROR`
**Retryable:** No

#### When It Occurs

- Not in a git repository
- Git command fails
- Branch operations fail

#### Error Codes

| Sub-Code | Message | Action |
|----------|---------|--------|
| `GIT_NOT_REPOSITORY` | Not a git repository: {dir}. Git features disabled. | Git integration gracefully disabled |
| `GIT_COMMAND_FAILED` | Git command failed: {command} | Check git installation |
| `GIT_BRANCH_FAILED` | Failed to {operation} branch. Using default branch. | Falls back to default branch |

#### Example Error

```
[GIT_ERROR]
Not a git repository: /home/user/project. Git features disabled.

Context:
  dir: /home/user/project
```

#### Resolution

This is informational - ARGUS continues without git integration. To enable git features:

```bash
cd /home/user/project
git init
```

---

### ConfigError

**Code:** `CONFIG_ERROR`
**Retryable:** No

#### When It Occurs

- Invalid configuration values
- Missing required configuration

#### Error Codes

| Sub-Code | Message | Action |
|----------|---------|--------|
| `CONFIG_INVALID` | Invalid configuration value for "{key}": {reason} | Fix configuration |
| `CONFIG_MISSING` | Missing required configuration: {key} | Provide configuration value |

#### Example Error

```
[CONFIG_ERROR]
Missing required configuration: OpenAI API key

Context:
  key: OPENAI_API_KEY
```

#### Resolution

Set the missing configuration value in environment or config file.

---

### ValidationError

**Code:** `VALIDATION_ERROR`
**Retryable:** No

#### When It Occurs

- Schema validation fails
- Input validation fails

#### Error Codes

| Sub-Code | Message | Action |
|----------|---------|--------|
| `VALIDATION_SCHEMA_FAILED` | Schema validation failed for {entity}: {reason} | Fix data structure |
| `VALIDATION_INVALID_INPUT` | Invalid input for "{field}": {reason} | Fix input value |

#### Example Error

```
[VALIDATION_ERROR]
Invalid input for "limit". Expected: positive integer

Context:
  field: limit
  value: -1
  reason: must be positive integer
```

#### Resolution

Provide valid input that matches expected format.

---

## Error Messages

### Message Format

All ARGUS errors follow this format:

```
[ERROR_CODE]
Human-readable description of what went wrong and why.

Context:
  key1: value1
  key2: value2

[Optional: This error is retryable - the system will attempt automatic recovery.]
```

### Reading Error Messages

1. **Error Code** - Quick identifier for error type
2. **Description** - What happened and why
3. **Context** - Relevant parameters and state
4. **Recovery Info** - Whether automatic recovery will happen

---

## Recovery Strategies

### Automatic Retry

**Applies to:** `QdrantError`, `DatabaseError`

ARGUS automatically retries failed operations with exponential backoff:

- **Max attempts:** 3 (configurable)
- **Initial delay:** 1 second
- **Backoff multiplier:** 2x
- **Max delay:** 30 seconds
- **Jitter:** 10% to prevent thundering herd

Example retry sequence:
```
Attempt 1 fails → Wait 1s
Attempt 2 fails → Wait 2s
Attempt 3 fails → Wait 4s
Fallback or error
```

### Graceful Fallbacks

| Component | Primary | Fallback |
|-----------|---------|----------|
| Vector Search | Qdrant | Local TF-IDF search |
| Embeddings | OpenAI API | Local hash embeddings |
| Git Integration | Full git info | Disabled (no error) |
| Database | SQLite | In-memory (temporary) |

### Circuit Breaker

ARGUS uses circuit breaker pattern to prevent cascading failures:

- **Failure threshold:** 5 consecutive failures
- **Cooldown period:** 60 seconds
- **Recovery attempts:** 2 successful attempts to close circuit

When circuit is open, operations fail fast instead of waiting for timeout.

---

## Common Issues

### Issue: "Failed to connect to Qdrant"

**Symptoms:**
- Slow searches
- Fallback to local search
- Error: `QDRANT_CONNECTION_FAILED`

**Solution:**
```bash
# Check if Qdrant is running
curl http://localhost:6333

# If not running, start it
docker run -p 6333:6333 qdrant/qdrant

# Or use local search (no action needed)
```

**Note:** Local search works perfectly - Qdrant is optional!

### Issue: "Database save failed"

**Symptoms:**
- Transactions not persisting
- Error: `DATABASE_SAVE_FAILED`

**Solution:**
```bash
# Check disk space
df -h

# Clear space if needed
rm ~/.argus/argus.db.tmp  # Temporary file

# Check directory permissions
ls -la ~/.argus/
```

### Issue: "Permission denied"

**Symptoms:**
- Cannot write to database
- Cannot create files
- Error: `FS_PERMISSION_DENIED`

**Solution:**
```bash
# Fix ARGUS directory permissions
chmod u+w ~/.argus/
chmod u+w ~/.argus/argus.db

# Or recreate directory
rm -rf ~/.argus/
# ARGUS will recreate on next run
```

### Issue: "Git command failed"

**Symptoms:**
- No git information in transactions
- Error: `GIT_COMMAND_FAILED`

**Solution:**
```bash
# Check git installation
git --version

# Check if in git repo
git status

# Initialize if needed
git init
```

**Note:** ARGUS works fine without git - git features are optional!

---

## Debugging

### Enable Debug Logging

Set environment variable:
```bash
ARGUS_DEBUG=1
```

Or in code:
```typescript
process.env.ARGUS_DEBUG = '1';
```

### Check Error Statistics

Use the error handler to get statistics:

```typescript
import { getErrorHandler } from './errors/handler.js';

const handler = getErrorHandler();
const stats = handler.getStats();

console.log('Total errors:', stats.totalErrors);
console.log('By code:', stats.byCode);
console.log('Recent errors:', stats.recentErrors);
```

### Circuit Breaker State

Check if circuit breaker is open:

```typescript
const handler = getErrorHandler();
const state = handler.getCircuitBreakerState();

console.log('Circuit breaker:', state.isOpen ? 'OPEN' : 'CLOSED');
console.log('Failure count:', state.failureCount);
```

### Reset Circuit Breaker

```typescript
const handler = getErrorHandler();
handler.resetCircuitBreaker();
```

### View Error Logs

Error logs include:
- Error code and message
- Full context (parameters, state)
- Stack trace
- Original error (if wrapped)
- Timestamp

```typescript
import { formatError } from './errors/index.js';

try {
  await someOperation();
} catch (error) {
  console.error(formatError(error));
}
```

---

## Best Practices

### For Users

1. **Don't panic** - Most errors have automatic recovery
2. **Read the error message** - It usually tells you what to do
3. **Check the context** - Contains useful debugging info
4. **Fallbacks work** - ARGUS degrades gracefully

### For Developers

1. **Use structured errors** - Always throw `ArgusError` subclasses
2. **Provide context** - Include relevant parameters in error context
3. **Mark retryable errors** - Set `retryable: true` for transient failures
4. **Handle gracefully** - Use `safeExecute` wrappers
5. **Log appropriately** - Use the error handler for consistent logging

### Example Error Handling

```typescript
import {
  QdrantError,
  safeExecute,
  safeExecuteWithRetry
} from './errors/index.js';

// Simple safe execution
const result = await safeExecute(
  async () => await qdrant.search(query),
  []  // Fallback: empty results
);

// Retry with fallback
const result = await safeExecuteWithRetry(
  async () => await qdrant.upsert(points),
  false,  // Fallback: operation failed
  {
    maxAttempts: 3,
    initialDelay: 1000,
    context: { operation: 'upsert', count: points.length }
  }
);

// Manual error handling
try {
  await operation();
} catch (error) {
  if (error instanceof QdrantError) {
    // Handle Qdrant-specific errors
    console.warn('Qdrant failed, using fallback');
    return fallbackValue;
  }
  throw error;
}
```

---

## Support

If you encounter an error not covered in this document:

1. Check the [GitHub Issues](https://github.com/Pamacea/argus/issues)
2. Create a new issue with:
   - Full error message
   - Error context
   - Steps to reproduce
   - ARGUS version

---

**Last Updated:** 2025-02-24
**ARGUS Version:** 0.6.0
