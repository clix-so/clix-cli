/**
 * Install MCP command - installs the Clix MCP Server.
 *
 * @module commands/install-mcp
 */

import type { Command } from './types';

/**
 * Install MCP command implementation.
 * Opens the MCP server installation selector.
 */
export const installMcpCommand: Command = {
  type: 'local',
  name: 'install-mcp',
  description: 'Install Clix MCP Server',
  isEnabled: true,
  isHidden: false,
  aliases: ['mcp'],

  userFacingName() {
    return '/install-mcp';
  },

  async call() {
    // The actual MCP installer is shown by the command handler
    return { success: true };
  },
};
