/**
 * Central Error Handler
 *
 * Provides centralized error handling with logging, recovery, and fallbacks
 */

import {
  ArgusError,
  QdrantError,
  DatabaseError,
  FileSystemError,
  isArgusError,
  toArgusError,
  formatError
} from './index.js';
import { retry, CircuitBreaker } from './retry.js';

export interface ErrorHandlerOptions {
  /**
   * Whether to log errors
   * @default true
   */
  logErrors?: boolean;

  /**
   * Whether to throw errors after handling
   * @default false
   */
  throwOnError?: boolean;

  /**
   * Custom logger function
   * @default console.error
   */
  logger?: (message: string, context?: Record<string, unknown>) => void;

  /**
   * Callback called when an error is handled
   */
  onError?: (error: ArgusError) => void;

  /**
   * Circuit breaker for failing fast
   */
  circuitBreaker?: CircuitBreaker;
}

/**
 * Default error handler options
 */
const defaultErrorHandlerOptions: Required<ErrorHandlerOptions> = {
  logErrors: true,
  throwOnError: false,
  logger: (message, context) => {
    if (context) {
      console.error(`[ARGUS ERROR] ${message}`, context);
    } else {
      console.error(`[ARGUS ERROR] ${message}`);
    }
  },
  onError: () => {},
  circuitBreaker: new CircuitBreaker()
};

/**
 * Central error handler class
 */
export class ErrorHandler {
  private options: Required<ErrorHandlerOptions>;
  private errorCounts: Map<string, number> = new Map();
  private lastErrors: Map<string, { error: ArgusError; timestamp: number }> = new Map();

  constructor(options: ErrorHandlerOptions = {}) {
    this.options = { ...defaultErrorHandlerOptions, ...options };
  }

  /**
   * Handle an error with logging and potential recovery
   */
  async handle(error: unknown, context?: Record<string, unknown>): Promise<void> {
    const argusError = toArgusError(error);

    // Track error
    this.trackError(argusError);

    // Log error
    if (this.options.logErrors) {
      this.options.logger(argusError.getFormattedMessage(), context);
    }

    // Call error callback
    this.options.onError(argusError);

    // Throw if configured
    if (this.options.throwOnError) {
      throw argusError;
    }
  }

  /**
   * Handle an error and return a fallback value
   */
  async handleWithFallback<T>(
    error: unknown,
    fallback: T,
    context?: Record<string, unknown>
  ): Promise<T> {
    await this.handle(error, context);
    return fallback;
  }

  /**
   * Wrap a function with error handling
   */
  wrap<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    fallback?: ReturnType<T>
  ): T {
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error) {
        if (fallback !== undefined) {
          return await this.handleWithFallback(error, fallback);
        }
        await this.handle(error);
        throw error;
      }
    }) as T;
  }

  /**
   * Wrap a function with error handling and retry
   */
  wrapWithRetry<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    options: {
      fallback?: ReturnType<T>;
      maxAttempts?: number;
      initialDelay?: number;
    } = {}
  ): T {
    const retriedFn = retry(fn, {
      maxAttempts: options.maxAttempts ?? 3,
      initialDelay: options.initialDelay ?? 1000
    });

    return this.wrap(retriedFn, options.fallback);
  }

  /**
   * Wrap a function with circuit breaker protection
   */
  wrapWithCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    fallback?: ReturnType<T>
  ): T {
    const cb = this.options.circuitBreaker;

    const protectedFn = (async (...args: Parameters<T>) => {
      try {
        return await cb.execute(() => fn(...args));
      } catch (error) {
        if (fallback !== undefined) {
          await this.handle(error, { fallback: true });
          return fallback;
        }
        await this.handle(error);
        throw error;
      }
    }) as T;

    return protectedFn;
  }

  /**
   * Track error for monitoring
   */
  private trackError(error: ArgusError): void {
    const key = error.code;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
    this.lastErrors.set(key, { error, timestamp: Date.now() });
  }

  /**
   * Get error statistics
   */
  getStats(): {
    totalErrors: number;
    byCode: Record<string, number>;
    recentErrors: Array<{ code: string; message: string; timestamp: number }>;
  } {
    const byCode: Record<string, number> = {};
    let total = 0;

    for (const [code, count] of this.errorCounts.entries()) {
      byCode[code] = count;
      total += count;
    }

    const recent = Array.from(this.lastErrors.values())
      .map(({ error, timestamp }) => ({
        code: error.code,
        message: error.message,
        timestamp
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    return { totalErrors: total, byCode, recentErrors: recent };
  }

  /**
   * Reset error statistics
   */
  resetStats(): void {
    this.errorCounts.clear();
    this.lastErrors.clear();
  }

  /**
   * Get the circuit breaker state
   */
  getCircuitBreakerState() {
    return this.options.circuitBreaker.getState();
  }

  /**
   * Reset the circuit breaker
   */
  resetCircuitBreaker(): void {
    this.options.circuitBreaker.reset();
  }
}

/**
 * Global error handler instance
 */
let globalErrorHandler: ErrorHandler | null = null;

/**
 * Get or create the global error handler
 */
export function getErrorHandler(options?: ErrorHandlerOptions): ErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new ErrorHandler(options);
  }
  return globalErrorHandler;
}

/**
 * Handle an error using the global error handler
 */
export async function handleError(
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  const handler = getErrorHandler();
  await handler.handle(error, context);
}

/**
 * Handle an error and return a fallback value
 */
export async function handleWithFallback<T>(
  error: unknown,
  fallback: T,
  context?: Record<string, unknown>
): Promise<T> {
  const handler = getErrorHandler();
  return handler.handleWithFallback(error, fallback, context);
}

/**
 * Safe execution wrapper
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  fallback: T,
  context?: Record<string, unknown>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return handleWithFallback(error, fallback, context);
  }
}

/**
 * Safe execution with retry
 */
export async function safeExecuteWithRetry<T>(
  fn: () => Promise<T>,
  fallback: T,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    context?: Record<string, unknown>;
  } = {}
): Promise<T> {
  try {
    return await retry(fn, {
      maxAttempts: options.maxAttempts ?? 3,
      initialDelay: options.initialDelay ?? 1000
    });
  } catch (error) {
    return handleWithFallback(error, fallback, options.context);
  }
}

/**
 * Safe execution with circuit breaker
 */
export async function safeExecuteWithCircuitBreaker<T>(
  fn: () => Promise<T>,
  fallback: T,
  context?: Record<string, unknown>
): Promise<T> {
  const handler = getErrorHandler();
  const cb = handler.getCircuitBreakerState();

  try {
    return await handler.options.circuitBreaker.execute(fn);
  } catch (error) {
    return handleWithFallback(error, fallback, context);
  }
}
