/**
 * Agent command - lists or switches AI agents.
 *
 * @module commands/agent
 */

import type { Command, CommandContext } from './types';

/**
 * Agent command implementation.
 * Lists available agents or switches to a specified agent.
 */
export const agentCommand: Command = {
  type: 'local',
  name: 'agent',
  description: 'List or switch agents',
  isEnabled: true,
  isHidden: false,
  aliases: ['a'],

  userFacingName() {
    return '/agent';
  },

  async call(context: CommandContext) {
    const agentName = context.args[0];
    if (agentName) {
      return { success: true, message: `Switching to agent: ${agentName}` };
    }
    // No agent specified, should show selector
    return { success: true };
  },
};
