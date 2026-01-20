import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AgentInfo } from '../../agents';
import type { Config } from '../../config/schema';
import { DEFAULT_CONFIG } from '../../config/schema';
import { AgentSelectionService } from '../agent-selection-service';

// Mock agents for testing
const mockClaudeAgent: AgentInfo = {
  name: 'claude',
  command: 'claude',
  displayName: 'Claude',
  description: 'Anthropic Claude-powered coding assistant',
  installUrl: 'https://code.claude.com/docs',
  sdkPackage: '@anthropic-ai/claude-agent-sdk',
};

const mockCodexAgent: AgentInfo = {
  name: 'codex',
  command: 'codex',
  displayName: 'Codex',
  description: 'OpenAI Codex-powered coding assistant',
  installUrl: 'https://developers.openai.com/codex/cli',
  sdkPackage: '@openai/codex-sdk',
};

const mockGeminiAgent: AgentInfo = {
  name: 'gemini',
  command: 'gemini',
  displayName: 'Gemini',
  description: 'Google Gemini-powered coding assistant',
  installUrl: 'https://github.com/google-gemini/gemini-cli',
  sdkPackage: '@google/gemini-cli',
};

// Mock ConfigManager
const createMockConfigManager = (config: Config = DEFAULT_CONFIG) => {
  let currentConfig = { ...config };
  return {
    load: mock(async () => currentConfig),
    save: mock(async (updates: Partial<Config>) => {
      currentConfig = { ...currentConfig, ...updates };
    }),
    get: mock(async (key: keyof Config) => currentConfig[key]),
    set: mock(async (key: keyof Config, value: unknown) => {
      currentConfig = { ...currentConfig, [key]: value };
    }),
  };
};

// Mock agents module
mock.module('../../agents', () => ({
  detectAvailableAgents: mock(async (): Promise<AgentInfo[]> => []),
  getAgentByName: mock((name: string): AgentInfo | undefined => {
    const agents = [mockClaudeAgent, mockCodexAgent, mockGeminiAgent];
    return agents.find((a) => a.name === name);
  }),
}));

