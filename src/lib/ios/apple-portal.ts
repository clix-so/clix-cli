import * as fs from 'node:fs';
import type { RequestContext } from '@expo/apple-utils';
import {
  AppGroup,
  BundleId,
  BundleIdPlatform,
  CapabilityType,
  CapabilityTypeOption,
  Token,
} from '@expo/apple-utils';

export interface ApiKeyAuthConfig {
  /** API Key ID from App Store Connect */
  keyId: string;
  /** Issuer ID from App Store Connect */
  issuerId: string;
  /** Contents of the .p8 file */
  keyP8: string;
}

export interface AppleAuthConfig {
  /** API Key authentication (recommended) */
  apiKey?: ApiKeyAuthConfig;
}

export interface CapabilitySyncResult {
  /** Capabilities that were enabled */
  enabled: string[];
  /** Capabilities that were already enabled */
  alreadyEnabled: string[];
  /** App group ID that was created or used */
  appGroupId?: string;
  /** Whether app group was newly created */
  appGroupCreated: boolean;
}

/**
 * Create authentication context using API Key
 */
export async function createAuthContext(config: AppleAuthConfig): Promise<RequestContext> {
  if (!config.apiKey) {
    throw new Error(
      'API Key authentication is required. Please provide --api-key, --issuer-id, and --key-id flags.',
    );
  }

  const { keyId, issuerId, keyP8 } = config.apiKey;

  // Validate inputs
  if (!keyId || !issuerId || !keyP8) {
    throw new Error(
      'Missing required API Key parameters: keyId, issuerId, and keyP8 are all required.',
    );
  }

  const token = new Token({
    key: keyP8,
    issuerId,
    keyId,
    duration: 1200, // 20 minutes
  });

  return { token };
}

/**
 * Load API Key from .p8 file
 */
export function loadApiKeyFromFile(p8FilePath: string): string {
  if (!fs.existsSync(p8FilePath)) {
    throw new Error(`API Key file not found: ${p8FilePath}`);
  }

  const content = fs.readFileSync(p8FilePath, 'utf-8');

  // Validate it looks like a .p8 key
  if (!content.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error(
      `Invalid API Key file: ${p8FilePath}. File should be a .p8 private key file from App Store Connect.`,
    );
  }

  return content;
}

/**
 * Find or create Bundle ID in Apple Developer Portal
 */
export async function findOrCreateBundleId(
  context: RequestContext,
  bundleIdentifier: string,
  name?: string,
): Promise<BundleId> {
  // Try to find existing Bundle ID
  const existingBundleId = await BundleId.findAsync(context, {
    identifier: bundleIdentifier,
  });

  if (existingBundleId) {
    return existingBundleId;
  }

  // Create new Bundle ID
  const displayName = name || bundleIdentifier.split('.').pop() || bundleIdentifier;
  const newBundleId = await BundleId.createAsync(context, {
    name: displayName,
    identifier: bundleIdentifier,
    platform: BundleIdPlatform.IOS,
  });

  return newBundleId;
}

/**
 * Find or create App Group in Apple Developer Portal
 */
export async function findOrCreateAppGroup(
  context: RequestContext,
  appGroupIdentifier: string,
): Promise<{ appGroup: AppGroup; created: boolean }> {
  // Try to find existing App Group
  const existingGroups = await AppGroup.getAsync(context, {
    query: {
      filter: { identifier: appGroupIdentifier },
    },
  });

  if (existingGroups && existingGroups.length > 0) {
    return { appGroup: existingGroups[0] as AppGroup, created: false };
  }

  // Create new App Group
  const newAppGroup = await AppGroup.createAsync(context, {
    identifier: appGroupIdentifier,
    name: appGroupIdentifier,
  });

  return { appGroup: newAppGroup as AppGroup, created: true };
}

/**
 * Sync capabilities for a Bundle ID
 * Enables Push Notifications and App Groups
 */
export async function syncCapabilities(
  context: RequestContext,
  bundleIdentifier: string,
  appGroupIdentifier: string,
): Promise<CapabilitySyncResult> {
  const result: CapabilitySyncResult = {
    enabled: [],
    alreadyEnabled: [],
    appGroupCreated: false,
  };

  // Find or create Bundle ID
  const bundleId = await findOrCreateBundleId(context, bundleIdentifier);

  // Get current capabilities
  const currentCapabilities = await bundleId.getBundleIdCapabilitiesAsync();

  // Check Push Notifications
  const hasPush = currentCapabilities.some((cap) => cap.isType(CapabilityType.PUSH_NOTIFICATIONS));

  // Check App Groups
  const hasAppGroups = currentCapabilities.some((cap) => cap.isType(CapabilityType.APP_GROUP));

  // Find or create App Group
  const { appGroup, created: appGroupCreated } = await findOrCreateAppGroup(
    context,
    appGroupIdentifier,
  );
  result.appGroupId = appGroupIdentifier;
  result.appGroupCreated = appGroupCreated;

  // Build update request
  const updateRequests: Array<{
    capabilityType: CapabilityType;
    option: typeof CapabilityTypeOption.ON;
    relationships?: { appGroups: string[] };
  }> = [];

  // Add Push Notifications if not enabled
  if (!hasPush) {
    updateRequests.push({
      capabilityType: CapabilityType.PUSH_NOTIFICATIONS,
      option: CapabilityTypeOption.ON,
    });
    result.enabled.push('Push Notifications');
  } else {
    result.alreadyEnabled.push('Push Notifications');
  }

  // Add App Groups if not enabled
  if (!hasAppGroups) {
    updateRequests.push({
      capabilityType: CapabilityType.APP_GROUP,
      option: CapabilityTypeOption.ON,
      relationships: { appGroups: [appGroup.id] },
    });
    result.enabled.push('App Groups');
  } else {
    result.alreadyEnabled.push('App Groups');

    // Even if App Groups is enabled, we might need to add our App Group
    // Update the capability to include our app group
    try {
      await bundleId.updateBundleIdCapabilityAsync({
        capabilityType: CapabilityType.APP_GROUP,
        option: CapabilityTypeOption.ON,
        relationships: { appGroups: [appGroup.id] },
      });
    } catch {
      // App group might already be associated - this is expected behavior
    }
  }

  // Apply updates if any
  if (updateRequests.length > 0) {
    await bundleId.updateBundleIdCapabilityAsync(updateRequests);
  }

  return result;
}

/**
 * Validate API Key credentials by making a test API call
 */
export async function validateCredentials(context: RequestContext): Promise<boolean> {
  try {
    // Try to list bundle IDs - this will fail if credentials are invalid
    await BundleId.getAsync(context, { query: { limit: 1 } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get human-readable error message for Apple API errors
 */
export function getAppleApiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    if (message.includes('401') || message.includes('Unauthorized')) {
      return 'Invalid API Key credentials. Please check your Key ID, Issuer ID, and .p8 file.';
    }

    if (message.includes('403') || message.includes('Forbidden')) {
      return 'API Key does not have sufficient permissions. Ensure it has App Manager or Admin role.';
    }

    if (message.includes('404')) {
      return 'Bundle ID not found in Apple Developer Portal.';
    }

    if (message.includes('409')) {
      return 'Conflict: Resource already exists or is in an invalid state.';
    }

    return message;
  }

  return String(error);
}
