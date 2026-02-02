import * as fs from 'node:fs';
import * as path from 'node:path';
import plist, { type PlistValue } from 'plist';

export interface EntitlementsConfig {
  /** Push notification environment: development or production */
  pushNotifications?: 'development' | 'production';
  /** App group identifiers */
  appGroups?: string[];
}

export interface EntitlementsData {
  'aps-environment'?: 'development' | 'production';
  'com.apple.security.application-groups'?: string[];
  [key: string]: unknown;
}

/**
 * Read and parse an entitlements file
 */
export async function readEntitlements(entitlementsPath: string): Promise<EntitlementsData | null> {
  if (!fs.existsSync(entitlementsPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(entitlementsPath, 'utf-8');
    return plist.parse(content) as EntitlementsData;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse entitlements file: ${message}`);
  }
}

/**
 * Write entitlements data to a file
 */
export async function writeEntitlements(
  entitlementsPath: string,
  data: EntitlementsData,
): Promise<void> {
  const content = plist.build(data as PlistValue);

  // Ensure directory exists
  const dir = path.dirname(entitlementsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(entitlementsPath, content, 'utf-8');
}

/**
 * Generate App Group identifier from bundle ID
 * Format: group.clix.{bundleId}
 */
export function generateAppGroupId(bundleId: string): string {
  return `group.clix.${bundleId}`;
}

/**
 * Create or update entitlements with Clix configuration
 */
export async function updateEntitlementsForClix(
  entitlementsPath: string,
  bundleId: string,
  options: {
    pushEnvironment?: 'development' | 'production';
    existingEntitlements?: EntitlementsData | null;
  } = {},
): Promise<EntitlementsData> {
  const { pushEnvironment = 'development', existingEntitlements = null } = options;

  // Start with existing entitlements or empty object
  const entitlements: EntitlementsData = existingEntitlements ? { ...existingEntitlements } : {};

  // Add push notification environment
  entitlements['aps-environment'] = pushEnvironment;

  // Add app group
  const appGroupId = generateAppGroupId(bundleId);
  const existingGroups = entitlements['com.apple.security.application-groups'] || [];
  if (!existingGroups.includes(appGroupId)) {
    entitlements['com.apple.security.application-groups'] = [...existingGroups, appGroupId];
  }

  // Write the entitlements file
  await writeEntitlements(entitlementsPath, entitlements);

  return entitlements;
}

/**
 * Generate entitlements file path for a target
 */
export function getEntitlementsPath(projectDir: string, targetName: string): string {
  return path.join(projectDir, targetName, `${targetName}.entitlements`);
}

/**
 * Check if entitlements have Clix configuration
 */
export function hasClixConfiguration(
  entitlements: EntitlementsData | null,
  bundleId: string,
): { hasPush: boolean; hasAppGroup: boolean } {
  if (!entitlements) {
    return { hasPush: false, hasAppGroup: false };
  }

  const hasPush = entitlements['aps-environment'] !== undefined;
  const appGroupId = generateAppGroupId(bundleId);
  const appGroups = entitlements['com.apple.security.application-groups'] || [];
  const hasAppGroup = appGroups.includes(appGroupId);

  return { hasPush, hasAppGroup };
}

/**
 * Get summary of entitlements configuration
 */
export function getEntitlementsSummary(entitlements: EntitlementsData): string[] {
  const summary: string[] = [];

  if (entitlements['aps-environment']) {
    summary.push(`Push Notifications: ${entitlements['aps-environment']}`);
  }

  const appGroups = entitlements['com.apple.security.application-groups'];
  if (appGroups && appGroups.length > 0) {
    summary.push(`App Groups: ${appGroups.join(', ')}`);
  }

  return summary;
}

/**
 * Generate Notification Service Extension entitlements
 */
export function generateExtensionEntitlements(
  bundleId: string,
  pushEnvironment: 'development' | 'production' = 'development',
): EntitlementsData {
  const appGroupId = generateAppGroupId(bundleId);

  return {
    'aps-environment': pushEnvironment,
    'com.apple.security.application-groups': [appGroupId],
  };
}
