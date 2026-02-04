import type { AgentInfo } from '../lib/agents';
import type { AgentExecutor, AgentMessage } from '../lib/executor';
import { MCPInstaller } from '../lib/mcp';
import { PromptFetcher } from '../lib/prompt';
import { AgentExecutionUI } from '../ui/AgentExecutionUI';
import { printFinalOutput } from '../ui/utils/finalOutput';
import { safeRender } from '../ui/utils/safeRender';
import { configCommand } from './config';

interface InstallOptions {
  promptUrl?: string;
}

const ONE_SHOT_INSTRUCTION = `
IMPORTANT: This is a non-interactive one-shot execution. Do NOT ask for user input or confirmation.
- Make reasonable assumptions based on the project structure
- Choose the most common/recommended approach when multiple options exist
- Proceed with the task autonomously without waiting for user response
- If critical information is missing, state your assumptions and proceed

`;

export async function installCommand(options: InstallOptions = {}): Promise<void> {
  // Store prompt in closure for execute function
  let prompt = '';

  // Prepare function: MCP installation and prompt fetch
  async function prepare(agent: AgentInfo): Promise<void> {
    const mcpInstaller = new MCPInstaller();
    await mcpInstaller.ensureServerInstalled(agent.name);

    const fetcher = new PromptFetcher();
    prompt = await fetcher.fetch(options.promptUrl);
    prompt = ONE_SHOT_INSTRUCTION + prompt;
  }

  // Execute function: run the prompt
  async function* execute(
    executor: AgentExecutor,
    _agent: AgentInfo,
  ): AsyncGenerator<AgentMessage> {
    yield* executor.execute(prompt, { oneShot: true });
  }

  return new Promise((resolve, reject) => {
    const { unmount } = safeRender(
      <AgentExecutionUI
        title="Install Clix Mobile SDK"
        description="Installing SDK using AI assistant"
        prepare={prepare}
        execute={execute}
        onComplete={(result) => {
          unmount();
          if (result) {
            printFinalOutput(result);
          }
          resolve();
        }}
        onNeedsConfig={async () => {
          unmount();
          try {
            // Run config command first
            await configCommand();
            // After config, retry install
            await installCommand(options);
            resolve();
          } catch (error) {
            reject(error);
          }
        }}
      />,
    );
  });
}
