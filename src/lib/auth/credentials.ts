import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AUTH_ENV_VARS, getAuth0Config } from './config';
import { AuthError } from './errors';
import {
  type ClixCredentials,
  CREDENTIALS_VERSION,
  type Credentials,
  createClixCredentials,
  type FirebaseTokens,
  validateCredentials,
} from './schema';
import type { TokenResponse } from './types';

/**
 * Token expiry buffer in milliseconds.
 * Tokens are considered expired 5 minutes before actual expiry.
 */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * CredentialsManager handles storing, loading, and refreshing auth credentials.
 *
 * Storage location: project/.clix/credentials.json
 * File permissions: 0600 (owner read/write only)
 *
 * Unified credentials file structure:
 * - clix: Auth0/Clix authentication tokens
 * - firebase: Firebase OAuth tokens
 *
 * @example
 * ```typescript
 * const manager = getCredentialsManager();
 * const token = await manager.getValidToken();
 * if (!token) {
 *   console.log('Not logged in');
 * }
 * ```
 */
export class CredentialsManager {
  private cachedCredentials: Credentials | null = null;
  private stateDirPath: string;
  private credentialsFilePath: string;

  constructor(customStateDir?: string) {
    this.stateDirPath = customStateDir ?? join(process.cwd(), '.clix');
    this.credentialsFilePath = join(this.stateDirPath, 'credentials.json');
  }

  /**
   * Get the credentials file path.
   */
  get credentialsPath(): string {
    return this.credentialsFilePath;
  }

  /**
   * Get cached credentials (without loading from disk).
   */
  get credentials(): Credentials | null {
    return this.cachedCredentials;
  }

