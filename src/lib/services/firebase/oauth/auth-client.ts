/**
 * Google OAuth client for Firebase authentication.
 *
 * Uses google-auth-library for OAuth 2.0 with PKCE support.
 *
 * @module services/firebase/oauth/auth-client
 */

import crypto from 'node:crypto';
import http from 'node:http';
import { URL } from 'node:url';
import { type CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { GOOGLE_OAUTH_CONFIG, isOAuthConfigured } from './config';
import { TokenStore } from './token-store';
import type { AuthResult, OAuthCallbackResult, OAuthTokens } from './types';

/**
 * Generate a cryptographically random code verifier for PKCE.
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a code challenge from the verifier for PKCE.
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Google OAuth client for CLI authentication.
 */
export class GoogleAuthClient {
  private client: OAuth2Client;
  private tokenStore: TokenStore;
  private codeVerifier: string | null = null;
  private oauthState: string | null = null;

  constructor() {
    this.client = new OAuth2Client({
      clientId: GOOGLE_OAUTH_CONFIG.clientId,
      redirectUri: GOOGLE_OAUTH_CONFIG.redirectUri,
    });
    this.tokenStore = new TokenStore();
  }

  /**
   * Check if OAuth is configured.
   */
  isConfigured(): boolean {
    return isOAuthConfigured();
  }

  /**
   * Check if user is already authenticated with valid tokens.
   */
  async isAuthenticated(): Promise<boolean> {
    const tokens = await this.tokenStore.load();
    if (!tokens) return false;

    // If we have a refresh token, we can always refresh
    if (this.tokenStore.hasRefreshToken(tokens)) {
      return true;
    }

    // Otherwise check if access token is still valid
    return !this.tokenStore.isExpired(tokens);
  }

  /**
   * Generate authorization URL for browser-based authentication.
   *
   * @returns Authorization URL to open in browser
   */
  generateAuthUrl(): string {
    // Generate PKCE code verifier and challenge
    this.codeVerifier = generateCodeVerifier();
    this.oauthState = crypto.randomBytes(16).toString('hex');
    const codeChallenge = generateCodeChallenge(this.codeVerifier);

    const url = this.client.generateAuthUrl({
      access_type: 'offline',
      scope: [...GOOGLE_OAUTH_CONFIG.scopes],
      code_challenge_method: 'S256' as CodeChallengeMethod,
      code_challenge: codeChallenge,
      state: this.oauthState,
      prompt: 'consent', // Always show consent to get refresh token
    });

    return url;
  }

  /**
   * Wait for OAuth callback on local HTTP server.
   *
   * @returns Promise resolving to callback result with authorization code
   */
  waitForCallback(): Promise<OAuthCallbackResult> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${GOOGLE_OAUTH_CONFIG.callbackPort}`);

        if (url.pathname === '/oauth/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state') || '';
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                  <h1>❌ Authentication Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            cleanup();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          // Validate OAuth state to prevent CSRF attacks
          if (!this.oauthState || state !== this.oauthState) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                  <h1>❌ Authentication Failed</h1>
                  <p>Invalid OAuth state.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            cleanup();
            reject(new Error('OAuth state mismatch'));
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                  <h1>❌ Authentication Failed</h1>
                  <p>No authorization code received.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            cleanup();
            reject(new Error('No authorization code received'));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1>✅ Authentication Successful</h1>
                <p>You can close this window and return to the CLI.</p>
              </body>
            </html>
          `);
          cleanup();
          this.oauthState = null;
          resolve({ code, state });
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('OAuth callback timeout'));
      }, GOOGLE_OAUTH_CONFIG.timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        server.close();
      };

      // Bind to localhost only for security
      server.listen(GOOGLE_OAUTH_CONFIG.callbackPort, '127.0.0.1');

      server.on('error', (err) => {
        cleanup();
        reject(new Error(`Failed to start OAuth callback server: ${err.message}`));
      });
    });
  }

  /**
   * Exchange authorization code for tokens.
   *
   * @param code - Authorization code from callback
   */
  async exchangeCode(code: string): Promise<void> {
    if (!this.codeVerifier) {
      throw new Error('PKCE code verifier not found. Call generateAuthUrl() first.');
    }

    const { tokens } = await this.client.getToken({
      code,
      codeVerifier: this.codeVerifier,
      redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
    });

    this.client.setCredentials(tokens);
    await this.tokenStore.save(tokens as OAuthTokens);
    this.codeVerifier = null;
  }

  /**
   * Get access token for API calls.
   * Automatically refreshes if expired.
   *
   * @returns Access token string
   */
  async getAccessToken(): Promise<string> {
    const tokens = await this.tokenStore.load();

    if (!tokens) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }

    this.client.setCredentials(tokens);

    // google-auth-library automatically refreshes expired tokens
    const { token } = await this.client.getAccessToken();

    if (!token) {
      throw new Error('Failed to get access token');
    }

    // Save potentially refreshed tokens
    const credentials = this.client.credentials;
    if (credentials.access_token !== tokens.access_token) {
      await this.tokenStore.save(credentials as OAuthTokens);
    }

    return token;
  }

  /**
   * Run the full OAuth authentication flow.
   *
   * @param openBrowser - Callback to open URL in browser
   * @returns Authentication result
   */
  async authenticate(openBrowser: (url: string) => void): Promise<AuthResult> {
    try {
      const authUrl = this.generateAuthUrl();
      openBrowser(authUrl);

      const { code } = await this.waitForCallback();
      await this.exchangeCode(code);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Clear stored tokens (logout).
   */
  async logout(): Promise<void> {
    await this.tokenStore.clear();
    this.client.setCredentials({});
  }
}
