/**
 * Logout slash command definition for interactive mode.
 *
 * @module commands/logout
 */
import type { ReactNode } from 'react';
import { LogoutUI } from '@/ui/LogoutUI';
import type { Command, CommandDoneCallback } from './types';

export const logoutCommand: Command = {
  type: 'local-jsx',
  name: 'logout',
  description: 'Log out from Clix',
  isEnabled: true,
  isHidden: false,

  userFacingName() {
    return '/logout';
  },

  async call(onDone: CommandDoneCallback): Promise<ReactNode> {
    return (
      <LogoutUI
        onComplete={(success) => {
          if (success) {
            onDone('Successfully logged out');
          } else {
            onDone('Logout failed');
          }
        }}
      />
    );
  },
};
