/**
 * Debug logging utility for development and troubleshooting.
 *
 * Enable debug logging by setting the DEBUG environment variable:
 * - DEBUG=true (or 1, yes) - enable all debug output
 * - DEBUG=agent - enable agent-related debug output
 * - DEBUG=config - enable config-related debug output
 * - DEBUG=* - enable all debug output
 *
 * Debug logs are also written to `.clix/debug.log` file (npm-style).
 *
 * @example
 * ```typescript
 * import { logger } from '../debug/logger';
 *
 * logger.debug('Processing message', { messageId: '123' });
 * logger.info('Agent initialized', { agent: 'claude' });
 * logger.warn('Slow response detected', { duration: 5000 });
 * logger.error('Failed to execute', { error: err.message });
 * ```
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

/**
 * Log entry structure for structured logging.
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  namespace: string;
  message: string;
  context?: LogContext;
}

/**
 * Check if debug mode is enabled.
 */
function isDebugEnabled(namespace?: string): boolean {
  const debugEnv = process.env.DEBUG;

  if (!debugEnv) {
    return false;
  }

  const debugValue = debugEnv.toLowerCase();

  // Enable all debug logging
  if (debugValue === 'true' || debugValue === '1' || debugValue === 'yes' || debugValue === '*') {
    return true;
  }

  // Check namespace match
  if (namespace && debugValue.includes(namespace)) {
    return true;
  }

  return false;
}

/**
 * Format log entry for console output.
 */
function formatLogEntry(entry: LogEntry): string {
  const { timestamp, level, namespace, message, context } = entry;
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${namespace}]`;

  if (context && Object.keys(context).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(context)}`;
  }

  return `${prefix} ${message}`;
}

/**
 * Logger class for structured debug logging.
 */
export class Logger {
  private namespace: string;

  constructor(namespace = 'clix') {
    this.namespace = namespace;
  }

  /**
   * Create a child logger with a specific namespace.
   */
  child(namespace: string): Logger {
    return new Logger(`${this.namespace}:${namespace}`);
  }

  /**
   * Log a debug message.
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Log an info message.
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Log an error message.
   */
  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  /**
   * Internal log method.
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    // Always log errors and warnings, debug/info only when enabled
    if (level !== 'error' && level !== 'warn' && !isDebugEnabled(this.namespace)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      namespace: this.namespace,
      message,
      context,
    };

    const formatted = formatLogEntry(entry);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      default:
        console.log(formatted);
        break;
    }
  }

  /**
   * Check if debug mode is enabled for this logger's namespace.
   */
  isEnabled(): boolean {
    return isDebugEnabled(this.namespace);
  }

  /**
   * Time an async operation and log the duration.
   */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!this.isEnabled()) {
      return fn();
    }

    const start = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      this.debug(`${label} completed`, { duration: `${duration}ms` });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(`${label} failed`, {
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Write debug info to .clix/debug.log file (npm-style).
   * Always writes regardless of DEBUG environment variable.
   *
   * @param message - Log message
   * @param data - Additional data to log
   * @param projectRoot - Project root directory (optional, uses cwd if not provided)
   */
  writeToFile(message: string, data?: unknown, projectRoot?: string): void {
    // Try multiple locations to ensure logging works
    const locations = [
      projectRoot,
      process.cwd(),
      process.env.HOME ? join(process.env.HOME, '.clix') : null,
    ].filter((loc): loc is string => loc !== null && loc !== undefined);

    for (const root of locations) {
      try {
        const clixDir = root.endsWith('.clix') ? root : join(root, '.clix');
        const logFile = join(clixDir, 'debug.log');

        mkdirSync(clixDir, { recursive: true });

        const timestamp = new Date().toISOString();
        const line = `${timestamp} ${this.namespace} ${message}${data !== undefined ? ` ${JSON.stringify(data)}` : ''}\n`;
        appendFileSync(logFile, line);
        return; // Success, exit loop
      } catch {
        // Try next location
      }
    }
    // All locations failed, log to stderr as last resort
    console.error(`[${this.namespace}] ${message}`, data !== undefined ? JSON.stringify(data) : '');
  }
}

/**
 * Default logger instance.
 */
export const logger = new Logger('clix');

/**
 * Create a namespaced logger.
 */
export function createLogger(namespace: string): Logger {
  return new Logger(namespace);
}

/**
 * OAuth logger for debugging authentication flows.
 */
export const oauthLogger = createLogger('oauth');
