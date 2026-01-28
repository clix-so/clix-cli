/**
 * Whoami slash command definition for interactive mode.
 *
 * @module commands/whoami
 */
import type { ReactNode } from 'react';
import { WhoamiUI } from '@/ui/WhoamiUI';
import type { Command, CommandDoneCallback } from './types';

export const whoamiCommand: Command = {
  type: 'local-jsx',
  name: 'whoami',
  description: 'Show current logged-in user',
  isEnabled: true,
  isHidden: false,

  userFacingName() {
    return '/whoami';
  },

  async call(onDone: CommandDoneCallback): Promise<ReactNode> {
    return (
      <WhoamiUI
        onComplete={(result) => {
          if (result.status === 'ok') {
            onDone(`Logged in as ${result.member.name} (${result.member.email})`);
          } else if (result.status === 'not_logged_in') {
            onDone('Not logged in. Run /login to authenticate.');
          } else {
            onDone(`Error: ${result.message}`);
          }
        }}
      />
    );
  },
};
