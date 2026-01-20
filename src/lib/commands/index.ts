/**
 * Command system for slash commands.
 *
 * Provides a registry-based approach to managing commands with support for:
 * - Local commands (return string results)
 * - Local JSX commands (return React components)
 * - Prompt commands (send prompts to AI)
 *
 * @module commands
 *
 * @example
 * ```typescript
 * import { getCommands, getCommand, hasCommand } from './commands';
 *
 * // Get all enabled commands
 * const commands = getCommands();
 *
 * // Find a command by name or alias
 * const helpCmd = getCommand('help');
 * const helpCmd2 = getCommand('?'); // alias
 *
 * // Check if a command exists
 * if (hasCommand('new')) {
 *   // ...
 * }
 * ```
 */

export { agentCommand } from './agent';
// Individual commands (for direct access if needed)
export { compactCommand } from './compact';
export { debugCommand } from './debug';
export { exitCommand } from './exit';
export { helpCommand } from './help';
export { installMcpCommand } from './install-mcp';
export { newCommand } from './new';
// Registry
export {
  clearCommandCache,
  generateHelpText,
  getCommand,
  getCommands,
  hasCommand,
} from './registry';
export { resumeCommand } from './resume';
export { skillCommands } from './skills';
export { transferCommand } from './transfer';
// Types
export type {
  Command,
  CommandBase,
  CommandContext,
  CommandDoneCallback,
  CommandResult,
  LocalCommand,
  LocalJSXCommand,
  PromptCommand,
} from './types';
export { isLocalCommand, isLocalJSXCommand, isPromptCommand } from './types';
