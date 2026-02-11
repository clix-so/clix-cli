/**
 * Install preparation module.
 *
 * Handles all preparation steps before the AI agent is invoked for SDK installation.
 * Ensures config.jsonc is present and all required setup (Firebase, iOS) is complete.
 *
 * @module commands/skill/preparation
 */

import {
  getProjectConfigManager,
  type ProjectConfig,
  type ProjectType,
  type SetupStatus,
} from '@/lib/config';
import { FirebaseService } from '@/lib/services/firebase/firebase-service';
import { detectProjectType } from '@/lib/services/project-detector';

/**
 * Status of Firebase configuration.
 */
export interface FirebaseStatus {
  /** Whether Firebase is configured */
  configured: boolean;
  /** Whether Android config (google-services.json) exists and is valid */
  androidConfigured: boolean;
  /** Whether iOS config (GoogleService-Info.plist) exists and is valid */
  iosConfigured: boolean;
  /** Firebase project ID if detected */
  projectId?: string;
  /** Whether Firebase setup is needed based on project type */
  needed: boolean;
}

/**
 * Status of iOS configuration.
 */
export interface IosStatus {
  /** Whether iOS setup is needed based on project type */
  needed: boolean;
  /** Bundle ID if detected */
  bundleId?: string;
  /** Team ID if detected */
  teamId?: string;
  /** App Group ID if configured */
  appGroupId?: string;
  /** Whether entitlements are configured */
  entitlementsConfigured: boolean;
  /** Whether NSE is configured */
  nseConfigured: boolean;
}

/**
 * Context passed to the install skill after preparation.
 */
export interface PreparationContext {
  /** Project root path */
  projectPath: string;
  /** Loaded and migrated config */
  config: ProjectConfig;
  /** Detected or loaded project type */
  projectType: ProjectType;
  /** Firebase configuration status */
  firebase: FirebaseStatus;
  /** iOS configuration status */
  ios: IosStatus;
  /** Whether all required preparations are complete */
  ready: boolean;
  /** List of missing preparations */
  missing: string[];
}

/**
 * Result of checking if project is linked (config exists).
 */
export interface ProjectLinkStatus {
  /** Whether project is linked */
  linked: boolean;
  /** Config if linked */
  config?: ProjectConfig;
  /** Error message if not linked */
  error?: string;
}

/**
 * Check if the project is linked (config.jsonc exists).
 *
 * @param projectPath - Path to the project root
 * @returns Link status with config if available
 */
export async function checkProjectLinked(projectPath?: string): Promise<ProjectLinkStatus> {
  const manager = getProjectConfigManager(projectPath);

  try {
    const config = await manager.load();

    if (!config) {
      return {
        linked: false,
        error: 'Project not linked. Run "clix login" first.',
      };
    }

    return {
      linked: true,
      config,
    };
  } catch (error) {
    return {
      linked: false,
      error: error instanceof Error ? error.message : 'Failed to load project config',
    };
  }
}

/**
 * Ensure project type is detected.
 * If not present in config, auto-detect and save it.
 *
 * @param config - Current config
 * @param projectPath - Path to the project root
 * @returns Updated config with project type
 */
export async function ensureProjectType(
  config: ProjectConfig,
  projectPath: string,
): Promise<{ config: ProjectConfig; projectType: ProjectType }> {
  if (config.projectType) {
    return { config, projectType: config.projectType };
  }

  // Auto-detect project type
  const projectType = await detectProjectType(projectPath);

  // Save to config
  const manager = getProjectConfigManager(projectPath);
  const updatedConfig: ProjectConfig = {
    ...config,
    projectType,
  };
  await manager.save(updatedConfig);

  return { config: updatedConfig, projectType };
}

/**
 * Check Firebase configuration status.
 *
 * @param projectPath - Path to the project root
 * @param projectType - Detected project type
 * @param setup - Current setup status from config
 * @returns Firebase status
 */
export async function checkFirebaseStatus(
  projectPath: string,
  projectType: ProjectType,
  setup?: SetupStatus,
): Promise<FirebaseStatus> {
  // Determine if Firebase is needed based on project type
  const needed = projectType.target !== 'unknown';

  if (!needed) {
    return {
      configured: true,
      androidConfigured: true,
      iosConfigured: true,
      needed: false,
    };
  }

  // Always detect actual Firebase config files on disk
  const firebaseService = new FirebaseService(projectPath, projectType);
  const detection = await firebaseService.detect();
  const status = await firebaseService.getStatus();

  // Determine what's needed based on target platform
  const needsAndroid = projectType.target === 'android' || projectType.target === 'ios-android';
  const needsIos = projectType.target === 'ios' || projectType.target === 'ios-android';

  const androidConfigured = !needsAndroid || status.androidConfigured;
  const iosConfigured = !needsIos || status.iosConfigured;

  // Extract project ID from detected files, fallback to cached setup
  let projectId: string | undefined;
  if (detection.android?.content && 'project_info' in detection.android.content) {
    projectId = detection.android.content.project_info?.project_id;
  } else if (detection.ios?.content && 'PROJECT_ID' in detection.ios.content) {
    projectId = detection.ios.content.PROJECT_ID;
  } else if (setup?.firebase?.projectId) {
    projectId = setup.firebase.projectId;
  }

  return {
    configured: androidConfigured && iosConfigured,
    androidConfigured,
    iosConfigured,
    projectId,
    needed: true,
  };
}

