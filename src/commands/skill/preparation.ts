/**
 * Install preparation module.
 *
 * Handles all preparation steps before the AI agent is invoked for SDK installation.
 * Ensures config.jsonc is present and all required setup (Firebase, iOS) is complete.
 *
 * @module commands/skill/preparation
 */

import type { SenderConfig } from '@/lib/api';
import { getInternalApiClient } from '@/lib/api';
import {
  getProjectConfigManager,
  type ProjectConfig,
  type ProjectType,
  type SetupStatus,
} from '@/lib/config';
import {
  analyzeIosProject,
  generateAppGroupId,
  getExtensionBundleId,
  getExtensionName,
  getIosProjectDir,
  getNotificationServiceExtensionStatus,
  hasClixConfiguration,
  hasClixPodInExtensionTarget,
  hasExtensionTarget,
  hasNotificationServiceExtension,
  hasPodfile,
  inspectNotificationServiceSwift,
  readEntitlements,
  verifyExtensionFiles,
} from '@/lib/ios';
import { FirebaseService } from '@/lib/services/firebase/firebase-service';
import { parseBase64ServiceAccountJson } from '@/lib/services/firebase/service-account-validator';
import type { FirebaseDetectionResult } from '@/lib/services/firebase/types';
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
  /** Whether app push sender config is registered in Clix project */
  senderConfigConfigured: boolean;
  /** Whether sender config project matches detected Firebase config files */
  senderConfigProjectMatched?: boolean;
  /** Firebase project ID if detected */
  projectId?: string;
  /** Whether Firebase setup is needed based on project type */
  needed: boolean;
}

interface SenderConfigStatus {
  configured: boolean;
  projectMatched: boolean;
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
  /** Detailed evidence for NSE setup verification */
  nseDetails?: NseVerificationStatus;
}

export interface NseVerificationStatus {
  extensionName?: string;
  extensionBundleId?: string;
  filesComplete: boolean;
  xcodeTargetConfigured: boolean;
  buildSettingsConfigured: boolean;
  podDependencyConfigured: boolean;
  notificationServiceConfigured: boolean;
}

/**
 * Status of APNS key setup for Firebase iOS push.
 */
