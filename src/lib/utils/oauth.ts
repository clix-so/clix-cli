/**
 * Shared OAuth utilities for PKCE and callback server.
 *
 * Used by both Auth0 authentication and Firebase OAuth flows.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';

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
  path: '/oauth/callback',
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
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
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
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

      const timeout = setTimeout(() => {
        this.stop();
        reject(new Error('OAuth callback timeout'));
      }, this.options.timeoutMs);

      this.server.on('request', (req, res) => {
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
          const errorMsg = errorDescription || error;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.options.errorHtml(errorMsg));
          clearTimeout(timeout);
          this.stop();
          reject(new Error(`OAuth error: ${errorMsg}`));
          return;
        }

        // Validate state for CSRF protection
        if (this.options.expectedState && state !== this.options.expectedState) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.options.errorHtml('Invalid OAuth state'));
          clearTimeout(timeout);
          this.stop();
          reject(new Error('OAuth state mismatch'));
          return;
        }

        // Validate code presence
        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.options.errorHtml('No authorization code received'));
          clearTimeout(timeout);
          this.stop();
          reject(new Error('No authorization code received'));
          return;
        }

        // Success
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.options.successHtml);
        clearTimeout(timeout);
        this.stop();
        resolve({ code, state });
      });
    });
  }

  /**
   * Stop the callback server.
   */
  stop(): void {
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
}
