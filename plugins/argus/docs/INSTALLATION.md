# ARGUS Installation Guide

> **Version:** 1.0.0
> **Last Updated:** 2026-02-21

Complete guide to installing and configuring ARGUS MCP monitoring system.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
- [Configuration](#configuration)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Upgrading](#upgrading)

---

## Prerequisites

### Required

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Claude Code**: Latest version with MCP support
- **Operating System**:
  - Windows 10/11
  - macOS 12+
  - Linux (Ubuntu 20.04+, Debian 11+, etc.)

### Optional (for advanced features)

- **PostgreSQL**: v14+ (for PostgreSQL storage backend)
- **OpenAI API Key**: For embedding generation (semantic search)

---

## Installation Methods

### Method 1: Local Installation (Recommended for Development)

Install ARGUS locally and run it as a standalone MCP server.

```bash
# 1. Clone or navigate to ARGUS directory
cd /path/to/argus

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. Verify installation
npm run test
```

---

### Method 2: Global Installation

Install ARGUS globally for use across multiple projects.

```bash
# 1. Install globally
npm install -g /path/to/argus

# 2. Verify installation
argus --version

# 3. Start server
argus start
```

---

### Method 3: Docker (Recommended for Production)

Run ARGUS in a Docker container for isolation and easy deployment.

```bash
# 1. Build Docker image
docker build -t argus-mcp:latest .

# 2. Run container
docker run -d \
  --name argus \
  -p 3000:3000 \
  -v ~/.argus/data:/app/data \
  -v ~/.argus/logs:/app/logs \
  argus-mcp:latest

# 3. Check logs
docker logs argus
```

---

## Configuration

### Step 1: Claude Code Configuration

Add ARGUS to your Claude Code MCP server configuration.

**Location:**
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**Configuration:**
```json
{
  "mcpServers": {
    "argus": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\Projects\\-plugins\\argus\\build\\index.js"
      ],
      "env": {
        "ARGUS_LOG_PATH": "C:\\Users\\YourName\\.argus\\logs",
        "ARGUS_STORAGE_TYPE": "sqlite",
        "ARGUS_LOG_LEVEL": "info"
      }
    }
  }
}
```

---

### Step 2: Environment Variables

Create a `.env` file in the ARGUS directory or set environment variables.

```bash
# Core Configuration
ARGUS_LOG_PATH=./data/logs              # Where to store logs
ARGUS_STORAGE_TYPE=sqlite               # Storage: sqlite | postgres | memory
ARGUS_LOG_LEVEL=info                    # trace | debug | info | warn | error

# SQLite Configuration (default)
ARGUS_SQLITE_PATH=./data/argus.db       # SQLite database path

# PostgreSQL Configuration (optional)
# ARGUS_STORAGE_TYPE=postgres
# ARGUS_POSTGRES_URL=postgresql://user:password@localhost:5432/argus
# ARGUS_POSTGRES_SCHEMA=argus

# Embedding Configuration (for semantic search)
# ARGUS_OPENAI_API_KEY=sk-...
# ARGUS_EMBEDDING_MODEL=text-embedding-3-small

# Performance Tuning
ARGUS_MAX_LOG_SIZE=1000                 # Max logs per query
ARGUS_RETENTION_DAYS=30                 # How long to keep logs
ARGUS_BATCH_SIZE=100                    # Batch write size

# Server Configuration
ARGUS_PORT=3000                         # Server port (if using HTTP)
ARGUS_HOST=localhost                    # Server host
```

---

### Step 3: Database Setup

#### Option A: SQLite (Default - No setup required)

SQLite is the default storage backend and requires no setup. ARGUS will create the database automatically on first run.

```bash
# Database will be created at:
# ~/.argus/data/argus.db (default)
# Or at ARGUS_SQLITE_PATH if specified
```

#### Option B: PostgreSQL

For production or team setups, use PostgreSQL.

```bash
# 1. Create database
createdb argus

# 2. Create user (optional)
createuser argus

# 3. Grant permissions
psql -d argus -c "GRANT ALL PRIVILEGES ON DATABASE argus TO argus;"

# 4. Set connection URL in .env
ARGUS_POSTGRES_URL=postgresql://argus:password@localhost:5432/argus

# 5. Run migrations
npm run migrate
```

#### Option C: In-Memory (Development)

For quick testing without persistence.

```bash
ARGUS_STORAGE_TYPE=memory
npm start
```

---

## Verification

### 1. Check ARGUS is Running

```bash
# Check if ARGUS process is running
ps aux | grep argus   # Linux/macOS
tasklist | findstr argus  # Windows

# Or check if port is listening (if using HTTP mode)
lsof -i :3000        # Linux/macOS
netstat -an | findstr :3000  # Windows
```

### 2. Test with Claude Code

```
You: What MCP tools are available?

Claude: I can see these MCP tools:
- mcp__argus__log_interaction
- mcp__argus__search_logs
- mcp__argus__consult
...
```

### 3. Log a Test Interaction

```typescript
// In Claude Code, run:
await mcp__argus__log_interaction({
  tool: "test",
  action: "verification",
  request: { params: { message: "Hello ARGUS" } },
  response: { success: true, duration: 10 }
});
```

### 4. Verify Logs Were Created

```bash
# Check log directory exists
ls -la ~/.argus/logs

# Check SQLite database
sqlite3 ~/.argus/data/argus.db "SELECT COUNT(*) FROM logs;"

# Should return: 1 (or more if you've logged multiple interactions)
```

---

## Troubleshooting

### Issue: "ARGUS tools not appearing in Claude Code"

**Solutions:**
1. Check Claude Code configuration file syntax
2. Verify ARGUS build directory exists: `ls build/`
3. Check Claude Code logs for errors
4. Restart Claude Code completely

```bash
# Rebuild ARGUS
npm run build

# Verify build output
ls -la build/index.js
```

---

### Issue: "Database connection failed"

**For SQLite:**
```bash
# Check database directory exists
mkdir -p ~/.argus/data

# Check permissions
ls -la ~/.argus/data

# Recreate database
rm ~/.argus/data/argus.db
npm start  # Will recreate automatically
```

**For PostgreSQL:**
```bash
# Test connection
psql $ARGUS_POSTGRES_URL -c "SELECT 1;"

# Check if database exists
psql -l | grep argus

# Recreate database
dropdb argus && createdb argus
npm run migrate
```

---

### Issue: "High memory usage"

**Solutions:**
1. Reduce `ARGUS_MAX_LOG_SIZE`
2. Set `ARGUS_RETENTION_DAYS` to lower value
3. Use PostgreSQL instead of SQLite for large datasets
4. Enable log rotation

```bash
# Add to .env
ARGUS_MAX_LOG_SIZE=500
ARGUS_RETENTION_DAYS=7
```

---

### Issue: "Slow query performance"

**Solutions:**
1. Add time filters to queries
2. Use specific tool filters
3. Reduce query limit
4. Rebuild indexes (SQLite)

```bash
# Rebuild SQLite indexes
sqlite3 ~/.argus/data/argus.db "REINDEX;"

# Vacuum database
sqlite3 ~/.argus/data/argus.db "VACUUM;"
```

---

### Issue: "Embedding generation failed"

**Solutions:**
1. Check OpenAI API key is valid
2. Verify API key has credits
3. Check network connectivity
4. Use local embeddings (future feature)

```bash
# Test API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $ARGUS_OPENAI_API_KEY"

# If using OpenAI, ensure key is set
echo $ARGUS_OPENAI_API_KEY
```

---

## Upgrading

### Upgrade to Latest Version

```bash
# 1. Stop ARGUS (if running)
pkill -f argus   # Linux/macOS
# Or Ctrl+C if running in terminal

# 2. Pull latest changes
git pull origin main
# Or: npm update -g argus

# 3. Install new dependencies
npm install

# 4. Rebuild
npm run build

# 5. Run migrations (if any)
npm run migrate

# 6. Restart ARGUS
npm start
```

---

## Migration Guide

### Migrate from SQLite to PostgreSQL

```bash
# 1. Export SQLite data
npm run export:sqlite -- --output argus-export.json

# 2. Configure PostgreSQL
# Update .env:
# ARGUS_STORAGE_TYPE=postgres
# ARGUS_POSTGRES_URL=postgresql://...

# 3. Import to PostgreSQL
npm run import:postgres -- --input argus-export.json

# 4. Verify
npm run migrate
```

---

## Performance Tuning

### For High-Volume Scenarios (1000+ logs/second)

```bash
# .env configuration
ARGUS_STORAGE_TYPE=postgres
ARGUS_BATCH_SIZE=500
ARGUS_MAX_LOG_SIZE=5000
ARGUS_LOG_LEVEL=warn            # Reduce logging overhead

# PostgreSQL tuning in postgresql.conf:
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
```

### For Low-Memory Systems (< 2GB RAM)

```bash
# .env configuration
ARGUS_STORAGE_TYPE=sqlite
ARGUS_MAX_LOG_SIZE=100
ARGUS_RETENTION_DAYS=7
ARGUS_BATCH_SIZE=10
```

---

## Security Setup

### 1. Restrict File Permissions

```bash
# Secure ARGUS data directory
chmod 700 ~/.argus
chmod 600 ~/.argus/.env

# Secure log files
chmod 600 ~/.argus/logs/*
```

### 2. Enable Encryption (PostgreSQL)

```bash
# In PostgreSQL
ALTER DATABASE argus ENCODING 'UTF8';
ALTER DATABASE argus CONNECTION LIMIT 10;

# Enable SSL (require certificate)
# In postgresql.conf:
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
```

### 3. Set Up Authentication

```bash
# .env configuration
ARGUS_API_KEY=your-secret-api-key-here
ARGUS_AUTH_ENABLED=true
```

---

## Uninstallation

```bash
# 1. Remove from Claude Code configuration
# Edit claude_desktop_config.json and remove "argus" entry

# 2. Stop ARGUS
pkill -f argus

# 3. Remove global installation (if applicable)
npm uninstall -g argus

# 4. Remove data (optional)
rm -rf ~/.argus

# 5. Remove project directory (if local)
rm -rf /path/to/argus
```

---

## Next Steps

After installation:

1. [Read the API documentation](API.md) to learn available tools
2. [Check the architecture](ARCHITECTURE.md) to understand system design
3. [Set up skills](../README.md#claude-code-skills-integration) for easy usage
4. Configure [monitoring dashboards](../README.md#features) if needed

---

## Getting Help

- **Issues**: Report bugs on GitHub
- **Discussions**: Ask questions in GitHub Discussions
- **Documentation**: Check [ARCHITECTURE.md](ARCHITECTURE.md) and [API.md](API.md)

---

*Last Updated: 2026-02-21*
