/**
 * Centralized error handling system.
 *
 * @module errors
 */

// Error handler
export {
  createErrorHandler,
  getUserMessage,
  type HandleErrorOptions,
  type HandleErrorResult,
  handleError,
  logError,
  toClixError,
} from './handler';

// Error messages
export {
  ERROR_MESSAGES,
  getErrorMessage,
  isNetworkError,
  isTimeoutError,
} from './messages';
// Error types
export {
  AgentError,
  ClixError,
  ConfigError,
  ERROR_CODES,
  type ErrorCode,
  NetworkError,
  SessionError,
  ToolError,
  ValidationError,
} from './types';
