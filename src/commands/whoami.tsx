import { render } from 'ink';
import { printFinalOutput } from '../ui/utils/finalOutput';
import { WhoamiUI } from '../ui/WhoamiUI';

/**
 * Whoami command - displays current authenticated user
 *
 * Usage: clix whoami
 */
export async function whoamiCommand(): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <WhoamiUI
        onComplete={(result) => {
          unmount();
          if (result.status === 'ok') {
            printFinalOutput({
              type: 'success',
              title: result.member.name,
              message: result.member.email,
            });
          } else if (result.status === 'error') {
            printFinalOutput({
              type: 'error',
              title: 'Authentication failed',
              message: result.message,
            });
            process.exitCode = 1;
          } else {
            printFinalOutput({
              type: 'info',
              title: 'Not authenticated',
              message: 'Run clix login to authenticate',
            });
          }
          resolve();
        }}
      />,
      { incrementalRendering: true },
    );
  });
}
