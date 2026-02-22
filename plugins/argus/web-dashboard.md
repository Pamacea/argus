# ARGUS Web Dashboard

The ARGUS Web Dashboard provides a visual interface to monitor your ARGUS plugin activity, indexing status, and memory system.

## 🚀 Quick Start

The web dashboard starts automatically when you load the ARGUS plugin. Access it at:

```
http://localhost:30000/
```

## 📊 Features

### Real-Time Statistics
- **Index Statistics**: View transaction count, hook count, and indexed files
- **Memory Engine**: Monitor database size, last index time, and storage engine status
- **MCP Tools**: See all available ARGUS MCP tools and their status

### System Monitoring
- **Server Info**: Platform, Node.js version, uptime, and process ID
- **Health Status**: Real-time system health indicator
- **Activity Log**: Recent system activity and events

### API Endpoints

The dashboard provides several REST API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web dashboard HTML interface |
| `/health` | GET | Health check endpoint |
| `/api/status` | GET | Server status and information |
| `/api/stats` | GET | ARGUS statistics (transactions, hooks, indexing) |
| `/api/docs` | GET | API documentation |

## 🔧 Configuration

### Port Configuration

Set a custom port using environment variable:

```bash
export ARGUS_WEB_PORT=8080
```

Default: `30000`

### Host Configuration

Set a custom host:

```bash
export ARGUS_WEB_HOST=0.0.0.0
```

Default: `localhost`

### Data Directory

Configure where ARGUS stores data:

```bash
export ARGUS_DATA_DIR=/path/to/data
```

Default: `~/.argus/` (or `%USERPROFILE%\.argus\` on Windows)

## 📈 Statistics File

ARGUS automatically writes statistics to `~/.argus/stats.json` every time you query stats:

```json
{
  "transactionCount": 42,
  "hookCount": 8,
  "indexedFileCount": 156,
  "memorySize": 524288,
  "lastIndexTime": 1708612800000,
  "lastUpdated": 1708612900000
}
```

## 🎯 Usage Examples

### Check Health via CLI

```bash
curl http://localhost:30000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-02-22T21:00:00.000Z",
  "uptime": 3600,
  "pid": 12345
}
```

### Get Statistics via CLI

```bash
curl http://localhost:30000/api/stats
```

Response:
```json
{
  "success": true,
  "stats": {
    "transactionCount": 42,
    "hookCount": 8,
    "indexedFileCount": 156,
    "memorySize": 524288,
    "lastIndexTime": 1708612800000,
    "usingQdrant": false
  }
}
```

## 🔍 Troubleshooting

### Dashboard Not Loading

1. **Check if server is running**:
   ```bash
   curl http://localhost:30000/health
   ```

2. **Check port availability**:
   - Windows: `netstat -ano | findstr :30000`
   - Linux/Mac: `lsof -i :30000`

3. **View server logs**:
   The server outputs startup messages to the console

### Stats Not Updating

Statistics are updated when:
- You use MCP tools (automatically)
- You explicitly call `argus__get_stats` tool
- The web dashboard refreshes (every 30 seconds)

### Port Already in Use

If port 30000 is already in use, either:
1. Stop the process using the port
2. Set `ARGUS_WEB_PORT` to a different port

## 🎨 Dashboard Features

### Auto-Refresh
The dashboard automatically refreshes every 30 seconds to show the latest statistics.

### Status Indicators
- 🟢 **Green**: System healthy, indexed, active
- 🟡 **Yellow**: Warning, pending, or using local storage
- 🔴 **Red**: Error or system degraded

### Visual Cards
Each section of the dashboard is presented in a visual card:
- Index Statistics
- Memory Engine
- MCP Tools
- Indexed Projects
- Recent Activity
- Server Information
- API Endpoints

## 🔗 Integration with Claude Code

The dashboard integrates seamlessly with your Claude Code workflow:

1. **Automatic Startup**: Starts when ARGUS plugin loads
2. **No Configuration**: Works out of the box
3. **Real-Time Updates**: Reflects your current session activity
4. **MCP Integration**: Shows all available MCP tools

## 📝 Development

### Build the Dashboard

The dashboard is a single-page HTML application with no build step required.

### Modify the Dashboard

Edit `mcp/web/index.html` and restart the web server:

```bash
node mcp/web/server.js
```

### Add New Endpoints

Edit `mcp/web/server.js` and add new routes in the `handleRequest` function.

## 📄 License

MIT - See LICENSE file for details