export interface ApnsStatus {
  /** Whether APNS setup is needed based on project type */
  needed: boolean;
  /** APNS Key ID if configured */
  keyId?: string;
  /** Apple Team ID if configured */
  teamId?: string;
  /** Whether APNS key is registered with Firebase */
  registeredWithFirebase: boolean;
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
  /** APNS configuration status */
  apns: ApnsStatus;
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

function getFirebaseProjectIdsFromDetection(detection: FirebaseDetectionResult): string[] {
  const detectedProjectIds: string[] = [];

  if (detection.android?.content && 'project_info' in detection.android.content) {
    const androidProjectId = detection.android.content.project_info?.project_id;
    if (androidProjectId) {
      detectedProjectIds.push(androidProjectId);
    }
  }

  if (detection.ios?.content && 'PROJECT_ID' in detection.ios.content) {
    const iosProjectId = detection.ios.content.PROJECT_ID;
    if (iosProjectId) {
      detectedProjectIds.push(iosProjectId);
    }
  }

  return [...new Set(detectedProjectIds)];
}

function decodeSenderConfigProjectIds(senderConfig: SenderConfig): string[] | null {
  const encodedServiceAccounts = [
    senderConfig.app_push?.ios_config?.fcm_sa_json_base64_encoded,
    senderConfig.app_push?.android_config?.fcm_sa_json_base64_encoded,
  ].filter((encoded): encoded is string => Boolean(encoded));

  if (encodedServiceAccounts.length === 0) {
    return null;
  }

  const decodedProjectIds: string[] = [];
  for (const encodedServiceAccount of encodedServiceAccounts) {
    const parsed = parseBase64ServiceAccountJson(encodedServiceAccount);
    if (!parsed.valid || !parsed.data) {
      return null;
    }

    decodedProjectIds.push(parsed.data.project_id);
  }

  return [...new Set(decodedProjectIds)];
}

/**
 * Check whether app push sender config is registered for the Clix project
 * and whether it matches locally detected Firebase config project IDs.
 *
 * API/network errors are treated as not configured to avoid false positives.
 */
async function getAppPushSenderConfigStatus(
  clixProjectId: string | undefined,
  localFirebaseProjectIds: string[],
): Promise<SenderConfigStatus> {
  if (!clixProjectId) {
    return { configured: false, projectMatched: false };
  }

  try {
    const apiClient = getInternalApiClient();
    const project = await apiClient.getProject(clixProjectId);
    const appPushConfig = project.sender_configs?.find(
      (config) => config.channel_type === 'CHANNEL_TYPE_APP_PUSH',
    );

    if (!appPushConfig) {
      return { configured: false, projectMatched: false };
    }

    if (localFirebaseProjectIds.length !== 1) {
      return { configured: true, projectMatched: false };
    }

    const senderProjectIds = decodeSenderConfigProjectIds(appPushConfig);
    if (!senderProjectIds || senderProjectIds.length !== 1) {
      return { configured: true, projectMatched: false };
    }

    const [localProjectId] = localFirebaseProjectIds;
    const [senderProjectId] = senderProjectIds;
    return {
      configured: true,
      projectMatched: senderProjectId === localProjectId,
    };
  } catch {
    return { configured: false, projectMatched: false };
  }
}

/**
 * Check Firebase configuration status.
 *
 * @param projectPath - Path to the project root
 * @param projectType - Detected project type
 * @param setup - Current setup status from config
 * @param clixProjectId - Clix project ID for sender config verification
 * @returns Firebase status
 */
export async function checkFirebaseStatus(
  projectPath: string,
  projectType: ProjectType,
  setup?: SetupStatus,
  clixProjectId?: string,
): Promise<FirebaseStatus> {
  // Determine if Firebase is needed based on project type
  const needed = projectType.target !== 'unknown';

  if (!needed) {
    return {
      configured: true,
      androidConfigured: true,
      iosConfigured: true,
      senderConfigConfigured: true,
      senderConfigProjectMatched: true,
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
  const credentialFilesConfigured = androidConfigured && iosConfigured;
  const localProjectIds = getFirebaseProjectIdsFromDetection(detection);
  const senderConfigStatus = credentialFilesConfigured
    ? await getAppPushSenderConfigStatus(clixProjectId, localProjectIds)
    : { configured: false, projectMatched: false };
  const senderConfigConfigured = senderConfigStatus.configured;
  const senderConfigProjectMatched = senderConfigStatus.projectMatched;

  // Extract project ID from detected files, fallback to cached setup
  let projectId: string | undefined;
  if (localProjectIds.length > 0) {
    projectId = localProjectIds[0];
  } else if (setup?.firebase?.projectId) {
    projectId = setup.firebase.projectId;
  }

  return {
    configured: credentialFilesConfigured && senderConfigConfigured && senderConfigProjectMatched,
    androidConfigured,
    iosConfigured,
    senderConfigConfigured,
    senderConfigProjectMatched,
    projectId,
    needed: true,
  };
}

interface IosFileStatus {
  bundleId?: string;
  teamId?: string;
  appGroupId?: string;
  entitlementsConfigured: boolean;
  nseConfigured: boolean;
  nseDetails?: NseVerificationStatus;
}

/**
 * Detect iOS setup status from actual project files.
 */
async function detectIosStatusFromFiles(
  projectPath: string,
  setup?: SetupStatus['ios'],
): Promise<IosFileStatus> {
  const analysis = await analyzeIosProject(projectPath).catch(() => ({
    success: false as const,
  }));

  if (!analysis.success || !analysis.project) {
    return {
      bundleId: setup?.bundleId,
      teamId: setup?.teamId,
      appGroupId: setup?.appGroupId,
      entitlementsConfigured: false,
      nseConfigured: false,
    };
  }

  const project = analysis.project;
  const expectedAppGroupId = generateAppGroupId(project.bundleId);
  let hasEntitlements = false;
  let detectedAppGroupId: string | undefined;

  for (const entitlementsPath of project.entitlementsFiles) {
    try {
      const entitlements = await readEntitlements(entitlementsPath);
      const clixConfig = hasClixConfiguration(entitlements, project.bundleId);
      if (!clixConfig.hasPush || !clixConfig.hasAppGroup) {
        continue;
      }

      hasEntitlements = true;
      const appGroups = entitlements?.['com.apple.security.application-groups'];
      if (Array.isArray(appGroups)) {
        detectedAppGroupId =
          appGroups.find((group) => group === expectedAppGroupId) ??
          appGroups[0] ??
          detectedAppGroupId;
      }
      break;
    } catch {
      // Ignore malformed entitlements files and continue scanning.
    }
  }

  const iosDir = getIosProjectDir(projectPath);
  const extensionName = getExtensionName(project.appName);
  const extensionBundleId = getExtensionBundleId(project.bundleId, project.appName);

  const filesComplete = iosDir ? verifyExtensionFiles(iosDir, project.appName).complete : false;
  const xcodeTargetConfigured = hasNotificationServiceExtension(project.projectPath, extensionName);

  const extensionStatus = getNotificationServiceExtensionStatus(project.projectPath, extensionName);
  const buildSettingsConfigured =
    extensionStatus.buildSettings.enableUserScriptSandboxingNo &&
    extensionStatus.buildSettings.infoPlistConfigured &&
    extensionStatus.buildSettings.codeSignEntitlementsConfigured;

  const podfileExists = iosDir ? hasPodfile(iosDir) : false;
  const podDependencyConfigured =
    !podfileExists ||
    (iosDir
      ? hasExtensionTarget(iosDir, extensionName) &&
        hasClixPodInExtensionTarget(iosDir, extensionName)
      : false);

  const swiftStatus = iosDir ? inspectNotificationServiceSwift(iosDir, project.appName) : null;
  const notificationServiceConfigured =
    Boolean(swiftStatus?.exists) &&
    Boolean(swiftStatus?.importsClix) &&
    Boolean(swiftStatus?.inheritsClixNse) &&
    Boolean(swiftStatus?.hasRegisterCall) &&
    Boolean(swiftStatus?.hasSuperDidReceive) &&
    Boolean(swiftStatus?.registeredProjectId) &&
    swiftStatus?.registeredProjectId !== 'YOUR_PROJECT_ID';

  const hasNse = Boolean(
    filesComplete &&
      xcodeTargetConfigured &&
      buildSettingsConfigured &&
      podDependencyConfigured &&
      notificationServiceConfigured,
  );

  return {
    bundleId: project.bundleId,
    teamId: project.teamId,
    appGroupId: detectedAppGroupId ?? setup?.appGroupId,
    entitlementsConfigured: hasEntitlements,
    nseConfigured: hasNse,
    nseDetails: {
      extensionName,
      extensionBundleId,
      filesComplete,
      xcodeTargetConfigured,
      buildSettingsConfigured,
      podDependencyConfigured,
      notificationServiceConfigured,
    },
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
  projectPath: string,
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
  const fileStatus = await detectIosStatusFromFiles(projectPath, setup?.ios);
  return {
    needed: true,
    ...fileStatus,
  };
}

/**
 * Check APNS setup status.
 *
 * APNS key setup is required only for iOS targets.
 */
export async function checkApnsStatus(
  _projectPath: string,
  projectType: ProjectType,
  setup?: SetupStatus,
): Promise<ApnsStatus> {
  const needed = projectType.target === 'ios' || projectType.target === 'ios-android';

  if (!needed) {
    return {
      needed: false,
      registeredWithFirebase: true,
    };
  }

  if (setup?.apns) {
    return {
      needed: true,
      keyId: setup.apns.keyId,
      teamId: setup.apns.teamId,
      registeredWithFirebase: setup.apns.registeredWithFirebase,
    };
  }

  return {
    needed: true,
    registeredWithFirebase: false,
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
  const firebase = await checkFirebaseStatus(
    projectPath,
    projectType,
    updatedConfig.setup,
    updatedConfig.project.id,
  );

  // Step 4: Check iOS status
  const ios = await checkIosStatus(projectPath, projectType, updatedConfig.setup);

  // Step 5: Check APNS status
  const apns = await checkApnsStatus(projectPath, projectType, updatedConfig.setup);

  // Step 6: Determine what's missing
  const missing: string[] = [];

  if (apns.needed && firebase.iosConfigured && !apns.registeredWithFirebase) {
    missing.push('APNS Key for Firebase');
  }

  if (firebase.needed && !firebase.configured) {
    if (!firebase.androidConfigured) {
      missing.push('Firebase Android config (google-services.json)');
    }
    if (!firebase.iosConfigured) {
      missing.push('Firebase iOS config (GoogleService-Info.plist)');
    }
    const senderConfigPrerequisitesMet =
      firebase.androidConfigured &&
      firebase.iosConfigured &&
      (!apns.needed || apns.registeredWithFirebase);
    if (
      senderConfigPrerequisitesMet &&
      (!firebase.senderConfigConfigured || firebase.senderConfigProjectMatched === false)
    ) {
      missing.push('Firebase Service Account');
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
    apns,
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
  apns?: ApnsStatus,
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

  if (apns?.needed) {
    setupUpdate.apns = {
      keyId: apns.keyId,
      teamId: apns.teamId,
      registeredWithFirebase: apns.registeredWithFirebase,
      completedAt: apns.registeredWithFirebase ? now : undefined,
    };
  }

  await manager.updateSetup(setupUpdate);
}
