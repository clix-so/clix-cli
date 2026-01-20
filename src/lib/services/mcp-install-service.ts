import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getAgentByName, type SUPPORTED_AGENTS } from '../agents';
import { formatPath } from '../utils/path';

/**
 * MCPTargetAgent is derived from SUPPORTED_AGENTS to ensure consistency.
 * When new agents are added to agents.ts, they automatically become available here.
 */
export type MCPTargetAgent = (typeof SUPPORTED_AGENTS)[number]['name'];

export interface MCPInstallResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface MCPAgentConfig {
  name: MCPTargetAgent;
  displayName: string;
  description: string;
  installMethod: 'cli' | 'json' | 'toml';
}

const MCP_PACKAGE = '@clix-so/clix-mcp-server@latest';
const MCP_SERVER_NAME = 'clix-mcp-server';

/**
 * MCP configuration for each agent.
 * Maps agent names to their MCP installation method and config details.
 */
const MCP_AGENT_CONFIGS: MCPAgentConfig[] = [
  {
    name: 'claude',
    displayName: 'Claude Code',
    description: 'Install via claude mcp add command',
    installMethod: 'cli',
  },
  {
    name: 'codex',
    displayName: 'Codex',
    description: 'Install via codex mcp add command',
    installMethod: 'cli',
  },
  {
    name: 'gemini',
    displayName: 'Gemini CLI',
    description: 'Configure ~/.gemini/settings.json',
    installMethod: 'json',
  },
  {
    name: 'opencode',
    displayName: 'OpenCode',
    description: 'Configure ~/.config/opencode/config.json',
    installMethod: 'json',
  },
  {
    name: 'cursor',
    displayName: 'Cursor',
    description: 'Configure ~/.cursor/mcp.json',
    installMethod: 'json',
  },
  {
    name: 'copilot',
    displayName: 'GitHub Copilot',
    description: 'Configure ~/.config/github-copilot/mcp.json',
    installMethod: 'json',
  },
];

/**
 * Get MCP agent configs for all supported agents.
 */
export function getMCPAgentConfigs(): MCPAgentConfig[] {
  return MCP_AGENT_CONFIGS;
}

/**
 * Get valid MCP agent names.
 */
export function getValidMCPAgents(): string[] {
  return MCP_AGENT_CONFIGS.map((config) => config.name);
}

/**
 * Check if an agent name is a valid MCP target.
 */
export function isValidMCPAgent(agent: string): agent is MCPTargetAgent {
  return getValidMCPAgents().includes(agent);
}

/**
 * Install Clix MCP Server for Claude Code using CLI command
 */
async function installForClaude(): Promise<MCPInstallResult> {
  return new Promise((resolve) => {
    const child = spawn(
      'claude',
      ['mcp', 'add', '--transport', 'stdio', MCP_SERVER_NAME, '--', 'npx', '-y', MCP_PACKAGE],
      {
        stdio: 'pipe',
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          message: `Clix MCP Server installed for Claude Code.\nRestart Claude Code to activate.`,
        });
      } else {
        resolve({
          success: false,
          message: 'Failed to install MCP for Claude Code.',
          error: stderr || stdout || `Exit code: ${code}`,
        });
      }
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        message: 'Failed to run claude command.',
        error: error.message,
      });
    });
  });
}

/**
 * Install Clix MCP Server for Codex using CLI command
 */
async function installForCodex(): Promise<MCPInstallResult> {
  return new Promise((resolve) => {
    // codex mcp add <server-name> -- <command>
    const child = spawn('codex', ['mcp', 'add', 'clix', '--', 'npx', '-y', MCP_PACKAGE], {
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          message: `Clix MCP Server installed for Codex.\nRestart Codex to activate.`,
        });
      } else {
        // Check if already configured
        if (stderr.includes('already') || stdout.includes('already')) {
          resolve({
            success: true,
            message: 'Clix MCP Server is already configured for Codex.',
          });
        } else {
          resolve({
            success: false,
            message: 'Failed to install MCP for Codex.',
            error: stderr || stdout || `Exit code: ${code}`,
          });
        }
      }
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        message: 'Failed to run codex command.',
        error: error.message,
      });
    });
  });
}

/**
 * Install MCP Server using JSON config file
 */
