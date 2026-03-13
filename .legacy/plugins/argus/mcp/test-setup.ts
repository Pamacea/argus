/**
 * Test setup file for Vitest
 * Configures mocks and global test utilities
 */

import { vi } from 'vitest';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Keep error and warn for debugging
  error: console.error,
  warn: console.warn,
  // Mute debug and log during tests unless explicitly needed
  debug: vi.fn(),
  log: vi.fn(),
  info: vi.fn(),
};

// Mock process.cwd() for consistent test paths
const originalCwd = process.cwd;
vi.stubGlobal('process', {
  ...process,
  cwd: () => '/test/workspace',
  env: {
    ...process.env,
    HOME: '/test/home',
    USERPROFILE: '/test/home',
  },
});

// Clean up after all tests
afterAll(() => {
  vi.restoreAllMocks();
});
