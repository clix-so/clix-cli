import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  clearCommandCache,
  generateHelpText,
  getCommand,
  getCommands,
  hasCommand,
} from '../registry';

describe('Command Registry', () => {
  beforeEach(() => {
    clearCommandCache();
  });

  afterEach(() => {
    clearCommandCache();
  });

  describe('getCommands', () => {
    test('should return all enabled commands', () => {
      const commands = getCommands();
      expect(commands.length).toBeGreaterThan(0);
      expect(commands.every((c) => c.isEnabled)).toBe(true);
    });

    test('should return cached commands on subsequent calls', () => {
      const first = getCommands();
      const second = getCommands();
      expect(first).toBe(second); // Same reference
    });
  });

  describe('getCommand', () => {
    test('should find command by name', () => {
      const command = getCommand('help');
      expect(command).toBeDefined();
      expect(command?.name).toBe('help');
    });

    test('should find command by alias', () => {
      const command = getCommand('?');
      expect(command).toBeDefined();
      expect(command?.name).toBe('help');
    });

    test('should find command with slash prefix', () => {
      const command = getCommand('/help');
      expect(command).toBeDefined();
      expect(command?.name).toBe('help');
    });

    test('should be case-insensitive', () => {
      const command = getCommand('HELP');
      expect(command).toBeDefined();
      expect(command?.name).toBe('help');
    });

    test('should return undefined for non-existent command', () => {
      const command = getCommand('nonexistent');
      expect(command).toBeUndefined();
    });
  });

  describe('hasCommand', () => {
    test('should return true for existing command', () => {
      expect(hasCommand('help')).toBe(true);
    });

    test('should return true for command alias', () => {
      expect(hasCommand('?')).toBe(true);
    });

    test('should return false for non-existent command', () => {
      expect(hasCommand('nonexistent')).toBe(false);
    });
  });

  describe('clearCommandCache', () => {
    test('should clear the cache', () => {
      const first = getCommands();
      clearCommandCache();
      const second = getCommands();
      expect(first).not.toBe(second); // Different references
    });
  });

  describe('generateHelpText', () => {
    test('should generate help text with all visible commands', () => {
      const helpText = generateHelpText();
      expect(helpText).toContain('Available commands:');
      expect(helpText).toContain('/help');
      expect(helpText).toContain('/new');
      expect(helpText).toContain('/clear');
      expect(helpText).toContain('/agent');
    });

    test('should include skill commands', () => {
      const helpText = generateHelpText();
      expect(helpText).toContain('Skills:');
      expect(helpText).toContain('/integration');
      expect(helpText).toContain('/event-tracking');
    });

    test('should include system commands', () => {
      const helpText = generateHelpText();
      expect(helpText).toContain('System:');
      expect(helpText).toContain('/exit');
    });
  });

  describe('built-in commands', () => {
    test('should have help command with aliases', () => {
      const help = getCommand('help');
      expect(help?.aliases).toContain('?');
      expect(help?.aliases).toContain('h');
    });

    test('should have compact command with alias', () => {
      const compact = getCommand('compact');
      expect(compact?.aliases).toContain('c');
    });

    test('should have agent command with alias', () => {
      const agent = getCommand('agent');
      expect(agent?.aliases).toContain('a');
    });

    test('should have exit command with aliases', () => {
      const exit = getCommand('exit');
      expect(exit?.aliases).toContain('quit');
      expect(exit?.aliases).toContain('q');
    });

    test('should have install-mcp command with alias', () => {
      const installMcp = getCommand('install-mcp');
      expect(installMcp?.aliases).toContain('mcp');
    });

    test('should have new command with clear alias', () => {
      const cmd = getCommand('new');
      expect(cmd?.aliases).toContain('clear');
    });

    test('should have transfer command with alias', () => {
      const transfer = getCommand('transfer');
      expect(transfer?.aliases).toContain('t');
    });
  });

  describe('skill commands', () => {
    test('should have integration command', () => {
      const integration = getCommand('integration');
      expect(integration).toBeDefined();
      expect(integration?.name).toBe('integration');
    });

    test('should have event-tracking command', () => {
      const eventTracking = getCommand('event-tracking');
      expect(eventTracking).toBeDefined();
    });

    test('should have user-management command', () => {
      const userManagement = getCommand('user-management');
      expect(userManagement).toBeDefined();
    });

    test('should have personalization command', () => {
      const personalization = getCommand('personalization');
      expect(personalization).toBeDefined();
    });

    test('should have diagnose command', () => {
      const diagnose = getCommand('diagnose');
      expect(diagnose).toBeDefined();
    });

    test('should have api-triggered-campaigns command (dynamically discovered)', () => {
      // This tests dynamic command registration from @clix-so/clix-agent-skills
      const apiCampaign = getCommand('api-triggered-campaigns');
      expect(apiCampaign).toBeDefined();
      expect(apiCampaign?.name).toBe('api-triggered-campaigns');
    });

    test('command names should match skill command names from package', () => {
      // Commands are derived from skill names by removing 'clix-' prefix
      // e.g., 'clix-integration' -> 'integration'
      // This ensures CLI commands always match the skills package
      const commands = getCommands();
      const skillCommands = commands.filter(
        (c) =>
          c.type === 'local' &&
          ![
            'help',
            'new',
            'exit',
            'agent',
            'compact',
            'transfer',
            'debug',
            'install-mcp',
            'update',
            'diagnose',
          ].includes(c.name),
      );

      for (const cmd of skillCommands) {
        // Command name should NOT have 'clix-' prefix
        expect(cmd.name).not.toMatch(/^clix-/);
        // Command name should be lowercase with hyphens
        expect(cmd.name).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    });
  });

  describe('dynamic command registration', () => {
    test('commands are generated from EMBEDDED_SKILL_METADATA', async () => {
      const { EMBEDDED_SKILL_METADATA } = await import('../../embedded-skills');
      const commands = getCommands();

      // Each embedded skill should have a corresponding command
      for (const meta of EMBEDDED_SKILL_METADATA) {
        const cmd = commands.find((c) => c.name === meta.commandName);
        expect(cmd).toBeDefined();
        expect(cmd?.description).toBe(meta.shortDescription || meta.displayName);
      }
    });

    test('new skills automatically get commands without code changes', async () => {
      // This validates the core requirement: when new skills are added to
      // @clix-so/clix-agent-skills, they automatically get commands
      const { EMBEDDED_SKILL_METADATA } = await import('../../embedded-skills');

      // Get the count of embedded skills
      const embeddedSkillCount = EMBEDDED_SKILL_METADATA.length;

      // Get skill commands (excluding local skills like diagnose)
      const commands = getCommands();
      const skillCommands = commands.filter((c) =>
        EMBEDDED_SKILL_METADATA.some((m) => m.commandName === c.name),
      );

      // The number of skill commands should match embedded skills
      expect(skillCommands.length).toBe(embeddedSkillCount);
    });
  });
});
