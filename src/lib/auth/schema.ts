import { z } from 'zod';

/**
 * Current credentials schema version.
 * Increment when making breaking changes to structure.
 */
export const CREDENTIALS_VERSION = 1;

/**
 * Zod schema for stored credentials.
 */
export const CredentialsSchema = z.object({
  /** Schema version for migrations */
  version: z.number().int().min(1),
  /** Auth0 access token */
  accessToken: z.string().min(1),
  /** Auth0 refresh token (for session persistence) */
  refreshToken: z.string().optional(),
  /** Auth0 ID token (contains user info) */
  idToken: z.string().optional(),
  /** Access token expiration time (ISO timestamp) */
  expiresAt: z.string().datetime(),
  /** Token issuance time (ISO timestamp) */
  issuedAt: z.string().datetime(),
  /** Auth0 issuer URL */
  issuer: z.string().url(),
  /** API audience */
  audience: z.string(),
});

/**
 * Inferred type from CredentialsSchema.
 */
export type Credentials = z.infer<typeof CredentialsSchema>;

/**
 * Validate credentials and return typed result.
 *
 * @param data - Raw data to validate
 * @returns Validated credentials or null if invalid
 */
export function validateCredentials(data: unknown): Credentials | null {
  const result = CredentialsSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Create credentials object from token response.
 *
 * @param tokenResponse - Auth0 token response
 * @param issuer - Auth0 issuer URL
 * @param audience - API audience
 * @returns Credentials object ready for storage
 */
export function createCredentials(
  tokenResponse: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  },
  issuer: string,
  audience: string,
): Credentials {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + tokenResponse.expires_in * 1000);

  return {
    version: CREDENTIALS_VERSION,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    idToken: tokenResponse.id_token,
    expiresAt: expiresAt.toISOString(),
    issuedAt: now.toISOString(),
    issuer,
    audience,
  };
}
