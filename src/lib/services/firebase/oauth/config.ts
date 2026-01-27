/**
 * OAuth configuration for Google authentication.
 *
 * ## Security Note: Public OAuth Credentials
 *
 * The OAuth Client ID and Client Secret in this file are **intentionally public**.
 * This is standard practice for Desktop/Native OAuth applications.
 *
 * According to Google's official documentation:
 * > "The client secret is not treated as a secret for native apps. Every copy
 * > of your application uses the same client secret, making it impossible to
 * > keep it truly secret. The security of native app OAuth flows relies on
 * > PKCE (Proof Key for Code Exchange) instead."
 *
 * Reference: https://developers.google.com/identity/protocols/oauth2/native-app
 *
 * This is the same pattern used by:
 * - Firebase CLI (firebase-tools)
 * - Google Cloud CLI (gcloud)
 * - Other official Google SDKs
 *
 * The credentials are scoped to Firebase Management API and cannot access
 * user data without explicit user consent through the OAuth flow.
 *
 * @module services/firebase/oauth/config
 */

/**
 * Google OAuth configuration.
 *
 * Client ID is loaded from the `CLIX_GOOGLE_CLIENT_ID` environment variable.
 * Supports both Desktop apps (PKCE, no secret) and Web apps (requires secret).
 */
export const GOOGLE_OAUTH_CONFIG = {
  /**
   * OAuth Client ID (Public - see module documentation).
   *
   * This is Clix's official OAuth Desktop app client ID.
   * Can be overridden via CLIX_GOOGLE_CLIENT_ID environment variable.
   */
  clientId:
    process.env.CLIX_GOOGLE_CLIENT_ID ||
    '187555663323-31u81ha3ji7285f4ct1q9tn8vm6glunq.apps.googleusercontent.com',

  /**
   * OAuth Client Secret (Public - NOT a real secret for Desktop apps).
   *
   * Per Google's OAuth2 spec for native apps, this is NOT treated as a secret.
   * Security is provided by PKCE, not by keeping this value private.
   * See module documentation for details.
   *
   * Can be overridden via CLIX_GOOGLE_CLIENT_SECRET environment variable.
   */
  clientSecret: process.env.CLIX_GOOGLE_CLIENT_SECRET || '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',

  /**
   * Google OAuth 2.0 authorization endpoint.
   */
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',

  /**
   * Google OAuth 2.0 token endpoint.
   */
  tokenEndpoint: 'https://oauth2.googleapis.com/token',

  /**
   * OAuth scopes required for Firebase Management API.
   * Using full firebase scope for listing projects/apps, downloading configs, and creating apps.
   */
  scopes: ['https://www.googleapis.com/auth/firebase'],

  /**
   * Local redirect URI for OAuth callback.
   * The CLI will start a temporary HTTP server on this port to receive the callback.
   * Note: Desktop app OAuth requires loopback IP (127.0.0.1), not localhost.
   */
  redirectUri: 'http://127.0.0.1:9005/oauth/callback',

  /**
   * Port for the local OAuth callback server.
   */
  callbackPort: 9005,

  /**
   * Timeout for OAuth flow in milliseconds (5 minutes).
   */
  timeoutMs: 5 * 60 * 1000,
} as const;

/**
 * Check if OAuth is configured (Client ID is set).
 *
 * @returns True if OAuth client ID is available (default or from environment variable)
 */
export function isOAuthConfigured(): boolean {
  return !!GOOGLE_OAUTH_CONFIG.clientId;
}

/**
 * Get error message for missing OAuth configuration.
 *
 * @returns User-friendly error message with setup instructions
 */
export function getOAuthConfigurationError(): string {
  return `OAuth client ID is not configured.

Clix uses a default OAuth client, but you can use your own:

1. Create OAuth Client ID at https://console.cloud.google.com/apis/credentials
   - Application type: Desktop app
2. Set environment variables:
   export CLIX_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   export CLIX_GOOGLE_CLIENT_SECRET="your-client-secret"

You can also manually download Firebase config files from:
https://console.firebase.google.com/`;
}
