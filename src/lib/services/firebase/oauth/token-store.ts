/**
 * Token storage for OAuth credentials.
 *
 * Stores OAuth tokens in the XDG config directory (~/.config/clix/).
 *
 * @module services/firebase/oauth/token-store
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { xdg } from '@/lib/utils/xdg';
import type { OAuthTokens } from './types';

const TOKEN_FILE_NAME = 'firebase-tokens.json';

/**
 * Token store for persisting OAuth tokens.
 */
export class TokenStore {
  private tokenPath: string;

  constructor() {
    this.tokenPath = path.join(xdg.config(), TOKEN_FILE_NAME);
  }

  /**
   * Load tokens from storage.
   *
   * @returns Stored tokens or null if not found
   */
  async load(): Promise<OAuthTokens | null> {
    try {
      const data = await fs.readFile(this.tokenPath, 'utf-8');
      return JSON.parse(data) as OAuthTokens;
    } catch {
      return null;
    }
  }

  /**
   * Save tokens to storage.
   *
   * @param tokens - OAuth tokens to save
   */
  async save(tokens: OAuthTokens): Promise<void> {
    const dir = path.dirname(this.tokenPath);
    // Create directory with restricted permissions (owner only)
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    // Write token file with restricted permissions (owner read/write only)
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }

  /**
   * Clear stored tokens.
   */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.tokenPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Check if tokens exist in storage.
   *
   * @returns True if tokens file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.tokenPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if tokens are expired.
   *
   * @param tokens - Tokens to check
   * @returns True if tokens are expired or will expire within 5 minutes
   */
  isExpired(tokens: OAuthTokens): boolean {
    if (!tokens.expiry_date) {
      return false; // No expiry info, assume valid
    }
    // Consider expired if less than 5 minutes remaining
    const bufferMs = 5 * 60 * 1000;
    return Date.now() >= tokens.expiry_date - bufferMs;
  }

  /**
   * Check if we have a valid refresh token.
   *
   * @param tokens - Tokens to check
   * @returns True if refresh token exists
   */
  hasRefreshToken(tokens: OAuthTokens): boolean {
    return !!tokens.refresh_token;
  }
}
