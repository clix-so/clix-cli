import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { FIXTURES } from '../../__tests__/test-utils';
import { getDebugPrompt } from '../debug-service';

describe('getDebugPrompt', () => {
  test('should include problem description in the prompt', () => {
    const result = getDebugPrompt({
      problemDescription: FIXTURES.debugProblems.simple,
      projectPath: '/projects/my-app',
    });

    expect(result).toContain('**Problem Description**: The app crashes on startup');
  });

  test('should include formatted project path with ~ for home directory', () => {
    const home = homedir();
    const result = getDebugPrompt({
      problemDescription: 'Test problem',
      projectPath: `${home}/projects/my-app`,
    });

    expect(result).toContain('**Project Path**: ~/projects/my-app');
  });

  test('should include project path as-is for non-home paths', () => {
    const result = getDebugPrompt({
      problemDescription: 'Test problem',
      projectPath: '/usr/local/projects/my-app',
    });

    expect(result).toContain('**Project Path**: /usr/local/projects/my-app');
  });

  test('should include investigation steps', () => {
    const result = getDebugPrompt({
      problemDescription: 'Test problem',
      projectPath: '/projects/my-app',
    });

    expect(result).toContain('## Investigation Steps');
    expect(result).toContain('### 1. Understand Context');
    expect(result).toContain('### 2. Explore Code');
    expect(result).toContain('### 3. Analyze Root Cause');
    expect(result).toContain('### 4. Provide Solutions');
  });

  test('should include output format guidelines', () => {
    const result = getDebugPrompt({
      problemDescription: 'Test problem',
      projectPath: '/projects/my-app',
    });

    expect(result).toContain('## Output Format');
    expect(result).toContain('**Problem Summary**');
    expect(result).toContain('**Investigation Findings**');
    expect(result).toContain('**Root Cause**');
    expect(result).toContain('**Recommended Fixes**');
    expect(result).toContain('**Verification Steps**');
  });

  test('should handle detailed problem descriptions', () => {
    const result = getDebugPrompt({
      problemDescription: FIXTURES.debugProblems.detailed,
      projectPath: '/projects/my-app',
    });

    expect(result).toContain('Push notifications are not being received on iOS devices');
    expect(result).toContain('after the user grants permission');
    expect(result).toContain('version 2.0');
  });

  test('should handle empty problem description', () => {
    const result = getDebugPrompt({
      problemDescription: FIXTURES.debugProblems.empty,
      projectPath: '/projects/my-app',
    });

    expect(result).toContain('**Problem Description**: ');
    // Should still include the rest of the prompt structure
    expect(result).toContain('## Your Task');
  });

  test('should mention platform detection in investigation steps', () => {
    const result = getDebugPrompt({
      problemDescription: 'Test problem',
      projectPath: '/projects/my-app',
    });

    expect(result).toContain('iOS/Android/React Native/Flutter');
  });
});
