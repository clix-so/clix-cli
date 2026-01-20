/**
 * Resume command - resume a previous chat session.
 */

import type { Command, CommandContext } from './types';

export const resumeCommand: Command = {
  type: 'local',
  name: 'resume',
  description: 'Resume a previous chat session',
  isEnabled: true,
  isHidden: false,

  userFacingName() {
    return '/resume';
  },

  async call(_context: CommandContext) {
    // The actual resume UI is handled by the chat command handler.
    return { success: true };
  },
};