async function installWithJsonConfig(
  agentName: string,
  displayName: string,
  configDir: string,
  configFileName: string,
): Promise<MCPInstallResult> {
  try {
    const configPath = join(configDir, configFileName);

    // Ensure config directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Read existing config or create new
    let config: { mcpServers?: Record<string, unknown> } = {};
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        config = JSON.parse(content) as { mcpServers?: Record<string, unknown> };
      } catch {
        // If parsing fails, start with empty config
        config = {};
      }
    }

    // Check if clix MCP is already configured
    if (config.mcpServers?.clix) {
      return {
        success: true,
        message: `Clix MCP Server is already configured for ${displayName}.`,
      };
    }

    // Add MCP configuration
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    config.mcpServers.clix = {
      command: 'npx',
      args: ['-y', MCP_PACKAGE],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));

    return {
      success: true,
      message: `Clix MCP Server configured for ${displayName}.\nConfig: ${formatPath(configPath)}\nRestart ${displayName} to activate.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure MCP for ${agentName}.`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Install MCP Server using OpenCode config schema.
 */
async function installWithOpenCodeConfig(
  agentName: string,
  displayName: string,
  configDir: string,
  configFileName: string,
): Promise<MCPInstallResult> {
  try {
    const configPath = join(configDir, configFileName);

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        config = JSON.parse(content) as Record<string, unknown>;
      } catch {
        config = {};
      }
    }

    const mcp = (config.mcp as Record<string, unknown> | undefined) ?? {};

    if (mcp[MCP_SERVER_NAME]) {
      return {
        success: true,
        message: `Clix MCP Server is already configured for ${displayName}.`,
      };
    }

    mcp[MCP_SERVER_NAME] = {
      type: 'local',
      command: ['npx', '-y', MCP_PACKAGE],
      enabled: true,
    };

    config.mcp = mcp;

    if ('mcpServers' in config) {
      (config as { mcpServers?: unknown }).mcpServers = undefined;
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2));

    return {
      success: true,
      message: `Clix MCP Server configured for ${displayName}.\nConfig: ${formatPath(configPath)}\nRestart ${displayName} to activate.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure MCP for ${agentName}.`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Install Clix MCP Server for Gemini CLI
 */
async function installForGemini(): Promise<MCPInstallResult> {
  const configDir = join(homedir(), '.gemini');
  return installWithJsonConfig('gemini', 'Gemini CLI', configDir, 'settings.json');
}

/**
 * Install Clix MCP Server for OpenCode
 */
async function installForOpenCode(): Promise<MCPInstallResult> {
  const configDir = join(homedir(), '.config', 'opencode');
  return installWithOpenCodeConfig('opencode', 'OpenCode', configDir, 'config.json');
}

/**
 * Install Clix MCP Server for Cursor
 */
async function installForCursor(): Promise<MCPInstallResult> {
  const configDir = join(homedir(), '.cursor');
  return installWithJsonConfig('cursor', 'Cursor', configDir, 'mcp.json');
}

/**
 * Install Clix MCP Server for GitHub Copilot
 */
async function installForCopilot(): Promise<MCPInstallResult> {
  const configDir = join(homedir(), '.config', 'github-copilot');
  return installWithJsonConfig('copilot', 'GitHub Copilot', configDir, 'mcp.json');
}

/**
 * Install Clix MCP Server for the specified agent
 */
export async function installMCPServer(agent: MCPTargetAgent): Promise<MCPInstallResult> {
  switch (agent) {
    case 'claude':
      return installForClaude();
    case 'codex':
      return installForCodex();
    case 'gemini':
      return installForGemini();
    case 'opencode':
      return installForOpenCode();
    case 'cursor':
      return installForCursor();
    case 'copilot':
      return installForCopilot();
    default:
      return {
        success: false,
        message: `Unknown agent: ${agent}`,
      };
  }
}

/**
 * Get display name for MCP target agent.
 * Uses agent info from agents.ts if available, falls back to MCP config.
 */
export function getMCPAgentDisplayName(agent: MCPTargetAgent): string {
  // First try to get from agents.ts (the source of truth)
  const agentInfo = getAgentByName(agent);
  if (agentInfo) {
    return agentInfo.displayName;
  }

  // Fallback to MCP config
  const mcpConfig = MCP_AGENT_CONFIGS.find((c) => c.name === agent);
  if (mcpConfig) {
    return mcpConfig.displayName;
  }

  return agent;
}
