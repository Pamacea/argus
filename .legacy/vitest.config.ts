import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/vitest.setup.ts'],
    include: ['tests/**/*.test.ts', 'plugins/**/*.test.ts'],
    exclude: [
      'node_modules/',
      'dist/',
      'coverage/',
      '**/node_modules/**',
      'plugins/argus/mcp/node_modules/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json'],
      include: ['plugins/argus/mcp/src/**/*.ts', 'plugins/argus/hooks/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.test.js',
        '**/*.spec.ts',
        '**/*.spec.js',
        '**/types/**',
        '**/index.ts',
        '**/coverage/**',
        'plugins/argus/mcp/node_modules/**',
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
      perFile: false,
    },
    testTimeout: 10000,
    isolate: true,
    logHeapUsage: true,
    coverageDirectory: './coverage',
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './plugins/argus'),
      '@plugin': path.resolve(__dirname, './plugins/argus'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
})
