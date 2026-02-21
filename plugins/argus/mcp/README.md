# ARGUS MCP Server

**Semantic memory and hooks marketplace for Claude Code**

## Overview

ARGUS MCP Server provides four core tools for Claude Code:

1. **argus__check_hooks** - MANDATORY before Explore. Consults RAG + Index + Docs
2. **argus__save_transaction** - Save prompt + context + result to memory
3. **argus__search_memory** - Semantic search in transaction history
4. **argus__get_history** - Retrieve transaction history with pagination

## Installation

The MCP server is built and located at `mcp/build/index.js`.

### Configuration

Add to your Claude Code MCP configuration (`.mcp.json`):

```json
{
  "mcpServers": {
    "argus": {
      "command": "node",
      "args": ["C:/Users/Yanis/Projects/-plugins/argus/mcp/build/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Usage

### argus__check_hooks (MANDATORY)

**Call this before using Explore tool.**

```json
{
  "prompt": "User task description",
  "toolName": "Explore",
  "context": {
    "cwd": "/path/to/project",
    "platform": "win32"
  }
}
```

Returns:
- Relevant hooks from marketplace
- Past transactions related to the task
- Confidence score

### argus__save_transaction

Save completed work to memory:

```json
{
  "prompt": "Original user prompt",
  "promptType": "user",
  "context": {
    "cwd": "/path/to/project",
    "platform": "win32",
    "toolsAvailable": ["Bash", "Read", "Write"],
    "files": [
      { "path": "/path/to/file.ts", "hash": "abc123" }
    ]
  },
  "result": {
    "success": true,
    "output": "Result description",
    "duration": 1500,
    "toolsUsed": ["Bash", "Write"]
  },
  "metadata": {
    "tags": ["feature", "api"],
    "category": "implementation"
  }
}
```

### argus__search_memory

Find similar past work:

```json
{
  "query": "Implement JWT authentication",
  "limit": 10,
  "threshold": 0.7,
  "filters": {
    "tags": ["auth", "security"],
    "category": "implementation"
  }
}
```

### argus__get_history

Review recent activity:

```json
{
  "limit": 50,
  "offset": 0,
  "sessionId": "/path/to/project"
}
```

## Architecture

```
mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── storage.ts         # JSON file storage (to be replaced with RAG)
│   ├── handlers/
│   │   └── tools.ts       # Tool handlers
│   └── types/
│       └── index.ts       # TypeScript types
├── build.js               # esbuild configuration
├── build/                 # Compiled output
└── package.json
```

## Storage

**Current implementation:** JSON file storage in `~/.argus/`

**Files:**
- `transactions.json` - All saved transactions
- `hooks.json` - Marketplace hooks
- `index.json` - Keyword index

**Note:** This will be enhanced by the RAG engineer with:
- Vector embeddings (OpenAI/Claude API)
- Qdrant vector database
- Semantic similarity search
- Better-SQLite3 for structured storage

## Development

```bash
cd mcp
npm install
npm run build      # Build once
npm run dev        # Watch mode
```

## API Reference

See `src/types/index.ts` for complete type definitions.

### Transaction Type

```typescript
interface Transaction {
  id: string;
  timestamp: number;
  sessionId: string;
  prompt: {
    raw: string;
    type: 'user' | 'tool' | 'system';
  };
  context: {
    cwd: string;
    environment: Record<string, string>;
    platform: string;
    toolsAvailable: string[];
    files: Array<{ path: string; hash?: string }>;
  };
  result: {
    success: boolean;
    output?: string;
    error?: string;
    duration: number;
    toolsUsed?: string[];
  };
  metadata: {
    tags: string[];
    category?: string;
    relatedHooks?: string[];
  };
}
```

### Hook Type

```typescript
interface Hook {
  id: string;
  name: string;
  description: string;
  version: string;
  triggers: ('SessionStart' | 'PreToolUse' | 'PostToolUse')[];
  ragQuery?: string;
  documentation: {
    summary: string;
    examples?: string[];
  };
  author: {
    name: string;
    url?: string;
  };
  marketplace: {
    downloads: number;
    rating: number;
    updatedAt: number;
  };
}
```

## License

MIT

## Author

Yanis
