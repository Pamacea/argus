/**
 * ARGUS Error Handling System
 *
 * Provides structured error types with clear, actionable messages
 * and automatic recovery where possible.
 */

/**
 * Base error class for all ARGUS errors
 */
export class ArgusError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly context: Record<string, unknown>;
  public readonly originalError?: Error;
  public readonly timestamp: number;

  constructor(
    message: string,
    code: string,
    retryable: boolean = false,
    context: Record<string, unknown> = {},
    originalError?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = retryable;
    this.context = context;
    this.originalError = originalError;
    this.timestamp = Date.now();

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Get a formatted error message with context
   */
  getFormattedMessage(): string {
    const parts = [
      `[${this.code}]`,
      this.message,
    ];

    if (Object.keys(this.context).length > 0) {
      parts.push('\nContext:');
      for (const [key, value] of Object.entries(this.context)) {
        const formattedValue = typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : String(value);
        parts.push(`  ${key}: ${formattedValue}`);
      }
    }

    if (this.retryable) {
      parts.push('\nThis error is retryable - the system will attempt automatic recovery.');
    }

    return parts.join('\n');
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined,
      stack: this.stack
    };
  }
}

/**
 * Qdrant connection or operation errors
 */
export class QdrantError extends ArgusError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    originalError?: Error
  ) {
    super(
      message,
      'QDRANT_ERROR',
      true, // Qdrant errors are retryable
      context,
      originalError
    );
  }

  /**
   * Create a connection error
   */
  static connectionFailed(url: string, originalError?: Error): QdrantError {
    return new QdrantError(
      `Failed to connect to Qdrant at ${url}. Falling back to local search.`,
      { url, operation: 'connect' },
      originalError
    );
  }

  /**
   * Create a collection error
   */
  static collectionFailed(operation: string, collection: string, originalError?: Error): QdrantError {
    return new QdrantError(
      `Failed to ${operation} collection "${collection}".`,
      { collection, operation },
      originalError
    );
  }

  /**
   * Create a search error
   */
  static searchFailed(query: string, originalError?: Error): QdrantError {
    return new QdrantError(
      `Vector search failed. Falling back to local text search.`,
      { query: query.substring(0, 100), operation: 'search' },
      originalError
    );
  }

  /**
   * Create an indexing error
   */
  static indexFailed(id: string, originalError?: Error): QdrantError {
    return new QdrantError(
      `Failed to index document "${id}" in Qdrant. Local indexing succeeded.`,
      { id, operation: 'index' },
      originalError
    );
  }
}

/**
 * SQLite database errors
 */
export class DatabaseError extends ArgusError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    originalError?: Error
  ) {
    super(
      message,
      'DATABASE_ERROR',
      true, // Database errors are often retryable
      context,
      originalError
    );
  }

  /**
   * Create an initialization error
   */
  static initFailed(dbPath: string, originalError?: Error): DatabaseError {
    return new DatabaseError(
      `Failed to initialize database at ${dbPath}. Check permissions and disk space.`,
      { dbPath, operation: 'init' },
      originalError
    );
  }

  /**
   * Create a query error
   */
  static queryFailed(sql: string, originalError?: Error): DatabaseError {
    return new DatabaseError(
      `Database query failed. Check query syntax and data integrity.`,
      { sql: sql.substring(0, 200), operation: 'query' },
      originalError
    );
  }

  /**
   * Create a transaction error
   */
  static transactionFailed(operation: string, id: string, originalError?: Error): DatabaseError {
    return new DatabaseError(
      `Failed to ${operation} transaction "${id}". Data may not be persisted.`,
      { id, operation },
      originalError
    );
  }

  /**
   * Create a save error
   */
  static saveFailed(dbPath: string, originalError?: Error): DatabaseError {
    return new DatabaseError(
      `Failed to save database to disk. Check disk space and permissions.`,
      { dbPath, operation: 'save' },
      originalError
    );
  }
}

/**
 * File system errors
 */
export class FileSystemError extends ArgusError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    originalError?: Error
  ) {
    super(
      message,
      'FILESYSTEM_ERROR',
      false, // File system errors are usually not retryable without changes
      context,
      originalError
    );
  }

  /**
   * Create a file not found error
   */
  static fileNotFound(path: string): FileSystemError {
    return new FileSystemError(
      `File not found: ${path}`,
      { path, operation: 'read' }
    );
  }

  /**
   * Create a permission error
   */
  static permissionDenied(path: string, operation: string): FileSystemError {
    return new FileSystemError(
      `Permission denied: Cannot ${operation} ${path}`,
      { path, operation }
    );
  }

  /**
   * Create a directory error
   */
  static directoryFailed(path: string, operation: string, originalError?: Error): FileSystemError {
    return new FileSystemError(
      `Failed to ${operation} directory: ${path}`,
      { path, operation },
      originalError
    );
  }

  /**
   * Create an invalid path error
   */
  static invalidPath(path: string, reason: string): FileSystemError {
    return new FileSystemError(
      `Invalid path "${path}": ${reason}`,
      { path, reason }
    );
  }
}

