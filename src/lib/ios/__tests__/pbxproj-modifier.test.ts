import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let nativeTargetSection: Record<string, unknown> | null = null;
let currentCodeSignEntitlements: string | undefined;
let strictAllUuidsMode = false;
let strictProductTypeMode = false;
let strictBuildFileSectionMode = false;
let strictFileReferenceMode = false;
let strictFallbackBuildPhaseMode = false;

const parseSyncMock = mock(() => {});
const writeSyncMock = mock(() => '// updated pbxproj');
const getBuildPropertyMock = mock(
  (_property: string, _build?: string, _targetName?: string) => currentCodeSignEntitlements,
);
const updateBuildPropertyMock = mock(function (
  this: { pbxTargetByName?: (targetName: string) => unknown } | undefined,
  _property: string,
  value: string,
  _build?: string,
  _targetName?: string,
) {
  if (!this || typeof this.pbxTargetByName !== 'function') {
    throw new TypeError("undefined is not an object (evaluating 'this.pbxTargetByName')");
  }
  currentCodeSignEntitlements = value;
});
const allUuidsMock = mock(() => {
  if (strictAllUuidsMode) {
    throw new ReferenceError('key is not defined');
  }
  return [] as string[];
});
const generateUuidMock = mock(function (this: { allUuids?: () => string[] } | undefined) {
  this?.allUuids?.();
  return 'GENERATED_UUID';
});
const addTargetMock = mock(function (
  this: { generateUuid?: () => string } | undefined,
  _name: string,
  _type: string,
  _subfolder: string,
  _bundleId: string,
) {
  if (strictProductTypeMode) {
    throw new ReferenceError('PRODUCTTYPE_BY_TARGETTYPE is not defined');
  }
  if (strictBuildFileSectionMode) {
    throw new TypeError(
      "undefined is not an object (evaluating 'this.pbxBuildFileSection()[file2.uuid] = pbxBuildFileObj(file2)')",
    );
  }
  if (strictFileReferenceMode) {
    throw new ReferenceError('fileReference is not defined');
  }
  this?.generateUuid?.();
  return { uuid: 'NEW_EXTENSION_TARGET_UUID' };
});
const addXCConfigurationListMock = mock(
  (
    _buildConfigurations: Array<{
      name: string;
      isa: string;
      buildSettings: Record<string, string | string[]>;
    }>,
    _defaultConfigurationName: string,
    _comment: string,
  ) => ({ uuid: 'FALLBACK_BUILD_CONFIG_UUID' }),
);
const addProductFileMock = mock(
  (_name: string, _options: { group: string; target: string; explicitFileType: string }) => ({
    uuid: 'FALLBACK_PRODUCT_BUILD_FILE_UUID',
    fileRef: 'FALLBACK_PRODUCT_FILE_REF',
    basename: 'MyAppNotificationServiceExtension',
  }),
);
const addToPbxBuildFileSectionMock = mock((_file: { fileRef: string; basename: string }) => {});
const addToPbxNativeTargetSectionMock = mock(
  (_target: { uuid: string; pbxNativeTarget: Record<string, unknown> }) => {},
);
const addBuildPhaseMock = mock(
  (
    _files: string[],
    _buildPhaseType: string,
    _comment: string,
    _targetUuid: string,
    _targetType?: string,
  ) => {
    if (strictFallbackBuildPhaseMode) {
      throw new ReferenceError('fileReference is not defined');
    }
  },
);
const addToPbxCopyfilesBuildPhaseMock = mock((_file: { fileRef: string; basename: string }) => {});
const addToPbxProjectSectionMock = mock(
  (_target: { uuid: string; pbxNativeTarget: Record<string, unknown> }) => {},
);
const getFirstTargetMock = mock(() => ({ uuid: 'APP_TARGET_UUID' }));
const findPBXGroupKeyMock = mock((_group: { name: string }) => 'GROUP_KEY');
const addSourceFileMock = mock(
  (_file: string, _options: { target: string }, _groupKey: string) => {},
);
const addTargetDependencyMock = mock((_target: string, _dependencies: string[]) => {});
const projectFactoryMock = mock((_pbxprojPath: string) => ({
  hash: {
    project: {
      objects: {
        PBXNativeTarget: nativeTargetSection ?? {},
      },
    },
  },
  parseSync: parseSyncMock,
  writeSync: writeSyncMock,
  getBuildProperty: getBuildPropertyMock,
  updateBuildProperty: updateBuildPropertyMock,
  allUuids: allUuidsMock,
  generateUuid: generateUuidMock,
  addTarget: addTargetMock,
  addXCConfigurationList: addXCConfigurationListMock,
  addProductFile: addProductFileMock,
  addToPbxBuildFileSection: addToPbxBuildFileSectionMock,
  addToPbxNativeTargetSection: addToPbxNativeTargetSectionMock,
  addBuildPhase: addBuildPhaseMock,
  addToPbxCopyfilesBuildPhase: addToPbxCopyfilesBuildPhaseMock,
  addToPbxProjectSection: addToPbxProjectSectionMock,
  getFirstTarget: getFirstTargetMock,
  findPBXGroupKey: findPBXGroupKeyMock,
  addSourceFile: addSourceFileMock,
  addTargetDependency: addTargetDependencyMock,
  pbxNativeTargetSection: () => nativeTargetSection,
  pbxTargetByName: (_targetName: string) => ({}),
}));

