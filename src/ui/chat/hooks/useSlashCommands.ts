/**
 * Slash command parsing hook.
 */
import { useCallback } from 'react';
import type { SlashCommandResult } from './types';

/**
 * Pure function to parse slash commands.
 */
export function parseSlashCommand(input: string): SlashCommandResult {
  if (!input.startsWith('/')) {
    return { handled: false };
  }

  const parts = input.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  return { handled: true, command, args };
}

/**
 * Hook for slash command parsing.
 */
export function useSlashCommands() {
  const parse = useCallback((input: string): SlashCommandResult => {
    return parseSlashCommand(input);
  }, []);

  return { parseSlashCommand: parse };
}
