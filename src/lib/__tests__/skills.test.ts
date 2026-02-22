import { describe, expect, mock, test } from 'bun:test';
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
  });

  test('builds install prompt in integration phase by default', async () => {
    const prompt = await getSkillPrompt('install', {
      projectPath: '/tmp/project',
      platform: 'ios',
      oneShot: true,
    });

    expect(prompt).toContain('Project path: /tmp/project');
    expect(prompt).toContain('Target platform: ios');
    expect(prompt).toContain('Install phase: integration');
    expect(prompt).toContain('EXECUTION MODE: AUTONOMOUS');
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
