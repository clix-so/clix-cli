/**
 * Async test utilities for handling promises, generators, and timing.
 */

/**
 * Collect all items from an async generator into an array.
 *
 * @example
 * ```typescript
 * const results = await collectAsyncGenerator(myAsyncGenerator());
 * expect(results).toHaveLength(3);
 * ```
 */
export async function collectAsyncGenerator<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of generator) {
    results.push(item);
  }
  return results;
}

/**
 * Deferred promise with external resolve/reject controls.
 * Useful for controlling when a promise resolves in tests.
 *
 * @example
 * ```typescript
 * const deferred = createDeferred<string>();
 * someAsyncFunction(deferred.promise);
 * deferred.resolve('result');
 * ```
 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Retry options for the retry function.
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Delay between attempts in ms (default: 100) */
  delay?: number;
  /** Exponential backoff factor (default: 1) */
  backoff?: number;
}

/**
 * Retry a function until it succeeds or max attempts reached.
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   () => fetchUnstableApi(),
 *   { maxAttempts: 3, delay: 100 }
 * );
 * ```
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, delay = 100, backoff = 1 } = options;

  let lastError: unknown;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(currentDelay);
        currentDelay *= backoff;
      }
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified duration.
 *
 * @example
 * ```typescript
 * await sleep(100);
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to become true.
 *
 * @example
 * ```typescript
 * await waitFor(() => element.isVisible, { timeout: 5000 });
 * ```
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for an event to be emitted.
 *
 * @example
 * ```typescript
 * const event = await waitForEvent(emitter, 'data', { timeout: 1000 });
 * ```
 */
export async function waitForEvent<T>(
  emitter: { once: (event: string, listener: (data: T) => void) => void },
  eventName: string,
  options: { timeout?: number } = {},
): Promise<T> {
  const { timeout = 5000 } = options;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Event "${eventName}" not received within ${timeout}ms`));
    }, timeout);

    emitter.once(eventName, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Run a function with a timeout.
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   () => slowOperation(),
 *   1000,
 *   'Operation timed out'
 * );
 * ```
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeout: number,
  message = 'Operation timed out',
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), timeout)),
  ]);
}
