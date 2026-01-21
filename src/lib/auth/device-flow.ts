import { AuthError } from './errors';
import type {
  Auth0Config,
  DeviceCodeResponse,
  PollingStatus,
  TokenResponse,
  UserInfo,
} from './types';

/**
 * DeviceFlowService handles Auth0 Device Authorization Flow.
 *
 * Flow:
 * 1. POST /oauth/device/code -> device_code, user_code, verification_uri
 * 2. User visits verification_uri and enters user_code (or uses verification_uri_complete)
 * 3. Poll POST /oauth/token until authorized or expired
 *
 * @example
 * ```typescript
 * const service = new DeviceFlowService(config);
 * const deviceCode = await service.requestDeviceCode();
 *
 * // Show user_code and verification_uri to user
 * await openBrowser(deviceCode.verification_uri_complete);
 *
 * // Poll for token
 * const tokens = await service.pollForToken(
 *   deviceCode.device_code,
 *   deviceCode.interval,
 *   deviceCode.expires_in
 * );
 * ```
 */
export class DeviceFlowService {
  private config: Auth0Config;
  private baseUrl: string;

  constructor(config: Auth0Config) {
    this.config = config;
    this.baseUrl = `https://${config.domain}`;
  }

  /**
   * Request a device code from Auth0.
   *
   * @returns Device code response containing codes and URLs
   * @throws AuthError if request fails
   */
  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const url = `${this.baseUrl}/oauth/device/code`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          audience: this.config.audience,
          scope: this.config.scope,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw AuthError.deviceCodeFailed(
          `Failed to request device code: ${response.status} - ${error}`,
        );
      }

      return (await response.json()) as DeviceCodeResponse;
    } catch (err) {
      if (err instanceof AuthError) {
        throw err;
      }
      throw AuthError.deviceCodeFailed(
        'Failed to request device code',
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Poll for token after user authorizes.
   *
   * @param deviceCode - Device code from requestDeviceCode
   * @param intervalSeconds - Polling interval in seconds
   * @param expiresInSeconds - Total timeout in seconds
   * @param onPoll - Optional callback for each poll attempt
   * @returns Token response on success
   * @throws AuthError on failure or timeout
   */
  async pollForToken(
    deviceCode: string,
    intervalSeconds: number,
    expiresInSeconds: number,
    onPoll?: (attempt: number, maxAttempts: number) => void,
  ): Promise<TokenResponse> {
    const maxAttempts = Math.ceil(expiresInSeconds / intervalSeconds);
    let currentInterval = intervalSeconds;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Wait before polling
      await this.delay(currentInterval * 1000);

      onPoll?.(attempt, maxAttempts);

      const result = await this.pollOnce(deviceCode);

      if (result.status === 'authorized' && result.tokens) {
        return result.tokens;
      }

      if (result.status === 'slow_down') {
        // Increase polling interval by 5 seconds as per OAuth spec
        currentInterval += 5;
        continue;
      }

      if (result.status === 'expired') {
        throw AuthError.tokenExpired('Authorization code expired. Please try again.');
      }

      if (result.status === 'access_denied') {
        throw AuthError.accessDenied();
      }

      // pending - continue polling
    }

    throw AuthError.timeout();
  }

  /**
   * Single poll attempt.
   */
  private async pollOnce(deviceCode: string): Promise<{
    status: PollingStatus;
    tokens?: TokenResponse;
  }> {
    const url = `${this.baseUrl}/oauth/token`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: this.config.clientId,
          device_code: deviceCode,
        }),
      });

      if (response.ok) {
        const tokens = (await response.json()) as TokenResponse;
        return { status: 'authorized', tokens };
      }

      const errorData = (await response.json()) as { error?: string };

      switch (errorData.error) {
        case 'authorization_pending':
          return { status: 'pending' };
        case 'slow_down':
          return { status: 'slow_down' };
        case 'expired_token':
          return { status: 'expired' };
        case 'access_denied':
          return { status: 'access_denied' };
        default:
          throw AuthError.pollFailed(`Unexpected error during polling: ${errorData.error}`);
      }
    } catch (err) {
      if (err instanceof AuthError) {
        throw err;
      }
      throw AuthError.pollFailed(
        'Failed to poll for token',
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Parse user info from ID token.
   * Note: This is a simple decode without verification (verification happens on Auth0 side).
   *
   * @param idToken - JWT ID token
   * @returns User info or null if parsing fails
   */
  parseIdToken(idToken: string): UserInfo | null {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = parts[1];
      // Handle URL-safe base64
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      const claims = JSON.parse(decoded);

      return {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
      };
    } catch {
      return null;
    }
  }

  /**
   * Delay helper.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Open a URL in the default browser.
 *
 * @param url - URL to open
 * @returns true if browser was opened, false otherwise
 */
export async function openBrowser(url: string): Promise<boolean> {
  try {
    // Dynamic import to avoid bundling issues
    const open = await import('open');
    await open.default(url);
    return true;
  } catch {
    // Fallback: try platform-specific commands
    return openBrowserFallback(url);
  }
}

/**
 * Fallback browser opener using platform-specific commands.
 */
async function openBrowserFallback(url: string): Promise<boolean> {
  const { spawn } = await import('node:child_process');

  const platform = process.platform;
  let command: string;
  let args: string[];

  switch (platform) {
    case 'darwin':
      command = 'open';
      args = [url];
      break;
    case 'win32':
      command = 'cmd';
      args = ['/c', 'start', '', url];
      break;
    default: // linux
      command = 'xdg-open';
      args = [url];
      break;
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      child.on('error', () => resolve(false));
      child.on('spawn', () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}
