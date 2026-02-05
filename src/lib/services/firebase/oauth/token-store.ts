/**
 * Token storage for OAuth credentials.
 *
 * Delegates to CredentialsManager for unified credential storage.
 *
 * @module services/firebase/oauth/token-store
 */

import { getCredentialsManager } from '@/lib/auth/credentials';
import type { OAuthTokens } from './types';

/**
 * Token store for persisting OAuth tokens.
 *
 * Uses CredentialsManager to store Firebase tokens in the unified
 * credentials.json file at project/.clix/credentials.json
 */
export class TokenStore {
  /**
   * Load tokens from storage.
   *
   * @returns Stored tokens or null if not found
   */
  async load(): Promise<OAuthTokens | null> {
    const manager = getCredentialsManager();
    return manager.getFirebaseTokens();
  }

  /**
   * Save tokens to storage.
   *
   * @param tokens - OAuth tokens to save
   */
  async save(tokens: OAuthTokens): Promise<void> {
    const manager = getCredentialsManager();
    await manager.saveFirebaseTokens(tokens);
  }

  /**
   * Clear stored tokens.
   */
  async clear(): Promise<void> {
    const manager = getCredentialsManager();
    await manager.clearFirebaseTokens();
  }

  /**
   * Check if tokens exist in storage.
   *
   * @returns True if tokens file exists
   */
  async exists(): Promise<boolean> {
    const manager = getCredentialsManager();
    return manager.hasFirebaseTokens();
  }

  /**
   * Check if tokens are expired.
   *
   * @param tokens - Tokens to check
   * @returns True if tokens are expired or will expire within 5 minutes
   */
  isExpired(tokens: OAuthTokens): boolean {
    const manager = getCredentialsManager();
    return manager.isFirebaseExpired(tokens);
  }

  /**
   * Check if we have a valid refresh token.
   *
   * @param tokens - Tokens to check
   * @returns True if refresh token exists
   */
  hasRefreshToken(tokens: OAuthTokens): boolean {
    const manager = getCredentialsManager();
    return manager.hasFirebaseRefreshToken(tokens);
  }
}
