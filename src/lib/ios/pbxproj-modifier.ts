/**
 * Xcode project (.pbxproj) modifier for iOS setup automation.
 * Uses the 'xcode' npm package to programmatically modify Xcode projects.
 *
 * @module ios/pbxproj-modifier
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import xcode from 'xcode';

const NSE_TARGET_TYPE = 'app_extension';
const APP_PRODUCT_TYPE = 'com.apple.product-type.application';
const APP_EXTENSION_PRODUCT_TYPE = 'com.apple.product-type.app-extension';
const PRODUCT_TYPE_BY_TARGET_TYPE: Record<string, string> = {
  app_extension: APP_EXTENSION_PRODUCT_TYPE,
};
const FILE_TYPE_BY_PRODUCT_TYPE: Record<string, string> = {
  [APP_EXTENSION_PRODUCT_TYPE]: '"wrapper.app-extension"',
};

interface TargetDescriptor {
  uuid: string;
  name: string;
  productType: string;
}

interface XcodeProjectWithAllUuids {
  hash?: {
    project?: {
      objects?: Record<string, Record<string, unknown> | undefined>;
    };
  };
  allUuids?: () => string[];
}

const NSE_REQUIRED_PBX_SECTIONS = [
  'PBXBuildFile',
  'PBXFileReference',
  'PBXCopyFilesBuildPhase',
  'PBXTargetDependency',
  'PBXContainerItemProxy',
] as const;

interface XcodeProjectWithStrictSafeTargetApis {
  generateUuid?: () => string;
  addXCConfigurationList?: (
    buildConfigurations: Array<{
      name: string;
      isa: string;
      buildSettings: Record<string, string | string[]>;
    }>,
    defaultConfigurationName: string,
    comment: string,
  ) => { uuid?: string } | null;
  addProductFile?: (
    productName: string,
    options: {
      group: string;
      target: string;
      explicitFileType: string;
    },
  ) => { uuid?: string; fileRef?: string; basename?: string; target?: string } | null;
  addToPbxBuildFileSection?: (file: { uuid: string; fileRef: string; basename: string }) => void;
  addToPbxNativeTargetSection?: (target: {
    uuid: string;
    pbxNativeTarget: {
      isa: string;
      name: string;
      productName: string;
      productReference: string;
      productType: string;
      buildConfigurationList: string;
      buildPhases: string[];
      buildRules: string[];
      dependencies: string[];
    };
  }) => void;
  getFirstTarget?: () => { uuid?: string } | null;
  addBuildPhase?: (
    files: string[],
    buildPhaseType: string,
    comment: string,
    targetUuid: string,
    targetType?: string,
  ) => void;
  addToPbxCopyfilesBuildPhase?: (file: {
    uuid: string;
    fileRef: string;
    basename: string;
    target?: string;
  }) => void;
  addToPbxProjectSection?: (target: {
    uuid: string;
    pbxNativeTarget: {
      isa: string;
      name: string;
      productName: string;
      productReference: string;
      productType: string;
      buildConfigurationList: string;
      buildPhases: string[];
      buildRules: string[];
      dependencies: string[];
    };
  }) => void;
  addTargetDependency?: (targetUuid: string, dependencyUuids: string[]) => void;
}

/**
 * `xcode` package has strict-mode issues in `allUuids()` (`for (key in ...)`).
 * Patch the instance method to a strict-safe implementation before UUID generation APIs run.
 */
function patchXcodeAllUuidsForStrictMode(project: XcodeProjectWithAllUuids): void {
  if (typeof project.allUuids !== 'function') {
    return;
  }

  project.allUuids = () => {
    const sections = project.hash?.project?.objects;
    if (!sections) {
      return [];
    }

    const uuids: string[] = [];
    for (const section of Object.values(sections)) {
      if (!section || typeof section !== 'object') {
        continue;
      }

      for (const sectionKey of Object.keys(section)) {
        if (sectionKey.length === 24 && !sectionKey.endsWith('_comment')) {
          uuids.push(sectionKey);
        }
      }
    }

    return uuids;
  };
}

