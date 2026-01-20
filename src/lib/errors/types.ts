/**
 * Error codes for categorizing errors.
 */
export const ERROR_CODES = {
  // Agent errors
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_NOT_AVAILABLE: 'AGENT_NOT_AVAILABLE',
  AGENT_INITIALIZATION_FAILED: 'AGENT_INITIALIZATION_FAILED',
  AGENT_EXECUTION_FAILED: 'AGENT_EXECUTION_FAILED',

  // Configuration errors
  CONFIG_LOAD_FAILED: 'CONFIG_LOAD_FAILED',
  CONFIG_SAVE_FAILED: 'CONFIG_SAVE_FAILED',
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_MIGRATION_FAILED: 'CONFIG_MIGRATION_FAILED',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_UNAVAILABLE: 'NETWORK_UNAVAILABLE',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Tool errors
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',

  // Session errors
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_TRANSFER_FAILED: 'SESSION_TRANSFER_FAILED',

  // General errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Base error class for all Clix errors.
 * Provides error code, recoverability flag, and additional context.
 */
export class ClixError extends Error {
  public readonly code: ErrorCode;
  public readonly recoverable: boolean;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode,
    recoverable = true,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ClixError';
    this.code = code;
    this.recoverable = recoverable;
    this.context = context;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ClixError);
    }
  }

  /**
   * Create a JSON representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Error for agent-related failures.
 */
export class AgentError extends ClixError {
  public readonly agentName: string;

  constructor(message: string, agentName: string, code?: ErrorCode, cause?: Error) {
    super(message, code ?? ERROR_CODES.AGENT_EXECUTION_FAILED, true, {
      agentName,
      cause: cause?.message,
    });
    this.name = 'AgentError';
    this.agentName = agentName;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Error for configuration-related failures.
 */
export class ConfigError extends ClixError {
  public readonly configKey?: string;

  constructor(message: string, code?: ErrorCode, configKey?: string) {
    super(message, code ?? ERROR_CODES.CONFIG_INVALID, true, { configKey });
    this.name = 'ConfigError';
    this.configKey = configKey;
  }
}

/**
 * Error for network-related failures.
 */
export class NetworkError extends ClixError {
  public readonly url?: string;
  public readonly statusCode?: number;

  constructor(message: string, url?: string, statusCode?: number) {
    super(message, ERROR_CODES.NETWORK_ERROR, true, { url, statusCode });
    this.name = 'NetworkError';
    this.url = url;
    this.statusCode = statusCode;
  }
}

/**
 * Error for validation failures.
 */
export class ValidationError extends ClixError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown) {
    super(message, ERROR_CODES.VALIDATION_ERROR, true, { field, value });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Error for tool execution failures.
 */
export class ToolError extends ClixError {
  public readonly toolName: string;

  constructor(message: string, toolName: string, cause?: Error) {
    super(message, ERROR_CODES.TOOL_EXECUTION_FAILED, true, {
      toolName,
      cause: cause?.message,
    });
    this.name = 'ToolError';
    this.toolName = toolName;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Error for session-related failures.
 */
export class SessionError extends ClixError {
  public readonly sessionId?: string;

  constructor(message: string, code?: ErrorCode, sessionId?: string) {
    super(message, code ?? ERROR_CODES.SESSION_EXPIRED, true, { sessionId });
    this.name = 'SessionError';
    this.sessionId = sessionId;
  }
}
