#!/usr/bin/env node
/**
 * ARGUS MCP Server
 * Exposes ARGUS memory system as MCP tools via stdio transport
 *
 * Usage: node index.js
 * Config: Add to ~/.claude/settings.json under mcpServers
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { spawnSync } = require('child_process');
const { z } = require('zod');

// Resolve argus binary
const ARGUS = process.env.ARGUS_BIN || 'argus';

function argus(...args) {
    const result = spawnSync(ARGUS, args, {
        encoding: 'utf8',
        timeout: 30000,
        shell: false,
    });

    if (result.error) {
        throw new Error(`ARGUS not found: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || `argus exited with code ${result.status}`);
    }
    return result.stdout.trim();
}

// Create server
const server = new McpServer({
    name: 'argus',
    version: '0.9.1',
});

// --- argus_recall ---
server.tool(
    'argus_recall',
    'Search ARGUS memory for past transactions using semantic/FTS5 search. Returns compact results with ID, summary, type, and tags.',
    {
        query: z.string().describe('Search query'),
        limit: z.number().optional().default(10).describe('Max results (default: 10)'),
    },
    ({ query, limit }) => {
        const output = argus('recall', query, '--limit', String(limit), '--json');
        const results = JSON.parse(output || '[]');
        return {
            content: [{
                type: 'text',
                text: results.length > 0
                    ? `Found ${results.length} result(s):\n\n${results.map(r =>
                        `#${r.id} [${r.observation_type}] ${r.summary || r.prompt}\n  tags: ${(r.tags || []).join(', ')}\n  date: ${r.created_at || 'unknown'}`
                    ).join('\n\n')}`
                    : `No results found for: ${query}`,
            }],
        };
    }
);

// --- argus_remember ---
server.tool(
    'argus_remember',
    'Save an observation/transaction to ARGUS memory for future reference.',
    {
        description: z.string().describe('What to remember'),
        type: z.enum(['action', 'gotcha', 'problem-solution', 'how-it-works', 'what-changed', 'discovery', 'decision', 'trade-off', 'session-request']).optional().default('action').describe('Observation type'),
        tags: z.string().optional().describe('Comma-separated tags (e.g. "bugfix,auth")'),
        category: z.string().optional().describe('Category (e.g. "edit", "create", "feature")'),
    },
    ({ description, type, tags, category }) => {
        const args = ['remember', description];
        if (type) args.push('--type', type);
        if (tags) args.push('--tags', tags);
        if (category) args.push('--category', category);

        const output = argus(...args);
        return {
            content: [{ type: 'text', text: output }],
        };
    }
);

// --- argus_context ---
server.tool(
    'argus_context',
    'Get a compact context index of recent ARGUS observations for the current project. Use at session start to inject context.',
    {
        project: z.string().optional().describe('Project path to filter by'),
        limit: z.number().optional().default(20).describe('Max entries (default: 20)'),
    },
    ({ project, limit }) => {
        const args = ['context', '--limit', String(limit)];
        if (project) args.push('--project', project);

        const output = argus(...args);
        return {
            content: [{ type: 'text', text: output || 'No recent context found.' }],
        };
    }
);

// --- argus_get ---
server.tool(
    'argus_get',
    'Get full details of a specific transaction by ID. Use after argus_recall to get complete information.',
    {
        id: z.number().describe('Transaction ID'),
    },
    ({ id }) => {
        const output = argus('get', String(id), '--json');
        const tx = JSON.parse(output);
        const text = [
            `#${tx.id} [${tx.observation_type}] ${tx.summary || tx.prompt}`,
            `  type: ${tx.prompt_type}`,
            `  date: ${tx.created_at || 'unknown'}`,
            `  tags: ${(tx.tags || []).join(', ')}`,
            `  prompt: ${tx.prompt}`,
            tx.context?.project_path ? `  project: ${tx.context.project_path}` : '',
            tx.result?.output ? `  output: ${tx.result.output.substring(0, 200)}` : '',
        ].filter(Boolean).join('\n');

        return {
            content: [{ type: 'text', text }],
        };
    }
);

// --- argus_summarize ---
server.tool(
    'argus_summarize',
    'Save a structured session summary with request/investigated/learned/completed/next_steps fields.',
    {
        session: z.string().optional().describe('Session ID'),
        project: z.string().optional().describe('Project path'),
        request: z.string().optional().describe('The original request'),
        investigated: z.string().optional().describe('What was investigated'),
        learned: z.string().optional().describe('What was learned'),
        completed: z.string().optional().describe('What was completed'),
        next_steps: z.string().optional().describe('Next steps'),
        notes: z.string().optional().describe('Additional notes'),
    },
    (args) => {
        const cmdArgs = ['summarize'];
        for (const [key, value] of Object.entries(args)) {
            if (value) cmdArgs.push(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, value);
        }

        const output = argus(...cmdArgs);
        return {
            content: [{ type: 'text', text: output }],
        };
    }
);

// --- argus_summaries ---
server.tool(
    'argus_summaries',
    'List recent session summaries with request/completed/next_steps fields.',
    {
        project: z.string().optional().describe('Filter by project path'),
        limit: z.number().optional().default(10).describe('Max results (default: 10)'),
    },
    ({ project, limit }) => {
        const args = ['summaries', '--limit', String(limit), '--json'];
        if (project) args.push('--project', project);

        const output = argus(...args);
        const results = JSON.parse(output || '[]');

        return {
            content: [{
                type: 'text',
                text: results.length > 0
                    ? results.map(s =>
                        `#${s.id} ${s.request || '(no request)'}\n  completed: ${s.completed || '-'}\n  date: ${s.created_at || 'unknown'}`
                    ).join('\n\n')
                    : 'No session summaries found.',
            }],
        };
    }
);

// --- argus_stats ---
server.tool(
    'argus_stats',
    'Get ARGUS memory statistics: total transactions, size, oldest/newest, breakdown by type.',
    {},
    () => {
        const output = argus('stats', '--json');
        const stats = JSON.parse(output);

        const text = [
            `ARGUS Memory Statistics`,
            `  Transactions: ${stats.total_transactions}`,
            `  Size: ${formatBytes(stats.total_size_bytes)}`,
            `  Oldest: ${stats.oldest_transaction || 'none'}`,
            `  Newest: ${stats.newest_transaction || 'none'}`,
            `  By type:`,
            ...Object.entries(stats.transactions_by_type || {}).map(([k, v]) => `    ${k}: ${v}`),
        ].join('\n');

        return {
            content: [{ type: 'text', text }],
        };
    }
);

// --- argus_search ---
server.tool(
    'argus_search',
    'Full-text search (FTS5 with BM25 ranking) across all transactions. Returns ranked results with scores.',
    {
        query: z.string().describe('FTS5 search query'),
        limit: z.number().optional().default(10).describe('Max results (default: 10)'),
    },
    ({ query, limit }) => {
        const output = argus('search-db', query, '--limit', String(limit), '--json');
        const results = JSON.parse(output || '[]');

        return {
            content: [{
                type: 'text',
                text: results.length > 0
                    ? results.map(r =>
                        `#${r.id} [${r.observation_type}] ${r.summary || r.prompt}\n  score: ${r.score?.toFixed(2)}\n  tags: ${(r.tags || []).join(', ')}\n  date: ${r.created_at}`
                    ).join('\n\n')
                    : `No results found for: ${query}`,
            }],
        };
    }
);

// Helper
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;
    if (bytes >= gb) return (bytes / gb).toFixed(2) + ' GB';
    if (bytes >= mb) return (bytes / mb).toFixed(2) + ' MB';
    if (bytes >= kb) return (bytes / kb).toFixed(2) + ' KB';
    return bytes + ' B';
}

// Start server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[ARGUS MCP] Server started');
}

main().catch(err => {
    console.error('[ARGUS MCP] Fatal:', err.message);
    process.exit(1);
});
