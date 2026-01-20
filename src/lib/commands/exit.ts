/**
 * Exit command - exits the chat application.
 *
 * @module commands/exit
 */

import type { Command } from './types';

/**
 * Exit command implementation.
 * Exits the chat application.
 */
export const exitCommand: Command = {
  type: 'local',
  name: 'exit',
  description: 'Exit the chat',
  isEnabled: true,
  isHidden: false,
  aliases: ['quit', 'q'],

  userFacingName() {
    return '/exit';
  },

  async call() {
    // The actual exit is handled by the command handler
    return { success: true };
  },
};
