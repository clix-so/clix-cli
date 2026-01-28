/**
 * Login slash command definition for interactive mode.
 *
 * @module commands/login
 */
import type { ReactNode } from 'react';
import { LoginUI } from '@/ui/LoginUI';
import type { Command, CommandDoneCallback } from './types';

export const loginCommand: Command = {
  type: 'local-jsx',
  name: 'login',
  description: 'Log in to Clix via browser',
  isEnabled: true,
  isHidden: false,

  userFacingName() {
    return '/login';
  },

  async call(onDone: CommandDoneCallback): Promise<ReactNode> {
    return (
      <LoginUI
        onComplete={(credentials) => {
          const expiresAt = new Date(credentials.expiresAt).toLocaleString();
          onDone(`Login successful. Token expires at ${expiresAt}`);
        }}
        onError={(error) => {
          onDone(`Login failed: ${error.message}`);
        }}
      />
    );
  },
};
