/**
 * Auth0 configuration.
 */
export interface Auth0Config {
  /** Auth0 domain (e.g., 'clix-so.us.auth0.com') */
  domain: string;
  /** Client ID */
  clientId: string;
  /** Auth0 organization ID */
  organizationId?: string;
  /** API audience */
  audience: string;
  /** OAuth scopes */
  scope: string;
}

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
