import { ClixError, ERROR_CODES, type ErrorCode } from '../errors/types';

/**
 * Auth-specific error codes.
 */
export const AUTH_ERROR_CODES = {
  DEVICE_CODE_FAILED: ERROR_CODES.AUTH_DEVICE_CODE_FAILED,
  POLL_FAILED: ERROR_CODES.AUTH_POLL_FAILED,
  TOKEN_EXPIRED: ERROR_CODES.AUTH_TOKEN_EXPIRED,
  ACCESS_DENIED: ERROR_CODES.AUTH_ACCESS_DENIED,
  TIMEOUT: ERROR_CODES.AUTH_TIMEOUT,
  NOT_LOGGED_IN: ERROR_CODES.AUTH_NOT_LOGGED_IN,
  CREDENTIALS_INVALID: ERROR_CODES.AUTH_CREDENTIALS_INVALID,
  REFRESH_FAILED: ERROR_CODES.AUTH_REFRESH_FAILED,
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/**
 * Error class for authentication-related failures.
 */
export class AuthError extends ClixError {
  constructor(message: string, code: AuthErrorCode, context?: Record<string, unknown>) {
    super(message, code as ErrorCode, true, context);
    this.name = 'AuthError';
  }

  /**
   * Create an error for device code request failure.
   */
  static deviceCodeFailed(message: string, cause?: Error): AuthError {
    return new AuthError(message, AUTH_ERROR_CODES.DEVICE_CODE_FAILED, {
      cause: cause?.message,
    });
  }

  /**
   * Create an error for polling failure.
   */
  static pollFailed(message: string, cause?: Error): AuthError {
    return new AuthError(message, AUTH_ERROR_CODES.POLL_FAILED, {
      cause: cause?.message,
    });
  }

  /**
   * Create an error for expired token/session.
   */
  static tokenExpired(
    message = 'Session expired. Please run "clix login" to re-authenticate.',
  ): AuthError {
    return new AuthError(message, AUTH_ERROR_CODES.TOKEN_EXPIRED);
  }

  /**
   * Create an error for access denied by user.
   */
  static accessDenied(message = 'Authorization denied by user.'): AuthError {
    return new AuthError(message, AUTH_ERROR_CODES.ACCESS_DENIED);
  }

  /**
   * Create an error for authorization timeout.
   */
  static timeout(message = 'Authorization timed out. Please try again.'): AuthError {
    return new AuthError(message, AUTH_ERROR_CODES.TIMEOUT);
  }

  /**
   * Create an error for not logged in state.
   */
  static notLoggedIn(message = 'Not logged in. Run "clix login" to authenticate.'): AuthError {
    return new AuthError(message, AUTH_ERROR_CODES.NOT_LOGGED_IN);
  }

  /**
   * Create an error for invalid credentials.
   */
  static credentialsInvalid(
    message = 'Invalid credentials. Please run "clix login" again.',
  ): AuthError {
    return new AuthError(message, AUTH_ERROR_CODES.CREDENTIALS_INVALID);
  }

  /**
   * Create an error for token refresh failure.
   */
  static refreshFailed(message: string, cause?: Error): AuthError {
    return new AuthError(message, AUTH_ERROR_CODES.REFRESH_FAILED, {
      cause: cause?.message,
    });
  }
}
