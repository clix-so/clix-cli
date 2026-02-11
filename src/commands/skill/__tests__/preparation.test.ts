import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ProjectType } from '@/lib/config';
import { checkFirebaseStatus, checkIosStatus } from '../preparation';

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

mock.module('@/lib/services/firebase/firebase-service', () => ({
  FirebaseService: class {
    detect = mockFirebaseService.detect;
    getStatus = mockFirebaseService.getStatus;
  },
}));

describe('preparation', () => {
  beforeEach(() => {
    mockFirebaseService.detect.mockClear();
    mockFirebaseService.getStatus.mockClear();
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

    test('should use existing setup status from config', async () => {
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
      expect(status.entitlementsConfigured).toBe(true);
      expect(status.nseConfigured).toBe(true);
    });
  });

  describe('checkFirebaseStatus', () => {
    test('should return needed=false for unknown target', async () => {
      const projectType: ProjectType = { framework: 'unknown', target: 'unknown' };
      const status = await checkFirebaseStatus('/test', projectType);

      expect(status.needed).toBe(false);
      expect(status.configured).toBe(true);
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

      const status = await checkFirebaseStatus('/test', projectType, setup);

      // Should always run file detection regardless of cached setup
      expect(mockFirebaseService.detect).toHaveBeenCalled();
      expect(mockFirebaseService.getStatus).toHaveBeenCalled();
      expect(status.configured).toBe(true);
      // Project ID from detected files takes precedence over cached config
      expect(status.projectId).toBe('test-project');
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

      const status = await checkFirebaseStatus('/test', projectType, setup);

      expect(status.projectId).toBe('my-project');
    });

    test('should detect Firebase config when not in setup', async () => {
      const projectType: ProjectType = { framework: 'react-native', target: 'ios-android' };

      const status = await checkFirebaseStatus('/test', projectType);

      expect(status.needed).toBe(true);
      expect(mockFirebaseService.detect).toHaveBeenCalled();
      expect(mockFirebaseService.getStatus).toHaveBeenCalled();
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

      const status = await checkFirebaseStatus('/test', projectType);

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

      const status = await checkFirebaseStatus('/test', projectType);

      expect(status.configured).toBe(true);
      // Android not needed, so configured is true
      expect(status.androidConfigured).toBe(true);
      expect(status.iosConfigured).toBe(true);
    });
  });
});
