/**
 * Command system types.
 *
 * Commands are organized into three types:
 * - LocalCommand: Returns a string result (e.g., /new, /compact)
 * - LocalJSXCommand: Returns a React component (e.g., /help, /agent)
 * - PromptCommand: Sends a prompt to the AI (e.g., skills)
 *
 * @module commands/types
 */

import type { ReactNode } from 'react';

/**
 * Context passed to command handlers.
 */
export interface CommandContext {
  /** Arguments passed to the command */
  args: string[];
  /** Abort controller for cancellation */
  abortController?: AbortController;
  /** Additional options */
  options?: Record<string, unknown>;
}

/**
 * Result of command execution.
 */
export interface CommandResult {
  /** Success status */
  success: boolean;
  /** Result message */
  message?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Callback for JSX commands to signal completion.
 */
export type CommandDoneCallback = (result?: string) => void;

/**
 * Local command that returns a string result.
 * Used for simple commands like /new, /compact.
 */
export interface LocalCommand {
  type: 'local';
  /**
   * Execute the command.
   * @param context - Command context with args
   * @returns Command result or void
   */
  call(context: CommandContext): Promise<CommandResult | undefined>;
}

/**
 * Local command that renders a React component.
 * Used for interactive commands like /help, /agent, /debug.
 */
export interface LocalJSXCommand {
  type: 'local-jsx';
  /**
   * Execute the command and return a React component.
   * @param onDone - Callback to signal command completion
   * @param context - Command context with args
   * @returns React component to render
   */
  call(onDone: CommandDoneCallback, context: CommandContext): Promise<ReactNode>;
}

/**
 * Command that sends a prompt to the AI.
 * Used for skill-based commands.
 */
export interface PromptCommand {
  type: 'prompt';
  /** Message shown while executing */
  progressMessage: string;
  /** Named arguments for the command */
  argNames?: string[];
  /**
   * Generate the prompt to send to the AI.
   * @param args - Command arguments as string
   * @returns Messages to send
   */
  getPromptForCommand(args: string): Promise<Array<{ role: string; content: string }>>;
}

/**
 * Base command properties shared by all command types.
 */
export interface CommandBase {
  /** Unique command name (without slash) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether the command is currently enabled */
  isEnabled: boolean;
  /** Whether to hide from help listing */
  isHidden: boolean;
  /** Alternative names for the command */
  aliases?: string[];
  /**
   * Get the user-facing name for display.
   * @returns Display name with or without slash
   */
  userFacingName(): string;
}

/**
 * Union type for all command types.
 */
export type Command = CommandBase & (LocalCommand | LocalJSXCommand | PromptCommand);

/**
 * Type guard to check if a command is a LocalCommand.
 */
export function isLocalCommand(command: Command): command is CommandBase & LocalCommand {
  return command.type === 'local';
}

/**
 * Type guard to check if a command is a LocalJSXCommand.
 */
export function isLocalJSXCommand(command: Command): command is CommandBase & LocalJSXCommand {
  return command.type === 'local-jsx';
}

/**
 * Type guard to check if a command is a PromptCommand.
 */
export function isPromptCommand(command: Command): command is CommandBase & PromptCommand {
  return command.type === 'prompt';
}
