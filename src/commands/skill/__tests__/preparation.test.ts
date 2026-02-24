import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ProjectType } from '@/lib/config';
import { checkApnsStatus, checkFirebaseStatus, checkIosStatus } from '../preparation';

function createEncodedServiceAccount(projectId: string): string {
  const serviceAccount = {
    type: 'service_account',
    project_id: projectId,
    private_key_id: 'private-key-id',
    private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    client_email: `svc@${projectId}.iam.gserviceaccount.com`,
    client_id: '12345678901234567890',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/svc%40${projectId}.iam.gserviceaccount.com`,
  };

  return Buffer.from(JSON.stringify(serviceAccount), 'utf-8').toString('base64');
}

// Mock the dependencies
const mockFirebaseService = {
  detect: mock(() =>
    Promise.resolve({
      platform: 'react-native' as string,
      android: { valid: true, content: { project_info: { project_id: 'test-project' } } } as {
        valid: boolean;
        content: Record<string, unknown>;
      } | null,
      ios: { valid: true, content: { PROJECT_ID: 'test-project' } } as {
        valid: boolean;
        content: Record<string, unknown>;
      } | null,
      configured: true,
      issues: [] as unknown[],
      projectPath: '/test',
    }),
  ),
  getStatus: mock(() =>
    Promise.resolve({
      status: 'configured',
      androidConfigured: true,
      iosConfigured: true,
      issueCount: 0,
      errorCount: 0,
      warningCount: 0,
    }),
  ),
};

const mockInternalApiClient = {
  getProject: mock(() =>
    Promise.resolve({
      id: 'clix-project',
      name: 'Project',
      organization_id: 'org-1',
      sender_configs: [
        {
          channel_type: 'CHANNEL_TYPE_APP_PUSH',
          app_push: {
            ios_config: {
              fcm_sa_json_base64_encoded: createEncodedServiceAccount('test-project'),
            },
          },
        },
      ],
    }),
  ),
};

interface MockIosProject {
  projectPath: string;
  workspacePath?: string;
  bundleId: string;
  appName: string;
  targets: string[];
  entitlementsFiles: string[];
  teamId?: string;
}

interface MockIosProjectAnalysisResult {
  success: boolean;
  project?: MockIosProject;
  error?: string;
}

interface MockEntitlementsData {
  'aps-environment'?: string;
  'com.apple.security.application-groups'?: string[];
  [key: string]: unknown;
}

const mockIos = {
  analyzeIosProject: mock<(cwd: string) => Promise<MockIosProjectAnalysisResult>>(() =>
    Promise.resolve({
      success: false,
      error: 'No iOS project',
    }),
  ),
  generateAppGroupId: mock<(bundleId: string) => string>(
    (bundleId: string) => `group.clix.${bundleId}`,
  ),
  getIosProjectDir: mock<(projectPath: string) => string>(() => '/test/ios'),
  getExtensionName: mock<(appName: string) => string>(
    (appName: string) => `${appName}NotificationServiceExtension`,
  ),
  getExtensionBundleId: mock<(bundleId: string, appName: string) => string>(
    (bundleId: string, appName: string) => `${bundleId}.${appName}NotificationServiceExtension`,
  ),
  hasNotificationServiceExtension: mock<(projectPath: string, extensionName: string) => boolean>(
    () => false,
  ),
  getNotificationServiceExtensionStatus: mock(() => ({
    targetExists: false,
    buildSettings: {
      enableUserScriptSandboxingNo: false,
      infoPlistConfigured: false,
      codeSignEntitlementsConfigured: false,
    },
  })),
  hasPodfile: mock<(iosDir: string) => boolean>(() => false),
  hasExtensionTarget: mock<(iosDir: string, extensionName: string) => boolean>(() => false),
  hasClixPodInExtensionTarget: mock<(iosDir: string, extensionName: string) => boolean>(
    () => false,
  ),
  inspectNotificationServiceSwift: mock<
    (
      iosDir: string,
      appName: string,
    ) => {
      exists: boolean;
      path: string;
      importsClix: boolean;
      inheritsClixNse: boolean;
      hasRegisterCall: boolean;
      hasSuperDidReceive: boolean;
      registeredProjectId: string | null;
    }
  >(() => ({
    exists: false,
    path: '/test/ios/MyAppNotificationServiceExtension/NotificationService.swift',
    importsClix: false,
    inheritsClixNse: false,
    hasRegisterCall: false,
    hasSuperDidReceive: false,
    registeredProjectId: null,
  })),
  hasClixConfiguration: mock<
    (
      entitlements: MockEntitlementsData | null,
      bundleId: string,
    ) => { hasPush: boolean; hasAppGroup: boolean }
  >(() => ({ hasPush: false, hasAppGroup: false })),
  readEntitlements: mock<(entitlementsPath: string) => Promise<MockEntitlementsData | null>>(() =>
    Promise.resolve(null),
  ),
  verifyExtensionFiles: mock<
    (iosDir: string, appName: string) => { complete: boolean; missingFiles: string[] }
  >(() => ({
    complete: false,
    missingFiles: ['NotificationService.swift'],
  })),
};

mock.module('@/lib/services/firebase/firebase-service', () => ({
  FirebaseService: class {
    detect = mockFirebaseService.detect;
    getStatus = mockFirebaseService.getStatus;
  },
}));

mock.module('@/lib/api', () => ({
  getInternalApiClient: () => mockInternalApiClient,
}));

mock.module('@/lib/ios', () => ({
  analyzeIosProject: mockIos.analyzeIosProject,
  getExtensionName: mockIos.getExtensionName,
  getExtensionBundleId: mockIos.getExtensionBundleId,
  getNotificationServiceExtensionStatus: mockIos.getNotificationServiceExtensionStatus,
  hasNotificationServiceExtension: mockIos.hasNotificationServiceExtension,
  hasPodfile: mockIos.hasPodfile,
  hasExtensionTarget: mockIos.hasExtensionTarget,
  hasClixPodInExtensionTarget: mockIos.hasClixPodInExtensionTarget,
  generateAppGroupId: mockIos.generateAppGroupId,
  getIosProjectDir: mockIos.getIosProjectDir,
  hasClixConfiguration: mockIos.hasClixConfiguration,
  inspectNotificationServiceSwift: mockIos.inspectNotificationServiceSwift,
  readEntitlements: mockIos.readEntitlements,
  verifyExtensionFiles: mockIos.verifyExtensionFiles,
}));

describe('preparation', () => {
  beforeEach(() => {
    mockFirebaseService.detect.mockClear();
    mockFirebaseService.getStatus.mockClear();
    mockInternalApiClient.getProject.mockClear();
    mockInternalApiClient.getProject.mockImplementation(() =>
      Promise.resolve({
        id: 'clix-project',
        name: 'Project',
        organization_id: 'org-1',
        sender_configs: [
          {
            channel_type: 'CHANNEL_TYPE_APP_PUSH',
            app_push: {
              ios_config: {
                fcm_sa_json_base64_encoded: createEncodedServiceAccount('test-project'),
              },
            },
          },
        ],
      }),
    );

    mockIos.analyzeIosProject.mockClear();
    mockIos.generateAppGroupId.mockClear();
    mockIos.getIosProjectDir.mockClear();
    mockIos.getExtensionName.mockClear();
    mockIos.getExtensionBundleId.mockClear();
    mockIos.getNotificationServiceExtensionStatus.mockClear();
    mockIos.hasNotificationServiceExtension.mockClear();
    mockIos.hasPodfile.mockClear();
    mockIos.hasExtensionTarget.mockClear();
    mockIos.hasClixPodInExtensionTarget.mockClear();
    mockIos.hasClixConfiguration.mockClear();
    mockIos.inspectNotificationServiceSwift.mockClear();
    mockIos.readEntitlements.mockClear();
    mockIos.verifyExtensionFiles.mockClear();

    mockIos.analyzeIosProject.mockImplementation(() =>
      Promise.resolve({
        success: false,
        error: 'No iOS project',
      }),
    );
    mockIos.generateAppGroupId.mockImplementation((bundleId: string) => `group.clix.${bundleId}`);
    mockIos.getIosProjectDir.mockImplementation(() => '/test/ios');
    mockIos.getExtensionName.mockImplementation(
      (appName: string) => `${appName}NotificationServiceExtension`,
    );
    mockIos.getExtensionBundleId.mockImplementation(
      (bundleId: string, appName: string) => `${bundleId}.${appName}NotificationServiceExtension`,
    );
    mockIos.getNotificationServiceExtensionStatus.mockImplementation(() => ({
      targetExists: false,
      buildSettings: {
        enableUserScriptSandboxingNo: false,
        infoPlistConfigured: false,
        codeSignEntitlementsConfigured: false,
      },
    }));
    mockIos.hasNotificationServiceExtension.mockImplementation(() => false);
    mockIos.hasPodfile.mockImplementation(() => false);
    mockIos.hasExtensionTarget.mockImplementation(() => false);
    mockIos.hasClixPodInExtensionTarget.mockImplementation(() => false);
    mockIos.hasClixConfiguration.mockImplementation(() => ({ hasPush: false, hasAppGroup: false }));
    mockIos.inspectNotificationServiceSwift.mockImplementation(() => ({
      exists: false,
      path: '/test/ios/MyAppNotificationServiceExtension/NotificationService.swift',
      importsClix: false,
      inheritsClixNse: false,
      hasRegisterCall: false,
      hasSuperDidReceive: false,
      registeredProjectId: null,
    }));
    mockIos.readEntitlements.mockImplementation(() => Promise.resolve(null));
    mockIos.verifyExtensionFiles.mockImplementation(() => ({
      complete: false,
      missingFiles: ['NotificationService.swift'],
    }));
  });

  describe('checkIosStatus', () => {
    test('should return needed=false for Android-only projects', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'android' };
      const status = await checkIosStatus('/test', projectType);

      expect(status.needed).toBe(false);
      expect(status.entitlementsConfigured).toBe(true);
      expect(status.nseConfigured).toBe(true);
    });

    test('should return needed=true for iOS projects', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };
      const status = await checkIosStatus('/test', projectType);

      expect(status.needed).toBe(true);
      expect(status.entitlementsConfigured).toBe(false);
      expect(status.nseConfigured).toBe(false);
    });

    test('should return needed=true for cross-platform projects', async () => {
      const projectType: ProjectType = { framework: 'react-native', target: 'ios-android' };
      const status = await checkIosStatus('/test', projectType);

      expect(status.needed).toBe(true);
    });

    test('should ignore cached completion flags and fallback to file evidence', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };
      const setup = {
        ios: {
          bundleId: 'com.test.app',
          teamId: 'ABC123',
          appGroupId: 'group.com.test.app',
          entitlementsConfigured: true,
          nseConfigured: true,
        },
      };

      const status = await checkIosStatus('/test', projectType, setup);

      expect(status.needed).toBe(true);
      expect(status.bundleId).toBe('com.test.app');
      expect(status.teamId).toBe('ABC123');
      expect(status.appGroupId).toBe('group.com.test.app');
      expect(status.entitlementsConfigured).toBe(false);
      expect(status.nseConfigured).toBe(false);
    });

    test('should mark iOS setup complete only when required files are verified', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };

      mockIos.analyzeIosProject.mockResolvedValueOnce({
        success: true,
        project: {
          projectPath: '/test/ios/MyApp.xcodeproj',
          workspacePath: '/test/ios/MyApp.xcworkspace',
          bundleId: 'com.test.app',
          appName: 'MyApp',
          targets: ['MyApp'],
          entitlementsFiles: ['/test/ios/MyApp/MyApp.entitlements'],
          teamId: 'TEAM123456',
        },
      });
      mockIos.readEntitlements.mockResolvedValueOnce({
        'aps-environment': 'development',
        'com.apple.security.application-groups': ['group.clix.com.test.app'],
      });
      mockIos.hasClixConfiguration.mockReturnValueOnce({ hasPush: true, hasAppGroup: true });
      mockIos.verifyExtensionFiles.mockReturnValueOnce({ complete: true, missingFiles: [] });
      mockIos.hasNotificationServiceExtension.mockReturnValueOnce(true);
      mockIos.getNotificationServiceExtensionStatus.mockReturnValueOnce({
        targetExists: true,
        buildSettings: {
          enableUserScriptSandboxingNo: true,
          infoPlistConfigured: true,
          codeSignEntitlementsConfigured: true,
        },
      });
      mockIos.hasPodfile.mockReturnValueOnce(false);
      mockIos.inspectNotificationServiceSwift.mockReturnValueOnce({
        exists: true,
        path: '/test/ios/MyAppNotificationServiceExtension/NotificationService.swift',
        importsClix: true,
        inheritsClixNse: true,
        hasRegisterCall: true,
        hasSuperDidReceive: true,
        registeredProjectId: 'project-id',
      });

      const status = await checkIosStatus('/test', projectType);

      expect(status.needed).toBe(true);
      expect(status.bundleId).toBe('com.test.app');
      expect(status.teamId).toBe('TEAM123456');
      expect(status.appGroupId).toBe('group.clix.com.test.app');
      expect(status.entitlementsConfigured).toBe(true);
      expect(status.nseConfigured).toBe(true);
    });

    test('should continue scanning entitlements files when one file is malformed', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };

      mockIos.analyzeIosProject.mockResolvedValueOnce({
        success: true,
        project: {
          projectPath: '/test/ios/MyApp.xcodeproj',
          workspacePath: '/test/ios/MyApp.xcworkspace',
          bundleId: 'com.test.app',
          appName: 'MyApp',
          targets: ['MyApp'],
          entitlementsFiles: [
            '/test/ios/MyApp/bad.entitlements',
            '/test/ios/MyApp/MyApp.entitlements',
          ],
          teamId: 'TEAM123456',
        },
      });
      mockIos.readEntitlements
        .mockRejectedValueOnce(new Error('invalid plist'))
        .mockResolvedValueOnce({
          'aps-environment': 'development',
          'com.apple.security.application-groups': ['group.clix.com.test.app'],
        });
      mockIos.hasClixConfiguration.mockReturnValueOnce({ hasPush: true, hasAppGroup: true });
      mockIos.verifyExtensionFiles.mockReturnValueOnce({ complete: true, missingFiles: [] });
      mockIos.hasNotificationServiceExtension.mockReturnValueOnce(true);
      mockIos.getNotificationServiceExtensionStatus.mockReturnValueOnce({
        targetExists: true,
        buildSettings: {
          enableUserScriptSandboxingNo: true,
          infoPlistConfigured: true,
          codeSignEntitlementsConfigured: true,
        },
      });
      mockIos.hasPodfile.mockReturnValueOnce(false);
      mockIos.inspectNotificationServiceSwift.mockReturnValueOnce({
        exists: true,
        path: '/test/ios/MyAppNotificationServiceExtension/NotificationService.swift',
        importsClix: true,
        inheritsClixNse: true,
        hasRegisterCall: true,
        hasSuperDidReceive: true,
        registeredProjectId: 'project-id',
      });

      const status = await checkIosStatus('/test', projectType);

      expect(status.entitlementsConfigured).toBe(true);
      expect(status.nseConfigured).toBe(true);
    });

    test('should not treat extension entitlements as main iOS entitlements', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };

      mockIos.analyzeIosProject.mockResolvedValueOnce({
        success: true,
        project: {
          projectPath: '/test/ios/MyApp.xcodeproj',
          workspacePath: '/test/ios/MyApp.xcworkspace',
          bundleId: 'com.test.app',
          appName: 'MyApp',
          targets: ['MyApp', 'MyAppNotificationServiceExtension'],
          entitlementsFiles: [
            '/test/ios/MyAppNotificationServiceExtension/MyAppNotificationServiceExtension.entitlements',
          ],
          teamId: 'TEAM123456',
        },
      });
      mockIos.readEntitlements.mockResolvedValueOnce({
        'aps-environment': 'development',
        'com.apple.security.application-groups': ['group.clix.com.test.app'],
      });
      mockIos.hasClixConfiguration.mockReturnValueOnce({ hasPush: true, hasAppGroup: true });

      const status = await checkIosStatus('/test', projectType);

      expect(status.entitlementsConfigured).toBe(false);
    });
  });

  describe('checkApnsStatus', () => {
    test('should return needed=false for Android-only projects', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'android' };
      const status = await checkApnsStatus('/test', projectType);

      expect(status.needed).toBe(false);
      expect(status.registeredWithFirebase).toBe(true);
    });

    test('should return needed=true and not configured for iOS projects without setup', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };
      const status = await checkApnsStatus('/test', projectType);

      expect(status.needed).toBe(true);
      expect(status.registeredWithFirebase).toBe(false);
    });

    test('should use existing APNS setup status from config', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };
      const setup = {
        apns: {
          keyId: 'ABC1234567',
          teamId: 'TEAMID1234',
          registeredWithFirebase: true,
        },
      };

      const status = await checkApnsStatus('/test', projectType, setup);

      expect(status.needed).toBe(true);
      expect(status.keyId).toBe('ABC1234567');
      expect(status.teamId).toBe('TEAMID1234');
      expect(status.registeredWithFirebase).toBe(true);
    });
  });

  describe('checkFirebaseStatus', () => {
    test('should return needed=false for unknown target', async () => {
      const projectType: ProjectType = { framework: 'unknown', target: 'unknown' };
      const status = await checkFirebaseStatus('/test', projectType);

      expect(status.needed).toBe(false);
      expect(status.configured).toBe(true);
      expect(status.senderConfigConfigured).toBe(true);
      expect(status.senderConfigProjectMatched).toBe(true);
    });

    test('should always detect files even if setup config exists', async () => {
      const projectType: ProjectType = { framework: 'react-native', target: 'ios-android' };
      const setup = {
        firebase: {
          projectId: 'my-project',
          androidConfigured: true,
          iosConfigured: true,
        },
      };

      const status = await checkFirebaseStatus('/test', projectType, setup, 'clix-project');

      // Should always run file detection regardless of cached setup
      expect(mockFirebaseService.detect).toHaveBeenCalled();
      expect(mockFirebaseService.getStatus).toHaveBeenCalled();
      expect(mockInternalApiClient.getProject).toHaveBeenCalledWith('clix-project');
      expect(status.configured).toBe(true);
      // Project ID from detected files takes precedence over cached config
      expect(status.projectId).toBe('test-project');
      expect(status.senderConfigConfigured).toBe(true);
      expect(status.senderConfigProjectMatched).toBe(true);
    });

    test('should fallback to cached projectId when files have no project ID', async () => {
      const projectType: ProjectType = { framework: 'react-native', target: 'ios-android' };
      const setup = {
        firebase: {
          projectId: 'my-project',
          androidConfigured: true,
          iosConfigured: true,
        },
      };

      mockFirebaseService.detect.mockResolvedValueOnce({
        platform: 'react-native',
        android: null,
        ios: null,
        configured: true,
        issues: [],
        projectPath: '/test',
      });

      const status = await checkFirebaseStatus('/test', projectType, setup, 'clix-project');

      expect(status.projectId).toBe('my-project');
    });

    test('should detect Firebase config when not in setup', async () => {
      const projectType: ProjectType = { framework: 'react-native', target: 'ios-android' };

      const status = await checkFirebaseStatus('/test', projectType, undefined, 'clix-project');

      expect(status.needed).toBe(true);
      expect(mockFirebaseService.detect).toHaveBeenCalled();
      expect(mockFirebaseService.getStatus).toHaveBeenCalled();
      expect(mockInternalApiClient.getProject).toHaveBeenCalledWith('clix-project');
    });

    test('should check only Android for Android-only projects', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'android' };

      mockFirebaseService.getStatus.mockResolvedValueOnce({
        status: 'configured',
        androidConfigured: true,
        iosConfigured: false,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
      });

      const status = await checkFirebaseStatus('/test', projectType, undefined, 'clix-project');

      expect(status.configured).toBe(true);
      expect(status.androidConfigured).toBe(true);
      // iOS not needed, so configured is true
      expect(status.iosConfigured).toBe(true);
    });

    test('should check only iOS for iOS-only projects', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };

      mockFirebaseService.getStatus.mockResolvedValueOnce({
        status: 'configured',
        androidConfigured: false,
        iosConfigured: true,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
      });

      const status = await checkFirebaseStatus('/test', projectType, undefined, 'clix-project');

      expect(status.configured).toBe(true);
      // Android not needed, so configured is true
      expect(status.androidConfigured).toBe(true);
      expect(status.iosConfigured).toBe(true);
    });

    test('should return configured=false when sender config is missing', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };
      mockInternalApiClient.getProject.mockResolvedValueOnce({
        id: 'clix-project',
        name: 'Project',
        organization_id: 'org-1',
        sender_configs: [],
      });

      const status = await checkFirebaseStatus('/test', projectType, undefined, 'clix-project');

      expect(status.iosConfigured).toBe(true);
      expect(status.senderConfigConfigured).toBe(false);
      expect(status.configured).toBe(false);
    });

    test('should return configured=false when sender config check fails', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };
      mockInternalApiClient.getProject.mockRejectedValueOnce(new Error('API failure'));

      const status = await checkFirebaseStatus('/test', projectType, undefined, 'clix-project');

      expect(status.iosConfigured).toBe(true);
      expect(status.senderConfigConfigured).toBe(false);
      expect(status.configured).toBe(false);
    });

    test('should return configured=false when sender config project mismatches Firebase config files', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };
      mockInternalApiClient.getProject.mockResolvedValueOnce({
        id: 'clix-project',
        name: 'Project',
        organization_id: 'org-1',
        sender_configs: [
          {
            channel_type: 'CHANNEL_TYPE_APP_PUSH',
            app_push: {
              ios_config: {
                fcm_sa_json_base64_encoded: createEncodedServiceAccount('other-project'),
              },
            },
          },
        ],
      });

      const status = await checkFirebaseStatus('/test', projectType, undefined, 'clix-project');

      expect(status.senderConfigConfigured).toBe(true);
      expect(status.senderConfigProjectMatched).toBe(false);
      expect(status.configured).toBe(false);
    });

    test('should return configured=false when sender config cannot be decoded for project match', async () => {
      const projectType: ProjectType = { framework: 'native', target: 'ios' };
      mockInternalApiClient.getProject.mockResolvedValueOnce({
        id: 'clix-project',
        name: 'Project',
        organization_id: 'org-1',
        sender_configs: [
          {
            channel_type: 'CHANNEL_TYPE_APP_PUSH',
            app_push: {
              ios_config: {
                fcm_sa_json_base64_encoded: 'not-valid-base64',
              },
            },
          },
        ],
      });

      const status = await checkFirebaseStatus('/test', projectType, undefined, 'clix-project');

      expect(status.senderConfigConfigured).toBe(true);
      expect(status.senderConfigProjectMatched).toBe(false);
      expect(status.configured).toBe(false);
    });
  });
});
