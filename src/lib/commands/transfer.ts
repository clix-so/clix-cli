/**
 * Transfer command - transfers conversation to another agent CLI.
 *
 * @module commands/transfer
 */

import type { Command, CommandContext } from './types';

/**
 * Transfer command implementation.
 * Transfers the current conversation to another agent's CLI.
 */
export const transferCommand: Command = {
  type: 'local',
  name: 'transfer',
  description: 'Transfer to agent CLI',
  isEnabled: true,
  isHidden: false,
  aliases: ['t'],

  userFacingName() {
    return '/transfer';
  },

  async call(context: CommandContext) {
    const targetAgent = context.args[0];
    if (targetAgent) {
      return { success: true, message: `Transferring to: ${targetAgent}` };
    }
    // No agent specified, should show selector
    return { success: true };
  },
};
