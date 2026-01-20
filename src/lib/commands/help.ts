/**
 * Help command - displays available commands.
 *
 * @module commands/help
 */

import type { Command } from './types';

/**
 * Help command implementation.
 * Displays a list of available commands with descriptions.
 */
export const helpCommand: Command = {
  type: 'local',
  name: 'help',
  description: 'Show available commands',
  isEnabled: true,
  isHidden: false,
  aliases: ['?', 'h'],

  userFacingName() {
    return '/help';
  },

  async call() {
    // The actual help text generation is handled by the command handler
    // which can access the full command registry
    return { success: true };
  },
};
