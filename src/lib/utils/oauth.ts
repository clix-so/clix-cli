/**
 * Shared OAuth utilities for PKCE and callback server.
 *
 * Used by both Auth0 authentication and Firebase OAuth flows.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { oauthLogger } from '@/lib/debug/logger';
import { findProjectRoot } from './path';

// ============================================================================
// Shared OAuth Callback Configuration
// ============================================================================

/**
 * Unified OAuth callback configuration.
 * All OAuth flows (Auth0, Firebase/Google) use these settings.
 *
 * See CLAUDE.md "OAuth Callback URL Convention" for details.
 */
export const OAUTH_CALLBACK_CONFIG = {
  /** Fixed port for OAuth callback server */
  port: 9005,
  /** Callback path */
  path: '/auth/callback',
  /** Timeout in milliseconds (5 minutes) */
  timeoutMs: 5 * 60 * 1000,
  /** Get full callback URL with localhost */
  getCallbackUrl: () =>
    `http://localhost:${OAUTH_CALLBACK_CONFIG.port}${OAUTH_CALLBACK_CONFIG.path}`,
  /** Get full callback URL with 127.0.0.1 (required by some OAuth providers like Google) */
  getCallbackUrlIp: () =>
    `http://127.0.0.1:${OAUTH_CALLBACK_CONFIG.port}${OAUTH_CALLBACK_CONFIG.path}`,
} as const;

/**
 * Result from OAuth callback.
 */
export interface OAuthCallbackResult {
  code: string;
  state: string;
}

/**
 * Options for the OAuth callback server.
 */
export interface CallbackServerOptions {
  /** Port to listen on (0 for random available port) */
  port?: number;
  /** Callback path to listen on */
  callbackPath?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Expected state for CSRF validation */
  expectedState?: string;
  /** Custom success HTML */
  successHtml?: string;
  /** Custom error HTML generator */
  errorHtml?: (message: string) => string;
}

// ============================================================================
// PKCE Utilities
// ============================================================================

/**
 * Generate a cryptographically random code verifier for PKCE.
 * Creates a 43-128 character URL-safe string.
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate a code challenge from the verifier using SHA256.
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Generate a random state parameter for CSRF protection.
 */
export function generateState(): string {
  return randomBytes(16).toString('base64url');
}

// ============================================================================
// HTML Templates
// ============================================================================

