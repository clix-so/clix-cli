import { describe, expect, test } from 'bun:test';
import type { FinalOutputResult } from '../finalOutput';

/**
 * Tests for printFinalOutput function.
 * These tests verify the structure and type definitions.
 * Actual console output is tested in e2e tests.
 */

describe('FinalOutputResult Type', () => {
  test('should define success result type', () => {
    const result: FinalOutputResult = {
      type: 'success',
      title: 'Installation completed',
    };

    expect(result.type).toBe('success');
    expect(result.title).toBe('Installation completed');
  });

  test('should define error result type', () => {
    const result: FinalOutputResult = {
      type: 'error',
      title: 'Installation failed',
    };

    expect(result.type).toBe('error');
    expect(result.title).toBe('Installation failed');
  });

  test('should define info result type', () => {
    const result: FinalOutputResult = {
      type: 'info',
      title: 'Configuration updated',
    };

    expect(result.type).toBe('info');
    expect(result.title).toBe('Configuration updated');
  });

  test('should support optional message field', () => {
    const result: FinalOutputResult = {
      type: 'success',
      title: 'Installation completed',
      message: 'SDK installed successfully',
    };

    expect(result.message).toBe('SDK installed successfully');
  });

  test('should support optional details field', () => {
    const result: FinalOutputResult = {
      type: 'success',
      title: 'Installation completed',
      details: [
        'Step 1: Downloaded SDK',
        'Step 2: Configured project',
        'Step 3: Built successfully',
      ],
    };

    expect(result.details).toBeDefined();
    expect(result.details?.length).toBe(3);
    expect(result.details?.[0]).toBe('Step 1: Downloaded SDK');
  });

  test('should support message and details together', () => {
    const result: FinalOutputResult = {
      type: 'error',
      title: 'Debug session failed',
      message: 'Unable to analyze the problem',
      details: ['Error 1: File not found', 'Error 2: Permission denied'],
    };

    expect(result.message).toBeDefined();
    expect(result.details).toBeDefined();
    expect(result.details?.length).toBe(2);
  });

  test('should handle empty details array', () => {
    const result: FinalOutputResult = {
      type: 'success',
      title: 'Configuration completed',
      details: [],
    };

    expect(result.details).toEqual([]);
  });

  test('should create minimal result with only required fields', () => {
    const result: FinalOutputResult = {
      type: 'info',
      title: 'Process completed',
    };

    expect(result.type).toBe('info');
    expect(result.title).toBe('Process completed');
    expect(result.message).toBeUndefined();
    expect(result.details).toBeUndefined();
  });

  test('should support all result types', () => {
    const types: Array<FinalOutputResult['type']> = ['success', 'error', 'info'];

    for (const type of types) {
      const result: FinalOutputResult = {
        type,
        title: `Test ${type}`,
      };

      expect(result.type).toBe(type);
    }
  });
});
