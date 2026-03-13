#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
await import('./dist/server.bundle.mjs');
