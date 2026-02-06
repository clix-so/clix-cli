/**
 * Command registry for managing and looking up commands.
 *
 * @module commands/registry
 */

import { getAvailableSkills } from '../skills';
import { agentCommand } from './agent';
import { compactCommand } from './compact';
import { debugCommand } from './debug';
import { exitCommand } from './exit';
import { helpCommand } from './help';
import { installMcpCommand } from './install-mcp';
import { loginCommand } from './login';
import { logoutCommand } from './logout';
import { newCommand } from './new';
import { resumeCommand } from './resume';
import { skillCommands } from './skills';
import { transferCommand } from './transfer';
import type { Command } from './types';
import { uninstallCommand } from './uninstall';
import { updateCommand } from './update';
import { whoamiCommand } from './whoami';

/**
 * Built-in commands.
 */
const BUILT_IN_COMMANDS: Command[] = [
  // System commands
  helpCommand,
  newCommand,
  compactCommand,
  agentCommand,
  debugCommand,
  transferCommand,
  resumeCommand,
  installMcpCommand,
  uninstallCommand,
  updateCommand,
  exitCommand,
  // Auth commands
  loginCommand,
  logoutCommand,
  whoamiCommand,
  // Skill commands
  ...skillCommands,
];

/**
 * Command cache for performance.
 */
let commandsCache: Command[] | null = null;

/**
 * Get all enabled commands.
 * Results are cached for performance.
 */
export function getCommands(): Command[] {
  if (commandsCache) {
    return commandsCache;
  }
  commandsCache = BUILT_IN_COMMANDS.filter((c) => c.isEnabled);
  return commandsCache;
}

/**
 * Find a command by name or alias.
 * @param name - Command name or alias (with or without slash)
 * @param commands - Command list to search (defaults to all commands)
 * @returns The matching command or undefined
 */
export function getCommand(name: string, commands?: Command[]): Command | undefined {
  const normalized = name.toLowerCase().replace(/^\//, '');
  const searchList = commands ?? getCommands();
  return searchList.find((c) => c.name === normalized || c.aliases?.includes(normalized));
}

/**
 * Check if a command exists.
 * @param name - Command name or alias
 * @param commands - Command list to search (defaults to all commands)
 * @returns True if the command exists
 */
export function hasCommand(name: string, commands?: Command[]): boolean {
  return getCommand(name, commands) !== undefined;
}

/**
 * Clear the command cache.
 * Call this if commands are added/removed dynamically.
 */
export function clearCommandCache(): void {
  commandsCache = null;
}

/**
 * Generate help text for all visible commands.
 * @returns Formatted help text
 */
export function generateHelpText(): string {
  const commands = getCommands().filter((c) => !c.isHidden);

  // Group commands by category - dynamically from available skills
  const skillNames = new Set(getAvailableSkills().map((s) => s.type));
  const skills = commands.filter((c) => skillNames.has(c.name));
  const system = commands.filter((c) => !skillNames.has(c.name));

  const formatCommand = (cmd: Command): string => {
    const aliasStr = cmd.aliases?.length ? ` (${cmd.aliases.map((a) => `/${a}`).join(', ')})` : '';
    return `/${cmd.name}${aliasStr} - ${cmd.description}`;
  };

  const lines = ['Available commands:', '', 'Skills:'];
  for (const cmd of skills) {
    lines.push(formatCommand(cmd));
  }

  lines.push('', 'System:');
  for (const cmd of system) {
    lines.push(formatCommand(cmd));
  }

  return lines.join('\n');
}
