/**
 * Debug command - interactive debugging assistant.
 *
 * @module commands/debug
 */

import type { Command } from './types';

/**
 * Debug command implementation.
 * Opens an interactive debugging prompt for troubleshooting.
 */
export const debugCommand: Command = {
  type: 'local',
  name: 'debug',
  description: 'Interactive debugging assistant',
  isEnabled: true,
  isHidden: false,

  userFacingName() {
    return '/debug';
  },

  async call() {
    // The actual debug prompt is shown by the command handler
    return { success: true };
  },
};
