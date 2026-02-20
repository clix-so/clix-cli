import { describe, expect, test } from 'bun:test';
import type {
  ApnsStatus,
  FirebaseStatus,
  IosStatus,
  PreparationContext,
} from '@/commands/skill/preparation';
import type { SenderConfig } from '@/lib/api';
import type { ProjectType } from '@/lib/config';
import { getStatusLayoutPolicy, validateSenderConfigProjectId } from '../InstallPreparationUI';
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

function createPushSenderConfig(projectId: string): SenderConfig {
  return {
    channel_type: 'CHANNEL_TYPE_APP_PUSH',
    app_push: {
      ios_config: {
        fcm_sa_json_base64_encoded: createEncodedServiceAccount(projectId),
      },
    },
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
      'firebase_service_account',
      'apns_key_for_firebase',
      'ios_entitlements',
      'notification_service_extension',
      'install_skill',
    ]);
  });

  test('returns service account before APNS in required task order', () => {
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

    expect(getNextIncompleteTaskId(context)).toBe('firebase_service_account');
  });

  test('moves to APNS after service account is complete', () => {
    const context = createContext(
      {
        configured: false,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: true,
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
        registeredWithFirebase: false,
      },
      false,
      ['APNS Key for Firebase'],
    );

    expect(getNextIncompleteTaskId(context)).toBe('apns_key_for_firebase');
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

  test('keeps service account task incomplete when sender config project mismatches', () => {
    const context = createContext(
      {
        configured: false,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: true,
        senderConfigProjectMatched: false,
        needed: true,
      },
      {
        needed: true,
        entitlementsConfigured: true,
        nseConfigured: false,
      },
      {
        needed: true,
        registeredWithFirebase: true,
      },
      false,
      ['Firebase Service Account'],
    );

    expect(isTaskCompleted(context, 'firebase_service_account')).toBe(false);
    expect(getNextIncompleteTaskId(context)).toBe('firebase_service_account');
  });

  test('routes to SDK installation after setup tasks are complete', () => {
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

    expect(getNextIncompleteTaskId(context)).toBe('install_skill');
    expect(isTaskCompleted(context, 'install_skill')).toBe(false);
  });

  test('returns null after SDK installation runtime task is complete', () => {
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

    expect(isTaskCompleted(context, 'install_skill')).toBe(false);
    expect(isTaskCompleted(context, 'install_skill', { install_skill: 'complete' })).toBe(true);
    expect(getNextIncompleteTaskId(context, { install_skill: 'complete' })).toBeNull();
  });

  test('excludes runtime tasks in command preparation mode', () => {
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

    expect(getApplicableInstallTasks(context, { includeRuntimeTasks: false })).toEqual([
      'firebase_config_files',
      'firebase_service_account',
      'apns_key_for_firebase',
      'ios_entitlements',
      'notification_service_extension',
    ]);
  });

  test('returns null after setup tasks when runtime tasks are excluded', () => {
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

    expect(getNextIncompleteTaskId(context, {}, { includeRuntimeTasks: false })).toBeNull();
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

describe('validateSenderConfigProjectId', () => {
  test('returns valid when decoded project id matches expected project id', () => {
    const senderConfig = createPushSenderConfig('match-project');
    expect(validateSenderConfigProjectId(senderConfig, 'match-project')).toEqual({
      status: 'valid',
    });
  });

  test('returns mismatch when decoded project id differs from expected project id', () => {
    const senderConfig = createPushSenderConfig('server-project');
    const result = validateSenderConfigProjectId(senderConfig, 'local-project');

    expect(result.status).toBe('mismatch');
    expect(result.mismatchMessage).toContain('server-project');
    expect(result.mismatchMessage).toContain('local-project');
  });

  test('returns decode_error when encoded service account cannot be decoded', () => {
    const senderConfig: SenderConfig = {
      channel_type: 'CHANNEL_TYPE_APP_PUSH',
      app_push: {
        ios_config: {
          fcm_sa_json_base64_encoded: 'not-valid-base64-data',
        },
      },
    };

    expect(validateSenderConfigProjectId(senderConfig, 'match-project')).toEqual({
      status: 'decode_error',
    });
  });

  test('returns no_encoded_data when sender config has no base64 service account fields', () => {
    const senderConfig: SenderConfig = {
      channel_type: 'CHANNEL_TYPE_APP_PUSH',
      app_push: {},
    };

    expect(validateSenderConfigProjectId(senderConfig, 'match-project')).toEqual({
      status: 'no_encoded_data',
    });
  });
});
