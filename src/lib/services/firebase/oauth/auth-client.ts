/**
 * Google OAuth client for Firebase authentication.
 *
 * Implements OAuth 2.0 with PKCE for Desktop/Native apps.
 * Does not use client_secret as per Google's Desktop app OAuth flow.
 *
 * @module services/firebase/oauth/auth-client
 */

import { oauthLogger } from '@/lib/debug/logger';
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  OAUTH_CALLBACK_CONFIG,
  OAuthCallbackServer,
} from '@/lib/utils/oauth';
import { findProjectRoot } from '@/lib/utils/path';
import { GOOGLE_OAUTH_CONFIG, getOAuthCredentials, isOAuthConfigured } from './config';
import { TokenStore } from './token-store';
import type { AuthResult, OAuthCallbackResult, OAuthTokens } from './types';

/**
 * Google OAuth client for CLI authentication.
 * Implements OAuth 2.0 Authorization Code flow with PKCE for Desktop apps.
 */
export class GoogleAuthClient {
  private tokenStore: TokenStore;
  private codeVerifier: string | null = null;
  private oauthState: string | null = null;
  private callbackServer: OAuthCallbackServer | null = null;

  constructor() {
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
   * @throws Error if credentials are not available
   */
  async generateAuthUrl(): Promise<string> {
    // Get credentials from remote or environment
    const credentials = await getOAuthCredentials();
    if (!credentials) {
      throw new Error(
        'OAuth credentials are not available. Check network connection or set environment variables.',
      );
    }
    const { clientId } = credentials;

    // Generate PKCE code verifier and challenge
    this.codeVerifier = generateCodeVerifier();
    this.oauthState = generateState();
    const codeChallenge = generateCodeChallenge(this.codeVerifier);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
      response_type: 'code',
      scope: GOOGLE_OAUTH_CONFIG.scopes.join(' '),
      access_type: 'offline',
      state: this.oauthState,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    });

    const authUrl = `${GOOGLE_OAUTH_CONFIG.authorizationEndpoint}?${params.toString()}`;

    // Always log OAuth request parameters to debug.log
    oauthLogger.writeToFile(
      'OAuth authorization URL generated',
      {
        type: 'auth_url_generated',
        client_id: `${clientId.substring(0, 20)}...`,
        redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
        scopes: GOOGLE_OAUTH_CONFIG.scopes,
        has_code_challenge: !!codeChallenge,
        has_state: !!this.oauthState,
      },
      findProjectRoot(),
    );

