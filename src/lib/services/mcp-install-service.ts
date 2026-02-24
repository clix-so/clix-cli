import { spawn } from 'node:child_process';
import { getAgentByName, type SUPPORTED_AGENTS } from '../agents';

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
  addMcpAgentId: string;
}

export interface MCPInstallProcess {
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  on(event: 'close', listener: (code: number | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export interface MCPInstallSpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  stdio: 'pipe';
}

export type MCPInstallSpawner = (
  command: string,
  args: string[],
  options: MCPInstallSpawnOptions,
) => MCPInstallProcess;

const CLIX_MCP_SERVER_REPO = 'https://github.com/clix-so/clix-mcp-server';
const MCP_SERVER_NAME = 'clix-mcp-server';
const ADD_MCP_PACKAGE = 'add-mcp';

/**
 * MCP configuration for each agent.
 */
const MCP_AGENT_CONFIGS: MCPAgentConfig[] = [
  {
    name: 'claude',
    displayName: 'Claude Code',
    description: 'Install via add-mcp --agent claude-code',
    addMcpAgentId: 'claude-code',
  },
  {
    name: 'codex',
    displayName: 'Codex',
    description: 'Install via add-mcp --agent codex',
    addMcpAgentId: 'codex',
  },
  {
    name: 'gemini',
    displayName: 'Gemini CLI',
    description: 'Install via add-mcp --agent gemini-cli',
    addMcpAgentId: 'gemini-cli',
  },
  {
    name: 'opencode',
    displayName: 'OpenCode',
    description: 'Install via add-mcp --agent opencode',
    addMcpAgentId: 'opencode',
  },
  {
    name: 'cursor',
    displayName: 'Cursor',
    description: 'Install via add-mcp --agent cursor',
    addMcpAgentId: 'cursor',
  },
  {
    name: 'copilot',
    displayName: 'GitHub Copilot CLI',
    description: 'Install via add-mcp --agent github-copilot-cli',
    addMcpAgentId: 'github-copilot-cli',
  },
];

const defaultSpawner: MCPInstallSpawner = (command, args, options) => spawn(command, args, options);

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

function resolveAddMcpAgentId(agent: MCPTargetAgent): string | null {
  const config = MCP_AGENT_CONFIGS.find((candidate) => candidate.name === agent);
  return config?.addMcpAgentId ?? null;
}

function buildAddMcpArgs(addMcpAgentId: string): string[] {
  return [
    '-y',
    ADD_MCP_PACKAGE,
    `npx -y ${CLIX_MCP_SERVER_REPO}`,
    '--name',
    MCP_SERVER_NAME,
    '--agent',
    addMcpAgentId,
    '--global',
    '--yes',
  ];
}

function isAlreadyConfiguredOutput(output: string): boolean {
  const normalized = output.toLowerCase();
  const mentionsAlready = normalized.includes('already');
  const mentionsExistingState =
    normalized.includes('exist') ||
    normalized.includes('configured') ||
    normalized.includes('registered');

  return mentionsAlready && mentionsExistingState;
}

/**
 * Install Clix MCP Server for the specified agent via add-mcp.
 */
export async function installMCPServer(
  agent: MCPTargetAgent,
  spawnProcess: MCPInstallSpawner = defaultSpawner,
): Promise<MCPInstallResult> {
  const addMcpAgentId = resolveAddMcpAgentId(agent);
  if (!addMcpAgentId) {
    return {
      success: false,
      message: `Unknown agent: ${agent}`,
    };
  }

  const displayName = getMCPAgentDisplayName(agent);

  return await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child: MCPInstallProcess;

    try {
      child = spawnProcess('npx', buildAddMcpArgs(addMcpAgentId), {
        cwd: process.cwd(),
        env: process.env,
        shell: false,
        stdio: 'pipe',
      });
    } catch (error) {
      resolve({
        success: false,
        message: `Failed to run add-mcp for ${displayName}.`,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    child.stdout?.on('data', (data: unknown) => {
      stdout += String(data);
    });

    child.stderr?.on('data', (data: unknown) => {
      stderr += String(data);
    });

    child.on('close', (code) => {
      const output = [stderr, stdout]
        .filter((value) => value.trim().length > 0)
        .join('\n')
        .trim();

      if (code === 0) {
        resolve({
          success: true,
          message: `Clix MCP Server installed for ${displayName} using add-mcp.`,
        });
        return;
      }

      if (isAlreadyConfiguredOutput(output)) {
        resolve({
          success: true,
          message: `Clix MCP Server is already configured for ${displayName}.`,
        });
        return;
      }

      resolve({
        success: false,
        message: `Failed to install Clix MCP Server for ${displayName}.`,
        error: output || `Exit code: ${code ?? 'unknown'}`,
      });
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        message: `Failed to run add-mcp for ${displayName}.`,
        error: error.message,
      });
    });
  });
}

/**
 * Get display name for MCP target agent.
 */
export function getMCPAgentDisplayName(agent: MCPTargetAgent): string {
  const agentInfo = getAgentByName(agent);
  if (agentInfo) {
    return agentInfo.displayName;
  }

  const mcpConfig = MCP_AGENT_CONFIGS.find((candidate) => candidate.name === agent);
  if (mcpConfig) {
    return mcpConfig.displayName;
  }

  return agent;
}
