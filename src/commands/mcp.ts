import { runCommandHandoff } from '../lib/services/agent-handoff';

const ADD_MCP_PACKAGE = 'add-mcp';
const CLIX_MCP_SERVER_PACKAGE = '@clix-so/clix-mcp-server@latest';
const MCP_SERVER_NAME = 'clix';

interface MCPCommandDependencies {
  runHandoff?: typeof runCommandHandoff;
}

function buildMcpHandoffArgs(): string[] {
  return [ADD_MCP_PACKAGE, CLIX_MCP_SERVER_PACKAGE, '--name', MCP_SERVER_NAME];
}

export async function mcpCommand(dependencies: MCPCommandDependencies = {}): Promise<void> {
  const runHandoff = dependencies.runHandoff ?? runCommandHandoff;

  console.log('Adding Clix MCP Server...');

  let exitCode = 1;
  try {
    exitCode = await runHandoff({
      command: 'npx',
      args: buildMcpHandoffArgs(),
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