const DEFAULT_SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #000000;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(255,255,255,0.1);
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { color: #333; margin: 0 0 10px; }
    p { color: #666; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✓</div>
    <h1>Authentication Successful</h1>
    <p>You can close this window and return to the terminal.</p>
  </div>
</body>
</html>`;

function defaultErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #000000;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(255,255,255,0.1);
    }
    .icon { font-size: 64px; margin-bottom: 20px; color: #f5576c; }
    h1 { color: #333; margin: 0 0 10px; }
    p { color: #666; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✗</div>
    <h1>Authentication Failed</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

// ============================================================================
// OAuth Callback Server
// ============================================================================

/**
 * OAuth callback server for handling browser redirects.
 *
 * @example
 * ```typescript
 * const server = new OAuthCallbackServer({
 *   port: OAUTH_CALLBACK_CONFIG.port,
 *   callbackPath: OAUTH_CALLBACK_CONFIG.path,
 *   timeoutMs: OAUTH_CALLBACK_CONFIG.timeoutMs,
 *   expectedState: state,
 * });
 *
 * await server.start();
 * // Open browser to auth URL with redirect_uri from OAUTH_CALLBACK_CONFIG.getCallbackUrl()
 *
 * const { code } = await server.waitForCallback();
 * ```
 */
export class OAuthCallbackServer {
  private server: Server | null = null;
  private options: Required<CallbackServerOptions>;
  private actualPort: number = 0;
  private pendingCallback: {
    resolve: (result: OAuthCallbackResult) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
    requestHandler: (req: IncomingMessage, res: ServerResponse) => void;
  } | null = null;

  constructor(options: CallbackServerOptions = {}) {
    this.options = {
      port: options.port ?? OAUTH_CALLBACK_CONFIG.port,
      callbackPath: options.callbackPath ?? OAUTH_CALLBACK_CONFIG.path,
      timeoutMs: options.timeoutMs ?? OAUTH_CALLBACK_CONFIG.timeoutMs,
      expectedState: options.expectedState ?? '',
      successHtml: options.successHtml ?? DEFAULT_SUCCESS_HTML,
      errorHtml: options.errorHtml ?? defaultErrorHtml,
    };
  }

  /**
   * Start the callback server.
   *
   * @returns The port the server is listening on
   */
  start(): Promise<{ port: number }> {
    return new Promise((resolve, reject) => {
      this.server = createServer();

      this.server.on('error', (err) => {
        reject(new Error(`Failed to start OAuth callback server: ${err.message}`));
      });

      this.server.listen(this.options.port, '127.0.0.1', () => {
        const address = this.server?.address();
        if (typeof address === 'object' && address !== null) {
          this.actualPort = address.port;
          resolve({ port: address.port });
        } else {
          reject(new Error('Failed to get server port'));
        }
      });
    });
  }

  /**
   * Wait for OAuth callback with authorization code.
   *
   * @returns Authorization code and state from callback
   */
  waitForCallback(): Promise<OAuthCallbackResult> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('OAuth callback server not started'));
        return;
      }

      if (this.pendingCallback) {
        reject(new Error('OAuth callback already in progress'));
        return;
      }

      const timeout = setTimeout(() => {
        this.rejectPendingCallback(new Error('OAuth callback timeout'));
        this.stop();
      }, this.options.timeoutMs);

      const requestHandler = (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', `http://localhost:${this.actualPort}`);

        if (url.pathname !== this.options.callbackPath) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }

        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state') || '';
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        // Handle OAuth error
        if (error) {
          const errorMsg = errorDescription ? `${error}: ${errorDescription}` : error;

          // Write debug info to .clix/debug.log
          oauthLogger.writeToFile(
            'OAuth callback error',
            {
              type: 'oauth_callback_error',
              error,
              error_description: errorDescription,
              full_url: req.url,
              all_params: Object.fromEntries(url.searchParams.entries()),
            },
            findProjectRoot(),
          );

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.options.errorHtml(errorMsg));
          this.rejectPendingCallback(new Error(errorMsg));
          this.stop();
          return;
        }

        // Validate state for CSRF protection
        if (this.options.expectedState && state !== this.options.expectedState) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.options.errorHtml('Invalid OAuth state'));
          this.rejectPendingCallback(new Error('OAuth state mismatch'));
          this.stop();
          return;
        }

        // Validate code presence
        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.options.errorHtml('No authorization code received'));
          this.rejectPendingCallback(new Error('No authorization code received'));
          this.stop();
          return;
        }

        // Success
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.options.successHtml);
        this.resolvePendingCallback({ code, state });
        this.stop();
      };

      this.pendingCallback = {
        resolve,
        reject: (error: Error) => reject(error),
        timeout,
        requestHandler,
      };

      this.server.on('request', requestHandler);
    });
  }

  /**
   * Cancel waiting for OAuth callback.
   */
  cancel(reason = 'OAuth authentication cancelled'): void {
    this.rejectPendingCallback(new Error(reason));
    this.stop();
  }

  /**
   * Stop the callback server.
   */
  stop(): void {
    this.clearPendingCallback();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Get the actual port the server is listening on.
   */
  getPort(): number {
    return this.actualPort;
  }

  private clearPendingCallback(): void {
    if (!this.pendingCallback) {
      return;
    }

    clearTimeout(this.pendingCallback.timeout);
    this.server?.off('request', this.pendingCallback.requestHandler);
    this.pendingCallback = null;
  }

  private rejectPendingCallback(error: Error): void {
    if (!this.pendingCallback) {
      return;
    }

    const { reject } = this.pendingCallback;
    this.clearPendingCallback();
    reject(error);
  }

  private resolvePendingCallback(result: OAuthCallbackResult): void {
    if (!this.pendingCallback) {
      return;
    }

    const { resolve } = this.pendingCallback;
    this.clearPendingCallback();
    resolve(result);
  }
}
