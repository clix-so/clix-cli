import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { xdg } from '../utils/xdg';
import { AUTH_ENV_VARS, getAuth0Config } from './config';
import { AuthError } from './errors';
import { type Credentials, createCredentials, validateCredentials } from './schema';
import type { TokenResponse } from './types';

/**
 * Token expiry buffer in milliseconds.
 * Tokens are considered expired 5 minutes before actual expiry.
 */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * CredentialsManager handles storing, loading, and refreshing auth credentials.
 *
 * Storage location: $XDG_STATE_HOME/clix/credentials.json
 * File permissions: 0600 (owner read/write only)
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
    this.stateDirPath = customStateDir ?? xdg.state();
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

    this.cachedCredentials = credentials;
  }

  /**
   * Delete credentials (logout).
   *
   * @returns true if credentials were deleted, false if they didn't exist
   */
  async delete(): Promise<boolean> {
    try {
      await rm(this.credentialsFilePath);
      this.cachedCredentials = null;
      return true;
    } catch {
      this.cachedCredentials = null;
      return false;
    }
  }

  /**
   * Check if access token is expired.
   *
   * @param credentials - Credentials to check
   * @returns true if expired or about to expire
   */
  isExpired(credentials: Credentials): boolean {
    const expiresAt = new Date(credentials.expiresAt);
    const now = new Date();
    // Consider expired if within buffer period
    return expiresAt.getTime() - EXPIRY_BUFFER_MS <= now.getTime();
  }

  /**
   * Refresh access token using refresh token.
   *
   * @param credentials - Current credentials with refresh token
   * @returns New credentials with fresh access token
   * @throws AuthError if refresh fails
   */
  async refreshAccessToken(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) {
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
          refresh_token: credentials.refreshToken,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        if (errorData.error === 'invalid_grant') {
          throw AuthError.tokenExpired('Refresh token expired. Please run "clix login" again.');
        }
        throw AuthError.refreshFailed(`Token refresh failed: ${response.status}`);
      }

      const tokenResponse = (await response.json()) as TokenResponse;

      // Create new credentials with refreshed tokens
      const newCredentials = createCredentials(
        tokenResponse,
        credentials.issuer,
        credentials.audience,
      );

      // Save updated credentials
      await this.save(newCredentials);

      return newCredentials;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
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

    // 2. Load stored credentials
    const credentials = await this.load();
    if (!credentials) {
      return null;
    }

    // 3. Check if access token is expired
    if (!this.isExpired(credentials)) {
      return credentials.accessToken;
    }

    // 4. Try to refresh if we have a refresh token
    if (credentials.refreshToken) {
      try {
        const refreshed = await this.refreshAccessToken(credentials);
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