  /**
   * Ensure the state directory exists.
   */
  private async ensureStateDir(): Promise<void> {
    try {
      await stat(this.stateDirPath);
    } catch {
      await mkdir(this.stateDirPath, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Load credentials from disk.
   *
   * @returns Credentials or null if not found/invalid
   */
  async load(): Promise<Credentials | null> {
    if (this.cachedCredentials) {
      return this.cachedCredentials;
    }

    try {
      const content = await readFile(this.credentialsFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      const validated = validateCredentials(parsed);

      if (!validated) {
        return null;
      }

      this.cachedCredentials = validated;
      return validated;
    } catch {
      return null;
    }
  }

  /**
   * Save credentials to disk.
   *
   * @param credentials - Credentials to save
   */
  async save(credentials: Credentials): Promise<void> {
    await this.ensureStateDir();

    // Write with restrictive permissions (owner read/write only)
    await writeFile(this.credentialsFilePath, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
    });

    // Enforce permissions even if file already existed with broader perms
    await chmod(this.credentialsFilePath, 0o600);

    this.cachedCredentials = credentials;
  }

  /**
   * Delete credentials (logout).
   *
   * @returns true if credentials were deleted, false if they didn't exist
   * @throws Error if deletion fails due to permission or other IO errors
   */
  async delete(): Promise<boolean> {
    try {
      await rm(this.credentialsFilePath);
      this.cachedCredentials = null;
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        // File didn't exist - treat as successful deletion
        this.cachedCredentials = null;
        return false;
      }
      // Rethrow other errors (permission failures, etc.)
      throw error;
    }
  }

  // ============================================
  // Clix (Auth0) Credentials Methods
  // ============================================

  /**
   * Get Clix credentials from unified store.
   */
  async getClixCredentials(): Promise<ClixCredentials | null> {
    const credentials = await this.load();
    return credentials?.clix ?? null;
  }

  /**
   * Save Clix credentials to unified store.
   */
  async saveClixCredentials(clixCredentials: ClixCredentials): Promise<void> {
    const current = (await this.load()) ?? { version: CREDENTIALS_VERSION };
    await this.save({
      ...current,
      version: CREDENTIALS_VERSION,
      clix: clixCredentials,
    });
  }

  /**
   * Clear only Clix credentials (keep Firebase tokens).
   */
  async clearClixCredentials(): Promise<void> {
    const current = await this.load();
    if (current) {
      const { clix: _, ...rest } = current;
      if (rest.firebase) {
        await this.save({ ...rest, version: CREDENTIALS_VERSION });
      } else {
        await this.delete();
      }
    }
  }

  /**
   * Check if Clix access token is expired.
   *
   * @param clixCredentials - Clix credentials to check
   * @returns true if expired or about to expire
   */
  isClixExpired(clixCredentials: ClixCredentials): boolean {
    const expiresAtMs = Date.parse(clixCredentials.expiresAt);
    // Treat invalid dates as expired (secure default)
    if (!Number.isFinite(expiresAtMs)) {
      return true;
    }
    // Consider expired if within buffer period
    return expiresAtMs - EXPIRY_BUFFER_MS <= Date.now();
  }

  /**
   * @deprecated Use isClixExpired instead.
   */
  isExpired(credentials: Credentials): boolean {
    if (!credentials.clix) return true;
    return this.isClixExpired(credentials.clix);
  }

  /**
   * Refresh access token using refresh token.
   *
   * @param clixCredentials - Current Clix credentials with refresh token
   * @returns New Clix credentials with fresh access token
   * @throws AuthError if refresh fails
   */
  async refreshAccessToken(clixCredentials: ClixCredentials): Promise<ClixCredentials> {
    if (!clixCredentials.refreshToken) {
      throw AuthError.refreshFailed('No refresh token available');
    }

    const config = getAuth0Config();
    const url = `https://${config.domain}/oauth/token`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: config.clientId,
          refresh_token: clixCredentials.refreshToken,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        if (errorData.error === 'invalid_grant') {
          throw AuthError.tokenExpired('Refresh token expired. Please run "clix login" again.');
        }
        throw AuthError.refreshFailed(`Token refresh failed: ${response.status}`);
      }

      const tokenResponse = (await response.json()) as TokenResponse;

      // Preserve existing refresh token if response omits it (RFC 6749 compliant)
      const mergedTokenResponse: TokenResponse = {
        ...tokenResponse,
        refresh_token: tokenResponse.refresh_token ?? clixCredentials.refreshToken,
      };

      // Create new credentials with refreshed tokens
      const newClixCredentials = createClixCredentials(
        mergedTokenResponse,
        clixCredentials.issuer,
        clixCredentials.audience,
      );

      // Save updated credentials
      await this.saveClixCredentials(newClixCredentials);

      return newClixCredentials;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      // Handle timeout errors from AbortSignal.timeout()
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw AuthError.timeout('Token refresh timed out. Please try again.');
      }
      throw AuthError.refreshFailed(
        'Failed to refresh access token',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get a valid access token.
   *
   * Priority:
   * 1. Environment variable (CLIX_ACCESS_TOKEN)
   * 2. Stored credentials (with auto-refresh if expired)
   *
   * @returns Valid access token or null if not authenticated
   */
  async getValidToken(): Promise<string | null> {
    // 1. Check environment variable first (for CI/CD)
    const envToken = process.env[AUTH_ENV_VARS.ACCESS_TOKEN];
    if (envToken) {
      return envToken;
    }

    // 2. Load stored Clix credentials
    const clixCredentials = await this.getClixCredentials();
    if (!clixCredentials) {
      return null;
    }

    // 3. Check if access token is expired
    if (!this.isClixExpired(clixCredentials)) {
      return clixCredentials.accessToken;
    }

    // 4. Try to refresh if we have a refresh token
    if (clixCredentials.refreshToken) {
      try {
        const refreshed = await this.refreshAccessToken(clixCredentials);
        return refreshed.accessToken;
      } catch {
        // Refresh failed - return null to indicate re-login needed
        return null;
      }
    }

    // No refresh token and access token expired
    return null;
  }

  /**
   * Check if user is authenticated.
   *
   * @returns true if valid credentials exist
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getValidToken();
    return token !== null;
  }

  /**
   * Check if authenticated via environment variable.
   *
   * @returns true if CLIX_ACCESS_TOKEN is set
   */
  isEnvAuthenticated(): boolean {
    return !!process.env[AUTH_ENV_VARS.ACCESS_TOKEN];
  }

  // ============================================
  // Firebase Token Methods
  // ============================================

  /**
   * Get Firebase tokens from unified store.
   */
  async getFirebaseTokens(): Promise<FirebaseTokens | null> {
    const credentials = await this.load();
    return credentials?.firebase ?? null;
  }

  /**
   * Save Firebase tokens to unified store.
   */
  async saveFirebaseTokens(firebaseTokens: FirebaseTokens): Promise<void> {
    const current = (await this.load()) ?? { version: CREDENTIALS_VERSION };
    await this.save({
      ...current,
      version: CREDENTIALS_VERSION,
      firebase: firebaseTokens,
    });
  }

  /**
   * Clear only Firebase tokens (keep Clix credentials).
   */
  async clearFirebaseTokens(): Promise<void> {
    const current = await this.load();
    if (current) {
      const { firebase: _, ...rest } = current;
      if (rest.clix) {
        await this.save({ ...rest, version: CREDENTIALS_VERSION });
      } else {
        await this.delete();
      }
    }
  }

  /**
   * Check if Firebase tokens exist.
   */
  async hasFirebaseTokens(): Promise<boolean> {
    const tokens = await this.getFirebaseTokens();
    return tokens !== null;
  }

  /**
   * Check if Firebase tokens are expired.
   *
   * @param tokens - Firebase tokens to check
   * @returns true if tokens are expired or will expire within 5 minutes
   */
  isFirebaseExpired(tokens: FirebaseTokens): boolean {
    if (!tokens.expiry_date) {
      return false; // No expiry info, assume valid
    }
    // Consider expired if less than 5 minutes remaining
    return Date.now() >= tokens.expiry_date - EXPIRY_BUFFER_MS;
  }

  /**
   * Check if Firebase tokens have a valid refresh token.
   *
   * @param tokens - Firebase tokens to check
   * @returns true if refresh token exists
   */
  hasFirebaseRefreshToken(tokens: FirebaseTokens): boolean {
    return !!tokens.refresh_token;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Clear the cached credentials (useful for testing).
   */
  clearCache(): void {
    this.cachedCredentials = null;
  }
}

/**
 * Singleton instance for the default credentials manager.
 */
let defaultManager: CredentialsManager | null = null;

/**
 * Get the default CredentialsManager instance.
 */
export function getCredentialsManager(): CredentialsManager {
  if (!defaultManager) {
    defaultManager = new CredentialsManager();
  }
  return defaultManager;
}

/**
 * Reset the default CredentialsManager instance (useful for testing).
 */
export function resetCredentialsManager(): void {
  defaultManager = null;
}
