/**
 * New command - starts a new chat session.
 *
 * `/clear` is supported as an alias for backward compatibility.
 */

import type { Command } from './types';

export const newCommand: Command = {
  type: 'local',
  name: 'new',
  description: 'Start a new session',
  isEnabled: true,
  isHidden: false,
  aliases: ['clear'],

  userFacingName() {
    return '/new';
  },

  async call() {
    // The actual clearing/reset is handled by the command handler.
    return { success: true };
  },
};