function ensureNseRequiredPbxSections(project: XcodeProjectWithAllUuids): void {
  const sections = project.hash?.project?.objects;
  if (!sections) {
    return;
  }

  for (const sectionName of NSE_REQUIRED_PBX_SECTIONS) {
    if (!sections[sectionName] || typeof sections[sectionName] !== 'object') {
      sections[sectionName] = {};
    }
  }
}

function createNotificationServiceTargetWithStrictSafeApis(
  project: XcodeProjectWithStrictSafeTargetApis,
  options: Pick<PbxprojModifierOptions, 'extensionName' | 'extensionBundleId'>,
): {
  target: { uuid: string };
  warnings: string[];
  dependencyAdded?: boolean;
} {
  if (
    !project.generateUuid ||
    !project.addXCConfigurationList ||
    !project.addProductFile ||
    !project.addToPbxBuildFileSection ||
    !project.addToPbxNativeTargetSection ||
    !project.addToPbxProjectSection
  ) {
    throw new Error('xcode project target creation APIs are unavailable');
  }

  const targetName = options.extensionName.trim();
  const targetSubfolder = options.extensionName;
  const productType = PRODUCT_TYPE_BY_TARGET_TYPE[NSE_TARGET_TYPE];
  const productFileType = FILE_TYPE_BY_PRODUCT_TYPE[productType];
  if (!productType || !productFileType) {
    throw new Error(`Unsupported target type: ${NSE_TARGET_TYPE}`);
  }

  let buildConfigurationsList: Array<{
    name: string;
    isa: string;
    buildSettings: Record<string, string | string[]>;
  }> = [
    {
      name: 'Debug',
      isa: 'XCBuildConfiguration',
      buildSettings: {
        GCC_PREPROCESSOR_DEFINITIONS: ['"DEBUG=1"', '"$(inherited)"'],
        INFOPLIST_FILE: `"${path.join(targetSubfolder, 'Info.plist')}"`,
        LD_RUNPATH_SEARCH_PATHS:
          '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
        PRODUCT_NAME: `"${targetName}"`,
        SKIP_INSTALL: 'YES',
      },
    },
    {
      name: 'Release',
      isa: 'XCBuildConfiguration',
      buildSettings: {
        INFOPLIST_FILE: `"${path.join(targetSubfolder, 'Info.plist')}"`,
        LD_RUNPATH_SEARCH_PATHS:
          '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
        PRODUCT_NAME: `"${targetName}"`,
        SKIP_INSTALL: 'YES',
      },
    },
  ];

  if (options.extensionBundleId) {
    buildConfigurationsList = buildConfigurationsList.map((buildConfiguration) => ({
      ...buildConfiguration,
      buildSettings: {
        ...buildConfiguration.buildSettings,
        PRODUCT_BUNDLE_IDENTIFIER: `"${options.extensionBundleId}"`,
      },
    }));
  }

  const buildConfigurations = project.addXCConfigurationList(
    buildConfigurationsList,
    'Release',
    `Build configuration list for PBXNativeTarget "${targetName}"`,
  );
  const targetBuildConfigurationList = buildConfigurations?.uuid;
  if (!targetBuildConfigurationList) {
    throw new Error('Failed to create build configuration list for target');
  }

  const targetId = project.generateUuid();
  const productFile = project.addProductFile(targetName, {
    group: 'Copy Files',
    target: targetId,
    explicitFileType: productFileType,
  });
  if (!productFile?.fileRef || !productFile.basename) {
    throw new Error('Failed to create product file for target');
  }
  const productFileRecord = {
    uuid: productFile.uuid || project.generateUuid(),
    fileRef: productFile.fileRef,
    basename: productFile.basename,
    target: targetId,
  };

  const target = {
    uuid: targetId,
    pbxNativeTarget: {
      isa: 'PBXNativeTarget',
      name: `"${targetName}"`,
      productName: `"${targetName}"`,
      productReference: productFile.fileRef,
      productType: `"${productType}"`,
      buildConfigurationList: targetBuildConfigurationList,
      buildPhases: [],
      buildRules: [],
      dependencies: [],
    },
  };

  project.addToPbxBuildFileSection({
    uuid: productFileRecord.uuid,
    fileRef: productFileRecord.fileRef,
    basename: productFileRecord.basename,
  });
  project.addToPbxNativeTargetSection(target);
  project.addToPbxProjectSection(target);

  const warnings: string[] = [];
  const firstTargetUuid = project.getFirstTarget?.()?.uuid;
  if (!firstTargetUuid) {
    warnings.push('Created NSE target with fallback path; verify extension embedding in Xcode');
  } else if (project.addBuildPhase && project.addToPbxCopyfilesBuildPhase) {
    try {
      project.addBuildPhase(
        [],
        'PBXCopyFilesBuildPhase',
        'Copy Files',
        firstTargetUuid,
        NSE_TARGET_TYPE,
      );
      project.addToPbxCopyfilesBuildPhase({
        uuid: productFileRecord.uuid,
        fileRef: productFileRecord.fileRef,
        basename: productFileRecord.basename,
        target: firstTargetUuid,
      });
    } catch {
      warnings.push(
        'Created NSE target but could not auto-create embed phase; verify embedding in Xcode',
      );
    }
  } else {
    warnings.push('Created NSE target with fallback path; verify extension embedding in Xcode');
  }

  let dependencyAdded = false;
  if (firstTargetUuid && project.addTargetDependency) {
    try {
      project.addTargetDependency(firstTargetUuid, [targetId]);
      dependencyAdded = true;
    } catch {
      warnings.push(
        'Created NSE target but could not auto-add target dependency; verify target dependencies in Xcode',
      );
    }
  }

  return { target: { uuid: targetId }, warnings, dependencyAdded };
}

