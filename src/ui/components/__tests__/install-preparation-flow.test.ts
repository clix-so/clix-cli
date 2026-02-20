import { describe, expect, test } from 'bun:test';
import type {
  ApnsStatus,
  FirebaseStatus,
  IosStatus,
  PreparationContext,
} from '@/commands/skill/preparation';
import type { ProjectType } from '@/lib/config';
import { getStatusLayoutPolicy } from '../InstallPreparationUI';
import {
  getApplicableInstallTasks,
  getNextIncompleteTaskId,
  isTaskCompleted,
} from '../install-preparation-tasks';

function createContext(
  firebase: FirebaseStatus,
  ios: IosStatus,
  apns: ApnsStatus,
  ready: boolean,
  missing: string[] = [],
): PreparationContext {
  const projectType: ProjectType = { framework: 'react-native', target: 'ios-android' };

  return {
    projectPath: '/tmp/project',
    config: {
      version: 1,
      member: { id: 'member-1', email: 'a@b.com', name: 'member' },
      organization: { id: 'org-1', name: 'org' },
      project: { id: 'project-1', name: 'project' },
      linkedAt: new Date().toISOString(),
      projectType,
    },
    projectType,
    firebase,
    ios,
    apns,
    ready,
    missing,
  };
}

describe('Install preparation task pipeline', () => {
  test('returns all iOS-related tasks for iOS/cross-platform projects', () => {
    const context = createContext(
      {
        configured: false,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: false,
        needed: true,
      },
      {
        needed: true,
        entitlementsConfigured: false,
        nseConfigured: false,
      },
      {
        needed: true,
        registeredWithFirebase: false,
      },
      false,
      ['APNS Key for Firebase'],
    );

    expect(getApplicableInstallTasks(context)).toEqual([
      'firebase_config_files',
      'apns_key_for_firebase',
      'firebase_service_account',
      'ios_entitlements',
      'notification_service_extension',
      'project_build',
      'install_skill',
    ]);
  });

  test('returns first incomplete required task in order', () => {
    const context = createContext(
      {
        configured: false,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: false,
        needed: true,
      },
      {
        needed: true,
        entitlementsConfigured: false,
        nseConfigured: false,
      },
      {
        needed: true,
        registeredWithFirebase: false,
      },
      false,
      ['APNS Key for Firebase', 'Firebase Service Account'],
    );

    expect(getNextIncompleteTaskId(context)).toBe('apns_key_for_firebase');
  });

  test('moves to service account after APNS is complete', () => {
    const context = createContext(
      {
        configured: false,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: false,
        needed: true,
      },
      {
        needed: true,
        entitlementsConfigured: false,
        nseConfigured: false,
      },
      {
        needed: true,
        keyId: 'ABC1234567',
        registeredWithFirebase: true,
      },
      false,
      ['Firebase Service Account'],
    );

    expect(getNextIncompleteTaskId(context)).toBe('firebase_service_account');
  });

  test('considers APNS task complete only when registered', () => {
    const baseContext = createContext(
      {
        configured: false,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: false,
        needed: true,
      },
      {
        needed: true,
        entitlementsConfigured: true,
        nseConfigured: false,
      },
      {
        needed: true,
        registeredWithFirebase: false,
      },
      false,
      ['APNS Key for Firebase'],
    );

    expect(isTaskCompleted(baseContext, 'apns_key_for_firebase')).toBe(false);

    const completedContext = {
      ...baseContext,
      apns: {
        ...baseContext.apns,
        registeredWithFirebase: true,
      },
    };

    expect(isTaskCompleted(completedContext, 'apns_key_for_firebase')).toBe(true);
  });

  test('routes to project build after setup tasks are complete', () => {
    const context = createContext(
      {
        configured: true,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: true,
        needed: true,
      },
      {
        needed: true,
        entitlementsConfigured: true,
        nseConfigured: true,
      },
      {
        needed: true,
        registeredWithFirebase: true,
      },
      true,
      [],
    );

    expect(getNextIncompleteTaskId(context)).toBe('project_build');
    expect(isTaskCompleted(context, 'project_build')).toBe(false);
  });

  test('routes to SDK installation after project build is complete', () => {
    const context = createContext(
      {
        configured: true,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: true,
        needed: true,
      },
      {
        needed: true,
        entitlementsConfigured: true,
        nseConfigured: true,
      },
      {
        needed: true,
        registeredWithFirebase: true,
      },
      true,
      [],
    );

    expect(isTaskCompleted(context, 'project_build')).toBe(false);
    expect(isTaskCompleted(context, 'project_build', { project_build: 'complete' })).toBe(true);
    expect(getNextIncompleteTaskId(context, { project_build: 'complete' })).toBe('install_skill');
    expect(isTaskCompleted(context, 'install_skill')).toBe(false);
    expect(
      getNextIncompleteTaskId(context, {
        project_build: 'complete',
        install_skill: 'complete',
      }),
    ).toBeNull();
  });
});

describe('InstallPreparationUI status layout policy', () => {
  test('uses full layout on tall terminals', () => {
    const policy = getStatusLayoutPolicy(40);
    expect(policy.showOuterSpacing).toBe(true);
    expect(policy.showStatusSpacing).toBe(true);
    expect(policy.showProjectType).toBe(true);
    expect(policy.showDetailText).toBe(true);
    expect(policy.missingDisplayMode).toBe('full');
  });

  test('uses compact layout on medium-height terminals', () => {
    const policy = getStatusLayoutPolicy(30);
    expect(policy.showOuterSpacing).toBe(false);
    expect(policy.showStatusSpacing).toBe(false);
    expect(policy.showProjectType).toBe(true);
    expect(policy.showDetailText).toBe(true);
    expect(policy.missingDisplayMode).toBe('summary');
  });

  test('uses minimal layout on short terminals', () => {
    const policy = getStatusLayoutPolicy(24);
    expect(policy.showOuterSpacing).toBe(false);
    expect(policy.showStatusSpacing).toBe(false);
    expect(policy.showProjectType).toBe(false);
    expect(policy.showDetailText).toBe(false);
    expect(policy.missingDisplayMode).toBe('hidden');
  });

  test('falls back to default rows when terminal rows are invalid', () => {
    const policy = getStatusLayoutPolicy(undefined);
    expect(policy.showProjectType).toBe(false);
    expect(policy.showDetailText).toBe(false);
    expect(policy.missingDisplayMode).toBe('hidden');
  });
});
