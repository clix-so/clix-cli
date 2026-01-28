/**
 * Google OAuth client for Firebase authentication.
 *
 * Implements OAuth 2.0 with PKCE for Desktop/Native apps.
 * Does not use client_secret as per Google's Desktop app OAuth flow.
 *
 * @module services/firebase/oauth/auth-client
 */

import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  OAuthCallbackServer,
} from '@/lib/utils/oauth';
import { GOOGLE_OAUTH_CONFIG, isOAuthConfigured } from './config';
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
   */
  generateAuthUrl(): string {
    // Generate PKCE code verifier and challenge
    this.codeVerifier = generateCodeVerifier();
    this.oauthState = generateState();
    const codeChallenge = generateCodeChallenge(this.codeVerifier);

    const params = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
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

    // Debug: Log PKCE parameters
    if (process.env.DEBUG) {
      console.error('[OAuth Debug] Authorization request:');
      console.error('  code_challenge:', codeChallenge);
      console.error('  code_challenge_method: S256');
      console.error('  PKCE enabled: true');
    }

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
      callbackPath: '/oauth/callback',
      timeoutMs: GOOGLE_OAUTH_CONFIG.timeoutMs,
      expectedState: this.oauthState ?? undefined,
    });

    await this.callbackServer.start();

    try {
      const result = await this.callbackServer.waitForCallback();
      this.oauthState = null;
      return result;
    } catch (error) {
      this.oauthState = null;
      throw error;
    }
  }

  /**
   * Exchange authorization code for tokens.
   * Uses direct HTTP request to Google's token endpoint.
   *
   * @param code - Authorization code from callback
   */
  async exchangeCode(code: string): Promise<void> {
    if (!this.codeVerifier) {
      throw new Error('PKCE code verifier not found. Call generateAuthUrl() first.');
    }

    const params = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
      code,
      code_verifier: this.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
    });

    // Include client_secret if available (required for Web application OAuth clients)
    if (GOOGLE_OAUTH_CONFIG.clientSecret) {
      params.set('client_secret', GOOGLE_OAUTH_CONFIG.clientSecret);
    }

    // Debug: Log request details
    if (process.env.DEBUG) {
      console.error('[OAuth Debug] Token exchange request:');
      console.error('  Client ID:', GOOGLE_OAUTH_CONFIG.clientId);
      console.error('  Has client_secret:', !!GOOGLE_OAUTH_CONFIG.clientSecret);
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

      // Debug: Log error response
      if (process.env.DEBUG) {
        console.error('[OAuth Debug] Token exchange error:', JSON.stringify(errorData, null, 2));
      }

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
   */
  private async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    // Include client_secret if available (required for Web application OAuth clients)
    if (GOOGLE_OAUTH_CONFIG.clientSecret) {
      params.set('client_secret', GOOGLE_OAUTH_CONFIG.clientSecret);
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
      const errorMessage =
        (errorData as { error_description?: string; error?: string }).error_description ||
        (errorData as { error?: string }).error ||
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
   */
  async getAccessToken(): Promise<string> {
    let tokens = await this.tokenStore.load();

    if (!tokens) {
      throw new Error('Not authenticated. Run OAuth flow first.');
    }

    // Check if token is expired and we have a refresh token
    if (this.tokenStore.isExpired(tokens) && tokens.refresh_token) {
      tokens = await this.refreshAccessToken(tokens.refresh_token);
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
  }
}
