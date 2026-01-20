import { describe, expect, test } from 'bun:test';
import type { Command } from '../types';
import { isLocalCommand, isLocalJSXCommand, isPromptCommand } from '../types';

describe('Command Types', () => {
  describe('type guards', () => {
    const localCommand: Command = {
      type: 'local',
      name: 'test-local',
      description: 'Test local command',
      isEnabled: true,
      isHidden: false,
      userFacingName: () => '/test-local',
      call: async () => ({ success: true }),
    };

    const localJSXCommand: Command = {
      type: 'local-jsx',
      name: 'test-jsx',
      description: 'Test JSX command',
      isEnabled: true,
      isHidden: false,
      userFacingName: () => '/test-jsx',
      call: async () => null,
    };

    const promptCommand: Command = {
      type: 'prompt',
      name: 'test-prompt',
      description: 'Test prompt command',
      isEnabled: true,
      isHidden: false,
      progressMessage: 'Processing...',
      userFacingName: () => '/test-prompt',
      getPromptForCommand: async () => [{ role: 'user', content: 'test' }],
    };

    test('isLocalCommand should identify local commands', () => {
      expect(isLocalCommand(localCommand)).toBe(true);
      expect(isLocalCommand(localJSXCommand)).toBe(false);
      expect(isLocalCommand(promptCommand)).toBe(false);
    });

    test('isLocalJSXCommand should identify JSX commands', () => {
      expect(isLocalJSXCommand(localCommand)).toBe(false);
      expect(isLocalJSXCommand(localJSXCommand)).toBe(true);
      expect(isLocalJSXCommand(promptCommand)).toBe(false);
    });

    test('isPromptCommand should identify prompt commands', () => {
      expect(isPromptCommand(localCommand)).toBe(false);
      expect(isPromptCommand(localJSXCommand)).toBe(false);
      expect(isPromptCommand(promptCommand)).toBe(true);
    });
  });

  describe('command properties', () => {
    test('LocalCommand should have call method', () => {
      const command: Command = {
        type: 'local',
        name: 'test',
        description: 'Test',
        isEnabled: true,
        isHidden: false,
        userFacingName: () => '/test',
        call: async () => ({ success: true, message: 'Done' }),
      };

      expect(command.type).toBe('local');
      expect(typeof command.call).toBe('function');
    });

    test('LocalJSXCommand should have call method with onDone callback', () => {
      const command: Command = {
        type: 'local-jsx',
        name: 'test',
        description: 'Test',
        isEnabled: true,
        isHidden: false,
        userFacingName: () => '/test',
        call: async (onDone) => {
          onDone('result');
          return null;
        },
      };

      expect(command.type).toBe('local-jsx');
      expect(typeof command.call).toBe('function');
    });

    test('PromptCommand should have getPromptForCommand method', () => {
      const command: Command = {
        type: 'prompt',
        name: 'test',
        description: 'Test',
        isEnabled: true,
        isHidden: false,
        progressMessage: 'Processing...',
        userFacingName: () => '/test',
        getPromptForCommand: async (args) => [{ role: 'user', content: args }],
      };

      expect(command.type).toBe('prompt');
      expect(typeof command.getPromptForCommand).toBe('function');
      expect(command.progressMessage).toBe('Processing...');
    });
  });

  describe('optional properties', () => {
    test('command can have aliases', () => {
      const command: Command = {
        type: 'local',
        name: 'test',
        description: 'Test',
        isEnabled: true,
        isHidden: false,
        aliases: ['t', 'tst'],
        userFacingName: () => '/test',
        call: async () => ({ success: true }),
      };

      expect(command.aliases).toEqual(['t', 'tst']);
    });

    test('command can be hidden', () => {
      const command: Command = {
        type: 'local',
        name: 'secret',
        description: 'Secret command',
        isEnabled: true,
        isHidden: true,
        userFacingName: () => '/secret',
        call: async () => ({ success: true }),
      };

      expect(command.isHidden).toBe(true);
    });

    test('command can be disabled', () => {
      const command: Command = {
        type: 'local',
        name: 'disabled',
        description: 'Disabled command',
        isEnabled: false,
        isHidden: false,
        userFacingName: () => '/disabled',
        call: async () => ({ success: true }),
      };

      expect(command.isEnabled).toBe(false);
    });
  });
});
