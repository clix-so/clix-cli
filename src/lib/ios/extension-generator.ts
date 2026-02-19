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
  projectId?: string;
}

export interface ExtensionGeneratorResult {
  success: boolean;
  createdFiles: string[];
  modifiedFiles: string[];
  extensionDir: string;
  extensionName: string;
  warnings: string[];
  error?: string;
}

export interface NotificationServiceStatus {
  exists: boolean;
  path: string;
  importsClix: boolean;
  inheritsClixNse: boolean;
  hasRegisterCall: boolean;
  hasSuperDidReceive: boolean;
  registeredProjectId: string | null;
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

export function getNotificationServiceSwiftPath(iosDir: string, appName: string): string {
  const extensionName = getExtensionName(appName);
  return path.join(iosDir, extensionName, 'NotificationService.swift');
}

/**
 * Check if extension files already exist
 */
export function extensionFilesExist(iosDir: string, appName: string): boolean {
  const swiftPath = getNotificationServiceSwiftPath(iosDir, appName);

  return fs.existsSync(swiftPath);
}

function getRegisterProjectId(content: string): string | null {
  const match = content.match(/register\s*\(\s*projectId:\s*"([^"]+)"\s*\)/);
  return match?.[1] ?? null;
}

function hasClixInheritance(content: string): boolean {
  return /class\s+NotificationService\s*:\s*ClixNotificationServiceExtension/.test(content);
}

function hasSuperDidReceiveCall(content: string): boolean {
  return /super\.didReceive\s*\(\s*request\s*,\s*withContentHandler:\s*contentHandler\s*\)/.test(
    content,
  );
}

export function inspectNotificationServiceSwift(
  iosDir: string,
  appName: string,
): NotificationServiceStatus {
  const swiftPath = getNotificationServiceSwiftPath(iosDir, appName);
  if (!fs.existsSync(swiftPath)) {
    return {
      exists: false,
      path: swiftPath,
      importsClix: false,
      inheritsClixNse: false,
      hasRegisterCall: false,
      hasSuperDidReceive: false,
      registeredProjectId: null,
    };
  }

  const content = fs.readFileSync(swiftPath, 'utf-8');
  const registeredProjectId = getRegisterProjectId(content);

  return {
    exists: true,
    path: swiftPath,
    importsClix: /import\s+Clix/.test(content),
    inheritsClixNse: hasClixInheritance(content),
    hasRegisterCall: registeredProjectId !== null,
    hasSuperDidReceive: hasSuperDidReceiveCall(content),
    registeredProjectId,
  };
}

export function ensureNotificationServiceSwiftProjectId(
  iosDir: string,
  appName: string,
  projectId: string,
): { changed: boolean; path: string; warnings: string[] } {
  const status = inspectNotificationServiceSwift(iosDir, appName);
  const warnings: string[] = [];

  if (!status.exists) {
    return { changed: false, path: status.path, warnings: ['NotificationService.swift not found'] };
  }

  let content = fs.readFileSync(status.path, 'utf-8');
  const original = content;

  if (!status.importsClix && content.includes('import UserNotifications')) {
    content = content.replace(
      /import UserNotifications\s*/,
      'import UserNotifications\nimport Clix\n',
    );
  }

  if (!hasClixInheritance(content)) {
    warnings.push('NotificationService class does not inherit ClixNotificationServiceExtension');
  }

  if (/register\s*\(\s*projectId:\s*"[^"]*"\s*\)/.test(content)) {
    content = content.replace(
      /register\s*\(\s*projectId:\s*"[^"]*"\s*\)/,
      `register(projectId: "${projectId}")`,
    );
  } else if (/override\s+init\s*\(\s*\)\s*\{/.test(content)) {
    content = content.replace(
      /override\s+init\s*\(\s*\)\s*\{\s*([\s\S]*?)\s*\}/,
      (match, body: string) => {
        if (/register\s*\(\s*projectId:/.test(body)) {
          return match;
        }
        if (/super\.init\s*\(\s*\)/.test(body)) {
          return match.replace(
            /super\.init\s*\(\s*\)/,
            `super.init()\n        register(projectId: "${projectId}")`,
          );
        }
        return `override init() {\n        super.init()\n        register(projectId: "${projectId}")\n    }`;
      },
    );
  } else {
    warnings.push('Could not find override init() to inject register(projectId:)');
  }

  if (!hasSuperDidReceiveCall(content)) {
    warnings.push('didReceive does not call super.didReceive(request, withContentHandler:)');
  }

  if (content !== original) {
    fs.writeFileSync(status.path, content, 'utf-8');
  }

  return {
    changed: content !== original,
    path: status.path,
    warnings,
  };
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
  const modifiedFiles: string[] = [];
  const warnings: string[] = [];
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

    if (context.projectId) {
      const patchResult = ensureNotificationServiceSwiftProjectId(
        context.iosDir,
        context.appName,
        context.projectId,
      );
      if (patchResult.changed) {
        modifiedFiles.push(patchResult.path);
      }
      warnings.push(...patchResult.warnings);
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
      modifiedFiles,
      extensionDir,
      extensionName,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      createdFiles,
      modifiedFiles,
      extensionDir,
      extensionName,
      warnings,
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
