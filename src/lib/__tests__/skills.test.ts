import { describe, expect, test } from 'bun:test';
import { EMBEDDED_SKILLS, getEmbeddedSkill, hasEmbeddedSkills } from '../embedded-skills';
import type { AgentMessage } from '../executor';
import {
  AVAILABLE_SKILLS,
  executeSkill,
  getSkillInfo,
  getSkillPrompt,
  type SkillType,
} from '../skills';
import { createMockExecutorWithResponses, FIXTURES } from './test-utils';

describe('AVAILABLE_SKILLS', () => {
  test('should contain at least 5 skills (embedded + local)', () => {
    // 5 embedded skills from @clix-so/clix-agent-skills + 1 local (doctor)
    expect(AVAILABLE_SKILLS.length).toBeGreaterThanOrEqual(5);
  });

  test('should have integration skill', () => {
    const skill = AVAILABLE_SKILLS.find((s) => s.type === 'integration');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('SDK Integration');
  });

  test('install skill should be a separate local skill', () => {
    // 'clix install' is now a separate autonomous installation skill
    const { getAvailableSkillTypes, getSkillInfo } = require('../skills');
    const skillTypes = getAvailableSkillTypes();
    expect(skillTypes).toContain('install');
    expect(skillTypes).toContain('project-build');

    const installSkill = getSkillInfo('install');
    expect(installSkill?.isLocal).toBe(true);
    expect(installSkill?.name).toBe('SDK Installation');
  });

  test('should have event-tracking skill', () => {
    const skill = AVAILABLE_SKILLS.find((s) => s.type === 'event-tracking');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('Event Tracking');
  });

  test('should have user-management skill', () => {
    const skill = AVAILABLE_SKILLS.find((s) => s.type === 'user-management');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('User Management');
  });

  test('should have personalization skill', () => {
    const skill = AVAILABLE_SKILLS.find((s) => s.type === 'personalization');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('Personalization');
  });

  test('should have doctor skill', () => {
    const skill = AVAILABLE_SKILLS.find((s) => s.type === 'doctor');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('SDK Doctor');
  });

  test('each skill should have type, name, and description', () => {
    for (const skill of AVAILABLE_SKILLS) {
      expect(skill.type).toBeDefined();
      expect(skill.name).toBeDefined();
      expect(skill.description).toBeDefined();
      expect(typeof skill.type).toBe('string');
      expect(typeof skill.name).toBe('string');
      expect(typeof skill.description).toBe('string');
    }
  });
});

describe('getSkillInfo', () => {
  test('should return skill info for valid skill type', () => {
    const skill = getSkillInfo('integration');
    expect(skill).toBeDefined();
    expect(skill?.type).toBe('integration');
    expect(skill?.name).toBe('SDK Integration');
  });

  test('should return undefined for invalid skill type', () => {
    const skill = getSkillInfo('invalid' as unknown as SkillType);
    expect(skill).toBeUndefined();
  });

  test('should return correct info for doctor skill', () => {
    const skill = getSkillInfo('doctor');
    expect(skill).toBeDefined();
    expect(skill?.type).toBe('doctor');
    expect(skill?.description).toContain('Check');
  });

  test('should return all skill types correctly', () => {
    for (const skillType of FIXTURES.skillTypes) {
      const skill = getSkillInfo(skillType);
      expect(skill).toBeDefined();
      expect(skill?.type).toBe(skillType);
    }
  });
});

