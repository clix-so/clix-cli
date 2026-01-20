import { coreEvents } from '../events/core-events';
import { ERROR_MESSAGES, isNetworkError, isTimeoutError } from './messages';
import { ClixError, ERROR_CODES } from './types';

/**
 * Options for error handling.
 */
export interface HandleErrorOptions {
  /** Context string for logging */
  context?: string;
  /** Whether to emit events */
  emitEvents?: boolean;
  /** Whether to log to console */
  log?: boolean;
  /** Whether to rethrow the error */
  rethrow?: boolean;
}

/**
 * Result of error handling.
 */
export interface HandleErrorResult {
  /** The processed error (may be wrapped) */
  error: ClixError;
  /** User-friendly message */
  message: string;
  /** Whether the error is recoverable */
  recoverable: boolean;
}

/**
 * Handle an error and convert it to a ClixError if needed.
 * Emits events, logs, and optionally rethrows.
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   const { error: clixError, message } = handleError(error, {
 *     context: 'riskyOperation',
 *     log: true,
 *   });
 *   // Show message to user
 * }
 * ```
 */
export function handleError(error: unknown, options: HandleErrorOptions = {}): HandleErrorResult {
  const { context, emitEvents = true, log = false, rethrow = false } = options;

  // Convert to ClixError if needed
  const clixError = toClixError(error);

  // Get user-friendly message
  const message = getUserMessage(clixError);

  // Log if requested
  if (log) {
    logError(clixError, context);
  }

  // Emit event if requested
  if (emitEvents) {
    coreEvents.emit('error:fatal', {
      error: clixError,
      context,
      recoverable: clixError.recoverable,
    });
  }

  // Rethrow if requested
  if (rethrow) {
    throw clixError;
  }

  return {
    error: clixError,
    message,
    recoverable: clixError.recoverable,
  };
}

/**
 * Convert any error to a ClixError.
 */
export function toClixError(error: unknown): ClixError {
  // Already a ClixError
  if (error instanceof ClixError) {
    return error;
  }

  // Standard Error
  if (error instanceof Error) {
    // Detect error type from message
    if (isNetworkError(error)) {
      return new ClixError(
        error.message,
        isTimeoutError(error) ? ERROR_CODES.NETWORK_TIMEOUT : ERROR_CODES.NETWORK_ERROR,
        true,
        { originalError: error.name },
      );
    }

    return new ClixError(error.message, ERROR_CODES.UNKNOWN_ERROR, true, {
      originalError: error.name,
    });
  }

  // String error
  if (typeof error === 'string') {
    return new ClixError(error, ERROR_CODES.UNKNOWN_ERROR, true);
  }

  // Unknown error type
  return new ClixError(ERROR_MESSAGES.UNKNOWN_ERROR, ERROR_CODES.UNKNOWN_ERROR, false);
}

/**
 * Get a user-friendly message for an error.
 */
export function getUserMessage(error: ClixError): string {
  // Use the error's message if it's user-friendly
  if (error.message && !error.message.includes('Error:')) {
    return error.message;
  }

  // Fall back to generic messages based on code
  switch (error.code) {
    case ERROR_CODES.NETWORK_TIMEOUT:
      return ERROR_MESSAGES.NETWORK_TIMEOUT;
    case ERROR_CODES.NETWORK_ERROR:
    case ERROR_CODES.NETWORK_UNAVAILABLE:
      return ERROR_MESSAGES.NETWORK_UNAVAILABLE;
    case ERROR_CODES.CONFIG_LOAD_FAILED:
      return ERROR_MESSAGES.CONFIG_LOAD_FAILED;
    case ERROR_CODES.CONFIG_INVALID:
      return ERROR_MESSAGES.CONFIG_INVALID;
    case ERROR_CODES.OPERATION_CANCELLED:
      return ERROR_MESSAGES.OPERATION_CANCELLED;
    default:
      return error.message || ERROR_MESSAGES.UNKNOWN_ERROR;
  }
}

/**
 * Log an error to console (only in debug mode by default).
 */
export function logError(error: ClixError, context?: string): void {
  const isDebug = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

  if (isDebug) {
    const prefix = context ? `[${error.code}] [${context}]` : `[${error.code}]`;
    console.error(prefix, error.message);
    if (error.context) {
      console.error('  Context:', JSON.stringify(error.context, null, 2));
    }
    if (error.stack) {
      console.error('  Stack:', error.stack);
    }
  }
}

/**
 * Create an error handler for a specific context.
 * Useful for wrapping async operations.
 *
 * @example
 * ```typescript
 * const handleAgentError = createErrorHandler('agent');
 *
 * try {
 *   await agent.execute(prompt);
 * } catch (error) {
 *   const result = handleAgentError(error);
 *   showError(result.message);
 * }
 * ```
 */
export function createErrorHandler(
  context: string,
  defaultOptions: Omit<HandleErrorOptions, 'context'> = {},
) {
  return (error: unknown, options: HandleErrorOptions = {}): HandleErrorResult => {
    return handleError(error, { ...defaultOptions, ...options, context });
  };
}
