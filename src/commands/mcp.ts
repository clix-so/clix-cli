import { runCommandHandoff } from '../lib/services/agent-handoff';
import { getMCPAgentConfigs, type MCPTargetAgent } from '../lib/services/mcp-install-service';

const ADD_MCP_PACKAGE = 'add-mcp';
const CLIX_MCP_SERVER_REPO = 'https://github.com/clix-so/clix-mcp-server';
const MCP_SERVER_NAME = 'clix-mcp-server';

interface MCPCommandOptions {
  agent?: MCPTargetAgent;
}

interface MCPCommandDependencies {
  runHandoff?: typeof runCommandHandoff;
}

function buildMcpHandoffArgs(agent?: MCPTargetAgent): string[] {
  const args = [
    '-y',
    ADD_MCP_PACKAGE,
    `npx -y ${CLIX_MCP_SERVER_REPO}`,
    '--name',
    MCP_SERVER_NAME,
    '--global',
  ];

  if (!agent) {
    return args;
  }

  const targetAgentConfig = getMCPAgentConfigs().find((config) => config.name === agent);
  if (!targetAgentConfig) {
    throw new Error(`Unknown agent: ${agent}`);
  }

  args.push('--agent', targetAgentConfig.addMcpAgentId);
  return args;
}

export async function mcpCommand(
  options: MCPCommandOptions,
  dependencies: MCPCommandDependencies = {},
): Promise<void> {
  const runHandoff = dependencies.runHandoff ?? runCommandHandoff;

  console.log('Adding Clix MCP Server...');

  let exitCode = 1;
  try {
    exitCode = await runHandoff({
      command: 'npx',
      args: buildMcpHandoffArgs(options.agent),
      workingDirectory: process.cwd(),
      displayName: 'add-mcp',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to launch add-mcp: ${message}`);
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
