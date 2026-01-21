/**
 * OAuth types for Firebase authentication.
 *
 * @module services/firebase/oauth/types
 */

import type { Credentials } from 'google-auth-library';

/**
 * OAuth tokens stored locally.
 */
export interface OAuthTokens extends Credentials {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
}

/**
 * OAuth authentication result.
 */
export interface AuthResult {
  success: boolean;
  tokens?: OAuthTokens;
  error?: string;
}

/**
 * OAuth callback result from the redirect.
 */
export interface OAuthCallbackResult {
  code: string;
  state: string;
}

/**
 * OAuth flow state.
 */
export type OAuthFlowState =
  | 'idle'
  | 'waiting_for_browser'
  | 'waiting_for_callback'
  | 'exchanging_tokens'
  | 'authenticated'
  | 'error';

/**
 * OAuth flow status for UI display.
 */
export interface OAuthFlowStatus {
  state: OAuthFlowState;
  message?: string;
  error?: string;
}