    return authUrl;
  }

  /**
   * Wait for OAuth callback on local HTTP server.
   *
   * @returns Promise resolving to callback result with authorization code
   */
  async waitForCallback(): Promise<OAuthCallbackResult> {
    this.callbackServer = new OAuthCallbackServer({
      port: GOOGLE_OAUTH_CONFIG.callbackPort,
      callbackPath: OAUTH_CALLBACK_CONFIG.path,
      timeoutMs: GOOGLE_OAUTH_CONFIG.timeoutMs,
      expectedState: this.oauthState ?? undefined,
    });

    await this.callbackServer.start();

    try {
      const result = await this.callbackServer.waitForCallback();
      return result;
    } finally {
      this.oauthState = null;
      this.callbackServer = null;
    }
  }

  /**
   * Exchange authorization code for tokens.
   * Uses direct HTTP request to Google's token endpoint.
   *
   * @param code - Authorization code from callback
   * @throws Error if credentials are not available
   */
  async exchangeCode(code: string): Promise<void> {
    if (!this.codeVerifier) {
      throw new Error('PKCE code verifier not found. Call generateAuthUrl() first.');
    }

    // Get credentials from remote or environment
    const credentials = await getOAuthCredentials();
    if (!credentials) {
      throw new Error(
        'OAuth credentials are not available. Check network connection or set environment variables.',
      );
    }
    const { clientId, clientSecret } = credentials;

    const params = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: this.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
    });

    // Include client_secret if available (required for Web application OAuth clients)
    if (clientSecret) {
      params.set('client_secret', clientSecret);
    }

    // Debug: Log request details
    if (process.env.DEBUG) {
      console.error('[OAuth Debug] Token exchange request:');
      console.error('  Client ID:', clientId);
      console.error('  Has client_secret:', !!clientSecret);
      console.error('  Has code_verifier:', !!this.codeVerifier);
    }

    const response = await fetch(GOOGLE_OAUTH_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Write debug info to .clix/debug.log
      oauthLogger.writeToFile(
        'Token exchange failed',
        {
          type: 'token_exchange_error',
          error: errorData,
          params: {
            client_id: `${clientId.substring(0, 20)}...`,
            redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
            has_code: !!code,
            has_code_verifier: !!this.codeVerifier,
            has_client_secret: !!clientSecret,
          },
        },
        findProjectRoot(),
      );

      const errorMessage =
        (errorData as { error_description?: string; error?: string }).error_description ||
        (errorData as { error?: string }).error ||
        `Token exchange failed: ${response.status}`;
      throw new Error(errorMessage);
    }

    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
      scope?: string;
    };

    const oauthTokens: OAuthTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: Date.now() + tokens.expires_in * 1000,
      token_type: tokens.token_type,
      scope: tokens.scope,
    };

    await this.tokenStore.save(oauthTokens);
    this.codeVerifier = null;
  }

  /**
   * Refresh access token using refresh token.
   * @throws Error if credentials are not available
   */
  private async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    // Get credentials from remote or environment
    const credentials = await getOAuthCredentials();
    if (!credentials) {
      throw new Error(
        'OAuth credentials are not available. Check network connection or set environment variables.',
      );
    }
    const { clientId, clientSecret } = credentials;

    const params = new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    // Include client_secret if available (required for Web application OAuth clients)
    if (clientSecret) {
      params.set('client_secret', clientSecret);
    }

    const response = await fetch(GOOGLE_OAUTH_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorCode = (errorData as { error?: string }).error;

      // Write debug info to .clix/debug.log
      oauthLogger.writeToFile(
        'Token refresh failed',
        {
          type: 'token_refresh_error',
          error: errorData,
          params: {
            client_id: `${clientId.substring(0, 20)}...`,
            has_refresh_token: !!refreshToken,
            has_client_secret: !!clientSecret,
          },
        },
        findProjectRoot(),
      );

      // If invalid_grant, clear stored tokens so user can re-authenticate
      if (errorCode === 'invalid_grant') {
        oauthLogger.writeToFile(
          'Clearing stored tokens due to invalid_grant',
          { type: 'tokens_cleared' },
          findProjectRoot(),
        );
        await this.tokenStore.clear();
      }

      const errorMessage =
        (errorData as { error_description?: string; error?: string }).error_description ||
        errorCode ||
        `Token refresh failed: ${response.status}`;
      throw new Error(errorMessage);
    }

    const tokens = (await response.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
      scope?: string;
    };

    const oauthTokens: OAuthTokens = {
      access_token: tokens.access_token,
      refresh_token: refreshToken, // Keep the original refresh token
      expiry_date: Date.now() + tokens.expires_in * 1000,
      token_type: tokens.token_type,
      scope: tokens.scope,
    };

    await this.tokenStore.save(oauthTokens);
    return oauthTokens;
  }

  /**
   * Get access token for API calls.
   * Automatically refreshes if expired.
   *
   * @returns Access token string
   * @throws Error with 'invalid_grant' if tokens are invalid and need re-authentication
   */
  async getAccessToken(): Promise<string> {
    let tokens = await this.tokenStore.load();

    if (!tokens) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }

    // Check if token is expired and we have a refresh token
    if (this.tokenStore.isExpired(tokens) && tokens.refresh_token) {
      try {
        tokens = await this.refreshAccessToken(tokens.refresh_token);
      } catch (error) {
        // If refresh failed (e.g., invalid_grant), tokens are already cleared
        // Re-throw with indication that re-authentication is needed
        const message = error instanceof Error ? error.message : 'Token refresh failed';
        if (message.includes('invalid_grant')) {
          throw new Error(`invalid_grant: ${message}`);
        }
        throw new Error(`token_refresh_failed: ${message}`);
      }
    }

    if (!tokens.access_token) {
      throw new Error('Failed to get access token');
    }

    return tokens.access_token;
  }

  /**
   * Run the full OAuth authentication flow.
   *
   * @param openBrowser - Callback to open URL in browser
   * @returns Authentication result
   */
  async authenticate(openBrowser: (url: string) => void): Promise<AuthResult> {
    try {
      oauthLogger.writeToFile(
        'Starting OAuth authentication flow',
        { type: 'auth_start' },
        findProjectRoot(),
      );

      const authUrl = await this.generateAuthUrl();
      openBrowser(authUrl);

      oauthLogger.writeToFile(
        'Waiting for OAuth callback',
        { type: 'waiting_callback' },
        findProjectRoot(),
      );

      const { code } = await this.waitForCallback();

      oauthLogger.writeToFile(
        'OAuth callback received, exchanging code',
        { type: 'callback_received', has_code: !!code },
        findProjectRoot(),
      );

      await this.exchangeCode(code);

      oauthLogger.writeToFile(
        'OAuth authentication successful',
        { type: 'auth_success' },
        findProjectRoot(),
      );

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      oauthLogger.writeToFile(
        'OAuth authentication failed',
        { type: 'auth_failed', error: errorMessage },
        findProjectRoot(),
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Cancel in-flight OAuth authentication.
   */
  cancelAuthentication(reason = 'OAuth authentication cancelled'): void {
    this.callbackServer?.cancel(reason);
    this.callbackServer = null;
    this.oauthState = null;
    this.codeVerifier = null;
  }

  /**
   * Clear stored tokens (logout).
   */
  async logout(): Promise<void> {
    await this.tokenStore.clear();
  }
}
