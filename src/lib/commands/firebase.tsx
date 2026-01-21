/**
 * Firebase command - check and configure Firebase credentials.
 *
 * @module commands/firebase
 */

import type { ReactNode } from 'react';
import { FirebaseWizard } from '@/ui/components/FirebaseWizard';
import type { Command, CommandDoneCallback } from './types';

/**
 * Firebase command implementation.
 * Opens the Firebase configuration wizard for detecting and validating credentials.
 */
export const firebaseCommand: Command = {
  type: 'local-jsx',
  name: 'firebase',
  description: 'Check and configure Firebase credentials',
  isEnabled: true,
  isHidden: false,

  userFacingName() {
    return '/firebase';
  },

  async call(onDone: CommandDoneCallback): Promise<ReactNode> {
    const projectPath = process.cwd();

    return (
      <FirebaseWizard
        projectPath={projectPath}
        onComplete={(result) => {
          if (result.skipped) {
            onDone('Firebase setup skipped');
          } else if (result.completed) {
            onDone('Firebase configuration complete');
          } else {
            onDone();
          }
        }}
        onCancel={() => {
          onDone('Firebase setup cancelled');
        }}
      />
    );
  },
};
