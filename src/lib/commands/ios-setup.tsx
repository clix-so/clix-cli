/**
 * iOS Setup command - Configure iOS capabilities, NSE, and APNS key.
 *
 * @module commands/ios-setup
 */

import type { ReactNode } from 'react';
import { runIosSetupCommand } from '@/commands/ios-setup/index';
import type { Command, CommandDoneCallback } from './types';

/**
 * iOS Setup command for chat mode.
 * Delegates to the CLI implementation.
 */
export const iosSetupCommand: Command = {
  type: 'local-jsx',
  name: 'ios-setup',
  description: 'Configure iOS capabilities, NSE, and APNS key for push notifications',
  aliases: ['capabilities', 'ios-capabilities'],
  isEnabled: true,
  isHidden: false,

  userFacingName() {
    return '/ios-setup';
  },

  async call(onDone: CommandDoneCallback): Promise<ReactNode> {
    try {
      // Run the iOS setup command (skipPortal=true by default for chat mode)
      await runIosSetupCommand({
        skipPortal: true,
      });
      onDone?.('iOS setup complete');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'iOS setup failed';
      onDone?.(message);
    }
    return null;
  },
};
