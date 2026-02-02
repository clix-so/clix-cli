/**
 * Xcode project (.pbxproj) modifier for iOS setup automation.
 * Uses the 'xcode' npm package to programmatically modify Xcode projects.
 *
 * @module ios/pbxproj-modifier
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import xcode from 'xcode';

const NSE_PRODUCT_TYPE = 'com.apple.product-type.app-extension';

/**
 * Options for pbxproj modification operations.
 */
export interface PbxprojModifierOptions {
  /** Path to .xcodeproj directory */
  projectPath: string;
  /** Extension target name (e.g., "AppNotificationServiceExtension") */
  extensionName: string;
  /** Extension bundle ID (e.g., "com.example.app.AppNotificationServiceExtension") */
  extensionBundleId: string;
  /** Path where extension files are located */
  extensionDir: string;
  /** App group for shared data */
  appGroupId: string;
  /** Development team ID */
  teamId?: string;
  /** iOS deployment target (default: "14.0") */
  deploymentTarget?: string;
}

/**
 * Result of pbxproj modification operations.
 */
export interface PbxprojModificationResult {
  success: boolean;
  targetAdded: boolean;
  filesLinked: string[];
  buildSettingsApplied: string[];
  warnings: string[];
  error?: string;
}

/**
 * Check if NSE target already exists in the project.
 */
export function hasNotificationServiceExtension(
  projectPath: string,
  extensionName: string,
): boolean {
  const pbxprojPath = path.join(projectPath, 'project.pbxproj');
  if (!fs.existsSync(pbxprojPath)) {
    return false;
  }

  try {
    const project = xcode.project(pbxprojPath);
    project.parseSync();

    const targets = project.pbxNativeTargetSection();
    if (!targets) return false;

    for (const key of Object.keys(targets)) {
      const target = targets[key] as { name?: string } | undefined;
      if (target && typeof target === 'object' && target.name === extensionName) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Create backup of the Xcode project file.
 */
export function backupProject(projectPath: string): string {
  const pbxprojPath = path.join(projectPath, 'project.pbxproj');
  const backupPath = `${pbxprojPath}.backup.${Date.now()}`;
  fs.copyFileSync(pbxprojPath, backupPath);
  return backupPath;
}

/**
 * Restore project from backup.
 */
export function restoreProject(backupPath: string, projectPath: string): void {
  const pbxprojPath = path.join(projectPath, 'project.pbxproj');
  fs.copyFileSync(backupPath, pbxprojPath);
}

/**
 * Add Notification Service Extension target to Xcode project.
 */
export async function addNotificationServiceExtension(
  options: PbxprojModifierOptions,
): Promise<PbxprojModificationResult> {
  const result: PbxprojModificationResult = {
    success: false,
    targetAdded: false,
    filesLinked: [],
    buildSettingsApplied: [],
    warnings: [],
  };

  const pbxprojPath = path.join(options.projectPath, 'project.pbxproj');

  if (!fs.existsSync(pbxprojPath)) {
    result.error = `Project file not found: ${pbxprojPath}`;
    return result;
  }

  try {
    // 1. Parse project
    const project = xcode.project(pbxprojPath);
    project.parseSync();

    // 2. Check if target already exists
    if (hasNotificationServiceExtension(options.projectPath, options.extensionName)) {
      result.warnings.push('NSE target already exists, skipping target creation');
      result.success = true;
      return result;
    }

    // 3. Add NSE target
    const target = project.addTarget(
      options.extensionName,
      NSE_PRODUCT_TYPE,
      options.extensionName,
      options.extensionBundleId,
    );

    if (!target) {
      result.error = 'Failed to add target to project';
      return result;
    }

    result.targetAdded = true;

    // 4. Add source file (NotificationService.swift)
    const swiftFile = path.join(options.extensionDir, 'NotificationService.swift');
    if (fs.existsSync(swiftFile)) {
      const groupKey = project.findPBXGroupKey({ name: options.extensionName });
      if (groupKey) {
        project.addSourceFile('NotificationService.swift', { target: target.uuid }, groupKey);
        result.filesLinked.push('NotificationService.swift');
      } else {
        result.warnings.push('Could not find group for extension, files may need manual linking');
      }
    }

    // 5. Set build settings for the extension target
    const deploymentTarget = options.deploymentTarget || '14.0';
    const buildSettings: Record<string, string> = {
      CODE_SIGN_ENTITLEMENTS: `${options.extensionName}/${options.extensionName}.entitlements`,
      ENABLE_USER_SCRIPT_SANDBOXING: 'NO',
      INFOPLIST_FILE: `${options.extensionName}/Info.plist`,
      PRODUCT_BUNDLE_IDENTIFIER: options.extensionBundleId,
      IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget,
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: '1,2',
      GENERATE_INFOPLIST_FILE: 'NO',
    };

    if (options.teamId) {
      buildSettings.DEVELOPMENT_TEAM = options.teamId;
    }

    // Apply build settings to both Debug and Release configurations
    for (const [setting, value] of Object.entries(buildSettings)) {
      try {
        project.updateBuildProperty(setting, value, null, options.extensionName);
        result.buildSettingsApplied.push(setting);
      } catch {
        result.warnings.push(`Could not set ${setting}, may need manual configuration`);
      }
    }

    // 6. Add target dependency to main app (embed extension)
    const firstTarget = project.getFirstTarget();
    if (firstTarget?.uuid) {
      try {
        project.addTargetDependency(firstTarget.uuid, [target.uuid]);
      } catch {
        result.warnings.push(
          'Could not add target dependency, extension may need manual embedding',
        );
      }
    }

    // 7. Write changes to project file
    fs.writeFileSync(pbxprojPath, project.writeSync());

    result.success = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * Get all native targets in the project.
 */
export function getProjectTargets(projectPath: string): string[] {
  const pbxprojPath = path.join(projectPath, 'project.pbxproj');
  if (!fs.existsSync(pbxprojPath)) {
    return [];
  }

  try {
    const project = xcode.project(pbxprojPath);
    project.parseSync();

    const targets = project.pbxNativeTargetSection();
    if (!targets) return [];

    const targetNames: string[] = [];
    for (const key of Object.keys(targets)) {
      const target = targets[key] as { name?: string } | undefined;
      if (target && typeof target === 'object' && target.name) {
        targetNames.push(target.name);
      }
    }
    return targetNames;
  } catch {
    return [];
  }
}
