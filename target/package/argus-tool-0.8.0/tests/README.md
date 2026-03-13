# ARGUS Testing Suite

Comprehensive testing suite for ARGUS - Autonomous RAG Guided Utility System.

## Overview

The ARGUS testing suite ensures:
- **Unit tests** for individual components (Storage, MCP handlers)
- **Integration tests** for full workflows (check_hooks → action → save)
- **Hook interception tests** (CRITICAL: Explore tool interception)
- **Performance benchmarks** (<100ms search requirement)
- **Cross-platform validation** (Windows, macOS, Linux)

## Test Structure

```
tests/
├── vitest.setup.ts          # Global test setup and mocks
├── utils.ts                 # Test utilities and helpers
├── storage.test.ts          # Storage class unit tests
├── mcp-handlers.test.ts     # MCP server handler tests
├── hooks-interception.test.ts  # CRITICAL: Hook interception tests
├── integration.test.ts      # End-to-end workflow tests
├── performance.bench.ts     # Performance benchmarks
└── cross-platform.test.ts   # Cross-platform validation
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific test suites
```bash
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:e2e         # End-to-end tests only
npm run test:bench       # Performance benchmarks
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Watch mode for development
```bash
npm run test:watch
```

## Test Categories

### 1. Unit Tests (`storage.test.ts`, `mcp-handlers.test.ts`)

**Storage Tests:**
- Initialization and file loading
- Transaction CRUD operations
- Hook CRUD operations
- Search functionality (keyword matching)
- History queries with filters
- Indexing and keyword extraction

**MCP Handler Tests:**
- `argus_search` - Query transactions
- `argus_save` - Save transactions
- `argus_get_history` - Retrieve history
- `argus_check_hooks` - Find relevant hooks
- `argus_save_hook` - Save hooks

### 2. Hook Interception Tests (`hooks-interception.test.ts`) ⚠️ CRITICAL

These tests verify ARGUS's core value proposition:
- Explore tool interception
- Hook trigger points (PreToolUse, PostToolUse, SessionStart)
- RAG-based hook selection
- Hook execution context
- Response handling
- Performance (<50ms requirement)

### 3. Integration Tests (`integration.test.ts`)

Full workflow validation:
- Check hooks → Execute action → Save transaction
- RAG integration (hooks + transactions)
- Cross-platform workflows
- Error recovery

### 4. Performance Benchmarks (`performance.bench.ts`)

**Requirements:**
- Search: <100ms with 1000+ transactions
- Hook checks: <50ms with 20+ hooks
- Full workflow: <150ms end-to-end

**Benchmarks:**
- Search performance (various query types)
- Write performance (transaction save)
- Hook check performance
- Memory efficiency
- Scalability (10K+ transactions)

### 5. Cross-Platform Tests (`cross-platform.test.ts`)

Validates on:
- **Windows** (`win32`) - Path separators, line endings (CRLF)
- **macOS** (`darwin`) - Unix paths, case sensitivity
- **Linux** (`linux`) - Unix paths, permissions

**Coverage:**
- Path handling (absolute/relative, separators)
- File system operations (mkdir, readFile, writeFile)
- Environment variables
- Line endings (CRLF vs LF)
- Unicode/UTF-8 encoding
- Special characters in paths

## Coverage Targets

- **Statements:** 80%
- **Branches:** 80%
- **Functions:** 80%
- **Lines:** 80%

## Test Utilities

### Creating Mock Data

```typescript
import { createMockTransaction, createMockHook } from '@test/utils'

// Mock transaction
const txn = createMockTransaction({
  prompt: { raw: 'Custom prompt', type: 'user' },
  metadata: { tags: ['custom'] }
})

// Mock hook
const hook = createMockHook({
  name: 'Custom Hook',
  triggers: ['PreToolUse']
})
```

### Performance Measurement

```typescript
import { PerformanceMeasurement } from '@test/utils'

const perf = new PerformanceMeasurement()

await perf.measure('search', async () => {
  await storage.searchTransactions('test')
})

const stats = perf.getStats('search')
console.log(stats) // { avg, min, max, p95, p99 }
```

### Mock File System

```typescript
import { MockFileSystem } from '@test/utils'

const fs = new MockFileSystem()
await fs.writeFile('/test/file.json', '{"data": "value"}')
const content = await fs.readFile('/test/file.json')
```

## CI/CD Integration

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm test

- name: Check coverage
  run: npm run test:coverage

- name: Performance benchmarks
  run: npm run test:bench
```

## Troubleshooting

### Tests failing on Windows?
Check path separators and line endings in `cross-platform.test.ts`.

### Performance tests failing?
Ensure no heavy operations in test setup. Use mocks for I/O.

### Coverage below target?
Run `npm run test:coverage` and check `coverage/index.html` for gaps.

## Contributing Tests

1. Follow naming: `<module>.test.ts` for unit tests, `<module>.bench.ts` for benchmarks
2. Use test utilities from `@test/utils`
3. Ensure cross-platform compatibility
4. Add performance benchmarks for new features
5. Update this README with new test categories