/**
 * Check iOS configuration status.
 *
 * @param projectPath - Path to the project root
 * @param projectType - Detected project type
 * @param setup - Current setup status from config
 * @returns iOS status
 */
export async function checkIosStatus(
  _projectPath: string,
  projectType: ProjectType,
  setup?: SetupStatus,
): Promise<IosStatus> {
  // iOS setup is only needed for iOS or cross-platform targets
  const needed = projectType.target === 'ios' || projectType.target === 'ios-android';

  if (!needed) {
    return {
      needed: false,
      entitlementsConfigured: true,
      nseConfigured: true,
    };
  }

  // Check setup status from config
  if (setup?.ios) {
    return {
      needed: true,
      bundleId: setup.ios.bundleId,
      teamId: setup.ios.teamId,
      appGroupId: setup.ios.appGroupId,
      entitlementsConfigured: setup.ios.entitlementsConfigured,
      nseConfigured: setup.ios.nseConfigured,
    };
  }

  // No iOS setup recorded
  return {
    needed: true,
    entitlementsConfigured: false,
    nseConfigured: false,
  };
}

/**
 * Gather preparation context without running interactive setup.
 * This checks what's configured and what's missing.
 *
 * @param projectPath - Path to the project root (defaults to cwd)
 * @returns Preparation context with status information
 */
export async function gatherPreparationContext(
  projectPath: string = process.cwd(),
): Promise<PreparationContext | null> {
  // Step 1: Check if project is linked
  const linkStatus = await checkProjectLinked(projectPath);
  if (!linkStatus.linked || !linkStatus.config) {
    return null;
  }

  const config = linkStatus.config;

  // Step 2: Ensure project type is detected
  const { config: updatedConfig, projectType } = await ensureProjectType(config, projectPath);

  // Step 3: Check Firebase status
  const firebase = await checkFirebaseStatus(projectPath, projectType, updatedConfig.setup);

  // Step 4: Check iOS status
  const ios = await checkIosStatus(projectPath, projectType, updatedConfig.setup);

  // Step 5: Determine what's missing
  const missing: string[] = [];

  if (firebase.needed && !firebase.configured) {
    if (!firebase.androidConfigured) {
      missing.push('Firebase Android config (google-services.json)');
    }
    if (!firebase.iosConfigured) {
      missing.push('Firebase iOS config (GoogleService-Info.plist)');
    }
  }

  if (ios.needed) {
    if (!ios.entitlementsConfigured) {
      missing.push('iOS entitlements');
    }
    if (!ios.nseConfigured) {
      missing.push('Notification Service Extension');
    }
  }

  const ready = missing.length === 0;

  return {
    projectPath,
    config: updatedConfig,
    projectType,
    firebase,
    ios,
    ready,
    missing,
  };
}

/**
 * Update config with setup status after preparation is complete.
 *
 * @param projectPath - Path to the project root
 * @param firebase - Firebase status to save
 * @param ios - iOS status to save
 */
export async function saveSetupStatus(
  projectPath: string,
  firebase: FirebaseStatus,
  ios: IosStatus,
): Promise<void> {
  const manager = getProjectConfigManager(projectPath);
  const now = new Date().toISOString();

  const setupUpdate: SetupStatus = {};

  if (firebase.needed) {
    setupUpdate.firebase = {
      projectId: firebase.projectId,
      androidConfigured: firebase.androidConfigured,
      iosConfigured: firebase.iosConfigured,
      completedAt: firebase.configured ? now : undefined,
    };
  }

  if (ios.needed) {
    setupUpdate.ios = {
      bundleId: ios.bundleId,
      teamId: ios.teamId,
      appGroupId: ios.appGroupId,
      entitlementsConfigured: ios.entitlementsConfigured,
      nseConfigured: ios.nseConfigured,
      completedAt: ios.entitlementsConfigured && ios.nseConfigured ? now : undefined,
    };
  }

  await manager.updateSetup(setupUpdate);
}
