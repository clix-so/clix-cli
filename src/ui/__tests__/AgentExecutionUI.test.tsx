import { describe, expect, test } from 'bun:test';
import type { AgentExecutionUIProps } from '../AgentExecutionUI';
import type { FinalOutputResult } from '../utils/finalOutput';

/**
 * Tests for AgentExecutionUI integration with FinalOutputResult.
 * These tests verify the type structure and interface contracts.
 */

describe('AgentExecutionUI Props Type', () => {
  test('should accept onComplete callback with FinalOutputResult parameter', () => {
    // Type check: verify the props interface is correct
    const mockOnComplete = (result?: FinalOutputResult) => {
      if (result) {
        expect(result.type).toBeDefined();
        expect(result.title).toBeDefined();
      }
    };

    const props: Partial<AgentExecutionUIProps> = {
      title: 'Test Command',
      onComplete: mockOnComplete,
    };

    expect(props.onComplete).toBeDefined();
    expect(props.title).toBe('Test Command');
  });

  test('should handle onComplete with success result', () => {
    const mockOnComplete = (result?: FinalOutputResult) => {
      expect(result).toBeDefined();
      expect(result?.type).toBe('success');
      expect(result?.title).toBe('Command completed');
    };

    const result: FinalOutputResult = {
      type: 'success',
      title: 'Command completed',
      message: 'All steps finished',
      details: ['Step 1', 'Step 2'],
    };

    mockOnComplete(result);
  });

  test('should handle onComplete with error result', () => {
    const mockOnComplete = (result?: FinalOutputResult) => {
      expect(result).toBeDefined();
      expect(result?.type).toBe('error');
      expect(result?.title).toBe('Command failed');
      expect(result?.message).toBe('Error occurred');
    };

    const result: FinalOutputResult = {
      type: 'error',
      title: 'Command failed',
      message: 'Error occurred',
    };

    mockOnComplete(result);
  });

  test('should handle onComplete without result parameter', () => {
    const mockOnComplete = (result?: FinalOutputResult) => {
      expect(result).toBeUndefined();
    };

    mockOnComplete(undefined);
  });
});

describe('FinalOutputResult Type Coverage', () => {
  test('should create success result with all fields', () => {
    const result: FinalOutputResult = {
      type: 'success',
      title: 'Installation completed',
      message: 'SDK installed successfully',
      details: ['Downloaded SDK', 'Configured project', 'Built successfully'],
    };

    expect(result.type).toBe('success');
    expect(result.title).toBe('Installation completed');
    expect(result.message).toBe('SDK installed successfully');
    expect(result.details?.length).toBe(3);
  });

  test('should create error result with message', () => {
    const result: FinalOutputResult = {
      type: 'error',
      title: 'Installation failed',
      message: 'Unable to download SDK',
    };

    expect(result.type).toBe('error');
    expect(result.title).toBe('Installation failed');
    expect(result.message).toBe('Unable to download SDK');
    expect(result.details).toBeUndefined();
  });

  test('should create info result with minimal fields', () => {
    const result: FinalOutputResult = {
      type: 'info',
      title: 'Configuration saved',
    };

    expect(result.type).toBe('info');
    expect(result.title).toBe('Configuration saved');
    expect(result.message).toBeUndefined();
    expect(result.details).toBeUndefined();
  });

  test('should create result with empty details array', () => {
    const result: FinalOutputResult = {
      type: 'success',
      title: 'Process completed',
      details: [],
    };

    expect(result.type).toBe('success');
    expect(result.details).toEqual([]);
  });
});
