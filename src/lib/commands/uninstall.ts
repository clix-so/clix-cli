/**
 * Uninstall command - removes Clix CLI from the system.
 *
 * @module commands/uninstall
 */

import type { Command } from './types';

/**
 * Uninstall command implementation.
 * In interactive mode, directs users to use the CLI command for full options.
 */
export const uninstallCommand: Command = {
  type: 'local',
  name: 'uninstall',
  description: 'Uninstall Clix CLI from your system',
  isEnabled: true,
  isHidden: true,

  userFacingName() {
    return '/uninstall';
  },

  async call() {
    return {
      success: true,
      message:
        'To uninstall Clix CLI, run `clix uninstall` from the terminal.\n\n' +
        'Available options:\n' +
        '  --keep-config  Keep configuration files\n' +
        '  --keep-state   Keep state/session files\n' +
        '  --dry-run      Preview changes without removing\n' +
        '  --force        Skip confirmation prompt',
    };
  },
};
