/**
 * Centralized error messages for consistent user-facing errors.
 * Use template functions for messages that require dynamic values.
 */
export const ERROR_MESSAGES = {
  // Agent errors
  AGENT_NOT_FOUND: (name: string) =>
    `Agent "${name}" not found. Use /agent to see available agents.`,
  AGENT_NOT_AVAILABLE: (name: string, url: string) =>
    `Agent "${name}" is not installed. Install it from: ${url}`,
  AGENT_INITIALIZATION_FAILED: (name: string) =>
    `Failed to initialize agent "${name}". Please try again.`,
  AGENT_EXECUTION_FAILED: (name: string) =>
    `Agent "${name}" encountered an error while processing your request.`,
  NO_AGENT_CONFIGURED: 'No agent configured. Please run "clix config" to select an agent.',

  // Config errors
  CONFIG_LOAD_FAILED: 'Failed to load configuration. Using defaults.',
  CONFIG_SAVE_FAILED: 'Failed to save configuration.',
  CONFIG_INVALID: 'Invalid configuration file. Please check ~/.config/clix/config.json.',
  CONFIG_INVALID_VALUE: (key: string, value: unknown) =>
    `Invalid value for ${key}: ${JSON.stringify(value)}`,
  CONFIG_MIGRATION_FAILED: 'Failed to migrate configuration to new version.',

  // Network errors
  NETWORK_TIMEOUT: 'Request timed out. Please check your connection.',
  NETWORK_UNAVAILABLE: 'Network unavailable. Please check your connection.',
  NETWORK_ERROR: (url?: string) =>
    url ? `Network error while connecting to ${url}.` : 'Network error occurred.',

  // Validation errors
  INVALID_INPUT: (field: string) => `Invalid input for ${field}.`,
  REQUIRED_FIELD: (field: string) => `${field} is required.`,

  // Command errors
  UNKNOWN_COMMAND: (cmd: string) => `Unknown command: /${cmd}. Type /help for available commands.`,
  INVALID_ARGUMENTS: (cmd: string) => `Invalid arguments for /${cmd}. Type /help ${cmd} for usage.`,

  // Session errors
  SESSION_EXPIRED: 'Session has expired. Please start a new conversation.',
  SESSION_TRANSFER_FAILED: (target: string) =>
    `Failed to transfer session to ${target}. Please try again.`,

  // Tool errors
  TOOL_NOT_FOUND: (name: string) => `Tool "${name}" not found.`,
  TOOL_EXECUTION_FAILED: (name: string) => `Tool "${name}" failed to execute.`,

  // General errors
  OPERATION_CANCELLED: 'Operation cancelled.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
  INTERNAL_ERROR: 'Internal error. Please report this issue.',
} as const;

/**
 * Get a user-friendly error message from an Error object.
 * Falls back to generic message if the error is not recognized.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check if it's a known error with a message
    if (error.message) {
      return error.message;
    }
  }
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Check if an error is a network error based on common indicators.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('enotfound')
    );
  }
  return false;
}

/**
 * Check if an error is a timeout error.
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || message.includes('etimedout');
  }
  return false;
}
