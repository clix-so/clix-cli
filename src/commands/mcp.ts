import { AgentError } from '../lib/errors';
import { setExitCode } from '../lib/exit';
import { runCommandHandoff } from '../lib/services/agent-handoff';

const ADD_MCP_PACKAGE = 'add-mcp';
const CLIX_MCP_SERVER_PACKAGE = '@clix-so/clix-mcp-server@latest';
const MCP_SERVER_NAME = 'clix';

interface MCPCommandDependencies {
  runHandoff?: typeof runCommandHandoff;
  exitProcess?: (code: number) => void;
}

export async function mcpCommand(dependencies: MCPCommandDependencies = {}): Promise<void> {
  const runHandoff = dependencies.runHandoff ?? runCommandHandoff;
  const exitProcess = dependencies.exitProcess ?? setExitCode;

  console.log('Adding Clix MCP Server...');

  let exitCode = 1;
  try {
    exitCode = await runHandoff({
      command: 'npx',
      args: [ADD_MCP_PACKAGE, CLIX_MCP_SERVER_PACKAGE, '--name', MCP_SERVER_NAME],
      workingDirectory: process.cwd(),
      displayName: 'add-mcp',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentError(`Failed to launch add-mcp: ${message}`, 'add-mcp');
  }

  exitProcess(exitCode);
}