describe('AgentSelectionService', () => {
  let service: AgentSelectionService;
  let configManager: ReturnType<typeof createMockConfigManager>;
  let detectAvailableAgents: ReturnType<typeof mock>;

  beforeEach(async () => {
    // Reset mocks
    configManager = createMockConfigManager();
    service = new AgentSelectionService(configManager as never);

    // Get mocked function
    const agentsModule = await import('../../agents');
    detectAvailableAgents = agentsModule.detectAvailableAgents as ReturnType<typeof mock>;
  });

  describe('selectAgent', () => {
    test('should return null when no agents available', async () => {
      detectAvailableAgents.mockResolvedValue([]);

      const result = await service.selectAgent({ mode: 'command' });

      expect(result.agent).toBeNull();
      expect(result.source).toBe('auto');
      expect(result.needsUserSelection).toBe(false);
      expect(result.availableAgents).toEqual([]);
    });

    test('should select session agent in interactive mode', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent, mockCodexAgent]);

      const result = await service.selectAgent({
        mode: 'interactive',
        preferredAgentName: 'claude',
      });

      expect(result.agent).toEqual(mockClaudeAgent);
      expect(result.source).toBe('session');
      expect(result.needsUserSelection).toBe(false);
    });

    test('should fallback to config agent when session agent is not available', async () => {
      detectAvailableAgents.mockResolvedValue([mockCodexAgent]);
      configManager = createMockConfigManager({
        ...DEFAULT_CONFIG,
        selectedAgent: 'codex',
      });
      service = new AgentSelectionService(configManager as never);

      const result = await service.selectAgent({
        mode: 'interactive',
        preferredAgentName: 'claude', // Not available
      });

      expect(result.agent).toEqual(mockCodexAgent);
      expect(result.source).toBe('config');
      expect(result.needsUserSelection).toBe(false);
    });

    test('should select config agent when no session agent', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent, mockCodexAgent]);
      configManager = createMockConfigManager({
        ...DEFAULT_CONFIG,
        selectedAgent: 'codex',
      });
      service = new AgentSelectionService(configManager as never);

      const result = await service.selectAgent({ mode: 'command' });

      expect(result.agent).toEqual(mockCodexAgent);
      expect(result.source).toBe('config');
      expect(result.needsUserSelection).toBe(false);
    });

    test('should auto-select first agent in command mode when no config', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent, mockCodexAgent]);

      const result = await service.selectAgent({ mode: 'command' });

      expect(result.agent).toEqual(mockClaudeAgent);
      expect(result.source).toBe('auto');
      expect(result.needsUserSelection).toBe(false);
    });

    test('should auto-select single agent in interactive mode', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent]);

      const result = await service.selectAgent({ mode: 'interactive' });

      expect(result.agent).toEqual(mockClaudeAgent);
      expect(result.source).toBe('auto');
      expect(result.needsUserSelection).toBe(false);
    });

    test('should indicate user selection needed in interactive mode with multiple agents', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent, mockCodexAgent, mockGeminiAgent]);

      const result = await service.selectAgent({
        mode: 'interactive',
        allowPrompt: true,
      });

      expect(result.agent).toBeNull();
      expect(result.source).toBe('user');
      expect(result.needsUserSelection).toBe(true);
      expect(result.availableAgents).toHaveLength(3);
    });

    test('should auto-select first agent when prompt not allowed in interactive mode', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent, mockCodexAgent]);

      const result = await service.selectAgent({
        mode: 'interactive',
        allowPrompt: false,
      });

      expect(result.agent).toEqual(mockClaudeAgent);
      expect(result.source).toBe('auto');
      expect(result.needsUserSelection).toBe(false);
    });

    test('should ignore invalid session agent name', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent]);

      const result = await service.selectAgent({
        mode: 'interactive',
        preferredAgentName: 'invalid-agent',
      });

      expect(result.agent).toEqual(mockClaudeAgent);
      expect(result.source).toBe('auto');
    });

    test('should ignore invalid config agent name', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent]);
      configManager = createMockConfigManager({
        ...DEFAULT_CONFIG,
        selectedAgent: 'invalid-agent',
      });
      service = new AgentSelectionService(configManager as never);

      const result = await service.selectAgent({ mode: 'command' });

      expect(result.agent).toEqual(mockClaudeAgent);
      expect(result.source).toBe('auto');
    });
  });

  describe('saveSelection', () => {
    test('should save agent selection to config', async () => {
      await service.saveSelection(mockClaudeAgent);

      expect(configManager.save).toHaveBeenCalledTimes(1);
      const saveCall = configManager.save.mock.calls[0][0];
      expect(saveCall.selectedAgent).toBe('claude');
      expect(saveCall.lastUsedAt).toBeDefined();
    });
  });

  describe('validateAgent', () => {
    test('should return true for available agent', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent, mockCodexAgent]);

      const result = await service.validateAgent('claude');

      expect(result).toBe(true);
    });

    test('should return false for unavailable agent', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent]);

      const result = await service.validateAgent('codex');

      expect(result).toBe(false);
    });

    test('should return false for invalid agent name', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent]);

      const result = await service.validateAgent('invalid-agent');

      expect(result).toBe(false);
    });
  });

  describe('priority order', () => {
    test('should prioritize session over config', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent, mockCodexAgent]);
      configManager = createMockConfigManager({
        ...DEFAULT_CONFIG,
        selectedAgent: 'codex',
      });
      service = new AgentSelectionService(configManager as never);

      const result = await service.selectAgent({
        mode: 'interactive',
        preferredAgentName: 'claude',
      });

      expect(result.agent).toEqual(mockClaudeAgent);
      expect(result.source).toBe('session');
    });

    test('should prioritize config over auto-selection', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent, mockCodexAgent]);
      configManager = createMockConfigManager({
        ...DEFAULT_CONFIG,
        selectedAgent: 'codex',
      });
      service = new AgentSelectionService(configManager as never);

      const result = await service.selectAgent({ mode: 'command' });

      expect(result.agent).toEqual(mockCodexAgent);
      expect(result.source).toBe('config');
    });
  });
});
