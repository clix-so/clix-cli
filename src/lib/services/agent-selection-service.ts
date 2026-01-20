import type { AgentInfo } from '../agents';
import { detectAvailableAgents, getAgentByName } from '../agents';
import type { ConfigManager } from '../config';

/**
 * Agent selection mode.
 * - command: Single execution mode (e.g., `clix install`)
 * - interactive: Persistent conversation mode (e.g., `clix`)
 */
export type SelectionMode = 'command' | 'interactive';

/**
 * Source of the selected agent.
 * - session: Selected from session (interactive mode only)
 * - config: Selected from config's selectedAgent field
 * - auto: Auto-selected (first available or single agent)
 * - user: User manually selected via UI
 */
export type SelectionSource = 'session' | 'config' | 'auto' | 'user';

/**
 * Options for agent selection.
 */
export interface SelectionOptions {
  /** Selection mode */
  mode: SelectionMode;
  /** Session ID for session-based selection (interactive mode only) */
  sessionId?: string;
  /** Whether to allow prompting user for selection */
  allowPrompt?: boolean;
  /** Preferred agent name from session (interactive mode only) */
  preferredAgentName?: string;
}

/**
 * Result of agent selection.
 */
export interface SelectionResult {
  /** Selected agent, null if no agent available */
  agent: AgentInfo | null;
  /** Source of the selection */
  source: SelectionSource;
  /** Whether user selection is needed (when allowPrompt is true) */
  needsUserSelection: boolean;
  /** Available agents for selection */
  availableAgents: AgentInfo[];
}

/**
 * Service for centralized agent selection logic.
 * Handles agent selection across command and interactive modes with consistent behavior.
 */
export class AgentSelectionService {
  constructor(private readonly configManager: ConfigManager) {}

  /**
   * Select an agent based on the provided options.
   * Priority order:
   * 1. Session agent (interactive mode only)
   * 2. Config's selectedAgent
   * 3. Auto-select (single agent or first available in command mode)
   * 4. User selection (interactive mode with multiple agents)
   *
   * @param options - Selection options
   * @returns Selection result
   */
  async selectAgent(options: SelectionOptions): Promise<SelectionResult> {
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

    // 1. Try session agent (interactive mode only)
    if (options.mode === 'interactive' && options.preferredAgentName) {
      const sessionAgent = this.getValidAgent(options.preferredAgentName, availableAgents);
      if (sessionAgent) {
        return {
          agent: sessionAgent,
          source: 'session',
          needsUserSelection: false,
          availableAgents,
        };
      }
    }

    // 2. Try config's selectedAgent
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

    // 3. Auto-select
    // Command mode: Always auto-select first available agent
    if (options.mode === 'command') {
      const agent = availableAgents[0];
      return {
        agent,
        source: 'auto',
        needsUserSelection: false,
        availableAgents,
      };
    }

    // Interactive mode: Auto-select only if single agent
    if (availableAgents.length === 1) {
      return {
        agent: availableAgents[0],
        source: 'auto',
        needsUserSelection: false,
        availableAgents,
      };
    }

    // 4. User selection needed (interactive mode with multiple agents)
    if (options.allowPrompt) {
      return {
        agent: null,
        source: 'user',
        needsUserSelection: true,
        availableAgents,
      };
    }

    // Fallback: First available agent
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
