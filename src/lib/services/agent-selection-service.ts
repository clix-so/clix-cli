import type { AgentInfo } from '../agents';
import { detectAvailableAgents, getAgentByName } from '../agents';
import type { ConfigManager } from '../config';

export type SelectionMode = 'command';

/**
 * Source of the selected agent.
 * - config: Selected from config's selectedAgent field
 * - auto: Auto-selected (first available)
 */
export type SelectionSource = 'config' | 'auto';

/**
 * Options for agent selection.
 */
export interface SelectionOptions {
  /** Selection mode */
  mode: SelectionMode;
}

/**
 * Result of agent selection.
 */
export interface SelectionResult {
  /** Selected agent, null if no agent available */
  agent: AgentInfo | null;
  /** Source of the selection */
  source: SelectionSource;
  /** Always false in command-only mode */
  needsUserSelection: boolean;
  /** Available agents for selection */
  availableAgents: AgentInfo[];
}

/**
 * Service for centralized agent selection logic.
 * Handles agent selection for command execution.
 */
export class AgentSelectionService {
  constructor(private readonly configManager: ConfigManager) {}

  /**
   * Select an agent based on the provided options.
   * Priority order:
   * 1. Config's selectedAgent
   * 2. Auto-select first available agent
   *
   * @param options - Selection options
   * @returns Selection result
   */
  async selectAgent(_options: SelectionOptions): Promise<SelectionResult> {
    const availableAgents = await detectAvailableAgents();

    // No agents available
    if (availableAgents.length === 0) {
      return {
        agent: null,
        source: 'auto',
        needsUserSelection: false,
        availableAgents: [],
      };
    }

    // 1. Try config's selectedAgent
    const config = await this.configManager.load();
    if (config.selectedAgent) {
      const configAgent = this.getValidAgent(config.selectedAgent, availableAgents);
      if (configAgent) {
        return {
          agent: configAgent,
          source: 'config',
          needsUserSelection: false,
          availableAgents,
        };
      }
    }

    // 2. Auto-select first available agent
    return {
      agent: availableAgents[0],
      source: 'auto',
      needsUserSelection: false,
      availableAgents,
    };
  }

  /**
   * Save the selected agent to config.
   *
   * @param agent - Agent to save
   */
  async saveSelection(agent: AgentInfo): Promise<void> {
    await this.configManager.save({
      selectedAgent: agent.name,
      lastUsedAt: new Date().toISOString(),
    });
  }

  /**
   * Validate if an agent is available.
   *
   * @param agentName - Agent name to validate
   * @returns True if agent is available
   */
  async validateAgent(agentName: string): Promise<boolean> {
    const agent = getAgentByName(agentName);
    if (!agent) {
      return false;
    }

    const availableAgents = await detectAvailableAgents();
    return availableAgents.some((a) => a.name === agentName);
  }

  /**
   * Get a valid agent by name if it's available.
   *
   * @param agentName - Agent name
   * @param availableAgents - List of available agents
   * @returns AgentInfo if valid and available, null otherwise
   */
  private getValidAgent(agentName: string, availableAgents: AgentInfo[]): AgentInfo | null {
    const agent = getAgentByName(agentName);
    if (!agent) {
      return null;
    }

    const isAvailable = availableAgents.some((a) => a.name === agent.name);
    return isAvailable ? agent : null;
  }
}
