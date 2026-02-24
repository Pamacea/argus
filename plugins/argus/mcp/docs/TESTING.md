# Testing Guide for ARGUS

This guide covers testing practices, test structure, and how to run tests for the ARGUS MCP server.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Coverage](#coverage)
- [Writing Tests](#writing-tests)
- [Best Practices](#best-practices)

---

## Overview

ARGUS uses **Vitest** as its testing framework with **@vitest/coverage-v8** for coverage reporting. The test suite includes:

- **Unit Tests**: Test individual modules and functions in isolation
- **Integration Tests**: Test interactions between modules
- **E2E Tests**: Test complete workflows from start to finish

### Test Goals

- **Target Coverage**: ≥80% code coverage
- **Test Types**: Unit, Integration, E2E
- **Speed**: Fast feedback with parallel test execution
- **Reliability**: Isolated tests with proper setup/teardown

---

## Test Structure

```
plugins/argus/mcp/
├── src/
│   ├── storage/
│   │   ├── database.ts
│   │   └── database.test.ts          # Unit tests for Storage
│   ├── rag/
│   │   ├── engine.ts
│   │   └── engine.test.ts             # Unit tests for RAG Engine
│   ├── semantic/
│   │   ├── local-semantic.ts
│   │   └── local-semantic.test.ts    # Unit tests for Local Search
│   ├── handlers/
│   │   ├── tools.ts
│   │   └── tools.test.ts             # Unit tests for MCP Handlers
│   └── indexer/
│       ├── file-indexer.ts
│       └── file-indexer.test.ts      # Unit tests for File Indexer
├── tests/
│   ├── integration/
│   │   └── storage-rag-integration.test.ts  # Integration tests
│   └── e2e/
│       └── complete-workflow.test.ts         # E2E tests
├── vitest.config.ts                   # Vitest configuration
└── test-setup.ts                      # Global test setup
```

---

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests Once

```bash
npm run test:run
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Tests with UI

```bash
npm run test:ui
```

### Run Specific Test File

```bash
npx vitest src/storage/database.test.ts
```

### Run Tests Matching Pattern

```bash
npx vitest --testNamePattern="should index transaction"
```

---

## Coverage

Coverage reports are generated in the `coverage/` directory:

- `coverage/index.html` - HTML coverage report
- `coverage/lcov.info` - LCOV format for CI
- `coverage/coverage-final.json` - JSON coverage data

### Coverage Thresholds

The project enforces minimum coverage thresholds:

- **Statements**: 80%
- **Branches**: 75%
- **Functions**: 80%
- **Lines**: 80%

If coverage falls below these thresholds, the test run will fail.

### Viewing Coverage

1. Run tests with coverage:
   ```bash
   npm run test:coverage
   ```

2. Open the HTML report:
   ```bash
   open coverage/index.html  # macOS
   start coverage/index.html # Windows
   xdg-open coverage/index.html # Linux
   ```

---

## Writing Tests

### Test File Naming

Test files should be named after the file they test, with `.test.ts` suffix:

```
database.ts → database.test.ts
engine.ts → engine.test.ts
```

### Test Structure

Use `describe` blocks to group related tests:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Storage } from './database.js';

describe('Storage', () => {
  let storage: Storage;

  beforeEach(() => {
    // Setup before each test
    storage = new Storage();
  });

  afterEach(() => {
    // Cleanup after each test
    storage.close();
  });

  describe('storeTransaction', () => {
    it('should store a transaction successfully', async () => {
      const tx = createMockTransaction();
      const result = await storage.storeTransaction(tx);
      expect(result).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      // Test error case
    });
  });
});
```

### Test Naming

Use clear, descriptive test names that describe behavior:

```typescript
// ✅ Good
it('should store a transaction with embedding')
it('should return null for non-existent transaction')
it('should filter results by session ID')

// ❌ Bad
it('works')
it('test1')
it('storage test')
```

### Assertions

Use Vitest's assertion API:

```typescript
// Equality
expect(result).toBe(true);
expect(value).toEqual(expected);

// Truthiness
expect(value).toBeDefined();
expect(value).toBeNull();
expect(value).toBeTruthy();

// Numbers
expect(count).toBeGreaterThan(0);
expect(count).toBeLessThanOrEqual(10);

// Strings
expect(text).toContain('substring');
expect(text).toMatch(/regex/);

// Arrays
expect(array).toHaveLength(5);
expect(array).toContain(item);

// Async
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow();
```

### Mocking

Use `vi.mock()` to mock dependencies:

```typescript
// Mock at top level
vi.mock('../storage/database.js', () => ({
  getStorage: vi.fn(() => mockStorage),
}));

// Mock in tests
const mockFn = vi.fn();
mockFn.mockReturnValue('result');
mockFn.mockResolvedValue({ data: 'value' });

// Verify calls
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
expect(mockFn).toHaveBeenCalledTimes(3);
```

### Testing Async Code

```typescript
// Async/await
it('should async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBe('value');
});

// Promises
it('should resolve promise', async () => {
  await expect(promiseFunction()).resolves.toBe('value');
});

// Error handling
it('should throw error', async () => {
  await expect(badFunction()).rejects.toThrow('Error message');
});
```

---

## Best Practices

### 1. Test Isolation

Each test should be independent and not rely on other tests:

```typescript
beforeEach(() => {
  // Fresh setup for each test
});

afterEach(() => {
  // Clean up after each test
});
```

### 2. Use Test Data Builders

Create helper functions to generate test data:

```typescript
function createMockTransaction(overrides?: Partial<Transaction>): Transaction {
  return {
    id: 'tx_test_001',
    timestamp: Date.now(),
    sessionId: 'session_001',
    prompt: { raw: 'Test prompt', type: 'user' },
    // ... default values
    ...overrides,
  };
}

// Usage
it('should handle custom transaction', async () => {
  const tx = createMockTransaction({
    metadata: { category: 'custom' },
  });
});
```

### 3. Mock External Dependencies

Mock file system, network, and database operations:

```typescript
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn(),
}));
```

### 4. Test Error Cases

Don't just test happy paths:

```typescript
it('should handle database errors', async () => {
  mockStorage.storeTransaction.mockRejectedValue(new Error('DB Error'));

  const result = await storage.storeTransaction(tx);
  expect(result).toBe(false);
});
```

### 5. Use Descriptive Match Messages

Add custom messages to assertions for clarity:

```typescript
expect(result.id).toBe(tx.id, 'Transaction ID should match');
expect(results.length).toBeGreaterThan(0, 'Should find matching transactions');
```

### 6. Clean Up Resources

Always clean up resources in `afterEach`:

```typescript
afterEach(() => {
  storage.close();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
```

### 7. Test Edge Cases

Test boundary conditions and unusual inputs:

```typescript
it('should handle empty strings', async () => {
  const result = await functionUnderTest('');
  expect(result).toBeDefined();
});

it('should handle very long input', async () => {
  const longInput = 'a'.repeat(10000);
  const result = await functionUnderTest(longInput);
  expect(result).toBeDefined();
});

it('should handle special characters', async () => {
  const special = 'émojis 🎉 and 中文';
  const result = await functionUnderTest(special);
  expect(result).toBeDefined();
});
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Pre-Commit Hook

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:run"
    }
  }
}
```

---

## Troubleshooting

### Tests Timeout

Increase timeout in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

### SQLite Tests Fail on Windows

Use absolute paths and proper cleanup:

```typescript
const testDbPath = path.resolve(__dirname, '../test-data', `test_${Date.now()}.db`);
```

### Coverage Not Generated

Ensure `@vitest/coverage-v8` is installed:

```bash
npm install -D @vitest/coverage-v8
```

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Mocking with Vitest](https://vitest.dev/guide/mocking.html)

---

**Last Updated:** 2025-02-24
**Version:** 0.5.12
