# Contributing to ARGUS

Thank you for your interest in contributing to ARGUS! This document provides guidelines and instructions for contributing.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)

---

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other community members

---

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

### Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/argus.git
cd argus

# 2. Install dependencies
npm install

# 3. Create a branch
git checkout -b feature/your-feature-name

# 4. Start development
npm run dev
```

---

## Development Workflow

### 1. Branch Naming

Use these prefixes:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test improvements
- `perf/` - Performance improvements

### 2. Development

```bash
# Watch mode for development
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Type checking
npm run typecheck
```

### 3. Testing

Write tests for all new functionality:

```typescript
// Example test
import { describe, it, expect } from 'vitest'

describe('ARGUS Storage', () => {
  it('should save and retrieve observations', async () => {
    const storage = new Storage()
    await storage.save({ id: '1', content: 'test' })
    const result = await storage.get('1')
    expect(result.content).toBe('test')
  })
})
```

### 4. Build

```bash
# Build for production
npm run build

# Verify build
ls -la build/
```

---

## Coding Standards

### TypeScript

- Use strict TypeScript settings
- Avoid `any` types
- Use proper type definitions
- Prefer interfaces for object shapes
- Use type aliases for unions

```typescript
// ✅ Good
interface User {
  id: string
  name: string
}

function getUser(id: string): Promise<User> {
  // ...
}

// ❌ Bad
function getUser(id: any): any {
  // ...
}
```

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Use semicolons
- Prefer `const` over `let`
- Use arrow functions for callbacks

```typescript
// ✅ Good
const data = await fetchData()
const result = data.map(item => item.value)

// ❌ Bad
var data = await fetchData()
var result = data.map(function(item) {
  return item.value
})
```

### Naming Conventions

- **Components**: PascalCase (`StorageEngine`)
- **Functions**: camelCase (`saveObservation`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_LOG_SIZE`)
- **Files**: kebab-case (`storage-engine.ts`)

---

## Testing Guidelines

### Test Structure

```
tests/
├── unit/              # Unit tests
│   ├── storage.test.ts
│   └── rag.test.ts
├── integration/       # Integration tests
│   └── mcp-server.test.ts
└── e2e/              # End-to-end tests
    └── workflow.test.ts
```

### Writing Tests

1. **Test one thing per test**
2. **Use descriptive test names**
3. **Follow AAA pattern** (Arrange, Act, Assert)
4. **Mock external dependencies**

```typescript
it('should return observations sorted by timestamp', async () => {
  // Arrange
  const storage = new Storage()
  await storage.save({ id: '1', timestamp: '2024-01-02' })
  await storage.save({ id: '2', timestamp: '2024-01-01' })

  // Act
  const results = await storage.getAll()

  // Assert
  expect(results[0].id).toBe('2')
  expect(results[1].id).toBe('1')
})
```

### Test Coverage

Maintain > 80% code coverage:

```bash
# Check coverage
npm run test:coverage

# View coverage report
open coverage/index.html
```

---

## Documentation

### Code Documentation

Use JSDoc for public APIs:

```typescript
/**
 * Saves an observation to storage
 * @param observation - The observation to save
 * @returns Promise resolving to the saved observation ID
 * @throws {StorageError} If save fails
 */
async save(observation: Observation): Promise<string> {
  // ...
}
```

### README Updates

Update README.md for user-facing changes:
- New features
- Breaking changes
- Configuration options
- Usage examples

### API Documentation

Update API.md for API changes:
- New tools
- Modified parameters
- Updated return types

---

## Submitting Changes

### 1. Commit Messages

Follow conventional commits:

```
type(scope): subject

body

footer
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Maintenance tasks

Examples:
```
feat(storage): add PostgreSQL support

Implement PostgreSQL as an alternative storage backend
for better scalability in production environments.

Closes #123
```

```
fix(rag): handle empty search results

Fixed crash when search returns no results by
adding proper null checking.

Fixes #456
```

### 2. Pull Requests

#### PR Title

Use the same format as commit messages:
```
feat: add PostgreSQL storage support
```

#### PR Description

Include:
- **What**: Summary of changes
- **Why**: Motivation for the change
- **How**: Implementation approach
- **Testing**: How you tested it
- **Screenshots**: For UI changes (if applicable)

#### Template

```markdown
## What
Brief description of changes

## Why
Motivation and context

## How
Implementation details

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### 3. Review Process

1. Automated checks must pass
2. At least one maintainer approval required
3. Address all review comments
4. Squash commits if needed
5. Merge when approved

---

## Project Structure

```
argus/
├── lib/                    # Core library code
│   ├── storage/           # Storage implementations
│   ├── rag/               # RAG engine
│   └── validation/        # Input validation
├── mcp/                    # MCP server
│   └── server.ts          # Server implementation
├── hooks/                  # Claude Code hooks
│   └── *.ts               # Hook implementations
├── skills/                 # User-invocable skills
│   └── *.md               # Skill documentation
├── tests/                  # Test suite
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── INSTALLATION.md
└── package.json
```

---

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing documentation first

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

*Last Updated: 2026-02-21*