mock.module('xcode', () => ({
  default: {
    project: projectFactoryMock,
  },
}));

import {
  addNotificationServiceExtension,
  ensureMainTargetEntitlementsLink,
} from '../pbxproj-modifier';

describe('ensureMainTargetEntitlementsLink', () => {
  let tempDir: string;
  let projectPath: string;
  let pbxprojPath: string;
  let entitlementsPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clix-pbxproj-test-'));
    projectPath = path.join(tempDir, 'MyApp.xcodeproj');
    pbxprojPath = path.join(projectPath, 'project.pbxproj');
    entitlementsPath = path.join(tempDir, 'MyApp', 'MyApp.entitlements');

    fs.mkdirSync(projectPath, { recursive: true });
    fs.mkdirSync(path.dirname(entitlementsPath), { recursive: true });
    fs.writeFileSync(pbxprojPath, '// original pbxproj', 'utf-8');
    fs.writeFileSync(entitlementsPath, '<plist/>', 'utf-8');

    nativeTargetSection = {
      APP_TARGET: {
        productType: 'com.apple.product-type.application',
        name: 'MyApp',
      },
    };
    currentCodeSignEntitlements = undefined;
    strictAllUuidsMode = false;
    strictProductTypeMode = false;
    strictBuildFileSectionMode = false;
    strictFileReferenceMode = false;
    strictFallbackBuildPhaseMode = false;

    parseSyncMock.mockClear();
    writeSyncMock.mockClear();
    getBuildPropertyMock.mockClear();
    updateBuildPropertyMock.mockClear();
    allUuidsMock.mockClear();
    generateUuidMock.mockClear();
    addTargetMock.mockClear();
    addXCConfigurationListMock.mockClear();
    addProductFileMock.mockClear();
    addToPbxBuildFileSectionMock.mockClear();
    addToPbxNativeTargetSectionMock.mockClear();
    addBuildPhaseMock.mockClear();
    addToPbxCopyfilesBuildPhaseMock.mockClear();
    addToPbxProjectSectionMock.mockClear();
    getFirstTargetMock.mockClear();
    findPBXGroupKeyMock.mockClear();
    addSourceFileMock.mockClear();
    addTargetDependencyMock.mockClear();
    projectFactoryMock.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('updates CODE_SIGN_ENTITLEMENTS for main target build configs', async () => {
    const result = await ensureMainTargetEntitlementsLink({
      projectPath,
      entitlementsPath,
    });

    const expectedRelativePath = ['MyApp', 'MyApp.entitlements'].join('/');

    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
    expect(result.relativeEntitlementsPath).toBe(expectedRelativePath);
    expect(result.targetName).toBe('MyApp');
    expect(updateBuildPropertyMock).toHaveBeenCalledTimes(1);
    expect(updateBuildPropertyMock).toHaveBeenCalledWith(
      'CODE_SIGN_ENTITLEMENTS',
      expectedRelativePath,
      undefined,
      'MyApp',
    );
    expect(writeSyncMock).toHaveBeenCalledTimes(1);
    expect(currentCodeSignEntitlements).toBe(expectedRelativePath);
    expect(fs.readFileSync(pbxprojPath, 'utf-8')).toBe('// updated pbxproj');
  });

  test('detects main app target when productType is quoted in pbxproj', async () => {
    nativeTargetSection = {
      APP_TARGET: {
        productType: `"com.apple.product-type.application"`,
        name: 'MyApp',
      },
    };

    const result = await ensureMainTargetEntitlementsLink({
      projectPath,
      entitlementsPath,
    });

    expect(result.success).toBe(true);
    expect(result.targetName).toBe('MyApp');
    expect(updateBuildPropertyMock).toHaveBeenCalledTimes(1);
  });

  test('falls back to preferred target name when productType is missing', async () => {
    nativeTargetSection = {
      APP_TARGET: {
        name: 'MyApp',
      },
      EXTENSION_TARGET: {
        name: 'MyAppNotificationServiceExtension',
        productType: 'com.apple.product-type.app-extension',
      },
    };

    const result = await ensureMainTargetEntitlementsLink({
      projectPath,
      entitlementsPath,
    });

    expect(result.success).toBe(true);
    expect(result.targetName).toBe('MyApp');
    expect(updateBuildPropertyMock).toHaveBeenCalledTimes(1);
  });

  test('returns alreadyConfigured when entitlements path is already linked', async () => {
    const expectedRelativePath = ['MyApp', 'MyApp.entitlements'].join('/');
    currentCodeSignEntitlements = `"${expectedRelativePath}"`;

    const result = await ensureMainTargetEntitlementsLink({
      projectPath,
      entitlementsPath,
    });

    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(true);
    expect(updateBuildPropertyMock).toHaveBeenCalledTimes(0);
    expect(writeSyncMock).toHaveBeenCalledTimes(0);
  });

  test('fails when main app target cannot be found', async () => {
    nativeTargetSection = {
      EXTENSION_TARGET: {
        productType: 'com.apple.product-type.app-extension',
        name: 'MyAppNotificationServiceExtension',
        buildConfigurationList: 'CONFIG_LIST /* Build configuration list */',
      },
    };

    const result = await ensureMainTargetEntitlementsLink({
      projectPath,
      entitlementsPath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('main application target');
    expect(writeSyncMock).toHaveBeenCalledTimes(0);
  });
});

describe('addNotificationServiceExtension', () => {
  let tempDir: string;
  let projectPath: string;
  let pbxprojPath: string;
  let extensionDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clix-nse-pbxproj-test-'));
    projectPath = path.join(tempDir, 'MyApp.xcodeproj');
    pbxprojPath = path.join(projectPath, 'project.pbxproj');
    extensionDir = path.join(tempDir, 'MyAppNotificationServiceExtension');

    fs.mkdirSync(projectPath, { recursive: true });
    fs.mkdirSync(extensionDir, { recursive: true });
    fs.writeFileSync(pbxprojPath, '// original pbxproj', 'utf-8');
    fs.writeFileSync(path.join(extensionDir, 'NotificationService.swift'), '// swift', 'utf-8');

    nativeTargetSection = {
      APP_TARGET: {
        productType: 'com.apple.product-type.application',
        name: 'MyApp',
        dependencies: [],
      },
    };
    strictAllUuidsMode = true;
    strictProductTypeMode = false;
    strictBuildFileSectionMode = false;
    strictFileReferenceMode = false;
    strictFallbackBuildPhaseMode = false;

    parseSyncMock.mockClear();
    writeSyncMock.mockClear();
    getBuildPropertyMock.mockClear();
    updateBuildPropertyMock.mockClear();
    allUuidsMock.mockClear();
    generateUuidMock.mockClear();
    addTargetMock.mockClear();
    addXCConfigurationListMock.mockClear();
    addProductFileMock.mockClear();
    addToPbxBuildFileSectionMock.mockClear();
    addToPbxNativeTargetSectionMock.mockClear();
    addBuildPhaseMock.mockClear();
    addToPbxCopyfilesBuildPhaseMock.mockClear();
    addToPbxProjectSectionMock.mockClear();
    getFirstTargetMock.mockClear();
    findPBXGroupKeyMock.mockClear();
    addSourceFileMock.mockClear();
    addTargetDependencyMock.mockClear();
    projectFactoryMock.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('uses app_extension target type and avoids strict-mode allUuids crash', async () => {
    const result = await addNotificationServiceExtension({
      projectPath,
      extensionName: 'MyAppNotificationServiceExtension',
      extensionBundleId: 'com.example.MyApp.MyAppNotificationServiceExtension',
      extensionDir,
      appGroupId: 'group.com.example.MyApp',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.targetAdded).toBe(true);
    expect(addTargetMock).toHaveBeenCalledTimes(1);
    expect(addTargetMock.mock.calls[0]?.[1]).toBe('app_extension');
    expect(generateUuidMock).toHaveBeenCalledTimes(1);
    expect(allUuidsMock).toHaveBeenCalledTimes(0);
    expect(writeSyncMock).toHaveBeenCalledTimes(1);
  });

  test('falls back when xcode addTarget hits strict-mode PRODUCTTYPE reference error', async () => {
    strictProductTypeMode = true;

    const result = await addNotificationServiceExtension({
      projectPath,
      extensionName: 'MyAppNotificationServiceExtension',
      extensionBundleId: 'com.example.MyApp.MyAppNotificationServiceExtension',
      extensionDir,
      appGroupId: 'group.com.example.MyApp',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.targetAdded).toBe(true);
    expect(addTargetMock).toHaveBeenCalledTimes(1);
    expect(addXCConfigurationListMock).toHaveBeenCalledTimes(1);
    expect(addProductFileMock).toHaveBeenCalledTimes(1);
    expect(addToPbxNativeTargetSectionMock).toHaveBeenCalledTimes(1);
    expect(result.warnings.some((warning) => warning.includes('strict-mode fallback'))).toBe(true);
  });

  test('falls back when xcode addTarget fails with pbxBuildFileSection error', async () => {
    strictBuildFileSectionMode = true;

    const result = await addNotificationServiceExtension({
      projectPath,
      extensionName: 'MyAppNotificationServiceExtension',
      extensionBundleId: 'com.example.MyApp.MyAppNotificationServiceExtension',
      extensionDir,
      appGroupId: 'group.com.example.MyApp',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.targetAdded).toBe(true);
    expect(addTargetMock).toHaveBeenCalledTimes(1);
    expect(addXCConfigurationListMock).toHaveBeenCalledTimes(1);
    expect(addProductFileMock).toHaveBeenCalledTimes(1);
    expect(addToPbxNativeTargetSectionMock).toHaveBeenCalledTimes(1);
    expect(result.warnings.some((warning) => warning.includes('strict-mode fallback'))).toBe(true);
  });

  test('falls back when xcode addTarget fails with fileReference strict-mode error', async () => {
    strictFileReferenceMode = true;

    const result = await addNotificationServiceExtension({
      projectPath,
      extensionName: 'MyAppNotificationServiceExtension',
      extensionBundleId: 'com.example.MyApp.MyAppNotificationServiceExtension',
      extensionDir,
      appGroupId: 'group.com.example.MyApp',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.targetAdded).toBe(true);
    expect(addTargetMock).toHaveBeenCalledTimes(1);
    expect(addXCConfigurationListMock).toHaveBeenCalledTimes(1);
    expect(result.warnings.some((warning) => warning.includes('strict-mode fallback'))).toBe(true);
  });

  test('keeps fallback success when embed phase creation hits fileReference strict-mode error', async () => {
    strictFileReferenceMode = true;
    strictFallbackBuildPhaseMode = true;

    const result = await addNotificationServiceExtension({
      projectPath,
      extensionName: 'MyAppNotificationServiceExtension',
      extensionBundleId: 'com.example.MyApp.MyAppNotificationServiceExtension',
      extensionDir,
      appGroupId: 'group.com.example.MyApp',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.targetAdded).toBe(true);
    expect(addBuildPhaseMock).toHaveBeenCalledTimes(1);
    expect(
      result.warnings.some((warning) => warning.includes('could not auto-create embed phase')),
    ).toBe(true);
  });
});
