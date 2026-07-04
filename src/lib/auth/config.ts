import type { Auth0Config } from './types';

/**
 * Environment variable names for auth configuration.
 */
export const AUTH_ENV_VARS = {
  /** Access token for CI/CD (bypasses stored credentials) */
  ACCESS_TOKEN: 'CLIX_ACCESS_TOKEN',
  /** Console base URL */
  CONSOLE_URL: 'CLIX_CONSOLE_URL',
  /** Management API base URL */
  MANAGEMENT_API_URL: 'CLIX_MANAGEMENT_API_URL',
  /** Auth0 domain override */
  AUTH0_DOMAIN: 'CLIX_AUTH0_DOMAIN',
  /** Auth0 client ID override */
  AUTH0_CLIENT_ID: 'CLIX_AUTH0_CLIENT_ID',
  /** Auth0 audience override */
  AUTH0_AUDIENCE: 'CLIX_AUTH0_AUDIENCE',
  /** Auth0 organization ID override */
  AUTH0_ORGANIZATION_ID: 'CLIX_AUTH0_ORGANIZATION_ID',
} as const;

/**
 * Default Auth0 configuration.
 * These values match the Clix CLI application in Auth0 Dashboard.
 */
const DEFAULT_AUTH0_CONFIG: Auth0Config = {
  domain: 'clix-so.us.auth0.com',
  clientId: 'eWQvmzVSL2xOUzrV2oGc81sDGkdC2RfY',
  organizationId: 'org_X7z9sXwAd3bWpEqu',
  audience: 'https://clix-so.us.auth0.com/api/v2/',
  // offline_access is required for refresh tokens
  scope: 'openid profile email offline_access',
};

/**
 * Default Console URL for API proxy.
 */
export const DEFAULT_CONSOLE_URL = 'https://console.clix.so';

/**
 * Get Auth0 configuration with environment variable overrides.
 *
 * @returns Auth0 configuration
 */
export function getAuth0Config(): Auth0Config {
  const clientId = process.env[AUTH_ENV_VARS.AUTH0_CLIENT_ID] ?? DEFAULT_AUTH0_CONFIG.clientId;
  const organizationId =
    process.env[AUTH_ENV_VARS.AUTH0_ORGANIZATION_ID] ??
    (clientId === DEFAULT_AUTH0_CONFIG.clientId ? DEFAULT_AUTH0_CONFIG.organizationId : undefined);

  return {
    domain: process.env[AUTH_ENV_VARS.AUTH0_DOMAIN] ?? DEFAULT_AUTH0_CONFIG.domain,
    clientId,
    ...(organizationId && { organizationId }),
    audience: process.env[AUTH_ENV_VARS.AUTH0_AUDIENCE] ?? DEFAULT_AUTH0_CONFIG.audience,
    scope: DEFAULT_AUTH0_CONFIG.scope,
  };
}

/**
 * Get Console URL for API proxy.
 *
 * @returns Console base URL
 */
export function getConsoleUrl(): string {
  return process.env[AUTH_ENV_VARS.CONSOLE_URL] ?? DEFAULT_CONSOLE_URL;
}

/**
 * Get Auth0 issuer URL.
 *
 * @param config - Auth0 configuration
 * @returns Issuer URL
 */
export function getIssuerUrl(config: Auth0Config): string {
  return `https://${config.domain}/`;
}
