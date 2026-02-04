import { LogoutUI } from '../ui/LogoutUI';
import { printFinalOutput } from '../ui/utils/finalOutput';
import { safeRender } from '../ui/utils/safeRender';

/**
 * Logout command - removes stored credentials
 *
 * Usage: clix logout
 */
export async function logoutCommand(): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = safeRender(
      <LogoutUI
        onComplete={(success) => {
          unmount();
          if (success) {
            printFinalOutput({
              type: 'success',
              title: 'Logged out',
              message: 'Credentials have been removed',
            });
          } else {
            printFinalOutput({
              type: 'error',
              title: 'Logout failed',
              message: 'Failed to remove credentials',
            });
            process.exitCode = 1;
          }
          resolve();
        }}
      />,
    );
  });
}
