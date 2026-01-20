/**
 * Compact command - compresses conversation history.
 *
 * @module commands/compact
 */

import type { Command, CommandContext } from './types';

/**
 * Compact command implementation.
 * Compresses the conversation history to save context window space.
 */
export const compactCommand: Command = {
  type: 'local',
  name: 'compact',
  description: 'Compress conversation history',
  isEnabled: true,
  isHidden: false,
  aliases: ['c'],

  userFacingName() {
    return '/compact';
  },

  async call(context: CommandContext) {
    const force = context.args[0] === 'force';
    // The actual compaction is handled by the command handler
    return {
      success: true,
      message: force ? 'Force compacting history...' : 'Compacting history...',
    };
  },
};