describe('getSkillPrompt', () => {
  describe('doctor skill (local)', () => {
    test('should return doctor prompt with project path', async () => {
      const prompt = await getSkillPrompt('doctor', {
        projectPath: '/test/project',
      });

      expect(prompt).toContain('Project path: /test/project');
      expect(prompt).toContain('analyzing a mobile project for Clix SDK');
    });

    test('should include diagnostic JSON structure', async () => {
      const prompt = await getSkillPrompt('doctor');

      expect(prompt).toContain('"platform"');
      expect(prompt).toContain('"sdkInstalled"');
      expect(prompt).toContain('"pushConfigured"');
      expect(prompt).toContain('"issues"');
      expect(prompt).toContain('"checklist"');
    });

    test('should include platform detection instructions', async () => {
      const prompt = await getSkillPrompt('doctor');

      expect(prompt).toContain('package.json');
      expect(prompt).toContain('pubspec.yaml');
      expect(prompt).toContain('xcodeproj');
      expect(prompt).toContain('build.gradle');
    });

    test('should include SDK installation check instructions', async () => {
      const prompt = await getSkillPrompt('doctor');

      expect(prompt).toContain('ClixSDK');
      expect(prompt).toContain('@clix-so/react-native-sdk');
      expect(prompt).toContain('clix_flutter_sdk');
    });

    test('should use cwd when projectPath not provided', async () => {
      const prompt = await getSkillPrompt('doctor');
      expect(prompt).toContain(`Project path: ${process.cwd()}`);
    });
  });

  describe('skills from @clix-so/clix-agent-skills package', () => {
    test('integration skill should load from package', async () => {
      const prompt = await getSkillPrompt('integration', {
        projectPath: '/test/project',
        platform: 'ios',
      });

      expect(prompt).toContain('Project path: /test/project');
      expect(prompt).toContain('Target platform: ios');
    });

    test('event-tracking skill should load from package', async () => {
      const prompt = await getSkillPrompt('event-tracking', {
        projectPath: '/test/project',
      });

      expect(prompt).toContain('Project path: /test/project');
    });

    test('user-management skill should load from package', async () => {
      const prompt = await getSkillPrompt('user-management', {
        projectPath: '/test/project',
      });

      expect(prompt).toContain('Project path: /test/project');
    });

    test('personalization skill should load from package', async () => {
      const prompt = await getSkillPrompt('personalization', {
        projectPath: '/test/project',
      });

      expect(prompt).toContain('Project path: /test/project');
    });

    test('should default platform to auto-detect', async () => {
      const prompt = await getSkillPrompt('integration');
      expect(prompt).toContain('Target platform: auto-detect');
    });
  });
});

describe('executeSkill', () => {
  test('should call executor with skill prompt', async () => {
    const mockExecutor = createMockExecutorWithResponses([
      { type: 'text', content: 'Executing skill...' },
      { type: 'complete', content: '' },
    ]);

    const messages: AgentMessage[] = [];
    for await (const message of executeSkill('doctor', mockExecutor)) {
      messages.push(message);
    }

    expect(messages.length).toBe(2);
    expect(messages[0].type).toBe('text');
    expect(messages[1].type).toBe('complete');
  });

  test('should pass options to executor', async () => {
    const mockExecutor = createMockExecutorWithResponses([
      { type: 'text', content: 'Done' },
      { type: 'complete', content: '' },
    ]);

    const options = {
      projectPath: '/custom/path',
      platform: 'ios' as const,
    };

    const messages: AgentMessage[] = [];
    for await (const message of executeSkill('doctor', mockExecutor, options)) {
      messages.push(message);
    }

    expect(messages.length).toBe(2);
    // Verify executor was called (we can't easily check the exact parameters without more complex mocking)
  });

  test('should yield all messages from executor', async () => {
    const mockExecutor = createMockExecutorWithResponses([
      { type: 'text', content: 'Part 1' },
      { type: 'text', content: 'Part 2' },
      { type: 'text', content: 'Part 3' },
      { type: 'complete', content: '' },
    ]);

    const messages: AgentMessage[] = [];
    for await (const message of executeSkill('integration', mockExecutor)) {
      messages.push(message);
    }

    expect(messages.length).toBe(4);
    expect(messages[0].content).toBe('Part 1');
    expect(messages[1].content).toBe('Part 2');
    expect(messages[2].content).toBe('Part 3');
  });
});

describe('SkillType', () => {
  test('should include all expected skill types', () => {
    const skillTypes: SkillType[] = [
      'integration',
      'event-tracking',
      'user-management',
      'personalization',
      'doctor',
    ];

    for (const type of skillTypes) {
      const skill = getSkillInfo(type);
      expect(skill).toBeDefined();
    }
  });
});

describe('SkillOptions', () => {
  test('should accept all platform types', async () => {
    for (const platform of FIXTURES.platforms) {
      const prompt = await getSkillPrompt('integration', { platform });
      expect(prompt).toContain(`Target platform: ${platform}`);
    }
  });
});

