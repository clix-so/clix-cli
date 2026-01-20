import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConversationMessage } from '../executor';
import { formatPath } from '../utils/path';
import { xdg } from '../utils/xdg';

export type TransferAgent = 'claude' | 'codex';

export interface TransferOptions {
  agent: TransferAgent;
  workingDirectory?: string;
}

/**
 * Formats conversation history as markdown for saving to file.
 * Includes instruction for the agent to continue the conversation.
 */
function formatHistoryAsMarkdown(history: ConversationMessage[]): string {
  const timestamp = new Date().toISOString();
  let markdown = `# Clix CLI Session\n\n_Saved: ${timestamp}_\n\n---\n\n`;

  if (history.length === 0) {
    markdown += '_No conversation history_\n\n';
  } else {
    for (const msg of history) {
      const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
      markdown += `## ${role}\n\n${msg.content}\n\n`;
    }
  }

  // Add instruction for the agent
  markdown += `---\n\nPlease review the conversation history above and continue from where we left off.\n`;

  return markdown;
}

/**
 * Saves conversation history to .clix directory.
 * Returns the path to the saved file.
 */
async function saveSessionHistory(history: ConversationMessage[]): Promise<string> {
  const clixDir = xdg.state();

  // Ensure .clix directory exists
  try {
    await mkdir(clixDir, { recursive: true });
  } catch (_error) {
    // Directory might already exist, ignore error
  }

  // Generate session filename with timestamp
  const timestamp = Date.now();
  const sessionFile = join(clixDir, `session-${timestamp}.md`);

  // Format and save history
  const markdown = formatHistoryAsMarkdown(history);
  await writeFile(sessionFile, markdown, 'utf-8');

  return sessionFile;
}

/**
 * Checks if the target agent CLI is available.
 */
async function isAgentCLIAvailable(agent: TransferAgent): Promise<boolean> {
  return new Promise((resolve) => {
    const command = agent === 'claude' ? 'which claude' : 'which codex';
    const child = spawn('sh', ['-c', command], { stdio: 'pipe' });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}

export interface TransferResult {
  success: boolean;
  error?: string;
  sessionFile?: string;
  command?: string;
}

/**
 * Prepares transfer by saving session history and generating command.
 * Returns the command for the user to execute manually.
 */
export async function transferToAgent(
  history: ConversationMessage[],
  options: TransferOptions,
): Promise<TransferResult> {
  const { agent } = options;

  // Check if target CLI is available
  const isAvailable = await isAgentCLIAvailable(agent);
  if (!isAvailable) {
    return {
      success: false,
      error: `${agent} CLI is not installed or not in PATH.`,
    };
  }

  // Save session history
  let sessionFile: string;
  try {
    sessionFile = await saveSessionHistory(history);
  } catch (error) {
    return {
      success: false,
      error: `Failed to save session: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  // Build command for user to execute
  // Session file already includes the instruction to continue the conversation
  const command = `${agent} "$(cat '${sessionFile}')"`;

  return {
    success: true,
    sessionFile: formatPath(sessionFile),
    command,
  };
}

/**
 * Gets the display name for an agent.
 */
export function getAgentDisplayName(agent: TransferAgent): string {
  switch (agent) {
    case 'claude':
      return 'Claude Code';
    case 'codex':
      return 'Codex';
    default:
      return agent;
  }
}
