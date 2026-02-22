import { describe, expect, mock, test } from 'bun:test';
import type { PreparationContext } from '@/commands/skill/preparation';
import type { AgentMessage, ExecuteOptions } from '../executor';
import {
  AVAILABLE_SKILLS,
  executeSkill,
  getAvailableSkillTypes,
  getSkillInfo,
  getSkillPrompt,
} from '../skills';
import { createMockExecutor, createMockExecutorWithResponses } from './test-utils';

describe('skills (command-only)', () => {
  test('exposes local command skills only', () => {
    expect(getAvailableSkillTypes()).toEqual(['install', 'doctor']);
    expect(AVAILABLE_SKILLS.map((s) => s.type)).toEqual(['install', 'doctor']);
    expect(getSkillInfo('integration')).toBeUndefined();
  });

  test('returns install skill metadata', () => {
    const skill = getSkillInfo('install');
    expect(skill).toBeDefined();
    expect(skill?.isLocal).toBe(true);
    expect(skill?.name).toBe('SDK Installation');
  });
});

describe('getSkillPrompt', () => {
  test('builds doctor prompt with project path', async () => {
    const prompt = await getSkillPrompt('doctor', { projectPath: '/tmp/project' });

    expect(prompt).toContain('Project path: /tmp/project');
    expect(prompt).toContain('analyzing a mobile project for Clix SDK');
    expect(prompt).toContain('Final Result: HEALTHY | ACTION_NEEDED | FAILED');
  });

  test('builds install prompt with integration goal', async () => {
    const prompt = await getSkillPrompt('install', {
      projectPath: '/tmp/project',
    });

    expect(prompt).toContain('Project path: /tmp/project');
    expect(prompt).toContain('Target platform: auto-detect');
    expect(prompt).toContain(
      'Execution goal: Complete SDK integration workflow using the pre-configured setup context.',
    );
    expect(prompt).toContain('Final Result: SUCCESS | PARTIAL | FAILED');
    expect(prompt).not.toContain('non-interactive one-shot execution');
    expect(prompt).not.toContain('Install phase:');
    expect(prompt).not.toContain('project-build');
  });

  test('includes Project Public API Key in install prompt when available', async () => {
    const preparationContext: PreparationContext = {
      projectPath: '/tmp/project',
      config: {
        version: 1,
        member: {
          id: 'member-1',
          email: 'member@example.com',
          name: 'Member',
        },
        organization: {
          id: 'org-1',
          name: 'Org',
        },
        project: {
          id: 'project-1',
          name: 'Project',
          public_api_key: 'pk_test_public_key_123',
        },
        linkedAt: '2026-01-01T00:00:00.000Z',
      },
      projectType: {
        framework: 'native',
        target: 'ios',
      },
      firebase: {
        configured: true,
        androidConfigured: true,
        iosConfigured: true,
        senderConfigConfigured: true,
        senderConfigProjectMatched: true,
        projectId: 'firebase-project',
        needed: true,
      },
      ios: {
        needed: true,
        bundleId: 'com.example.app',
        teamId: 'TEAM123456',
        appGroupId: 'group.clix.com.example.app',
        entitlementsConfigured: true,
        nseConfigured: true,
      },
      apns: {
        needed: true,
        keyId: 'KEY1234567',
        teamId: 'TEAM123456',
        registeredWithFirebase: true,
      },
      ready: true,
      missing: [],
    };

    const prompt = await getSkillPrompt('install', {
      projectPath: '/tmp/project',
      preparationContext,
    });

    expect(prompt).toContain('Project Public API Key: pk_test_public_key_123');
  });

  test('rejects non-local skill types', async () => {
    await expect(getSkillPrompt('integration')).rejects.toThrow('Unknown command type');
  });
});

describe('executeSkill', () => {
  test('streams all executor messages', async () => {
    const mockExecutor = createMockExecutorWithResponses([
      { type: 'text', content: 'Part 1' },
      { type: 'text', content: 'Part 2' },
      { type: 'complete', content: '' },
    ]);

    const messages: AgentMessage[] = [];
    for await (const message of executeSkill('doctor', mockExecutor)) {
      messages.push(message);
    }

    expect(messages.map((m) => m.content)).toEqual(['Part 1', 'Part 2', '']);
  });

  test('passes executor options through', async () => {
    let capturedOptions: ExecuteOptions | undefined;
    let capturedPrompt = '';

    const executor = createMockExecutor({
      execute: mock(async function* (
        prompt: string,
        options?: ExecuteOptions,
      ): AsyncGenerator<AgentMessage> {
        capturedPrompt = prompt;
        capturedOptions = options;
        yield { type: 'complete', content: '' };
      }),
    });

    for await (const _message of executeSkill('doctor', executor, {
      projectPath: '/tmp/custom',
      oneShot: true,
    })) {
      // consume stream
    }

    expect(capturedPrompt).toContain('Project path: /tmp/custom');
    expect(capturedOptions).toMatchObject({
      workingDirectory: '/tmp/custom',
    });
  });
});
