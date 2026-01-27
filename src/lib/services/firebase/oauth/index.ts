/**
 * OAuth module for Firebase authentication.
 *
 * @module services/firebase/oauth
 */

export { GoogleAuthClient } from './auth-client';
export { GOOGLE_OAUTH_CONFIG, getOAuthConfigurationError, isOAuthConfigured } from './config';
export { TokenStore } from './token-store';
export type {
  AuthResult,
  OAuthCallbackResult,
  OAuthFlowState,
  OAuthFlowStatus,
  OAuthTokens,
} from './types';
