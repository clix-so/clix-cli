import { LoginUI } from '../ui/LoginUI';
import { printFinalOutput } from '../ui/utils/finalOutput';
import { safeRender } from '../ui/utils/safeRender';

/**
 * Login command - authenticates user via Auth0 Device Flow
 *
 * Usage: clix login
 */
export async function loginCommand(): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = safeRender(
      <LoginUI
        onComplete={(credentials) => {
          unmount();
          printFinalOutput({
            type: 'success',
            title: 'Login successful',
            message: `Token expires at ${new Date(credentials.expiresAt).toLocaleString()}`,
          });
          resolve();
        }}
        onError={(error) => {
          unmount();
          printFinalOutput({
            type: 'error',
            title: 'Login failed',
            message: error.message,
          });
          process.exitCode = 1;
          resolve();
        }}
      />,
    );
  });
}
