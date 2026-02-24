/**
 * Retry Logic with Exponential Backoff
 *
 * Provides automatic retry functionality for transient failures
 */

import { isArgusError } from './index.js';

export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds
   * @default 1000
   */
  initialDelay?: number;

  /**
   * Maximum delay in milliseconds
   * @default 30000
   */
  maxDelay?: number;

  /**
   * Exponential backoff multiplier
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Jitter to add to delay (0-1)
   * @default 0.1
   */
  jitter?: number;

  /**
   * Whether to log retry attempts
   * @default true
   */
  logRetries?: boolean;

  /**
   * Custom function to determine if an error is retryable
   * @default Checks if error is ArgusError with retryable=true
   */
  isRetryable?: (error: unknown) => boolean;

  /**
   * Callback called before each retry attempt
   */
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

/**
 * Default retry options
 */
const defaultRetryOptions: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: 0.1,
  logRetries: true,
  isRetryable: (error: unknown) => {
    return isArgusError(error) && error.retryable;
  },
  onRetry: () => {}
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number,
  jitter: number
): number {
  // Exponential backoff
  const delay = Math.min(
    initialDelay * Math.pow(backoffMultiplier, attempt),
    maxDelay
  );

  // Add jitter to prevent thundering herd
  const jitterAmount = delay * jitter;
  const jitteredDelay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);

  return Math.max(0, jitteredDelay);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - The function to retry
 * @param options - Retry configuration options
 * @returns Promise that resolves with the function result or rejects with the last error
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   async () => await qdrant.getCollections(),
 *   { maxAttempts: 3, initialDelay: 1000 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultRetryOptions, ...options };

  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if this is the last attempt or if error is not retryable
      const isLastAttempt = attempt >= opts.maxAttempts - 1;
      const canRetry = opts.isRetryable(error);

      if (isLastAttempt || !canRetry) {
        throw error;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(
        attempt + 1,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier,
        opts.jitter
      );

      // Log retry attempt
      if (opts.logRetries) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(
          `[ARGUS] Retry attempt ${attempt + 1}/${opts.maxAttempts} after ${Math.round(delay)}ms. Error: ${errorMessage}`
        );
      }

      // Call onRetry callback
      opts.onRetry(attempt + 1, error, delay);

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Create a retried version of a function
 *
 * @param fn - The function to wrap with retry logic
 * @param options - Retry configuration options
 * @returns A new function that will retry on failure
 *
 * @example
 * ```typescript
 * const retriedFetch = retryFn(
 *   async (url: string) => fetch(url),
 *   { maxAttempts: 3 }
 * );
 * await retriedFetch('https://api.example.com');
 * ```
 */
export function retryFn<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    return retry(() => fn(...args), options);
  }) as T;
}

/**
 * Retry with circuit breaker pattern
 *
 * Opens the circuit after consecutive failures, preventing further attempts
 * for a cooldown period. Useful for preventing cascading failures.
 */
export interface CircuitBreakerOptions extends RetryOptions {
  /**
   * Number of consecutive failures before opening the circuit
   * @default 5
   */
  failureThreshold?: number;

  /**
   * Cooldown period in milliseconds before attempting recovery
   * @default 60000 (1 minute)
   */
  cooldownPeriod?: number;

  /**
   * Number of successful attempts required to close the circuit
   * @default 2
   */
  recoveryAttempts?: number;
}

interface CircuitState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: 0,
    successCount: 0
  };

  constructor(private options: CircuitBreakerOptions = {}) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const failureThreshold = this.options.failureThreshold ?? 5;
    const cooldownPeriod = this.options.cooldownPeriod ?? 60000;
    const recoveryAttempts = this.options.recoveryAttempts ?? 2;

    // Check if circuit is open
    if (this.state.isOpen) {
      const timeSinceLastFailure = Date.now() - this.state.lastFailureTime;

      if (timeSinceLastFailure < cooldownPeriod) {
        throw new Error(
          `Circuit breaker is open. Failing fast. Cooldown ends in ${Math.round((cooldownPeriod - timeSinceLastFailure) / 1000)}s`
        );
      }

      // Try to recover
      console.log('[ARGUS] Circuit breaker cooldown period expired, attempting recovery...');
      this.state.isOpen = false;
      this.state.successCount = 0;
    }

    try {
      const result = await fn();

      // Reset failure count on success
      this.state.failureCount = 0;

      // Track successful recovery attempts
      if (this.state.successCount < recoveryAttempts) {
        this.state.successCount++;
        if (this.state.successCount >= recoveryAttempts) {
          console.log('[ARGUS] Circuit breaker fully recovered');
        }
      }

      return result;
    } catch (error) {
      this.state.failureCount++;
      this.state.lastFailureTime = Date.now();

      // Open circuit if threshold reached
      if (this.state.failureCount >= failureThreshold) {
        this.state.isOpen = true;
        console.error(
          `[ARGUS] Circuit breaker opened after ${this.state.failureCount} consecutive failures`
        );
      }

      throw error;
    }
  }

  /**
   * Get the current circuit state
   */
  getState(): CircuitState {
    return { ...this.state };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: 0,
      successCount: 0
    };
    console.log('[ARGUS] Circuit breaker manually reset');
  }

  /**
   * Manually open the circuit breaker
   */
  open(): void {
    this.state.isOpen = true;
    this.state.lastFailureTime = Date.now();
    console.log('[ARGUS] Circuit breaker manually opened');
  }
}

/**
 * Create a circuit breaker with retry logic
 */
export function createCircuitBreaker(
  options: CircuitBreakerOptions = {}
): CircuitBreaker {
  return new CircuitBreaker(options);
}
