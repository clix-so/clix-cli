import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AgentInfo } from '../../agents';
import type { Config } from '../../config/schema';
import { DEFAULT_CONFIG } from '../../config/schema';
import { AgentSelectionService } from '../agent-selection-service';

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

mock.module('../../agents', () => ({
  detectAvailableAgents: mock(async (): Promise<AgentInfo[]> => []),
  getAgentByName: mock((name: string): AgentInfo | undefined => {
    const agents = [mockClaudeAgent, mockCodexAgent];
    return agents.find((a) => a.name === name);
  }),
}));

describe('AgentSelectionService', () => {
  let service: AgentSelectionService;
  let configManager: ReturnType<typeof createMockConfigManager>;
  let detectAvailableAgents: ReturnType<typeof mock>;

  beforeEach(async () => {
    configManager = createMockConfigManager();
    service = new AgentSelectionService(configManager as never);

    const agentsModule = await import('../../agents');
    detectAvailableAgents = agentsModule.detectAvailableAgents as ReturnType<typeof mock>;
  });

  describe('selectAgent', () => {
    test('should return null when no agents are available', async () => {
      detectAvailableAgents.mockResolvedValue([]);

      const result = await service.selectAgent({ mode: 'command' });

      expect(result.agent).toBeNull();
      expect(result.source).toBe('auto');
      expect(result.needsUserSelection).toBe(false);
      expect(result.availableAgents).toEqual([]);
    });

    test('should select config agent when valid', async () => {
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

    test('should auto-select first agent when config is missing', async () => {
      detectAvailableAgents.mockResolvedValue([mockClaudeAgent, mockCodexAgent]);

      const result = await service.selectAgent({ mode: 'command' });

      expect(result.agent).toEqual(mockClaudeAgent);
      expect(result.source).toBe('auto');
      expect(result.needsUserSelection).toBe(false);
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
