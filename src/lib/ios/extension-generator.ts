/**
 * Notification Service Extension file generator
 * Creates the necessary files for NSE without requiring AI agent
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateExtensionEntitlements, writeEntitlements } from './entitlements-manager';
import {
  EXTENSION_INFO_PLIST_TEMPLATE,
  NOTIFICATION_SERVICE_TEMPLATE,
} from './extension-templates';

export interface ExtensionContext {
  appName: string;
  bundleId: string;
  iosDir: string;
  pushEnvironment?: 'development' | 'production';
}

export interface ExtensionGeneratorResult {
  success: boolean;
  createdFiles: string[];
  extensionDir: string;
  extensionName: string;
  error?: string;
}

/**
 * Get the extension name from app name
 */
export function getExtensionName(appName: string): string {
  return `${appName}NotificationServiceExtension`;
}

/**
 * Get the extension bundle ID from main app bundle ID
 */
export function getExtensionBundleId(bundleId: string, appName: string): string {
  return `${bundleId}.${getExtensionName(appName)}`;
}

/**
 * Check if extension files already exist
 */
export function extensionFilesExist(iosDir: string, appName: string): boolean {
  const extensionName = getExtensionName(appName);
  const extensionDir = path.join(iosDir, extensionName);
  const swiftPath = path.join(extensionDir, 'NotificationService.swift');

  return fs.existsSync(swiftPath);
}

/**
 * Create Notification Service Extension files
 */
export async function createExtensionFiles(
  context: ExtensionContext,
): Promise<ExtensionGeneratorResult> {
  const extensionName = getExtensionName(context.appName);
  const extensionDir = path.join(context.iosDir, extensionName);
  const createdFiles: string[] = [];
  const pushEnvironment = context.pushEnvironment || 'development';

  try {
    // 1. Create extension directory
    if (!fs.existsSync(extensionDir)) {
      fs.mkdirSync(extensionDir, { recursive: true });
    }

    // 2. Create NotificationService.swift
    const swiftPath = path.join(extensionDir, 'NotificationService.swift');
    if (!fs.existsSync(swiftPath)) {
      fs.writeFileSync(swiftPath, NOTIFICATION_SERVICE_TEMPLATE.trim());
      createdFiles.push(swiftPath);
    }

    // 3. Create Info.plist
    const plistPath = path.join(extensionDir, 'Info.plist');
    if (!fs.existsSync(plistPath)) {
      fs.writeFileSync(plistPath, EXTENSION_INFO_PLIST_TEMPLATE.trim());
      createdFiles.push(plistPath);
    }

    // 4. Create extension entitlements
    const entitlementsPath = path.join(extensionDir, `${extensionName}.entitlements`);
    if (!fs.existsSync(entitlementsPath)) {
      const entitlements = generateExtensionEntitlements(context.bundleId, pushEnvironment);
      await writeEntitlements(entitlementsPath, entitlements);
      createdFiles.push(entitlementsPath);
    }

    return {
      success: true,
      createdFiles,
      extensionDir,
      extensionName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      createdFiles,
      extensionDir,
      extensionName,
      error: message,
    };
  }
}

/**
 * Verify extension files are complete
 */
export function verifyExtensionFiles(
  iosDir: string,
  appName: string,
): { complete: boolean; missingFiles: string[] } {
  const extensionName = getExtensionName(appName);
  const extensionDir = path.join(iosDir, extensionName);

  const requiredFiles = [
    'NotificationService.swift',
    'Info.plist',
    `${extensionName}.entitlements`,
  ];

  const missingFiles: string[] = [];

  for (const file of requiredFiles) {
    const filePath = path.join(extensionDir, file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
    }
  }

  return {
    complete: missingFiles.length === 0,
    missingFiles,
  };
}
