/**
 * Auth0 configuration for Device Flow.
 */
export interface Auth0Config {
  /** Auth0 domain (e.g., 'clix-so.us.auth0.com') */
  domain: string;
  /** Device Flow client ID */
  clientId: string;
  /** API audience */
  audience: string;
  /** OAuth scopes */
  scope: string;
}

/**
 * Response from Auth0 Device Authorization endpoint.
 * POST /oauth/device/code
 */
export interface DeviceCodeResponse {
  /** Device code for polling */
  device_code: string;
  /** User-facing code to enter in browser */
  user_code: string;
  /** URL for user to visit */
  verification_uri: string;
  /** URL with code pre-filled */
  verification_uri_complete: string;
  /** Code expiration time in seconds */
  expires_in: number;
  /** Polling interval in seconds */
  interval: number;
}

/**
 * Token polling status.
 */
export type PollingStatus =
  | 'pending' // authorization_pending - user hasn't completed auth
  | 'slow_down' // slow_down - polling too fast
  | 'expired' // expired_token - device code expired
  | 'access_denied' // access_denied - user denied authorization
  | 'authorized'; // success - token received

/**
 * Auth0 token response.
 * POST /oauth/token
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: 'Bearer';
  expires_in: number;
  scope?: string;
}

/**
 * User information extracted from ID token.
 */
export interface UserInfo {
  /** Auth0 user ID (sub claim) */
  sub: string;
  /** User email */
  email?: string;
  /** User display name */
  name?: string;
  /** Profile picture URL */
  picture?: string;
}

/**
 * Token refresh request.
 */
export interface RefreshTokenRequest {
  grant_type: 'refresh_token';
  client_id: string;
  refresh_token: string;
}
