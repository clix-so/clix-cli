import { spawn } from 'node:child_process';

export interface AgentInfo {
  name: string;
  command: string;
  displayName: string;
  description: string;
  installUrl: string;
  sdkPackage: string;
}

export const SUPPORTED_AGENTS: AgentInfo[] = [
  {
    name: 'claude',
    command: 'claude',
    displayName: 'Claude',
    description: 'Anthropic Claude-powered coding assistant',
    installUrl: 'https://code.claude.com/docs',
    sdkPackage: '@anthropic-ai/claude-agent-sdk',
  },
  {
    name: 'codex',
    command: 'codex',
    displayName: 'Codex',
    description: 'OpenAI Codex-powered coding assistant',
    installUrl: 'https://developers.openai.com/codex/cli',
    sdkPackage: '@openai/codex-sdk',
  },
  {
    name: 'gemini',
    command: 'gemini',
    displayName: 'Gemini',
    description: 'Google Gemini-powered coding assistant',
    installUrl: 'https://github.com/google-gemini/gemini-cli',
    sdkPackage: '@google/gemini-cli',
  },
  {
    name: 'opencode',
    command: 'opencode',
    displayName: 'OpenCode',
    description: 'OpenCode AI coding assistant with multi-model support',
    installUrl: 'https://opencode.ai/docs/cli/',
    sdkPackage: 'opencode-cli',
  },
  {
    name: 'cursor',
    command: 'agent',
    displayName: 'Cursor',
    description: 'Cursor AI coding agent with multi-model support',
    installUrl: 'https://cursor.com/cli',
    sdkPackage: 'cursor-agent',
  },
  {
    name: 'copilot',
    command: 'copilot',
    displayName: 'GitHub Copilot',
    description: 'GitHub Copilot CLI with multiple models and MCP support',
    installUrl: 'https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli',
    sdkPackage: '@github/copilot',
  },
];

async function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [command], { stdio: ['ignore', 'pipe', 'ignore'] });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

export async function detectAvailableAgents(): Promise<AgentInfo[]> {
  const available: AgentInfo[] = [];

  for (const agent of SUPPORTED_AGENTS) {
    if (await commandExists(agent.command)) {
      available.push(agent);
    }
  }

  return available;
}

export function getAgentByName(name: string): AgentInfo | undefined {
  return SUPPORTED_AGENTS.find((agent) => agent.name === name);
}
