import esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWatch = process.argv.includes('--watch');

async function build() {
  const context = await esbuild.context({
    entryPoints: [join(__dirname, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: join(__dirname, 'dist/server.bundle.mjs'),
    external: ['better-sqlite3', '@qdrant/js-client-rest', 'chrono-node'],
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production',
    logLevel: 'info'
  });

  if (isWatch) {
    await context.watch();
    console.log('👀 Watching for changes...');
  } else {
    await context.rebuild();
    await context.dispose();
    console.log('✅ MCP Build complete');
  }

  const wrapper = `#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
await import('./dist/server.bundle.mjs');
`;

  await import('fs').then(fs => {
    fs.writeFileSync(join(__dirname, 'server.js'), wrapper);
  });
}

build().catch(console.error);
