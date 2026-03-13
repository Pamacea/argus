import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🔧 ARGUS - Installation...\n');

// Install MCP server dependencies
const mcpDir = join(rootDir, 'mcp');
if (existsSync(join(mcpDir, 'package.json'))) {
  console.log('📦 Installing MCP server dependencies...');
  execSync('npm install', { cwd: mcpDir, stdio: 'inherit' });
  console.log('✅ MCP dependencies installed\n');
}

// Build MCP server
console.log('🔨 Building MCP server...');
execSync('npm run build', { cwd: mcpDir, stdio: 'inherit' });
console.log('✅ MCP server built\n');

// Create data directory
const dataDir = process.env.ARGUS_DATA_DIR || join(rootDir, 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
  console.log(`📁 Created data directory: ${dataDir}\n`);
}

console.log('✨ ARGUS installed successfully!\n');
console.log('Next steps:');
console.log('  1. Restart Claude Code');
console.log('  2. ARGUS MCP server will start automatically');
console.log('  3. Use mcp__argus__check_hooks before any Explore action');