function createNotificationServiceTarget(
  project: XcodeProjectWithStrictSafeTargetApis & {
    addTarget: (
      name: string,
      targetType: string,
      subfolder: string,
      bundleId: string,
    ) => { uuid: string } | null;
  },
  options: Pick<PbxprojModifierOptions, 'extensionName' | 'extensionBundleId'>,
): {
  target: { uuid: string } | null;
  warnings: string[];
  dependencyAdded?: boolean;
} {
  try {
    return {
      target: project.addTarget(
        options.extensionName,
        NSE_TARGET_TYPE,
        options.extensionName,
        options.extensionBundleId,
      ),
      warnings: [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRecoverableAddTargetError =
      errorMessage.includes('PRODUCTTYPE_BY_TARGETTYPE is not defined') ||
      errorMessage.includes('FILETYPE_BY_PRODUCTTYPE is not defined') ||
      errorMessage.includes('this.pbxBuildFileSection()') ||
      errorMessage.includes('fileReference is not defined');
    if (!isRecoverableAddTargetError) {
      throw error;
    }

    const fallbackResult = createNotificationServiceTargetWithStrictSafeApis(project, options);
    return {
      target: fallbackResult.target,
      warnings: [
        'Applied strict-mode fallback while creating NSE target',
        ...fallbackResult.warnings,
      ],
      dependencyAdded: fallbackResult.dependencyAdded,
    };
  }
}

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

export interface NotificationServiceExtensionStatus {
  targetExists: boolean;
  buildSettings: {
    enableUserScriptSandboxingNo: boolean;
    infoPlistConfigured: boolean;
    codeSignEntitlementsConfigured: boolean;
  };
}

export interface MainTargetEntitlementsLinkResult {
  success: boolean;
  alreadyConfigured: boolean;
  projectFilePath: string;
  relativeEntitlementsPath: string;
  targetName?: string;
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
    patchXcodeAllUuidsForStrictMode(project as unknown as XcodeProjectWithAllUuids);
    project.parseSync();

    const targets = project.pbxNativeTargetSection();
    if (!targets) return false;

    const expectedName = normalizeTargetValue(extensionName);

    for (const key of Object.keys(targets)) {
      if (key.endsWith('_comment')) {
        continue;
      }
      const target = targets[key] as { name?: string } | undefined;
      const targetName = target ? normalizeTargetValue(target.name) : '';
      if (target && typeof target === 'object' && targetName === expectedName) {
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

function normalizeUuid(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/\s*\/\*.*\*\/\s*/g, '').trim() || null;
}

function normalizeTargetValue(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }

  const withoutComments = raw.replace(/\s*\/\*.*\*\/\s*/g, '').trim();
  return withoutComments.replace(/^"+|"+$/g, '').trim();
}

function parseTargetDescriptors(project: {
  pbxNativeTargetSection: () => Record<string, unknown> | null;
}): TargetDescriptor[] {
  const targets = project.pbxNativeTargetSection();
  if (!targets) {
    return [];
  }

  const descriptors: TargetDescriptor[] = [];

  for (const key of Object.keys(targets)) {
    if (key.endsWith('_comment')) {
      continue;
    }

    const uuid = normalizeUuid(key);
    if (!uuid) {
      continue;
    }

    const target = targets[key] as { name?: unknown; productType?: unknown } | undefined;
    if (!target || typeof target !== 'object') {
      continue;
    }

    descriptors.push({
      uuid,
      name: normalizeTargetValue(target.name),
      productType: normalizeTargetValue(target.productType),
    });
  }

  return descriptors;
}

function isLikelyNonMainTarget(targetName: string): boolean {
  const lower = targetName.toLowerCase();
  return (
    lower.includes('test') ||
    lower.includes('uitest') ||
    lower.includes('extension') ||
    lower.includes('widget')
  );
}

function findTargetByPreferredName(
  targets: TargetDescriptor[],
  preferredTargetNames: string[],
): TargetDescriptor | null {
  const normalizedPreferredNames = preferredTargetNames
    .map((name) => normalizeTargetValue(name))
    .filter((name) => name.length > 0);

  for (const preferredName of normalizedPreferredNames) {
    const matched = targets.find((target) => normalizeTargetValue(target.name) === preferredName);
    if (matched) {
      return matched;
    }
  }

  return null;
}

/**
 * Find the main app target UUID by productType with fallback heuristics.
 */
function findAppTargetUuid(
  project: {
    pbxNativeTargetSection: () => Record<string, unknown> | null;
  },
  preferredTargetNames: string[] = [],
): string | null {
  const descriptors = parseTargetDescriptors(project);
  if (descriptors.length === 0) {
    return null;
  }

  const appTargets = descriptors.filter((target) => target.productType === APP_PRODUCT_TYPE);
  if (appTargets.length > 0) {
    if (appTargets.length === 1) {
      return appTargets[0].uuid;
    }

    const preferredAppTarget = findTargetByPreferredName(appTargets, preferredTargetNames);
    if (preferredAppTarget) {
      return preferredAppTarget.uuid;
    }

    const nonTestAppTarget = appTargets.find((target) => !isLikelyNonMainTarget(target.name));
    return (nonTestAppTarget ?? appTargets[0]).uuid;
  }

  const preferredTarget = findTargetByPreferredName(descriptors, preferredTargetNames);
  if (preferredTarget && !isLikelyNonMainTarget(preferredTarget.name)) {
    return preferredTarget.uuid;
  }

  const nonAuxiliaryTarget = descriptors.find((target) => !isLikelyNonMainTarget(target.name));
  if (nonAuxiliaryTarget) {
    return nonAuxiliaryTarget.uuid;
  }

  if (descriptors.length === 1 && !isLikelyNonMainTarget(descriptors[0].name)) {
    return descriptors[0].uuid;
  }

  return null;
}

function findTargetUuidByName(
  project: { pbxNativeTargetSection: () => Record<string, unknown> | null },
  extensionName: string,
): string | null {
  const targets = project.pbxNativeTargetSection();
  if (!targets) {
    return null;
  }

  const expectedName = normalizeTargetValue(extensionName);

  for (const key of Object.keys(targets)) {
    if (key.endsWith('_comment')) {
      continue;
    }
    const target = targets[key] as { name?: string } | undefined;
    const targetName = target ? normalizeTargetValue(target.name) : '';
    if (target && typeof target === 'object' && targetName === expectedName) {
      return normalizeUuid(key);
    }
  }
  return null;
}

function getTargetNameCandidates(
  project: { pbxNativeTargetSection: () => Record<string, unknown> | null },
  targetUuid: string,
): string[] {
  const targets = project.pbxNativeTargetSection();
  if (!targets) {
    return [];
  }

  const target = targets[targetUuid] as { name?: unknown } | undefined;
  const commentName = targets[`${targetUuid}_comment`];
  const normalizedName = normalizeTargetValue(target?.name);
  const normalizedComment = normalizeTargetValue(commentName);

  const candidates = [
    typeof commentName === 'string' ? commentName : '',
    typeof target?.name === 'string' ? target.name : '',
    normalizedComment,
    normalizedName,
    normalizedComment ? `"${normalizedComment}"` : '',
    normalizedName ? `"${normalizedName}"` : '',
  ];

  return [...new Set(candidates.filter((candidate) => candidate.length > 0))];
}

interface BuildSettingsTargetProject {
  pbxNativeTargetSection: () => Record<string, unknown> | null;
  pbxXCConfigurationList?: () => Record<string, unknown> | null;
  pbxXCConfigurationListSection?: () => Record<string, unknown> | null;
  pbxXCBuildConfigurationSection?: () => Record<string, unknown> | null;
  updateBuildProperty?: (
    property: string,
    value: string,
    build: string | null,
    targetName?: string,
  ) => void;
}

function getTargetConfigurationUuids(
  project: {
    pbxXCConfigurationList?: () => Record<string, unknown> | null;
    pbxXCConfigurationListSection?: () => Record<string, unknown> | null;
    pbxNativeTargetSection: () => Record<string, unknown> | null;
  },
  targetUuid: string,
): string[] {
  const nativeTargets = project.pbxNativeTargetSection();
  const target = nativeTargets?.[targetUuid] as { buildConfigurationList?: unknown } | undefined;
  const configListUuid = normalizeUuid(
    typeof target?.buildConfigurationList === 'string' ? target.buildConfigurationList : undefined,
  );
  if (!configListUuid) {
    return [];
  }

  const configListSection =
    project.pbxXCConfigurationList?.() ?? project.pbxXCConfigurationListSection?.();
  if (!configListSection) {
    return [];
  }

  const configList = configListSection[configListUuid] as
    | { buildConfigurations?: Array<string | { value?: string }> }
    | undefined;
  const configRefs = configList?.buildConfigurations ?? [];
  const configUuids: string[] = [];
  for (const configRef of configRefs) {
    const configUuid =
      typeof configRef === 'string' ? normalizeUuid(configRef) : normalizeUuid(configRef.value);
    if (configUuid) {
      configUuids.push(configUuid);
    }
  }

  return configUuids;
}

function applyBuildSettingsToConfigurationSection(
  buildConfigSection: Record<string, unknown>,
  configUuids: string[],
  buildSettings: Record<string, string>,
): string[] {
  const applied = new Set<string>();
  for (const configUuid of configUuids) {
    const config = buildConfigSection[configUuid] as
      | { buildSettings?: Record<string, unknown> }
      | undefined;
    if (!config) {
      continue;
    }

    const currentBuildSettings =
      config.buildSettings && typeof config.buildSettings === 'object' ? config.buildSettings : {};
    for (const [setting, value] of Object.entries(buildSettings)) {
      currentBuildSettings[setting] = value;
      applied.add(setting);
    }
    config.buildSettings = currentBuildSettings;
  }

  return Array.from(applied);
}

function applyBuildSettingsWithTargetName(
  project: Pick<BuildSettingsTargetProject, 'updateBuildProperty'>,
  targetNameCandidates: string[],
  buildSettings: Record<string, string>,
): { applied: string[]; warnings: string[] } {
  if (!project.updateBuildProperty) {
    return {
      applied: [],
      warnings: ['Could not update build settings automatically'],
    };
  }

  const applied = new Set<string>();
  const warnings: string[] = [];
  for (const [setting, value] of Object.entries(buildSettings)) {
    let updated = false;
    for (const targetName of targetNameCandidates) {
      try {
        project.updateBuildProperty(setting, value, null, targetName);
        updated = true;
        break;
      } catch {
        // Try the next candidate.
      }
    }

    if (updated) {
      applied.add(setting);
    } else {
      warnings.push(`Could not set ${setting}, may need manual configuration`);
    }
  }

  return {
    applied: Array.from(applied),
    warnings,
  };
}

function applyBuildSettingsToTarget(
  project: BuildSettingsTargetProject,
  targetUuid: string,
  buildSettings: Record<string, string>,
): { applied: string[]; warnings: string[] } {
  const configUuids = getTargetConfigurationUuids(project, targetUuid);
  const buildConfigSection = project.pbxXCBuildConfigurationSection?.();

  if (configUuids.length > 0 && buildConfigSection) {
    const applied = applyBuildSettingsToConfigurationSection(
      buildConfigSection,
      configUuids,
      buildSettings,
    );
    if (applied.length > 0) {
      return { applied, warnings: [] };
    }
  }

  const targetNameCandidates = getTargetNameCandidates(project, targetUuid);
  return applyBuildSettingsWithTargetName(project, targetNameCandidates, buildSettings);
}

export function getNotificationServiceExtensionStatus(
  projectPath: string,
  extensionName: string,
): NotificationServiceExtensionStatus {
  const defaultStatus: NotificationServiceExtensionStatus = {
    targetExists: false,
    buildSettings: {
      enableUserScriptSandboxingNo: false,
      infoPlistConfigured: false,
      codeSignEntitlementsConfigured: false,
    },
  };

  const pbxprojPath = path.join(projectPath, 'project.pbxproj');
  if (!fs.existsSync(pbxprojPath)) {
    return defaultStatus;
  }

  try {
    const project = xcode.project(pbxprojPath);
    patchXcodeAllUuidsForStrictMode(project as unknown as XcodeProjectWithAllUuids);
    project.parseSync();

    const targetUuid = findTargetUuidByName(project, extensionName);
    if (!targetUuid) {
      return defaultStatus;
    }

    const nativeTargets = project.pbxNativeTargetSection() as Record<string, unknown> | null;
    const target = nativeTargets?.[targetUuid] as { buildConfigurationList?: string } | undefined;
    const configListUuid = normalizeUuid(target?.buildConfigurationList);
    if (!configListUuid) {
      return {
        ...defaultStatus,
        targetExists: true,
      };
    }

    const configListAccessor = project as unknown as {
      pbxXCConfigurationList?: () => Record<string, unknown> | null;
      pbxXCConfigurationListSection?: () => Record<string, unknown> | null;
    };
    const configLists =
      configListAccessor.pbxXCConfigurationList?.() ??
      configListAccessor.pbxXCConfigurationListSection?.();
    const configList = configLists?.[configListUuid] as
      | { buildConfigurations?: Array<string | { value?: string }> }
      | undefined;
    const configRefs = configList?.buildConfigurations ?? [];

    const buildConfigSection = (
      project as unknown as {
        pbxXCBuildConfigurationSection?: () => Record<string, unknown> | null;
      }
    ).pbxXCBuildConfigurationSection?.();

    const sandboxMatches: boolean[] = [];
    const infoPlistMatches: boolean[] = [];
    const entitlementsMatches: boolean[] = [];

    for (const configRef of configRefs) {
      const configUuid =
        typeof configRef === 'string' ? normalizeUuid(configRef) : normalizeUuid(configRef.value);
      if (!configUuid) {
        continue;
      }

      const config = buildConfigSection?.[configUuid] as
        | { buildSettings?: Record<string, unknown> }
        | undefined;
      const buildSettings = config?.buildSettings ?? {};

      const sandbox = String(buildSettings.ENABLE_USER_SCRIPT_SANDBOXING || '').toUpperCase();
      sandboxMatches.push(sandbox === 'NO');

      const infoPlist = String(buildSettings.INFOPLIST_FILE || '');
      infoPlistMatches.push(infoPlist.includes('Info.plist'));

      const entitlements = String(buildSettings.CODE_SIGN_ENTITLEMENTS || '');
      entitlementsMatches.push(entitlements.endsWith(`${extensionName}.entitlements`));
    }

    return {
      targetExists: true,
      buildSettings: {
        enableUserScriptSandboxingNo:
          sandboxMatches.length > 0 && sandboxMatches.every((value) => value),
        infoPlistConfigured:
          infoPlistMatches.length > 0 && infoPlistMatches.every((value) => value),
        codeSignEntitlementsConfigured:
          entitlementsMatches.length > 0 && entitlementsMatches.every((value) => value),
      },
    };
  } catch {
    return defaultStatus;
  }
}

/**
 * Ensure main app target build configurations reference the entitlements file.
 * This automates the Xcode "Signing & Capabilities" entitlements linkage step.
 */
export async function ensureMainTargetEntitlementsLink(options: {
  projectPath: string;
  entitlementsPath: string;
}): Promise<MainTargetEntitlementsLinkResult> {
  const pbxprojPath = path.join(options.projectPath, 'project.pbxproj');
  const result: MainTargetEntitlementsLinkResult = {
    success: false,
    alreadyConfigured: false,
    projectFilePath: pbxprojPath,
    relativeEntitlementsPath: '',
  };

  if (!fs.existsSync(pbxprojPath)) {
    result.error = `Project file not found: ${pbxprojPath}`;
    return result;
  }

  try {
    const project = xcode.project(pbxprojPath);
    patchXcodeAllUuidsForStrictMode(project as unknown as XcodeProjectWithAllUuids);
    project.parseSync();

    const appNameFromProject = path.basename(options.projectPath, '.xcodeproj');
    const appNameFromEntitlements = path.basename(options.entitlementsPath, '.entitlements');
    const appTargetUuid = findAppTargetUuid(project, [appNameFromEntitlements, appNameFromProject]);
    if (!appTargetUuid) {
      result.error = 'Could not find main application target in Xcode project';
      return result;
    }

    const nativeTargets = project.pbxNativeTargetSection() as Record<string, unknown> | null;
    const appTarget = nativeTargets?.[appTargetUuid] as { name?: string } | undefined;
    if (appTarget?.name) {
      result.targetName = appTarget.name;
    }

    if (!result.targetName) {
      result.error = 'Could not resolve main application target name in Xcode project';
      return result;
    }

    const projectDir = path.dirname(options.projectPath);
    const relativeEntitlementsPath = path
      .relative(projectDir, options.entitlementsPath)
      .split(path.sep)
      .join('/');
    result.relativeEntitlementsPath = relativeEntitlementsPath;

    const currentEntitlementsRaw = (
      project as unknown as {
        getBuildProperty?: (
          property: string,
          build?: string,
          targetName?: string,
        ) => string | undefined;
      }
    ).getBuildProperty?.('CODE_SIGN_ENTITLEMENTS', undefined, result.targetName);

    const currentEntitlements = String(currentEntitlementsRaw || '').replace(/^"|"$/g, '');
    if (currentEntitlements === relativeEntitlementsPath) {
      result.alreadyConfigured = true;
      result.success = true;
      return result;
    }

    const typedProject = project as unknown as {
      updateBuildProperty?: (
        property: string,
        value: string,
        build?: string,
        targetName?: string,
      ) => void;
    };

    if (!typedProject.updateBuildProperty) {
      result.error = 'xcode project updateBuildProperty API is unavailable';
      return result;
    }

    typedProject.updateBuildProperty(
      'CODE_SIGN_ENTITLEMENTS',
      relativeEntitlementsPath,
      undefined,
      result.targetName,
    );

    fs.writeFileSync(pbxprojPath, project.writeSync());
    result.success = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

function addTargetDependencyToMainApp(
  project: { addTargetDependency: (targetUuid: string, dependencyUuids: string[]) => void },
  targetUuid: string,
  warnings: string[],
): void {
  const appTargetUuid = findAppTargetUuid(
    project as unknown as { pbxNativeTargetSection: () => Record<string, unknown> | null },
  );
  if (appTargetUuid && targetUuid) {
    try {
      project.addTargetDependency(appTargetUuid, [targetUuid]);
    } catch {
      warnings.push('Could not add target dependency, extension may need manual embedding');
    }
  } else {
    warnings.push('Could not find main app target, extension may need manual embedding');
  }
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
    patchXcodeAllUuidsForStrictMode(project as unknown as XcodeProjectWithAllUuids);
    project.parseSync();
    ensureNseRequiredPbxSections(project as unknown as XcodeProjectWithAllUuids);

    // 2. Ensure target exists (create only if missing)
    let targetUuid = findTargetUuidByName(project, options.extensionName);
    let targetDependencyAlreadyAdded = false;
    if (!targetUuid) {
      const { target, warnings, dependencyAdded } = createNotificationServiceTarget(
        project as unknown as XcodeProjectWithStrictSafeTargetApis & {
          addTarget: (
            name: string,
            targetType: string,
            subfolder: string,
            bundleId: string,
          ) => { uuid: string } | null;
        },
        {
          extensionName: options.extensionName,
          extensionBundleId: options.extensionBundleId,
        },
      );
      result.warnings.push(...warnings);
      targetDependencyAlreadyAdded = dependencyAdded === true;

      if (!target) {
        result.error = 'Failed to add target to project';
        return result;
      }

      targetUuid = normalizeUuid(target.uuid);
      result.targetAdded = true;

      // Add source file only on fresh target creation.
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
    } else {
      result.warnings.push('NSE target already exists, applying missing settings only');
    }

    // 5. Set build settings for the extension target
    const deploymentTarget = options.deploymentTarget || '14.0';
    // Compute project-relative paths from extensionDir
    const projectDir = path.dirname(options.projectPath);
    const extensionRelDir = path.relative(projectDir, options.extensionDir);
    const entitlementsPath = path.join(extensionRelDir, `${options.extensionName}.entitlements`);
    const infoPlistPath = path.join(extensionRelDir, 'Info.plist');
    const buildSettings: Record<string, string> = {
      CODE_SIGN_ENTITLEMENTS: entitlementsPath,
      ENABLE_USER_SCRIPT_SANDBOXING: 'NO',
      INFOPLIST_FILE: infoPlistPath,
      PRODUCT_BUNDLE_IDENTIFIER: options.extensionBundleId,
      IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget,
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: '"1,2"',
      GENERATE_INFOPLIST_FILE: 'NO',
    };

    if (options.teamId) {
      buildSettings.DEVELOPMENT_TEAM = options.teamId;
    }

    if (!targetUuid) {
      result.error = 'Failed to resolve NSE target UUID after creation';
      return result;
    }

    const buildSettingsResult = applyBuildSettingsToTarget(project, targetUuid, buildSettings);
    result.buildSettingsApplied.push(...buildSettingsResult.applied);
    result.warnings.push(...buildSettingsResult.warnings);

    // 6. Add target dependency to main app (embed extension)
    // Skip if dependency was already added during target creation (strict-safe fallback path)
    if (result.targetAdded && !targetDependencyAlreadyAdded) {
      addTargetDependencyToMainApp(project, targetUuid, result.warnings);
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
    patchXcodeAllUuidsForStrictMode(project as unknown as XcodeProjectWithAllUuids);
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
