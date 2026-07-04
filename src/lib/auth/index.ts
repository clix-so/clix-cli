// Types

// Auth Flows
export { openBrowser } from './browser';
// Config
export {
  AUTH_ENV_VARS,
  DEFAULT_CONSOLE_URL,
  getAuth0Config,
  getConsoleUrl,
  getIssuerUrl,
} from './config';
// Credentials Manager
export {
  CredentialsManager,
  getCredentialsManager,
  resetCredentialsManager,
} from './credentials';
export type { AuthErrorCode } from './errors';
// Errors
export { AUTH_ERROR_CODES, AuthError } from './errors';
export { PKCEFlowService } from './pkce-flow';
export type { ClixCredentials, Credentials, FirebaseTokens } from './schema';
// Schema
export {
  ClixCredentialsSchema,
  CREDENTIALS_VERSION,
  CredentialsSchema,
  createClixCredentials,
  createCredentials,
  FirebaseTokensSchema,
  validateCredentials,
} from './schema';
export type { Auth0Config, RefreshTokenRequest, TokenResponse, UserInfo } from './types';
