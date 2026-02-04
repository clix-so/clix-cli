/**
 * Apple Push Notification Service (APNS) Key management.
 * Uses @expo/apple-utils Keys module for creating and managing push keys.
 *
 * Note: Push Key operations require USER authentication (Apple ID/Password),
 * not API Key authentication. This is a limitation of Apple's API.
 *
 * @module ios/push-key
 */

import { Keys } from '@expo/apple-utils';

import { getRequestContext, type UserAuthContext } from './apple-auth';

/**
 * Push Key information.
 */
export interface PushKey {
  /** Key ID from Apple Developer Portal */
  apnsKeyId: string;
  /** Key content (.p8 format) */
  apnsKeyP8: string;
  /** Apple Developer Team ID */
  teamId: string;
  /** Apple Developer Team Name */
  teamName?: string;
}

/**
 * Push Key store information (from Apple's listing).
 */
export interface PushKeyStoreInfo {
  id: string;
  name: string;
  canDownload: boolean;
  canRevoke: boolean;
}

/**
 * Error message when maximum keys are reached.
 */
export const APPLE_KEYS_TOO_MANY_ERROR = `
You can have only two Apple Keys generated on your Apple Developer account.
Revoke the old ones or reuse existing from your other apps.
Remember that Apple Keys are not application specific!
`;

const { MaxKeysCreatedError } = Keys;

/**
 * Format current date for key naming.
 */
function formatDateForKeyName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * List all existing push keys on Apple servers.
 *
 * **Requires USER authentication (Apple ID/Password), not API Key.**
 */
export async function listPushKeysAsync(userAuthCtx: UserAuthContext): Promise<PushKeyStoreInfo[]> {
  const context = getRequestContext(userAuthCtx);
  const keys = await Keys.getKeysAsync(context);
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    canDownload: key.canDownload,
    canRevoke: key.canRevoke,
  }));
}

/**
 * Create a new push key on Apple servers.
 *
 * **Requires USER authentication (Apple ID/Password), not API Key.**
 *
 * @param userAuthCtx User authentication context
 * @param name Optional custom name for the key (defaults to "Clix Push Notifications Key {timestamp}")
 */
export async function createPushKeyAsync(
  userAuthCtx: UserAuthContext,
  name?: string,
): Promise<PushKey> {
  const keyName = name || `Clix Push Notifications Key ${formatDateForKeyName()}`;

  try {
    const context = getRequestContext(userAuthCtx);

    // Create the key with APNS capability
    const key = await Keys.createKeyAsync(context, {
      name: keyName,
      isApns: true,
    });

    // Download the key content (.p8)
    let apnsKeyP8: string;
    try {
      apnsKeyP8 = await Keys.downloadKeyAsync(context, { id: key.id });
    } catch (downloadErr) {
      // Best-effort cleanup to avoid leaking a limited key slot (max 2 APNS keys per account)
      try {
        await Keys.revokeKeyAsync(context, { id: key.id });
      } catch {
        // Swallow revoke failure; original error is more relevant
      }
      throw downloadErr;
    }

    return {
      apnsKeyId: key.id,
      apnsKeyP8,
      teamId: userAuthCtx.team.id,
      teamName: userAuthCtx.team.name,
    };
  } catch (err: unknown) {
    const error = err as { rawDump?: { resultString?: string } };
    const resultString = error.rawDump?.resultString;

    if (
      err instanceof MaxKeysCreatedError ||
      (typeof resultString === 'string' && resultString.includes('maximum allowed number of Keys'))
    ) {
      throw new Error(APPLE_KEYS_TOO_MANY_ERROR);
    }
    throw err;
  }
}

/**
 * Revoke existing push keys on Apple servers.
 *
 * **Requires USER authentication (Apple ID/Password), not API Key.**
 *
 * @param userAuthCtx User authentication context
 * @param ids Key IDs to revoke
 */
export async function revokePushKeysAsync(
  userAuthCtx: UserAuthContext,
  ids: string[],
): Promise<void> {
  const context = getRequestContext(userAuthCtx);
  await Promise.all(ids.map((id) => Keys.revokeKeyAsync(context, { id })));
}

/**
 * Download an existing push key from Apple servers.
 *
 * **Requires USER authentication (Apple ID/Password), not API Key.**
 * **Note: Keys can only be downloaded once. If canDownload is false, this will fail.**
 *
 * @param userAuthCtx User authentication context
 * @param keyId The key ID to download
 */
export async function downloadPushKeyAsync(
  userAuthCtx: UserAuthContext,
  keyId: string,
): Promise<PushKey> {
  const context = getRequestContext(userAuthCtx);
  const apnsKeyP8 = await Keys.downloadKeyAsync(context, { id: keyId });

  return {
    apnsKeyId: keyId,
    apnsKeyP8,
    teamId: userAuthCtx.team.id,
    teamName: userAuthCtx.team.name,
  };
}

/**
 * Check if a push key is available for APNS.
 */
export function isPushKeyValid(key: PushKey): boolean {
  return !!(
    key.apnsKeyId &&
    key.apnsKeyP8 &&
    key.apnsKeyP8.includes('-----BEGIN PRIVATE KEY-----') &&
    key.teamId
  );
}
