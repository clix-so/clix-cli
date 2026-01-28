import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  OAUTH_CALLBACK_CONFIG,
  OAuthCallbackServer,
} from '@/lib/utils/oauth';
import { AuthError } from './errors';
import type { Auth0Config, TokenResponse, UserInfo } from './types';

/**
 * PKCEFlowService handles Auth0 Authorization Code with PKCE flow.
 *
 * Flow:
 * 1. Generate code_verifier and code_challenge
 * 2. Start local HTTP server for callback
 * 3. Open browser to authorization URL
 * 4. Receive authorization code via callback
 * 5. Exchange code for tokens
 *
 * @example
 * ```typescript
 * const service = new PKCEFlowService(config);
 * const { authUrl } = await service.startAuthFlow();
 *
 * await openBrowser(authUrl);
 *
 * const code = await service.waitForCallback();
 * const tokens = await service.exchangeCodeForTokens(code);
 * ```
 */
export class PKCEFlowService {
  private config: Auth0Config;
  private baseUrl: string;
  private codeVerifier: string;
  private codeChallenge: string;
  private state: string;
  private callbackServer: OAuthCallbackServer | null = null;
  private redirectUri: string = '';

  constructor(config: Auth0Config) {
    this.config = config;
    this.baseUrl = `https://${config.domain}`;
    this.codeVerifier = generateCodeVerifier();
    this.codeChallenge = generateCodeChallenge(this.codeVerifier);
    this.state = generateState();
  }

  /**
   * Start local HTTP server and get authorization URL.
   *
   * @returns Authorization URL and local server port
   */
  async startAuthFlow(): Promise<{ authUrl: string; port: number }> {
    // Use shared OAuth callback configuration
    // See CLAUDE.md for OAuth callback URL convention
    this.callbackServer = new OAuthCallbackServer({
      expectedState: this.state,
    });

    const { port } = await this.callbackServer.start();
    this.redirectUri = OAUTH_CALLBACK_CONFIG.getCallbackUrl();

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.config.scope,
      audience: this.config.audience,
      code_challenge: this.codeChallenge,
      code_challenge_method: 'S256',
      state: this.state,
    });

    const authUrl = `${this.baseUrl}/authorize?${params.toString()}`;
    return { authUrl, port };
  }

  /**
   * Wait for the OAuth callback with authorization code.
   *
   * @returns Authorization code
   */
  async waitForCallback(): Promise<string> {
    if (!this.callbackServer) {
      throw AuthError.deviceCodeFailed('Callback server not started');
    }

    try {
      const { code } = await this.callbackServer.waitForCallback();
      return code;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw AuthError.timeout();
        }
        if (error.message.includes('denied') || error.message.includes('access_denied')) {
          throw AuthError.accessDenied(error.message);
        }
        throw AuthError.deviceCodeFailed(error.message);
      }
      throw AuthError.deviceCodeFailed('Unknown callback error');
    }
  }

  /**
   * Exchange authorization code for tokens.
   *
   * @param code - Authorization code from callback
   * @returns Token response
   */
  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const url = `${this.baseUrl}/oauth/token`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.config.clientId,
          code_verifier: this.codeVerifier,
          code,
          redirect_uri: this.redirectUri,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw AuthError.deviceCodeFailed(
          `Failed to exchange code for tokens: ${response.status} - ${error}`,
        );
      }

      return (await response.json()) as TokenResponse;
    } catch (err) {
      if (err instanceof AuthError) {
        throw err;
      }
      throw AuthError.deviceCodeFailed(
        'Failed to exchange code for tokens',
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Parse user info from ID token.
   */
  parseIdToken(idToken: string): UserInfo | null {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = parts[1];
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      const claims = JSON.parse(decoded);

      return {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
      };
    } catch {
      return null;
    }
  }

  /**
   * Force cleanup (for cancellation).
   */
  abort(): void {
    this.callbackServer?.stop();
    this.callbackServer = null;
  }
}
