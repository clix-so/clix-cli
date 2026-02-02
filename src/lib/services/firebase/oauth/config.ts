/**
 * OAuth configuration for Google authentication.
 *
 * Credentials are fetched from https://clix.sh/secret or provided via environment variables.
 *
 * @module services/firebase/oauth/config
 */

import { createHash } from 'node:crypto';
import { OAUTH_CALLBACK_CONFIG } from '@/lib/utils/oauth';

/**
 * Remote OAuth credentials structure from https://clix.sh/secret
 */
interface RemoteOAuthCredentials {
  client_id: string;
  client_secret: string;
}

/**
 * Remote credentials endpoint.
 */
const CREDENTIALS_ENDPOINT = 'https://clix.sh/secret';

/**
 * Fetch timeout in milliseconds.
 */
const FETCH_TIMEOUT_MS = 5000;

/**
 * Time window for auth token in milliseconds (5 minutes).
 */
const AUTH_TIME_WINDOW_MS = 5 * 60 * 1000;

/**
 * Generate time-based authorization token.
 *
 * Creates a dynamic token based on current time window for simple server-side validation.
 *
 * @returns Authorization token string
 */
function generateAuthToken(): string {
  // Get current time window (5-minute intervals)
  const timeWindow = Math.floor(Date.now() / AUTH_TIME_WINDOW_MS);

  // Create token from time window and identifier
  const payload = `clix:${timeWindow}:${process.platform}`;
  const hash = createHash('sha256').update(payload).digest('hex');

  return hash.substring(0, 32);
}

/**
 * Fetch OAuth credentials from remote server.
 *
 * @returns Remote credentials or null on failure
 */
async function fetchRemoteCredentials(): Promise<RemoteOAuthCredentials | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const authToken = generateAuthToken();

    const response = await fetch(CREDENTIALS_ENDPOINT, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${authToken}`,
        'User-Agent': 'Clix-CLI',
        Accept: 'text/plain',
      },
    });

    if (!response.ok) {
      if (process.env.DEBUG) {
        console.error(`[OAuth] Failed to fetch credentials: HTTP ${response.status}`);
      }
      return null;
    }

    const base64Data = await response.text();
    const jsonString = Buffer.from(base64Data, 'base64').toString('utf-8');
    const credentials = JSON.parse(jsonString) as RemoteOAuthCredentials;

    if (!credentials.client_id || !credentials.client_secret) {
      if (process.env.DEBUG) {
        console.error('[OAuth] Invalid credentials format from remote');
      }
      return null;
    }

    return credentials;
  } catch (error) {
    if (process.env.DEBUG) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[OAuth] Credentials fetch error: ${message}`);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get OAuth credentials.
 *
 * Priority:
 * 1. Environment variables (CLIX_GOOGLE_CLIENT_ID, CLIX_GOOGLE_CLIENT_SECRET)
 * 2. Remote fetch from https://clix.sh/secret
 *
 * @returns OAuth client credentials or null if not available
 */
export async function getOAuthCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  // 1. Environment variables take precedence
  if (process.env.CLIX_GOOGLE_CLIENT_ID && process.env.CLIX_GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.CLIX_GOOGLE_CLIENT_ID,
      clientSecret: process.env.CLIX_GOOGLE_CLIENT_SECRET,
    };
  }

  // 2. Fetch from remote
  const remote = await fetchRemoteCredentials();
  if (remote) {
    return {
      clientId: remote.client_id,
      clientSecret: remote.client_secret,
    };
  }

  // No credentials available
  return null;
}

/**
 * Google OAuth configuration (static settings only).
 *
 * For client credentials, use `getOAuthCredentials()` instead.
 */
export const GOOGLE_OAUTH_CONFIG = {
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
   * See CLAUDE.md "OAuth Callback URL Convention" for details.
   */
  redirectUri: OAUTH_CALLBACK_CONFIG.getCallbackUrlIp(),

  /**
   * Port for the local OAuth callback server.
   */
  callbackPort: OAUTH_CALLBACK_CONFIG.port,

  /**
   * Timeout for OAuth flow in milliseconds (5 minutes).
   */
  timeoutMs: OAUTH_CALLBACK_CONFIG.timeoutMs,
} as const;

/**
 * Check if OAuth is configured.
 *
 * Always returns true since credentials can be fetched from remote server.
 * Actual credential availability is checked when getOAuthCredentials() is called.
 *
 * @returns True (OAuth is always potentially available via remote fetch)
 */
export function isOAuthConfigured(): boolean {
  return true;
}

/**
 * Get error message for missing OAuth configuration.
 *
 * @returns User-friendly error message with setup instructions
 */
export function getOAuthConfigurationError(): string {
  return `OAuth credentials are not available.

Failed to fetch credentials from remote server.

You can set your own OAuth credentials:

1. Create OAuth Client ID at https://console.cloud.google.com/apis/credentials
   - Application type: Desktop app
2. Set environment variables:
   export CLIX_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   export CLIX_GOOGLE_CLIENT_SECRET="your-client-secret"

You can also manually download Firebase config files from:
https://console.firebase.google.com/`;
}
