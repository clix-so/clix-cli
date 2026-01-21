/**
 * OAuth configuration for Google authentication.
 *
 * @module services/firebase/oauth/config
 */

/**
 * Google OAuth configuration.
 *
 * Client ID is loaded from the `CLIX_GOOGLE_CLIENT_ID` environment variable.
 * This is a Desktop/Native app OAuth client, which doesn't require a client secret.
 */
export const GOOGLE_OAUTH_CONFIG = {
  /**
   * OAuth Client ID.
   * Can be overridden via CLIX_GOOGLE_CLIENT_ID environment variable.
   * Default is Clix's official OAuth client (Desktop app).
   */
  clientId:
    process.env.CLIX_GOOGLE_CLIENT_ID ||
    '187255663323-w4iy9mdaxrv6i3d0oqpdb3nhgqx6dt.apps.googleusercontent.com',

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
   * Using readonly scope for listing projects/apps and downloading configs.
   */
  scopes: ['https://www.googleapis.com/auth/firebase.readonly'],

  /**
   * Local redirect URI for OAuth callback.
   * The CLI will start a temporary HTTP server on this port to receive the callback.
   */
  redirectUri: 'http://localhost:9005/oauth/callback',

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
   - Add redirect URI: http://localhost:9005/oauth/callback
2. Set the environment variable:
   export CLIX_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"

You can also manually download Firebase config files from:
https://console.firebase.google.com/`;
}
