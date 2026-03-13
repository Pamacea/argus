/**
 * Test setup file for Vitest
 * Runs before each test file
 */

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Keep methods for debugging, can be silenced in specific tests
  debug: jest.fn(),
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.ARGUS_TEST_MODE = 'true'

// Mock file system utilities
const mockFs = {
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}

// Mock path utilities for cross-platform testing
const mockPath = {
  join: vi.fn((...args: string[]) => args.join('/')),
  resolve: vi.fn((...args: string[]) => args.join('/')),
  dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
  basename: vi.fn((p: string) => p.split('/').pop() || ''),
}

// Global test utilities
global.mockFs = mockFs
global.mockPath = mockPath

// Performance tracking for benchmarking
global.performanceMetrics = {
  mcpCalls: [],
  ragQueries: [],
  hookInterceptions: [],
}

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks()
  global.performanceMetrics = {
    mcpCalls: [],
    ragQueries: [],
    hookInterceptions: [],
  }
})