/**
 * MCP protocol errors
 */
export class MCPError extends ArgusError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    originalError?: Error
  ) {
    super(
      message,
      'MCP_ERROR',
      false, // MCP errors are usually not retryable
      context,
      originalError
    );
  }

  /**
   * Create an invalid parameter error
   */
  static invalidParameter(param: string, value: unknown, expected: string): MCPError {
    return new MCPError(
      `Invalid parameter "${param}". Expected: ${expected}`,
      { param, value, expected }
    );
  }

  /**
   * Create a missing parameter error
   */
  static missingParameter(param: string): MCPError {
    return new MCPError(
      `Missing required parameter: ${param}`,
      { param }
    );
  }

  /**
   * Create a tool execution error
   */
  static toolFailed(tool: string, reason: string, originalError?: Error): MCPError {
    return new MCPError(
      `Tool "${tool}" execution failed: ${reason}`,
      { tool, reason },
      originalError
    );
  }
}

/**
 * Git integration errors
 */
export class GitError extends ArgusError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    originalError?: Error
  ) {
    super(
      message,
      'GIT_ERROR',
      false, // Git errors are usually not retryable
      context,
      originalError
    );
  }

  /**
   * Create a not a repository error
   */
  static notRepository(dir: string): GitError {
    return new GitError(
      `Not a git repository: ${dir}. Git features disabled.`,
      { dir },
      undefined
    );
  }

  /**
   * Create a git command failed error
   */
  static commandFailed(command: string, dir: string, originalError?: Error): GitError {
    return new GitError(
      `Git command failed: ${command}`,
      { command, dir },
      originalError
    );
  }

  /**
   * Create a branch error
   */
  static branchFailed(operation: string, originalError?: Error): GitError {
    return new GitError(
      `Failed to ${operation} branch. Using default branch.`,
      { operation },
      originalError
    );
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends ArgusError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    originalError?: Error
  ) {
    super(
      message,
      'CONFIG_ERROR',
      false, // Config errors require manual fixes
      context,
      originalError
    );
  }

  /**
   * Create an invalid config error
   */
  static invalidConfig(key: string, value: unknown, reason: string): ConfigError {
    return new ConfigError(
      `Invalid configuration value for "${key}": ${reason}`,
      { key, value, reason }
    );
  }

  /**
   * Create a missing config error
   */
  static missingConfig(key: string): ConfigError {
    return new ConfigError(
      `Missing required configuration: ${key}`,
      { key }
    );
  }
}

/**
 * Validation errors
 */
export class ValidationError extends ArgusError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    originalError?: Error
  ) {
    super(
      message,
      'VALIDATION_ERROR',
      false, // Validation errors are not retryable
      context,
      originalError
    );
  }

  /**
   * Create a schema validation error
   */
  static schemaFailed(entity: string, reason: string, originalError?: Error): ValidationError {
    return new ValidationError(
      `Schema validation failed for ${entity}: ${reason}`,
      { entity },
      originalError
    );
  }

  /**
   * Create an input validation error
   */
  static invalidInput(field: string, value: unknown, reason: string): ValidationError {
    return new ValidationError(
      `Invalid input for "${field}": ${reason}`,
      { field, value, reason }
    );
  }
}

/**
 * Index of all error types for error handling
 */
export const ErrorTypes = {
  QdrantError,
  DatabaseError,
  FileSystemError,
  MCPError,
  GitError,
  ConfigError,
  ValidationError,
} as const;

/**
 * Type guard to check if an error is an ArgusError
 */
export function isArgusError(error: unknown): error is ArgusError {
  return error instanceof ArgusError;
}

/**
 * Convert any error to an ArgusError if it isn't already
 */
export function toArgusError(error: unknown, defaultMessage: string = 'An error occurred'): ArgusError {
  if (isArgusError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new ArgusError(
      error.message || defaultMessage,
      'UNKNOWN_ERROR',
      false,
      {},
      error
    );
  }

  return new ArgusError(
    defaultMessage,
    'UNKNOWN_ERROR',
    false,
    { originalValue: error }
  );
}

/**
 * Format any error for display
 */
export function formatError(error: unknown): string {
  if (isArgusError(error)) {
    return error.getFormattedMessage();
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Handle an error with logging (re-export from handler)
 */
export { handleError, handleWithFallback, safeExecute, safeExecuteWithRetry, safeExecuteWithCircuitBreaker, getErrorHandler, ErrorHandler } from './handler.js';

/**
 * Retry utilities (re-export from retry)
 */
export { retry, retryFn, createCircuitBreaker, CircuitBreaker } from './retry.js';
export type { RetryOptions, CircuitBreakerOptions } from './retry.js';