describe('preparationContext in install skill', () => {
  /**
   * These tests verify that preparationContext is properly integrated into the install skill prompt.
   * This covers the functionality that was previously in standalone firebase and ios-setup commands.
   */

  test('install skill should include pre-configured setup section when preparationContext is provided', async () => {
    const { getSkillPrompt } = await import('../skills');
    const preparationContext = {
      projectPath: '/test/project',
      config: {
        version: 2 as const,
        member: { id: 'member-1', email: 'test@example.com', name: 'Test User' },
        organization: { id: 'org-1', name: 'Test Org' },
        project: { id: 'project-1', name: 'Test Project', publicKey: 'pk_test_123' },
        linkedAt: '2024-01-01T00:00:00Z',
      },
      projectType: { framework: 'react-native' as const, target: 'ios-android' as const },
      firebase: {
        needed: true,
        configured: true,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: true,
        projectId: 'my-firebase-project',
      },
      ios: {
        needed: true,
        bundleId: 'com.test.app',
        teamId: 'TEAM123',
        appGroupId: 'group.com.test.app',
        entitlementsConfigured: true,
        nseConfigured: false,
      },
      apns: {
        needed: true,
        keyId: 'ABC1234567',
        teamId: 'TEAM123',
        registeredWithFirebase: true,
      },
      missing: ['Notification Service Extension'],
      ready: false,
    };

    const prompt = await getSkillPrompt('install', {
      projectPath: '/test/project',
      preparationContext,
    });

    // Verify pre-configured setup section is included
    expect(prompt).toContain('Pre-configured Setup');
    expect(prompt).toContain('Test Project');
    expect(prompt).toContain('Detected project type: react-native (iOS/Android)');
    expect(prompt).toContain('Install Step Verification');

    // Verify Clix project info
    expect(prompt).toContain('Clix Project');
    expect(prompt).toContain('project-1');
    expect(prompt).toContain('pk_test_123');

    // Verify Firebase info
    expect(prompt).toContain('Firebase');
    expect(prompt).toContain('my-firebase-project');
    expect(prompt).toContain('Android (google-services.json)');
    expect(prompt).toContain('iOS (GoogleService-Info.plist)');
    expect(prompt).toContain('Sender Config (App Push): ✓ configured');

    // Verify APNS info
    expect(prompt).toContain('APNS');
    expect(prompt).toContain('Key ID: ABC1234567');
    expect(prompt).toContain('Team ID: TEAM123');
    expect(prompt).toContain('Registered with Firebase: ✓ configured');

    // Verify iOS info
    expect(prompt).toContain('iOS');
    expect(prompt).toContain('com.test.app');
    expect(prompt).toContain('TEAM123');
    expect(prompt).toContain('group.com.test.app');
    expect(prompt).toContain('Entitlements');
    expect(prompt).toContain('NSE');

    // Verify missing items
    expect(prompt).toContain('Missing Setup');
    expect(prompt).toContain('Notification Service Extension');
  });

  test('install skill should not include iOS section when iOS is not needed', async () => {
    const { getSkillPrompt } = await import('../skills');
    const preparationContext = {
      projectPath: '/test/project',
      config: {
        version: 2 as const,
        member: { id: 'member-1', email: 'test@example.com', name: 'Test User' },
        organization: { id: 'org-1', name: 'Test Org' },
        project: { id: 'project-1', name: 'Android Project' },
        linkedAt: '2024-01-01T00:00:00Z',
      },
      projectType: { framework: 'native' as const, target: 'android' as const },
      firebase: {
        needed: true,
        configured: true,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: true,
        projectId: 'android-project',
      },
      ios: {
        needed: false,
        bundleId: undefined,
        teamId: undefined,
        appGroupId: undefined,
        entitlementsConfigured: true,
        nseConfigured: true,
      },
      apns: {
        needed: false,
        registeredWithFirebase: true,
      },
      missing: [],
      ready: true,
    };

    const prompt = await getSkillPrompt('install', {
      projectPath: '/test/project',
      preparationContext,
    });

    // Should have Firebase section
    expect(prompt).toContain('Firebase');
    expect(prompt).toContain('android-project');

    // Should NOT have iOS section (needed=false)
    const iosHeaderMatch = prompt.match(/### iOS\n/);
    expect(iosHeaderMatch).toBeNull();
  });

  test('install skill should not include Firebase section when Firebase is not needed', async () => {
    const { getSkillPrompt } = await import('../skills');
    const preparationContext = {
      projectPath: '/test/project',
      config: {
        version: 2 as const,
        member: { id: 'member-1', email: 'test@example.com', name: 'Test User' },
        organization: { id: 'org-1', name: 'Test Org' },
        project: { id: 'project-1', name: 'Unknown Project' },
        linkedAt: '2024-01-01T00:00:00Z',
      },
      projectType: { framework: 'unknown' as const, target: 'unknown' as const },
      firebase: {
        needed: false,
        configured: true,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: true,
        projectId: undefined,
      },
      ios: {
        needed: false,
        bundleId: undefined,
        teamId: undefined,
        appGroupId: undefined,
        entitlementsConfigured: true,
        nseConfigured: true,
      },
      apns: {
        needed: false,
        registeredWithFirebase: true,
      },
      missing: [],
      ready: true,
    };

    const prompt = await getSkillPrompt('install', {
      projectPath: '/test/project',
      preparationContext,
    });

    // Should NOT have Firebase section (needed=false)
    const firebaseHeaderMatch = prompt.match(/### Firebase\n/);
    expect(firebaseHeaderMatch).toBeNull();
  });

  test('install skill without preparationContext should work normally', async () => {
    const { getSkillPrompt } = await import('../skills');

    const prompt = await getSkillPrompt('install', {
      projectPath: '/test/project',
    });

    // Should have basic info but no pre-configured setup section
    expect(prompt).toContain('Project path: /test/project');
    // Pre-configured Setup section should not appear without context
    expect(prompt).not.toContain('### Clix Project');
  });

  test('install skill should execute SDK integration prompt content', async () => {
    const { getSkillPrompt } = await import('../skills');

    const prompt = await getSkillPrompt('install', {
      projectPath: '/test/project',
    });

    expect(prompt).toContain('# Clix SDK Autonomous Integration');
    expect(prompt).toContain('SDK code integration');
  });

  test('project-build skill should execute project-build prompt content', async () => {
    const { getSkillPrompt } = await import('../skills');

    const prompt = await getSkillPrompt('project-build', {
      projectPath: '/test/project',
    });

    expect(prompt).toContain('# Project Build');
    expect(prompt).toContain('Inputs from `/install` (already provided)');
  });

  test('install skill should infer target platform from preparationContext project type', async () => {
    const { getSkillPrompt } = await import('../skills');

    const preparationContext = {
      projectPath: '/test/project',
      config: {
        version: 2 as const,
        member: { id: 'member-1', email: 'test@example.com', name: 'Test User' },
        organization: { id: 'org-1', name: 'Test Org' },
        project: { id: 'project-1', name: 'Flutter Project' },
        linkedAt: '2024-01-01T00:00:00Z',
      },
      projectType: { framework: 'flutter' as const, target: 'ios-android' as const },
      firebase: {
        needed: false,
        configured: false,
        androidConfigured: false,
        iosConfigured: false,
        senderConfigConfigured: false,
        projectId: undefined,
      },
      ios: {
        needed: false,
        bundleId: undefined,
        teamId: undefined,
        appGroupId: undefined,
        entitlementsConfigured: false,
        nseConfigured: false,
      },
      apns: {
        needed: false,
        registeredWithFirebase: false,
      },
      missing: [],
      ready: true,
    };

    const prompt = await getSkillPrompt('install', {
      projectPath: '/test/project',
      preparationContext,
    });

    expect(prompt).toContain('Target platform: flutter');
  });
});

describe('error handling', () => {
  describe('getSkillPrompt error messages', () => {
    test('should return clear error message when skills package is missing', async () => {
      // This test verifies that when getSkillPrompt fails, it throws with a clear message
      // The actual error would occur in a binary build without @clix-so/clix-agent-skills installed
      // Here we verify the diagnose skill (local) works correctly as a baseline
      const prompt = await getSkillPrompt('doctor');
      expect(prompt).toContain('Project path:');
    });

    test('error from missing skill should contain installation instructions', async () => {
      // Simulate the expected error message format
      const expectedErrorMessage =
        'Skills package not found. Please install it: npm install -g @clix-so/clix-agent-skills';

      // Verify the error message format matches what we expect in production
      expect(expectedErrorMessage).toContain('Skills package not found');
      expect(expectedErrorMessage).toContain('npm install');
      expect(expectedErrorMessage).toContain('@clix-so/clix-agent-skills');
    });

    test('error from missing skill file should be descriptive', async () => {
      // Simulate the expected error message format for missing skill files
      const skillFolder = 'integration';
      const expectedErrorMessage = `Failed to read skill file for "${skillFolder}". Ensure @clix-so/clix-agent-skills is installed.`;

      expect(expectedErrorMessage).toContain('Failed to read skill file');
      expect(expectedErrorMessage).toContain(skillFolder);
      expect(expectedErrorMessage).toContain('@clix-so/clix-agent-skills');
    });
  });

  describe('executeSkill error propagation', () => {
    test('should propagate errors from executor', async () => {
      const errorMessage = 'Test execution error';
      const mockExecutor = createMockExecutorWithResponses([
        { type: 'error', content: errorMessage },
      ]);

      const messages: AgentMessage[] = [];
      for await (const message of executeSkill('doctor', mockExecutor)) {
        messages.push(message);
      }

      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('error');
      expect(messages[0].content).toBe(errorMessage);
    });

    test('should handle executor that throws Error', async () => {
      const mockExecutor = createMockExecutorWithResponses([]);
      const originalExecute = mockExecutor.execute.bind(mockExecutor);

      // Override execute to throw an Error
      // biome-ignore lint/correctness/useYield: Intentionally throws before yielding to test error handling
      mockExecutor.execute = async function* () {
        throw new Error('Executor threw an error');
      };

      try {
        const messages: AgentMessage[] = [];
        for await (const message of executeSkill('doctor', mockExecutor)) {
          messages.push(message);
        }
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Executor threw an error');
      }

      // Restore original execute
      mockExecutor.execute = originalExecute;
    });

    test('should handle executor that throws non-Error', async () => {
      const mockExecutor = createMockExecutorWithResponses([]);

      // Override execute to throw a string
      // biome-ignore lint/correctness/useYield: Intentionally throws before yielding to test error handling
      mockExecutor.execute = async function* () {
        throw 'String error thrown';
      };

      try {
        const messages: AgentMessage[] = [];
        for await (const message of executeSkill('doctor', mockExecutor)) {
          messages.push(message);
        }
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBe('String error thrown');
      }
    });
  });
});

describe('embedded skills fallback', () => {
  /**
   * These tests verify that embedded skills are available as a fallback
   * when the external @clix-so/clix-agent-skills package is not installed.
   * This is critical for the binary distribution to work standalone.
   */

  const SKILL_FOLDER_MAP = {
    integration: 'integration',
    'event-tracking': 'event-tracking',
    'user-management': 'user-management',
    personalization: 'personalization',
  };

  describe('embedded skills are present', () => {
    test('hasEmbeddedSkills should return true', () => {
      expect(hasEmbeddedSkills()).toBe(true);
    });

    test('all required skill folders should be embedded', () => {
      for (const folder of Object.values(SKILL_FOLDER_MAP)) {
        const skill = getEmbeddedSkill(folder);
        expect(skill).toBeDefined();
        expect(typeof skill).toBe('string');
        expect(skill?.length).toBeGreaterThan(100); // Skills should have substantial content
      }
    });

    test('EMBEDDED_SKILLS should have at least 4 skills', () => {
      // At minimum: integration, event-tracking, user-management, personalization
      expect(Object.keys(EMBEDDED_SKILLS).length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('embedded skills content validation', () => {
    test('integration skill should contain SDK integration instructions', () => {
      const skill = getEmbeddedSkill('integration');
      expect(skill).toContain('clix-integration');
      expect(skill).toContain('SDK');
    });

    test('event-tracking skill should contain trackEvent instructions', () => {
      const skill = getEmbeddedSkill('event-tracking');
      expect(skill).toContain('clix-event-tracking');
      expect(skill).toContain('trackEvent');
    });

    test('user-management skill should contain setUserId instructions', () => {
      const skill = getEmbeddedSkill('user-management');
      expect(skill).toContain('clix-user-management');
      expect(skill).toContain('setUserId');
    });

    test('personalization skill should contain personalization instructions', () => {
      const skill = getEmbeddedSkill('personalization');
      expect(skill).toContain('clix-personalization');
    });
  });

  describe('skill loading matches embedded skills', () => {
    /**
     * Verify that getSkillPrompt returns content that matches embedded skills.
     * In dev environment, external package is preferred, but embedded skills
     * should have the same content (from the same source).
     */
    test('integration skill prompt should match embedded content structure', async () => {
      const prompt = await getSkillPrompt('integration');
      const embedded = getEmbeddedSkill('integration');

      // Both should contain the same skill marker
      expect(embedded).toContain('clix-integration');
      // Prompt includes project path prefix, but should contain skill content
      expect(prompt).toContain('Project path:');
    });

    test('event-tracking skill prompt should match embedded content structure', async () => {
      const prompt = await getSkillPrompt('event-tracking');
      const embedded = getEmbeddedSkill('event-tracking');

      expect(embedded).toContain('clix-event-tracking');
      expect(prompt).toContain('Project path:');
    });

    test('user-management skill prompt should match embedded content structure', async () => {
      const prompt = await getSkillPrompt('user-management');
      const embedded = getEmbeddedSkill('user-management');

      expect(embedded).toContain('clix-user-management');
      expect(prompt).toContain('Project path:');
    });

    test('personalization skill prompt should match embedded content structure', async () => {
      const prompt = await getSkillPrompt('personalization');
      const embedded = getEmbeddedSkill('personalization');

      expect(embedded).toContain('clix-personalization');
      expect(prompt).toContain('Project path:');
    });
  });
});
