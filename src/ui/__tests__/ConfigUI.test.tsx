import { describe, expect, test } from 'bun:test';
import type { FinalOutputResult } from '../utils/finalOutput';

/**
 * Tests for ConfigUI integration with FinalOutputResult.
 * These tests verify the type structure and interface contracts.
 */

describe('ConfigUI Props Type', () => {
  test('should define onComplete callback accepting FinalOutputResult', () => {
    const mockOnComplete = (result?: FinalOutputResult) => {
      if (result) {
        expect(result.type).toBeDefined();
        expect(result.title).toBeDefined();
      }
    };

    expect(mockOnComplete).toBeDefined();
  });

  test('should handle success result for configuration', () => {
    const mockOnComplete = (result?: FinalOutputResult) => {
      expect(result).toBeDefined();
      expect(result?.type).toBe('success');
      expect(result?.title).toBe('Configuration completed');
      expect(result?.message).toContain('Claude');
    };

    const result: FinalOutputResult = {
      type: 'success',
      title: 'Configuration completed',
      message: 'Configured to use Claude Sonnet 4.5',
    };

    mockOnComplete(result);
  });

  test('should handle error result for configuration failure', () => {
    const mockOnComplete = (result?: FinalOutputResult) => {
      expect(result).toBeDefined();
      expect(result?.type).toBe('error');
      expect(result?.title).toBe('Configuration failed');
    };

    const result: FinalOutputResult = {
      type: 'error',
      title: 'Configuration failed',
      message: 'Failed to save configuration',
    };

    mockOnComplete(result);
  });
});

describe('ConfigUI Result Scenarios', () => {
  test('should create success result with agent name', () => {
    const agentName = 'Claude Sonnet 4.5';
    const result: FinalOutputResult = {
      type: 'success',
      title: 'Configuration completed',
      message: `Configured to use ${agentName}`,
    };

    expect(result.type).toBe('success');
    expect(result.message).toContain(agentName);
  });

  test('should create error result when save fails', () => {
    const errorMessage = 'Failed to save configuration';
    const result: FinalOutputResult = {
      type: 'error',
      title: 'Configuration failed',
      message: errorMessage,
    };

    expect(result.type).toBe('error');
    expect(result.message).toBe(errorMessage);
  });

  test('should create result without optional fields', () => {
    const result: FinalOutputResult = {
      type: 'success',
      title: 'Configuration completed',
    };

    expect(result.type).toBe('success');
    expect(result.title).toBe('Configuration completed');
    expect(result.message).toBeUndefined();
    expect(result.details).toBeUndefined();
  });
});
