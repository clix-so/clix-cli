/**
 * Update command - checks for and executes updates.
 *
 * @module commands/update
 */

import type { Command } from './types';

/**
 * Update command implementation.
 * Directs user to CLI for actual update execution.
 */
export const updateCommand: Command = {
  type: 'local',
  name: 'update',
  description: 'Check for and apply available updates',
  isEnabled: true,
  isHidden: false,
  aliases: ['upgrade'],

  userFacingName() {
    return '/update';
  },

  async call() {
    return {
      success: true,
      message:
        'To update Clix CLI, run `clix update` from the terminal.\n\n' +
        'Available options:\n' +
        '  --dry-run  Preview update without executing\n' +
        '  --force    Skip confirmation prompt',
    };
  },
};
