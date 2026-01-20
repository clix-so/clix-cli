/**
 * Update command - checks for and displays update information.
 *
 * @module commands/update
 */

import type { Command } from './types';

/**
 * Update command implementation.
 * Checks for available updates and displays update instructions.
 */
export const updateCommand: Command = {
  type: 'local',
  name: 'update',
  description: 'Check for available updates',
  isEnabled: true,
  isHidden: false,
  aliases: ['upgrade'],

  userFacingName() {
    return '/update';
  },

  async call() {
    // The actual update check is handled by the command handler in useCommandHandler
    // This command signals the intent to check for updates
    return { success: true, message: 'Checking for updates...' };
  },
};
