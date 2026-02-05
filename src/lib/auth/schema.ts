import { z } from 'zod';

/**
 * Current credentials schema version.
 */
export const CREDENTIALS_VERSION = 1;

/**
 * Zod schema for Clix (Auth0) credentials.
 */
export const ClixCredentialsSchema = z.object({
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
 * Zod schema for Firebase OAuth tokens.
 */
export const FirebaseTokensSchema = z.object({
  /** Firebase access token */
  access_token: z.string().nullish(),
  /** Firebase refresh token */
  refresh_token: z.string().nullish(),
  /** OAuth scope */
  scope: z.string().optional(),
  /** Token type (e.g., "Bearer") */
  token_type: z.string().nullish(),
  /** Token expiration timestamp (ms) */
  expiry_date: z.number().nullish(),
});

/**
 * Zod schema for unified credentials file.
 */
export const CredentialsSchema = z.object({
  /** Schema version */
  version: z.number().int().min(1),
  /** Clix (Auth0) credentials */
  clix: ClixCredentialsSchema.optional(),
  /** Firebase OAuth tokens */
  firebase: FirebaseTokensSchema.optional(),
});

/**
 * Inferred types from schemas.
 */
export type ClixCredentials = z.infer<typeof ClixCredentialsSchema>;
export type FirebaseTokens = z.infer<typeof FirebaseTokensSchema>;
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
 * Create Clix credentials object from token response.
 *
 * @param tokenResponse - Auth0 token response
 * @param issuer - Auth0 issuer URL
 * @param audience - API audience
 * @returns ClixCredentials object ready for storage
 */
export function createClixCredentials(
  tokenResponse: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  },
  issuer: string,
  audience: string,
): ClixCredentials {
  const now = new Date();
  const expiresInMs = tokenResponse.expires_in * 1000;

  // Guard against invalid expires_in values
  if (!Number.isFinite(expiresInMs) || expiresInMs < 0) {
    throw new Error('Invalid expires_in in token response');
  }

  const expiresAt = new Date(now.getTime() + expiresInMs);

  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    idToken: tokenResponse.id_token,
    expiresAt: expiresAt.toISOString(),
    issuedAt: now.toISOString(),
    issuer,
    audience,
  };
}

/**
 * @deprecated Use createClixCredentials instead.
 * Kept for backward compatibility during transition.
 */
export const createCredentials = createClixCredentials;
